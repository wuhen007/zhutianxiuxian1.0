export function getBreakthroughPotentialCost(levelId) {
  const id = Number(levelId) || 1;
  return id <= 26 ? 2 : id <= 41 ? 4 : 8;
}
