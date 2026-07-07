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
  const [apiKey, setApiKey] = useState("");
  const [authDomain, setAuthDomain] = useState("");
  const [projectId, setProjectId] = useState("");
  const [storageBucket, setStorageBucket] = useState("");
  const [messagingSenderId, setMessagingSenderId] = useState("");
  const [appId, setAppId] = useState("");
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const fileInputRef = useRef(null);

  // Subscribe to DB sync status changes
  useEffect(() => {
    const unsub = db.subscribeStatus((status) => {
      setSyncInfo(status);
    });
    return unsub;
  }, []);

  // Load existing configuration on mount
  useEffect(() => {
    const config = db.getFirebaseConfig();
    if (config) {
      setApiKey(config.apiKey || "");
      setAuthDomain(config.authDomain || "");
      setProjectId(config.projectId || "");
      setStorageBucket(config.storageBucket || "");
      setMessagingSenderId(config.messagingSenderId || "");
      setAppId(config.appId || "");
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

  // Save Firebase settings
  const handleSaveFirebase = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    const config = {
      apiKey: apiKey.trim(),
      authDomain: authDomain.trim(),
      projectId: projectId.trim(),
      storageBucket: storageBucket.trim(),
      messagingSenderId: messagingSenderId.trim(),
      appId: appId.trim()
    };

    if (!config.projectId) {
      alert("Project ID is required to enable Firebase.");
      setIsSaving(false);
      return;
    }

    const success = await db.initializeFirebase(config);
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
      setApiKey("");
      setAuthDomain("");
      setProjectId("");
      setStorageBucket("");
      setMessagingSenderId("");
      setAppId("");
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
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Firebase API Key</label>
              <input 
                type="text" 
                className="form-input" 
                value={apiKey} 
                onChange={(e) => setApiKey(e.target.value)} 
                placeholder="AIzaSy..." 
                required 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Project ID</label>
              <input 
                type="text" 
                className="form-input" 
                value={projectId} 
                onChange={(e) => setProjectId(e.target.value)} 
                placeholder="horseshoe-tournament-1234" 
                required 
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Auth Domain</label>
              <input 
                type="text" 
                className="form-input" 
                value={authDomain} 
                onChange={(e) => setAuthDomain(e.target.value)} 
                placeholder="horseshoe-tournament-1234.firebaseapp.com" 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Storage Bucket</label>
              <input 
                type="text" 
                className="form-input" 
                value={storageBucket} 
                onChange={(e) => setStorageBucket(e.target.value)} 
                placeholder="horseshoe-tournament-1234.appspot.com" 
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Messaging Sender ID</label>
              <input 
                type="text" 
                className="form-input" 
                value={messagingSenderId} 
                onChange={(e) => setMessagingSenderId(e.target.value)} 
                placeholder="1029384756" 
              />
            </div>
            <div className="form-group">
              <label className="form-label">App ID</label>
              <input 
                type="text" 
                className="form-input" 
                value={appId} 
                onChange={(e) => setAppId(e.target.value)} 
                placeholder="1:1029384756:web:abcd1234efgh" 
                required
              />
            </div>
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
            <li>In Firebase Database settings, click **Create Database** under Cloud Firestore, choose **Test Mode**, and select a server region close to you.</li>
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
