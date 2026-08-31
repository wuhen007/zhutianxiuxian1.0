export const TIANMO_HUASHENG_TECHNIQUE = "天魔化生功";
export const JIDAO_TIANMO_PHYSIQUE = "极道天魔";
export const WANHUA_TIANMO_PHYSIQUE = "无相·万化天魔体";

export const REFINEMENT_ORB_GAIN = 0.1;
export const REFINEMENT_ATTRIBUTE_GAIN = 0.05;
export const REFINEMENT_ORB_TARGET = 5;
export const CALAMITY_REFINEMENT_WEIGHT = 0.1;
export const REFINEMENT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const SAME_TARGET_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const TIANMO_LEGACY_DURATION_MS = 24 * 60 * 60 * 1000;
const TIANMO_LIFE_SOURCE_MIGRATION_VERSION = 2;
const TIANMO_LIFE_SOURCE_PROFILES = Object.freeze({
  [JIDAO_TIANMO_PHYSIQUE]: Object.freeze({ legacy: 50, current: 150 }),
  [WANHUA_TIANMO_PHYSIQUE]: Object.freeze({ legacy: 100, current: 500 }),
});

export const WANHUA_TIANMO_ROOT = Object.freeze({
  id: 7010020,
  name: WANHUA_TIANMO_PHYSIQUE,
  type: "天魔",
  归类: "神魔",
  eff: 5,
  法球倍率: 5,
  攻击: 8,
  防御: 3.5,
  生命: 8,
  生命本源: 500,
});

const TRANSFER_RULES = Object.freeze({
  仙道潜力: { rate: 0.5, reserve: 0 },
  修为: { rate: 0.1, reserve: 0 },
  血气: { rate: 0.1, reserve: 0 },
  寿元: { rate: 0.1, reserve: 1 },
  生命本源: { rate: 0.1, reserve: 1 },
});

function roundGrowth(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function calculateDrain(value, rate, reserve) {
  const available = Math.max(0, Math.floor(Number(value) || 0) - reserve);
  if (available === 0) return 0;
  return Math.min(available, Math.max(1, Math.floor(available * rate)));
}

export function isTianmoHuashengPhysique(player) {
  return [JIDAO_TIANMO_PHYSIQUE, WANHUA_TIANMO_PHYSIQUE].includes(
    player?.灵根?.name
  );
}

export function hasTianmoHuashengTechnique(player) {
  return (
    Array.isArray(player?.学习的功法) &&
    player.学习的功法.includes(TIANMO_HUASHENG_TECHNIQUE)
  );
}

export function ensureTianmoHuashengState(player, options = {}) {
  const current = player.天魔化生;
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    player.天魔化生 = {};
  }

  const state = player.天魔化生;
  state.炼化次数 = Math.max(0, roundGrowth(state.炼化次数));
  state.灾厄炼化次数 = Math.max(0, Math.floor(Number(state.灾厄炼化次数) || 0));
  state.上次炼化 = Math.max(0, Number(state.上次炼化) || 0);
  state.炼化记录 =
    state.炼化记录 && typeof state.炼化记录 === "object" ? state.炼化记录 : {};
  state.累计所得 =
    state.累计所得 && typeof state.累计所得 === "object" ? state.累计所得 : {};
  for (const key of Object.keys(TRANSFER_RULES)) {
    state.累计所得[key] = Math.max(
      0,
      roundGrowth(state.累计所得[key])
    );
  }
  if ((Number(state.生命本源版本) || 0) < TIANMO_LIFE_SOURCE_MIGRATION_VERSION) {
    const profile = TIANMO_LIFE_SOURCE_PROFILES[player?.灵根?.name];
    if (profile) {
      const storedBonus = Math.max(0, Number(player.灵根.生命本源) || 0);
      const currentLifeSource = Math.max(0, Number(player.生命本源) || 0);
      const extraLifeSource = Math.max(0, Number(options.extraLifeSource) || 0);
      const legacyMaximum = 100 + profile.legacy + state.累计所得.生命本源 + extraLifeSource;
      const increase = storedBonus < profile.current
        ? profile.current - storedBonus
        : currentLifeSource <= legacyMaximum ? profile.current - profile.legacy : 0;
      player.灵根.生命本源 = Math.max(storedBonus, profile.current);
      player.生命本源 = roundGrowth(currentLifeSource + increase);
    }
    state.生命本源版本 = TIANMO_LIFE_SOURCE_MIGRATION_VERSION;
  }
  state.已蜕变 = Boolean(
    state.已蜕变 || player.灵根?.name === WANHUA_TIANMO_PHYSIQUE
  );
  return state;
}

export function getRefinementAvailability(
  player,
  targetId,
  now = Date.now(),
  target = null
) {
  if (!isTianmoHuashengPhysique(player)) {
    return {
      ok: false,
      reason: "只有极道天魔一脉可以运转天魔化生功",
      waitMs: 0,
    };
  }
  if (!hasTianmoHuashengTechnique(player)) {
    return { ok: false, reason: "你尚未获得天魔化生功", waitMs: 0 };
  }

  const state = ensureTianmoHuashengState(player);
  const globalWait = state.上次炼化 + REFINEMENT_COOLDOWN_MS - now;
  if (globalWait > 0) {
    return { ok: false, reason: "天魔本源尚未消化完毕", waitMs: globalWait };
  }

  const targetTime = Number(state.炼化记录[String(targetId)]) || 0;
  const personalTargetWait = targetTime + SAME_TARGET_COOLDOWN_MS - now;
  const targetProtectionWait = (Number(target?.天魔炼化保护至) || 0) - now;
  const targetWait = Math.max(personalTargetWait, targetProtectionWait);
  if (targetWait > 0) {
    return { ok: false, reason: "此人的本源烙印尚未恢复", waitMs: targetWait };
  }
  return { ok: true, reason: "", waitMs: 0 };
}

export function calculateEssenceTransfer(target) {
  const transfer = {};
  for (const [key, rule] of Object.entries(TRANSFER_RULES)) {
    transfer[key] = calculateDrain(target?.[key], rule.rate, rule.reserve);
  }
  return transfer;
}

function applyRefinementGrowth(executor, state, now, weight) {
  const effectiveWeight = Math.max(0, Number(weight) || 0);
  state.炼化次数 = roundGrowth(state.炼化次数 + effectiveWeight);

  const root = executor.灵根;
  const previousOrb = Number(root.法球倍率) || 0;
  root.法球倍率 = Math.min(
    REFINEMENT_ORB_TARGET,
    roundGrowth(previousOrb + REFINEMENT_ORB_GAIN * effectiveWeight)
  );
  for (const key of ["攻击", "防御", "生命"]) {
    root[key] = roundGrowth(
      (Number(root[key]) || 0) + REFINEMENT_ATTRIBUTE_GAIN * effectiveWeight
    );
  }

  let evolved = false;
  if (
    root.法球倍率 >= REFINEMENT_ORB_TARGET &&
    root.name !== WANHUA_TIANMO_PHYSIQUE
  ) {
    const lifeEssenceDifference = Math.max(
      0,
      WANHUA_TIANMO_ROOT.生命本源 - (Number(root.生命本源) || 0)
    );
    executor.灵根 = { ...WANHUA_TIANMO_ROOT };
    executor.生命本源 = Math.max(0, Number(executor.生命本源) || 0) + lifeEssenceDifference;
    state.已蜕变 = true;
    state.蜕变时间 = now;
    evolved = true;
  }

  return {
    evolved,
    previousOrb,
    currentOrb: executor.灵根.法球倍率,
    refinementCount: state.炼化次数,
  };
}

export function applyTianmoRefinement(executor, target, options = {}) {
  const now = Number(options.now) || Date.now();
  const targetId = String(options.targetId ?? target?.id ?? "unknown");
  const transfer = calculateEssenceTransfer(target);
  const state = ensureTianmoHuashengState(executor);

  for (const [key, amount] of Object.entries(transfer)) {
    const executorValue = Math.max(0, Number(executor[key]) || 0);
    executor[key] = key === "生命本源"
      ? roundGrowth(executorValue + amount)
      : Math.floor(executorValue) + amount;
    const targetValue = Math.max(0, Number(target[key]) || 0);
    target[key] = key === "生命本源"
      ? roundGrowth(Math.max(0, targetValue - amount))
      : Math.max(0, Math.floor(targetValue) - amount);
  }

  state.上次炼化 = now;
  state.炼化记录[targetId] = now;
  target.天魔炼化保护至 = now + SAME_TARGET_COOLDOWN_MS;
  for (const [key, amount] of Object.entries(transfer)) {
    state.累计所得[key] += amount;
  }

  const growth = applyRefinementGrowth(executor, state, now, 1);

  return {
    transfer,
    ...growth,
  };
}

export function applyTianmoCalamityRefinement(executor, options = {}) {
  if (!isTianmoHuashengPhysique(executor) || !hasTianmoHuashengTechnique(executor)) {
    return { applied: false };
  }

  const now = Number(options.now) || Date.now();
  const refinementWeight = Math.max(0, Number(options.weight) || CALAMITY_REFINEMENT_WEIGHT);
  const state = ensureTianmoHuashengState(executor);
  const sourceLifeEssence = Math.max(1, Number(options.sourceLifeEssence) || 100);
  const lifeSourceGain = roundGrowth(
    calculateDrain(sourceLifeEssence, TRANSFER_RULES.生命本源.rate, TRANSFER_RULES.生命本源.reserve)
      * refinementWeight
  );
  executor.生命本源 = roundGrowth(Math.max(0, Number(executor.生命本源) || 0) + lifeSourceGain);
  state.累计所得.生命本源 = roundGrowth(state.累计所得.生命本源 + lifeSourceGain);
  state.灾厄炼化次数 += 1;
  return {
    applied: true,
    lifeSourceGain,
    refinementWeight,
    ...applyRefinementGrowth(executor, state, now, refinementWeight),
  };
}

export function grantTianmoHuashengTechnique(player, now = Date.now()) {
  if (player?.灵根?.name !== JIDAO_TIANMO_PHYSIQUE) return false;
  if (!Array.isArray(player.学习的功法)) player.学习的功法 = [];
  if (player.学习的功法.includes(TIANMO_HUASHENG_TECHNIQUE)) return false;

  player.学习的功法.push(TIANMO_HUASHENG_TECHNIQUE);
  const state = ensureTianmoHuashengState(player);
  state.传承时间 = Number(now) || Date.now();
  return true;
}

export function createTianmoTrialOpponent(player) {
  const opponent = JSON.parse(JSON.stringify(player));
  delete opponent.id;
  opponent.名号 = "万灵怨胎";
  opponent.攻击 = Math.max(1, Math.floor((Number(player.攻击) || 1) * 0.8));
  opponent.防御 = Math.max(1, Math.floor((Number(player.防御) || 1) * 0.75));
  opponent.血量上限 = Math.max(
    1,
    Math.floor((Number(player.血量上限) || 1) * 0.9)
  );
  opponent.当前血量 = opponent.血量上限;
  opponent.灵根 = {
    name: "万灵怨胎",
    type: "魔胎",
    eff: 0,
    法球倍率: Math.max(0.1, (Number(player.灵根?.法球倍率) || 0.1) * 0.75),
    攻击: 0,
    防御: 0,
    生命: 0,
    生命本源: 0,
  };
  opponent.法球倍率 = opponent.灵根.法球倍率;
  opponent.学习的功法 = [];
  opponent.当前使用的功法 = "";
  opponent.仙宠 = [];
  opponent.分身 = [];
  return opponent;
}
