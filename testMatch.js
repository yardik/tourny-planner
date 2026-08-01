import fs from 'fs';

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
  } else if (ranks === "AB" || ranks === "BD" || ranks === "CD") {
    baseScore = 200;  // Acceptable but suboptimal
  } else if (ranks === "BB" || ranks === "CC") {
    baseScore = 100;  // Last resort seeding
  } else {
    baseScore = 10;   // Extreme last resort (AA, DD)
  }

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

const runGreedyMatch = (activePlayers) => {
  const shuf = [...activePlayers];
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

  // 6. Absolute Last Resort: Pool any remaining players and pair them
  const remaining = [...listA, ...listD, ...bLeftovers, ...cLeftovers];
  while (remaining.length >= 2) {
    gTeams.push({ p1: remaining.pop(), p2: remaining.pop() });
  }
  
  if (remaining.length > 0) {
      console.log("REMAINING:", remaining);
  }

  return gTeams;
};

function generateTeams(activePlayers) {
    const len = activePlayers.length;
    const randomizedPlayers = [...activePlayers];
    const visited = new Array(len).fill(false);
    
    const greedyTeams = runGreedyMatch(activePlayers);
    console.log("Greedy teams count:", greedyTeams.length);

    let greedyScore = 0;
    greedyTeams.forEach((team) => {
      greedyScore += getPairScore(team.p1, team.p2);
    });

    let bestScore = greedyScore;
    let bestTeams = greedyTeams;

    const currentTeams = [];
    let iterations = 0;
    const maxIterations = 100000;

    const backtrack = (idx, currentScore) => {
      iterations++;
      if (iterations > maxIterations) return;

      let i = idx;
      while (i < len && visited[i]) {
        i++;
      }

      if (i >= len) {
        if (currentScore > bestScore) {
          bestScore = currentScore;
          bestTeams = [...currentTeams];
        }
        return;
      }

      const unvisitedCount = len - i;
      const maxPossibleRemaining = Math.floor(unvisitedCount / 2) * 1010;
      if (currentScore + maxPossibleRemaining <= bestScore) {
        return;
      }

      const candidates = [];
      for (let j = i + 1; j < len; j++) {
        if (!visited[j]) {
          const score = getPairScore(randomizedPlayers[i], randomizedPlayers[j]);
          if (score > -500000) {
            candidates.push({ idx: j, score });
          }
        }
      }

      candidates.sort((a, b) => b.score - a.score);

      visited[i] = true;
      for (const cand of candidates) {
        const j = cand.idx;
        visited[j] = true;
        currentTeams.push({ p1: randomizedPlayers[i], p2: randomizedPlayers[j] });

        backtrack(i + 1, currentScore + cand.score);

        currentTeams.pop();
        visited[j] = false;
      }
      visited[i] = false;
    };

    backtrack(0, 0);
    return bestTeams;
}

const players = [];
for (let i = 0; i < 20; i++) {
    players.push({ id: `A${i}`, rank: "A", gender: "Male" });
}
for (let i = 0; i < 24; i++) {
    players.push({ id: `D${i}`, rank: "D", gender: "Female" });
}

console.log("Total players:", players.length);
const teams = generateTeams(players);
console.log("Teams generated:", teams.length);
