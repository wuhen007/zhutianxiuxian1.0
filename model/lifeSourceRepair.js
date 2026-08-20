const LIFE_SOURCE_TIER_SIZE = 50;
const BASE_TIER_COST = 1500000000;

export function calculateLifeSourceRepairBaseCost(currentLife, repairPoints) {
  const start = Math.max(0, Math.trunc(Number(currentLife) || 0));
  const points = Math.max(0, Math.trunc(Number(repairPoints) || 0));
  const pointCost = BASE_TIER_COST / LIFE_SOURCE_TIER_SIZE;
  let totalCost = 0;

  for (let offset = 0; offset < points; offset++) {
    const tierIndex = Math.floor((start + offset) / LIFE_SOURCE_TIER_SIZE) + 1;
    totalCost += pointCost * tierIndex;
  }

  return Math.floor(totalCost);
}
