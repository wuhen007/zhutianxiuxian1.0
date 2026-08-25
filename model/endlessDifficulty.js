export const ENDLESS_TIER_MAX_LAYER = 150;
export const ENDLESS_MAX_DIFFICULTY_TIER = 9;

export const ENDLESS_DIFFICULTIES = Object.freeze([
  '本初劫境',
  '梦魇劫境',
  '天灾劫境',
  '灭世劫境',
  '纪元劫境',
  '轮回劫境',
  '祭道劫境',
  '超脱劫境',
  '彼岸劫境',
].map((name, index) => Object.freeze({
  tier: index + 1,
  code: `A${index + 1}`,
  name,
  enemyHpMultiplier: 1 + index * 0.35,
  enemyAttackMultiplier: 1 + index * 0.22,
  enemyDefenseMultiplier: 1 + index * 0.15,
  rewardMultiplier: 1 + index * 0.15,
})));

function integer(value, fallback = 0) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeEndlessDifficultyTier(value) {
  const parsed = String(value ?? '').toUpperCase().replace(/^A/, '');
  return Math.min(
    ENDLESS_MAX_DIFFICULTY_TIER,
    Math.max(1, integer(parsed, 1))
  );
}

export function getEndlessDifficulty(value) {
  return ENDLESS_DIFFICULTIES[normalizeEndlessDifficultyTier(value) - 1];
}

export function formatEndlessDifficulty(value) {
  const difficulty = getEndlessDifficulty(value);
  return `${difficulty.code}·${difficulty.name}`;
}

export function getEndlessOverallLayer(tier, layer) {
  return (
    (normalizeEndlessDifficultyTier(tier) - 1) * ENDLESS_TIER_MAX_LAYER +
    Math.min(ENDLESS_TIER_MAX_LAYER, Math.max(0, integer(layer)))
  );
}

export function normalizeEndlessDifficultyProgress(player) {
  const saved = player?.无尽劫境进阶 || {};
  const highestLayers = {};
  for (let tier = 1; tier <= ENDLESS_MAX_DIFFICULTY_TIER; tier++) {
    const layer = Math.min(
      ENDLESS_TIER_MAX_LAYER,
      Math.max(0, integer(saved.highestLayers?.[tier]))
    );
    if (layer) highestLayers[tier] = layer;
  }

  const cleared = new Set(
    (Array.isArray(saved.clearedTiers) ? saved.clearedTiers : [])
      .map(normalizeEndlessDifficultyTier)
  );
  const legacyLayer = Math.max(0, integer(player?.无尽劫境最高层));
  if (legacyLayer) {
    const legacyTier = Math.min(
      ENDLESS_MAX_DIFFICULTY_TIER,
      Math.ceil(legacyLayer / ENDLESS_TIER_MAX_LAYER)
    );
    const localLayer = legacyLayer % ENDLESS_TIER_MAX_LAYER || ENDLESS_TIER_MAX_LAYER;
    highestLayers[legacyTier] = Math.max(highestLayers[legacyTier] || 0, localLayer);
    for (let tier = 1; tier < legacyTier; tier++) {
      cleared.add(tier);
      highestLayers[tier] = ENDLESS_TIER_MAX_LAYER;
    }
    if (localLayer >= ENDLESS_TIER_MAX_LAYER) cleared.add(legacyTier);
  }

  const clearedTiers = [...cleared]
    .filter(tier => highestLayers[tier] >= ENDLESS_TIER_MAX_LAYER)
    .sort((a, b) => a - b);
  const highestClearedTier = clearedTiers.at(-1) || 0;
  const unlockedTier = Math.min(
    ENDLESS_MAX_DIFFICULTY_TIER,
    Math.max(1, integer(saved.unlockedTier, 1), highestClearedTier + 1)
  );
  const selectedTier = Math.min(
    unlockedTier,
    normalizeEndlessDifficultyTier(saved.selectedTier || unlockedTier)
  );
  const progress = { unlockedTier, selectedTier, clearedTiers, highestLayers };
  if (player) player.无尽劫境进阶 = progress;
  return progress;
}

export function canEnterEndlessDifficulty(player, tier) {
  return normalizeEndlessDifficultyProgress(player).unlockedTier >=
    normalizeEndlessDifficultyTier(tier);
}

export function selectEndlessDifficulty(player, tier) {
  const target = normalizeEndlessDifficultyTier(tier);
  const progress = normalizeEndlessDifficultyProgress(player);
  if (target > progress.unlockedTier)
    throw new Error(`需先通关${formatEndlessDifficulty(target - 1)}，才能挑战${formatEndlessDifficulty(target)}`);
  progress.selectedTier = target;
  player.无尽劫境进阶 = progress;
  return progress;
}

export function recordEndlessDifficultyProgress(player, tier, layer, options = {}) {
  const targetTier = normalizeEndlessDifficultyTier(tier);
  const targetLayer = Math.min(
    ENDLESS_TIER_MAX_LAYER,
    Math.max(0, integer(layer))
  );
  const progress = normalizeEndlessDifficultyProgress(player);
  progress.highestLayers[targetTier] = Math.max(
    progress.highestLayers[targetTier] || 0,
    targetLayer
  );
  const cleared = Boolean(options.cleared) && targetLayer >= ENDLESS_TIER_MAX_LAYER;
  const firstClear = cleared && !progress.clearedTiers.includes(targetTier);
  if (firstClear) progress.clearedTiers.push(targetTier);
  progress.clearedTiers.sort((a, b) => a - b);
  if (cleared && targetTier < ENDLESS_MAX_DIFFICULTY_TIER)
    progress.unlockedTier = Math.max(progress.unlockedTier, targetTier + 1);
  progress.selectedTier = Math.min(progress.selectedTier, progress.unlockedTier);
  player.无尽劫境进阶 = progress;
  player.无尽劫境最高层 = Math.max(
    Math.max(0, integer(player.无尽劫境最高层)),
    getEndlessOverallLayer(targetTier, targetLayer)
  );
  return {
    progress,
    firstClear,
    unlockedTier: progress.unlockedTier,
    shopLimitBonusCount: progress.clearedTiers.length,
  };
}

export function getEndlessLimitedPurchaseLimit(player, baseLimit, celestial = null) {
  const base = Math.max(0, integer(baseLimit));
  if (!base) return 0;
  const clearedCount = normalizeEndlessDifficultyProgress(player).clearedTiers.length;
  const firstClearBonus = Math.max(1, Math.ceil(base * 0.1)) * clearedCount;
  const celestialBonus = celestial?.shopLimitRate
    ? Math.max(1, Math.ceil(base * Number(celestial.shopLimitRate)))
    : Math.max(0, integer(celestial?.shopLimitFlat));
  return base + firstClearBonus + celestialBonus;
}
