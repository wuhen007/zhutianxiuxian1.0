/**
 * 仙宠幸运加成计算（统一公式：加成 = 每级增加 × 等级，初始加成不参与计算）
 *
 * 背景：所有原生仙宠均为 初始加成 == 每级增加，正确公式等价于
 * 「初始加成 + 每级增加 × (等级-1)」；此前多处误用「初始加成 + 每级增加 × 等级」
 * 导致初始加成被重复计入（如万仙白泽 0.5 + 0.5×1 = 1.0 = 100% 幸运，
 * 正确应为 0.5×1 = 0.5 = 50%）。
 *
 * 本模块为纯计算，不依赖业务环境，便于单测。
 */

function isNotNull(v) {
  return v !== null && v !== undefined;
}

/**
 * 计算出战仙宠的幸运加成。
 * 仅 type === '幸运' 的仙宠才贡献幸运加成（非幸运宠即使带成长字段也不计入）。
 * @param {object} pet 出战仙宠对象（无 id 视为无宠）
 * @returns {{ bonus: number, inheritBonus: number }}
 *   bonus        仙宠自身幸运加成 = 每级增加 × 等级（仅幸运型仙宠）
 *   inheritBonus 炼妖继承的幸运加成（继承能力 type === '幸运' 时生效，主宠类型不限）
 */
export function computePetLuckyBonus(pet) {
  if (!pet || !pet.id) return { bonus: 0, inheritBonus: 0 };
  let bonus = 0;
  if (pet.type === '幸运') {
    if (pet.id > 2930 && pet.id < 2936) {
      // 原有 ID 范围内的幸运仙宠（2931-2935），固定成长 0.002/级
      bonus = 0.002 * (Number(pet.等级) || 1);
    } else if (isNotNull(pet.初始加成) && isNotNull(pet.每级增加)) {
      // 其他幸运仙宠（麒麟、鲲鹏、万仙白泽等）
      bonus = (Number(pet.每级增加) || 0) * (Number(pet.等级) || 1);
    }
  }
  let inheritBonus = 0;
  const inherit = pet.炼妖继承能力;
  if (inherit && inherit.type === '幸运') {
    inheritBonus = Number(inherit.加成) || 0;
  }
  return { bonus, inheritBonus };
}

/**
 * 按统一公式重算出战仙宠应存储的 加成 字段值（每级增加 × 等级）。
 * 注意：这是通用成长字段（喂食/栖息地/属性展示均使用），不过滤仙宠 type，
 * 与「幸运加成」（仅幸运型仙宠生效）是两回事。
 * @param {object} pet 出战仙宠对象
 * @returns {number} 应写入 pet.加成 的数值
 */
export function computePetStoredBonus(pet) {
  if (!pet || !pet.id) return 0;
  if (pet.id > 2930 && pet.id < 2936) return 0.002 * (Number(pet.等级) || 1);
  if (isNotNull(pet.初始加成) && isNotNull(pet.每级增加)) {
    return (Number(pet.每级增加) || 0) * (Number(pet.等级) || 1);
  }
  return Number(pet.加成) || 0;
}

/**
 * 计算玩家正确的 player.幸运：
 * 福源丹药力(addluckyNo) + 出战仙宠幸运加成 + 炼妖继承幸运加成。
 * @param {object} player 玩家存档对象
 * @returns {number} 正确的幸运值
 */
export function computeCorrectLucky(player) {
  let lucky = Number(player?.addluckyNo) || 0;
  const pet = player?.仙宠;
  if (pet && pet.id) {
    const { bonus, inheritBonus } = computePetLuckyBonus(pet);
    lucky += bonus + inheritBonus;
  }
  return lucky;
}
