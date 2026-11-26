import { PLACE_LOCATION_MAP } from './weimianTravel.js';

/**
 * 圣墟位面三级拆分 · 旧存档迁移
 *
 * 旧版圣墟位面为单一平面（power_place === 7，坐标字段 '圣墟位面坐标'，全局 0-999）。
 * 拆分后：小阴间=4 / 大阴间=5 / 阳间=7。
 * 迁移规则（沿用原坐标数值，只改位面编号与坐标字段名）：
 *   - 旧坐标落在 阳间(500-749,500-999) ∪ 魂河(750-999,0-999) → 阳间(7)
 *   - 其余（地球/荧惑/小阴间星路）→ 小阴间(4)
 *   - 无坐标 → 默认落小阴间
 */

export function classifyLegacyShengxuPlane(coord) {
  const x = Number(coord?.x);
  const y = Number(coord?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return '小阴间';
  if (x >= 750 || (x >= 500 && y >= 500)) return '阳间';
  return '小阴间';
}

/** 迁移单个玩家存档（就地修改 player）；返回是否发生迁移 */
export function migrateShengxuPlayer(player) {
  if (!player || typeof player !== 'object') return false;
  if (Number(player.power_place) !== 7) return false;

  const plane = classifyLegacyShengxuPlane(player['圣墟位面坐标']);
  const coord = player['圣墟位面坐标'];
  player.power_place = PLACE_LOCATION_MAP[plane];
  player[`${plane}坐标`] = coord
    ? { x: Math.trunc(Number(coord.x)) || 0, y: Math.trunc(Number(coord.y)) || 0 }
    : { x: 250, y: 250 };
  delete player['圣墟位面坐标'];

  if (Array.isArray(player.记忆坐标)) {
    const idx = player.记忆坐标.indexOf('圣墟位面');
    if (idx !== -1) player.记忆坐标[idx] = plane;
  }
  return true;
}
