import { useState, useEffect, useRef } from "react";
import db from "../services/db";
import { 
  Settings as SettingsIcon, 
  Cloud, 
  CloudOff, 
  Moon, 
  Sun, 
  Download, 
  Upload, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  Trash2,
  UserPlus
} from "lucide-react";

export default function Settings({ players, games, activeTab }) {
  const [theme, setTheme] = useState(db.getTheme());
  const [bracketMethod, setBracketMethod] = useState(db.getBracketMethod());
  const [syncInfo, setSyncInfo] = useState({ status: "offline-only", error: "" });
  
  // Firebase configuration state
  const [configText, setConfigText] = useState("");
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const fileInputRef = useRef(null);

  // Authentication states
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState("login"); // "login" | "register"
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Subscribe to DB sync status changes
  useEffect(() => {
    const unsub = db.subscribeStatus((status) => {
      setSyncInfo(status);
    });
    return unsub;
  }, []);

  // Subscribe to Auth changes
  useEffect(() => {
    const unsub = db.subscribeAuth((user) => {
      setCurrentUser(user);
      setIsAuthChecking(false);
    });
    return unsub;
  }, []);

  // Load existing configuration on mount
  useEffect(() => {
    const config = db.getFirebaseConfig();
    if (config) {
      setConfigText(JSON.stringify(config, null, 2));
    }
  }, []);

  // Theme Toggler
  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    db.setTheme(newTheme);
  };

  const handleBracketMethodChange = (newMethod) => {
    setBracketMethod(newMethod);
    db.setBracketMethod(newMethod);
  };

  // Parsing helper to extract keys from pasted text (regex support for JS objects and standard JSON)
  const parseFirebaseConfig = (text) => {
    if (!text) return null;
    
    // Try standard JSON first
    try {
      const clean = text.trim();
      if (clean.startsWith("{") && clean.endsWith("}")) {
        return JSON.parse(clean);
      }
    } catch (e) {
      // Continue to regex parser if JSON parsing fails
    }

    const keys = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
    const result = {};

    keys.forEach(key => {
      // Regex matches: key name, colon or equals sign, and quoted values
      const regex = new RegExp(`['"]?${key}['"]?\\s*[:=]\\s*['"]([^'"]+)['"]`, "i");
      const match = text.match(regex);
      if (match && match[1]) {
        result[key] = match[1].trim();
      }
    });

    return Object.keys(result).length > 0 ? result : null;
  };

  // Save Firebase settings
  const handleSaveFirebase = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    const config = parseFirebaseConfig(configText);

    if (!config || !config.projectId || !config.apiKey) {
      alert("Could not parse a valid Firebase Configuration. Make sure you paste the config object containing at least 'apiKey' and 'projectId'.");
      setIsSaving(false);
      return;
    }

    const success = await db.initializeFirebase(config, true);
    setIsSaving(false);
    if (success) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  // Disconnect Firebase sync
  const handleDisconnectFirebase = async () => {
    if (window.confirm("Are you sure you want to stop syncing with Firebase? The app will return to offline-only LocalStorage mode.")) {
      await db.clearFirebaseConfig();
      setConfigText("");
      setCurrentUser(null);
    }
  };

  // Authentication Handlers
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    setAuthLoading(true);

    try {
      if (authMode === "register") {
        await db.registerWithEmail(authEmail, authPassword);
        setAuthSuccess("Account created successfully! Secured with email auth.");
      } else {
        await db.loginWithEmail(authEmail, authPassword);
        setAuthSuccess("Logged in successfully! Database connection secured.");
      }
      setAuthEmail("");
      setAuthPassword("");
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to sign out? Your session will revert to default anonymous login.")) {
      try {
        await db.logoutUser();
        setAuthSuccess("Logged out. Reverted to anonymous user.");
      } catch (err) {
        setAuthError(err.message);
      }
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError("");
    setAuthSuccess("");
    setAuthLoading(true);
    try {
      await db.loginWithGoogle();
      setAuthSuccess("Signed in with Google account successfully!");
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Clear local database cache
  const handleClearCache = () => {
    if (window.confirm("WARNING: This will permanently delete ALL players and match history stored on this device! Are you sure?")) {
      db.clearLocalData();
      alert("Local data cleared.");
    }
  };

  // Export JSON file
  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(
      JSON.stringify({ players, games }, null, 2)
    );
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `horseshoe_tournament_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import JSON file
  const handleImportJSON = (e) => {
    const fileReader = new FileReader();
    const file = e.target.files[0];
    if (!file) return;

    fileReader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (!parsed.players || !parsed.games) {
          alert("Invalid backup file format. Must contain 'players' and 'games' arrays.");
          return;
        }

        if (window.confirm(`Found ${parsed.players.length} players and ${parsed.games.length} games. Do you want to import them? This will merge with your current data.`)) {
          // Import players
          for (const player of parsed.players) {
            await db.addPlayer(player);
          }
          // Import games
          for (const game of parsed.games) {
            await db.addGame(game);
          }
          alert("Import complete!");
        }
      } catch (err) {
        alert("Failed to parse JSON file: " + err.message);
      }
    };
    fileReader.readAsText(file);
    // Reset file input so we can select same file again if needed
    e.target.value = "";
  };

  const handlePopulateTestData = async () => {
    const femaleFirstNames = ["Mary", "Patricia", "Jennifer", "Linda", "Elizabeth", "Barbara", "Susan", "Jessica", "Sarah", "Karen", "Nancy", "Lisa", "Betty", "Margaret", "Sandra", "Ashley", "Kimberly", "Emily", "Donna", "Michelle"];
    const maleFirstNames = ["James", "John", "Robert", "Michael", "William", "David", "Richard", "Joseph", "Thomas", "Charles", "Christopher", "Daniel", "Matthew", "Anthony", "Mark", "Donald", "Steven", "Paul", "Andrew", "Joshua"];
    const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin"];
    const ranks = ["A", "B", "C", "D"];
    const genders = ["Male", "Female"];

    if (window.confirm("Do you want to add 20 random test players to the database?")) {
      try {
        for (let i = 0; i < 20; i++) {
          const gender = genders[Math.floor(Math.random() * genders.length)];
          const firstNameList = gender === "Female" ? femaleFirstNames : maleFirstNames;
          const firstName = firstNameList[Math.floor(Math.random() * firstNameList.length)];
          const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
          const rank = ranks[Math.floor(Math.random() * ranks.length)];
          
          const testPlayer = {
            id: "p_test_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
            name: `${firstName} ${lastName}`,
            rank,
            gender
          };
          
          await db.addPlayer(testPlayer);
        }
        alert("20 test players added successfully!");
      } catch (err) {
        alert("Failed to add test players: " + err.message);
      }
    }
  };

  return (
    <div className="dashboard-grid">
      {/* Left Column: UI Preferences & Utility Operations */}
      <div>
        {/* Settings Panel */}
        <div className="glass-panel" style={{ marginBottom: "24px" }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <SettingsIcon size={20} /> Preferences
          </h2>
          
          <div className="form-group" style={{ marginBottom: "20px" }}>
            <label className="form-label">Theme Mode</label>
            <div style={{ display: "flex", gap: "10px" }}>
              <button 
                type="button" 
                className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                onClick={() => handleThemeChange('light')}
              >
                <Sun size={18} /> Light
              </button>
              <button 
                type="button" 
                className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                onClick={() => handleThemeChange('dark')}
              >
                <Moon size={18} /> Dark
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span>Playoffs Bracket Mode</span>
              <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: "normal" }}>
                Controls how playoffs are drawn for groups with uneven team counts.
              </span>
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "6px" }}>
              <label 
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "10px", 
                  padding: "8px 12px", 
                  background: "var(--bg-secondary)", 
                  border: "1px solid var(--border-color)", 
                  borderRadius: "var(--radius-sm)", 
                  cursor: "pointer" 
                }}
              >
                <input 
                  type="radio" 
                  name="bracketMethod" 
                  value="prelim" 
                  checked={bracketMethod === "prelim"}
                  onChange={() => handleBracketMethodChange("prelim")} 
                />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "13px", fontWeight: "600" }}>Play-In / Preliminary Matches (Default)</span>
                  <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Creates play-in round for bottom seeds, keeping main bracket clean.</span>
                </div>
              </label>
              <label 
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "10px", 
                  padding: "8px 12px", 
                  background: "var(--bg-secondary)", 
                  border: "1px solid var(--border-color)", 
                  borderRadius: "var(--radius-sm)", 
                  cursor: "pointer" 
                }}
              >
                <input 
                  type="radio" 
                  name="bracketMethod" 
                  value="padded" 
                  checked={bracketMethod === "padded"}
                  onChange={() => handleBracketMethodChange("padded")} 
                />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "13px", fontWeight: "600" }}>Padded Power-of-Two (With BYEs)</span>
                  <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Pads group sizes with empty BYE slots to draw a larger standard tree.</span>
                </div>
              </label>
              <label 
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "10px", 
                  padding: "8px 12px", 
                  background: "var(--bg-secondary)", 
                  border: "1px solid var(--border-color)", 
                  borderRadius: "var(--radius-sm)", 
                  cursor: "pointer" 
                }}
              >
                <input 
                  type="radio" 
                  name="bracketMethod" 
                  value="round_robin" 
                  checked={bracketMethod === "round_robin"}
                  onChange={() => handleBracketMethodChange("round_robin")} 
                />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "13px", fontWeight: "600" }}>Round Robin (All-Play-All)</span>
                  <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Every team plays every other team once. The top scorer at the end wins.</span>
                </div>
              </label>
              <label 
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "10px", 
                  padding: "8px 12px", 
                  background: "var(--bg-secondary)", 
                  border: "1px solid var(--border-color)", 
                  borderRadius: "var(--radius-sm)", 
                  cursor: "pointer" 
                }}
              >
                <input 
                  type="radio" 
                  name="bracketMethod" 
                  value="stepladder" 
                  checked={bracketMethod === "stepladder"}
                  onChange={() => handleBracketMethodChange("stepladder")} 
                />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "13px", fontWeight: "600" }}>Stepladder / Gauntlet</span>
                  <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Lowest seeds play first, winner moves up to play the next highest seed.</span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Database Management Tools */}
        <div className="glass-panel">
          <h2 style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <Trash2 size={20} /> Data Management
          </h2>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <button 
              type="button" 
              className="btn btn-secondary"
              style={{ justifyContent: "flex-start", gap: "12px" }}
              onClick={handleExportJSON}
            >
              <Download size={18} /> Backup Database (Export JSON)
            </button>

            <button 
              type="button" 
              className="btn btn-secondary"
              style={{ justifyContent: "flex-start", gap: "12px" }}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={18} /> Restore Database (Import JSON)
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: "none" }} 
              accept=".json" 
              onChange={handleImportJSON} 
            />

            <button 
              type="button" 
              className="btn btn-secondary"
              style={{ justifyContent: "flex-start", gap: "12px" }}
              onClick={handlePopulateTestData}
            >
              <UserPlus size={18} /> Populate Test Data (20 Players)
            </button>

            <div style={{ borderTop: "1px solid var(--border-color)", margin: "8px 0" }}></div>

            <button 
              type="button" 
              className="btn btn-danger"
              style={{ justifyContent: "flex-start", gap: "12px" }}
              onClick={handleClearCache}
            >
              <Trash2 size={18} /> Reset Database (Wipe All Data)
            </button>
          </div>
        </div>
      </div>

      {/* Right Column: Google Firebase cloud synchronization configuration */}
      <div className="glass-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
          <div>
            <h2 className="page-title" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "0" }}>
              <Cloud size={24} /> Google Cloud Sync
            </h2>
            <p className="page-subtitle" style={{ marginBottom: "0" }}>Sync tournament details to Google Cloud Firestore.</p>
          </div>

          {/* Sync Status Pill */}
          <div>
            {syncInfo.status === "synced" && (
              <span className="sync-badge online">
                <CheckCircle size={14} /> Synced to GCP
              </span>
            )}
            {syncInfo.status === "syncing" && (
              <span className="sync-badge offline">
                <RefreshCw size={14} className="spin-animation" /> Connecting...
              </span>
            )}
            {syncInfo.status === "offline-only" && (
              <span className="sync-badge offline">
                <CloudOff size={14} /> Offline Mode
              </span>
            )}
            {syncInfo.status === "error" && (
              <span className="sync-badge error" title={syncInfo.error}>
                <AlertTriangle size={14} /> Sync Error
              </span>
            )}
          </div>
        </div>

        {syncInfo.status === "error" && (
          <div style={{ 
            color: "var(--danger-color)", 
            backgroundColor: "var(--danger-glow)", 
            border: "1px solid rgba(239, 68, 68, 0.2)",
            padding: "12px", 
            borderRadius: "var(--radius-sm)", 
            fontSize: "14px",
            marginBottom: "20px"
          }}>
            <strong>Sync Error:</strong> {syncInfo.error}
          </div>
        )}

        <form onSubmit={handleSaveFirebase}>
          <div className="form-group" style={{ marginBottom: "16px" }}>
            <label className="form-label" style={{ fontWeight: "700" }}>Paste Firebase Config Object</label>
            <textarea
              className="form-input"
              rows={10}
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
              placeholder={`const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "horseshoe-tournament-1234.firebaseapp.com",
  projectId: "horseshoe-tournament-1234",
  storageBucket: "horseshoe-tournament-1234.appspot.com",
  messagingSenderId: "1029384756",
  appId: "1:1029384756:web:abcd1234efgh"
};`}
              style={{ 
                fontFamily: "monospace", 
                fontSize: "12px", 
                lineHeight: "1.6", 
                width: "100%", 
                resize: "vertical",
                padding: "12px",
                background: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-sm)"
              }}
              required
            />
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={isSaving}
              style={{ flex: 1 }}
            >
              {isSaving ? "Initializing..." : "Connect & Enable Cloud Sync"}
            </button>
            {db.getFirebaseConfig() && (
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={handleDisconnectFirebase}
              >
                Disconnect Cloud Sync
              </button>
            )}
          </div>

          {saveSuccess && (
            <div style={{ 
              color: "var(--success-color)", 
              backgroundColor: "var(--success-glow)", 
              border: "1px solid rgba(16, 185, 129, 0.2)",
              padding: "10px", 
              borderRadius: "var(--radius-sm)", 
              fontSize: "14px",
              marginTop: "16px",
              textAlign: "center",
              fontWeight: "500"
            }}>
              Sync Settings Saved! Connecting and migrating local data...
            </div>
          )}
        </form>

        {db.getFirebaseConfig() && (
          <div style={{ marginTop: "24px", paddingTop: "24px", borderTop: "1px solid var(--border-color)" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              🔒 Cloud Database Security & Auth
            </h3>
            {isAuthChecking ? (
              <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                Checking Auth Status...
              </div>
            ) : (
              currentUser && currentUser.email ? (
                /* Secure email sign-in status */
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ 
                    padding: "12px", 
                    background: "var(--success-glow)", 
                    border: "1px solid rgba(16, 185, 129, 0.3)", 
                    borderRadius: "var(--radius-sm)",
                    fontSize: "14px",
                    color: "var(--text-primary)"
                  }}>
                    Database writes are secured under user: <strong>{currentUser.email}</strong>
                  </div>
                </div>
              ) : (
                /* Anonymous or Signed Out status: show login/register/Google forms */
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{ 
                    padding: "12px", 
                    background: "var(--accent-glow)", 
                    border: "1px solid rgba(99, 102, 241, 0.3)", 
                    borderRadius: "var(--radius-sm)",
                    fontSize: "13px",
                    color: "var(--text-secondary)",
                    lineHeight: "1.5"
                  }}>
                    Database is currently running in <strong>Anonymous Access Mode</strong>. 
                    To secure write access and prevent unauthorized modifications, sign up for a secure account.
                  </div>

                  {/* Auth forms toggler */}
                  <div style={{ display: "flex", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px", gap: "8px" }}>
                    <button
                      type="button"
                      className="btn"
                      style={{
                        padding: "6px 12px",
                        fontSize: "13px",
                        background: authMode === "login" ? "var(--accent-color)" : "transparent",
                        color: authMode === "login" ? "#ffffff" : "var(--text-secondary)",
                        borderColor: "transparent"
                      }}
                      onClick={() => { setAuthMode("login"); setAuthError(""); setAuthSuccess(""); }}
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{
                        padding: "6px 12px",
                        fontSize: "13px",
                        background: authMode === "register" ? "var(--accent-color)" : "transparent",
                        color: authMode === "register" ? "#ffffff" : "var(--text-secondary)",
                        borderColor: "transparent"
                      }}
                      onClick={() => { setAuthMode("register"); setAuthError(""); setAuthSuccess(""); }}
                    >
                      Register Secure Account
                    </button>
                  </div>

                  <form onSubmit={handleAuthSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div className="form-group" style={{ marginBottom: "0px" }}>
                      <label className="form-label" style={{ fontSize: "12px", marginBottom: "4px" }}>Email Address</label>
                      <input 
                        type="email" 
                        className="form-input" 
                        value={authEmail} 
                        onChange={(e) => setAuthEmail(e.target.value)} 
                        placeholder="coordinator@example.com" 
                        required 
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: "0px" }}>
                      <label className="form-label" style={{ fontSize: "12px", marginBottom: "4px" }}>Password</label>
                      <input 
                        type="password" 
                        className="form-input" 
                        value={authPassword} 
                        onChange={(e) => setAuthPassword(e.target.value)} 
                        placeholder="••••••••" 
                        minLength={6}
                        required 
                      />
                    </div>

                    {authError && (
                      <div style={{ color: "var(--danger-color)", fontSize: "12px", fontWeight: "500", marginTop: "4px" }}>
                        ⚠️ {authError}
                      </div>
                    )}

                    {authSuccess && (
                      <div style={{ color: "var(--success-color)", fontSize: "12px", fontWeight: "500", marginTop: "4px" }}>
                        ✅ {authSuccess}
                      </div>
                    )}

                    <button 
                      type="submit" 
                      className="btn btn-primary"
                      disabled={authLoading}
                      style={{ marginTop: "8px" }}
                    >
                      {authLoading ? "Processing..." : (authMode === "login" ? "Sign In" : "Register Account")}
                    </button>
                  </form>
                </div>
              )
            )}
          </div>
        )}

        <div style={{ 
          marginTop: "24px", 
          padding: "16px", 
          background: "var(--bg-primary)", 
          borderRadius: "var(--radius-sm)", 
          border: "1px solid var(--border-color)",
          fontSize: "13px",
          color: "var(--text-secondary)",
          lineHeight: "1.5"
        }} parent-data-testid="get-config-desc">
          <strong>How to get this config:</strong>
          <ol style={{ paddingLeft: "18px", marginTop: "6px" }}>
            <li>Go to the <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" style={{ color: "var(--accent-color)", textDecoration: "underline" }}>Firebase Console</a>.</li>
            <li>Create a new project named <code>horseshoe-tournament</code>.</li>
            <li>Add a **Web App** project resource, and copy the config object generated there.</li>
            <li>In Firebase console, enable **Email/Password sign-in** under **Build &rarr; Authentication &rarr; Sign-in method**.</li>
            <li>In Firebase Database settings, click **Create Database** under Cloud Firestore, choose **Test Mode**, and select a server region close to you.</li>
            <li>Configure your **Firestore Security Rules** to restrict access to authenticated users:
              <pre style={{ 
                background: "var(--bg-secondary)", 
                padding: "8px", 
                borderRadius: "4px", 
                fontSize: "11px", 
                marginTop: "6px",
                fontFamily: "monospace",
                border: "1px solid var(--border-color)",
                overflowX: "auto"
              }}>{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}`}</pre>
            </li>
          </ol>
        </div>
      </div>

      {/* Embedded Spin Animation CSS */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .spin-animation {
          animation: spin 1.5s linear infinite;
        }
      `}</style>
    </div>
  );
}
