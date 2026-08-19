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
export const XIANGU_TRIBULATION_BASE_ATK_SCALE = 10;

export const LEIDI_TRIBULATION_CONVERSION_RATE = 0.4;
export const LEIDI_TRIBULATION_CONVERSION_WAVES = 4;

function getRealmAttack(list, levelId) {
  return Number(list?.find(item => Number(item.level_id) === Number(levelId))?.基础攻击) || 0;
}

function getMaxRealmAttack(list) {
  return Number(list?.reduce((max, item) => (
    !max || Number(item.level_id) > Number(max.level_id) ? item : max
  ), null)?.基础攻击) || 0;
}

/**
 * 神火踏足真一至遁一踏足至尊的雷劫理论攻击。
 * 神火为第一档；仙古境界每提升一级，装备倍率 +15、帝兵倍率 +20。
 */
export function calcXianguTribulationPower(player, levels = {}) {
  const xianguLevel = Math.max(8, Math.trunc(Number(player?.xiangulevel_id) || 8));
  const tier = xianguLevel - 7;
  const equipmentMultiplier = tier * 15;
  const imperialMultiplier = tier * 20;
  const secretAttack = getRealmAttack(levels.Levelmijing_list, player?.mijinglevel_id);
  const ancientAttack = getRealmAttack(levels.xiangujinshi_list, xianguLevel);
  const realmAttack = secretAttack + ancientAttack;
  const baseAttack = getMaxRealmAttack(levels.Level_list)
    + getMaxRealmAttack(levels.LevelMax_list)
    + realmAttack;

  return {
    attack: Math.trunc(
      (baseAttack * equipmentMultiplier + realmAttack * imperialMultiplier)
      * XIANGU_TRIBULATION_BASE_ATK_SCALE
    ),
    equipmentMultiplier,
    imperialMultiplier,
  };
}

// 天神踏入虚道后，仙古今世法遭受的天地排斥逐境加深。
// 这是叠加在既有理论战力雷劫之上的威能倍率；低境界仍沿用原结算。
export const XIANGU_UPPER_TRIBULATION_HORROR_MULTIPLIERS = Object.freeze({
  11: 15,
  12: 20,
  13: 25,
  14: 30,
});

export function getXianguUpperTribulationHorrorMultiplier(fromLevelId) {
  const levelId = Math.trunc(Number(fromLevelId) || 0);
  if (levelId >= 14) return XIANGU_UPPER_TRIBULATION_HORROR_MULTIPLIERS[14];
  return XIANGU_UPPER_TRIBULATION_HORROR_MULTIPLIERS[levelId] || 1;
}

/**
 * 保留 15~30 倍原始劫威，同时将单道肉身承压平滑压入可渡区间。
 * 普通道上限随境界从 18% 提升至 45%，阶段终结道从 55% 提升至 85%。
 * 上限在灵根、帝兵等减伤之前应用，渡劫准备仍会直接决定生死。
 */
export function calculateXianguHorrorWavePower({
  baseDamage,
  maxHp,
  multiplier = 1,
  finalWave = false,
}) {
  const normalizedMultiplier = Math.max(1, Number(multiplier) || 1);
  const rawDamage = Math.max(1, Number(baseDamage) || 1) * normalizedMultiplier;
  if (normalizedMultiplier <= 1) {
    return {
      multiplier: 1,
      rawDamage,
      damage: rawDamage,
      capRate: null,
      capped: false,
    };
  }

  const progress = Math.max(0, Math.min(1, (normalizedMultiplier - 15) / 15));
  const capRate = finalWave
    ? 0.55 + progress * 0.30
    : 0.18 + progress * 0.27;
  const cap = Math.max(1, Number(maxHp) || 1) * capRate;
  const damage = cap * (1 - Math.exp(-rawDamage / cap));

  return {
    multiplier: normalizedMultiplier,
    rawDamage,
    damage: Math.max(1, damage),
    capRate,
    capped: rawDamage > damage,
  };
}

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
    3.5: '太初星墟坐标', 3.6: '时间长河坐标', 4: '小阴间坐标',
    5: '大阴间坐标', 6: '仙域坐标', 6.5: '永恒未知之地坐标', 7: '阳间坐标',
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
