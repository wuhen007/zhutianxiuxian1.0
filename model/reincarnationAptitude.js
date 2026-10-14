export const REINCARNATION_APTITUDE_FLOOR = '生而愚痴';

export const REINCARNATION_APTITUDE_ORDER = Object.freeze([
  '无演无尽',
  '万古无双',
  '绝世天骄',
  '旷世奇才',
  '天纵之资',
  '超凡资质',
  '平庸之资',
  '先天不足',
  '天弃之人',
  REINCARNATION_APTITUDE_FLOOR,
]);

export function normalizeReincarnationAptitude(aptitude) {
  return aptitude === '生而痴傻' ? REINCARNATION_APTITUDE_FLOOR : aptitude;
}

/** 返回一次阴阳大磨盘造成的天资结果。 */
export function resolveReincarnationAptitudeLoss(aptitude) {
  const current = normalizeReincarnationAptitude(aptitude || '平庸之资');
  if (current === REINCARNATION_APTITUDE_FLOOR || current === '无化如是') {
    return { current, next: null, extinguished: true };
  }

  const currentIndex = REINCARNATION_APTITUDE_ORDER.indexOf(['岁云', '星神之资'].includes(current) ? '无演无尽' : current);
  const safeIndex = currentIndex >= 0
    ? currentIndex
    : REINCARNATION_APTITUDE_ORDER.indexOf('平庸之资');
  return {
    current,
    next: REINCARNATION_APTITUDE_ORDER[safeIndex + 1],
    extinguished: false,
  };
}
