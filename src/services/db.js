import { initializeApp, getApps, deleteApp } from "firebase/app";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  collection, 
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  writeBatch
} from "firebase/firestore";

// Cache keys for localStorage fallback
const STORAGE_KEYS = {
  PLAYERS: "horseshoe_players",
  GAMES: "horseshoe_games",
  FIREBASE_CONFIG: "horseshoe_fb_config"
};

class DatabaseService {
  constructor() {
    this.firebaseApp = null;
    this.firestore = null;
    this.isFirebaseReady = false;
    this.syncStatus = "offline-only"; // "offline-only" | "syncing" | "synced" | "error"
    this.syncErrorMsg = "";
    
    // Status listeners, players callbacks and games callbacks
    this.statusListeners = new Set();
    this.playersCallbacks = new Set();
    this.gamesCallbacks = new Set();
    
    // Local memory caches
    this.playersCache = [];
    this.gamesCache = [];
    
    // Active subscription listeners
    this.firestorePlayersUnsub = null;
    this.firestoreGamesUnsub = null;
    this.isStorageListenerActive = false;

    // Try to auto-initialize if config exists in localStorage
    this.initFirebaseFromStorage();
    
    // Setup initial subscriptions (starts offline or online depending on config success)
    this.setupInternalSubscriptions();
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
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // Helper to read games list directly from localStorage
  getLocalGamesList() {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.GAMES) || "[]");
    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
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

    // 2. Set up new subscriptions based on connection state
    if (this.isFirebaseReady && this.firestore) {
      const qPlayers = query(collection(this.firestore, "players"), orderBy("createdAt", "desc"));
      this.firestorePlayersUnsub = onSnapshot(qPlayers, 
        (snapshot) => {
          const players = [];
          snapshot.forEach(doc => {
            players.push(doc.data());
          });
          this.playersCache = players;
          this.notifyPlayers();
          this.syncStatus = "synced";
          this.notifyStatus();
        },
        (error) => {
          console.error("Players subscription error:", error);
          this.syncStatus = "error";
          this.syncErrorMsg = "Sync failed: " + error.message;
          this.notifyStatus();
          // Fall back to local list on snapshot error
          this.playersCache = this.getLocalPlayersList();
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
          this.notifyGames();
        },
        (error) => {
          console.error("Games subscription error:", error);
          this.gamesCache = this.getLocalGamesList();
          this.notifyGames();
        }
      );
    } else {
      // Local storage fallback setup
      this.playersCache = this.getLocalPlayersList();
      this.gamesCache = this.getLocalGamesList();
      this.notifyPlayers();
      this.notifyGames();
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

  // --- Firebase Initialization ---
  initFirebaseFromStorage() {
    const savedConfig = localStorage.getItem(STORAGE_KEYS.FIREBASE_CONFIG);
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        // We set flags, but actual initialization of Firebase is async or done in constructor.
        // To prevent blocking, we attempt to initialize.
        this.syncStatus = "syncing";
        
        // Simple synchronous check, we'll try to load it
        const apps = getApps();
        if (apps.length > 0) {
          deleteApp(apps[0]).then(() => {
            this.initializeFirebase(config);
          });
        } else {
          this.initializeFirebase(config);
        }
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

  async initializeFirebase(config) {
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
      const apps = getApps();
      if (apps.length > 0) {
        await deleteApp(apps[0]);
      }

      this.firebaseApp = initializeApp(config);
      
      // Initialize Firestore with robust offline cache
      this.firestore = initializeFirestore(this.firebaseApp, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      });

      this.isFirebaseReady = true;
      this.syncStatus = "synced";
      this.syncErrorMsg = "";
      localStorage.setItem(STORAGE_KEYS.FIREBASE_CONFIG, JSON.stringify(config));
      
      this.notifyStatus();
      
      // Restart subscriptions using Firestore connection
      this.setupInternalSubscriptions();

      // Check if we have local data to migrate
      await this.migrateLocalDataToFirebase();
      return true;
    } catch (err) {
      console.error("Firebase initialization failed:", err);
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
    this.isFirebaseReady = false;
    this.syncStatus = "offline-only";
    this.syncErrorMsg = "";
    localStorage.removeItem(STORAGE_KEYS.FIREBASE_CONFIG);
    this.notifyStatus();
    
    // Switch subscriptions back to offline local storage
    this.setupInternalSubscriptions();
  }

  getFirebaseConfig() {
    const saved = localStorage.getItem(STORAGE_KEYS.FIREBASE_CONFIG);
    return saved ? JSON.parse(saved) : null;
  }

  // --- Data Migration (LocalStorage -> Firestore) ---
  async migrateLocalDataToFirebase() {
    if (!this.isFirebaseReady || !this.firestore) return;

    try {
      const localPlayers = JSON.parse(localStorage.getItem(STORAGE_KEYS.PLAYERS) || "[]");
      const localGames = JSON.parse(localStorage.getItem(STORAGE_KEYS.GAMES) || "[]");

      if (localPlayers.length === 0 && localGames.length === 0) return;

      // Migrate players in batch
      if (localPlayers.length > 0) {
        const batch = writeBatch(this.firestore);
        localPlayers.forEach(player => {
          const playerDoc = doc(this.firestore, "players", player.id);
          batch.set(playerDoc, player, { merge: true });
        });
        await batch.commit();
        // Clear local storage list since it is migrated
        localStorage.removeItem(STORAGE_KEYS.PLAYERS);
      }

      // Migrate games in batch
      if (localGames.length > 0) {
        const batch = writeBatch(this.firestore);
        localGames.forEach(game => {
          const gameDoc = doc(this.firestore, "games", game.id);
          batch.set(gameDoc, game, { merge: true });
        });
        await batch.commit();
        // Clear local storage list since it is migrated
        localStorage.removeItem(STORAGE_KEYS.GAMES);
      }

      console.log("Migration to Firebase completed successfully.");
    } catch (err) {
      console.error("Migration failed:", err);
      // Keep local storage data intact so we don't lose it
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

    if (this.isFirebaseReady && this.firestore) {
      const playerDoc = doc(this.firestore, "players", player.id);
      await setDoc(playerDoc, newPlayer);
    } else {
      const players = this.getLocalPlayersList();
      players.push(newPlayer);
      localStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(players));
      
      // Update memory cache and notify active subscribers immediately
      this.playersCache = players.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      this.notifyPlayers();
    }
  }

  async updatePlayer(player) {
    if (this.isFirebaseReady && this.firestore) {
      const playerDoc = doc(this.firestore, "players", player.id);
      await updateDoc(playerDoc, player);
    } else {
      const players = this.getLocalPlayersList();
      const idx = players.findIndex(p => p.id === player.id);
      if (idx !== -1) {
        players[idx] = { ...players[idx], ...player };
        localStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(players));
        
        // Update memory cache and notify active subscribers immediately
        this.playersCache = players.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        this.notifyPlayers();
      }
    }
  }

  async deletePlayer(playerId) {
    if (this.isFirebaseReady && this.firestore) {
      const playerDoc = doc(this.firestore, "players", playerId);
      await deleteDoc(playerDoc);
    } else {
      let players = this.getLocalPlayersList();
      players = players.filter(p => p.id !== playerId);
      localStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(players));
      
      // Also delete this player's games to maintain consistency
      let games = this.getLocalGamesList();
      games = games.filter(g => g.player1Id !== playerId && g.player2Id !== playerId);
      localStorage.setItem(STORAGE_KEYS.GAMES, JSON.stringify(games));
      
      // Update memory cache and notify active subscribers immediately
      this.playersCache = players.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      this.gamesCache = games.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      this.notifyPlayers();
      this.notifyGames();
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

    if (this.isFirebaseReady && this.firestore) {
      const gameDoc = doc(this.firestore, "games", game.id);
      await setDoc(gameDoc, newGame);
    } else {
      const games = this.getLocalGamesList();
      games.push(newGame);
      localStorage.setItem(STORAGE_KEYS.GAMES, JSON.stringify(games));
      
      // Update memory cache and notify active subscribers immediately
      this.gamesCache = games.sort((a, b) => new Date(b.date) - new Date(a.date));
      this.notifyGames();
    }
  }

  async deleteGame(gameId) {
    if (this.isFirebaseReady && this.firestore) {
      const gameDoc = doc(this.firestore, "games", gameId);
      await deleteDoc(gameDoc);
    } else {
      let games = this.getLocalGamesList();
      games = games.filter(g => g.id !== gameId);
      localStorage.setItem(STORAGE_KEYS.GAMES, JSON.stringify(games));
      
      // Update memory cache and notify active subscribers immediately
      this.gamesCache = games.sort((a, b) => new Date(b.date) - new Date(a.date));
      this.notifyGames();
    }
  }

  // Clear all local cache data completely
  clearLocalData() {
    localStorage.removeItem(STORAGE_KEYS.PLAYERS);
    localStorage.removeItem(STORAGE_KEYS.GAMES);
    this.playersCache = [];
    this.gamesCache = [];
    this.notifyPlayers();
    this.notifyGames();
  }
}

const db = new DatabaseService();
export default db;
