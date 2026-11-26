/**
 * 天骄污损与参悟仿制（温和可逆的装备交互，纯逻辑，不负责 IO / 公告）
 *
 * 污损（败北触发）：天骄以道痕污浊玩家百分比装备，战斗属性 -20%；
 *   修复：击杀该天骄自动复原，或消耗灵石/源石材料修复。
 * 参悟（败北触发）：天骄观摩玩家装备词条生成「仿制品」（复制 60% 词条）；
 *   玩家击杀该天骄掉落仿制品，可 #反哺炼化 将 50% 词条加成回本体——从"被抢"变"互相成长"。
 */
export const TAINTED_SLOTS = Object.freeze({ 武器: '攻击', 护具: '防御', 法宝: '血量上限' });
export const TAINT_PENALTY_RATE = 0.2;
export const IMITATION_COPY_RATE = 0.6; // 参悟时复制原装备词条的 60%
export const REIMBURSE_RATE = 0.5;      // 反哺时仿制品词条加成回原装备的 50%

/** 是否为百分比装备（归一属性.百分比 存在 >0 的词条） */
export function hasPercentageStats(item) {
  return Object.values(item?.归一属性?.百分比 || {}).some(value => Number(value) > 0);
}

/** 装备是否被污损 */
export function isTainted(item) {
  return Boolean(item?.污损?.天骄);
}

/** 读取装备污损信息 */
export function getTaint(item) {
  return item?.污损 || null;
}

/** 列出玩家装备中的百分比装备槽位 */
export function listPercentEquipSlots(equip) {
  return Object.keys(TAINTED_SLOTS)
    .filter(slot => {
      const item = equip?.[slot];
      return item && hasPercentageStats(item);
    })
    .map(slot => ({ slot, item: equip[slot] }));
}

/** 施加污损（仅百分比装备、且未污损的槽位） */
export function applyEquipmentTaint(equip, slot, tianjiaoName, now = Date.now()) {
  const item = equip?.[slot];
  if (!item || !hasPercentageStats(item) || isTainted(item)) return { ok: false, reason: 'not_taintable' };
  item.污损 = { 天骄: tianjiaoName, 时间: now };
  return { ok: true, slot, item, 天骄: tianjiaoName };
}

/** 修复单件装备的污损，返回是否修复成功 */
export function repairTaint(equip, slot) {
  const item = equip?.[slot];
  if (!item || !isTainted(item)) return false;
  delete item.污损;
  return true;
}

/** 列出玩家所有被污损的装备槽位 */
export function listTaintedSlots(equip) {
  return Object.keys(TAINTED_SLOTS)
    .filter(slot => isTainted(equip?.[slot]))
    .map(slot => ({ slot, item: equip[slot], 天骄: equip[slot].污损.天骄 }));
}

/**
 * 战斗内实时结算污损：污损装备使其对应属性 -20%（直接修改 A_player）。
 * @returns [{ slot, name, field, 天骄 }]
 */
export function applyTaintPenalty(A_player, equip) {
  const penalties = [];
  for (const { slot, item, 天骄 } of listTaintedSlots(equip)) {
    const field = TAINTED_SLOTS[slot];
    if (!field || !Number.isFinite(Number(A_player?.[field]))) continue;
    A_player[field] = Math.max(1, Math.floor(Number(A_player[field]) * (1 - TAINT_PENALTY_RATE)));
    penalties.push({ slot, name: item.name, field, 天骄 });
  }
  return penalties;
}

/** 生成天骄参悟记录（复制原装备百分比词条的 60%） */
export function createImitation(tianjiaoName, playerQq, playerName, slot, item, now = Date.now()) {
  const percent = item?.归一属性?.百分比 || {};
  const copied = {};
  for (const [key, value] of Object.entries(percent)) {
    const rate = Math.round(Number(value) * IMITATION_COPY_RATE * 10000) / 10000;
    if (rate > 0) copied[key] = rate;
  }
  const baseName = item?.name || '无名装备';
  return {
    仿制名: `仿·${baseName}`,
    来源装备名: baseName,
    槽位: slot,
    来源QQ: String(playerQq),
    来源名号: playerName,
    天骄: tianjiaoName,
    时间: now,
    词条: copied,
  };
}

/** 由参悟记录生成可掉落的仿制品物品 */
export function createImitationItem(imitation, ownerId) {
  return {
    name: imitation.仿制名,
    class: '装备',
    type: imitation.槽位 || '武器',
    品阶: '参悟仿制',
    参悟仿制: imitation,
    author_name: String(ownerId || imitation.来源QQ || ''),
    绑定者: String(ownerId || imitation.来源QQ || ''),
    atk: 0,
    def: 0,
    HP: 0,
    bao: 0,
    全属性: 0,
    数量: 1,
    islockd: 1,
  };
}

/**
 * 反哺合成：把仿制品词条的 50% 加成回本体装备（消耗仿制品）。
 * @returns { ok, gained } gained: { atk?, def?, HP? } 各属性新增比例
 */
export function reimburseImitation(origItem, imitationItem) {
  const imitation = imitationItem?.参悟仿制;
  if (!imitation || !origItem) return { ok: false, reason: 'invalid' };
  if (imitation.来源装备名 && origItem.name !== imitation.来源装备名) {
    return { ok: false, reason: 'name_mismatch' };
  }
  origItem.归一属性 ||= { 百分比: {} };
  origItem.归一属性.百分比 ||= {};
  const gained = {};
  for (const [key, value] of Object.entries(imitation.词条 || {})) {
    const add = Math.round(Number(value) * REIMBURSE_RATE * 10000) / 10000;
    if (add <= 0) continue;
    origItem.归一属性.百分比[key] = Math.round(((Number(origItem.归一属性.百分比[key]) || 0) + add) * 10000) / 10000;
    gained[key] = add;
  }
  if (!Object.keys(gained).length) return { ok: false, reason: 'nothing_gained' };
  return { ok: true, gained };
}
