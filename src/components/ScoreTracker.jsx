import { useState, useEffect } from "react";
import { 
  History, 
  Trophy, 
  Calendar, 
  Award, 
  ArrowRight,
  CheckCircle,
  Users
} from "lucide-react";

export default function TournamentHistory({ players }) {
  const [historyList, setHistoryList] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [activeSubTab, setActiveSubTab] = useState("playoffs"); // "playoffs" | "qualifying"
  const [activePlayoffTab, setActivePlayoffTab] = useState("A"); // "A" | "B" | "C" | "D"
  const [lines, setLines] = useState([]);
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });

  const groupKeys = ["A", "B", "C", "D"];

  // Load history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("horseshoe_tournament_history");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Sort reverse chronological
        const sorted = [...parsed].reverse();
        setHistoryList(sorted);
        if (sorted.length > 0) {
          setSelectedId(sorted[0].id);
        }
      } catch (err) {
        console.error("Failed to parse tournament history:", err);
      }
    }
  }, []);

  const selectedEntry = historyList.find(e => e.id === selectedId) || historyList[0];

  // Recalculate historical bracket lines
  useEffect(() => {
    if (!selectedEntry || activeSubTab !== "playoffs") return;

    const updateLines = () => {
      const newLines = [];
      const wrapper = document.getElementById("history-scroll-wrapper");
      if (!wrapper) return;

      const wrapperRect = wrapper.getBoundingClientRect();
      setSvgSize({ width: wrapperRect.width, height: wrapperRect.height });

      const tourney = selectedEntry.tournament;
      if (tourney.status !== "playoffs" || !tourney.rankedBrackets) return;

      const groupBracket = tourney.rankedBrackets[activePlayoffTab];
      if (!groupBracket || groupBracket.isRoundRobin) return;

      const rounds = groupBracket.rounds || [];

      rounds.forEach((round) => {
        round.forEach((game) => {
          if (game.fromGame1Id) {
            const exit1 = document.getElementById(`hexit-${game.fromGame1Id}`);
            const entry = document.getElementById(`hentry-${game.id}`);
            if (exit1 && entry) {
              const rect1 = exit1.getBoundingClientRect();
              const rectEntry = entry.getBoundingClientRect();

              const x1 = rect1.left + rect1.width / 2 - wrapperRect.left;
              const y1 = rect1.top + rect1.height / 2 - wrapperRect.top;
              const x2 = rectEntry.left + rectEntry.width / 2 - wrapperRect.left;
              const y2 = rectEntry.top + rectEntry.height / 2 - wrapperRect.top;

              const x_mid = (x1 + x2) / 2;
              newLines.push({
                id: `line-${game.fromGame1Id}-${game.id}`,
                path: `M ${x1} ${y1} L ${x_mid} ${y1} L ${x_mid} ${y2} L ${x2} ${y2}`
              });
            }
          }

          if (game.fromGame2Id) {
            const exit2 = document.getElementById(`hexit-${game.fromGame2Id}`);
            const entry = document.getElementById(`hentry-${game.id}`);
            if (exit2 && entry) {
              const rect2 = exit2.getBoundingClientRect();
              const rectEntry = entry.getBoundingClientRect();

              const x1 = rect2.left + rect2.width / 2 - wrapperRect.left;
              const y1 = rect2.top + rect2.height / 2 - wrapperRect.top;
              const x2 = rectEntry.left + rectEntry.width / 2 - wrapperRect.left;
              const y2 = rectEntry.top + rectEntry.height / 2 - wrapperRect.top;

              const x_mid = (x1 + x2) / 2;
              newLines.push({
                id: `line-${game.fromGame2Id}-${game.id}`,
                path: `M ${x1} ${y1} L ${x_mid} ${y1} L ${x_mid} ${y2} L ${x2} ${y2}`
              });
            }
          }
        });
      });

      setLines(newLines);
    };

    updateLines();

    // Setup observer
    const wrapper = document.getElementById("history-scroll-wrapper");
    let observer;
    if (wrapper) {
      observer = new ResizeObserver(() => {
        updateLines();
      });
      observer.observe(wrapper);
    }

    window.addEventListener("resize", updateLines);

    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener("resize", updateLines);
    };
  }, [selectedEntry, activeSubTab, activePlayoffTab]);

  if (historyList.length === 0) {
    return (
      <div className="glass-panel" style={{ textAlign: "center", padding: "60px 20px" }}>
        <History size={64} style={{ color: "var(--text-secondary)", opacity: 0.3, marginBottom: "16px" }} />
        <h2 style={{ fontSize: "22px", fontWeight: "700", marginBottom: "8px" }}>No Tournament History</h2>
        <p style={{ color: "var(--text-secondary)", maxWidth: "500px", margin: "0 auto" }}>
          No completed tournaments have been archived yet. Go to the **Brackets** tab, complete matches, and click **End Tournament** to archive it here.
        </p>
      </div>
    );
  }

  const tourney = selectedEntry.tournament;

  // Standings calculation for qualifying rounds
  const getQualifyingStandings = () => {
    if (!tourney) return [];

    const stats = tourney.teams.map((team, idx) => ({
      index: idx,
      team,
      played: 0,
      wins: 0,
      losses: 0,
      pointsScored: 0,
      pointsAgainst: 0
    }));

    tourney.rounds.forEach((round) => {
      round.forEach((game) => {
        if (game.score1 !== null && game.score2 !== null) {
          const t1 = stats[game.team1Idx];
          const t2 = stats[game.team2Idx];

          t1.played++;
          t2.played++;
          t1.pointsScored += game.score1;
          t1.pointsAgainst += game.score2;
          t2.pointsScored += game.score2;
          t2.pointsAgainst += game.score1;

          if (game.score1 > game.score2) {
            t1.wins++;
            t2.losses++;
          } else {
            t2.wins++;
            t1.losses++;
          }
        }
      });
    });

    return stats.sort((a, b) => {
      const diffA = a.pointsScored - a.pointsAgainst;
      const diffB = b.pointsScored - b.pointsAgainst;
      return b.pointsScored - a.pointsScored || diffB - diffA || b.wins - a.wins;
    });
  };

  const standings = getQualifyingStandings();

  // Helper to render read-only team info card
  const renderTeamCard = (game, rIdx, gIdx, rounds, isPlayoffs = false) => {
    const team1 = isPlayoffs ? game.t1 : tourney.teams[game.team1Idx];
    const team2 = isPlayoffs ? game.t2 : tourney.teams[game.team2Idx];
    const isScored = game.score1 !== null && game.score2 !== null;

    const t1Wins = isScored && game.score1 > game.score2;
    const t2Wins = isScored && game.score2 > game.score1;

    return (
      <div 
        className="bracket-match-wrapper"
        style={{ position: "relative", width: "280px", flexShrink: 0 }}
      >
        {/* Connection entry dot (if not Round 0) */}
        {isPlayoffs && rIdx > 0 && (
          <div 
            id={`hentry-${game.id}`} 
            style={{ 
              position: "absolute", 
              left: "-8px", 
              top: "50%", 
              width: "8px", 
              height: "8px", 
              borderRadius: "50%", 
              background: "var(--accent-color)", 
              transform: "translateY(-50%)", 
              zIndex: 3 
            }} 
          />
        )}

        {/* Connection exit dot (if not Finals) */}
        {isPlayoffs && rIdx < rounds.length - 1 && (
          <div 
            id={`hexit-${game.id}`} 
            style={{ 
              position: "absolute", 
              right: "-8px", 
              top: "50%", 
              width: "8px", 
              height: "8px", 
              borderRadius: "50%", 
              background: "var(--accent-color)", 
              transform: "translateY(-50%)", 
              zIndex: 3 
            }} 
          />
        )}

        {/* Scorecard panel */}
        <div 
          className="glass-panel" 
          style={{ 
            width: "100%", 
            padding: "8px 10px", 
            background: "var(--bg-primary)", 
            border: isScored ? "1px solid rgba(99, 102, 241, 0.2)" : "1px solid var(--border-color)",
            boxShadow: "var(--shadow-sm)"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase", fontWeight: "700" }}>
            <span>Match {gIdx + 1}</span>
            {isScored && <span style={{ color: "var(--success-color)", fontWeight: "600" }}>Complete</span>}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {/* Team 1 Slot */}
            <div 
              style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                border: t1Wins ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid var(--border-color)",
                padding: "4px 8px",
                borderRadius: "var(--radius-sm)",
                background: t1Wins ? "rgba(16, 185, 129, 0.03)" : "none"
              }}
            >
              {team1 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: t1Wins ? "700" : "500", color: t1Wins ? "var(--text-primary)" : "var(--text-secondary)" }}>
                      {team1.p1?.name || "Empty Slot"}
                    </span>
                    {team1.p1?.rank && (
                      <span className={`rank-badge rank-${team1.p1.rank.toLowerCase()}`} style={{ fontSize: "8px", padding: "1px 3px", minWidth: "14px", height: "14px" }}>
                        {team1.p1.rank}
                      </span>
                    )}
                  </div>
                  {team1.p2 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "12px", fontWeight: t1Wins ? "700" : "500", color: t1Wins ? "var(--text-primary)" : "var(--text-secondary)" }}>
                        {team1.p2.name}
                      </span>
                      <span className={`rank-badge rank-${team1.p2.rank.toLowerCase()}`} style={{ fontSize: "8px", padding: "1px 3px", minWidth: "14px", height: "14px" }}>
                        {team1.p2.rank}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontStyle: "italic" }}>
                  BYE / Waiting
                </span>
              )}

              {isScored && (
                <span style={{ fontSize: "16px", fontWeight: "800", color: t1Wins ? "var(--success-color)" : "var(--text-secondary)" }}>
                  {game.score1}
                </span>
              )}
            </div>

            {/* VS Divider */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", margin: "0px" }}>
              <span style={{ fontSize: "9px", color: "var(--text-secondary)", fontWeight: "700" }}>VS</span>
            </div>

            {/* Team 2 Slot */}
            <div 
              style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                border: t2Wins ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid var(--border-color)",
                padding: "4px 8px",
                borderRadius: "var(--radius-sm)",
                background: t2Wins ? "rgba(16, 185, 129, 0.03)" : "none"
              }}
            >
              {team2 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: t2Wins ? "700" : "500", color: t2Wins ? "var(--text-primary)" : "var(--text-secondary)" }}>
                      {team2.p1?.name || "Empty Slot"}
                    </span>
                    {team2.p1?.rank && (
                      <span className={`rank-badge rank-${team2.p1.rank.toLowerCase()}`} style={{ fontSize: "8px", padding: "1px 3px", minWidth: "14px", height: "14px" }}>
                        {team2.p1.rank}
                      </span>
                    )}
                  </div>
                  {team2.p2 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "12px", fontWeight: t2Wins ? "700" : "500", color: t2Wins ? "var(--text-primary)" : "var(--text-secondary)" }}>
                        {team2.p2.name}
                      </span>
                      <span className={`rank-badge rank-${team2.p2.rank.toLowerCase()}`} style={{ fontSize: "8px", padding: "1px 3px", minWidth: "14px", height: "14px" }}>
                        {team2.p2.rank}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontStyle: "italic" }}>
                  BYE / Waiting
                </span>
              )}

              {isScored && (
                <span style={{ fontSize: "16px", fontWeight: "800", color: t2Wins ? "var(--success-color)" : "var(--text-secondary)" }}>
                  {game.score2}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Helper to calculate Round Robin standings for history group
  const getRoundRobinStandings = (groupRounds) => {
    const teamMap = new Map();
    groupRounds.forEach(round => {
      round.forEach(game => {
        if (game.t1) {
          const tId = `${game.t1.p1.id}_${game.t1.p2?.id || ""}`;
          teamMap.set(tId, game.t1);
        }
        if (game.t2) {
          const tId = `${game.t2.p1.id}_${game.t2.p2?.id || ""}`;
          teamMap.set(tId, game.t2);
        }
      });
    });
    const rrTeams = Array.from(teamMap.values());

    const stats = rrTeams.map(team => ({
      team,
      played: 0,
      wins: 0,
      losses: 0,
      pointsScored: 0,
      pointsAgainst: 0
    }));

    groupRounds.forEach(round => {
      round.forEach(game => {
        if (game.score1 !== null && game.score2 !== null) {
          const t1Stat = stats.find(s => s.team.p1.id === game.t1.p1.id && s.team.p2?.id === game.t1.p2?.id);
          const t2Stat = stats.find(s => s.team.p1.id === game.t2.p1.id && s.team.p2?.id === game.t2.p2?.id);

          if (t1Stat && t2Stat) {
            t1Stat.played++;
            t2Stat.played++;
            t1Stat.pointsScored += game.score1;
            t1Stat.pointsAgainst += game.score2;
            t2Stat.pointsScored += game.score2;
            t2Stat.pointsAgainst += game.score1;

            if (game.score1 > game.score2) {
              t1Stat.wins++;
              t2Stat.losses++;
            } else {
              t2Stat.wins++;
              t1Stat.losses++;
            }
          }
        }
      });
    });

    return stats.sort((a, b) => {
      const diffA = a.pointsScored - a.pointsAgainst;
      const diffB = b.pointsScored - b.pointsAgainst;
      return b.pointsScored - a.pointsScored || diffB - diffA || b.wins - a.wins;
    });
  };

  return (
    <div>
      {/* Title & Selector Row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h2 className="page-title" style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <History size={24} /> Tournament History
          </h2>
          <p className="page-subtitle" style={{ marginBottom: "0" }}>
            View completed and archived tournaments.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "14px", fontWeight: "500", color: "var(--text-secondary)" }}>Select Date:</span>
          <select 
            className="form-select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{ width: "260px", padding: "8px 12px" }}
          >
            {historyList.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.date}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedEntry && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Champions Summary Banner */}
          {selectedEntry.winners && Object.keys(selectedEntry.winners).length > 0 && (
            <div 
              className="glass-panel"
              style={{ 
                padding: "20px", 
                background: "linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(99, 102, 241, 0.02) 100%)", 
                border: "1px solid rgba(99, 102, 241, 0.3)", 
                borderRadius: "var(--radius-lg)"
              }}
            >
              <h3 style={{ fontSize: "16px", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", color: "var(--accent-color)" }}>
                <Trophy size={20} /> Playoff Winners
              </h3>
              
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
                {Object.entries(selectedEntry.winners).map(([group, team]) => (
                  <div 
                    key={group}
                    style={{ 
                      background: "var(--bg-primary)",
                      padding: "12px 14px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-color)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px"
                    }}
                  >
                    <span style={{ fontSize: "10px", textTransform: "uppercase", fontWeight: "800", color: "var(--accent-color)" }}>
                      Group {group} Winner
                    </span>
                    <span style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-primary)" }}>
                      🏆 {team.p1?.name} & {team.p2?.name}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                      (Rank {team.p1?.rank || "?"} + {team.p2?.rank || "?"})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sub-Tab Navigation */}
          <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px" }}>
            <button
              type="button"
              className="btn"
              style={{
                background: activeSubTab === "playoffs" ? "var(--accent-color)" : "transparent",
                color: activeSubTab === "playoffs" ? "#ffffff" : "var(--text-secondary)",
                borderColor: activeSubTab === "playoffs" ? "var(--accent-color)" : "transparent",
                fontWeight: activeSubTab === "playoffs" ? "700" : "500",
                padding: "8px 16px"
              }}
              onClick={() => setActiveSubTab("playoffs")}
            >
              <Award size={16} /> Playoff Brackets
            </button>
            <button
              type="button"
              className="btn"
              style={{
                background: activeSubTab === "qualifying" ? "var(--accent-color)" : "transparent",
                color: activeSubTab === "qualifying" ? "#ffffff" : "var(--text-secondary)",
                borderColor: activeSubTab === "qualifying" ? "var(--accent-color)" : "transparent",
                fontWeight: activeSubTab === "qualifying" ? "700" : "500",
                padding: "8px 16px"
              }}
              onClick={() => setActiveSubTab("qualifying")}
            >
              <Calendar size={16} /> Qualifying Rounds
            </button>
          </div>

          {/* Active Sub-Tab Contents */}
          {activeSubTab === "playoffs" && (
            <div>
              {tourney.status !== "playoffs" || !tourney.rankedBrackets ? (
                <div className="glass-panel" style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-secondary)" }}>
                  No playoff brackets were generated for this tournament.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  {/* Playoff Groups A, B, C, D Tab Bar */}
                  <div style={{ display: "flex", gap: "8px" }}>
                    {groupKeys.map((group) => {
                      const bracket = tourney.rankedBrackets[group];
                      if (!bracket) return null;
                      const numTeams = bracket.teams?.length || 0;
                      const isRR = bracket.isRoundRobin;

                      return (
                        <button
                          key={group}
                          type="button"
                          className={`nav-tab-btn ${activePlayoffTab === group ? "active" : ""}`}
                          onClick={() => setActivePlayoffTab(group)}
                          style={{ flex: 1, padding: "8px 12px", fontSize: "13px" }}
                        >
                          Group {group} ({numTeams} Teams{isRR ? ", RR" : ""})
                        </button>
                      );
                    })}
                  </div>

                  {/* Render Selected Playoff Group */}
                  {(() => {
                    const groupBracket = tourney.rankedBrackets[activePlayoffTab];
                    if (!groupBracket) return null;

                    const rounds = groupBracket.rounds || [];

                    if (groupBracket.isRoundRobin) {
                      const rrStandings = getRoundRobinStandings(rounds);
                      const rrChampion = rrStandings.length > 0 ? rrStandings[0].team : null;

                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                          {rrChampion && (
                            <div 
                              style={{ 
                                padding: "16px", 
                                background: "rgba(234, 179, 8, 0.08)", 
                                border: "1px solid rgba(234, 179, 8, 0.3)", 
                                borderRadius: "var(--radius-md)",
                                textAlign: "center"
                              }}
                            >
                              <h4 style={{ fontSize: "16px", fontWeight: "800", color: "var(--gold-color)", margin: "0 0 4px 0", textTransform: "uppercase" }}>
                                Group {activePlayoffTab} Champion
                              </h4>
                              <p style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-primary)", margin: 0 }}>
                                🏆 {rrChampion.p1?.name} & {rrChampion.p2?.name} 🏆
                              </p>
                            </div>
                          )}

                          <div className="dashboard-grid">
                            {/* Matches Column */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                              {rounds.map((round, rIdx) => (
                                <div key={rIdx} className="glass-panel">
                                  <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: "700", marginBottom: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "6px" }}>
                                    <Calendar size={14} style={{ color: "var(--accent-color)" }} />
                                    Round {rIdx + 1}
                                  </h3>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                    {round.map((game, gIdx) => (
                                      <div key={game.id}>
                                        {renderTeamCard(game, rIdx, gIdx, rounds, true)}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Standings Column */}
                            <div>
                              <div className="glass-panel" style={{ position: "sticky", top: "24px" }}>
                                <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: "700", marginBottom: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "6px" }}>
                                  <Trophy size={14} style={{ color: "var(--gold-color)" }} />
                                  Playoff Standings
                                </h3>

                                <div className="table-container">
                                  <table className="app-table">
                                    <thead>
                                      <tr>
                                        <th style={{ width: "40px", textAlign: "center" }}>Rank</th>
                                        <th>Team Players</th>
                                        <th style={{ width: "40px", textAlign: "center" }}>GP</th>
                                        <th style={{ width: "40px", textAlign: "center" }}>W</th>
                                        <th style={{ width: "40px", textAlign: "center" }}>L</th>
                                        <th style={{ width: "60px", textAlign: "center" }}>Points</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {rrStandings.map((stat, idx) => (
                                        <tr key={idx}>
                                          <td style={{ textAlign: "center", fontWeight: "700", color: idx === 0 ? "var(--gold-color)" : "var(--text-secondary)" }}>
                                            {idx + 1}
                                          </td>
                                          <td>
                                            <div style={{ display: "flex", flexDirection: "column" }}>
                                              <span style={{ fontWeight: "600", fontSize: "12px" }}>
                                                {stat.team.p1?.name} & {stat.team.p2?.name}
                                              </span>
                                              <span style={{ fontSize: "9px", color: "var(--text-secondary)" }}>
                                                (Rank {stat.team.p1?.rank || "?"} + {stat.team.p2?.rank || "?"})
                                              </span>
                                            </div>
                                          </td>
                                          <td style={{ textAlign: "center" }}>{stat.played}</td>
                                          <td style={{ textAlign: "center", fontWeight: "600", color: "var(--success-color)" }}>{stat.wins}</td>
                                          <td style={{ textAlign: "center", fontWeight: "600", color: "var(--danger-color)" }}>{stat.losses}</td>
                                          <td style={{ textAlign: "center", fontSize: "11px", color: "var(--text-secondary)" }}>
                                            <strong>{stat.pointsScored}</strong>:{stat.pointsAgainst}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // Render tree brackets
                    return (
                      <div id="history-scroll-wrapper" className="bracket-viewport-panel">
                        {/* SVG lines */}
                        <svg 
                          width={svgSize.width} 
                          height={svgSize.height} 
                          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", zIndex: 1 }}
                        >
                          {lines.map((line) => (
                            <path 
                              key={line.id} 
                              d={line.path} 
                              fill="none" 
                              stroke="var(--accent-color)" 
                              strokeWidth="2" 
                              opacity="var(--line-opacity)" 
                            />
                          ))}
                        </svg>

                        {/* Flat Columns layout */}
                        <div style={{ display: "flex", gap: "60px", paddingLeft: "12px", zIndex: 2, position: "relative", minHeight: "450px" }}>
                          {rounds.map((round, rIdx) => {
                            const hasPlayIn = rounds[0]?.[0]?.isPlayIn === true;
                            const isStepladder = rounds[0]?.[0]?.isStepladder === true;
                            
                            let title = "Round";
                            if (rIdx === rounds.length - 1) title = "Finals";
                            else if (rIdx === rounds.length - 2) title = "Semifinals";
                            else if (hasPlayIn && rIdx === 0) title = "Play-In";
                            else if (isStepladder) title = `Match ${rIdx + 1}`;
                            else if (rIdx === rounds.length - 3) title = "Quarterfinals";

                            return (
                              <div 
                                key={rIdx} 
                                style={{ 
                                  display: "flex", 
                                  flexDirection: "column", 
                                  width: "280px", 
                                  flexShrink: 0,
                                  minHeight: "400px"
                                }}
                              >
                                <div 
                                  style={{ 
                                    textAlign: "center", 
                                    color: "var(--accent-color)", 
                                    textTransform: "uppercase", 
                                    fontSize: "12px", 
                                    letterSpacing: "1px", 
                                    fontWeight: "700",
                                    marginBottom: "20px",
                                    flexShrink: 0
                                  }}
                                >
                                  {title} ({round.length} Game{round.length > 1 ? "s" : ""})
                                </div>

                                <div style={{ display: "flex", flexDirection: "column", gap: "24px", justifyContent: "space-around", flex: 1 }}>
                                  {round.map((game, gIdx) => (
                                    <div key={game.id} style={{ display: "flex", justifyContent: "center" }}>
                                      {renderTeamCard(game, rIdx, gIdx, rounds, true)}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {activeSubTab === "qualifying" && (
            <div className="dashboard-grid">
              {/* Left Column: Round 1, Round 2, Round 3 match details */}
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                {tourney.rounds.map((round, rIdx) => (
                  <div key={rIdx} className="glass-panel">
                    <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "16px", fontWeight: "700", marginBottom: "16px", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
                      <Calendar size={18} style={{ color: "var(--accent-color)" }} />
                      Round {rIdx + 1}
                    </h3>

                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {round.map((game, gIdx) => (
                        <div key={game.id}>
                          {renderTeamCard(game, rIdx, gIdx, tourney.rounds, false)}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Right Column: Calculated Qualifying Standings Table */}
              <div>
                <div className="glass-panel" style={{ position: "sticky", top: "24px" }}>
                  <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "16px", fontWeight: "700", marginBottom: "16px", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
                    <Trophy size={18} style={{ color: "var(--gold-color)" }} />
                    Final Qualifying Standings
                  </h3>

                  <div className="table-container">
                    <table className="app-table">
                      <thead>
                        <tr>
                          <th style={{ width: "50px", textAlign: "center" }}>Rank</th>
                          <th>Team Players</th>
                          <th style={{ width: "50px", textAlign: "center" }}>GP</th>
                          <th style={{ width: "50px", textAlign: "center" }}>Wins</th>
                          <th style={{ width: "50px", textAlign: "center" }}>Losses</th>
                          <th style={{ width: "80px", textAlign: "center" }}>Points scored</th>
                        </tr>
                      </thead>
                      <tbody>
                        {standings.map((stat, idx) => (
                          <tr key={idx}>
                            <td style={{ textAlign: "center", fontWeight: "700", color: idx < 4 ? "var(--accent-color)" : "var(--text-secondary)" }}>
                              {idx + 1}
                            </td>
                            <td>
                              <div style={{ display: "flex", flexDirection: "column" }}>
                                <span style={{ fontWeight: "600" }}>
                                  {stat.team.p1?.name} & {stat.team.p2?.name}
                                </span>
                                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                                  (Skill: {stat.team.p1?.rank || "?"} + {stat.team.p2?.rank || "?"})
                                </span>
                              </div>
                            </td>
                            <td style={{ textAlign: "center" }}>{stat.played}</td>
                            <td style={{ textAlign: "center", fontWeight: "600", color: "var(--success-color)" }}>{stat.wins}</td>
                            <td style={{ textAlign: "center", fontWeight: "600", color: "var(--danger-color)" }}>{stat.losses}</td>
                            <td style={{ textAlign: "center", fontSize: "13px", color: "var(--text-secondary)" }}>
                              <strong>{stat.pointsScored}</strong>:{stat.pointsAgainst}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
