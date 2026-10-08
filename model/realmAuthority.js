const XIANGU_AUTHORITY_MAP = Object.freeze([
  [25, 24], // 唯一道之上
  [24, 23], // 祭道之上
  [23, 22], // 祭道
  [22, 21], // 路尽级仙帝
  [21, 20], // 准仙帝
  [19, 19], // 仙王巨头
  [17, 18], // 仙王
  [16, 17], // 真仙
  [15, 16], // 至尊
  [14, 15], // 遁一
  [13, 14], // 斩我
  [12, 13], // 虚道
  [11, 12], // 天神
  [9, 11],  // 真一、圣祭
  [8, 10],  // 神火
]);

const HUAFEN_AUTHORITY_MAP = Object.freeze([
  [25, 24], // 唯一道之上
  [24, 23], // 祭道之上
  [23, 22], // 祭道
  [22, 21], // 路尽级仙帝
  [21, 20], // 道祖、准仙帝
  [20, 19], // 仙王巨头
  [18, 18], // 宇究
  [17, 17], // 大宇、究极
  [15, 16], // 天尊及混元
  [14, 15], // 神王、恒王
  [13, 14], // 神将
  [12, 13], // 神祇
  [11, 12], // 映照诸天
  [10, 11], // 圣者、大圣
  [8, 10],  // 金身、亚圣
  [7, 9],   // 塑形
  [6, 8],   // 餐霞
  [5, 7],   // 观想
  [4, 6],   // 逍遥
]);

function levelId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function xianguAuthorityLevel(value) {
  const xianguLevel = levelId(value);
  return XIANGU_AUTHORITY_MAP.find(([required]) => xianguLevel >= required)?.[1] || xianguLevel;
}

export function getFlowerPollenAuthorityLevel(value) {
  const huafenLevel = levelId(value);
  return HUAFEN_AUTHORITY_MAP.find(([required]) => huafenLevel >= required)?.[1] || huafenLevel;
}

export function getRealmAuthorityLevel(player) {
  return Math.max(
    levelId(player?.mijinglevel_id),
    xianguAuthorityLevel(player?.xiangulevel_id),
    getFlowerPollenAuthorityLevel(player?.huafenlevel_id)
  );
}

export function hasRealmAuthority(player, requiredLevel) {
  return getRealmAuthorityLevel(player) >= levelId(requiredLevel);
}

export function getTianjiaoRealmTier(player) {
  const authorityLevel = getRealmAuthorityLevel(player);
  const xianguLevel = levelId(player?.xiangulevel_id);

  // 保留原有仙古路线的讨伐门槛，同时让花粉路按统一权柄参与匹配。
  if (authorityLevel >= 12 || xianguLevel >= 10) return 'full';
  if (authorityLevel >= 9 || xianguLevel >= 7) return 'matched';
  return 'below';
}

export function getYuanshenAdvancement(levels, currentLevel) {
  const current = levelId(currentLevel);
  const next = (Array.isArray(levels) ? levels : [])
    .find((item) => levelId(item?.level_id) === current + 1) || null;
  return {
    next,
    atMax: !next,
    requiredAuthority: next ? 10 + current : null,
  };
}

export function isHighRealmConsumableRestricted(player) {
  return levelId(player?.mijinglevel_id) > 19
    || levelId(player?.xiangulevel_id) > 19
    || getFlowerPollenAuthorityLevel(player?.huafenlevel_id) > 19;
}

export function getGodDemonStealRule(attacker, defender) {
  const attackerLevel = getRealmAuthorityLevel(attacker);
  const defenderLevel = getRealmAuthorityLevel(defender);
  const gap = defenderLevel - attackerLevel;
  const linLevel = Math.max(0, Math.min(9, Math.trunc(Number(attacker?._临字秘加成倍率) || 0)));
  const hasJiezi = Boolean(attacker?.皆字秘触发);
  const hasLinzOneToEight = linLevel >= 1 && linLevel <= 8;
  const hasShenjin = linLevel === 9;

  let maxGap = 0;
  if (hasJiezi && hasShenjin) maxGap = 3;
  else if (hasShenjin) maxGap = 2;
  else if (hasJiezi || hasLinzOneToEight) maxGap = 1;

  const emperorDiscount = defenderLevel >= 16;
  const base = {
    attackerLevel,
    defenderLevel,
    gap,
    maxGap,
    ratioMultiplier: emperorDiscount ? 0.25 : 1,
    chance: 1,
  };

  if (gap > 0 && defenderLevel >= 20) {
    return { ...base, allowed: false, chance: 0, maxGap: 0, reason: '境界天堑横断因果，低境神魔之力触及不到高境道果' };
  }
  if (gap <= 0) return { ...base, allowed: true, reason: '目标境界不高于自身' };
  if (gap > maxGap) return { ...base, allowed: false, reason: '缺少对应九秘领域，无法跨境夺取' };

  // 大帝之下皆蝼蚁：圣王等更低境界即使叠加皆字秘与神禁也不能夺帝。
  if (emperorDiscount && attackerLevel < 16) {
    const quasiEmperorWithJieShen = attackerLevel >= 15 && hasJiezi && hasShenjin;
    if (!quasiEmperorWithJieShen) return { ...base, allowed: false, reason: '帝境威严不可被低境界剥夺' };
    return { ...base, allowed: true, chance: 0.2, reason: '准帝叠加皆字秘与神禁，获得有限夺帝机会' };
  }

  return { ...base, allowed: true, reason: '九秘领域满足跨境条件' };
}

export function getRealmAuthorityPath(player) {
  if (['mijing', 'xiangu', 'huafen'].includes(player?.额外体系)) return player.额外体系;
  const mijingLevel = levelId(player?.mijinglevel_id);
  const xianguLevel = xianguAuthorityLevel(player?.xiangulevel_id);
  const huafenLevel = getFlowerPollenAuthorityLevel(player?.huafenlevel_id);
  if (huafenLevel >= Math.max(mijingLevel, xianguLevel) && levelId(player?.huafenlevel_id) > 1) return 'huafen';
  return xianguLevel > mijingLevel ? 'xiangu' : 'mijing';
}

export function getRealmAuthorityName(player, mijingLevels = [], xianguLevels = [], huafenLevels = []) {
  const path = getRealmAuthorityPath(player);
  const levels = path === 'xiangu' ? xianguLevels : path === 'huafen' ? huafenLevels : mijingLevels;
  const currentLevel = path === 'xiangu' ? levelId(player?.xiangulevel_id)
    : path === 'huafen' ? levelId(player?.huafenlevel_id)
      : levelId(player?.mijinglevel_id);
  return levels.find(item => levelId(item?.level_id) === currentLevel)?.level ||
    (path === 'huafen' ? '花粉进化路第' + currentLevel + '阶' : '未知境界');
}

export function resetSelfDaoAfterImmortalEmperorFall(player, now = Date.now()) {
  if (!player || typeof player !== 'object') return { ok: false, reason: 'player' };
  const state = player.己道推演 && typeof player.己道推演 === 'object'
    ? player.己道推演
    : {};
  if (!state.completed && !String(player.自身之道境界 || '').includes('仙帝')) {
    return { ok: false, reason: 'not-immortal-emperor', state };
  }

  state.attempts = 0;
  state.sacrificeAttempts = 0;
  state.pathAwakened = false;
  state.battlePending = false;
  state.completed = false;
  state.recovery = null;
  state.quasiEmperorPeak = false;
  state.halfImmortalEmperor = false;
  delete state.quasiEmperorPeakAt;
  delete state.divineEmbryo;
  delete state.divineEmbryoAt;
  delete state.halfImmortalEmperorAt;
  delete state.awakenedAt;
  delete state.completedAt;
  delete state.lastDeductionAt;
  delete state.lastSacrificeDeductionAt;
  delete state.terrorTriggered;
  delete state.terrorTriggeredAt;
  state.resetAt = now;
  state.progressionVersion = 2;
  player.己道推演 = state;

  player.自身之道境界 = '准仙帝·自身道果';
  player.自身之道根基 = '准仙帝道基';
  player.境界称号 = '准仙帝';
  player.道果状态 = '准仙帝·己道待重证';
  if (player.自创修炼体系) {
    player.自创修炼体系.stage = '六境圆满·准仙帝';
    delete player.自创修炼体系.emperorAt;
  }
  return { ok: true, state };
}

export function lowerRealmAuthority(player, amount = 1) {
  const previousAuthority = getRealmAuthorityLevel(player);
  const path = getRealmAuthorityPath(player);
  const field = path === 'xiangu' ? 'xiangulevel_id'
    : path === 'huafen' ? 'huafenlevel_id' : 'mijinglevel_id';
  player[field] = Math.max(1, levelId(player?.[field]) - Math.max(1, levelId(amount)));
  // 境界跌落即削帝路资格：清掉对应体系破王成帝的「passed」烙印，跌落玩家须重渡帝劫。
  revokeBreakKingEmperorEligibility(player, path);
  if (previousAuthority >= 21 && getRealmAuthorityLevel(player) < 21) {
    resetSelfDaoAfterImmortalEmperorFall(player);
  }
  return path;
}

/**
 * 削除某体系的帝路资格（破王成帝劫烙印）。
 * 只清除 status === 'passed' 的记录；failed 记录（含冷却）保留，避免跌落反而白嫖冷却重置。
 * 直接操作 player.时间线权能，不依赖 worldlineAuthority，避免循环引用。
 * @returns {boolean} 是否清除了 passed 烙印
 */
export function revokeBreakKingEmperorEligibility(player, route) {
  const state = player?.时间线权能;
  if (!state?.tribulations || !route) return false;
  const record = state.tribulations[route];
  if (!record || record.status !== 'passed') return false;
  delete state.tribulations[route];
  if (Array.isArray(state.history)) {
    state.history.push({ type: '帝路资格', result: 'revoked', route, at: Date.now() });
  }
  return true;
}
