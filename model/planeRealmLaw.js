/**
 * 位面法则上限表 —— 花粉进化路的位面法则卡点
 *
 * 依据圣墟原著 + 用户定档：
 *   - 小阴间（4）：法则残缺，进化绝巅 = 映照诸天（11 级），原著锚定
 *   - 大阴间（5）：法则较全，可容纳神祇/神将（13 级）
 *   - 阳间（7）：法则完整，可容纳天尊~大宇（17 级）
 *   - 仙域或玩家大宇宙放行全部花粉境界，不设位面与法则等级门槛
 *   - 其他未列出的位面上限默认为 25，但神王（14）及以上仍需入阳间
 */

import { getLocationId, PLACE_LOCATION_MAP } from './weimianTravel.js';

export const PLANE_REALM_LAW = Object.freeze({
  [PLACE_LOCATION_MAP.小阴间]: 11,
  [PLACE_LOCATION_MAP.大阴间]: 13,
  [PLACE_LOCATION_MAP.阳间]: 17,
});

export const PLANE_REALM_LAW_DEFAULT = 25;

/** 神王境（花粉路14级）：仙域和玩家大宇宙以外，突破神王以上需入阳间 */
export const POLLEN_NEED_YANGJIAN_LEVEL = 14;
/** 阳间位面编号 */
export const YANGJIAN_PLANE_ID = PLACE_LOCATION_MAP.阳间;

export function getPlaneRealmLaw(planeId) {
  const key = getLocationId(planeId);
  if (Number.isFinite(key) && PLANE_REALM_LAW[key] !== undefined) return PLANE_REALM_LAW[key];
  return PLANE_REALM_LAW_DEFAULT;
}

/**
 * 检查目标花粉路等级在当前位面是否被法则允许
 * 规则（仙域/大宇宙不拦截，其余位面保留原有上限与阳间门槛）：
 *   - 小阴间（4）容至映照诸天（11）
 *   - 大阴间（5）容至神将（13）
 *   - 未列位面（遮天/界海/太初星墟等）对 13 级以下不卡
 *   - 神王（14）及以上需在阳间（7）突破，仙域或玩家大宇宙除外
 *   - 仙域或玩家大宇宙放行全部境界，包括唯一道之上
 * @param {object} player 玩家数据（含 power_place）
 * @param {number} targetHuafenLevel 目标花粉路等级
 */
export function checkPlaneRealmLaw(player, targetHuafenLevel, grandUniverse = null) {
  const planeId = getLocationId(player?.power_place);
  const target = Math.max(1, Math.trunc(Number(targetHuafenLevel) || 1));
  const universeException = planeId === PLACE_LOCATION_MAP.仙域
    || Boolean(grandUniverse?.大宇宙);
  const max = universeException ? PLANE_REALM_LAW_DEFAULT : getPlaneRealmLaw(planeId);
  // 仙域或玩家大宇宙不受位面上限及入阳间条件限制。
  const needYangJian =
    target >= POLLEN_NEED_YANGJIAN_LEVEL
    && planeId !== YANGJIAN_PLANE_ID
    && !universeException;
  return {
    ok: universeException || (!needYangJian && target <= max),
    planeId,
    max,
    target,
    restricted: !universeException && (max < PLANE_REALM_LAW_DEFAULT || needYangJian),
    needYangJian,
    grandUniverseException: universeException,
  };
}
