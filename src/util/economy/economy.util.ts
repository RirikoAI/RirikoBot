export const EconomyUtil = {
  calculateExpAndCoins: calculateExp,
  calculateTotalExpForLevel: calculateTotalExpForLevel,
  getCurrentLevel: getCurrentLevel,
  getLevelTable: getLevelTable,
};

function calculateExp(level) {
  if (level == 0) {
    return 0;
  } else if (level == 1) {
    return 5;
  } else if (level == 2) {
    return 10;
  } else if (level == 3) {
    return 20;
  } else if (level <= 13) {
    // For levels 6 to 13, exponential growth with a multiplier of 1.5
    return 45 * Math.pow(1.5, level - 5);
  } else {
    // From level 14 onwards, exponential growth with a multiplier of 1.1
    return calculateExp(13) * Math.pow(1.1, level - 13);
  }
}

// Function to calculate the total experience required to reach a given level
function calculateTotalExpForLevel(level) {
  let totalExp = 0;
  for (let i = 0; i <= level; i++) {
    totalExp += calculateExp(i);
  }
  return totalExp;
}

// Function to determine the user's current level based on their total experience
function getCurrentLevel(userExp) {
  let userLevel = 0;

  for (let level = 0; level <= 1000; level++) {
    const expRequired = calculateExp(level);
    if (userExp >= expRequired) userLevel++;
    else break;
  }
  return userLevel - 1;
}

function getLevelTable() {
  let table = [];
  for (let level = 0; level <= 100; level++) {
    let expRequired = calculateExp(level);
    let coinsReceivable = expRequired; // Coins are equal to the experience required
    table.push({
      level,
      expRequired: expRequired.toFixed(6),
      coinsReceivable: coinsReceivable.toFixed(6),
    });
  }
  console.table(table);
  return table;
}
