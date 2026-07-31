import { calculateCropGrowthState } from './smallWorldGrowth.js';

export const SMALL_WORLD_STEAL_COOLDOWN_MS = 12 * 60 * 60 * 1000;
export const SMALL_WORLD_STEAL_PROTECTION_MS = 6 * 60 * 60 * 1000;
export const SMALL_WORLD_GUARD_ENERGY_COST = 10;

const GUARD_QUALITY_SCORE = {
  仙胎: 1,
  仙仔: 2,
  仙兽: 3,
  仙道: 4,
  仙灵: 5,
};

function normalizeTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

export function getStealCooldownRemaining(lastStealTime, now = Date.now()) {
  return Math.max(
    0,
    normalizeTimestamp(lastStealTime) + SMALL_WORLD_STEAL_COOLDOWN_MS - now
  );
}

export function isWorldStealProtected(lastStolenTime, now = Date.now()) {
  return normalizeTimestamp(lastStolenTime) + SMALL_WORLD_STEAL_PROTECTION_MS > now;
}

export function isCropStealable(crop, seedConfig, world, now = new Date()) {
  if (!seedConfig || !calculateCropGrowthState(crop, seedConfig, world, now).isMature) {
    return false;
  }
  return !Array.isArray(crop.偷菜记录) || crop.偷菜记录.length === 0;
}

export function recordCropSteal(crop, thiefId, now = Date.now()) {
  if (!Array.isArray(crop.偷菜记录)) crop.偷菜记录 = [];
  crop.偷菜记录.push({
    偷取者: String(thiefId),
    时间: now,
  });
}

export function calculateGuardInterceptChance(pet) {
  if (!pet || pet.累倒) return 0;

  const maxEnergy = Math.max(1, Number(pet.最大精力) || 100);
  const energy = Math.max(
    0,
    Math.min(maxEnergy, Number(pet.精力 ?? maxEnergy))
  );
  if (energy <= 0) return 0;

  const qualityScore = GUARD_QUALITY_SCORE[pet.品级] || 1;
  const level = Math.max(1, Math.min(100, Number(pet.等级) || 1));
  let chance = 0.15 + qualityScore * 0.06 + level * 0.002;

  if (pet.type === '战斗') chance += 0.12;

  const traits = Array.isArray(pet.特性) ? pet.特性 : [];
  if (traits.includes('强韧')) chance += 0.05;
  if (traits.includes('聪慧')) chance += 0.04;
  if (traits.includes('神速')) chance += 0.04;
  if (traits.includes('勤勉')) chance += 0.03;
  if (traits.includes('懒惰')) chance -= 0.08;

  const energyMultiplier = 0.4 + 0.6 * (energy / maxEnergy);
  return Math.max(0.05, Math.min(0.8, chance * energyMultiplier));
}

export function consumeGuardEnergy(pet, cost = SMALL_WORLD_GUARD_ENERGY_COST) {
  if (!pet) return 0;

  const maxEnergy = Math.max(1, Number(pet.最大精力) || 100);
  const currentEnergy = Math.max(
    0,
    Math.min(maxEnergy, Number(pet.精力 ?? maxEnergy))
  );
  pet.精力 = Math.max(0, currentEnergy - Math.max(0, Number(cost) || 0));
  if (pet.精力 <= 0) pet.守卫 = false;
  return pet.精力;
}
