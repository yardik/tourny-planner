import { useState, useEffect } from "react";
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
  History
} from "lucide-react";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("players");
  const [players, setPlayers] = useState([]);
  const [games, setGames] = useState([]);
  const [syncInfo, setSyncInfo] = useState({ status: "offline-only", error: "" });

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

    // Clean up subscriptions on unmount
    return () => {
      unsubStatus();
      unsubPlayers();
      unsubGames();
    };
  }, []);

  return (
    <div className="app-container">
      {/* App Header */}
      <header className="app-header">
        <div className="header-logo">
          <Trophy size={28} />
          <h1>Horseshoe Tournament</h1>
        </div>

        {/* Header Sync Status Pill */}
        <div className="header-sync">
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
            <span className="sync-badge offline" title="Running in Local-First Offline mode. Settings -> Connect to Cloud.">
              <CloudOff size={14} /> Local-Only
            </span>
          )}
          {syncInfo.status === "error" && (
            <span className="sync-badge error" title={`Sync Error: ${syncInfo.error}. Click Settings to debug.`}>
              <AlertTriangle size={14} /> Sync Error
            </span>
          )}
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
          Match Setup
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
        <button
          type="button"
          className={`nav-tab-btn ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          <SettingsIcon size={18} />
          Settings
        </button>
      </nav>

      {/* Tab Content Panels */}
      <main className="tab-content" style={{ paddingBottom: "40px" }}>
        {activeTab === "players" && (
          <PlayerManager players={players} games={games} />
        )}
        {activeTab === "matchmaker" && (
          <MatchSetup players={players} onBuildMatch={() => setActiveTab("brackets")} />
        )}
        {activeTab === "brackets" && (
          <TournamentBrackets players={players} games={games} />
        )}
        {activeTab === "scores" && (
          <ScoreTracker players={players} games={games} />
        )}
        {activeTab === "settings" && (
          <Settings players={players} games={games} activeTab={activeTab} />
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
    </div>
  );
}

export default App;
