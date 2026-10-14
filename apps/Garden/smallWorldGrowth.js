const BASE_GROWTH_SECONDS_PER_1000_AURA = 4 * 60 * 60;

export function getMemoryCropGrowthMultiplier(crop) {
  const multiplier = Number(crop?.记忆生长倍率);
  return [1.5, 2, 3].includes(multiplier) ? multiplier : 1;
}

function parseTimeRatio(timeFlow = '1:1') {
  const [source, target] = String(timeFlow).split(':').map(Number);
  if (!Number.isFinite(source) || !Number.isFinite(target) || source <= 0 || target <= 0) {
    return 1;
  }
  return target / source;
}

export function calculateCropGrowthState(crop, seedConfig, world, now = new Date()) {
  const requiredAura = Number(seedConfig?.requirements?.灵气浓度) || 1000;
  const worldAura = Number(world?.attributes?.灵气浓度) || 0;
  const requiredTime = (requiredAura / 1000) * BASE_GROWTH_SECONDS_PER_1000_AURA;
  const timeRatio = parseTimeRatio(world?.attributes?.时间流速);
  const growthRate = worldAura / requiredAura * getMemoryCropGrowthMultiplier(crop);

  const startTime = new Date(crop?.种植时间 || crop?.阶段开始时间).getTime();
  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const elapsedMs = nowTime - startTime;
  const valid = Number.isFinite(elapsedMs) && elapsedMs >= 0 && growthRate > 0;
  const elapsedSeconds = valid ? elapsedMs / 1000 : 0;
  const bonusSeconds = Number(crop?.时间加成) || 0;
  const totalGrowthTime = valid
    ? elapsedSeconds * timeRatio * growthRate + bonusSeconds
    : 0;
  const remainingTime = Math.max(0, requiredTime - totalGrowthTime);
  const progress = requiredTime > 0 ? totalGrowthTime / requiredTime : 0;

  return {
    valid,
    elapsedSeconds,
    timeRatio,
    growthRate,
    requiredTime,
    totalGrowthTime,
    remainingTime,
    remainingPct: Math.max(0, 1 - progress),
    isMature: valid && totalGrowthTime >= requiredTime,
  };
}
