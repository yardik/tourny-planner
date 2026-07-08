import { useState, useEffect } from "react";
import { Users, UserPlus, UserMinus, Shuffle, RotateCcw, AlertCircle, ArrowLeft, Trophy } from "lucide-react";
import db from "../services/db";

export default function MatchSetup({ players, matchSetup, isAnonymous, onBuildMatch }) {
  const [selectedPlayerIds, setSelectedPlayerIds] = useState(() => {
    const s = db.getLocalMatchSetup();
    return s ? s.selectedPlayerIds : [];
  });
  const [generatedTeams, setGeneratedTeams] = useState(() => {
    const s = db.getLocalMatchSetup();
    return s ? s.generatedTeams : [];
  });
  const [sittingOut, setSittingOut] = useState([]);
  const [fallbackMsg, setFallbackMsg] = useState("");
  const [isGenerated, setIsGenerated] = useState(() => {
    const s = db.getLocalMatchSetup();
    return s ? s.isGenerated : false;
  });
  const [searchQuery, setSearchQuery] = useState("");

  // Sync changes from the matchSetup prop down to local states
  useEffect(() => {
    if (matchSetup) {
      setSelectedPlayerIds(matchSetup.selectedPlayerIds || []);
      setGeneratedTeams(matchSetup.generatedTeams || []);
      setIsGenerated(matchSetup.isGenerated || false);
    }
  }, [matchSetup]);

  // Sync changes from local states back up to the database (only for authenticated users)
  useEffect(() => {
    if (isAnonymous) return; // Anonymous users are read-only

    const isDiff = 
      JSON.stringify(matchSetup?.selectedPlayerIds) !== JSON.stringify(selectedPlayerIds) ||
      JSON.stringify(matchSetup?.generatedTeams) !== JSON.stringify(generatedTeams) ||
      matchSetup?.isGenerated !== isGenerated;
      
    if (isDiff) {
      db.saveMatchSetup({
        selectedPlayerIds,
        generatedTeams,
        isGenerated
      });
    }
  }, [selectedPlayerIds, generatedTeams, isGenerated, isAnonymous]);

  // Clean up selection list and generated teams if players are deleted from the database
  useEffect(() => {
    const existingIds = players.map((p) => p.id);
    const cleanedIds = selectedPlayerIds.filter((id) => existingIds.includes(id));
    if (cleanedIds.length !== selectedPlayerIds.length) {
      setSelectedPlayerIds(cleanedIds);
    }

    if (generatedTeams.length > 0) {
      let changed = false;
      const cleanedTeams = generatedTeams.map((team) => {
        let p1 = team.p1;
        let p2 = team.p2;
        if (p1 && !existingIds.includes(p1.id)) {
          p1 = null;
          changed = true;
        }
        if (p2 && !existingIds.includes(p2.id)) {
          p2 = null;
          changed = true;
        }
        return { p1, p2 };
      });
      if (changed) {
        setGeneratedTeams(cleanedTeams);
      }
    }
  }, [players]);

  // Filter available players
  const availablePlayers = players.filter(
    (p) => !selectedPlayerIds.includes(p.id) && 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get selected player objects
  const selectedPlayers = players.filter((p) => selectedPlayerIds.includes(p.id));

  // Add player to match
  const handleAddPlayer = (id) => {
    setSelectedPlayerIds([...selectedPlayerIds, id]);
  };

  // Remove player from match
  const handleRemovePlayer = (id) => {
    setSelectedPlayerIds(selectedPlayerIds.filter((pId) => pId !== id));
  };

  // Add all players
  const handleAddAll = () => {
    setSelectedPlayerIds(players.map((p) => p.id));
  };

  // Clear selections
  const handleClearAll = () => {
    setSelectedPlayerIds([]);
    setGeneratedTeams([]);
    setSittingOut([]);
    setFallbackMsg("");
    setIsGenerated(false);
  };

  // Matchmaking Algorithm - Branch and Bound Backtracking Solver
  // Solves the Maximum Weight Matching problem to maximize standard pairings (A-D, B-C) 
  // and gender balance (mixed-gender pairs), adhering strictly to rank priority and restrictions.
  const handleGenerateTeams = () => {
    if (selectedPlayerIds.length < 2 || selectedPlayerIds.length % 2 !== 0) return;

    // Get selected player details
    const activePlayers = players.filter((p) => selectedPlayerIds.includes(p.id));

    // Fisher-Yates Shuffle helper (randomizes player arrays to ensure non-deterministic optimal matching)
    const shuffle = (array) => {
      const arr = [...array];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    const randomizedPlayers = shuffle(activePlayers);
    const len = randomizedPlayers.length;
    const visited = new Array(len).fill(false);

    // Helper: Compute utility weights for pairings
    const getPairScore = (p1, p2) => {
      const r1 = p1.rank;
      const r2 = p2.rank;
      const g1 = p1.gender || "Male";
      const g2 = p2.gender || "Male";

      const ranks = [r1, r2].sort().join("");

      let baseScore = -999999;

      if (ranks === "AD") {
        baseScore = 1000; // Primary Rank seeding
      } else if (ranks === "BC") {
        baseScore = 1000; // Primary Rank seeding
      } else if (ranks === "AC") {
        baseScore = 500;  // Fallback seeding
      } else if (ranks === "BB") {
        baseScore = 100;  // Last resort seeding
      } else if (ranks === "CC") {
        baseScore = 100;  // Last resort seeding
      }

      if (baseScore < 0) return -999999; // Disallowed pairings (A+A, D+D, B+D, C+D)

      // Mixed-gender balancing bonus
      const isMixed = g1 !== g2;
      const genderBonus = isMixed ? 10 : 0;

      return baseScore + genderBonus;
    };

    // Helper: Finds partner of opposite gender if possible for greedy heuristic
    const findOppositeGenderPartner = (player, partnerList) => {
      if (partnerList.length === 0) return null;

      const targetGender = player.gender === "Female" ? "Male" : "Female";
      let idx = partnerList.findIndex((p) => (p.gender || "Male") === targetGender);

      if (idx === -1) {
        idx = 0; // Fall back to first available if no opposite gender exists
      }

      const partner = partnerList[idx];
      partnerList.splice(idx, 1);
      return partner;
    };

    // Fast Greedy matching heuristic to seed the backtracking solver
    const runGreedyMatch = () => {
      const shuf = shuffle(activePlayers);
      const A = shuf.filter((p) => p.rank === "A");
      const B = shuf.filter((p) => p.rank === "B");
      const C = shuf.filter((p) => p.rank === "C");
      const D = shuf.filter((p) => p.rank === "D");

      const gTeams = [];
      const listA = [...A];
      const listB = [...B];
      const listC = [...C];
      const listD = [...D];

      // 1. Primary Pairing: A + D (gender-balanced)
      while (listA.length > 0 && listD.length > 0) {
        const p1 = listA.pop();
        const p2 = findOppositeGenderPartner(p1, listD);
        gTeams.push({ p1, p2 });
      }

      // 2. Primary Pairing: B + C (gender-balanced)
      while (listB.length > 0 && listC.length > 0) {
        const p1 = listB.pop();
        const p2 = findOppositeGenderPartner(p1, listC);
        gTeams.push({ p1, p2 });
      }

      // 3. Fallback: A + C
      while (listA.length > 0 && listC.length > 0) {
        const p1 = listA.pop();
        const p2 = findOppositeGenderPartner(p1, listC);
        gTeams.push({ p1, p2 });
      }

      // 4. Last Resort: B + B
      const bMales = listB.filter((p) => (p.gender || "Male") === "Male");
      const bFemales = listB.filter((p) => (p.gender || "Male") === "Female");
      while (bMales.length > 0 && bFemales.length > 0) {
        gTeams.push({ p1: bMales.pop(), p2: bFemales.pop() });
      }
      const bLeftovers = [...bMales, ...bFemales];
      while (bLeftovers.length >= 2) {
        gTeams.push({ p1: bLeftovers.pop(), p2: bLeftovers.pop() });
      }

      // 5. Last Resort: C + C
      const cMales = listC.filter((p) => (p.gender || "Male") === "Male");
      const cFemales = listC.filter((p) => (p.gender || "Male") === "Female");
      while (cMales.length > 0 && cFemales.length > 0) {
        gTeams.push({ p1: cMales.pop(), p2: cFemales.pop() });
      }
      const cLeftovers = [...cMales, ...cFemales];
      while (cLeftovers.length >= 2) {
        gTeams.push({ p1: cLeftovers.pop(), p2: cLeftovers.pop() });
      }

      return gTeams;
    };

    const greedyTeams = runGreedyMatch();
    let greedyScore = 0;
    greedyTeams.forEach((team) => {
      greedyScore += getPairScore(team.p1, team.p2);
    });

    let bestScore = greedyScore;
    let bestTeams = greedyTeams;

    const currentTeams = [];
    let iterations = 0;
    const maxIterations = 100000; // Performance safety ceiling


    // Recursive Backtrack solver with Pruning and Branch and Bound optimization
    const backtrack = (idx, currentScore) => {
      iterations++;
      if (iterations > maxIterations) return; // Prevent lockups

      let i = idx;
      while (i < len && visited[i]) {
        i++;
      }

      // Base case: all players matched
      if (i >= len) {
        if (currentScore > bestScore) {
          bestScore = currentScore;
          bestTeams = [...currentTeams];
        }
        return;
      }

      // Branch and Bound Pruning:
      // Maximum possible score we could get from the remaining unvisited players.
      // 1010 is the maximum score any single pair can obtain (1000 base + 10 mixed-gender bonus).
      const unvisitedCount = len - i;
      const maxPossibleRemaining = Math.floor(unvisitedCount / 2) * 1010;
      if (currentScore + maxPossibleRemaining <= bestScore) {
        return;
      }

      // Generate candidates and sort them in descending order of their pair score.
      // This ensures we explore the highest-scoring combinations first, establishing
      // a high bestScore baseline quickly, which enables aggressive pruning of low-scoring paths.
      const candidates = [];
      for (let j = i + 1; j < len; j++) {
        if (!visited[j]) {
          const score = getPairScore(randomizedPlayers[i], randomizedPlayers[j]);
          if (score > -500000) {
            candidates.push({ idx: j, score });
          }
        }
      }

      // Sort candidate partners by score descending
      candidates.sort((a, b) => b.score - a.score);

      visited[i] = true;
      for (const cand of candidates) {
        const j = cand.idx;
        visited[j] = true;
        currentTeams.push({ p1: randomizedPlayers[i], p2: randomizedPlayers[j] });

        // Recurse starting the search from i + 1
        backtrack(i + 1, currentScore + cand.score);

        currentTeams.pop();
        visited[j] = false;
      }
      visited[i] = false;
    };

    // Solve matching
    backtrack(0, 0);

    const rankWeight = { A: 4, B: 3, C: 2, D: 1 };
    const sortedBestTeams = bestTeams.map((team) => {
      const w1 = rankWeight[team.p1.rank] || 0;
      const w2 = rankWeight[team.p2.rank] || 0;
      if (w1 < w2) {
        return { p1: team.p2, p2: team.p1 };
      }
      return team;
    });

    if (bestScore <= -500000) {
      setGeneratedTeams([]);
      setSittingOut(activePlayers);
    } else {
      setGeneratedTeams(sortedBestTeams);
      setSittingOut([]);
    }

    setIsGenerated(true);
  };

  const [assigningSlot, setAssigningSlot] = useState(null); // { teamIdx, slot }

  // Remove player from a team slot
  const handleRemovePlayerFromTeam = (teamIdx, slot) => {
    const team = generatedTeams[teamIdx];
    const playerToRemove = team[slot];
    if (!playerToRemove) return;

    // Remove from active match players list
    setSelectedPlayerIds(selectedPlayerIds.filter((id) => id !== playerToRemove.id));

    // Update teams state
    const updatedTeams = [...generatedTeams];
    updatedTeams[teamIdx][slot] = null;
    setGeneratedTeams(updatedTeams);
    setAssigningSlot(null);
  };

  // Assign player to an empty team slot
  const handleAssignPlayerToTeam = (player) => {
    if (!assigningSlot) return;
    const { teamIdx, slot } = assigningSlot;

    // Add to active match players list
    setSelectedPlayerIds([...selectedPlayerIds, player.id]);

    // Update teams state
    const updatedTeams = [...generatedTeams];
    updatedTeams[teamIdx][slot] = player;

    // Sort ranks in the updated team so the higher rank is p1
    const team = updatedTeams[teamIdx];
    if (team.p1 && team.p2) {
      const rankWeight = { A: 4, B: 3, C: 2, D: 1 };
      const w1 = rankWeight[team.p1.rank] || 0;
      const w2 = rankWeight[team.p2.rank] || 0;
      if (w1 < w2) {
        updatedTeams[teamIdx] = { p1: team.p2, p2: team.p1 };
      }
    }

    setGeneratedTeams(updatedTeams);
    setAssigningSlot(null);
  };

  // Generate a 3-round tournament schedule and build starting brackets
  const handleBuildMatch = async () => {
    // Filter out any teams that are completely empty (in case players were deleted)
    const validTeams = generatedTeams.filter(t => t.p1 || t.p2);
    const numTeams = validTeams.length;

    if (numTeams < 2) {
      alert("You must have at least 2 teams to generate tournament brackets.");
      return;
    }

    const isOdd = numTeams % 2 !== 0;
    const count = isOdd ? numTeams + 1 : numTeams;
    
    // We will generate the round-robin schedule for indices 0 to count-1
    const numRounds = count - 1;
    const maxRoundsToGen = Math.min(3, numRounds);
    
    const roundsList = [];
    const byesList = [];

    // Helper to shuffle candidates (Fisher-Yates)
    const shuffleArray = (array) => {
      const arr = [...array];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    for (let r = 0; r < maxRoundsToGen; r++) {
      const roundGames = [];
      let roundBye = null;

      for (let i = 0; i < count / 2; i++) {
        const home = (r + i) % (count - 1);
        let away = (count - 1 - i + r) % (count - 1);
        
        if (i === 0) {
          away = count - 1;
        }

        // Check for Bye
        if (isOdd && (home === count - 1 || away === count - 1)) {
          const activeTeamIdx = home === count - 1 ? away : home;
          roundBye = validTeams[activeTeamIdx];
        } else {
          roundGames.push({
            id: `g_${r}_${i}_${Date.now()}`,
            team1Idx: home,
            team2Idx: away,
            score1: null,
            score2: null
          });
        }
      }
      // Shuffle games order in the round to add variety
      roundsList.push(shuffleArray(roundGames));
      byesList.push(roundBye);
    }

    const tournament = {
      status: "starting",
      teams: validTeams,
      rounds: roundsList,
      byes: byesList,
      date: new Date().toISOString()
    };

    try {
      await db.saveActiveTournament(tournament);
      if (onBuildMatch) {
        onBuildMatch();
      }
    } catch (err) {
      alert("Failed to build match brackets: " + err.message);
    }
  };

  // Matchmaking warnings
  const getWarnings = () => {
    const list = [];
    if (selectedPlayers.length === 0) return list;

    // 1. Uneven number of players selected
    if (selectedPlayers.length % 2 !== 0) {
      list.push("Uneven number of players selected. You must have an even number of players to generate matches.");
    }

    // 2. Mismatched A-D or B-C counts
    const countA = selectedPlayers.filter((p) => p.rank === "A").length;
    const countB = selectedPlayers.filter((p) => p.rank === "B").length;
    const countC = selectedPlayers.filter((p) => p.rank === "C").length;
    const countD = selectedPlayers.filter((p) => p.rank === "D").length;

    if (countA !== countD || countB !== countC) {
      list.push(
        `Unequal group sizes: Rank A (${countA}) vs Rank D (${countD}), or Rank B (${countB}) vs Rank C (${countC}). Fallback pairings (e.g., A with C, or B with B) will occur.`
      );
    }

    return list;
  };

  const currentWarnings = getWarnings();

  return (
    <div>
      {/* Page Title */}
      {!isAnonymous && (
        <div style={{ marginBottom: "24px" }}>
          <h2 className="page-title" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Users size={24} /> Match Team Builder
          </h2>
          <p className="page-subtitle">Select who is playing today and generate fair teams automatically.</p>
        </div>
      )}

      {!isGenerated ? (
        <div className={isAnonymous ? "" : "dashboard-grid"}>
          {/* Left Column: Available Player Directory */}
          {!isAnonymous && (
            <div className="glass-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
              <h3 style={{ fontSize: "18px", fontWeight: "600" }}>Available Players</h3>
              {availablePlayers.length > 0 && !isAnonymous && (
                <button type="button" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "13px" }} onClick={handleAddAll}>
                  Add All
                </button>
              )}
            </div>

            <div className="form-group" style={{ marginBottom: "16px" }}>
              <input
                type="text"
                className="form-input"
                placeholder="Search players by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {availablePlayers.length === 0 ? (
              <div className="empty-state" style={{ padding: "30px 10px" }}>
                <p style={{ color: "var(--text-secondary)" }}>
                  {players.length === 0 
                    ? "Register players in the Directory tab first." 
                    : "All players are added to the match."}
                </p>
              </div>
            ) : (
              <div style={{ maxHeight: "400px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                {availablePlayers.map((player) => (
                  <div 
                    key={player.id} 
                    style={{ 
                      display: "flex", 
                      justifyContent: "space-between", 
                      alignItems: "center", 
                      padding: "10px 12px", 
                      background: "var(--bg-secondary)", 
                      borderRadius: "var(--radius-sm)", 
                      border: "1px solid var(--border-color)" 
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: "600", marginRight: "8px" }}>{player.name}</span>
                      <span 
                        style={{ 
                          fontSize: "20px", 
                          color: player.gender === "Female" ? "#ec4899" : "#1d4ed8", 
                          fontWeight: "900",
                          marginRight: "10px" 
                        }}
                      >
                        {player.gender === "Female" ? "♀" : "♂"}
                      </span>
                      <span className={`rank-badge rank-${player.rank.toLowerCase()}`}>
                        {player.rank}
                      </span>
                    </div>
                    {!isAnonymous && (
                      <button
                        type="button"
                        className="btn-icon-only"
                        onClick={() => handleAddPlayer(player.id)}
                        title="Add to Match"
                        style={{ color: "var(--accent-color)" }}
                      >
                        <UserPlus size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            </div>
          )}

          {/* Right Column: In-Match Queue */}
          <div className="glass-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
              <h3 style={{ fontSize: "18px", fontWeight: "600" }}>
                Active Players In-Match ({selectedPlayers.length})
              </h3>
              {selectedPlayers.length > 0 && !isAnonymous && (
                <button type="button" className="btn btn-danger" style={{ padding: "6px 12px", fontSize: "13px" }} onClick={handleClearAll}>
                  Remove All
                </button>
              )}
            </div>

            {selectedPlayers.length === 0 ? (
              <div className="empty-state" style={{ padding: "60px 10px" }}>
                <Users size={32} style={{ opacity: 0.3, marginBottom: "8px" }} />
                <p>No players added to the match yet.</p>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                  {isAnonymous ? "Waiting for a coordinator to select players." : "Click the + button next to players in the directory list to add them."}
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between" }}>
                <div style={{ maxHeight: "330px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                  {selectedPlayers.map((player) => (
                    <div 
                      key={player.id} 
                      style={{ 
                        display: "flex", 
                        justifyContent: "space-between", 
                        alignItems: "center", 
                        padding: "10px 12px", 
                        background: "var(--accent-light)", 
                        borderRadius: "var(--radius-sm)", 
                        border: "1px solid var(--accent-glow)" 
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: "600", marginRight: "8px" }}>{player.name}</span>
                        <span 
                          style={{ 
                            fontSize: "20px", 
                            color: player.gender === "Female" ? "#ec4899" : "#1d4ed8", 
                            fontWeight: "900",
                            marginRight: "10px" 
                          }}
                        >
                          {player.gender === "Female" ? "♀" : "♂"}
                        </span>
                        <span className={`rank-badge rank-${player.rank.toLowerCase()}`}>
                          {player.rank}
                        </span>
                      </div>
                      {!isAnonymous && (
                        <button
                          type="button"
                          className="btn-icon-only danger"
                          onClick={() => handleRemovePlayer(player.id)}
                          title="Remove from Match"
                        >
                          <UserMinus size={18} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "16px", marginTop: "auto" }}>
                  {currentWarnings.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                      {currentWarnings.map((warn, index) => (
                        <div 
                          key={index}
                          style={{ 
                            display: "flex", 
                            gap: "8px", 
                            alignItems: "flex-start", 
                            color: "var(--gold-color)", 
                            backgroundColor: "rgba(234, 179, 8, 0.1)",
                            border: "1px solid rgba(234, 179, 8, 0.2)",
                            padding: "10px",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "13px"
                          }}
                        >
                          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
                          <span>{warn}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedPlayers.length < 2 && (
                    <div style={{ display: "flex", gap: "6px", alignItems: "center", color: "var(--text-secondary)", fontSize: "13px", marginBottom: "12px" }}>
                      <AlertCircle size={16} />
                      <span>{isAnonymous ? "Waiting for a coordinator to select at least 2 players." : "Select at least 2 players to generate teams."}</span>
                    </div>
                  )}
                  {!isAnonymous && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ width: "100%", gap: "10px" }}
                      onClick={handleGenerateTeams}
                      disabled={selectedPlayers.length < 2 || selectedPlayers.length % 2 !== 0}
                    >
                      <Shuffle size={18} /> Generate Teams
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Team Generation View */
        <div className="glass-panel">
          {isAnonymous ? (
            <div style={{ marginBottom: "24px" }}>
              <h3 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "4px" }}>Generated Match Teams</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>These teams have been generated for the upcoming match. The bracket will be built by a coordinator.</p>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
                onClick={() => setIsGenerated(false)}
              >
                <ArrowLeft size={16} /> Adjust Players
              </button>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                  onClick={handleBuildMatch}
                  disabled={generatedTeams.filter(t => t.p1 || t.p2).length < 2}
                >
                  <Trophy size={16} /> Build Match with These Teams
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                  onClick={handleGenerateTeams}
                >
                  <Shuffle size={16} /> Re-generate Teams
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                  onClick={handleClearAll}
                >
                  <RotateCcw size={16} /> Clear Setup
                </button>
              </div>
            </div>
          )}

          {currentWarnings.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
              {currentWarnings.map((warn, index) => (
                <div 
                  key={index}
                  style={{ 
                    display: "flex", 
                    gap: "8px", 
                    alignItems: "center", 
                    color: "var(--gold-color)", 
                    backgroundColor: "rgba(234, 179, 8, 0.08)",
                    border: "1px solid rgba(234, 179, 8, 0.15)",
                    padding: "10px 14px",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "13px"
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{warn}</span>
                </div>
              ))}
            </div>
          )}

          {fallbackMsg && (
            <div 
              style={{ 
                padding: "12px 16px", 
                background: "rgba(99, 102, 241, 0.08)", 
                border: "1px solid rgba(99, 102, 241, 0.2)", 
                borderRadius: "var(--radius-md)",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "20px"
              }}
            >
              <AlertCircle size={20} style={{ color: "var(--accent-color)" }} />
              <div style={{ fontSize: "14px", fontWeight: "500", color: "var(--text-primary)" }}>
                {fallbackMsg}
              </div>
            </div>
          )}

          {generatedTeams.length === 0 ? (
            <div className="empty-state" style={{ padding: "40px 20px", marginBottom: "24px" }}>
              <AlertCircle size={48} style={{ color: "var(--danger-color)", opacity: 0.8 }} />
              <p style={{ fontWeight: "600", fontSize: "18px" }}>No Valid Teams Could Be Generated</p>
              <p style={{ fontSize: "14px", color: "var(--text-secondary)", maxWidth: "500px", margin: "0 auto", lineHeight: "1.5" }}>
                Under the current constraints, Rank A and Rank D players cannot pair with their own ranks, and D players cannot match with B or C players. Please adjust your active player selections or player ranks.
              </p>
            </div>
          ) : (
            <>
              <h3 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "16px", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
                Generated Teams ({generatedTeams.length})
              </h3>

              <div 
                style={{ 
                  display: "grid", 
                  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", 
                  gap: "16px",
                  marginBottom: "24px" 
                }}
              >
                {generatedTeams.map((team, idx) => {
                  const isWeird = (() => {
                    if (!team.p1 || !team.p2) return false;
                    const r1 = team.p1.rank;
                    const r2 = team.p2.rank;
                    const ranks = [r1, r2].sort().join("");
                    return ranks === "AC" || ranks === "BB" || ranks === "CC";
                  })();

                  return (
                    <div 
                      key={idx} 
                      className="glass-panel" 
                      style={{ 
                        padding: "16px", 
                        background: isWeird ? "rgba(234, 179, 8, 0.02)" : "var(--bg-secondary)", 
                        border: isWeird ? "1px solid rgba(234, 179, 8, 0.3)" : "1px solid var(--border-color)",
                        boxShadow: isWeird ? "0 0 12px rgba(234, 179, 8, 0.05)" : "var(--shadow-sm)",
                        transition: "all var(--transition-fast)"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                        <h4 style={{ fontSize: "14px", fontWeight: "700", color: isWeird ? "var(--gold-color)" : "var(--accent-color)", textTransform: "uppercase", letterSpacing: "1px", margin: 0 }}>
                          Team {idx + 1}
                        </h4>
                        {isWeird && (
                          <span 
                            style={{ 
                              fontSize: "10px", 
                              backgroundColor: "rgba(234, 179, 8, 0.15)", 
                              color: "var(--gold-color)", 
                              padding: "2px 6px", 
                              borderRadius: "var(--radius-sm)", 
                              fontWeight: "600" 
                            }}
                          >
                            Fallback Pair
                          </span>
                        )}
                      </div>
                      
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {/* Player 1 Slot */}
                        {team.p1 ? (
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              {!isAnonymous && (
                                <button 
                                  type="button" 
                                  className="btn-icon-only danger" 
                                  style={{ padding: "4px" }}
                                  onClick={() => handleRemovePlayerFromTeam(idx, "p1")}
                                  title="Remove player"
                                >
                                  <UserMinus size={14} />
                                </button>
                              )}
                              <span style={{ fontWeight: "600" }}>{team.p1.name}</span>
                              <span 
                                style={{ 
                                  fontSize: "20px", 
                                  color: team.p1.gender === "Female" ? "#ec4899" : "#1d4ed8", 
                                  fontWeight: "900",
                                  display: "inline-block",
                                  verticalAlign: "middle"
                                }}
                              >
                                {team.p1.gender === "Female" ? "♀" : "♂"}
                              </span>
                            </div>
                            <span className={`rank-badge rank-${team.p1.rank.toLowerCase()}`} style={{ fontSize: "11px" }}>
                              {team.p1.rank}
                            </span>
                          </div>
                        ) : (
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: "28px" }}>
                            {assigningSlot?.teamIdx === idx && assigningSlot?.slot === "p1" ? (
                              <div style={{ width: "100%", padding: "6px", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                  <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-secondary)" }}>Select:</span>
                                  <button type="button" onClick={() => setAssigningSlot(null)} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "11px" }}>Cancel</button>
                                </div>
                                <div style={{ maxHeight: "100px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
                                  {availablePlayers.map(p => (
                                    <button 
                                      key={p.id}
                                      type="button"
                                      className="btn btn-secondary"
                                      style={{ padding: "3px 6px", fontSize: "11px", width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                                      onClick={() => handleAssignPlayerToTeam(p)}
                                    >
                                      <span>{p.name} ({p.rank})</span>
                                      <UserPlus size={11} />
                                    </button>
                                  ))}
                                  {availablePlayers.length === 0 && (
                                    <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>No available players</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-secondary)", fontStyle: "italic", fontSize: "13px" }}>
                                {!isAnonymous && (
                                  <button 
                                    type="button" 
                                    className="btn-icon-only" 
                                    style={{ padding: "4px", color: "var(--accent-color)" }}
                                    onClick={() => setAssigningSlot({ teamIdx: idx, slot: "p1" })}
                                    title="Add player"
                                  >
                                    <UserPlus size={14} />
                                  </button>
                                )}
                                <span>Empty Slot</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* VS Connector */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", margin: "4px 0" }}>
                          <div style={{ flex: 1, borderTop: "1px dashed var(--border-color)", opacity: 0.5 }}></div>
                          <span style={{ padding: "0 8px", fontSize: "11px", color: "var(--text-secondary)", fontWeight: "600" }}>&</span>
                          <div style={{ flex: 1, borderTop: "1px dashed var(--border-color)", opacity: 0.5 }}></div>
                        </div>

                        {/* Player 2 Slot */}
                        {team.p2 ? (
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              {!isAnonymous && (
                                <button 
                                  type="button" 
                                  className="btn-icon-only danger" 
                                  style={{ padding: "4px" }}
                                  onClick={() => handleRemovePlayerFromTeam(idx, "p2")}
                                  title="Remove player"
                                >
                                  <UserMinus size={14} />
                                </button>
                              )}
                              <span style={{ fontWeight: "600" }}>{team.p2.name}</span>
                              <span 
                                style={{ 
                                  fontSize: "20px", 
                                  color: team.p2.gender === "Female" ? "#ec4899" : "#1d4ed8", 
                                  fontWeight: "900",
                                  display: "inline-block",
                                  verticalAlign: "middle"
                                }}
                              >
                                {team.p2.gender === "Female" ? "♀" : "♂"}
                              </span>
                            </div>
                            <span className={`rank-badge rank-${team.p2.rank.toLowerCase()}`} style={{ fontSize: "11px" }}>
                              {team.p2.rank}
                            </span>
                          </div>
                        ) : (
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: "28px" }}>
                            {assigningSlot?.teamIdx === idx && assigningSlot?.slot === "p2" ? (
                              <div style={{ width: "100%", padding: "6px", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                  <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-secondary)" }}>Select:</span>
                                  <button type="button" onClick={() => setAssigningSlot(null)} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "11px" }}>Cancel</button>
                                </div>
                                <div style={{ maxHeight: "100px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
                                  {availablePlayers.map(p => (
                                    <button 
                                      key={p.id}
                                      type="button"
                                      className="btn btn-secondary"
                                      style={{ padding: "3px 6px", fontSize: "11px", width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                                      onClick={() => handleAssignPlayerToTeam(p)}
                                    >
                                      <span>{p.name} ({p.rank})</span>
                                      <UserPlus size={11} />
                                    </button>
                                  ))}
                                  {availablePlayers.length === 0 && (
                                    <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>No available players</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-secondary)", fontStyle: "italic", fontSize: "13px" }}>
                                {!isAnonymous && (
                                  <button 
                                    type="button" 
                                    className="btn-icon-only" 
                                    style={{ padding: "4px", color: "var(--accent-color)" }}
                                    onClick={() => setAssigningSlot({ teamIdx: idx, slot: "p2" })}
                                    title="Add player"
                                  >
                                    <UserPlus size={14} />
                                  </button>
                                )}
                                <span>Empty Slot</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Sitting Out Box */}
          {sittingOut.length > 0 && (
            <div 
              style={{ 
                padding: "16px", 
                background: "var(--danger-glow)", 
                border: "1px solid rgba(239, 68, 68, 0.15)", 
                borderRadius: "var(--radius-md)",
                display: "flex",
                alignItems: "center",
                gap: "12px"
              }}
            >
              <AlertCircle size={20} style={{ color: "var(--danger-color)" }} />
              <div>
                <strong style={{ color: "var(--danger-color)" }}>Sitting Out This Match:</strong>{" "}
                {sittingOut.map((p, i) => (
                  <span key={p.id} style={{ fontWeight: "600" }}>
                    {p.name} ({p.rank} - {p.gender}){i < sittingOut.length - 1 ? ", " : ""}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
