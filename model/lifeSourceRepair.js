import { getSuiyunLifeMaximum } from './suiyun.js';
import { getMemoryLifeMaximum } from './memoryPath.js';

const LIFE_SOURCE_TIER_SIZE = 50;
const BASE_TIER_COST = 1500000000;
const TIANMO_HUASHENG_PHYSIQUES = new Set(['极道天魔', '无相·万化天魔体']);

export function getLifeSourceRepairMaximum(player, extraLifeSource = 0) {
  const memoryMaximum = getMemoryLifeMaximum(player);
  if (memoryMaximum) return memoryMaximum;
  const suiyunMaximum = getSuiyunLifeMaximum(player);
  if (suiyunMaximum) return suiyunMaximum;
  const rootLifeSource = Math.max(0, Number(player?.灵根?.生命本源) || 0);
  const refinedLifeSource = TIANMO_HUASHENG_PHYSIQUES.has(player?.灵根?.name)
    ? Math.max(0, Number(player?.天魔化生?.累计所得?.生命本源) || 0)
    : 0;
  const extra = Math.max(0, Number(extraLifeSource) || 0);
  return Math.round((100 + rootLifeSource + refinedLifeSource + extra) * 1000) / 1000;
}

export function calculateLifeSourceRepairBaseCost(currentLife, repairPoints) {
  const start = Math.max(0, Number(currentLife) || 0);
  const points = Math.max(0, Number(repairPoints) || 0);
  const pointCost = BASE_TIER_COST / LIFE_SOURCE_TIER_SIZE;
  let totalCost = 0;
  let cursor = start;
  const end = start + points;

  while (cursor < end) {
    const tierIndex = Math.floor(cursor / LIFE_SOURCE_TIER_SIZE) + 1;
    const tierEnd = tierIndex * LIFE_SOURCE_TIER_SIZE;
    const amount = Math.min(end, tierEnd) - cursor;
    totalCost += pointCost * tierIndex * amount;
    cursor += amount;
  }

  return Math.floor(totalCost);
}
