import { useState } from "react";
import db from "../services/db";
import { Users, UserPlus, Trophy, CheckCircle, AlertCircle, Calendar } from "lucide-react";

export default function SignupTab({ players, matchSetup }) {
  const [selectedExistingId, setSelectedExistingId] = useState("");
  const [newName, setNewName] = useState("");
  const [newGender, setNewGender] = useState("Male");
  const [newExp, setNewExp] = useState("Beginner"); // Beginner, Intermediate, Advanced
  const [signupType, setSignupType] = useState("existing"); // "existing" | "new"
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const nextTournamentDate = matchSetup?.nextTournamentDate || "";
  const selectedPlayerIds = matchSetup?.selectedPlayerIds || [];

  // Map signed-up player objects stably to prevent real-time flicker
  const signedUpPlayers = selectedPlayerIds
    .map((id) => players.find((p) => p.id === id))
    .filter(Boolean);

  // Filter existing players who haven't signed up yet
  const eligibleExistingPlayers = players
    .filter((p) => !selectedPlayerIds.includes(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleSignupExisting = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!selectedExistingId) {
      setErrorMsg("Please select your name from the registry.");
      return;
    }

    const player = players.find((p) => p.id === selectedExistingId);
    if (!player) return;

    try {
      const updatedIds = [...selectedPlayerIds, selectedExistingId];
      await db.saveMatchSetup({
        ...matchSetup,
        selectedPlayerIds: updatedIds
      });
      setSuccessMsg(`Success! ${player.name} has been signed up for the tournament.`);
      setSelectedExistingId("");
    } catch (err) {
      setErrorMsg("Failed to sign up: " + err.message);
    }
  };

  const handleSignupNew = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const cleanName = newName.trim();
    if (!cleanName) {
      setErrorMsg("Please enter your name.");
      return;
    }

    // Check duplicate name case-insensitively
    if (players.some((p) => p.name.toLowerCase() === cleanName.toLowerCase())) {
      setErrorMsg("A player with this name already exists in the database. If this is you, please sign up as an 'Existing Player'.");
      return;
    }

    // Map experience level to rank
    let rank = "D";
    if (newExp === "Intermediate") rank = "B";
    if (newExp === "Advanced") rank = "A";

    try {
      const playerId = "p_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
      const newPlayer = {
        id: playerId,
        name: cleanName,
        rank: rank,
        gender: newGender
      };

      // Add new player to database
      await db.addPlayer(newPlayer);

      // Check player in for the tournament
      const updatedIds = [...selectedPlayerIds, playerId];
      await db.saveMatchSetup({
        ...matchSetup,
        selectedPlayerIds: updatedIds
      });

      setSuccessMsg(`Welcome ${cleanName}! You have been registered and signed up successfully.`);
      setNewName("");
      setNewExp("Beginner");
      setNewGender("Male");
    } catch (err) {
      setErrorMsg("Failed to register and sign up: " + err.message);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "To Be Announced (TBA)";
    try {
      return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Title */}
      <div>
        <h2 className="page-title" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <UserPlus size={24} /> Tournament Signup
        </h2>
        <p className="page-subtitle">Check yourself in for the upcoming tournament or register as a new player.</p>
      </div>

      {/* Date Banner */}
      <div className="glass-panel" style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: "16px", 
        background: "var(--accent-light)",
        border: "1px solid var(--accent-color)",
        padding: "20px" 
      }}>
        <Calendar size={32} style={{ color: "var(--accent-color)", flexShrink: 0 }} />
        <div>
          <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-secondary)", display: "block" }}>Next Tournament Date</span>
          <span style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-primary)" }}>
            {formatDate(nextTournamentDate)}
          </span>
        </div>
      </div>

      {/* Main Form/Roster Split */}
      <div className="dashboard-grid">
        {/* Left Column: Sign Up Form */}
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: "600", borderBottom: "1px solid var(--border-color)", paddingBottom: "10px" }}>
            Sign Me Up
          </h3>

          {/* Toggle Type */}
          <div style={{ display: "flex", gap: "8px", background: "var(--bg-primary)", padding: "4px", borderRadius: "var(--radius-sm)" }}>
            <button
              type="button"
              onClick={() => { setSignupType("existing"); setErrorMsg(""); setSuccessMsg(""); }}
              className="btn"
              style={{
                flex: 1,
                padding: "8px",
                fontSize: "13px",
                background: signupType === "existing" ? "var(--bg-card)" : "transparent",
                color: signupType === "existing" ? "var(--text-primary)" : "var(--text-secondary)",
                border: "none",
                boxShadow: signupType === "existing" ? "var(--shadow-sm)" : "none"
              }}
            >
              Existing Player
            </button>
            <button
              type="button"
              onClick={() => { setSignupType("new"); setErrorMsg(""); setSuccessMsg(""); }}
              className="btn"
              style={{
                flex: 1,
                padding: "8px",
                fontSize: "13px",
                background: signupType === "new" ? "var(--bg-card)" : "transparent",
                color: signupType === "new" ? "var(--text-primary)" : "var(--text-secondary)",
                border: "none",
                boxShadow: signupType === "new" ? "var(--shadow-sm)" : "none"
              }}
            >
              New Player
            </button>
          </div>

          {/* Feedback Messages */}
          {errorMsg && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--danger-glow)", color: "var(--danger-color)", padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--danger-color)", fontSize: "13px" }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--success-glow)", color: "var(--success-color)", padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--success-color)", fontSize: "13px" }}>
              <CheckCircle size={16} style={{ flexShrink: 0 }} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Forms */}
          {signupType === "existing" ? (
            <form onSubmit={handleSignupExisting} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="form-group">
                <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "600" }}>Select Your Name</label>
                {eligibleExistingPlayers.length === 0 ? (
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontStyle: "italic" }}>All registered players have signed up.</p>
                ) : (
                  <select
                    className="form-input"
                    value={selectedExistingId}
                    onChange={(e) => setSelectedExistingId(e.target.value)}
                    style={{ cursor: "pointer" }}
                  >
                    <option value="">-- Choose Name --</option>
                    {eligibleExistingPlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {eligibleExistingPlayers.length > 0 && (
                <button type="submit" className="btn btn-primary" style={{ width: "100%", padding: "12px" }}>
                  Sign Me Up
                </button>
              )}
            </form>
          ) : (
            <form onSubmit={handleSignupNew} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="form-group">
                <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "600" }}>Full Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter your name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "600" }}>Gender</label>
                  <select
                    className="form-input"
                    value={newGender}
                    onChange={(e) => setNewGender(e.target.value)}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "600" }}>Experience Level</label>
                  <select
                    className="form-input"
                    value={newExp}
                    onChange={(e) => setNewExp(e.target.value)}
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: "100%", padding: "12px", marginTop: "8px" }}>
                Register & Sign Up
              </button>
            </form>
          )}
        </div>

        {/* Right Column: Registered Roster */}
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: "600", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Registered Players</span>
            <span style={{ fontSize: "14px", fontWeight: "500", background: "var(--accent-light)", color: "var(--accent-color)", padding: "2px 8px", borderRadius: "10px" }}>
              {signedUpPlayers.length} Playing
            </span>
          </h3>

          {signedUpPlayers.length === 0 ? (
            <div className="empty-state" style={{ padding: "40px 10px" }}>
              <p style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>No players have signed up yet. Be the first!</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {signedUpPlayers
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((player) => (
                  <div
                    key={player.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      background: "var(--bg-secondary)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-color)"
                    }}
                  >
                    <span style={{ fontWeight: "600" }}>{player.name}</span>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span className={`gender-symbol ${player.gender === "Female" ? "female" : (player.gender === "Other" ? "other" : "male")}`}>
                        {player.gender === "Female" ? "F" : (player.gender === "Other" ? "O" : "M")}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
