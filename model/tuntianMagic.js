import { getActiveZhutianAvatarName } from "./zhutianMirror.js";

export const TUNTIAN_TECHNIQUE = "吞天魔功";
export const TUNTIAN_SOURCE_TARGET = 10;
export const SAINT_REMAINS_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const SAINT_REMAINS_SUCCESS_CHANCE = 0.4;
export const TUNTIAN_HOLY_LANDS = Object.freeze([
  "摇光圣地",
  "姬家",
  "姜家",
  "瑶池圣地",
  "紫府圣地",
  "万初圣地",
]);

const DEVOURER_PHYSIQUES = new Set(["伪·魔胎仙体", "魔胎仙体"]);
const CHAOS_ROOT = Object.freeze({
  id: 70051,
  name: "混沌体",
  type: "混沌体",
  归类: "遮天位面",
  eff: 72,
  法球倍率: 1.45,
  攻击: 5,
  防御: 5,
  生命: 5,
  生命本源: 200,
});

export function hasTuntianTechnique(player) {
  return (
    Array.isArray(player?.学习的功法) &&
    player.学习的功法.includes(TUNTIAN_TECHNIQUE)
  );
}

export function ensureTuntianState(player) {
  if (
    !player.吞天魔功修炼 ||
    typeof player.吞天魔功修炼 !== "object" ||
    Array.isArray(player.吞天魔功修炼)
  ) {
    player.吞天魔功修炼 = {};
  }
  const state = player.吞天魔功修炼;
  state.本源 = Math.min(
    TUNTIAN_SOURCE_TARGET,
    Math.max(0, Math.floor(Number(state.本源) || 0))
  );
  state.上次遗骸吞噬 = Math.max(0, Number(state.上次遗骸吞噬) || 0);
  state.吞噬记录 = Array.isArray(state.吞噬记录)
    ? state.吞噬记录.slice(-10)
    : [];
  state.已化混沌 = Boolean(
    state.已化混沌 || player.灵根?.name === CHAOS_ROOT.name
  );
  return state;
}

export function getTuntianEligibility(player) {
  const avatarName = getActiveZhutianAvatarName(player);
  if (avatarName) {
    return {
      ok: false,
      completed: false,
      reason: "avatar_loaded",
      avatarName,
    };
  }
  if (player?.灵根?.name === CHAOS_ROOT.name) {
    return {
      ok: false,
      completed: true,
      reason: "你已化成混沌体，无需再吞噬本源。",
    };
  }
  if (!hasTuntianTechnique(player)) {
    return { ok: false, completed: false, reason: "你尚未学会【吞天魔功】。" };
  }
  if (!DEVOURER_PHYSIQUES.has(player?.灵根?.name)) {
    return {
      ok: false,
      completed: false,
      reason: "唯有魔胎仙体能够承载吞天本源。",
    };
  }
  return { ok: true, completed: false, reason: "" };
}

export function getSaintRemainsAvailability(player, now = Date.now()) {
  const eligibility = getTuntianEligibility(player);
  if (!eligibility.ok) return { ...eligibility, waitMs: 0 };
  const state = ensureTuntianState(player);
  const waitMs = state.上次遗骸吞噬 + SAINT_REMAINS_COOLDOWN_MS - now;
  return waitMs > 0
    ? {
        ok: false,
        completed: false,
        reason: "今日已经潜入过圣地祖陵。",
        waitMs,
      }
    : { ok: true, completed: false, reason: "", waitMs: 0 };
}

export function absorbTuntianSource(player, source, now = Date.now()) {
  const eligibility = getTuntianEligibility(player);
  if (!eligibility.ok) return { gained: false, evolved: false, ...eligibility };

  const state = ensureTuntianState(player);
  if (state.本源 >= TUNTIAN_SOURCE_TARGET) {
    return {
      gained: false,
      evolved: false,
      completed: true,
      reason: "吞天本源已经圆满。",
    };
  }

  state.本源 += 1;
  state.吞噬记录.push({
    类型: source?.类型 || "未知本源",
    目标: source?.目标 || "无名生灵",
    时间: now,
  });
  state.吞噬记录 = state.吞噬记录.slice(-10);
  player.魔道值 = Math.max(0, Number(player.魔道值) || 0) + 20;

  let evolved = false;
  if (state.本源 >= TUNTIAN_SOURCE_TARGET) {
    const previousRoot = player.灵根 || {};
    const lifeEssenceGain = Math.max(
      0,
      CHAOS_ROOT.生命本源 - (Number(previousRoot.生命本源) || 0)
    );
    player.灵根 = {
      ...CHAOS_ROOT,
      eff: Math.max(CHAOS_ROOT.eff, Number(previousRoot.eff) || 0),
      法球倍率: Math.max(
        CHAOS_ROOT.法球倍率,
        Number(previousRoot.法球倍率) || 0
      ),
      攻击: Math.max(CHAOS_ROOT.攻击, Number(previousRoot.攻击) || 0),
      防御: Math.max(CHAOS_ROOT.防御, Number(previousRoot.防御) || 0),
      生命: Math.max(CHAOS_ROOT.生命, Number(previousRoot.生命) || 0),
    };
    player.生命本源 =
      Math.max(0, Number(player.生命本源) || 0) + lifeEssenceGain;
    state.已化混沌 = true;
    state.蜕变时间 = now;
    evolved = true;
  }

  return {
    gained: true,
    evolved,
    completed: evolved,
    count: state.本源,
    target: TUNTIAN_SOURCE_TARGET,
    source: state.吞噬记录.at(-1),
  };
}

export function attemptSaintRemains(player, holyLand, options = {}) {
  const now = options.now === undefined ? Date.now() : Number(options.now);
  const availability = getSaintRemainsAvailability(player, now);
  if (!availability.ok)
    return { attempted: false, success: false, ...availability };

  const state = ensureTuntianState(player);
  state.上次遗骸吞噬 = now;
  const random = options.random || Math.random;
  if (random() >= SAINT_REMAINS_SUCCESS_CHANCE) {
    return {
      attempted: true,
      success: false,
      evolved: false,
      count: state.本源,
    };
  }

  const result = absorbTuntianSource(
    player,
    {
      类型: "先贤遗骸",
      目标: `${holyLand}先贤遗骸`,
    },
    now
  );
  return { attempted: true, success: result.gained, ...result };
}
