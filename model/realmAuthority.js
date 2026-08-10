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
