import { getActiveZhutianAvatarName } from "./zhutianMirror.js";

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
  仙道潜力: { rate: 0.2, reserve: 0 },
  修为: { rate: 0.2, reserve: 0 },
  血气: { rate: 0.2, reserve: 0 },
  寿元: { rate: 0.1, reserve: 1 },
  生命本源: { rate: 0.2, reserve: 1 },
});

// —— 炼化成长上限（杜绝无限炼化）——
// 灵根模板基准：极道天魔 = 灵根列表 7010010，无相·万化天魔体 = 7010020（与 WANHUA_TIANMO_ROOT 同源）
const TIANMO_ROOT_TEMPLATES = Object.freeze({
  [JIDAO_TIANMO_PHYSIQUE]: Object.freeze({
    法球倍率: 2,
    攻击: 3,
    防御: 2,
    生命: 2,
    生命本源: 150,
  }),
  [WANHUA_TIANMO_PHYSIQUE]: Object.freeze({
    法球倍率: 5,
    攻击: 8,
    防御: 3.5,
    生命: 8,
    生命本源: 500,
  }),
});
// 灵根 攻击/防御/生命 加成不得超过自身灵根模板对应加成 × 1.5
export const REFINEMENT_ATTRIBUTE_CAP_RATIO = 1.5;
// 生命本源不得超过自身灵根本源模板值 × 2
export const REFINEMENT_LIFE_SOURCE_CAP_RATIO = 2;

export function getTianmoRootTemplate(player) {
  return TIANMO_ROOT_TEMPLATES[player?.灵根?.name] || null;
}

export function getRefinementGrowthCaps(player) {
  const template = getTianmoRootTemplate(player);
  if (!template) return null;
  const attributes = {};
  for (const key of ['攻击', '防御', '生命']) {
    attributes[key] = roundGrowth(template[key] * REFINEMENT_ATTRIBUTE_CAP_RATIO);
  }
  return {
    attributes,
    lifeSource: roundGrowth(template.生命本源 * REFINEMENT_LIFE_SOURCE_CAP_RATIO),
  };
}

// 计算生命本源实际可入账量（已达上限则 0，超出部分散逸）
export function getLifeSourceCredit(executor, amount) {
  const caps = getRefinementGrowthCaps(executor);
  if (!caps) return Math.max(0, Number(amount) || 0);
  const current = Math.max(0, Number(executor?.生命本源) || 0);
  return Math.max(0, Math.min(Number(amount) || 0, caps.lifeSource - current));
}

function roundGrowth(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function calculateDrain(value, rate, reserve) {
  const available = Math.max(0, Math.floor(Number(value) || 0) - reserve);
  if (available === 0) return 0;
  return Math.min(available, Math.max(1, Math.floor(available * rate)));
}

export function getCalamityRefinementResourceGains(player) {
  return {
    cultivation: Math.max(1, Math.floor((Number(player?.修为) || 0) * 0.02)),
    blood: Math.max(1, Math.floor((Number(player?.血气) || 0) * 0.02)),
    soul: Math.max(1, Math.floor((Number(player?.元神) || 0) * 0.01)),
  };
}

export function calculateCalamityLifeSourceGain(sourceLifeEssence, weight = CALAMITY_REFINEMENT_WEIGHT) {
  const source = Math.max(1, Number(sourceLifeEssence) || 100);
  const effectiveWeight = Math.max(0, Number(weight) || 0);
  return roundGrowth(
    calculateDrain(source, TRANSFER_RULES.生命本源.rate, TRANSFER_RULES.生命本源.reserve)
      * effectiveWeight
  );
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
  const avatarName = getActiveZhutianAvatarName(player);
  if (avatarName) {
    return { ok: false, reason: "avatar_loaded", avatarName, waitMs: 0 };
  }
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
  // 灵根 攻击/防御/生命 加成不得超过自身灵根模板 × REFINEMENT_ATTRIBUTE_CAP_RATIO（只拦增长、不回退）
  const caps = getRefinementGrowthCaps(executor);
  for (const key of ["攻击", "防御", "生命"]) {
    const base = Number(root[key]) || 0;
    const gained = roundGrowth(base + REFINEMENT_ATTRIBUTE_GAIN * effectiveWeight);
    root[key] = caps
      ? roundGrowth(Math.min(gained, Math.max(base, caps.attributes[key])))
      : gained;
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

  // 以（蜕变后）当前灵根模板判定是否已达成长上限
  const finalCaps = getRefinementGrowthCaps(executor);
  const attributeCapped = finalCaps
    ? ["攻击", "防御", "生命"].every((key) => (Number(executor.灵根[key]) || 0) >= finalCaps.attributes[key])
    : false;
  const lifeSourceCapped = finalCaps
    ? (Number(executor.生命本源) || 0) >= finalCaps.lifeSource
    : false;

  return {
    evolved,
    previousOrb,
    currentOrb: executor.灵根.法球倍率,
    refinementCount: state.炼化次数,
    attributeCapped,
    lifeSourceCapped,
  };
}

export function applyTianmoRefinement(executor, target, options = {}) {
  const avatarName = getActiveZhutianAvatarName(executor);
  if (avatarName) {
    return { applied: false, reason: "avatar_loaded", avatarName };
  }
  const now = Number(options.now) || Date.now();
  const targetId = String(options.targetId ?? target?.id ?? "unknown");
  const transfer = calculateEssenceTransfer(target);
  // 执行者实际入账：生命本源受「不超过自身灵根本源 2 倍」封顶，超出部分散逸；修为血气等资源原额入账
  const credited = {
    ...transfer,
    生命本源: getLifeSourceCredit(executor, transfer.生命本源),
  };
  const state = ensureTianmoHuashengState(executor);

  // 目标被完整抽取（掠夺行为照常发生，不因执行者饱和而减免）
  for (const [key, amount] of Object.entries(transfer)) {
    const targetValue = Math.max(0, Number(target[key]) || 0);
    target[key] = key === "生命本源"
      ? roundGrowth(Math.max(0, targetValue - amount))
      : Math.max(0, Math.floor(targetValue) - amount);
  }

  state.上次炼化 = now;
  state.炼化记录[targetId] = now;
  target.天魔炼化保护至 = now + SAME_TARGET_COOLDOWN_MS;
  // 执行者入账（以实际 credited 为准，避免在满上限时虚增累计所得）
  for (const [key, amount] of Object.entries(credited)) {
    const executorValue = Math.max(0, Number(executor[key]) || 0);
    executor[key] = key === "生命本源"
      ? roundGrowth(executorValue + amount)
      : Math.floor(executorValue) + amount;
    state.累计所得[key] += amount;
  }

  const growth = applyRefinementGrowth(executor, state, now, 1);

  return {
    applied: true,
    transfer: credited,
    ...growth,
  };
}

export function applyTianmoCalamityRefinement(executor, options = {}) {
  const avatarName = getActiveZhutianAvatarName(executor);
  if (avatarName) {
    return { applied: false, reason: "avatar_loaded", avatarName };
  }
  if (!isTianmoHuashengPhysique(executor) || !hasTianmoHuashengTechnique(executor)) {
    return { applied: false };
  }

  const now = Number(options.now) || Date.now();
  const refinementWeight = Math.max(0, Number(options.weight) || CALAMITY_REFINEMENT_WEIGHT);
  const state = ensureTianmoHuashengState(executor);
  const rawLifeSourceGain = calculateCalamityLifeSourceGain(options.sourceLifeEssence, refinementWeight);
  // 生命本源受「不超过自身灵根本源 2 倍」封顶，超出部分散逸
  const lifeSourceGain = roundGrowth(getLifeSourceCredit(executor, rawLifeSourceGain));
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
