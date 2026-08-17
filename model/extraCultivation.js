const EXTRA_CULTIVATION_PATHS = Object.freeze({
  mijing: Object.freeze({ field: 'mijinglevel_id', name: '人体秘境体系' }),
  xiangu: Object.freeze({ field: 'xiangulevel_id', name: '仙古今世法' }),
  huafen: Object.freeze({ field: 'huafenlevel_id', name: '花粉进化路' }),
});

function levelId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 1;
}

export function ensureExtraCultivationState(player) {
  if (!player || typeof player !== 'object') return player;
  if (player.xiangulevel_id === undefined) {
    player.xiangulevel_id = levelId(player.xianggulevel_id);
  }
  player.mijinglevel_id = levelId(player.mijinglevel_id);
  player.xiangulevel_id = levelId(player.xiangulevel_id);
  player.huafenlevel_id = levelId(player.huafenlevel_id);

  if (!EXTRA_CULTIVATION_PATHS[player.额外体系]) {
    const active = Object.entries(EXTRA_CULTIVATION_PATHS)
      .filter(([, path]) => player[path.field] > 1)
      .map(([key]) => key);
    if (active.length === 1) player.额外体系 = active[0];
    else if (player.额外体系 !== undefined) delete player.额外体系;
  }
  return player;
}

export function getActiveExtraCultivationPaths(player) {
  ensureExtraCultivationState(player);
  const active = Object.entries(EXTRA_CULTIVATION_PATHS)
    .filter(([, path]) => player?.[path.field] > 1)
    .map(([key]) => key);
  if (EXTRA_CULTIVATION_PATHS[player?.额外体系]) active.push(player.额外体系);
  return [...new Set(active)];
}

export function getExtraCultivationPathName(path) {
  return EXTRA_CULTIVATION_PATHS[path]?.name || '未知体系';
}

export function getExtraCultivationLevelSum(player) {
  ensureExtraCultivationState(player);
  // 保持旧公式“秘境 + 仙古”的初始值为 2，并加入花粉路的实际境界贡献。
  return player.mijinglevel_id + player.xiangulevel_id + player.huafenlevel_id - 1;
}

export function getExtraCultivationLevelProduct(player) {
  ensureExtraCultivationState(player);
  return player.mijinglevel_id * player.xiangulevel_id * player.huafenlevel_id;
}

export function canCultivateExtraPath(player, targetPath) {
  if (!EXTRA_CULTIVATION_PATHS[targetPath]) return false;
  const active = getActiveExtraCultivationPaths(player);
  return active.length === 0 || active.every(path => path === targetPath);
}

export function isCultivatingExtraPath(player, targetPath) {
  const active = getActiveExtraCultivationPaths(player);
  return active.length === 1 && active[0] === targetPath;
}

export function selectExtraCultivationPath(player, targetPath) {
  if (!canCultivateExtraPath(player, targetPath)) {
    const active = getActiveExtraCultivationPaths(player)
      .map(getExtraCultivationPathName)
      .join('、');
    return {
      ok: false,
      message: `你已踏上${active}，人体秘境、仙古今世法与花粉进化路不可兼修。`,
    };
  }
  player.额外体系 = targetPath;
  return { ok: true, path: targetPath, name: getExtraCultivationPathName(targetPath) };
}

export { EXTRA_CULTIVATION_PATHS };
