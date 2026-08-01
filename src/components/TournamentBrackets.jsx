import { useState, useEffect } from "react";
import db from "../services/db";
import { Trophy, Calendar, Award, AlertCircle, Play, CheckCircle, RotateCcw, Save, X, ArrowRight, UserPlus, Activity, Clock, Search } from "lucide-react";

const groupKeys = ["A", "B", "C", "D"];

export default function TournamentBrackets({ players, games, tournament, isAnonymous }) {
  const [scoringGame, setScoringGame] = useState(null); // { roundIdx, gameIdx, score1: "", score2: "", isPlayoffs: false, playoffGroup: "" }
  const [errorMsg, setErrorMsg] = useState("");
  const [startingGamePopup, setStartingGamePopup] = useState(null);
  
  // Playoffs tab state: "A" | "B" | "C" | "D"
  const [activePlayoffTab, setActivePlayoffTab] = useState("A");
  const [lines, setLines] = useState([]);
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });
  const [assigningTeamSlot, setAssigningTeamSlot] = useState(null); // { roundIdx, gameIdx, slot }
  const [gameFilter, setGameFilter] = useState("");

  // Recalculate bracket lines when tournament state, active tab, or viewport changes
  useEffect(() => {
    if (!tournament || tournament.status !== "playoffs") return;

    const updateLines = () => {
      const newLines = [];
      const wrapper = document.getElementById("bracket-scroll-wrapper");
      if (!wrapper) return;

      const wrapperRect = wrapper.getBoundingClientRect();
      setSvgSize({ width: wrapperRect.width, height: wrapperRect.height });

      const rounds = tournament.rankedBrackets[activePlayoffTab]?.rounds || [];

      rounds.forEach((round, rIdx) => {
        round.forEach((game) => {
          // Exit dot of game A connects to Entry dot of game B
          if (game.fromGame1Id) {
            const exit1 = document.getElementById(`exit-${game.fromGame1Id}`);
            const entry = document.getElementById(`entry-${game.id}`);
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
            const exit2 = document.getElementById(`exit-${game.fromGame2Id}`);
            const entry = document.getElementById(`entry-${game.id}`);
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

    // Run initial update
    updateLines();

    // Use ResizeObserver to recalculate whenever the bracket container changes size/renders
    const wrapper = document.getElementById("bracket-scroll-wrapper");
    let observer;
    if (wrapper) {
      observer = new ResizeObserver(() => {
        updateLines();
      });
      observer.observe(wrapper);
    }

    // Fallback on window resize
    window.addEventListener("resize", updateLines);

    return () => {
      if (observer) {
        observer.disconnect();
      }
      window.removeEventListener("resize", updateLines);
    };
  }, [tournament, activePlayoffTab, scoringGame]);

  // Reset/Clear active tournament (Save to history)
  // Reset/Clear active tournament (Save to history)
  const handleResetTournament = async () => {
    if (!tournament) return;

    // Helper to calculate winner for a group
    const calculateGroupWinner = (groupBracket) => {
      if (!groupBracket) return null;
      const groupRounds = groupBracket.rounds || [];
      if (groupRounds.length === 0) return null;

      if (groupBracket.isRoundRobin) {
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

        let isFinished = true;
        for (const round of groupRounds) {
          for (const game of round) {
            if (game.score1 === null || game.score2 === null) {
              isFinished = false;
              break;
            }
          }
          if (!isFinished) break;
        }
        if (!isFinished) return null;

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

        stats.sort((a, b) => {
          const diffA = a.pointsScored - a.pointsAgainst;
          const diffB = b.pointsScored - b.pointsAgainst;
          return b.pointsScored - a.pointsScored || diffB - diffA || b.wins - a.wins;
        });

        return stats.length > 0 ? stats[0].team : null;
      } else {
        const finalGame = groupRounds[groupRounds.length - 1][0];
        if (finalGame && finalGame.score1 !== null && finalGame.score2 !== null) {
          return finalGame.score1 > finalGame.score2 ? finalGame.t1 : finalGame.t2;
        }
        return null;
      }
    };

    // Determine if the tournament is fully completed
    let isDone = false;
    let activeGroupsCount = 0;
    let completedGroupsCount = 0;
    const winners = {};

    if (tournament.status === "playoffs" && tournament.rankedBrackets) {
      groupKeys.forEach((group) => {
        const groupBracket = tournament.rankedBrackets[group];
        if (groupBracket && groupBracket.rounds && groupBracket.rounds.length > 0) {
          activeGroupsCount++;
          const champion = calculateGroupWinner(groupBracket);
          if (champion) {
            completedGroupsCount++;
            winners[group] = champion;
          }
        }
      });
      isDone = activeGroupsCount > 0 && completedGroupsCount === activeGroupsCount;
    }

    const confirmMsg = isDone
      ? "Are you sure you want to end this tournament? All results (starting rounds, standings, playoff brackets, and winners) will be archived to Tournament History, and the active tournament will be reset."
      : "WARNING: This tournament is NOT completed yet. If you end it now, your progress will be permanently lost and it will NOT be archived to history. Are you sure you want to reset?";

    if (window.confirm(confirmMsg)) {
      try {
        if (isDone) {
          // Generate user-friendly timestamp
          const dateStr = new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          });

          // Build and save new history entry
          const newEntry = {
            id: tournament.id || "t_" + Date.now(),
            date: dateStr,
            winners: winners,
            tournament: tournament,
            createdAt: new Date().toISOString()
          };

          await db.addTournamentToHistory(newEntry);
          alert("Tournament archived to history successfully!");
        } else {
          alert("Active tournament reset. (Unfinished tournament was not archived to history).");
        }
      } catch (err) {
        console.error("Failed to save tournament to history:", err);
      }

      // Reset states
      await db.saveActiveTournament(null);
      await db.saveMatchSetup({
        selectedPlayerIds: [],
        generatedTeams: [],
        isGenerated: false
      });
      setScoringGame(null);
    }
  };

  // Reset playoffs and return to starting rounds
  const handleResetPlayoffs = async () => {
    if (window.confirm("Are you sure you want to delete all playoff brackets and return to editing the qualifying/starting rounds? All playoff match scores and bracket progress will be lost.")) {
      const updatedTournament = {
        ...tournament,
        status: "starting",
        rankedBrackets: null
      };
      await db.saveActiveTournament(updatedTournament);
      setScoringGame(null);
    }
  };

  const getPitsInUse = () => {
    const inUse = new Set();
    if (!tournament) return inUse;

    if (tournament.status === "starting" && tournament.rounds) {
      tournament.rounds.forEach(round => {
        round.forEach(game => {
          if (game.started && game.score1 === null && game.score2 === null && game.pit) {
            inUse.add(game.pit);
          }
        });
      });
    } else if (tournament.status === "playoffs" && tournament.rankedBrackets) {
      Object.values(tournament.rankedBrackets).forEach(groupBracket => {
        if (groupBracket.rounds) {
          groupBracket.rounds.forEach(round => {
            round.forEach(game => {
              if (game.started && game.score1 === null && game.score2 === null && game.pit) {
                inUse.add(game.pit);
              }
            });
          });
        }
      });
    }
    return inUse;
  };

  // Mark a game as started
  const handleStartGame = async (gameId, isPlayoffs = false, playoffGroup = "", roundIdx = 0, gameIdx = 0) => {
    try {
      const pitsInUse = getPitsInUse();
      let availablePit = null;
      for (let i = 1; i <= 8; i++) {
        if (!pitsInUse.has(i)) {
          availablePit = i;
          break;
        }
      }

      if (availablePit === null) {
        alert("No pits are available right now. Please finish an ongoing game first.");
        return;
      }

      const updatedTournament = { ...tournament };
      let gameToStart = null;

      if (isPlayoffs) {
        const groupBracket = { ...tournament.rankedBrackets[playoffGroup] };
        const updatedRounds = [...groupBracket.rounds];
        const game = { ...updatedRounds[roundIdx][gameIdx] };

        game.started = true;
        game.pit = availablePit;
        updatedRounds[roundIdx][gameIdx] = game;
        gameToStart = game;

        updatedTournament.rankedBrackets = {
          ...tournament.rankedBrackets,
          [playoffGroup]: {
            ...groupBracket,
            rounds: updatedRounds
          }
        };
      } else {
        const updatedRounds = [...tournament.rounds];
        const game = { ...updatedRounds[roundIdx][gameIdx] };

        game.started = true;
        game.pit = availablePit;
        updatedRounds[roundIdx][gameIdx] = game;
        gameToStart = game;

        updatedTournament.rounds = updatedRounds;
      }

      await db.saveActiveTournament(updatedTournament);

      // Determine team names for the popup
      let t1Name = "Team 1";
      let t2Name = "Team 2";
      if (isPlayoffs) {
        t1Name = gameToStart.t1 ? `${gameToStart.t1.p1?.name || "TBD"} & ${gameToStart.t1.p2?.name || "TBD"}` : "TBD";
        t2Name = gameToStart.t2 ? `${gameToStart.t2.p1?.name || "TBD"} & ${gameToStart.t2.p2?.name || "TBD"}` : "TBD";
      } else {
        const t1 = tournament.teams[gameToStart.team1Idx];
        const t2 = tournament.teams[gameToStart.team2Idx];
        if (t1) t1Name = `${t1.p1?.name || ""} & ${t1.p2?.name || ""}`;
        if (t2) t2Name = `${t2.p1?.name || ""} & ${t2.p2?.name || ""}`;
      }

      setStartingGamePopup({
        team1: t1Name,
        team2: t2Name,
        pit: availablePit
      });

    } catch (err) {
      console.error("Failed to start game:", err);
      alert("Failed to start game: " + err.message);
    }
  };

  // Record a score for a game
  const handleRecordScore = (roundIdx, gameIdx, isPlayoffs = false, playoffGroup = "") => {
    const game = isPlayoffs 
      ? tournament.rankedBrackets[playoffGroup].rounds[roundIdx][gameIdx]
      : tournament.rounds[roundIdx][gameIdx];

    setScoringGame({
      roundIdx,
      gameIdx,
      isPlayoffs,
      playoffGroup,
      score1: game.score1 !== null ? String(game.score1) : "",
      score2: game.score2 !== null ? String(game.score2) : ""
    });
    setErrorMsg("");
  };

  // Dynamic Swiss-Style Round Progression
  const processDynamicRoundProgression = async (currentTournament) => {
    if (!currentTournament.rounds) return currentTournament;

    let madeChanges = false;
    const newRounds = [...currentTournament.rounds];
    const numTeams = currentTournament.teams.length;
    
    // We only process if we have an even number of teams and no byes as per rules
    if (numTeams % 2 !== 0) return currentTournament;

    const playedAgainst = Array(numTeams).fill(null).map(() => new Set());
    const gamesCompleted = Array(numTeams).fill(0);
    const gamesAssigned = Array(numTeams).fill(0);

    const stats = Array(numTeams).fill(null).map((_, idx) => ({
      idx,
      wins: 0,
      points: 0,
      differential: 0
    }));

    for (let r = 0; r < newRounds.length; r++) {
      for (let g = 0; g < newRounds[r].length; g++) {
        const game = newRounds[r][g];
        const t1 = game.team1Idx;
        const t2 = game.team2Idx;
        
        gamesAssigned[t1]++;
        gamesAssigned[t2]++;
        playedAgainst[t1].add(t2);
        playedAgainst[t2].add(t1);

        if (game.score1 !== null && game.score2 !== null) {
          gamesCompleted[t1]++;
          gamesCompleted[t2]++;
          
          stats[t1].points += game.score1;
          stats[t2].points += game.score2;
          stats[t1].differential += (game.score1 - game.score2);
          stats[t2].differential += (game.score2 - game.score1);
          
          if (game.score1 > game.score2) stats[t1].wins++;
          else if (game.score2 > game.score1) stats[t2].wins++;
        }
      }
    }

    const maxRounds = Math.min(3, numTeams - 1);

    for (let targetRound = 1; targetRound < maxRounds; targetRound++) {
      const idleTeams = [];
      for (let i = 0; i < numTeams; i++) {
        if (gamesCompleted[i] === targetRound && gamesAssigned[i] === targetRound) {
          idleTeams.push(i);
        }
      }

      if (idleTeams.length >= 2) {
        idleTeams.sort((a, b) => {
          if (stats[a].wins !== stats[b].wins) return stats[b].wins - stats[a].wins;
          if (stats[a].differential !== stats[b].differential) return stats[b].differential - stats[a].differential;
          return stats[b].points - stats[a].points;
        });

        let bestPairs = [];
        const searchPairs = (unmatched, currentPairs) => {
          if (currentPairs.length > bestPairs.length) {
            bestPairs = currentPairs;
          }
          if (unmatched.length < 2) return;
          if (currentPairs.length + Math.floor(unmatched.length / 2) <= bestPairs.length) return;
          
          const t1 = unmatched[0];
          let foundMatch = false;
          for (let i = 1; i < unmatched.length; i++) {
            const t2 = unmatched[i];
            if (!playedAgainst[t1].has(t2)) {
              foundMatch = true;
              const remaining = unmatched.filter(t => t !== t1 && t !== t2);
              searchPairs(remaining, [...currentPairs, [t1, t2]]);
            }
          }
          
          if (!foundMatch) {
            searchPairs(unmatched.slice(1), currentPairs);
          }
        };

        searchPairs(idleTeams, []);

        if (bestPairs.length > 0) {
          if (!newRounds[targetRound]) {
            newRounds[targetRound] = [];
          }
          const newGames = bestPairs.map((pair, idx) => ({
            id: `g_${targetRound}_${pair[0]}_${pair[1]}_${Date.now()}_${idx}`,
            team1Idx: pair[0],
            team2Idx: pair[1],
            score1: null,
            score2: null
          }));

          newRounds[targetRound].push(...newGames);
          madeChanges = true;
          
          for (const game of newGames) {
            gamesAssigned[game.team1Idx]++;
            gamesAssigned[game.team2Idx]++;
            playedAgainst[game.team1Idx].add(game.team2Idx);
            playedAgainst[game.team2Idx].add(game.team1Idx);
          }
        }
      }
    }

    if (madeChanges) {
      return {
        ...currentTournament,
        rounds: newRounds
      };
    }
    return currentTournament;
  };

  // Save game score
  const handleSaveScore = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    const s1 = parseInt(scoringGame.score1, 10);
    const s2 = parseInt(scoringGame.score2, 10);

    if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) {
      setErrorMsg("Please enter valid positive scores.");
      return;
    }

    if (s1 === s2) {
      setErrorMsg("Horseshoes games cannot end in a tie. One team must win.");
      return;
    }

    if (Math.max(s1, s2) !== 21) {
      setErrorMsg("The winning team must have exactly 21 points (e.g. 21 to N).");
      return;
    }

    try {
      const dateStr = new Date().toISOString();

      if (scoringGame.isPlayoffs) {
        // --- Playoff scoring logic ---
        const group = scoringGame.playoffGroup;
        const groupBracket = { ...tournament.rankedBrackets[group] };
        const updatedRounds = [...groupBracket.rounds];
        const game = { ...updatedRounds[scoringGame.roundIdx][scoringGame.gameIdx] };

        const team1 = game.t1;
        const team2 = game.t2;

        game.score1 = s1;
        game.score2 = s2;
        game.winnerIdx = s1 > s2 ? 0 : 1;
        updatedRounds[scoringGame.roundIdx][scoringGame.gameIdx] = game;

        const winningTeam = s1 > s2 ? team1 : team2;

        // Advance winner to the next round if not the finals and not in Round Robin mode
        if (!groupBracket.isRoundRobin && scoringGame.roundIdx < updatedRounds.length - 1) {
          const nextRoundIdx = scoringGame.roundIdx + 1;
          const nextRound = [...updatedRounds[nextRoundIdx]];
          
          let found = false;
          for (let g = 0; g < nextRound.length; g++) {
            const nextGame = { ...nextRound[g] };
            if (nextGame.fromGame1Id === game.id) {
              nextGame.t1 = winningTeam;
              nextRound[g] = nextGame;
              found = true;
              break;
            } else if (nextGame.fromGame2Id === game.id) {
              nextGame.t2 = winningTeam;
              nextRound[g] = nextGame;
              found = true;
              break;
            }
          }

          if (!found) {
            const nextGameIdx = Math.floor(scoringGame.gameIdx / 2);
            const nextSlot = (scoringGame.gameIdx % 2 === 0) ? "t1" : "t2";
            const nextGame = { ...nextRound[nextGameIdx] };
            nextGame[nextSlot] = winningTeam;
            nextRound[nextGameIdx] = nextGame;
          }

          updatedRounds[nextRoundIdx] = nextRound;
        }

        const updatedTournament = {
          ...tournament,
          rankedBrackets: {
            ...tournament.rankedBrackets,
            [group]: {
              ...groupBracket,
              rounds: updatedRounds
            }
          }
        };

        await db.saveActiveTournament(updatedTournament);

        // Sync individual database scores (tg_1_ and tg_2_)
        if (team1 && team2) {
          await syncDatabaseIndividualScores(game.id, team1, team2, s1, s2, dateStr);
        }

      } else {
        // --- Starting round scoring logic ---
        const updatedRounds = [...tournament.rounds];
        const game = { ...updatedRounds[scoringGame.roundIdx][scoringGame.gameIdx] };
        
        const team1 = tournament.teams[game.team1Idx];
        const team2 = tournament.teams[game.team2Idx];

        game.score1 = s1;
        game.score2 = s2;
        updatedRounds[scoringGame.roundIdx][scoringGame.gameIdx] = game;

        let updatedTournament = {
          ...tournament,
          rounds: updatedRounds
        };

        updatedTournament = await processDynamicRoundProgression(updatedTournament);
        await db.saveActiveTournament(updatedTournament);

        if (team1 && team2) {
          await syncDatabaseIndividualScores(game.id, team1, team2, s1, s2, dateStr);
        }
      }

      setScoringGame(null);
    } catch (err) {
      setErrorMsg("Error saving scores: " + err.message);
    }
  };

  // Helper helper to add parallel records in db.js
  const syncDatabaseIndividualScores = async (gameId, team1, team2, s1, s2, dateStr) => {
    // Individual Game 1: P1 vs P3
    if (team1.p1 && team2.p1) {
      await db.addGame({
        id: `tg_1_${gameId}`,
        player1Id: team1.p1.id,
        player2Id: team2.p1.id,
        player1Score: s1,
        player2Score: s2,
        date: dateStr
      });
    }

    // Individual Game 2: P2 vs P4
    if (team1.p2 && team2.p2) {
      await db.addGame({
        id: `tg_2_${gameId}`,
        player1Id: team1.p2.id,
        player2Id: team2.p2.id,
        player1Score: s1,
        player2Score: s2,
        date: dateStr
      });
    }

    // Edge cases for empty/substitute slots:
    if (team1.p1 && !team2.p1 && team2.p2) {
      await db.addGame({
        id: `tg_1_${gameId}`,
        player1Id: team1.p1.id,
        player2Id: team2.p2.id,
        player1Score: s1,
        player2Score: s2,
        date: dateStr
      });
    }
    if (team1.p2 && team2.p1 && !team2.p2) {
      await db.addGame({
        id: `tg_2_${gameId}`,
        player1Id: team1.p2.id,
        player2Id: team2.p1.id,
        player1Score: s1,
        player2Score: s2,
        date: dateStr
      });
    }
  };

  // Compute standings dynamically in real-time
  const getStandings = () => {
    if (!tournament) return [];

    const stats = tournament.teams.map((team, idx) => ({
      index: idx,
      team,
      played: 0,
      wins: 0,
      losses: 0,
      pointsScored: 0,
      pointsAgainst: 0
    }));

    tournament.rounds.forEach((round) => {
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

    // Sort: Points Scored (desc), then Points Diff (desc), then Wins (desc)
    return stats.sort((a, b) => {
      const diffA = a.pointsScored - a.pointsAgainst;
      const diffB = b.pointsScored - b.pointsAgainst;

      return b.pointsScored - a.pointsScored || diffB - diffA || b.wins - a.wins;
    });
  };

  // Check if all starting matches are completed
  const areStartingRoundsComplete = () => {
    if (!tournament || tournament.status === "playoffs") return false;
    
    for (const round of tournament.rounds) {
      for (const game of round) {
        if (game.score1 === null || game.score2 === null) {
          return false;
        }
      }
    }
    return true;
  };

  // Standard tournament pairing order helper
  const getSeedOrder = (size) => {
    let order = [1];
    while (order.length < size) {
      const nextOrder = [];
      const targetSum = order.length * 2 + 1;
      for (const seed of order) {
        nextOrder.push(seed);
        nextOrder.push(targetSum - seed);
      }
      order = nextOrder;
    }
    return order;
  };

  const handleDragStart = (e, teamObj, sourceGroup) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ teamObj, sourceGroup }));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (e, targetGroup) => {
    e.preventDefault();
    const dataStr = e.dataTransfer.getData("application/json");
    if (!dataStr) return;
    try {
      const { teamObj, sourceGroup } = JSON.parse(dataStr);
      if (sourceGroup === targetGroup) return;

      const newAssignments = { ...tournament.playoffAssignments };
      
      newAssignments[sourceGroup] = newAssignments[sourceGroup].filter(
        t => t.team.p1.id !== teamObj.team.p1.id
      );
      
      newAssignments[targetGroup] = [...newAssignments[targetGroup], teamObj];
      newAssignments[targetGroup].sort((a, b) => a.rank - b.rank);

      await db.saveActiveTournament({
        ...tournament,
        playoffAssignments: newAssignments
      });
    } catch (err) {
      console.error("Drop failed", err);
    }
  };

  const handleReviewPlayoffs = async () => {
    const finalStandings = getStandings(); // sorted teams desc
    const T = finalStandings.length;

    if (T < 2) {
      alert("At least 2 teams are required to generate playoffs.");
      return;
    }

    let aSize = 0, bSize = 0, cSize = 0, dSize = 0;
    if (T >= 20) {
      dSize = 5; cSize = 5;
      const rem = T - 10;
      aSize = Math.ceil(rem / 2); bSize = Math.floor(rem / 2);
    } else if (T >= 16) {
      dSize = 4; cSize = 4;
      const rem = T - 8;
      aSize = Math.ceil(rem / 2); bSize = Math.floor(rem / 2);
    } else if (T >= 12) {
      dSize = 0; cSize = 4;
      const rem = T - 4;
      aSize = Math.ceil(rem / 2); bSize = Math.floor(rem / 2);
    } else {
      aSize = Math.ceil(T / 2); bSize = Math.floor(T / 2);
    }

    const sizes = [aSize, bSize, cSize, dSize];
    const playoffAssignments = { A: [], B: [], C: [], D: [] };
    let standingIdx = 0;

    const groupKeys = ["A", "B", "C", "D"];
    groupKeys.forEach((key, kIdx) => {
      const size = sizes[kIdx];
      for (let i = 0; i < size; i++) {
        if (standingIdx < T) {
          playoffAssignments[key].push({
            ...finalStandings[standingIdx],
            rank: standingIdx + 1
          });
          standingIdx++;
        }
      }
    });

    try {
      await db.saveActiveTournament({
        ...tournament,
        status: "adjust_playoffs",
        playoffAssignments
      });
    } catch (err) {
      setErrorMsg("Failed to transition to playoff adjustment.");
      console.error(err);
    }
  };

  // Generate Ranked Single-Elimination Bracket for playoffs
  const handleFinalizePlayoffs = async () => {
    if (!tournament.playoffAssignments) {
      alert("No playoff assignments found.");
      return;
    }

    const playoffGroups = { A: [], B: [], C: [], D: [] };
    const groupKeys = ["A", "B", "C", "D"];
    
    groupKeys.forEach(key => {
      playoffGroups[key] = (tournament.playoffAssignments[key] || []).map(s => s.team);
    });

    const rankedBrackets = {};

    groupKeys.forEach((key) => {
      const groupTeams = playoffGroups[key];
      const N = groupTeams.length;

      if (N === 0) {
        rankedBrackets[key] = { rounds: [] };
        return;
      }

      // Find next power of 2
      const method = db.getBracketMethod();
      const isPowerOf2 = (N & (N - 1)) === 0;

      if (method === "stepladder" && N >= 2) {
        // --- Run Stepladder / Gauntlet Bracket Generation ---
        const bracketRounds = [];

        // Round 0 (Match 1): Seed N plays Seed N-1
        const round0Games = [{
          id: `gp_0_0_${key}_${Date.now()}`,
          t1: groupTeams[N - 1], // Lowest Seed
          t2: groupTeams[N - 2], // Next Lowest Seed
          score1: null,
          score2: null,
          winnerIdx: null,
          fromGame1Id: null,
          fromGame2Id: null,
          isStepladder: true
        }];
        bracketRounds.push(round0Games);

        // Subsequent rounds: Winner of round r-1 plays Seed N - r - 1
        for (let r = 1; r < N - 1; r++) {
          const game = {
            id: `gp_${r}_0_${key}_${Date.now()}`,
            t1: null, // Winner of previous match goes here
            t2: groupTeams[N - r - 2], // Next highest seed (Seed N-r-1)
            score1: null,
            score2: null,
            winnerIdx: null,
            fromGame1Id: bracketRounds[r - 1][0].id,
            fromGame2Id: null,
            isStepladder: true
          };
          bracketRounds.push([game]);
        }

        rankedBrackets[key] = {
          rounds: bracketRounds,
          isStepladder: true
        };
      } else if (method === "round_robin" && N >= 2) {
        // --- Run Round Robin Schedule Generation ---
        const teamsList = [...groupTeams];
        const isOdd = teamsList.length % 2 !== 0;

        if (isOdd) {
          teamsList.push(null); // Add Bye team
        }

        const count = teamsList.length;
        const totalRoundsCount = count - 1;
        const gamesPerRound = count / 2;

        const rrRounds = [];

        for (let r = 0; r < totalRoundsCount; r++) {
          const roundGames = [];
          for (let i = 0; i < gamesPerRound; i++) {
            const home = (r + i) % (count - 1);
            let away = (count - 1 - i + r) % (count - 1);

            if (i === 0) {
              away = count - 1;
            }

            const t1 = teamsList[home];
            const t2 = teamsList[away];

            if (t1 !== null && t2 !== null) {
              roundGames.push({
                id: `gp_rr_${r}_${i}_${key}_${Date.now()}`,
                t1,
                t2,
                score1: null,
                score2: null,
                winnerIdx: null,
                fromGame1Id: null,
                fromGame2Id: null,
                isRoundRobin: true
              });
            }
          }
          if (roundGames.length > 0) {
            rrRounds.push(roundGames);
          }
        }

        rankedBrackets[key] = {
          rounds: rrRounds,
          isRoundRobin: true
        };
      } else if (method === "prelim" && !isPowerOf2 && N > 2) {
        // --- Run Play-In (Preliminary) Bracket Generation ---
        let M = 2;
        if (N >= 4 && N < 8) M = 4;
        else if (N >= 8 && N < 16) M = 8;
        else if (N >= 16) M = 16;

        const P = N - M; // Number of play-in games

        // Round 0 (Play-In Round) has P games
        const round0Games = [];
        for (let i = 0; i < P; i++) {
          const seed1 = M - P + 1 + i;
          const seed2 = N - i;

          const game = {
            id: `gp_0_${i}_${key}_${Date.now()}`,
            t1: groupTeams[seed1 - 1],
            t2: groupTeams[seed2 - 1],
            score1: null,
            score2: null,
            winnerIdx: null,
            fromGame1Id: null,
            fromGame2Id: null,
            isPlayIn: true,
            targetSeed: seed1
          };
          round0Games.push(game);
        }

        // Round 1 (Semifinals / main bracket start) has M/2 games
        const round1Games = [];
        const seedOrder = getSeedOrder(M);

        for (let i = 0; i < M / 2; i++) {
          const s1 = seedOrder[i * 2];
          const s2 = seedOrder[i * 2 + 1];

          // Helper to get team or parent game for a seed slot in Round 1
          const getSlotSource = (seedNum) => {
            if (seedNum <= M - P) {
              return { team: groupTeams[seedNum - 1], fromGameId: null };
            }
            const playInGame = round0Games.find(g => g.targetSeed === seedNum);
            return { team: null, fromGameId: playInGame ? playInGame.id : null };
          };

          const src1 = getSlotSource(s1);
          const src2 = getSlotSource(s2);

          const game = {
            id: `gp_1_${i}_${key}_${Date.now()}`,
            t1: src1.team,
            t2: src2.team,
            score1: null,
            score2: null,
            winnerIdx: null,
            fromGame1Id: src1.fromGameId,
            fromGame2Id: src2.fromGameId
          };
          round1Games.push(game);
        }

        const bracketRounds = [round0Games, round1Games];
        let currentGamesCount = M / 2;
        let rIdx = 2;

        // Build subsequent rounds (Finals, etc.)
        while (currentGamesCount > 1) {
          currentGamesCount = currentGamesCount / 2;
          const roundGames = [];

          for (let i = 0; i < currentGamesCount; i++) {
            const game = {
              id: `gp_${rIdx}_${i}_${key}_${Date.now()}`,
              t1: null,
              t2: null,
              score1: null,
              score2: null,
              winnerIdx: null,
              fromGame1Id: bracketRounds[rIdx - 1][i * 2].id,
              fromGame2Id: bracketRounds[rIdx - 1][i * 2 + 1].id
            };

            // Advance previous round winners automatically
            const prevG1 = bracketRounds[rIdx - 1][i * 2];
            const prevG2 = bracketRounds[rIdx - 1][i * 2 + 1];

            if (prevG1.winnerIdx !== null) {
              game.t1 = prevG1.winnerIdx === 0 ? prevG1.t1 : prevG1.t2;
            }
            if (prevG2.winnerIdx !== null) {
              game.t2 = prevG2.winnerIdx === 0 ? prevG2.t1 : prevG2.t2;
            }

            roundGames.push(game);
          }
          bracketRounds.push(roundGames);
          rIdx++;
        }

        rankedBrackets[key] = {
          rounds: bracketRounds
        };
      } else {
        // --- Run Padded Power-of-Two (BYEs) Bracket Generation (default fallback) ---
        let K = 2;
        if (N > 2 && N <= 4) K = 4;
        else if (N > 4 && N <= 8) K = 8;
        else if (N > 8) K = 16;

        const order = getSeedOrder(K);
        const round0Games = [];

        // Create Round 0 games
        for (let i = 0; i < K / 2; i++) {
          const seed1 = order[i * 2];
          const seed2 = order[i * 2 + 1];

          const t1 = seed1 <= N ? groupTeams[seed1 - 1] : null;
          const t2 = seed2 <= N ? groupTeams[seed2 - 1] : null;

          const game = {
            id: `gp_0_${i}_${key}_${Date.now()}`,
            t1,
            t2,
            score1: null,
            score2: null,
            winnerIdx: null,
            fromGame1Id: null,
            fromGame2Id: null
          };

          // Handle Byes automatically
          if (t1 && !t2) {
            game.score1 = 21;
            game.score2 = 0;
            game.winnerIdx = 0;
          } else if (!t1 && t2) {
            game.score1 = 0;
            game.score2 = 21;
            game.winnerIdx = 1;
          }

          round0Games.push(game);
        }

        const bracketRounds = [round0Games];
        let currentGamesCount = K / 2;

        // Build subsequent rounds (Round 1 to Finals)
        let rIdx = 1;
        while (currentGamesCount > 1) {
          currentGamesCount = currentGamesCount / 2;
          const roundGames = [];

          for (let i = 0; i < currentGamesCount; i++) {
            const game = {
              id: `gp_${rIdx}_${i}_${key}_${Date.now()}`,
              t1: null,
              t2: null,
              score1: null,
              score2: null,
              winnerIdx: null,
              fromGame1Id: bracketRounds[rIdx - 1][i * 2].id,
              fromGame2Id: bracketRounds[rIdx - 1][i * 2 + 1].id
            };

            // Advance previous round winners/byes automatically
            const prevG1 = bracketRounds[rIdx - 1][i * 2];
            const prevG2 = bracketRounds[rIdx - 1][i * 2 + 1];

            if (prevG1.winnerIdx !== null) {
              game.t1 = prevG1.winnerIdx === 0 ? prevG1.t1 : prevG1.t2;
            }
            if (prevG2.winnerIdx !== null) {
              game.t2 = prevG2.winnerIdx === 0 ? prevG2.t1 : prevG2.t2;
            }

            // Handle Byes again in subsequent rounds if necessary
            if (game.t1 && !game.t2 && prevG2.t1 === null && prevG2.t2 === null) {
              game.score1 = 21;
              game.score2 = 0;
              game.winnerIdx = 0;
            }

            roundGames.push(game);
          }
          bracketRounds.push(roundGames);
          rIdx++;
        }

        rankedBrackets[key] = {
          rounds: bracketRounds
        };
      }
    });

    const updatedTournament = {
      ...tournament,
      status: "playoffs",
      rankedBrackets,
      playoffAssignments: null
    };

    await db.saveActiveTournament(updatedTournament);
  };

  if (!tournament) {
    if (isAnonymous) {
      return (
        <div className="glass-panel" style={{ textAlign: "center", padding: "60px 20px" }}>
          <Trophy size={64} style={{ color: "var(--text-secondary)", opacity: 0.3, marginBottom: "16px" }} />
          <h2 style={{ fontSize: "22px", fontWeight: "700", marginBottom: "8px" }}>The Tournament has not yet started.</h2>
          <p style={{ color: "var(--text-secondary)", maxWidth: "500px", margin: "0 auto 24px auto" }}>
            Please check back once the tournament organizer has generated the match schedule.
          </p>
        </div>
      );
    }

    return (
      <div className="glass-panel" style={{ textAlign: "center", padding: "60px 20px" }}>
        <Trophy size={64} style={{ color: "var(--text-secondary)", opacity: 0.3, marginBottom: "16px" }} />
        <h2 style={{ fontSize: "22px", fontWeight: "700", marginBottom: "8px" }}>No Active Tournament</h2>
        <p style={{ color: "var(--text-secondary)", maxWidth: "500px", margin: "0 auto 24px auto" }}>
          Generate your teams under the <strong>Teams</strong> tab, then click the <strong>Build Match with These Teams</strong> button to generate your 3-round starting bracket.
        </p>
      </div>
    );
  }

  const standings = getStandings();
  const showPlayoffButton = areStartingRoundsComplete() && tournament.status === "starting";
  const isAdjustingPlayoffs = tournament.status === "adjust_playoffs";
  const isPlayoffs = tournament.status === "playoffs" && tournament.rankedBrackets;

  const renderGameCard = (game, rIdx, gIdx, rounds) => {
    const team1 = game.t1;
    const team2 = game.t2;
    const isScored = game.score1 !== null && game.score2 !== null;
    const isRecording = scoringGame?.roundIdx === rIdx && scoringGame?.gameIdx === gIdx && scoringGame.isPlayoffs && scoringGame.playoffGroup === activePlayoffTab;

    const t1Wins = isScored && game.score1 > game.score2;
    const t2Wins = isScored && game.score2 > game.score1;

    return (
      <div 
        className="bracket-match-wrapper"
        style={{ position: "relative", width: "280px", flexShrink: 0 }}
      >
        {/* Left connection entry dot (if not Round 0) */}
        {rIdx > 0 && (
          <div 
            id={`entry-${game.id}`} 
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

        {/* Right connection exit dot (if not Finals) */}
        {rIdx < rounds.length - 1 && (
          <div 
            id={`exit-${game.id}`} 
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

        {/* Game Scorecard Card */}
        <div 
          className="glass-panel" 
          style={{ 
            width: "100%", 
            padding: "8px 10px", 
            background: "var(--bg-secondary)", 
            border: isScored ? "2px solid var(--success-color)" : (game.started ? "2px solid #eab308" : "1px solid var(--border-color)"),
            boxShadow: "var(--shadow-sm)"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase", fontWeight: "700" }}>
            <span>Match {gIdx + 1}</span>
            {isScored ? (
              <span style={{ color: "var(--success-color)", fontWeight: "700", fontSize: "13px" }}>Scored</span>
            ) : (game.started ? (
              <span style={{ color: "#eab308", fontWeight: "700", fontSize: "13px" }}>
                IN PROGRESS {game.pit && `(Pit ${game.pit})`}
              </span>
            ) : null)}
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
                background: t1Wins ? "rgba(16, 185, 129, 0.08)" : "var(--bg-primary)"
              }}
            >
              {team1 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: t1Wins ? "700" : "500", color: t1Wins ? "var(--text-primary)" : "var(--text-secondary)" }}>
                      {team1.p1?.name || "Empty Slot"}
                    </span>
                    {/* Rank Badge Removed */}
                  </div>
                  {team1.p2 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "12px", fontWeight: t1Wins ? "700" : "500", color: t1Wins ? "var(--text-primary)" : "var(--text-secondary)" }}>
                        {team1.p2.name}
                      </span>
                      {/* Rank Badge Removed */}
                    </div>
                  )}
                </div>
              ) : (
                <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontStyle: rIdx === 0 ? "normal" : "italic", fontWeight: rIdx === 0 ? "700" : "500", letterSpacing: rIdx === 0 ? "0.5px" : "normal" }}>
                  {rIdx === 0 ? "BYE" : "Waiting for Winner"}
                </span>
              )}

              {isScored && !isRecording && (
                <span style={{ fontSize: "16px", fontWeight: "800", color: t1Wins ? "var(--success-color)" : "var(--text-secondary)" }}>
                  {game.score1}
                </span>
              )}
            </div>

            {/* VS Separator */}
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
                background: t2Wins ? "rgba(16, 185, 129, 0.08)" : "var(--bg-primary)"
              }}
            >
              {team2 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: t2Wins ? "700" : "500", color: t2Wins ? "var(--text-primary)" : "var(--text-secondary)" }}>
                      {team2.p1?.name || "Empty Slot"}
                    </span>
                    {/* Rank Badge Removed */}
                  </div>
                  {team2.p2 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "12px", fontWeight: t2Wins ? "700" : "500", color: t2Wins ? "var(--text-primary)" : "var(--text-secondary)" }}>
                        {team2.p2.name}
                      </span>
                      {/* Rank Badge Removed */}
                    </div>
                  )}
                </div>
              ) : (
                <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontStyle: rIdx === 0 ? "normal" : "italic", fontWeight: rIdx === 0 ? "700" : "500", letterSpacing: rIdx === 0 ? "0.5px" : "normal" }}>
                  {rIdx === 0 ? "BYE" : "Waiting for Winner"}
                </span>
              )}

              {isScored && !isRecording && (
                <span style={{ fontSize: "16px", fontWeight: "800", color: t2Wins ? "var(--success-color)" : "var(--text-secondary)" }}>
                  {game.score2}
                </span>
              )}
            </div>
          </div>

          {/* Playoff scoring input controls */}
          {!isAnonymous && (isRecording ? (
            <form onSubmit={handleSaveScore} style={{ borderTop: "1px solid var(--border-color)", paddingTop: "6px", marginTop: "4px" }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                <input 
                  type="number" 
                  className="form-input" 
                  placeholder="T1 Score" 
                  value={scoringGame.score1} 
                  onChange={(e) => setScoringGame({ ...scoringGame, score1: e.target.value })}
                  style={{ padding: "4px 8px", fontSize: "12px", flex: 1 }}
                  min="0"
                  required
                />
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>-</span>
                <input 
                  type="number" 
                  className="form-input" 
                  placeholder="T2 Score" 
                  value={scoringGame.score2} 
                  onChange={(e) => setScoringGame({ ...scoringGame, score2: e.target.value })}
                  style={{ padding: "4px 8px", fontSize: "12px", flex: 1 }}
                  min="0"
                  required
                />
              </div>

              {errorMsg && (
                <div style={{ color: "var(--danger-color)", fontSize: "11px", marginBottom: "8px" }}>
                  {errorMsg}
                </div>
              )}

              <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-secondary" style={{ padding: "3px 6px", fontSize: "11px" }} onClick={() => setScoringGame(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ padding: "3px 8px", fontSize: "11px" }}>
                  Save
                </button>
              </div>
            </form>
          ) : (
            team1 && team2 && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
                {!isScored && !game.started && !isAnonymous && (
                  <button 
                    type="button" 
                    className="btn btn-primary" 
                    style={{ padding: "3px 8px", fontSize: "11px", backgroundColor: "var(--success-color)", borderColor: "var(--success-color)", color: "#ffffff", marginRight: "6px" }}
                    onClick={() => handleStartGame(game.id, true, activePlayoffTab, rIdx, gIdx)}
                  >
                    Start
                  </button>
                )}
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ padding: "3px 6px", fontSize: "11px", gap: "4px" }}
                  onClick={() => handleRecordScore(rIdx, gIdx, true, activePlayoffTab)}
                >
                  <Play size={10} style={{ fill: "currentColor" }} />
                  {isScored ? "Edit Score" : "Record Score"}
                </button>
              </div>
            )
          ))}
        </div>
      </div>
    );
  };
  const handleClearSchedule = async (groupKey) => {
    if (!window.confirm("Are you sure you want to clear all games? This cannot be undone.")) return;
    try {
      const updatedTournament = { ...tournament };
      if (groupKey === "MAIN") {
        updatedTournament.rounds = [];
      } else {
        updatedTournament.rankedBrackets = {
          ...tournament.rankedBrackets,
          [groupKey]: {
            ...tournament.rankedBrackets[groupKey],
            rounds: []
          }
        };
      }
      await db.saveActiveTournament(updatedTournament);
    } catch (err) {
      setErrorMsg("Failed to clear schedule.");
      console.error(err);
    }
  };

  const handleAddRound = async (groupKey) => {
    try {
      const updatedTournament = { ...tournament };
      if (groupKey === "MAIN") {
        updatedTournament.rounds = [...(updatedTournament.rounds || []), []];
      } else {
        const currentBracket = updatedTournament.rankedBrackets[groupKey] || { isRoundRobin: true, rounds: [] };
        const currentRounds = currentBracket.rounds || [];
        updatedTournament.rankedBrackets = {
          ...tournament.rankedBrackets,
          [groupKey]: { ...currentBracket, rounds: [...currentRounds, []] }
        };
      }
      await db.saveActiveTournament(updatedTournament);
    } catch (err) {
      setErrorMsg("Failed to add round.");
      console.error(err);
    }
  };

  const handleAddGame = async (groupKey, roundIdx) => {
    try {
      const updatedTournament = { ...tournament };
      if (groupKey === "MAIN") {
        const newGame = {
          id: `gp_main_manual_${roundIdx}_${Date.now()}`,
          team1Idx: null,
          team2Idx: null,
          score1: null,
          score2: null,
          winnerIdx: null
        };
        const updatedRounds = [...updatedTournament.rounds];
        updatedRounds[roundIdx] = [...updatedRounds[roundIdx], newGame];
        updatedTournament.rounds = updatedRounds;
      } else {
        const currentBracket = updatedTournament.rankedBrackets[groupKey];
        const updatedRounds = [...currentBracket.rounds];
        const newGame = {
          id: `gp_rr_manual_${roundIdx}_${Date.now()}`,
          t1: null,
          t2: null,
          score1: null,
          score2: null,
          winnerIdx: null,
          fromGame1Id: null,
          fromGame2Id: null,
          isRoundRobin: true
        };
        updatedRounds[roundIdx] = [...updatedRounds[roundIdx], newGame];
        updatedTournament.rankedBrackets = {
          ...tournament.rankedBrackets,
          [groupKey]: { ...currentBracket, rounds: updatedRounds }
        };
      }
      await db.saveActiveTournament(updatedTournament);
    } catch (err) {
      setErrorMsg("Failed to add game.");
      console.error(err);
    }
  };

  const handleRemoveGame = async (groupKey, roundIdx, gameIdx) => {
    if (!window.confirm("Remove this game?")) return;
    try {
      const updatedTournament = { ...tournament };
      if (groupKey === "MAIN") {
        const updatedRounds = [...updatedTournament.rounds];
        updatedRounds[roundIdx] = updatedRounds[roundIdx].filter((_, i) => i !== gameIdx);
        updatedTournament.rounds = updatedRounds;
      } else {
        const currentBracket = updatedTournament.rankedBrackets[groupKey];
        const updatedRounds = [...currentBracket.rounds];
        updatedRounds[roundIdx] = updatedRounds[roundIdx].filter((_, i) => i !== gameIdx);
        updatedTournament.rankedBrackets = {
          ...tournament.rankedBrackets,
          [groupKey]: { ...currentBracket, rounds: updatedRounds }
        };
      }
      await db.saveActiveTournament(updatedTournament);
    } catch (err) {
      setErrorMsg("Failed to remove game.");
      console.error(err);
    }
  };

  const handleAssignTeam = async (team, explicitIdx = null) => {
    if (!assigningTeamSlot) return;
    const { groupKey, roundIdx, gameIdx, slot } = assigningTeamSlot;
    try {
      const updatedTournament = { ...tournament };
      if (groupKey === "MAIN") {
        let teamIdx = explicitIdx;
        if (teamIdx === null || teamIdx === undefined || teamIdx < 0) {
          teamIdx = tournament.teams.findIndex(t => 
            t === team || 
            (Boolean(team?.id) && Boolean(t?.id) && t.id === team.id) || 
            (t.p1?.name === team?.p1?.name && (t.p2?.name || "") === (team?.p2?.name || ""))
          );
        }
        const updatedRounds = [...updatedTournament.rounds];
        const game = { ...updatedRounds[roundIdx][gameIdx] };
        game[slot] = teamIdx >= 0 ? teamIdx : null;
        updatedRounds[roundIdx][gameIdx] = game;
        updatedTournament.rounds = updatedRounds;
      } else {
        const currentBracket = updatedTournament.rankedBrackets[groupKey];
        const updatedRounds = [...currentBracket.rounds];
        const game = { ...updatedRounds[roundIdx][gameIdx] };
        game[slot] = team;
        updatedRounds[roundIdx][gameIdx] = game;
        updatedTournament.rankedBrackets = {
          ...tournament.rankedBrackets,
          [groupKey]: { ...currentBracket, rounds: updatedRounds }
        };
      }
      await db.saveActiveTournament(updatedTournament);
      setAssigningTeamSlot(null);
    } catch (err) {
      setErrorMsg("Failed to assign team.");
      console.error(err);
    }
  };

  const handleRemoveTeam = async (groupKey, roundIdx, gameIdx, slot) => {
    try {
      const updatedTournament = { ...tournament };
      if (groupKey === "MAIN") {
        const updatedRounds = [...updatedTournament.rounds];
        const game = { ...updatedRounds[roundIdx][gameIdx] };
        game[slot] = null;
        updatedRounds[roundIdx][gameIdx] = game;
        updatedTournament.rounds = updatedRounds;
      } else {
        const currentBracket = updatedTournament.rankedBrackets[groupKey];
        const updatedRounds = [...currentBracket.rounds];
        const game = { ...updatedRounds[roundIdx][gameIdx] };
        game[slot] = null;
        updatedRounds[roundIdx][gameIdx] = game;
        updatedTournament.rankedBrackets = {
          ...tournament.rankedBrackets,
          [groupKey]: { ...currentBracket, rounds: updatedRounds }
        };
      }
      await db.saveActiveTournament(updatedTournament);
    } catch (err) {
      setErrorMsg("Failed to remove team.");
      console.error(err);
    }
  };


  const pitsInUseSet = getPitsInUse();

  const allMainGames = [];
  if (!isPlayoffs && tournament.rounds) {
    tournament.rounds.forEach((round, rIdx) => {
      round.forEach((game, gIdx) => {
        const isScored = game.score1 !== null && game.score2 !== null;
        const isRecording = scoringGame?.roundIdx === rIdx && scoringGame?.gameIdx === gIdx && !scoringGame.isPlayoffs;
        allMainGames.push({
          ...game,
          rIdx,
          gIdx,
          isScored,
          isRecording
        });
      });
    });
  }

  const matchesFilter = (gameObj) => {
    if (!gameFilter) return true;
    const q = gameFilter.toLowerCase();
    const t1 = tournament.teams[gameObj.team1Idx];
    const t2 = tournament.teams[gameObj.team2Idx];
    const n1 = t1?.p1?.name || "";
    const n2 = t1?.p2?.name || "";
    const n3 = t2?.p1?.name || "";
    const n4 = t2?.p2?.name || "";
    return n1.toLowerCase().includes(q) || n2.toLowerCase().includes(q) || n3.toLowerCase().includes(q) || n4.toLowerCase().includes(q);
  };

  const inProgressGames = allMainGames.filter(g => !g.isScored && g.started && matchesFilter(g));
  const completedGames = allMainGames.filter(g => g.isScored && matchesFilter(g));
  const availableGames = allMainGames.filter(g => !g.isScored && !g.started && matchesFilter(g));

  const renderMainGameCard = (gameObj) => {
    const { rIdx, gIdx, isScored, isRecording } = gameObj;
    const game = gameObj;
    const team1 = tournament.teams[game.team1Idx];
    const team2 = tournament.teams[game.team2Idx];
    const t1Wins = isScored && game.score1 > game.score2;
    const t2Wins = isScored && game.score2 > game.score1;

    return (
      <div 
        key={game.id}
        style={{
          padding: "12px 14px",
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-sm)",
          border: isScored ? "2px solid var(--success-color)" : (game.started ? "2px solid #eab308" : "1px solid var(--border-color)"),
          display: "flex",
          flexDirection: "column",
          gap: "10px"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" }}>
            Round {rIdx + 1} - Match {gIdx + 1}
          </span>
          
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {isScored && !isRecording ? (
              <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", color: "var(--success-color)", fontWeight: "700" }}>
                <CheckCircle size={14} /> Scored
              </span>
            ) : (!isScored && game.started && (
              <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", color: "#eab308", fontWeight: "700" }}>
                IN PROGRESS {game.pit ? `(Pit #${game.pit})` : ""}
              </span>
            ))}
            {!isAnonymous && (
              <button 
                type="button" 
                className="btn-icon-only danger"
                onClick={() => handleRemoveGame("MAIN", rIdx, gIdx)}
                title="Remove Game"
                style={{ padding: "4px" }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
          {assigningTeamSlot?.groupKey === "MAIN" && assigningTeamSlot?.roundIdx === rIdx && assigningTeamSlot?.gameIdx === gIdx && assigningTeamSlot?.slot === "team1Idx" ? (
            <div style={{ width: "100%", padding: "6px", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-secondary)" }}>Select Team:</span>
                <button type="button" onClick={() => setAssigningTeamSlot(null)} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "11px" }}>Cancel</button>
              </div>
              <div style={{ maxHeight: "150px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
                {tournament.teams.map((t, tIdx) => (
                  <button 
                    key={tIdx}
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: "4px 8px", fontSize: "12px", width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                    onClick={() => handleAssignTeam(t, tIdx)}
                  >
                    <span>{t.p1?.name}{t.p2 ? ` & ${t.p2.name}` : ""}</span>
                    <UserPlus size={12} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div 
              style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                border: t1Wins ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid var(--border-color)",
                padding: "10px 14px",
                borderRadius: "var(--radius-sm)",
                background: t1Wins ? "rgba(16, 185, 129, 0.08)" : "var(--bg-primary)"
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "15px", fontWeight: t1Wins ? "700" : "500" }}>
                  <span style={{ color: t1Wins ? "var(--text-primary)" : "var(--text-secondary)" }}>{team1?.p1?.name || "Empty Slot"}</span>
                </div>
                {team1?.p2 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "15px", fontWeight: t1Wins ? "700" : "500" }}>
                    <span style={{ color: t1Wins ? "var(--text-primary)" : "var(--text-secondary)" }}>{team1.p2.name}</span>
                  </div>
                )}
                {!isAnonymous && !isScored && (
                  <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                    <button type="button" onClick={() => setAssigningTeamSlot({ groupKey: "MAIN", roundIdx: rIdx, gameIdx: gIdx, slot: "team1Idx" })} style={{ fontSize: "11px", background: "none", border: "none", color: "var(--accent-color)", cursor: "pointer", padding: 0 }}>Change Team</button>
                    {team1 && <button type="button" onClick={() => handleRemoveTeam("MAIN", rIdx, gIdx, "team1Idx")} style={{ fontSize: "11px", background: "none", border: "none", color: "var(--danger-color)", cursor: "pointer", padding: 0 }}>Remove</button>}
                  </div>
                )}
              </div>
              {isScored && !isRecording && (
                <span style={{ fontSize: "22px", fontWeight: "800", color: t1Wins ? "var(--success-color)" : "var(--text-secondary)" }}>
                  {game.score1}
                </span>
              )}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", margin: "2px 0" }}>
            <div style={{ flex: 1, borderTop: "1px dashed var(--border-color)", opacity: 0.3 }}></div>
            <span style={{ padding: "0 10px", fontSize: "11px", color: "var(--text-secondary)", fontWeight: "700", letterSpacing: "1px" }}>VS</span>
            <div style={{ flex: 1, borderTop: "1px dashed var(--border-color)", opacity: 0.3 }}></div>
          </div>

          {assigningTeamSlot?.groupKey === "MAIN" && assigningTeamSlot?.roundIdx === rIdx && assigningTeamSlot?.gameIdx === gIdx && assigningTeamSlot?.slot === "team2Idx" ? (
            <div style={{ width: "100%", padding: "6px", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-secondary)" }}>Select Team:</span>
                <button type="button" onClick={() => setAssigningTeamSlot(null)} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "11px" }}>Cancel</button>
              </div>
              <div style={{ maxHeight: "150px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
                {tournament.teams.map((t, tIdx) => (
                  <button 
                    key={tIdx}
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: "4px 8px", fontSize: "12px", width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                    onClick={() => handleAssignTeam(t, tIdx)}
                  >
                    <span>{t.p1?.name}{t.p2 ? ` & ${t.p2.name}` : ""}</span>
                    <UserPlus size={12} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div 
              style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                border: t2Wins ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid var(--border-color)",
                padding: "10px 14px",
                borderRadius: "var(--radius-sm)",
                background: t2Wins ? "rgba(16, 185, 129, 0.08)" : "var(--bg-primary)"
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "15px", fontWeight: t2Wins ? "700" : "500" }}>
                  <span style={{ color: t2Wins ? "var(--text-primary)" : "var(--text-secondary)" }}>{team2?.p1?.name || "Empty Slot"}</span>
                </div>
                {team2?.p2 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "15px", fontWeight: t2Wins ? "700" : "500" }}>
                    <span style={{ color: t2Wins ? "var(--text-primary)" : "var(--text-secondary)" }}>{team2.p2.name}</span>
                  </div>
                )}
                {!isAnonymous && !isScored && (
                  <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                    <button type="button" onClick={() => setAssigningTeamSlot({ groupKey: "MAIN", roundIdx: rIdx, gameIdx: gIdx, slot: "team2Idx" })} style={{ fontSize: "11px", background: "none", border: "none", color: "var(--accent-color)", cursor: "pointer", padding: 0 }}>Change Team</button>
                    {team2 && <button type="button" onClick={() => handleRemoveTeam("MAIN", rIdx, gIdx, "team2Idx")} style={{ fontSize: "11px", background: "none", border: "none", color: "var(--danger-color)", cursor: "pointer", padding: 0 }}>Remove</button>}
                  </div>
                )}
              </div>
              {isScored && !isRecording && (
                <span style={{ fontSize: "22px", fontWeight: "800", color: t2Wins ? "var(--success-color)" : "var(--text-secondary)" }}>
                  {game.score2}
                </span>
              )}
            </div>
          )}
        </div>

        {!isAnonymous && (isRecording ? (
          <form onSubmit={(e) => handleSaveScore(e, "MAIN")} style={{ borderTop: "1px solid var(--border-color)", paddingTop: "10px", marginTop: "4px" }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "8px" }}>
              <div style={{ flex: 1 }}>
                <input 
                  type="number" 
                  className="form-input" 
                  placeholder="Team 1 Score" 
                  value={scoringGame.score1} 
                  onChange={(e) => setScoringGame({ ...scoringGame, score1: e.target.value })}
                  style={{ padding: "6px 10px", fontSize: "13px" }}
                  min="0"
                  required
                />
              </div>
              <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>-</span>
              <div style={{ flex: 1 }}>
                <input 
                  type="number" 
                  className="form-input" 
                  placeholder="Team 2 Score" 
                  value={scoringGame.score2} 
                  onChange={(e) => setScoringGame({ ...scoringGame, score2: e.target.value })}
                  style={{ padding: "6px 10px", fontSize: "13px" }}
                  min="0"
                  required
                />
              </div>
            </div>

            {errorMsg && (
              <div style={{ color: "var(--danger-color)", fontSize: "12px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "4px" }}>
                <AlertCircle size={12} />
                <span>{errorMsg}</span>
              </div>
            )}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" style={{ padding: "4px 8px", fontSize: "12px" }} onClick={() => setScoringGame(null)}>
                <X size={12} /> Cancel
              </button>
              <button type="submit" className="btn btn-primary" style={{ padding: "4px 10px", fontSize: "12px" }}>
                <Save size={12} /> Save Score
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
            {!isScored && !game.started && !isAnonymous && (
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ padding: "5px 12px", fontSize: "12px", backgroundColor: "var(--success-color)", borderColor: "var(--success-color)", color: "#ffffff", marginRight: "8px" }}
                onClick={() => handleStartGame(game.id, false, "", rIdx, gIdx)}
              >
                Start
              </button>
            )}
            <button 
              type="button" 
              className="btn btn-secondary" 
              style={{ padding: "5px 12px", fontSize: "12px", gap: "6px" }}
              onClick={() => handleRecordScore(rIdx, gIdx, false)}
            >
              <Play size={12} style={{ fill: "currentColor" }} />
              {isScored ? "Edit Score" : "Record Score"}
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      {startingGamePopup && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div className="glass-panel" style={{ width: "90%", maxWidth: "400px", textAlign: "center", padding: "30px", background: "var(--bg-primary)" }}>
            <h2 style={{ color: "var(--success-color)", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              <Play size={24} style={{ fill: "currentColor" }} /> Game Starting!
            </h2>
            <div style={{ fontSize: "18px", fontWeight: "700", marginBottom: "8px" }}>{startingGamePopup.team1}</div>
            <div style={{ color: "var(--text-secondary)", marginBottom: "8px", fontSize: "12px", fontWeight: "700" }}>VS</div>
            <div style={{ fontSize: "18px", fontWeight: "700", marginBottom: "24px" }}>{startingGamePopup.team2}</div>
            <div style={{ padding: "15px", backgroundColor: "var(--bg-secondary)", borderRadius: "8px", border: "2px solid var(--accent-color)", marginBottom: "24px" }}>
              <span style={{ fontSize: "14px", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>Please proceed to</span>
              <span style={{ fontSize: "32px", fontWeight: "800", color: "var(--accent-color)" }}>Pit #{startingGamePopup.pit}</span>
            </div>
            <button className="btn btn-primary" style={{ width: "100%", padding: "12px", fontSize: "16px" }} onClick={() => setStartingGamePopup(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h2 className="page-title" style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "0" }}>
            <Award size={24} /> 
            {isPlayoffs 
              ? "Tournament Playoffs (Single Elimination)" 
              : "Starting Bracket & Rounds"}
          </h2>
          <p className="page-subtitle" style={{ marginBottom: "0" }}>
            {isPlayoffs
              ? "Drawn paper-style playoff brackets with dynamically advancing brackets."
              : (isAnonymous ? "Qualifying starting rounds." : "Score matches and complete all 3 rounds to unlock playoffs.")}
          </p>
        </div>
        {!isAnonymous && (
          <div style={{ display: "flex", gap: "10px" }}>
            {isPlayoffs && (
              <button type="button" className="btn btn-secondary" onClick={handleResetPlayoffs}>
                <RotateCcw size={16} /> Reset Playoffs
              </button>
            )}
            <button type="button" className="btn btn-danger" onClick={handleResetTournament}>
              <RotateCcw size={16} /> End Tournament
            </button>
          </div>
        )}
      </div>

      {isAdjustingPlayoffs ? (
        /* ================= ADJUST PLAYOFFS VIEW ================= */
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div className="glass-panel" style={{ padding: "20px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Trophy size={20} style={{ color: "var(--gold-color)" }} />
              Review Playoff Divisions
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "16px" }}>
              Teams have been assigned to divisions based on their final standings. You can drag and drop teams between divisions to adjust the sizes or override assignments before finalizing.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-primary" onClick={handleFinalizePlayoffs} style={{ gap: "8px" }}>
                <CheckCircle size={16} /> Finalize and Generate Brackets
              </button>
            </div>
          </div>
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
            {["A", "B", "C", "D"].map(group => (
              <div 
                key={group} 
                className="glass-panel"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, group)}
                style={{ display: "flex", flexDirection: "column", gap: "12px", minHeight: "300px" }}
              >
                <h3 style={{ fontSize: "16px", fontWeight: "700", textAlign: "center", paddingBottom: "12px", borderBottom: "2px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{group} DIVISION</span>
                  <span style={{ fontSize: "12px", background: "var(--bg-secondary)", padding: "2px 8px", borderRadius: "10px", color: "var(--text-secondary)" }}>
                    {tournament.playoffAssignments?.[group]?.length || 0} teams
                  </span>
                </h3>
                
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
                  {(tournament.playoffAssignments?.[group] || []).map((tObj) => (
                    <div 
                      key={tObj.team.p1.id}
                      draggable={!isAnonymous}
                      onDragStart={(e) => handleDragStart(e, tObj, group)}
                      style={{ 
                        padding: "10px", 
                        background: "var(--bg-primary)", 
                        border: "1px solid var(--border-color)", 
                        borderRadius: "var(--radius-sm)",
                        cursor: isAnonymous ? "default" : "grab",
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)" }}>Rank #{tObj.rank}</span>
                        <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--accent-color)" }}>
                          {tObj.pointsScored}:{tObj.pointsAgainst}
                        </span>
                      </div>
                      <div style={{ fontWeight: "600", fontSize: "14px" }}>
                        {tObj.team.p1?.name} & {tObj.team.p2?.name}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                        {tObj.wins}W - {tObj.losses}L
                      </div>
                    </div>
                  ))}
                  {(!tournament.playoffAssignments?.[group] || tournament.playoffAssignments?.[group].length === 0) && (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", border: "2px dashed var(--border-color)", borderRadius: "var(--radius-sm)", color: "var(--text-secondary)", fontSize: "12px", padding: "20px", textAlign: "center" }}>
                      Drag teams here
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : !isPlayoffs ? (
        /* ================= STARTING BRACKETS VIEW ================= */
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Search Filter */}
          <div style={{ display: "flex", alignItems: "center", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", padding: "0 14px", height: "44px" }}>
            <Search size={18} style={{ color: "var(--text-secondary)", marginRight: "10px" }} />
            <input 
              type="text" 
              placeholder="Filter matches by player name..." 
              value={gameFilter}
              onChange={(e) => setGameFilter(e.target.value)}
              style={{ background: "transparent", border: "none", color: "var(--text-primary)", flex: 1, outline: "none", fontSize: "15px" }}
            />
            {gameFilter && (
              <X size={16} style={{ cursor: "pointer", color: "var(--text-secondary)" }} onClick={() => setGameFilter("")} />
            )}
          </div>

          <div className="dashboard-grid">
          {/* Left Column: Active & Completed Games */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {showPlayoffButton && (
              <div 
                style={{ 
                  padding: "16px 20px", 
                  background: "rgba(16, 185, 129, 0.08)", 
                  border: "1px solid rgba(16, 185, 129, 0.3)", 
                  borderRadius: "var(--radius-md)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "14px"
                }}
              >
                <div>
                  <h4 style={{ color: "var(--success-color)", fontSize: "16px", fontWeight: "700", margin: "0 0 4px 0" }}>All Matches Complete!</h4>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0 }}>Starting rounds finished. You can now generate the single elimination playoffs.</p>
                </div>
                {!isAnonymous && (
                  <button type="button" className="btn btn-primary" style={{ gap: "8px" }} onClick={handleReviewPlayoffs}>
                    <Trophy size={16} /> Generate Playoffs Brackets <ArrowRight size={16} />
                  </button>
                )}
              </div>
            )}

            {!isAnonymous && (
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginBottom: "8px" }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => handleAddRound("MAIN")}
                  style={{ fontSize: "13px", padding: "6px 12px" }}
                >
                  + Add Round
                </button>
                <button 
                  type="button" 
                  className="btn btn-danger" 
                  onClick={() => handleClearSchedule("MAIN")}
                  style={{ fontSize: "13px", padding: "6px 12px" }}
                >
                  <RotateCcw size={14} /> Clear Schedule
                </button>
              </div>
            )}

            {/* In Progress Games */}
            <div className="glass-panel">
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "16px", fontWeight: "700", marginBottom: "16px", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
                <Activity size={18} style={{ color: "#eab308" }} />
                In Progress Matches
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {inProgressGames.map(renderMainGameCard)}
                {inProgressGames.length === 0 && (
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontStyle: "italic", textAlign: "center", margin: "20px 0" }}>
                    No games currently in progress.
                  </p>
                )}
              </div>
            </div>

            {/* Completed Games */}
            <div className="glass-panel">
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "16px", fontWeight: "700", marginBottom: "16px", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
                <CheckCircle size={18} style={{ color: "var(--success-color)" }} />
                Completed Matches
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {completedGames.map(renderMainGameCard)}
                {completedGames.length === 0 && (
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontStyle: "italic", textAlign: "center", margin: "20px 0" }}>
                    No completed matches yet.
                  </p>
                )}
              </div>
            </div>

            {/* Byes (optional) */}
            {tournament.byes && tournament.byes.some(b => b) && (
              <div className="glass-panel">
                <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "16px", fontWeight: "700", marginBottom: "16px", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
                  <Calendar size={18} style={{ color: "var(--accent-color)" }} />
                  Byes
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {tournament.byes.map((byeTeam, rIdx) => byeTeam && (
                    <div 
                      key={rIdx}
                      style={{ 
                        padding: "8px 12px", 
                        background: "rgba(99, 102, 241, 0.06)", 
                        border: "1px dashed rgba(99, 102, 241, 0.25)", 
                        borderRadius: "var(--radius-sm)",
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px"
                      }}
                    >
                      <Trophy size={14} style={{ color: "var(--accent-color)" }} />
                      <span>
                        <strong>Round {rIdx + 1} Bye:</strong> {byeTeam.p1?.name || "Empty"} & {byeTeam.p2?.name || "Empty"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Up Next, Live Standings, Pits Status */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            
            {/* Available Games (Up Next) */}
            <div className="glass-panel">
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "16px", fontWeight: "700", marginBottom: "16px", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
                <Clock size={18} style={{ color: "var(--accent-color)" }} />
                Up Next (Available Games)
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {availableGames.map(renderMainGameCard)}
                {availableGames.length === 0 && (
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontStyle: "italic", textAlign: "center", margin: "20px 0" }}>
                    No available games. Wait for matches to finish.
                  </p>
                )}
                {!isAnonymous && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      if (tournament.rounds && tournament.rounds.length > 0) {
                        handleAddGame("MAIN", tournament.rounds.length - 1);
                      } else {
                        handleAddRound("MAIN");
                      }
                    }}
                    style={{ marginTop: "12px", width: "100%", fontSize: "12px", borderStyle: "dashed" }}
                  >
                    + Add Game to Latest Round
                  </button>
                )}
              </div>
            </div>

            {/* Pits Status */}
            <div className="glass-panel" style={{ position: "sticky", top: "24px" }}>
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "16px", fontWeight: "700", marginBottom: "16px", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
                <CheckCircle size={18} style={{ color: "var(--success-color)" }} />
                Available Pits
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(pitNum => {
                  const isInUse = pitsInUseSet.has(pitNum);
                  return (
                    <div 
                      key={pitNum}
                      style={{
                        padding: "10px 4px",
                        textAlign: "center",
                        borderRadius: "var(--radius-sm)",
                        background: isInUse ? "var(--bg-secondary)" : "rgba(16, 185, 129, 0.1)",
                        border: isInUse ? "1px solid var(--border-color)" : "1px solid var(--success-color)",
                        opacity: isInUse ? 0.6 : 1
                      }}
                    >
                      <div style={{ fontSize: "11px", color: isInUse ? "var(--text-secondary)" : "var(--success-color)", fontWeight: "600", marginBottom: "4px" }}>Pit {pitNum}</div>
                      <div style={{ fontSize: "10px", color: isInUse ? "var(--danger-color)" : "var(--success-color)", fontWeight: "700" }}>
                        {isInUse ? "IN USE" : "OPEN"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="glass-panel">
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "16px", fontWeight: "700", marginBottom: "16px", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
                <Trophy size={18} style={{ color: "var(--gold-color)" }} />
                Live Team Standings
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
                    {standings.map((stat, idx) => (
                      <tr key={idx}>
                        <td style={{ textAlign: "center", fontWeight: "700", color: idx === 0 ? "var(--gold-color)" : "var(--text-secondary)" }}>
                          {idx + 1}
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ fontWeight: "600", fontSize: "13px" }}>
                              {stat.team.p1?.name || "Empty"} & {stat.team.p2?.name || "Empty"}
                            </span>
                            <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>
                              (Rank {stat.team.p1?.rank || "?"} + {stat.team.p2?.rank || "?"})
                            </span>
                          </div>
                        </td>
                        <td style={{ textAlign: "center" }}>{stat.played}</td>
                        <td style={{ textAlign: "center", fontWeight: "600", color: "var(--success-color)" }}>{stat.wins}</td>
                        <td style={{ textAlign: "center", fontWeight: "600", color: "var(--danger-color)" }}>{stat.losses}</td>
                        <td style={{ textAlign: "center", fontSize: "12px", color: "var(--text-secondary)" }}>
                          <strong>{stat.pointsScored}</strong>:{stat.pointsAgainst}
                        </td>
                      </tr>
                    ))}
                    {standings.length === 0 && (
                      <tr>
                        <td colSpan="6" style={{ textAlign: "center", padding: "20px", color: "var(--text-secondary)" }}>
                          No teams registered.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          </div>
        </div>
      ) : (
        /* ================= PLAYOFFS BRACKETS VIEW (DRAWN WITH CONNECTOR LINES) ================= */
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Playoffs group tab switcher */}
          <nav className="nav-tabs" style={{ marginBottom: "10px" }}>
            {groupKeys.map((key) => {
              const groupRounds = tournament.rankedBrackets[key]?.rounds || [];
              const getNumTeamsInGroup = () => {
                const teamIds = new Set();
                groupRounds.forEach(round => {
                  round.forEach(game => {
                    if (game.t1) teamIds.add(`${game.t1.p1.id}_${game.t1.p2?.id || ""}`);
                    if (game.t2) teamIds.add(`${game.t2.p1.id}_${game.t2.p2?.id || ""}`);
                  });
                });
                return teamIds.size;
              };
              const numTeamsInGroup = getNumTeamsInGroup();
              return (
                <button
                  key={key}
                  type="button"
                  className={`nav-tab-btn ${activePlayoffTab === key ? "active" : ""}`}
                  onClick={() => setActivePlayoffTab(key)}
                  style={{ flex: 1, padding: "12px" }}
                >
                  <Trophy size={18} style={{ color: activePlayoffTab === key ? "var(--gold-color)" : "inherit" }} />
                  {key} DIVISION Playoffs ({numTeamsInGroup > 0 ? `${numTeamsInGroup} Teams` : "Empty"})
                </button>
              );
            })}
          </nav>

          {/* Bracket Tree drawn with paper-style orthogonal lines */}
          {(() => {
            const groupBracket = tournament.rankedBrackets[activePlayoffTab];
            if (!groupBracket || !groupBracket.rounds || groupBracket.rounds.length === 0) {
              return (
                <div className="glass-panel" style={{ textAlign: "center", padding: "40px" }}>
                  <AlertCircle size={40} style={{ color: "var(--text-secondary)", opacity: 0.5, marginBottom: "12px" }} />
                  <p style={{ fontSize: "15px", color: "var(--text-secondary)" }}>No teams were assigned to the {activePlayoffTab} DIVISION based on points.</p>
                </div>
              );
            }

            const rounds = groupBracket.rounds;

            if (groupBracket.isRoundRobin) {
              const getRoundRobinTeams = () => {
                const teamMap = new Map();
                rounds.forEach(round => {
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
                return Array.from(teamMap.values());
              };

              const rrTeams = getRoundRobinTeams();

              const getRoundRobinStandings = () => {
                const stats = rrTeams.map(team => ({
                  team,
                  played: 0,
                  wins: 0,
                  losses: 0,
                  pointsScored: 0,
                  pointsAgainst: 0
                }));

                rounds.forEach(round => {
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

              const rrStandings = getRoundRobinStandings();

              const isRoundRobinFinished = (() => {
                for (const round of rounds) {
                  for (const game of round) {
                    if (game.score1 === null || game.score2 === null) {
                      return false;
                    }
                  }
                }
                return true;
              })();

              const rrChampion = isRoundRobinFinished && rrStandings.length > 0 ? rrStandings[0].team : null;

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                  {isRoundRobinFinished && rrChampion && (
                    <div 
                      style={{ 
                        padding: "20px", 
                        background: "linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(234, 179, 8, 0.02) 100%)", 
                        border: "1px solid rgba(234, 179, 8, 0.4)", 
                        borderRadius: "var(--radius-md)",
                        textAlign: "center",
                        boxShadow: "0 0 20px rgba(234, 179, 8, 0.1)"
                      }}
                    >
                      <Trophy size={48} style={{ color: "var(--gold-color)", marginBottom: "12px", animation: "spin 5s linear infinite" }} />
                      <h3 style={{ fontSize: "20px", fontWeight: "800", color: "var(--gold-color)", margin: "0 0 6px 0", textTransform: "uppercase", letterSpacing: "1px" }}>
                        {activePlayoffTab} DIVISION Round Robin Champion!
                      </h3>
                      <p style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-primary)", margin: 0 }}>
                        🏆 {rrChampion.p1?.name} & {rrChampion.p2?.name} 🏆
                      </p>
                      <span style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginTop: "4px" }}>
                        (Skill Rank Group: {rrChampion.p1?.rank || "?"} + {rrChampion.p2?.rank || "?"})
                      </span>
                    </div>
                  )}

                  {!isAnonymous && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
                      <button 
                        type="button" 
                        className="btn btn-danger" 
                        onClick={() => handleClearSchedule(activePlayoffTab)}
                        style={{ fontSize: "13px", padding: "6px 12px" }}
                      >
                        <RotateCcw size={14} /> Clear Schedule
                      </button>
                    </div>
                  )}

                  <div className="dashboard-grid">
                    {/* Left Column: Round matches list */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                      {rounds.map((round, rIdx) => (
                        <div key={rIdx} className="glass-panel">
                          <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "16px", fontWeight: "700", marginBottom: "16px", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
                            <Calendar size={18} style={{ color: "var(--accent-color)" }} />
                            Round {rIdx + 1}
                          </h3>

                          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            {round.map((game, gIdx) => {
                              const team1 = game.t1;
                              const team2 = game.t2;
                              const isScored = game.score1 !== null && game.score2 !== null;
                              const isRecording = scoringGame?.roundIdx === rIdx && scoringGame?.gameIdx === gIdx && scoringGame.isPlayoffs && scoringGame.playoffGroup === activePlayoffTab;

                              const t1Wins = isScored && game.score1 > game.score2;
                              const t2Wins = isScored && game.score2 > game.score1;

                              return (
                                <div 
                                  key={game.id}
                                  style={{
                                    padding: "12px 14px",
                                    background: "var(--bg-secondary)",
                                    borderRadius: "var(--radius-sm)",
                                    border: isScored ? "2px solid var(--success-color)" : (game.started ? "2px solid #eab308" : "1px solid var(--border-color)"),
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "10px"
                                  }}
                                >
                                  {/* Game Card Header/Details */}
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" }}>
                                      Match {gIdx + 1}
                                    </span>
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                      {isScored && !isRecording ? (
                                        <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", color: "var(--success-color)", fontWeight: "700" }}>
                                          <CheckCircle size={14} /> Scored
                                        </span>
                                      ) : (!isScored && game.started && (
                                        <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", color: "#eab308", fontWeight: "700" }}>
                                          IN PROGRESS {game.pit ? `(Pit #${game.pit})` : ""}
                                        </span>
                                      ))}
                                      {!isAnonymous && (
                                        <button 
                                          type="button" 
                                          className="btn-icon-only danger"
                                          onClick={() => handleRemoveGame(activePlayoffTab, rIdx, gIdx)}
                                          title="Remove Game"
                                          style={{ padding: "4px" }}
                                        >
                                          <X size={14} />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Opponents Stack */}
                                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
                                    {/* Team 1 Box */}
                                    {assigningTeamSlot?.groupKey === activePlayoffTab && assigningTeamSlot?.roundIdx === rIdx && assigningTeamSlot?.gameIdx === gIdx && assigningTeamSlot?.slot === "t1" ? (
                                      <div style={{ width: "100%", padding: "6px", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                          <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-secondary)" }}>Select Team:</span>
                                          <button type="button" onClick={() => setAssigningTeamSlot(null)} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "11px" }}>Cancel</button>
                                        </div>
                                        <div style={{ maxHeight: "150px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
                                          {tournament.teams.map((t, tIdx) => (
                                            <button 
                                              key={tIdx}
                                              type="button"
                                              className="btn btn-secondary"
                                              style={{ padding: "4px 8px", fontSize: "12px", width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                                              onClick={() => handleAssignTeam(t)}
                                            >
                                              <span>{t.p1?.name}{t.p2 ? ` & ${t.p2.name}` : ""}</span>
                                              <UserPlus size={12} />
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    ) : (
                                      <div 
                                        style={{ 
                                          display: "flex", 
                                          justifyContent: "space-between", 
                                          alignItems: "center",
                                          border: t1Wins ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid var(--border-color)",
                                          padding: "10px 14px",
                                          borderRadius: "var(--radius-sm)",
                                          background: t1Wins ? "rgba(16, 185, 129, 0.08)" : "var(--bg-primary)"
                                        }}
                                      >
                                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "15px", fontWeight: t1Wins ? "700" : "500" }}>
                                            <span style={{ color: t1Wins ? "var(--text-primary)" : "var(--text-secondary)" }}>{team1?.p1?.name || "Empty Slot"}</span>
                                          </div>
                                          {team1?.p2 && (
                                            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "15px", fontWeight: t1Wins ? "700" : "500" }}>
                                              <span style={{ color: t1Wins ? "var(--text-primary)" : "var(--text-secondary)" }}>{team1.p2.name}</span>
                                            </div>
                                          )}
                                          {!isAnonymous && !isScored && (
                                            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                                              <button type="button" onClick={() => setAssigningTeamSlot({ groupKey: activePlayoffTab, roundIdx: rIdx, gameIdx: gIdx, slot: "t1" })} style={{ fontSize: "11px", background: "none", border: "none", color: "var(--accent-color)", cursor: "pointer", padding: 0 }}>Change Team</button>
                                              {team1 && <button type="button" onClick={() => handleRemoveTeam(activePlayoffTab, rIdx, gIdx, "t1")} style={{ fontSize: "11px", background: "none", border: "none", color: "var(--danger-color)", cursor: "pointer", padding: 0 }}>Remove</button>}
                                            </div>
                                          )}
                                        </div>
                                        {isScored && !isRecording && (
                                          <span style={{ fontSize: "22px", fontWeight: "800", color: t1Wins ? "var(--success-color)" : "var(--text-secondary)" }}>
                                            {game.score1}
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {/* VS Divider */}
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", margin: "2px 0" }}>
                                      <div style={{ flex: 1, borderTop: "1px dashed var(--border-color)", opacity: 0.3 }}></div>
                                      <span style={{ padding: "0 10px", fontSize: "11px", color: "var(--text-secondary)", fontWeight: "700", letterSpacing: "1px" }}>VS</span>
                                      <div style={{ flex: 1, borderTop: "1px dashed var(--border-color)", opacity: 0.3 }}></div>
                                    </div>

                                    {/* Team 2 Box */}
                                    {assigningTeamSlot?.groupKey === activePlayoffTab && assigningTeamSlot?.roundIdx === rIdx && assigningTeamSlot?.gameIdx === gIdx && assigningTeamSlot?.slot === "t2" ? (
                                      <div style={{ width: "100%", padding: "6px", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                          <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-secondary)" }}>Select Team:</span>
                                          <button type="button" onClick={() => setAssigningTeamSlot(null)} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "11px" }}>Cancel</button>
                                        </div>
                                        <div style={{ maxHeight: "150px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
                                          {tournament.teams.map((t, tIdx) => (
                                            <button 
                                              key={tIdx}
                                              type="button"
                                              className="btn btn-secondary"
                                              style={{ padding: "4px 8px", fontSize: "12px", width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                                              onClick={() => handleAssignTeam(t)}
                                            >
                                              <span>{t.p1?.name}{t.p2 ? ` & ${t.p2.name}` : ""}</span>
                                              <UserPlus size={12} />
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    ) : (
                                      <div 
                                        style={{ 
                                          display: "flex", 
                                          justifyContent: "space-between", 
                                          alignItems: "center",
                                          border: t2Wins ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid var(--border-color)",
                                          padding: "10px 14px",
                                          borderRadius: "var(--radius-sm)",
                                          background: t2Wins ? "rgba(16, 185, 129, 0.08)" : "var(--bg-primary)"
                                        }}
                                      >
                                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "15px", fontWeight: t2Wins ? "700" : "500" }}>
                                            <span style={{ color: t2Wins ? "var(--text-primary)" : "var(--text-secondary)" }}>{team2?.p1?.name || "Empty Slot"}</span>
                                          </div>
                                          {team2?.p2 && (
                                            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "15px", fontWeight: t2Wins ? "700" : "500" }}>
                                              <span style={{ color: t2Wins ? "var(--text-primary)" : "var(--text-secondary)" }}>{team2.p2.name}</span>
                                            </div>
                                          )}
                                          {!isAnonymous && !isScored && (
                                            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                                              <button type="button" onClick={() => setAssigningTeamSlot({ groupKey: activePlayoffTab, roundIdx: rIdx, gameIdx: gIdx, slot: "t2" })} style={{ fontSize: "11px", background: "none", border: "none", color: "var(--accent-color)", cursor: "pointer", padding: 0 }}>Change Team</button>
                                              {team2 && <button type="button" onClick={() => handleRemoveTeam(activePlayoffTab, rIdx, gIdx, "t2")} style={{ fontSize: "11px", background: "none", border: "none", color: "var(--danger-color)", cursor: "pointer", padding: 0 }}>Remove</button>}
                                            </div>
                                          )}
                                        </div>
                                        {isScored && !isRecording && (
                                          <span style={{ fontSize: "22px", fontWeight: "800", color: t2Wins ? "var(--success-color)" : "var(--text-secondary)" }}>
                                            {game.score2}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {/* Scoring inputs */}
                                  {!isAnonymous && (isRecording ? (
                                    <form onSubmit={handleSaveScore} style={{ borderTop: "1px solid var(--border-color)", paddingTop: "10px", marginTop: "4px" }}>
                                      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "8px" }}>
                                        <div style={{ flex: 1 }}>
                                          <input 
                                            type="number" 
                                            className="form-input" 
                                            placeholder="T1 Score" 
                                            value={scoringGame.score1} 
                                            onChange={(e) => setScoringGame({ ...scoringGame, score1: e.target.value })}
                                            style={{ padding: "6px 10px", fontSize: "13px" }}
                                            min="0"
                                            required
                                          />
                                        </div>
                                        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>-</span>
                                        <div style={{ flex: 1 }}>
                                          <input 
                                            type="number" 
                                            className="form-input" 
                                            placeholder="T2 Score" 
                                            value={scoringGame.score2} 
                                            onChange={(e) => setScoringGame({ ...scoringGame, score2: e.target.value })}
                                            style={{ padding: "6px 10px", fontSize: "13px" }}
                                            min="0"
                                            required
                                          />
                                        </div>
                                      </div>

                                      {errorMsg && (
                                        <div style={{ color: "var(--danger-color)", fontSize: "12px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "4px" }}>
                                          <AlertCircle size={12} />
                                          <span>{errorMsg}</span>
                                        </div>
                                      )}

                                      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                                        <button type="button" className="btn btn-secondary" style={{ padding: "4px 8px", fontSize: "12px" }} onClick={() => setScoringGame(null)}>
                                          <X size={12} /> Cancel
                                        </button>
                                        <button type="submit" className="btn btn-primary" style={{ padding: "4px 10px", fontSize: "12px" }}>
                                          <Save size={12} /> Save Score
                                        </button>
                                      </div>
                                    </form>
                                  ) : (
                                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
                                      {!isScored && !game.started && !isAnonymous && (
                                        <button 
                                          type="button" 
                                          className="btn btn-primary" 
                                          style={{ padding: "5px 12px", fontSize: "12px", backgroundColor: "var(--success-color)", borderColor: "var(--success-color)", color: "#ffffff", marginRight: "8px" }}
                                          onClick={() => handleStartGame(game.id, true, activePlayoffTab, rIdx, gIdx)}
                                        >
                                          Start
                                        </button>
                                      )}
                                      <button 
                                        type="button" 
                                        className="btn btn-secondary" 
                                        style={{ padding: "5px 12px", fontSize: "12px", gap: "6px" }}
                                        onClick={() => handleRecordScore(rIdx, gIdx, true, activePlayoffTab)}
                                      >
                                        <Play size={12} style={{ fill: "currentColor" }} />
                                        {isScored ? "Edit Score" : "Record Score"}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                            {!isAnonymous && (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => handleAddGame(activePlayoffTab, rIdx)}
                                style={{ marginTop: "12px", width: "100%", fontSize: "12px", borderStyle: "dashed" }}
                              >
                                + Add Game
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      {!isAnonymous && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => handleAddRound(activePlayoffTab)}
                          style={{ width: "100%", fontSize: "14px", padding: "10px", marginTop: "8px" }}
                        >
                          + Add Round
                        </button>
                      )}
                    </div>

                    {/* Right Column: Live Standings and Pits Status */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                      
                      {/* Pits Status */}
                      <div className="glass-panel" style={{ position: "sticky", top: "24px" }}>
                        <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "16px", fontWeight: "700", marginBottom: "16px", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
                          <CheckCircle size={18} style={{ color: "var(--success-color)" }} />
                          Available Pits
                        </h3>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(pitNum => {
                            const isInUse = pitsInUseSet.has(pitNum);
                            return (
                              <div 
                                key={pitNum}
                                style={{
                                  padding: "10px 4px",
                                  textAlign: "center",
                                  borderRadius: "var(--radius-sm)",
                                  background: isInUse ? "var(--bg-secondary)" : "rgba(16, 185, 129, 0.1)",
                                  border: isInUse ? "1px solid var(--border-color)" : "1px solid var(--success-color)",
                                  opacity: isInUse ? 0.6 : 1
                                }}
                              >
                                <div style={{ fontSize: "11px", color: isInUse ? "var(--text-secondary)" : "var(--success-color)", fontWeight: "600", marginBottom: "4px" }}>Pit {pitNum}</div>
                                <div style={{ fontSize: "10px", color: isInUse ? "var(--danger-color)" : "var(--success-color)", fontWeight: "700" }}>
                                  {isInUse ? "IN USE" : "OPEN"}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="glass-panel">
                        <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "16px", fontWeight: "700", marginBottom: "16px", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
                          <Trophy size={18} style={{ color: "var(--gold-color)" }} />
                          Playoff Standings ({activePlayoffTab} DIVISION)
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
                                      <span style={{ fontWeight: "600", fontSize: "13px" }}>
                                        {stat.team.p1?.name || "Empty"} & {stat.team.p2?.name || "Empty"}
                                      </span>
                                      <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>
                                        (Rank {stat.team.p1?.rank || "?"} + {stat.team.p2?.rank || "?"})
                                      </span>
                                    </div>
                                  </td>
                                  <td style={{ textAlign: "center" }}>{stat.played}</td>
                                  <td style={{ textAlign: "center", fontWeight: "600", color: "var(--success-color)" }}>{stat.wins}</td>
                                  <td style={{ textAlign: "center", fontWeight: "600", color: "var(--danger-color)" }}>{stat.losses}</td>
                                  <td style={{ textAlign: "center", fontSize: "12px", color: "var(--text-secondary)" }}>
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

            const finalGame = rounds[rounds.length - 1][0];
            const isPlayoffFinished = finalGame && finalGame.score1 !== null && finalGame.score2 !== null;
            const playoffWinner = isPlayoffFinished 
              ? (finalGame.score1 > finalGame.score2 ? finalGame.t1 : finalGame.t2)
              : null;

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                {/* Pits Status for Single-Elimination */}
                <div className="glass-panel">
                  <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "16px", fontWeight: "700", marginBottom: "16px", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
                    <CheckCircle size={18} style={{ color: "var(--success-color)" }} />
                    Available Pits
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))", gap: "10px" }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(pitNum => {
                      const isInUse = pitsInUseSet.has(pitNum);
                      return (
                        <div 
                          key={pitNum}
                          style={{
                            padding: "10px 4px",
                            textAlign: "center",
                            borderRadius: "var(--radius-sm)",
                            background: isInUse ? "var(--bg-secondary)" : "rgba(16, 185, 129, 0.1)",
                            border: isInUse ? "1px solid var(--border-color)" : "1px solid var(--success-color)",
                            opacity: isInUse ? 0.6 : 1
                          }}
                        >
                          <div style={{ fontSize: "11px", color: isInUse ? "var(--text-secondary)" : "var(--success-color)", fontWeight: "600", marginBottom: "4px" }}>Pit {pitNum}</div>
                          <div style={{ fontSize: "10px", color: isInUse ? "var(--danger-color)" : "var(--success-color)", fontWeight: "700" }}>
                            {isInUse ? "IN USE" : "OPEN"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {isPlayoffFinished && playoffWinner && (
                  <div 
                    style={{ 
                      padding: "20px", 
                      background: "linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(234, 179, 8, 0.02) 100%)", 
                      border: "1px solid rgba(234, 179, 8, 0.4)", 
                      borderRadius: "var(--radius-md)",
                      textAlign: "center",
                      boxShadow: "0 0 20px rgba(234, 179, 8, 0.1)"
                    }}
                  >
                    <Trophy size={48} style={{ color: "var(--gold-color)", marginBottom: "12px", animation: "spin 5s linear infinite" }} />
                    <h3 style={{ fontSize: "20px", fontWeight: "800", color: "var(--gold-color)", margin: "0 0 6px 0", textTransform: "uppercase", letterSpacing: "1px" }}>
                      {activePlayoffTab} DIVISION Tournament Champions!
                    </h3>
                    <p style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-primary)", margin: 0 }}>
                      🏆 {playoffWinner.p1?.name} & {playoffWinner.p2?.name} 🏆
                    </p>
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginTop: "4px" }}>
                      (Skill Rank Group: {playoffWinner.p1?.rank || "?"} + {playoffWinner.p2?.rank || "?"})
                    </span>
                  </div>
                )}

                <div 
                  id="bracket-viewport" 
                  className="bracket-viewport-panel"
                >
                  {/* Scrollable Content Wrapper */}
                  <div id="bracket-scroll-wrapper" style={{ position: "relative", display: "inline-block", width: "max-content", minWidth: "100%" }}>
                    {/* SVG connections overlay */}
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

                    {/* Columns of rounds */}
                    <div style={{ display: "flex", gap: "60px", paddingLeft: "12px", zIndex: 2, position: "relative", minHeight: "450px" }}>
                      {(() => {
                        const hasPlayIn = rounds[0]?.[0]?.isPlayIn === true;
                        const isStepladder = rounds[0]?.[0]?.isStepladder === true;
                        
                        return rounds.map((round, rIdx) => {
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
                              {/* Column Header */}
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

                              {/* Column Games List */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "24px", justifyContent: "space-around", flex: 1 }}>
                                {round.map((game, gIdx) => (
                                  <div key={game.id} style={{ display: "flex", justifyContent: "center" }}>
                                    {renderGameCard(game, rIdx, gIdx, rounds)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
