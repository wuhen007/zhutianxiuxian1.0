/**
 * 位面法则上限表 —— 花粉进化路的位面法则卡点
 *
 * 依据圣墟原著 + 用户定档：
 *   - 小阴间（4）：法则残缺，进化绝巅 = 映照诸天（11 级），原著锚定
 *   - 大阴间（5）：法则较全，可容纳神祇/神将（13 级）
 *   - 阳间（7）：法则完整，可容纳天尊~大宇（17 级）
 * 未列出的位面默认不卡（上限 25 = 花粉路顶格）。
 */

export const PLANE_REALM_LAW = Object.freeze({
  4: 11, // 小阴间
  5: 13, // 大阴间
  7: 17, // 阳间
});

export const PLANE_REALM_LAW_DEFAULT = 25;

export function getPlaneRealmLaw(planeId) {
  const key = Number(planeId);
  if (Number.isFinite(key) && PLANE_REALM_LAW[key] !== undefined) return PLANE_REALM_LAW[key];
  return PLANE_REALM_LAW_DEFAULT;
}

/**
 * 检查目标花粉路等级在当前位面是否被法则允许
 * @param {object} player 玩家数据（含 power_place）
 * @param {number} targetHuafenLevel 目标花粉路等级
 */
export function checkPlaneRealmLaw(player, targetHuafenLevel) {
  const planeId = Number(player?.power_place);
  const max = getPlaneRealmLaw(planeId);
  const target = Math.max(1, Math.trunc(Number(targetHuafenLevel) || 1));
  return {
    ok: target <= max,
    planeId,
    max,
    target,
    restricted: max < PLANE_REALM_LAW_DEFAULT,
  };
}
