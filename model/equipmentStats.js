export const MAX_PERCENT_EQUIPMENT_STAT = 499;
import { getZhutianExclusiveEquipmentBonus } from './exclusiveEquipmentSets.js';

const EQUIPMENT_TYPES = new Set(['武器', '护具', '法宝']);

export function isNameablePercentageEquipment(item) {
  if (item?.class !== '装备' && !EQUIPMENT_TYPES.has(item?.type)) return false;
  const atk = Number(item?.atk) || 0;
  const def = Number(item?.def) || 0;
  const hp = Number(item?.HP) || 0;
  if (atk > MAX_PERCENT_EQUIPMENT_STAT || def > MAX_PERCENT_EQUIPMENT_STAT || hp > MAX_PERCENT_EQUIPMENT_STAT) {
    return false;
  }
  return atk >= 1.5
    || def >= 1.2
    || (item?.type === '法宝' && (atk >= 1 || def >= 1))
    || atk + def > 1.95;
}

export function calculateEquippedStats(baseStats, slots = []) {
  const baseAttack = Number(baseStats?.攻击) || 0;
  const baseDefense = Number(baseStats?.防御) || 0;
  const baseHp = Number(baseStats?.血量上限) || 0;
  let attackBonus = 0;
  let defenseBonus = 0;
  let hpBonus = 0;
  let fixedAttack = 0;
  let fixedDefense = 0;
  let fixedHp = 0;

  for (const slot of slots) {
    const merged = slot?.归一属性?.百分比 || {};
    attackBonus += Number(merged.atk) || 0;
    defenseBonus += Number(merged.def) || 0;
    hpBonus += Number(merged.HP) || 0;
    const atk = Number(slot?.atk) || 0;
    const def = Number(slot?.def) || 0;
    const HP = Number(slot?.HP) || 0;
    if (atk > MAX_PERCENT_EQUIPMENT_STAT || def > MAX_PERCENT_EQUIPMENT_STAT || HP > MAX_PERCENT_EQUIPMENT_STAT) {
      fixedAttack += atk;
      fixedDefense += def;
      fixedHp += HP;
      continue;
    }

    attackBonus += atk;
    defenseBonus += def;
    hpBonus += HP;
  }

  // 百分比装备单属性加成上限：最高 50000%（即加成 ≤ 500，总倍率 ≤ 501 倍）
  const MAX_PERCENT_BONUS = 500;
  attackBonus = Math.min(attackBonus, MAX_PERCENT_BONUS);
  defenseBonus = Math.min(defenseBonus, MAX_PERCENT_BONUS);
  hpBonus = Math.min(hpBonus, MAX_PERCENT_BONUS);

  return {
    攻击: Math.trunc(baseAttack * (1 + attackBonus) + fixedAttack),
    防御: Math.trunc(baseDefense * (1 + defenseBonus) + fixedDefense),
    血量上限: Math.trunc(baseHp * (1 + hpBonus) + fixedHp),
  };
}

export function getEquipmentAllAttributeMultiplier(player, slot) {
  if (!isCanonicalDaluoSwordEmbryo(slot)) return 1;
  const isSupremePhysique = String(player?.灵根?.type || '').includes('至尊体');
  const field = isSupremePhysique ? '至尊体全属性倍率' : '其他灵根全属性倍率';
  return Math.max(1, Number(slot[field]) || 1);
}

export function isCanonicalDaluoSwordEmbryo(slot) {
  return slot?.name === '大罗剑胎'
    && (Number(slot.id) === 100054 || (
      Number(slot.至尊体全属性倍率) === 15
      && Number(slot.其他灵根全属性倍率) === 7.5
    ));
}

export function calculateEquipmentSetBonuses(player, equipment = {}, options = {}) {
  const weapon = equipment.武器 || {};
  const armor = equipment.护具 || {};
  const treasure = equipment.法宝 || {};
  const daoTreasure = equipment.至宝 || {};
  const root = player?.灵根 || {};
  const bonus = { 攻: 0, 防: 0, 血: 0 };

  if (weapon.name === '灭仙剑' && treasure.name === '灭仙符' && armor.name === '灭仙衣' && player.魔道值 > 999 && root.type === '魔头') {
    bonus.攻 += 0.15;
  }
  if (weapon.name === '诛仙枪' && treasure.name === '诛仙花' && armor.name === '诛仙甲' && player.魔道值 > 999 && root.type === '魔头') {
    bonus.攻 += 0.05; bonus.血 += 0.2;
  }
  if (weapon.name === '光明剑' && treasure.name === '光明符' && armor.name === '光明衣' && player.魔道值 < 1 && root.type === '转生') {
    bonus.攻 += 0.15;
  }
  if (weapon.name === '神月剑' && treasure.name === '神日花' && armor.name === '神星甲' && player.魔道值 < 1 && root.type === '转生') {
    bonus.攻 += 0.05; bonus.血 += 0.2;
  }
  if (weapon.name === '【武祖】万仙武极天' && treasure.name === '【神命】无法无天' && armor.name === '【如梦】道祖的加护' && player.魔道值 < 1 && root.type === '命运') {
    bonus.攻 += 2; bonus.血 += 2; bonus.防 += 2;
  }
  if (weapon.name === '【邪神】斩仙灭神剑' && treasure.name === '【邪神】魔渊的凝视' && armor.name === '【邪神】冥王真祖甲' && player.魔道值 > 9999 && root.type === '天魔') {
    bonus.攻 += 3; bonus.血 += 1; bonus.防 += 1.5;
  }
  if (weapon.name === '【终焉】诸神黄昏' && treasure.name === '【终焉】万劫归墟轮' && armor.name === '【终焉】神魔葬天衣' && root.name === '终焉神魔体') {
    bonus.攻 += 4; bonus.血 += 4; bonus.防 += 3;
  }
  if (weapon.name === '【万化】万相天魔刃' && treasure.name === '【万化】万灵魔幡' && armor.name === '【万化】无相魔神袍' && root.name === '无相·万化天魔体') {
    bonus.攻 += 3.5; bonus.血 += 3.5; bonus.防 += 2.5;
  }
  if (weapon.name === '【彼岸】万古皆空·命运枪' && treasure.name === '【彼岸】诸天命运轮' && armor.name === '【彼岸】万劫不坠天衣' && root.name === '彼岸·命运神道体') {
    bonus.攻 += 5; bonus.血 += 5; bonus.防 += 4;
  }
  if (weapon.name === '【光阴】天道之剑' && treasure.name === '【光阴】命运之心' && armor.name === '【光阴】主宰之甲' && root.type === '命运') {
    bonus.攻 += 5; bonus.血 += 5; bonus.防 += 5;
  }
  if (weapon.name === '【光阴】天道之剑' && treasure.name === '【光阴】命运之心' && armor.name === '【光阴】主宰之甲' && root.type === '天魔') {
    bonus.攻 += 6; bonus.血 += 4; bonus.防 += 5;
  }
  if (['【超维】破限剑', '【超维】天帝剑'].includes(weapon.name) && root.type === '命运') {
    bonus.攻 += 9; bonus.血 += 7; bonus.防 += 7;
  }
  if (treasure.name === '【超维】多元星盘' && root.type === '命运') {
    bonus.攻 += 6; bonus.血 += 9; bonus.防 += 4;
  }
  if (['【超维】元初之甲', '【超维】主帝神甲'].includes(armor.name) && root.type === '命运') {
    bonus.攻 += 4; bonus.血 += 4; bonus.防 += 9;
  }
  if (['【超维】破限剑', '【超维】天帝剑'].includes(weapon.name) && root.type === '天魔') {
    bonus.攻 += 14; bonus.血 += 7; bonus.防 += 7;
  }
  if (treasure.name === '【超维】多元星盘' && root.type === '天魔') {
    bonus.攻 += 6; bonus.血 += 9; bonus.防 += 4;
  }
  if (['【超维】元初之甲', '【超维】主帝神甲'].includes(armor.name) && root.type === '天魔') {
    bonus.攻 += 4; bonus.血 += 4; bonus.防 += 9;
  }
  if (weapon.name === '【极道帝兵】万物母气鼎' && root.type === '大成圣体') {
    bonus.攻 += 14; bonus.血 += 4; bonus.防 += 4;
  }
  if (weapon.name === '仙帝器·大罗仙剑' && player.mijinglevel_id >= 20) {
    bonus.攻 += 16.5; bonus.血 += 9; bonus.防 += 9;
  }
  if (weapon.name === '荒剑' && player.mijinglevel_id >= 21) {
    bonus.攻 += 19; bonus.血 += 9; bonus.防 += 9;
  }
  if (weapon.name === '天帝鼎' && player.mijinglevel_id >= 21) {
    bonus.攻 += 19; bonus.血 += 9; bonus.防 += 9;
  }
  if (armor.name === '祭道甲胄' && player.mijinglevel_id >= 21) {
    bonus.攻 += 14; bonus.血 += 19; bonus.防 += 34;
  }
  if (treasure.name === '雷池' && player.mijinglevel_id >= 21) {
    bonus.攻 += 19; bonus.血 += 19; bonus.防 += 19;
  }
  if (isCanonicalDaluoSwordEmbryo(weapon)) {
    const value = Math.max(0, getEquipmentAllAttributeMultiplier(player, weapon) - 1);
    bonus.攻 += value; bonus.防 += value; bonus.血 += value;
  }
  const zhutianSet = getZhutianExclusiveEquipmentBonus(player, equipment);
  if (zhutianSet.active) {
    bonus.攻 += zhutianSet.bonus;
    bonus.防 += zhutianSet.bonus;
    bonus.血 += zhutianSet.bonus;
  }
  if (options.daoTreasureEquipped) {
    const value = Number(daoTreasure.全属性倍率加成)
      || Number(options.daoTreasureAllAttributeBonus)
      || 0;
    bonus.攻 += value; bonus.防 += value; bonus.血 += value;
  }

  return bonus;
}
