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
  Moon,
  Shield
} from "lucide-react";
import AuthModal from "./components/AuthModal";
import UserApprovals from "./components/UserApprovals";
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
  const [userProfile, setUserProfile] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [theme, setTheme] = useState(db.getTheme());
  const initialRedirectDone = useRef(false);
  const unsubProfileRef = useRef(null);

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
      
      // Clean up previous user profile listener
      if (unsubProfileRef.current) {
        unsubProfileRef.current();
        unsubProfileRef.current = null;
      }
      
      if (updatedUser && !updatedUser.isAnonymous) {
        setIsAuthLoading(true);
        unsubProfileRef.current = db.subscribeUserAccessRequest(updatedUser.uid, (profile) => {
          setUserProfile(profile);
          setIsAuthLoading(false);
        });
      } else {
        setUserProfile(null);
        setIsAuthLoading(false);
      }

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
      if (unsubProfileRef.current) {
        unsubProfileRef.current();
      }
    };
  }, []);

  // Redirect anonymous or non-admin users away from protected tabs
  useEffect(() => {
    const isUserApproved = user && !user.isAnonymous && userProfile && userProfile.status === "approved";
    const isAnonymous = !isUserApproved;
    const isAdmin = isUserApproved && userProfile.isAdmin;

    if (isAnonymous && activeTab === "settings") {
      setActiveTab("brackets");
    }
    if ((isAnonymous || !isAdmin) && activeTab === "approvals") {
      setActiveTab("brackets");
    }
  }, [user, userProfile, activeTab]);

  const isUserApproved = user && !user.isAnonymous && userProfile && userProfile.status === "approved";
  const isAnonymous = !isUserApproved;
  const isAdmin = isUserApproved && userProfile.isAdmin;
  const isPendingOrRejected = user && !user.isAnonymous && (!userProfile || userProfile.status !== "approved");
  const showBlockedScreen = isPendingOrRejected && sessionStorage.getItem("just_requested_access") !== "true";

  if (user && !user.isAnonymous && isAuthLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: "16px", background: "var(--bg-primary)", color: "var(--text-primary)" }}>
        <RefreshCw size={40} className="spin-animation" style={{ color: "var(--accent-color)" }} />
        <span style={{ fontSize: "14px", fontWeight: "600" }}>Verifying authorization...</span>
      </div>
    );
  }

  if (showBlockedScreen) {
    const isRejected = userProfile && userProfile.status === "rejected";
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        padding: "24px",
        textAlign: "center"
      }}>
        <div className="glass-panel" style={{ maxWidth: "480px", width: "100%", padding: "40px", display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
          {isRejected ? (
            <AlertTriangle size={64} style={{ color: "var(--danger-color)" }} />
          ) : (
            <Shield size={64} style={{ color: "var(--gold-color)" }} />
          )}
          <h2 style={{ fontSize: "24px", fontWeight: "800", margin: 0 }}>
            {isRejected ? "Access Request Rejected" : "Access Pending Approval"}
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", lineHeight: "1.6", margin: 0 }}>
            {isRejected
              ? "Your request for coordinator access has been rejected by an administrator. Contact the administrator if you believe this is a mistake."
              : "Your request for coordinator access has been received and is currently pending approval by an administrator. Please wait for confirmation."}
          </p>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%", background: "var(--bg-primary)", padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
            <span style={{ fontSize: "11px", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: "700" }}>Logged In As</span>
            <span style={{ fontSize: "14px", fontWeight: "600" }}>{user.email}</span>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: "100%", marginTop: "12px" }}
            onClick={handleSignOut}
          >
            Go back to public view
          </button>
        </div>
      </div>
    );
  }

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

          {isUserApproved && (
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
              {isUserApproved && (
                <button
                  type="button"
                  onClick={() => setActiveTab(activeTab === "settings" ? "players" : "settings")}
                  className={`header-settings-btn ${activeTab === "settings" ? "active" : ""}`}
                  title="Settings"
                >
                  <SettingsIcon size={16} />
                </button>
              )}
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

                    {userProfile && (
                      <div style={{
                        fontSize: "11px",
                        fontWeight: "700",
                        padding: "3px 8px",
                        borderRadius: "12px",
                        textTransform: "uppercase",
                        textAlign: "center",
                        background: userProfile.status === "approved" 
                          ? (userProfile.isAdmin ? "rgba(99, 102, 241, 0.12)" : "rgba(16, 185, 129, 0.12)") 
                          : userProfile.status === "rejected" 
                            ? "rgba(239, 68, 68, 0.12)" 
                            : "rgba(234, 179, 8, 0.12)",
                        color: userProfile.status === "approved" 
                          ? (userProfile.isAdmin ? "var(--accent-color)" : "var(--success-color)") 
                          : userProfile.status === "rejected" 
                            ? "var(--danger-color)" 
                            : "var(--gold-color)",
                        border: userProfile.status === "approved" 
                          ? (userProfile.isAdmin ? "1px solid rgba(99, 102, 241, 0.3)" : "1px solid rgba(16, 185, 129, 0.3)") 
                          : userProfile.status === "rejected" 
                            ? "1px solid rgba(239, 68, 68, 0.3)" 
                            : "1px solid rgba(234, 179, 8, 0.3)",
                        alignSelf: "flex-start"
                      }}>
                        {userProfile.status === "approved" 
                          ? (userProfile.isAdmin ? "Admin" : "Coordinator") 
                          : userProfile.status === "rejected" 
                            ? "Access Rejected" 
                            : "Pending Approval"}
                      </div>
                    )}

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
                onClick={() => setShowAuthModal(true)}
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

        {isAdmin && (
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === "approvals" ? "active" : ""}`}
            onClick={() => setActiveTab("approvals")}
          >
            <Shield size={18} />
            Approvals
          </button>
        )}
      </nav>

      {/* Tab Content Panels */}
      <main className="tab-content" style={{ paddingBottom: "40px" }}>
        {activeTab === "players" && (
          <PlayerManager players={players} games={games} isAnonymous={isAnonymous} />
        )}
        {activeTab === "matchmaker" && (
          <MatchSetup players={players} matchSetup={matchSetup} isAnonymous={isAnonymous} onBuildMatch={() => setActiveTab("brackets")} />
        )}
        {activeTab === "brackets" && (
          <TournamentBrackets players={players} games={games} tournament={tournament} isAnonymous={isAnonymous} />
        )}
        {activeTab === "scores" && (
          <ScoreTracker players={players} games={games} history={history} />
        )}
        {activeTab === "approvals" && isAdmin && (
          <UserApprovals user={user} />
        )}
        {activeTab === "settings" && isUserApproved && (
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
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}

export default App;
