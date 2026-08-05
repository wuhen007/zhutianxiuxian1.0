/**
 * 雷劫基准攻击缩放系数
 *
 * 雷劫基准 maxAtk = (练气圆满 + 炼体圆满 + 当前秘境) 三层基础攻击
 *                   × 帝兵全属性随机值 × 本系数
 *
 * 天道只认境界、不认外物：装备（武器/护具/法宝）与帝兵 atk 一律不计入雷劫基准，
 * 因此同秘境同炼体的玩家雷劫强度完全一致，杜绝"越肝装备天雷越猛"的反向激励。
 *
 * 调平衡时只需改这一个数：
 *   1     → 当前设定（斩道天命最凶险约 18.9 兆）
 *   10    → 雷劫强度 ×10
 *   0.5   → 雷劫强度减半
 */
export const TRIBULATION_BASE_ATK_SCALE = 1;

const SAKURA_ROOT_NAMES = new Set([
  '木之本樱',
  '星之杖·木之本樱',
  '梦之杖·木之本樱',
]);

export function canUseClowWish(player) {
  return SAKURA_ROOT_NAMES.has(player?.灵根?.name);
}

export const ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS = Object.freeze({
  斩道: 30,
  圣人: 45,
  圣人王: 60,
  大圣: 90,
  准帝: 120,
  大帝: 150,
  逆活: 180,
});

export function getReverseLifeTribulationWaves(life) {
  const normalizedLife = Math.max(1, Math.min(9, Math.trunc(Number(life) || 1)));
  return normalizedLife * 7;
}

export function resetTribulationGongfaCooldowns(player) {
  for (const gongfa of Object.values(player?.功法 || {})) {
    if (gongfa && typeof gongfa === 'object' && '冷却回合' in gongfa) {
      gongfa.冷却回合 = 0;
    }
  }
}

/**
 * 特殊体质·渡劫区间偏移（命中天地法则青睐者，区间向安全端平移）
 * 先天道胎 / 混沌体 / 先天圣体道胎：-10
 * 先天混沌圣体道胎：-20
 */
export const BODY_TRIBULATION_SHIFT = Object.freeze({
  '先天道胎': -10,
  '混沌体': -10,
  '先天圣体道胎': -10,
  '先天混沌圣体道胎': -20,
});

/**
 * 计算位面坐标的渡劫区间偏移
 * 不同位面 + 不同坐标 → 不同的 -10 ~ +10 偏移（确定性计算）
 * 用法：返回整数偏移，加到随机整数后钳位
 */
export function calcPlaneCoordinateShift(player) {
  const planeId = Number(player?.power_place) || 0;
  const coord = player?.[planeIdToCoordField(planeId)];
  if (!coord) return 0;
  return calcCoordinateShift(planeId, coord.x, coord.y);
}

/**
 * 由「位面 id + 坐标」直接算渡劫区间偏移，范围 [-10, +10]
 * 确定性哈希：同一位面同一坐标恒定，换坐标才会变
 * 供 #打听天机渡劫 预览各位面吉凶用
 */
export function calcCoordinateShift(planeId, x, y) {
  const px = Number(x);
  const py = Number(y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return 0;
  // planeId 可能是 1.5 / 2.5 / 3.5 这种半级，×2 归整避免浮点取模误差
  const pid = Math.round((Number(planeId) || 0) * 2);
  const hash = ((pid * 31 + Math.trunc(px) * 17 + Math.trunc(py) * 13) % 21 + 21) % 21;
  return hash - 10;
}

function planeIdToCoordField(planeId) {
  const map = {
    0: '凡间坐标', 1: '仙界坐标', 1.5: '下界八域坐标',
    2: '遮天位面坐标', 2.5: '九天十地坐标', 3: '界海坐标',
    3.5: '太初星墟坐标', 4: '时间长河坐标', 5: '永恒未知之地坐标',
    6: '仙域坐标',
  };
  return map[planeId] || null;
}

/**
 * 应用总偏移并钳位到 [0, maxRandomSpan]
 * @param {number} baseRandom - 基础随机整数
 * @param {number} maxSpan - 最大跨度（与秘境等级相关）
 * @param {Object} shifts - { bodyShift, planeShift, formationShift, kuluoShift }
 * @returns {{ final: number, totalShift: number, clamped: boolean }}
 */
export function applyTribulationShift(baseRandom, maxSpan, shifts = {}) {
  const totalShift = Number(shifts.bodyShift || 0)
    + Number(shifts.planeShift || 0)
    + Number(shifts.formationShift || 0)
    + Number(shifts.kuluoShift || 0);
  const raw = baseRandom + totalShift;
  const final = Math.max(0, Math.min(maxSpan, raw));
  return { final, totalShift, clamped: raw !== final };
}
