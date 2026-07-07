import { useState } from "react";
import db from "../services/db";
import { UserPlus, Edit2, Trash2, Trophy, Activity, AlertCircle } from "lucide-react";

export default function PlayerManager({ players, games, isAnonymous }) {
  const [name, setName] = useState("");
  const [rank, setRank] = useState("A");
  const [gender, setGender] = useState("Male");
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editName, setEditName] = useState("");
  const [editRank, setEditRank] = useState("A");
  const [editGender, setEditGender] = useState("Male");
  const [errorMsg, setErrorMsg] = useState("");
  const [sortField, setSortField] = useState("rank"); // "rank" | "wins" | "name"

  // Calculate stats for a player
  const getPlayerStats = (playerId) => {
    let wins = 0;
    let losses = 0;
    let pointsScored = 0;
    let pointsAgainst = 0;

    games.forEach(g => {
      if (g.player1Id === playerId) {
        pointsScored += Number(g.player1Score);
        pointsAgainst += Number(g.player2Score);
        if (Number(g.player1Score) > Number(g.player2Score)) wins++;
        else if (Number(g.player1Score) < Number(g.player2Score)) losses++;
      } else if (g.player2Id === playerId) {
        pointsScored += Number(g.player2Score);
        pointsAgainst += Number(g.player1Score);
        if (Number(g.player2Score) > Number(g.player1Score)) wins++;
        else if (Number(g.player2Score) < Number(g.player1Score)) losses++;
      }
    });

    const total = wins + losses;
    const ratio = total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0";

    return { wins, losses, total, ratio, pointsScored, pointsAgainst };
  };

  // Add new player
  const handleAddPlayer = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    const cleanName = name.trim();
    if (!cleanName) {
      setErrorMsg("Player name cannot be empty.");
      return;
    }

    // Check for duplicate name
    if (players.some(p => p.name.toLowerCase() === cleanName.toLowerCase())) {
      setErrorMsg("A player with this name already exists.");
      return;
    }

    try {
      const newPlayer = {
        id: "p_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
        name: cleanName,
        rank: rank,
        gender: gender
      };
      await db.addPlayer(newPlayer);
      setName("");
      setRank("A");
      setGender("Male");
    } catch (err) {
      setErrorMsg("Error adding player: " + err.message);
    }
  };

  // Save edits
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    const cleanName = editName.trim();
    if (!cleanName) {
      setErrorMsg("Player name cannot be empty.");
      return;
    }

    // Check duplicate (excluding editing player)
    if (players.some(p => p.id !== editingPlayer.id && p.name.toLowerCase() === cleanName.toLowerCase())) {
      setErrorMsg("A player with this name already exists.");
      return;
    }

    try {
      await db.updatePlayer({
        id: editingPlayer.id,
        name: cleanName,
        rank: editRank,
        gender: editGender
      });
      setEditingPlayer(null);
    } catch (err) {
      setErrorMsg("Error updating player: " + err.message);
    }
  };

  // Delete player
  const handleDeletePlayer = async (playerId, playerName) => {
    if (window.confirm(`Are you sure you want to delete "${playerName}"? This will also delete all their game history!`)) {
      try {
        await db.deletePlayer(playerId);
      } catch (err) {
        setErrorMsg("Error deleting player: " + err.message);
      }
    }
  };

  // Populate edit form
  const startEdit = (player) => {
    setEditingPlayer(player);
    setEditName(player.name);
    setEditRank(player.rank);
    setEditGender(player.gender || "Male");
  };

  // Sort players list
  const getSortedPlayers = () => {
    const list = players.map(p => ({
      ...p,
      stats: getPlayerStats(p.id)
    }));

    return list.sort((a, b) => {
      if (sortField === "wins") {
        return b.stats.wins - a.stats.wins || b.stats.ratio - a.stats.ratio || a.name.localeCompare(b.name);
      } else if (sortField === "name") {
        return a.name.localeCompare(b.name);
      } else {
        // Sort by Rank A -> D, then wins desc, then name asc
        const rankOrder = { A: 1, B: 2, C: 3, D: 4 };
        return (rankOrder[a.rank] - rankOrder[b.rank]) || (b.stats.wins - a.stats.wins) || a.name.localeCompare(b.name);
      }
    });
  };

  const sortedPlayers = getSortedPlayers();

  // Find duplicate names in the database
  const getDuplicateNames = () => {
    const nameCounts = {};
    players.forEach(p => {
      const lowerName = p.name.toLowerCase().trim();
      nameCounts[lowerName] = (nameCounts[lowerName] || 0) + 1;
    });
    return Object.keys(nameCounts).filter(name => nameCounts[name] > 1);
  };

  const duplicateNames = getDuplicateNames();

  return (
    <div className={isAnonymous ? "" : "dashboard-grid"}>
      {/* Left Column: Player Entry/Edit Form */}
      {!isAnonymous && (
        <div>
          <div className="glass-panel" style={{ marginBottom: "24px" }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              {editingPlayer ? <Edit2 size={20} /> : <UserPlus size={20} />}
              {editingPlayer ? "Edit Player Details" : "Register New Player"}
            </h2>

            <form onSubmit={editingPlayer ? handleSaveEdit : handleAddPlayer}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. John Doe"
                  value={editingPlayer ? editName : name}
                  onChange={(e) => editingPlayer ? setEditName(e.target.value) : setName(e.target.value)}
                  maxLength={30}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Skill Rank Group</label>
                <select
                  className="form-select"
                  value={editingPlayer ? editRank : rank}
                  onChange={(e) => editingPlayer ? setEditRank(e.target.value) : setRank(e.target.value)}
                >
                  <option value="A">Rank A (Pro/Advanced)</option>
                  <option value="B">Rank B (Upper Medium)</option>
                  <option value="C">Rank C (Lower Medium)</option>
                  <option value="D">Rank D (Beginner/Novice)</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: "20px" }}>
                <label className="form-label">Gender (for Seed Balance)</label>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    className={`btn ${ (editingPlayer ? editGender : gender) === 'Male' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1 }}
                    onClick={() => editingPlayer ? setEditGender('Male') : setGender('Male')}
                  >
                    Male
                  </button>
                  <button
                    type="button"
                    className={`btn ${ (editingPlayer ? editGender : gender) === 'Female' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1 }}
                    onClick={() => editingPlayer ? setEditGender('Female') : setGender('Female')}
                  >
                    Female
                  </button>
                </div>
              </div>

              {errorMsg && (
                <div style={{ 
                  color: "var(--danger-color)", 
                  backgroundColor: "var(--danger-glow)", 
                  border: "1px solid rgba(239, 68, 68, 0.3)", 
                  padding: "10px", 
                  borderRadius: "var(--radius-sm)", 
                  fontSize: "14px",
                  marginBottom: "16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}>
                  <AlertCircle size={16} />
                  {errorMsg}
                </div>
              )}

              <div style={{ display: "flex", gap: "10px" }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  {editingPlayer ? "Save Changes" : "Register Player"}
                </button>
                {editingPlayer && (
                  <button type="button" className="btn btn-secondary" onClick={() => setEditingPlayer(null)}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Small stats card */}
          <div className="glass-panel" style={{ backgroundColor: "var(--accent-light)" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Activity size={18} /> Tournament Quick Stats
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div style={{ padding: "10px", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Total Players</div>
                <div style={{ fontSize: "20px", fontWeight: "700", color: "var(--accent-color)" }}>{players.length}</div>
              </div>
              <div style={{ padding: "10px", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Games Logged</div>
                <div style={{ fontSize: "20px", fontWeight: "700", color: "var(--success-color)" }}>{games.filter(g => !g.id.startsWith("tg_2_")).length}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Right Column: Players List & Standings */}
      <div className="glass-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
          <div>
            <h2 className="page-title" style={{ marginBottom: "0" }}>Player Directory</h2>
            <p className="page-subtitle" style={{ marginBottom: "0" }}>All registered horseshoe throwers and statistics.</p>
          </div>

          {/* Sorter controls */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: "500" }}>Sort By:</span>
            <select 
              className="form-select" 
              style={{ width: "auto", padding: "6px 12px", fontSize: "13px" }}
              value={sortField}
              onChange={(e) => setSortField(e.target.value)}
            >
              <option value="rank">Rank & Score</option>
              <option value="wins">Highest Wins</option>
              <option value="name">Alphabetical</option>
            </select>
          </div>
        </div>

        {duplicateNames.length > 0 && (
          <div style={{ 
            color: "var(--gold-color)", 
            backgroundColor: "rgba(234, 179, 8, 0.1)", 
            border: "1px solid rgba(234, 179, 8, 0.2)",
            padding: "12px", 
            borderRadius: "var(--radius-sm)", 
            fontSize: "14px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>
              <strong>Warning:</strong> Multiple players share the same name (e.g.{" "}
              {duplicateNames.map(name => 
                players.find(p => p.name.toLowerCase() === name)?.name
              ).join(", ")}
              ). Please ensure they are unique to avoid matchmaking confusion.
            </span>
          </div>
        )}

        {sortedPlayers.length === 0 ? (
          <div className="empty-state">
            <Trophy size={48} />
            <p>No players registered yet.</p>
            <p style={{ fontSize: "13px" }}>Use the form on the left to register players and assign ranks.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="table-container desktop-only">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>Player Name</th>
                    <th style={{ textAlign: "center" }}>Rank</th>
                    <th style={{ textAlign: "center" }}>W / L</th>
                    <th style={{ textAlign: "center" }}>Win %</th>
                    <th style={{ textAlign: "center" }}>Pts For</th>
                    <th style={{ textAlign: "center" }}>Pts Against</th>
                    {!isAnonymous && <th style={{ width: "80px", textAlign: "right" }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map((player) => (
                    <tr key={player.id}>
                      <td style={{ fontWeight: "600" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          <span>{player.name}</span>
                          <span 
                            style={{ 
                              fontSize: "20px", 
                              color: player.gender === "Female" ? "#ec4899" : "#1d4ed8", 
                              fontWeight: "900",
                              opacity: 1,
                              marginLeft: "2px",
                              display: "inline-block",
                              verticalAlign: "middle"
                            }}
                            title={player.gender || "Male"}
                          >
                            {player.gender === "Female" ? "♀" : "♂"}
                          </span>
                          {duplicateNames.includes(player.name.toLowerCase().trim()) && (
                            <AlertCircle 
                              size={14} 
                              style={{ color: "var(--gold-color)", flexShrink: 0 }} 
                              title="Duplicate name detected in database"
                            />
                          )}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span className={`rank-badge rank-${player.rank.toLowerCase()}`}>
                          {player.rank}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span style={{ color: "var(--success-color)", fontWeight: "600" }}>{player.stats.wins}</span>
                        {" - "}
                        <span style={{ color: "var(--danger-color)", fontWeight: "600" }}>{player.stats.losses}</span>
                      </td>
                      <td style={{ textAlign: "center", fontWeight: "600" }}>
                        {player.stats.ratio}%
                      </td>
                      <td style={{ textAlign: "center", color: "var(--text-secondary)" }}>
                        {player.stats.pointsScored}
                      </td>
                      <td style={{ textAlign: "center", color: "var(--text-secondary)" }}>
                        {player.stats.pointsAgainst}
                      </td>
                      {!isAnonymous && (
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: "4px" }}>
                            <button
                              className="btn-icon-only"
                              title="Edit Player"
                              onClick={() => startEdit(player)}
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              className="btn-icon-only danger"
                              title="Delete Player"
                              onClick={() => handleDeletePlayer(player.id, player.name)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="mobile-only player-card-list">
              {sortedPlayers.map((player) => (
                <div key={player.id} className="mobile-player-card">
                  <div className="card-header-row">
                    <span className="player-name-wrapper">
                      <span className="player-name">{player.name}</span>
                      <span 
                        className="gender-symbol" 
                        style={{ color: player.gender === "Female" ? "#ec4899" : "#1d4ed8" }}
                        title={player.gender || "Male"}
                      >
                        {player.gender === "Female" ? "♀" : "♂"}
                      </span>
                      {duplicateNames.includes(player.name.toLowerCase().trim()) && (
                        <AlertCircle 
                          size={14} 
                          style={{ color: "var(--gold-color)", flexShrink: 0 }} 
                          title="Duplicate name detected in database"
                        />
                      )}
                      <span className={`rank-badge rank-${player.rank.toLowerCase()}`}>
                        {player.rank}
                      </span>
                    </span>
                    {!isAnonymous && (
                      <div className="card-actions">
                        <button
                          className="btn-icon-only"
                          title="Edit Player"
                          onClick={() => startEdit(player)}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          className="btn-icon-only danger"
                          title="Delete Player"
                          onClick={() => handleDeletePlayer(player.id, player.name)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="card-stats-row">
                    <div className="stat-item">
                      <span className="stat-label">W/L:</span>
                      <span className="stat-value text-success">{player.stats.wins}</span>
                      <span>-</span>
                      <span className="stat-value text-danger">{player.stats.losses}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Win %:</span>
                      <span className="stat-value">{player.stats.ratio}%</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Pts:</span>
                      <span className="stat-value">{player.stats.pointsScored}:{player.stats.pointsAgainst}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
