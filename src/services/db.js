import { initializeApp, getApps, deleteApp } from "firebase/app";
import { 
  getFirestore,
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  collection, 
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  serverTimestamp
} from "firebase/firestore";
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged, 
  signOut, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";

// Check for git-ignored local configuration file
const localConfigs = import.meta.glob("./firebase.config.local.js", { eager: true });
const localFirebaseConfig = localConfigs["./firebase.config.local.js"]?.default || null;
console.log("localConfigs keys:", Object.keys(localConfigs), "localFirebaseConfig:", localFirebaseConfig);

// Cache keys for localStorage fallback
const STORAGE_KEYS = {
  PLAYERS: "horseshoe_players",
  GAMES: "horseshoe_games",
  HISTORY: "horseshoe_tournament_history",
  ACTIVE_TOURNAMENT: "horseshoe_active_tournament",
  MATCH_SETUP: "horseshoe_match_setup_data",
  FIREBASE_CONFIG: "horseshoe_fb_config"
};

// Convert any array of arrays in a tournament object to a map of arrays for Firestore compatibility
function serializeTournament(tournament) {
  if (!tournament) return null;
  const copy = JSON.parse(JSON.stringify(tournament));
  
  // 1. Serialize starting rounds
  if (Array.isArray(copy.rounds)) {
    const roundsMap = {};
    copy.rounds.forEach((round, rIdx) => {
      roundsMap[`r${rIdx}`] = round;
    });
    copy.rounds = roundsMap;
  }
  
  // 2. Serialize playoff brackets
  if (copy.rankedBrackets) {
    Object.keys(copy.rankedBrackets).forEach(group => {
      const groupBracket = copy.rankedBrackets[group];
      if (groupBracket && Array.isArray(groupBracket.rounds)) {
        const roundsMap = {};
        groupBracket.rounds.forEach((round, rIdx) => {
          roundsMap[`r${rIdx}`] = round;
        });
        groupBracket.rounds = roundsMap;
      }
    });
  }
  
  return copy;
}

// Convert the serialized map-based rounds back to standard 2D arrays
function deserializeTournament(serialized) {
  if (!serialized) return null;
  const copy = JSON.parse(JSON.stringify(serialized));
  
  // 1. Deserialize starting rounds
  if (copy.rounds && !Array.isArray(copy.rounds)) {
    const roundsList = [];
    let rIdx = 0;
    while (copy.rounds[`r${rIdx}`] !== undefined) {
      roundsList.push(copy.rounds[`r${rIdx}`]);
      rIdx++;
    }
    copy.rounds = roundsList;
  }
  
  // 2. Deserialize playoff brackets
  if (copy.rankedBrackets) {
    Object.keys(copy.rankedBrackets).forEach(group => {
      const groupBracket = copy.rankedBrackets[group];
      if (groupBracket && groupBracket.rounds && !Array.isArray(groupBracket.rounds)) {
        const roundsList = [];
        let rIdx = 0;
        while (groupBracket.rounds[`r${rIdx}`] !== undefined) {
          roundsList.push(groupBracket.rounds[`r${rIdx}`]);
          rIdx++;
        }
        groupBracket.rounds = roundsList;
      }
    });
  }
  
  return copy;
}

class DatabaseService {
  constructor() {
    this.firebaseApp = null;
    this.firestore = null;
    this.auth = null;
    this.user = null;
    
    this.isFirebaseReady = false;
    this.syncStatus = "offline-only"; // "offline-only" | "syncing" | "synced" | "error"
    this.syncErrorMsg = "";
    
    // Status listeners, players callbacks and games callbacks
    this.statusListeners = new Set();
    this.playersCallbacks = new Set();
    this.gamesCallbacks = new Set();
    this.historyCallbacks = new Set();
    this.activeTournamentCallbacks = new Set();
    this.matchSetupCallbacks = new Set();
    this.authListeners = new Set();
    
    // Local memory caches
    this.playersCache = [];
    this.gamesCache = [];
    this.historyCache = [];
    this.activeTournamentCache = null;
    this.matchSetupCache = { selectedPlayerIds: [], generatedTeams: [], isGenerated: false };
    
    // Active subscription listeners
    this.firestorePlayersUnsub = null;
    this.firestoreGamesUnsub = null;
    this.firestoreHistoryUnsub = null;
    this.firestoreActiveTournamentUnsub = null;
    this.firestoreMatchSetupUnsub = null;
    this.isStorageListenerActive = false;

    // Try to auto-initialize if config exists in localStorage
    console.log("DatabaseService init - local config:", localFirebaseConfig);
    console.log("DatabaseService init - sync preference:", this.getSyncPreference());
    console.log("DatabaseService init - active firebase config:", this.getFirebaseConfig());
    this.initFirebaseFromStorage();
    
    // Setup initial subscriptions (starts offline or online depending on config success)
    this.setupInternalSubscriptions();
  }

  // Helper: returns true if the current user is anonymous (not signed in with Google)
  isAnonymousUser() {
    return !this.user || this.user.isAnonymous;
  }

  get isSyncing() {
    return this.isFirebaseReady && this.firestore && this.getSyncPreference() === "online";
  }

  // --- Theme helper ---
  getTheme() {
    return localStorage.getItem("horseshoe_theme") || "light";
  }

  setTheme(theme) {
    localStorage.setItem("horseshoe_theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }

  getBracketMethod() {
    return localStorage.getItem("horseshoe_bracket_method") || "prelim";
  }

  setBracketMethod(method) {
    localStorage.setItem("horseshoe_bracket_method", method);
  }

  // --- Status change subscription ---
  subscribeStatus(listener) {
    this.statusListeners.add(listener);
    // Initial call
    listener({ status: this.syncStatus, error: this.syncErrorMsg });
    return () => this.statusListeners.delete(listener);
  }

  notifyStatus() {
    this.statusListeners.forEach(listener => 
      listener({ status: this.syncStatus, error: this.syncErrorMsg })
    );
  }

  // Helper to read players list directly from localStorage
  getLocalPlayersList() {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.PLAYERS) || "[]");
    return list.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }

  // Helper to read games list directly from localStorage
  getLocalGamesList() {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.GAMES) || "[]");
    return list.sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });
  }

  // Helper to read tournament history list directly from localStorage
  getLocalHistoryList() {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || "[]");
    return list.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }

  // Helper to read active tournament directly from localStorage
  getLocalActiveTournament() {
    const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_TOURNAMENT);
    return saved ? JSON.parse(saved) : null;
  }

  // Setup listeners for the active database backend (Local vs Firestore)
  setupInternalSubscriptions() {
    // 1. Tear down existing Firestore subscriptions if any
    if (this.firestorePlayersUnsub) {
      this.firestorePlayersUnsub();
      this.firestorePlayersUnsub = null;
    }
    if (this.firestoreGamesUnsub) {
      this.firestoreGamesUnsub();
      this.firestoreGamesUnsub = null;
    }
    if (this.firestoreHistoryUnsub) {
      this.firestoreHistoryUnsub();
      this.firestoreHistoryUnsub = null;
    }
    if (this.firestoreActiveTournamentUnsub) {
      this.firestoreActiveTournamentUnsub();
      this.firestoreActiveTournamentUnsub = null;
    }
    if (this.firestoreMatchSetupUnsub) {
      this.firestoreMatchSetupUnsub();
      this.firestoreMatchSetupUnsub = null;
    }

    // 2. Set up new subscriptions based on connection state
    if (this.isSyncing) {
      const qPlayers = query(collection(this.firestore, "players"), orderBy("createdAt", "desc"));
      this.firestorePlayersUnsub = onSnapshot(qPlayers, 
        (snapshot) => {
          const players = [];
          snapshot.forEach(doc => {
            players.push(doc.data());
          });
          this.playersCache = players;
          if (!this.isAnonymousUser()) {
            localStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(players));
          }
          this.notifyPlayers();
          this.syncStatus = "synced";
          this.notifyStatus();
        },
        (error) => {
          console.error("Players subscription error:", error);
          this.syncStatus = "error";
          this.syncErrorMsg = "Sync failed: " + error.message;
          this.notifyStatus();
          // Fall back to local list on snapshot error (only for authenticated users)
          if (!this.isAnonymousUser()) {
            this.playersCache = this.getLocalPlayersList();
          }
          this.notifyPlayers();
        }
      );

      const qGames = query(collection(this.firestore, "games"), orderBy("date", "desc"));
      this.firestoreGamesUnsub = onSnapshot(qGames, 
        (snapshot) => {
          const games = [];
          snapshot.forEach(doc => {
            games.push(doc.data());
          });
          this.gamesCache = games;
          if (!this.isAnonymousUser()) {
            localStorage.setItem(STORAGE_KEYS.GAMES, JSON.stringify(games));
          }
          this.notifyGames();
        },
        (error) => {
          console.error("Games subscription error:", error);
          if (!this.isAnonymousUser()) {
            this.gamesCache = this.getLocalGamesList();
          }
          this.notifyGames();
        }
      );

      const qHistory = query(collection(this.firestore, "tournament_history"), orderBy("createdAt", "desc"));
      this.firestoreHistoryUnsub = onSnapshot(qHistory, 
        (snapshot) => {
          const history = [];
          snapshot.forEach(doc => {
            const entry = doc.data();
            if (entry.tournament) {
              entry.tournament = deserializeTournament(entry.tournament);
            }
            history.push(entry);
          });
          this.historyCache = history;
          if (!this.isAnonymousUser()) {
            localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
          }
          this.notifyHistory();
        },
        (error) => {
          console.error("History subscription error:", error);
          if (!this.isAnonymousUser()) {
            this.historyCache = this.getLocalHistoryList();
          }
          this.notifyHistory();
        }
      );

      const docRef = doc(this.firestore, "active_tournament", "current");
      this.firestoreActiveTournamentUnsub = onSnapshot(docRef, 
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            const deserialized = deserializeTournament(data);
            this.activeTournamentCache = deserialized;
            if (!this.isAnonymousUser()) {
              localStorage.setItem(STORAGE_KEYS.ACTIVE_TOURNAMENT, JSON.stringify(deserialized));
            }
          } else {
            this.activeTournamentCache = null;
            if (!this.isAnonymousUser()) {
              localStorage.removeItem(STORAGE_KEYS.ACTIVE_TOURNAMENT);
            }
          }
          this.notifyActiveTournament();
        },
        (error) => {
          console.error("Active tournament subscription error:", error);
          if (!this.isAnonymousUser()) {
            this.activeTournamentCache = this.getLocalActiveTournament();
          }
          this.notifyActiveTournament();
        }
      );
      const matchSetupDocRef = doc(this.firestore, "match_setup", "current");
      this.firestoreMatchSetupUnsub = onSnapshot(matchSetupDocRef, 
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            this.matchSetupCache = data;
            if (!this.isAnonymousUser()) {
              localStorage.setItem(STORAGE_KEYS.MATCH_SETUP, JSON.stringify(data));
            }
          } else {
            this.matchSetupCache = { selectedPlayerIds: [], generatedTeams: [], isGenerated: false };
            if (!this.isAnonymousUser()) {
              localStorage.removeItem(STORAGE_KEYS.MATCH_SETUP);
            }
          }
          this.notifyMatchSetup();
        },
        (error) => {
          console.error("Match setup subscription error:", error);
          if (!this.isAnonymousUser()) {
            this.matchSetupCache = this.getLocalMatchSetup();
          }
          this.notifyMatchSetup();
        }
      );
    } else {
      // Local storage fallback setup
      this.playersCache = this.getLocalPlayersList();
      this.gamesCache = this.getLocalGamesList();
      this.historyCache = this.getLocalHistoryList();
      this.activeTournamentCache = this.getLocalActiveTournament();
      this.matchSetupCache = this.getLocalMatchSetup();
      this.notifyPlayers();
      this.notifyGames();
      this.notifyHistory();
      this.notifyActiveTournament();
      this.notifyMatchSetup();
    }

    // Setup cross-tab sync listener for offline changes
    if (!this.isStorageListenerActive) {
      window.addEventListener("storage", (e) => {
        if (!this.isFirebaseReady) {
          if (e.key === STORAGE_KEYS.PLAYERS) {
            this.playersCache = this.getLocalPlayersList();
            this.notifyPlayers();
          }
          if (e.key === STORAGE_KEYS.GAMES) {
            this.gamesCache = this.getLocalGamesList();
            this.notifyGames();
          }
          if (e.key === STORAGE_KEYS.HISTORY) {
            this.historyCache = this.getLocalHistoryList();
            this.notifyHistory();
          }
          if (e.key === STORAGE_KEYS.ACTIVE_TOURNAMENT) {
            this.activeTournamentCache = this.getLocalActiveTournament();
            this.notifyActiveTournament();
          }
          if (e.key === STORAGE_KEYS.MATCH_SETUP) {
            this.matchSetupCache = this.getLocalMatchSetup();
            this.notifyMatchSetup();
          }
        }
      });
      this.isStorageListenerActive = true;
    }
  }

  notifyPlayers() {
    this.playersCallbacks.forEach(cb => cb([...this.playersCache]));
  }

  notifyGames() {
    this.gamesCallbacks.forEach(cb => cb([...this.gamesCache]));
  }

  getSyncPreference() {
    if (this.isAnonymousUser()) {
      return "online";
    }
    return localStorage.getItem("horseshoe_sync_preference") || "online";
  }

  async setSyncPreference(preference) {
    localStorage.setItem("horseshoe_sync_preference", preference);
    
    if (preference === "offline") {
      // Tear down Firestore subscriptions FIRST to avoid active error triggers on shutdown
      if (this.firestorePlayersUnsub) {
        this.firestorePlayersUnsub();
        this.firestorePlayersUnsub = null;
      }
      if (this.firestoreGamesUnsub) {
        this.firestoreGamesUnsub();
        this.firestoreGamesUnsub = null;
      }
      if (this.firestoreHistoryUnsub) {
        this.firestoreHistoryUnsub();
        this.firestoreHistoryUnsub = null;
      }
      if (this.firestoreActiveTournamentUnsub) {
        this.firestoreActiveTournamentUnsub();
        this.firestoreActiveTournamentUnsub = null;
      }
      if (this.firestoreMatchSetupUnsub) {
        this.firestoreMatchSetupUnsub();
        this.firestoreMatchSetupUnsub = null;
      }

      this.syncStatus = "offline-only";
      this.syncErrorMsg = "";
      this.notifyStatus();
      // DO NOT delete Firebase app or set user = null to avoid logging the user out.
      // Simply switch subscriptions back to offline local storage
      this.setupInternalSubscriptions();
    } else {
      // Re-initialize or re-subscribe using existing active Firebase connection
      if (this.isFirebaseReady && this.firestore) {
        this.syncStatus = "synced";
        this.notifyStatus();
        this.setupInternalSubscriptions();
      } else {
        const config = this.getFirebaseConfig();
        if (config) {
          await this.initializeFirebase(config);
        } else {
          this.syncStatus = "offline-only";
          this.notifyStatus();
          this.setupInternalSubscriptions();
        }
      }
    }
  }

  // --- Firebase Initialization ---
  initFirebaseFromStorage() {
    const config = this.getFirebaseConfig();
    if (config) {
      try {
        this.syncStatus = this.getSyncPreference() === "offline" ? "offline-only" : "syncing";
        this.initializeFirebase(config);
      } catch (err) {
        console.error("Failed to parse saved Firebase config:", err);
        this.syncStatus = "error";
        this.syncErrorMsg = "Failed to load saved config: " + err.message;
        this.isFirebaseReady = false;
      }
    } else {
      this.syncStatus = "offline-only";
    }
  }

  async initializeFirebase(config, saveToLocalFile = false) {
    // If already initialized with the same projectId, don't recreate it
    if (this.isFirebaseReady && this.firebaseApp && this.firebaseApp.options.projectId === config.projectId) {
      this.syncStatus = this.getSyncPreference() === "offline" ? "offline-only" : "synced";
      this.notifyStatus();
      this.setupInternalSubscriptions();
      return true;
    }

    if (!config || !config.projectId) {
      this.syncStatus = "offline-only";
      this.notifyStatus();
      this.setupInternalSubscriptions();
      return false;
    }

    try {
      this.syncStatus = "syncing";
      this.notifyStatus();

      // Clear existing app if any
      try {
        const apps = getApps();
        if (apps.length > 0) {
          await deleteApp(apps[0]);
        }
      } catch (deleteErr) {
        console.warn("Error deleting previous Firebase app:", deleteErr);
      }

      this.firebaseApp = initializeApp(config);
      
      // Initialize Firestore with robust offline cache
      try {
        this.firestore = initializeFirestore(this.firebaseApp, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
          })
        });
      } catch (firestoreErr) {
        console.warn("Firestore already initialized or cache failed, falling back to getFirestore:", firestoreErr);
        this.firestore = getFirestore(this.firebaseApp);
      }

      // Initialize Firebase Auth
      this.auth = getAuth(this.firebaseApp);
      
      // Listen to Auth State Changes
      onAuthStateChanged(this.auth, async (user) => {
        const wasOffline = this.getSyncPreference() === "offline";
        this.user = user;
        
        // If signed out (anonymous), reset preference to online
        if (user && user.isAnonymous) {
          if (localStorage.getItem("horseshoe_sync_preference") === "offline") {
            localStorage.setItem("horseshoe_sync_preference", "online");
          }
        }
        
        this.notifyAuth();

        if (!user) {
          try {
            await signInAnonymously(this.auth);
          } catch (authErr) {
            console.warn("Background anonymous sign-in failed or is disabled on Firebase Console:", authErr.message);
          }
        } else {
          // If we transitioned to online due to logout/anonymous auth, restart subscriptions
          if (wasOffline && this.getSyncPreference() === "online") {
            this.syncStatus = "synced";
            this.notifyStatus();
            this.setupInternalSubscriptions();
          }
        }
      });

      this.isFirebaseReady = true;
      this.syncStatus = this.getSyncPreference() === "offline" ? "offline-only" : "synced";
      this.syncErrorMsg = "";
      
      // Attempt to save to local config file if running locally and explicitly requested
      if (saveToLocalFile) {
        this.saveLocalConfig(config);
      }
      
      this.notifyStatus();
      
      // Restart subscriptions using Firestore connection
      this.setupInternalSubscriptions();

      // Check if we have local data to migrate
      await this.migrateLocalDataToFirebase();
      return true;
    } catch (err) {
      console.error("Firebase initialization failed (stringified):", err ? (err.message || String(err)) : "unknown error", err);
      this.isFirebaseReady = false;
      this.syncStatus = "error";
      this.syncErrorMsg = err.message;
      this.notifyStatus();
      
      this.setupInternalSubscriptions();
      return false;
    }
  }

  async clearFirebaseConfig() {
    const apps = getApps();
    if (apps.length > 0) {
      await deleteApp(apps[0]);
    }
    this.firebaseApp = null;
    this.firestore = null;
    this.auth = null;
    this.user = null;
    this.isFirebaseReady = false;
    this.syncStatus = "offline-only";
    this.syncErrorMsg = "";
    this.notifyStatus();
    this.notifyAuth();
    
    // Switch subscriptions back to offline local storage
    this.setupInternalSubscriptions();
  }

  async saveLocalConfig(config) {
    try {
      await fetch("/api/save-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config })
      });
    } catch {
      // Ignored: this is normal in production since the /api endpoint only exists in local development server
    }
  }

  // --- Auth Subscription and Operations ---
  subscribeAuth(onUpdate) {
    this.authListeners.add(onUpdate);
    // Send immediate initial value
    onUpdate(this.user);
    return () => {
      this.authListeners.delete(onUpdate);
    };
  }

  notifyAuth() {
    this.authListeners.forEach(listener => listener(this.user));
  }

  getCurrentUser() {
    return this.user;
  }

  async checkOrCreateAccessRequest(user) {
    if (!this.firestore) return;
    
    try {
      const userDocRef = doc(this.firestore, "user_access_requests", user.uid);
      const userSnap = await getDoc(userDocRef);
      
      if (!userSnap.exists()) {
        const lockDocRef = doc(this.firestore, "user_access_requests", "bootstrap_lock");
        const lockSnap = await getDoc(lockDocRef);
        
        const isFirstUser = !lockSnap.exists();
        
        if (isFirstUser) {
          const batch = writeBatch(this.firestore);
          batch.set(lockDocRef, { initializedAt: serverTimestamp() });
          batch.set(userDocRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || user.email.split("@")[0],
            status: "approved",
            isAdmin: true,
            requestedAt: serverTimestamp()
          });
          await batch.commit();
        } else {
          await setDoc(userDocRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || user.email.split("@")[0],
            status: "pending",
            isAdmin: false,
            requestedAt: serverTimestamp()
          });
          
          sessionStorage.setItem("just_requested_access", "true");
        }
      }
    } catch (err) {
      console.error("Error checking or creating user access request:", err);
    }
  }

  subscribeUserAccessRequest(uid, callback) {
    if (!this.isFirebaseReady || !this.firestore) {
      return () => {};
    }
    const docRef = doc(this.firestore, "user_access_requests", uid);
    return onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data());
      } else {
        callback(null);
      }
    }, (err) => {
      console.error("Error listening to user access request:", err);
      callback(null);
    });
  }

  subscribeAllAccessRequests(callback) {
    if (!this.isFirebaseReady || !this.firestore) {
      return () => {};
    }
    const q = query(
      collection(this.firestore, "user_access_requests"),
      orderBy("requestedAt", "desc")
    );
    return onSnapshot(q, (querySnap) => {
      const requests = [];
      querySnap.forEach((docSnap) => {
        if (docSnap.id !== "bootstrap_lock") {
          requests.push(docSnap.data());
        }
      });
      callback(requests);
    }, (err) => {
      console.error("Error listening to all access requests:", err);
    });
  }

  async updateAccessRequest(uid, updates) {
    if (!this.isFirebaseReady || !this.firestore) return;
    const docRef = doc(this.firestore, "user_access_requests", uid);
    await updateDoc(docRef, updates);
  }

  async deleteAccessRequest(uid) {
    if (!this.isFirebaseReady || !this.firestore) return;
    const docRef = doc(this.firestore, "user_access_requests", uid);
    await deleteDoc(docRef);
  }

  async registerWithEmail(email, password) {
    if (!this.isFirebaseReady || !this.auth) {
      throw new Error("Cloud sync is not connected. Connect Firebase first.");
    }
    const credential = await createUserWithEmailAndPassword(this.auth, email, password);
    await this.checkOrCreateAccessRequest(credential.user);
    this.user = credential.user;
    this.notifyAuth();
    return credential.user;
  }

  async loginWithEmail(email, password) {
    if (!this.isFirebaseReady || !this.auth) {
      throw new Error("Cloud sync is not connected. Connect Firebase first.");
    }
    const credential = await signInWithEmailAndPassword(this.auth, email, password);
    await this.checkOrCreateAccessRequest(credential.user);
    this.user = credential.user;
    this.notifyAuth();
    return credential.user;
  }

  async loginWithGoogle() {
    if (!this.isFirebaseReady || !this.auth) {
      throw new Error("Cloud sync is not connected. Connect Firebase first.");
    }
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(this.auth, provider);
    await this.checkOrCreateAccessRequest(result.user);
    this.user = result.user;
    this.notifyAuth();
    return result.user;
  }

  async logoutUser() {
    sessionStorage.removeItem("just_requested_access");
    if (this.auth) {
      await signOut(this.auth);
    }
  }

  getFirebaseConfig() {
    return localFirebaseConfig;
  }

  // --- Data Migration (LocalStorage -> Firestore) ---
  async migrateLocalDataToFirebase() {
    if (!this.isFirebaseReady || !this.firestore) return;

    try {
      const localPlayers = JSON.parse(localStorage.getItem(STORAGE_KEYS.PLAYERS) || "[]");
      const localGames = JSON.parse(localStorage.getItem(STORAGE_KEYS.GAMES) || "[]");
      const localHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || "[]");
      const localActive = localStorage.getItem(STORAGE_KEYS.ACTIVE_TOURNAMENT);

      if (localPlayers.length === 0 && localGames.length === 0 && localHistory.length === 0 && localActive === null) return;

      // Migrate players in batch
      if (localPlayers.length > 0) {
        const batch = writeBatch(this.firestore);
        localPlayers.forEach(player => {
          const playerDoc = doc(this.firestore, "players", player.id);
          batch.set(playerDoc, player, { merge: true });
        });
        await batch.commit();
      }

      // Migrate games in batch
      if (localGames.length > 0) {
        const batch = writeBatch(this.firestore);
        localGames.forEach(game => {
          const gameDoc = doc(this.firestore, "games", game.id);
          batch.set(gameDoc, game, { merge: true });
        });
        await batch.commit();
      }

      // Migrate tournament history in batch
      if (localHistory.length > 0) {
        const batch = writeBatch(this.firestore);
        localHistory.forEach(entry => {
          const historyDoc = doc(this.firestore, "tournament_history", entry.id);
          const serializedEntry = {
            ...entry,
            createdAt: entry.createdAt || new Date().toISOString()
          };
          if (serializedEntry.tournament) {
            serializedEntry.tournament = serializeTournament(serializedEntry.tournament);
          }
          batch.set(historyDoc, serializedEntry, { merge: true });
        });
        await batch.commit();
      }

      // Migrate active tournament
      if (localActive) {
        const docRef = doc(this.firestore, "active_tournament", "current");
        const parsed = JSON.parse(localActive);
        const serialized = serializeTournament(parsed);
        await setDoc(docRef, serialized);
      }

      console.log("Migration to Firebase completed successfully.");
    } catch (err) {
      console.error("Migration failed:", err);
    }
  }

  // --- Player CRUD Operations ---

  subscribePlayers(onUpdate) {
    this.playersCallbacks.add(onUpdate);
    // Notify immediately with current cached list
    onUpdate([...this.playersCache]);
    return () => {
      this.playersCallbacks.delete(onUpdate);
    };
  }

  async addPlayer(player) {
    const newPlayer = {
      ...player,
      createdAt: new Date().toISOString()
    };

    // Always update local storage and memory cache immediately for instant offline resilience
    const players = this.getLocalPlayersList();
    players.push(newPlayer);
    localStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(players));
    this.playersCache = players.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    this.notifyPlayers();

    if (this.isSyncing) {
      const playerDoc = doc(this.firestore, "players", player.id);
      await setDoc(playerDoc, newPlayer);
    }
  }

  async updatePlayer(player) {
    // Always update local storage and memory cache immediately for instant offline resilience
    const players = this.getLocalPlayersList();
    const idx = players.findIndex(p => p.id === player.id);
    if (idx !== -1) {
      players[idx] = { ...players[idx], ...player };
      localStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(players));
      this.playersCache = players.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      this.notifyPlayers();
    }

    if (this.isSyncing) {
      const playerDoc = doc(this.firestore, "players", player.id);
      await updateDoc(playerDoc, player);
    }
  }

  async deletePlayer(playerId) {
    // Always update local storage and memory cache immediately for instant offline resilience
    let players = this.getLocalPlayersList();
    players = players.filter(p => p.id !== playerId);
    localStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(players));
    this.playersCache = players.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Also delete this player's games to maintain consistency
    let games = this.getLocalGamesList();
    games = games.filter(g => g.player1Id !== playerId && g.player2Id !== playerId);
    localStorage.setItem(STORAGE_KEYS.GAMES, JSON.stringify(games));
    this.gamesCache = games.sort((a, b) => new Date(b.date) - new Date(a.date));

    this.notifyPlayers();
    this.notifyGames();

    if (this.isSyncing) {
      const playerDoc = doc(this.firestore, "players", playerId);
      await deleteDoc(playerDoc);
    }
  }

  // --- Game/Scores CRUD Operations ---

  subscribeGames(onUpdate) {
    this.gamesCallbacks.add(onUpdate);
    // Notify immediately with current cached list
    onUpdate([...this.gamesCache]);
    return () => {
      this.gamesCallbacks.delete(onUpdate);
    };
  }

  async addGame(game) {
    const newGame = {
      ...game,
      date: new Date().toISOString()
    };

    // Always update local storage and memory cache immediately for instant offline resilience
    const games = this.getLocalGamesList();
    games.push(newGame);
    localStorage.setItem(STORAGE_KEYS.GAMES, JSON.stringify(games));
    this.gamesCache = games.sort((a, b) => new Date(b.date) - new Date(a.date));
    this.notifyGames();

    if (this.isSyncing) {
      const gameDoc = doc(this.firestore, "games", game.id);
      await setDoc(gameDoc, newGame);
    }
  }

  async deleteGame(gameId) {
    // Always update local storage and memory cache immediately for instant offline resilience
    let games = this.getLocalGamesList();
    games = games.filter(g => g.id !== gameId);
    localStorage.setItem(STORAGE_KEYS.GAMES, JSON.stringify(games));
    this.gamesCache = games.sort((a, b) => new Date(b.date) - new Date(a.date));
    this.notifyGames();

    if (this.isSyncing) {
      const gameDoc = doc(this.firestore, "games", gameId);
      await deleteDoc(gameDoc);
    }
  }

  // --- Tournament History CRUD Operations ---

  subscribeHistory(onUpdate) {
    this.historyCallbacks.add(onUpdate);
    // Notify immediately with current cached list
    onUpdate([...this.historyCache]);
    return () => {
      this.historyCallbacks.delete(onUpdate);
    };
  }

  notifyHistory() {
    this.historyCallbacks.forEach(cb => cb([...this.historyCache]));
  }

  async addTournamentToHistory(entry) {
    const newEntry = {
      ...entry,
      createdAt: entry.createdAt || new Date().toISOString()
    };

    // Always update local storage and memory cache immediately for instant offline resilience
    const history = this.getLocalHistoryList();
    history.push(newEntry);
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
    this.historyCache = history.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    this.notifyHistory();

    if (this.isSyncing) {
      const historyDoc = doc(this.firestore, "tournament_history", newEntry.id);
      const serializedEntry = { ...newEntry };
      if (serializedEntry.tournament) {
        serializedEntry.tournament = serializeTournament(serializedEntry.tournament);
      }
      await setDoc(historyDoc, serializedEntry);
    }
  }

  async deleteTournamentFromHistory(id) {
    // Always update local storage and memory cache immediately for instant offline resilience
    let history = this.getLocalHistoryList();
    history = history.filter(item => item.id !== id);
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
    this.historyCache = history.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    this.notifyHistory();

    if (this.isSyncing) {
      const docRef = doc(this.firestore, "tournament_history", id);
      await deleteDoc(docRef);
    }
  }

  // --- Active Tournament CRUD Operations ---

  subscribeActiveTournament(onUpdate) {
    this.activeTournamentCallbacks.add(onUpdate);
    // Notify immediately with current cached object
    onUpdate(this.activeTournamentCache);
    return () => {
      this.activeTournamentCallbacks.delete(onUpdate);
    };
  }

  notifyActiveTournament() {
    this.activeTournamentCallbacks.forEach(cb => cb(this.activeTournamentCache));
  }

  async saveActiveTournament(tournament) {
    // Always update local storage and memory cache immediately for instant offline resilience
    if (tournament === null) {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_TOURNAMENT);
    } else {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_TOURNAMENT, JSON.stringify(tournament));
    }
    this.activeTournamentCache = tournament;
    this.notifyActiveTournament();

    if (this.isSyncing) {
      const docRef = doc(this.firestore, "active_tournament", "current");
      if (tournament === null) {
        await deleteDoc(docRef);
      } else {
        const serialized = serializeTournament(tournament);
        await setDoc(docRef, serialized);
      }
    }
  }

  // --- Match Setup CRUD Operations ---

  getLocalMatchSetup() {
    const saved = localStorage.getItem(STORAGE_KEYS.MATCH_SETUP);
    if (saved) return JSON.parse(saved);
    
    // Fallback to separate keys if they exist
    const selected = JSON.parse(localStorage.getItem("horseshoe_match_setup_selected") || "[]");
    const teams = JSON.parse(localStorage.getItem("horseshoe_match_setup_teams") || "[]");
    const generated = localStorage.getItem("horseshoe_match_setup_generated") === "true";
    
    return {
      selectedPlayerIds: selected,
      generatedTeams: teams,
      isGenerated: generated
    };
  }

  subscribeMatchSetup(onUpdate) {
    this.matchSetupCallbacks.add(onUpdate);
    // Notify immediately with current cached object
    onUpdate(this.matchSetupCache);
    return () => {
      this.matchSetupCallbacks.delete(onUpdate);
    };
  }

  notifyMatchSetup() {
    this.matchSetupCallbacks.forEach(cb => cb(this.matchSetupCache));
  }

  async saveMatchSetup(matchSetup) {
    // Always update local storage and memory cache immediately for instant offline resilience
    if (!this.isAnonymousUser()) {
      localStorage.setItem(STORAGE_KEYS.MATCH_SETUP, JSON.stringify(matchSetup));
    }
    this.matchSetupCache = matchSetup;
    this.notifyMatchSetup();

    if (this.isSyncing) {
      const docRef = doc(this.firestore, "match_setup", "current");
      await setDoc(docRef, matchSetup);
    }
  }

  // Clear all local cache data completely
  clearLocalData() {
    localStorage.removeItem(STORAGE_KEYS.PLAYERS);
    localStorage.removeItem(STORAGE_KEYS.GAMES);
    localStorage.removeItem(STORAGE_KEYS.HISTORY);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_TOURNAMENT);
    localStorage.removeItem(STORAGE_KEYS.MATCH_SETUP);
    localStorage.removeItem("horseshoe_match_setup_selected");
    localStorage.removeItem("horseshoe_match_setup_teams");
    localStorage.removeItem("horseshoe_match_setup_generated");
    this.playersCache = [];
    this.gamesCache = [];
    this.historyCache = [];
    this.activeTournamentCache = null;
    this.matchSetupCache = { selectedPlayerIds: [], generatedTeams: [], isGenerated: false };
    this.notifyPlayers();
    this.notifyGames();
    this.notifyHistory();
    this.notifyActiveTournament();
    this.notifyMatchSetup();
  }
}

const db = new DatabaseService();
export default db;
