const EXTRA_CULTIVATION_PATHS = Object.freeze({
  mijing: Object.freeze({ field: 'mijinglevel_id', name: '人体秘境体系' }),
  xiangu: Object.freeze({ field: 'xiangulevel_id', name: '仙古今世法' }),
  huafen: Object.freeze({ field: 'huafenlevel_id', name: '花粉进化路' }),
});

export const XIANGU_COMPANION_MIJING_MILESTONES = Object.freeze({
  12: 5, // 虚道 -> 轮海彼岸
  13: 6, // 斩我 -> 道宫
  14: 7, // 遁一 -> 四极
  15: 8, // 至尊 -> 化龙九重天
});

function levelId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 1;
}

export function getXianguCompanionMijingTarget(player) {
  const xianguLevel = levelId(player?.xiangulevel_id ?? player?.xianggulevel_id);
  let targetLevelId = 1;
  for (const [requiredXianguLevel, mijingLevel] of Object.entries(
    XIANGU_COMPANION_MIJING_MILESTONES
  )) {
    if (xianguLevel >= Number(requiredXianguLevel)) targetLevelId = mijingLevel;
  }

  if (xianguLevel >= 15) {
    const completedLives = Math.max(
      0,
      Math.min(9, Math.trunc(Number(player?.nihuo_count) || 1) - 1)
    );
    targetLevelId = Math.max(targetLevelId, 8 + completedLives);
  }
  return targetLevelId;
}

export function syncXianguCompanionMijing(player) {
  const previousLevelId = levelId(player?.mijinglevel_id);
  const targetLevelId = getXianguCompanionMijingTarget(player);
  if (!player || player.额外体系 !== 'xiangu' || targetLevelId <= previousLevelId) {
    return { changed: false, previousLevelId, targetLevelId: previousLevelId };
  }
  player.mijinglevel_id = targetLevelId;
  return { changed: true, previousLevelId, targetLevelId };
}

export function canStartRedDustPath(player) {
  ensureExtraCultivationState(player);
  return levelId(player?.mijinglevel_id) >= 16
    || (
      player?.额外体系 === 'xiangu'
      && levelId(player?.xiangulevel_id) >= 15
    );
}

export function ensureExtraCultivationState(player) {
  if (!player || typeof player !== 'object') return player;
  if (player.xiangulevel_id === undefined) {
    player.xiangulevel_id = levelId(player.xianggulevel_id);
  }
  player.mijinglevel_id = levelId(player.mijinglevel_id);
  player.xiangulevel_id = levelId(player.xiangulevel_id);
  player.huafenlevel_id = levelId(player.huafenlevel_id);

  // 兼容旧回炉存档：尊者及以下不应保留已点燃神火与仙气。
  if (player.xiangulevel_id < 8) {
    delete player.xiangu_shenhuo;
    if (player.xiangu_xianqi !== undefined) player.xiangu_xianqi = 0;
    delete player.xiangu_xianqi_detail;
    delete player.xiangu_xianqi_three_complete;
  }

  const companionTarget = getXianguCompanionMijingTarget(player);
  if (
    !EXTRA_CULTIVATION_PATHS[player.额外体系]
    && player.xiangulevel_id >= 12
    && player.huafenlevel_id === 1
    && player.mijinglevel_id <= companionTarget
  ) {
    player.额外体系 = 'xiangu';
  }

  if (!EXTRA_CULTIVATION_PATHS[player.额外体系]) {
    const active = Object.entries(EXTRA_CULTIVATION_PATHS)
      .filter(([, path]) => player[path.field] > 1)
      .map(([key]) => key);
    if (active.length === 1) player.额外体系 = active[0];
    else if (player.额外体系 !== undefined) delete player.额外体系;
  }
  syncXianguCompanionMijing(player);
  return player;
}

export function getActiveExtraCultivationPaths(player) {
  ensureExtraCultivationState(player);
  const companionTarget = getXianguCompanionMijingTarget(player);
  const hasXianguCompanionMijing = player?.额外体系 === 'xiangu'
    && player.xiangulevel_id > 1
    && player.mijinglevel_id <= companionTarget;
  const active = Object.entries(EXTRA_CULTIVATION_PATHS)
    .filter(([key, path]) => (
      player?.[path.field] > 1
      && !(key === 'mijing' && hasXianguCompanionMijing)
    ))
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

/**
 * 回炉重造：额外体系各自回退一级，并清空已经达成的极境记录。
 * 体系最低保持在初始等级1，避免影响玩家的基础存档结构。
 */
export function reforgeExtraCultivationState(player) {
  ensureExtraCultivationState(player);
  const selectedPath = player.额外体系;
  const hadXianguCompanionMijing = selectedPath === 'xiangu'
    && player.mijinglevel_id <= getXianguCompanionMijingTarget(player);
  const previousLevels = {};
  const nextLevels = {};
  const changedPaths = [];

  for (const [path, config] of Object.entries(EXTRA_CULTIVATION_PATHS)) {
    const previous = levelId(player[config.field]);
    const next = previous > 1 ? previous - 1 : previous;
    previousLevels[path] = previous;
    nextLevels[path] = next;
    if (next !== previous) {
      player[config.field] = next;
      changedPaths.push(path);
    }
  }

  if (hadXianguCompanionMijing) {
    const companionLevel = getXianguCompanionMijingTarget(player);
    player.mijinglevel_id = companionLevel;
    nextLevels.mijing = companionLevel;
    if (companionLevel !== previousLevels.mijing && !changedPaths.includes('mijing')) {
      changedPaths.push('mijing');
    }
  }

  if (!changedPaths.length) {
    return { changed: false, changedPaths, previousLevels, nextLevels };
  }

  delete player.额外体系;
  ensureExtraCultivationState(player);

  // 三条路线的极境属于当前根基，回退后必须重新冲击，避免旧极境继续提供加成。
  player.极境 = [];
  player.花粉极境 = [];
  delete player.花粉路分支;
  delete player.花粉路前身分支;
  if (nextLevels.xiangu < 8) {
    delete player.xiangu_shenhuo;
  } else if (player.xiangu_shenhuo && typeof player.xiangu_shenhuo === 'object') {
    player.xiangu_shenhuo.极境达成 = false;
    delete player.xiangu_shenhuo.极境名称;
  }
  if (player.xiangu_xianqi && typeof player.xiangu_xianqi === 'object') {
    player.xiangu_xianqi.strands = 0;
    player.xiangu_xianqi.max = Math.max(3, Number(player.xiangu_xianqi.max) || 0);
  } else if (player.xiangu_xianqi !== undefined) {
    player.xiangu_xianqi = 0;
  }
  delete player.xiangu_xianqi_detail;
  delete player.xiangu_xianqi_three_complete;
  delete player.xiangu_jiutian_shidi;
  delete player.xiangu_zhanxian_zhadao;

  return { changed: true, changedPaths, previousLevels, nextLevels };
}

export { EXTRA_CULTIVATION_PATHS };
