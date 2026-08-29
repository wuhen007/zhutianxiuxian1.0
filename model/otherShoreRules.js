export const OTHER_SHORE_SUPPRESSION_MULTIPLIER = 0.7;

export const OTHER_SHORE_WORLD_RESTRICTIONS = Object.freeze({
  externalShop: false,
  externalPillHealing: false,
});

export const OTHER_SHORE_TRAVEL_TIERS = Object.freeze({
  below_emperor: Object.freeze({
    name: "大帝以下",
    mindPerStep: 5,
    stepsPerMind: 1,
  }),
  emperor: Object.freeze({ name: "大帝", mindPerStep: 1, stepsPerMind: 1 }),
  true_immortal: Object.freeze({
    name: "真仙",
    mindPerStep: 1,
    stepsPerMind: 2,
  }),
  immortal_king: Object.freeze({
    name: "仙王至仙王巨头",
    mindPerStep: 1,
    stepsPerMind: 3,
  }),
  quasi_immortal_emperor: Object.freeze({
    name: "准仙帝",
    mindPerStep: 1,
    stepsPerMind: 10,
  }),
  immortal_emperor: Object.freeze({
    name: "仙帝",
    mindPerStep: 0,
    stepsPerMind: Infinity,
  }),
});

const TIER_ORDER = Object.freeze([
  "below_emperor",
  "emperor",
  "true_immortal",
  "immortal_king",
  "quasi_immortal_emperor",
  "immortal_emperor",
]);

function tierFromRealmName(value) {
  const name = String(value || "").trim();
  if (!name) return "below_emperor";
  if (/准仙帝/.test(name)) return "quasi_immortal_emperor";
  if (/仙帝|祭道|路尽/.test(name)) return "immortal_emperor";
  if (/仙王|帝光仙王/.test(name)) return "immortal_king";
  if (/真仙|红尘仙/.test(name)) return "true_immortal";
  if (/大帝/.test(name)) return "emperor";
  return "below_emperor";
}

function tierFromLevel(level, thresholds) {
  const value = Math.max(0, Math.floor(Number(level) || 0));
  if (value >= thresholds.immortalEmperor) return "immortal_emperor";
  if (value >= thresholds.quasiImmortalEmperor) return "quasi_immortal_emperor";
  if (value >= thresholds.immortalKing) return "immortal_king";
  if (value >= thresholds.trueImmortal) return "true_immortal";
  if (value >= thresholds.emperor) return "emperor";
  return "below_emperor";
}

function strongerTier(left, right) {
  return TIER_ORDER.indexOf(left) >= TIER_ORDER.indexOf(right) ? left : right;
}

export function getOtherShoreTravelTier(playerOrRealm = {}) {
  if (typeof playerOrRealm === "string")
    return tierFromRealmName(playerOrRealm);

  const player = playerOrRealm || {};
  let tier = tierFromRealmName(player.境界 ?? player.realm ?? player.realmName);
  tier = strongerTier(
    tier,
    tierFromLevel(player.mijinglevel_id, {
      emperor: 16,
      trueImmortal: 17,
      immortalKing: 18,
      quasiImmortalEmperor: 20,
      immortalEmperor: 21,
    })
  );
  tier = strongerTier(
    tier,
    tierFromLevel(player.xiangulevel_id ?? player.xianggulevel_id, {
      emperor: Infinity,
      trueImmortal: 16,
      immortalKing: 17,
      quasiImmortalEmperor: 21,
      immortalEmperor: 22,
    })
  );
  tier = strongerTier(
    tier,
    tierFromLevel(player.huafenlevel_id, {
      emperor: 16,
      trueImmortal: 17,
      immortalKing: 19,
      quasiImmortalEmperor: 21,
      immortalEmperor: 22,
    })
  );
  return tier;
}

export function getOtherShoreTravelRule(playerOrRealm = {}) {
  const tier = getOtherShoreTravelTier(playerOrRealm);
  return { tier, ...OTHER_SHORE_TRAVEL_TIERS[tier] };
}

export function calculateOtherShoreMindCost(
  playerOrRealm,
  unanchoredSteps,
  remainder = 0
) {
  const steps = Number(unanchoredSteps);
  const carried = Number(remainder);
  if (!Number.isInteger(steps) || steps < 0)
    throw new Error("未锚定路径格数必须是非负整数");
  if (!Number.isInteger(carried) || carried < 0)
    throw new Error("心神路程余数必须是非负整数");

  const rule = getOtherShoreTravelRule(playerOrRealm);
  if (rule.mindPerStep === 0)
    return { ...rule, unanchoredSteps: steps, cost: 0, remainder: 0 };
  if (rule.stepsPerMind === 1) {
    if (carried !== 0) throw new Error("当前境界不使用心神路程余数");
    return {
      ...rule,
      unanchoredSteps: steps,
      cost: steps * rule.mindPerStep,
      remainder: 0,
    };
  }
  if (carried >= rule.stepsPerMind)
    throw new Error("心神路程余数超出当前境界范围");

  const total = carried + steps;
  return {
    ...rule,
    unanchoredSteps: steps,
    cost: Math.floor(total / rule.stepsPerMind),
    remainder: total % rule.stepsPerMind,
  };
}

export function isOtherShoreSuppressionImmune(player = {}) {
  const hasOwn = (target, key) =>
    Object.prototype.hasOwnProperty.call(target, key);
  const system = player?.自创修炼体系;
  const hasFormalSeedMark = hasOwn(player, "xiangu_yishenweizhong");
  const hasFormalSystemMark = Boolean(system && hasOwn(system, "name"));

  if (player?.xiangu_yishenweizhong === true) return true;
  if (typeof system?.name === "string" && system.name.trim()) return true;
  if (hasFormalSeedMark || hasFormalSystemMark) return false;

  return (
    Math.max(
      Number(player?.xiangulevel_id) || 0,
      Number(player?.xianggulevel_id) || 0
    ) >= 12
  );
}

export function getOtherShoreSuppression(player = {}) {
  const immune = isOtherShoreSuppressionImmune(player);
  const multiplier = immune ? 1 : OTHER_SHORE_SUPPRESSION_MULTIPLIER;
  return {
    immune,
    attributeMultiplier: multiplier,
    techniqueEffectMultiplier: multiplier,
  };
}

export function isOtherShoreExternalActionAllowed(action) {
  if (
    !Object.prototype.hasOwnProperty.call(
      OTHER_SHORE_WORLD_RESTRICTIONS,
      action
    )
  )
    throw new Error(`未知的彼岸外部行为：${action}`);
  return OTHER_SHORE_WORLD_RESTRICTIONS[action];
}
