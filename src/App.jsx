import { useState, useEffect, useRef } from "react";
import db from "./services/db";
import PlayerManager from "./components/PlayerManager";
import ScoreTracker from "./components/ScoreTracker";
import Settings from "./components/Settings";
import MatchSetup from "./components/MatchSetup";
import TournamentBrackets from "./components/TournamentBrackets";
import { 
  Users, 
  Trophy, 
  Settings as SettingsIcon,
  Cloud,
  CloudOff,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Shuffle,
  Award,
  History,
  LogOut,
  User,
  Sun,
  Moon
} from "lucide-react";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("players");
  const [players, setPlayers] = useState([]);
  const [games, setGames] = useState([]);
  const [history, setHistory] = useState([]);
  const [tournament, setTournament] = useState(null);
  const [matchSetup, setMatchSetup] = useState({ selectedPlayerIds: [], generatedTeams: [], isGenerated: false });
  const [syncInfo, setSyncInfo] = useState({ status: "offline-only", error: "" });
  const [syncPreference, setSyncPreference] = useState(db.getSyncPreference());
  const [isSyncingTransition, setIsSyncingTransition] = useState(false);
  const [user, setUser] = useState(db.user);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [theme, setTheme] = useState(db.getTheme());
  const initialRedirectDone = useRef(false);

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    db.setTheme(newTheme);
  };

  const handleToggleSyncPreference = async () => {
    const targetPref = syncPreference === "online" ? "offline" : "online";
    
    if (targetPref === "online" && !db.getFirebaseConfig()) {
      alert("No Firebase Configuration found. Please go to the Settings tab to paste your configuration and connect first.");
      return;
    }

    try {
      if (targetPref === "online") {
        setIsSyncingTransition(true);
      }
      setSyncPreference(targetPref);
      await db.setSyncPreference(targetPref);
    } catch (err) {
      console.error("Failed to toggle sync mode:", err);
      alert("Failed to toggle sync mode: " + err.message);
    } finally {
      setIsSyncingTransition(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await db.loginWithGoogle();
    } catch (err) {
      alert("Failed to sign in with Google: " + err.message);
    }
  };

  const handleSignOut = async () => {
    try {
      await db.logoutUser();
      setShowUserDropdown(false);
    } catch (err) {
      alert("Failed to sign out: " + err.message);
    }
  };

  // Close dropdown on window click outside
  useEffect(() => {
    if (!showUserDropdown) return;
    const handleClose = () => setShowUserDropdown(false);
    window.addEventListener("click", handleClose);
    return () => window.removeEventListener("click", handleClose);
  }, [showUserDropdown]);

  // Load theme and subscribe to database updates
  useEffect(() => {
    // Apply theme on load
    const currentTheme = db.getTheme();
    db.setTheme(currentTheme);

    // Subscribe to DB sync status changes
    const unsubStatus = db.subscribeStatus((status) => {
      setSyncInfo(status);
    });

    // Subscribe to players changes
    const unsubPlayers = db.subscribePlayers((updatedPlayers) => {
      setPlayers(updatedPlayers);
    });

    // Subscribe to games changes
    const unsubGames = db.subscribeGames((updatedGames) => {
      setGames(updatedGames);
    });

    // Subscribe to history changes
    const unsubHistory = db.subscribeHistory((updatedHistory) => {
      setHistory(updatedHistory);
    });

    // Subscribe to active tournament changes
    const unsubActiveTournament = db.subscribeActiveTournament((updatedActive) => {
      setTournament(updatedActive);
    });

    // Subscribe to match setup changes
    const unsubMatchSetup = db.subscribeMatchSetup((updatedSetup) => {
      if (updatedSetup) {
        setMatchSetup(updatedSetup);
      }
    });

    // Subscribe to auth changes
    const unsubAuth = db.subscribeAuth((updatedUser) => {
      setUser(updatedUser);
      if (!initialRedirectDone.current) {
        if (!updatedUser || updatedUser.isAnonymous) {
          setActiveTab("brackets");
        }
        initialRedirectDone.current = true;
      }
    });

    // Clean up subscriptions on unmount
    return () => {
      unsubStatus();
      unsubPlayers();
      unsubGames();
      unsubHistory();
      unsubActiveTournament();
      unsubMatchSetup();
      unsubAuth();
    };
  }, []);

  // Redirect anonymous users away from the Settings tab
  useEffect(() => {
    const isAnonymous = !user || user.isAnonymous;
    if (isAnonymous && activeTab === "settings") {
      setActiveTab("brackets");
    }
  }, [user, activeTab]);

  return (
    <div className="app-container">
      {/* App Header */}
      <header className="app-header">
        <div className="header-logo">
          <img 
            src="/logo-banner-light.png" 
            className="logo-light" 
            alt="Homestead Horseshoes" 
          />
          <img 
            src="/logo-banner-dark.png" 
            className="logo-dark" 
            alt="Homestead Horseshoes" 
          />
        </div>

        {/* Header Sync Status Pill & Toggle Switch */}
        <div className="header-controls">
          {/* Light/Dark Theme Toggle (Always Visible) */}
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "8px", 
            background: "var(--bg-primary)", 
            padding: "4px 10px", 
            borderRadius: "20px", 
            border: "1px solid var(--border-color)",
            boxShadow: "var(--shadow-sm)"
          }}>
            <Sun size={14} style={{ color: theme === "light" ? "var(--accent-color)" : "var(--text-secondary)" }} />
            <button
              type="button"
              onClick={() => handleThemeChange(theme === "dark" ? "light" : "dark")}
              style={{
                position: "relative",
                width: "36px",
                height: "20px",
                borderRadius: "10px",
                background: theme === "dark" ? "var(--accent-color)" : "var(--border-color)",
                border: "none",
                cursor: "pointer",
                padding: "2px",
                transition: "background 0.2s",
                display: "flex",
                alignItems: "center"
              }}
              aria-label="Toggle Light/Dark Theme"
            >
              <div style={{
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                background: "#ffffff",
                transform: theme === "dark" ? "translateX(16px)" : "translateX(0)",
                transition: "transform 0.2s"
              }} />
            </button>
            <Moon size={14} style={{ color: theme === "dark" ? "var(--accent-color)" : "var(--text-secondary)" }} />
          </div>

          {user && !user.isAnonymous && (
            <>
              {/* Toggle Switch */}
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "8px", 
                background: "var(--bg-primary)", 
                padding: "4px 10px", 
                borderRadius: "20px", 
                border: "1px solid var(--border-color)" 
              }}>
                <span style={{ 
                  fontSize: "11px", 
                  fontWeight: "700", 
                  textTransform: "uppercase", 
                  color: syncPreference === "offline" ? "var(--accent-color)" : "var(--text-secondary)" 
                }}>
                  Offline
                </span>
                <button
                  type="button"
                  onClick={handleToggleSyncPreference}
                  style={{
                    position: "relative",
                    width: "36px",
                    height: "20px",
                    borderRadius: "10px",
                    background: syncPreference === "online" ? "var(--accent-color)" : "var(--border-color)",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px",
                    transition: "background 0.2s",
                    display: "flex",
                    alignItems: "center"
                  }}
                  aria-label="Toggle Online/Offline Mode"
                >
                  <div style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    background: "#ffffff",
                    transform: syncPreference === "online" ? "translateX(16px)" : "translateX(0)",
                    transition: "transform 0.2s"
                  }} />
                </button>
                <span style={{ 
                  fontSize: "11px", 
                  fontWeight: "700", 
                  textTransform: "uppercase", 
                  color: syncPreference === "online" ? "var(--accent-color)" : "var(--text-secondary)" 
                }}>
                  Online
                </span>
              </div>

              {/* Sync Status Badge */}
              <div className="header-sync" style={{ margin: 0 }}>
                {syncInfo.status === "synced" && (
                  <span className="sync-badge online" title="Sync enabled: All changes saved to cloud">
                    <CheckCircle size={14} /> Synced
                  </span>
                )}
                {syncInfo.status === "syncing" && (
                  <span className="sync-badge offline" title="Connecting to Google Cloud Firestore...">
                    <RefreshCw size={14} className="spin-animation" /> Connecting...
                  </span>
                )}
                {syncInfo.status === "offline-only" && (
                  <span className="sync-badge offline" title="Running in Local-First Offline mode.">
                    <CloudOff size={14} /> Local-Only
                  </span>
                )}
                {syncInfo.status === "error" && (
                  <span className="sync-badge error" title={`Sync Error: ${syncInfo.error}. Click Settings to debug.`}>
                    <AlertTriangle size={14} /> Sync Error
                  </span>
                )}
              </div>

              {/* Settings Gear Button */}
              <button
                type="button"
                onClick={() => setActiveTab(activeTab === "settings" ? "players" : "settings")}
                className={`header-settings-btn ${activeTab === "settings" ? "active" : ""}`}
                title="Settings"
              >
                <SettingsIcon size={16} />
              </button>
            </>
          )}

          {/* User Profile Avatar / Sign In Button */}
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            {user && !user.isAnonymous ? (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowUserDropdown(!showUserDropdown);
                  }}
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    border: "2px solid var(--accent-color)",
                    background: "var(--bg-secondary)",
                    cursor: "pointer",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                    transition: "border-color 0.2s"
                  }}
                  title={user.displayName || user.email}
                >
                  {user.photoURL ? (
                    <img 
                      src={user.photoURL} 
                      alt={user.displayName || "User avatar"} 
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <User size={16} style={{ color: "var(--text-primary)" }} />
                  )}
                </button>

                {showUserDropdown && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "40px",
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "var(--radius-sm)",
                      boxShadow: "0 10px 25px rgba(0, 0, 0, 0.3)",
                      padding: "16px",
                      minWidth: "220px",
                      zIndex: 1000,
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px"
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-primary)" }}>
                        {user.displayName || "Google Account"}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--text-secondary)", wordBreak: "break-all" }}>
                        {user.email}
                      </span>
                    </div>

                    <div style={{ height: "1px", background: "var(--border-color)", width: "100%" }} />

                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="btn btn-secondary"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        padding: "8px",
                        fontSize: "13px",
                        width: "100%"
                      }}
                    >
                      <LogOut size={14} /> Sign Out
                    </button>
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                  padding: "6px 12px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" style={{ display: "block" }}>
                  <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.198 2.698 1.24 6.65l4.026 3.115z" />
                  <path fill="#4285F4" d="M16.04 15.345c-1.077.733-2.455 1.164-4.04 1.164-3.555 0-6.56-2.455-7.636-5.745L2.338 13.88c1.958 3.951 6.03 6.65 10.76 6.65 2.945 0 5.626-1.018 7.643-2.773l-4.7-3.412z" />
                  <path fill="#FBBC05" d="M4.364 10.764a7.042 7.042 0 0 1 0-2.528L2.338 5.12a11.97 11.97 0 0 0 0 8.76l2.026-3.116z" />
                  <path fill="#34A853" d="M22.91 12c0-.8-.073-1.573-.208-2.318H12v4.545h6.127c-.264 1.418-1.064 2.618-2.264 3.42l4.7 3.412C20.627 18.982 22.91 15.773 22.91 12z" />
                </svg>
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="nav-tabs">
        <button
          type="button"
          className={`nav-tab-btn ${activeTab === "players" ? "active" : ""}`}
          onClick={() => setActiveTab("players")}
        >
          <Users size={18} />
          Players
        </button>
        <button
          type="button"
          className={`nav-tab-btn ${activeTab === "matchmaker" ? "active" : ""}`}
          onClick={() => setActiveTab("matchmaker")}
        >
          <Shuffle size={18} />
          Teams
        </button>
        <button
          type="button"
          className={`nav-tab-btn ${activeTab === "brackets" ? "active" : ""}`}
          onClick={() => setActiveTab("brackets")}
        >
          <Award size={18} />
          Brackets
        </button>
        <button
          type="button"
          className={`nav-tab-btn ${activeTab === "scores" ? "active" : ""}`}
          onClick={() => setActiveTab("scores")}
        >
          <History size={18} />
          Tournament History
        </button>

      </nav>

      {/* Tab Content Panels */}
      <main className="tab-content" style={{ paddingBottom: "40px" }}>
        {activeTab === "players" && (
          <PlayerManager players={players} games={games} isAnonymous={!user || user.isAnonymous} />
        )}
        {activeTab === "matchmaker" && (
          <MatchSetup players={players} matchSetup={matchSetup} isAnonymous={!user || user.isAnonymous} onBuildMatch={() => setActiveTab("brackets")} />
        )}
        {activeTab === "brackets" && (
          <TournamentBrackets players={players} games={games} tournament={tournament} isAnonymous={!user || user.isAnonymous} />
        )}
        {activeTab === "scores" && (
          <ScoreTracker players={players} games={games} history={history} />
        )}
        {activeTab === "settings" && user && !user.isAnonymous && (
          <Settings players={players} games={games} activeTab={activeTab} theme={theme} onThemeChange={handleThemeChange} />
        )}
      </main>

      {/* Embedded Spin Animation CSS if not loaded in styles */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .spin-animation {
          animation: spin 1.5s linear infinite;
        }
      `}</style>

      {isSyncingTransition && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(10, 10, 12, 0.75)",
          backdropFilter: "blur(8px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          color: "#ffffff"
        }}>
          <div style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            padding: "32px",
            borderRadius: "var(--radius-md)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)",
            maxWidth: "320px",
            width: "90%",
            textAlign: "center"
          }}>
            <RefreshCw size={48} className="spin-animation" style={{ color: "var(--accent-color)", marginBottom: "16px" }} />
            <h2 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "8px", color: "var(--text-primary)" }}>Syncing Cloud Database</h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
              Uploading offline changes and synchronizing tournament records with Google Cloud...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
