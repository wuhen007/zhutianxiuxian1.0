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

function levelId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function xianguAuthorityLevel(value) {
  const xianguLevel = levelId(value);
  return XIANGU_AUTHORITY_MAP.find(([required]) => xianguLevel >= required)?.[1] || xianguLevel;
}

export function getRealmAuthorityLevel(player) {
  return Math.max(
    levelId(player?.mijinglevel_id),
    xianguAuthorityLevel(player?.xiangulevel_id)
  );
}

export function hasRealmAuthority(player, requiredLevel) {
  return getRealmAuthorityLevel(player) >= levelId(requiredLevel);
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
  const mijingLevel = levelId(player?.mijinglevel_id);
  const xianguLevel = xianguAuthorityLevel(player?.xiangulevel_id);
  return xianguLevel > mijingLevel ? 'xiangu' : 'mijing';
}

export function getRealmAuthorityName(player, mijingLevels = [], xianguLevels = []) {
  const path = getRealmAuthorityPath(player);
  const levels = path === 'xiangu' ? xianguLevels : mijingLevels;
  const currentLevel = path === 'xiangu'
    ? levelId(player?.xiangulevel_id)
    : levelId(player?.mijinglevel_id);
  return levels.find(item => levelId(item?.level_id) === currentLevel)?.level || '未知境界';
}

export function lowerRealmAuthority(player, amount = 1) {
  const path = getRealmAuthorityPath(player);
  const field = path === 'xiangu' ? 'xiangulevel_id' : 'mijinglevel_id';
  player[field] = Math.max(1, levelId(player?.[field]) - Math.max(1, levelId(amount)));
  return path;
}
