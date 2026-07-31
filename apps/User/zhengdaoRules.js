export const ZHENGDAO_ROUTES = Object.freeze({
  HEAVEN_HEART: '天心合道',
  ABOVE_ALL_DAOS: '凌驾万道',
  PROTECTED: '护道成帝',
  BLOCKED: '帝路断绝',
});

export const ABOVE_ALL_DAOS_DIFFICULTY_MULTIPLIER = 1.5;

export const ABOVE_ALL_DAOS_PHYSIQUES = Object.freeze({
  '大成·荒古圣体': Object.freeze({
    opening: '黄金血气贯穿星海，圣体真身以无上伟力轰击天心！',
    mechanism: '不借天心，不合万道，只以无敌圣体击穿帝道压制！',
  }),
  先天圣体道胎: Object.freeze({
    opening: '圣体金血与先天道韵交织，肉身破道，道胎御道！',
    mechanism: '圣体撕开万道枷锁，先天道胎驾驭诸天法则！',
  }),
  混沌体: Object.freeze({
    opening: '混沌本源与宇宙万道交感，三千大道在体内生灭！',
    mechanism: '混沌演化万道，万道复归混沌，帝道亦不能将其排斥！',
  }),
  先天混沌圣体道胎: Object.freeze({
    opening: '圣体金血、先天道韵与混沌本源归于一体，重演开天之景！',
    mechanism: '混沌包容万道，圣体击穿天心，道胎统御诸法！',
  }),
});

export function getAboveAllDaosPhysique(player) {
  const physiqueName = player?.灵根?.name;
  if (!physiqueName) return null;
  const profile = ABOVE_ALL_DAOS_PHYSIQUES[physiqueName];
  return profile ? { name: physiqueName, ...profile } : null;
}

export function hasActiveZhengdaoProtection(player, now = Date.now()) {
  const expiresAt = Number(player?.护道状态);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function resolveZhengdaoRoute(
  player,
  hasHeavenHeartMark,
  now = Date.now()
) {
  if (!hasHeavenHeartMark) {
    return {
      route: ZHENGDAO_ROUTES.HEAVEN_HEART,
      physique: null,
      difficultyMultiplier: 1,
    };
  }

  const physique = getAboveAllDaosPhysique(player);
  if (physique) {
    return {
      route: ZHENGDAO_ROUTES.ABOVE_ALL_DAOS,
      physique,
      difficultyMultiplier: ABOVE_ALL_DAOS_DIFFICULTY_MULTIPLIER,
    };
  }

  if (hasActiveZhengdaoProtection(player, now)) {
    return {
      route: ZHENGDAO_ROUTES.PROTECTED,
      physique: null,
      difficultyMultiplier: 1,
    };
  }

  return {
    route: ZHENGDAO_ROUTES.BLOCKED,
    physique: null,
    difficultyMultiplier: 1,
  };
}

export function getZhengdaoSuccessState(route) {
  return {
    zhengdaoMethod: route,
    heavenHeartMark: route === ZHENGDAO_ROUTES.HEAVEN_HEART ? 1 : 0,
  };
}
