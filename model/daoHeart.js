/**
 * 道心统一规则。
 *
 * 旧存档曾同时使用「道心」和「道心值」，这里始终同步两个字段，
 * 让新系统可以渐进迁移而不破坏已有战斗、搜魂和展示逻辑。
 */
export const DAO_HEART_INITIAL = 100;
export const DAO_HEART_MAX = 500;
export const DAO_HEART_MIN = 0;
export const DAO_HEART_RECOVERY_INTERVAL_MS = 30 * 60 * 1000;

const HISTORY_LIMIT = 30;

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value) {
  return Math.max(DAO_HEART_MIN, Math.min(DAO_HEART_MAX, Math.floor(Number(value) || 0)));
}

function readStoredValue(player) {
  const daoHeart = finite(player?.道心);
  const legacy = finite(player?.道心值);
  if (daoHeart !== null) return daoHeart;
  if (legacy !== null) return legacy;
  return DAO_HEART_INITIAL;
}

function sync(player, value) {
  if (!player || typeof player !== 'object') return clamp(value);
  const next = clamp(value);
  player.道心 = next;
  player.道心值 = next;
  return next;
}

/**
 * 读取并惰性结算自然恢复。每次调用最多补齐已经经过的半小时档位。
 */
export function ensureDaoHeart(player, now = Date.now()) {
  if (!player || typeof player !== 'object') return DAO_HEART_INITIAL;

  let value = sync(player, readStoredValue(player));
  const currentTime = Number(now) || Date.now();
  const lastRecovery = finite(player.道心上次恢复时间);
  if (lastRecovery === null) {
    player.道心上次恢复时间 = currentTime;
    return value;
  }

  const ticks = Math.max(0, Math.floor((currentTime - lastRecovery) / DAO_HEART_RECOVERY_INTERVAL_MS));
  if (ticks > 0) {
    value = sync(player, value + ticks);
    player.道心上次恢复时间 = lastRecovery + ticks * DAO_HEART_RECOVERY_INTERVAL_MS;
  }
  return value;
}

export function getDaoHeart(player, now = Date.now()) {
  return ensureDaoHeart(player, now);
}

export function setDaoHeart(player, value, reason = '调整道心', now = Date.now()) {
  const before = ensureDaoHeart(player, now);
  const after = sync(player, value);
  if (player && before !== after) recordDaoHeartChange(player, before, after, reason, now);
  return { before, after, change: after - before, reason };
}

export function adjustDaoHeart(player, delta, reason = '道心变动', now = Date.now()) {
  const before = ensureDaoHeart(player, now);
  const change = Number(delta) || 0;
  const after = sync(player, before + change);
  if (player && before !== after) recordDaoHeartChange(player, before, after, reason, now);
  return { before, after, change: after - before, reason };
}

export function recoverDaoHeart(player, now = Date.now()) {
  const before = finite(player?.道心);
  const after = ensureDaoHeart(player, now);
  return { before: before === null ? after : before, after, change: after - (before === null ? after : before) };
}

function recordDaoHeartChange(player, before, after, reason, now) {
  if (!Array.isArray(player.道心变动记录)) player.道心变动记录 = [];
  player.道心变动记录.push({
    time: Number(now) || Date.now(),
    before,
    after,
    change: after - before,
    reason,
  });
  if (player.道心变动记录.length > HISTORY_LIMIT) {
    player.道心变动记录.splice(0, player.道心变动记录.length - HISTORY_LIMIT);
  }
}

export function getDaoHeartStage(valueOrPlayer) {
  const value = typeof valueOrPlayer === 'object'
    ? getDaoHeart(valueOrPlayer)
    : clamp(valueOrPlayer);
  if (value >= DAO_HEART_MAX) return { key: '圆满', name: '道心圆满', index: 5, value };
  if (value >= 400) return { key: '坚定', name: '道心坚定', index: 4, value };
  if (value >= 250) return { key: '稳固', name: '道心稳固', index: 3, value };
  if (value >= 150) return { key: '不稳', name: '道心不稳', index: 2, value };
  if (value >= 50) return { key: '受损', name: '道心受损', index: 1, value };
  return { key: '崩碎', name: '道心崩碎', index: 0, value };
}

export function getDaoHeartRatio(player, now = Date.now()) {
  return getDaoHeart(player, now) / DAO_HEART_MAX;
}

/** 低道心承受更多心魔、道心劫、少年大帝劫和帝兵劫伤害。 */
export function getDaoHeartDamageMultiplier(player, now = Date.now()) {
  const ratio = getDaoHeartRatio(player, now);
  return Number((1 + (1 - ratio) * 0.8).toFixed(4));
}

/** 低道心会降低悟道收益，并略微抬高悟道消耗。 */
export function getDaoHeartWudaoGainMultiplier(player, now = Date.now()) {
  return Number((0.5 + getDaoHeartRatio(player, now) * 0.5).toFixed(4));
}

export function getDaoHeartWudaoCostMultiplier(player, now = Date.now()) {
  return Number((1 + (1 - getDaoHeartRatio(player, now)) * 0.5).toFixed(4));
}

/** 学习高阶功法时使用的成功率倍率，最低保留 55%。 */
export function getDaoHeartLearningChanceMultiplier(player, now = Date.now()) {
  return Number((0.55 + getDaoHeartRatio(player, now) * 0.45).toFixed(4));
}

/** 逆活九世的阶段数，时代越晚、道心越低，所需资源越多。 */
export function getReverseLifeDaoHeartStageCount(player, eraIndex = 0, now = Date.now()) {
  const stage = getDaoHeartStage(getDaoHeart(player, now));
  return Math.max(1, Number(eraIndex) + 1 + stage.index);
}

export function getReverseLifeCostProfile(player, life, eraIndex = 0, now = Date.now()) {
  const currentLife = Math.max(1, Number(life) || 1);
  const stageCount = getReverseLifeDaoHeartStageCount(player, eraIndex, now);
  const ratio = getDaoHeartRatio(player, now);
  const growth = 1 + (currentLife - 1) * 0.18;
  const heartPenalty = 1 + (1 - ratio) * 0.4;
  const stagePenalty = 1 + Math.max(0, stageCount - 1) * 0.08;
  const multiplier = Number((growth * heartPenalty * stagePenalty).toFixed(4));
  return {
    stageCount,
    multiplier,
    potential: Math.max(1, Math.ceil(currentLife * multiplier)),
    spirit: Math.max(1, Math.ceil(currentLife * 2 * multiplier)),
    lifespan: Math.max(1, Math.ceil(currentLife * 500 * multiplier)),
  };
}

export const DAO_HEART_FRUITS = Object.freeze({
  凡品道心果: 3,
  玄品道心果: 8,
  灵品道心果: 15,
  仙品道心果: 25,
  圣品道心果: 40,
  帝品道心果: 100,
});

export function getDaoHeartFruitValue(name) {
  return DAO_HEART_FRUITS[String(name || '')] || 0;
}
