import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { INNATE_TREASURE_CATALOG } from './innateTreasure.js';
import { getTreasureContestProfile } from './innateTreasureContest.js';
import {
  collectEquipmentStatPools,
  isCanonicalDaluoSwordEmbryo,
  isFixedStatEquipment,
  MAX_PERCENT_EQUIPMENT_STAT,
} from './equipmentStats.js';
import {
  formatRealmEventLocation,
  formatRealmEventTravel,
} from './realmEventLocation.js';
import { hasRealmAuthority } from './realmAuthority.js';
import { SUIYUN_EQUIPMENT, SUIYUN_FROST_EQUIPMENT } from './suiyun.js';

const shopPath = fileURLToPath(
  new URL('../resources/data/无尽商店.json', import.meta.url)
);
const SHOP_CONTENT = Object.freeze(
  JSON.parse(fs.readFileSync(shopPath, 'utf8'))
);

export const ENDLESS_TOKEN = SHOP_CONTENT.tokenName;
export const FUSION_ITEM = SHOP_CONTENT.fusionItem;
export const ENDLESS_SHOP = Object.freeze(
  SHOP_CONTENT.products.map(item => Object.freeze({ ...item }))
);

const SET_PIECES = new Set([
  ...SUIYUN_EQUIPMENT, ...SUIYUN_FROST_EQUIPMENT,
  '灭仙剑', '灭仙符', '灭仙衣',
  '诛仙枪', '诛仙花', '诛仙甲',
  '光明剑', '光明符', '光明衣',
  '神月剑', '神日花', '神星甲',
  '【武祖】万仙武极天', '【神命】无法无天', '【如梦】道祖的加护',
  '【邪神】斩仙灭神剑', '【邪神】魔渊的凝视', '【邪神】冥王真祖甲',
  '【光阴】天道之剑', '【光阴】命运之心', '【光阴】主宰之甲',
  '【超维】破限剑','【超维】多元星盘','【超维】元初之甲',
  '仙帝器·大罗仙剑','荒剑','天帝鼎','祭道甲胄','雷池','大罗剑胎','【极道帝兵】万物母气鼎',
  '【彼岸】万古皆空·命运枪' ,'【彼岸】诸天命运轮', '【彼岸】万劫不坠天衣' ,
  '【万化】万相天魔刃', '【万化】万灵魔幡' , '【万化】无相魔神袍' ,
   '【终焉】诸神黄昏' , '【终焉】万劫归墟轮' , '【终焉】神魔葬天衣'



]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stats(item) {
  return {
    atk: Number(item?.atk) || 0,
    def: Number(item?.def) || 0,
    HP: Number(item?.HP) || 0,
  };
}

function percentageStats(item) {
  const base = stats(item);
  const merged = stats(item?.归一属性?.百分比);
  return {
    atk: base.atk + merged.atk,
    def: base.def + merged.def,
    HP: base.HP + merged.HP,
  };
}

function formatRate(rate) {
  return `${Number(((Number(rate) || 0) * 100).toFixed(2))}%`;
}

export function formatFusionResult(merged, options) {
  const pct = collectEquipmentStatPools([merged.target], options).fusion;
  const sourceCritical = Number(merged.source?.bao) || 0;
  return [
    '【万象归一·熔铸成功】',
    `${merged.target.name}吞纳了${merged.source.name}的道则`,
    `归一生效词条：攻击+${formatRate(pct.atk)} / 防御+${formatRate(pct.def)} / 血量+${formatRate(pct.HP)} / 暴击+${formatRate(sourceCritical)}`,
    '原数值属性与套装效果完整保留。',
    `结算方式：单件每项百分比加成最高+${MAX_PERCENT_EQUIPMENT_STAT * 100}%（含基础${MAX_PERCENT_EQUIPMENT_STAT + 1}倍）；普通装备与归一词条多件加算，无总上限；套装效果随后独立生效。`,
  ];
}

export function findEndlessProduct(selector) {
  const text = String(selector || '').trim();
  return ENDLESS_SHOP.find(item => String(item.id) === text || item.name === text) || null;
}

export function getEndlessProductRewardAmount(product, purchases = 1) {
  const count = Math.max(0, Math.trunc(Number(purchases) || 0));
  const quantity = Math.max(1, Math.trunc(Number(product?.quantity) || 1));
  return count * quantity;
}

export function canPurchaseEndlessProduct(player, product) {
  const required = Math.max(0, Math.trunc(Number(product?.requiredRealmAuthority) || 0));
  return !required || hasRealmAuthority(player, required);
}

export function grantEndlessDirectReward(player, product, amount) {
  if (product?.action !== 'era') return false;
  player.纪元积累 = Math.max(0, Math.trunc(Number(player.纪元积累) || 0)) +
    Math.max(0, Math.trunc(Number(amount) || 0));
  return true;
}

export function formatTreasureClue(event, now = Date.now()) {
  if (!event) return [];
  const name = event.treasure?.name || '未知先天至宝';
  const catalog = INNATE_TREASURE_CATALOG[name];
  const omen = event.contest?.profile?.omen || getTreasureContestProfile(name).omen;
  const remainingMinutes = Math.max(1, Math.ceil((Number(event.expiresAt) - now) / 60000));
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  const remaining = hours
    ? `${hours}小时${minutes ? `${minutes}分钟` : ''}`
    : `${minutes}分钟`;
  return [
    '【先天灵宝天机·显化】',
    `天机锁定：${name}·${catalog?.title || '先天至宝'}`,
    `权能：${catalog?.summary || event.treasure?.desc || '大道权柄尚在混沌中'}`,
    `天象线索：${omen}`,
    `出世之地：${formatRealmEventLocation(event)}`,
    `现世余时：${remaining}`,
    `赶路方式：${formatRealmEventTravel(event)}`,
    '抵达精确坐标后发送 #观摩灵宝，再发送 #夺宝参加择主之争。',
  ];
}

export function mergeSetEquipment(equipment, najie, slot, sourceName) {
  if (!['武器', '护具', '法宝'].includes(slot)) throw new Error('熔铸部位只能是武器、护具或法宝');
  const nextEquipment = clone(equipment);
  const nextNajie = clone(najie);
  const target = nextEquipment?.[slot];
  if (!target?.name || !SET_PIECES.has(target.name)) throw new Error(`当前穿戴的${slot}不是可熔铸的套装部件`);
  if (target.name === '大罗剑胎' && !isCanonicalDaluoSwordEmbryo(target)) {
    throw new Error('当前穿戴的武器不是仙古秘境产出的大罗剑胎');
  }
  if (target.归一属性) throw new Error(`当前${slot}已经完成万象归一`);
  if (!isFixedStatEquipment(target)) {
    throw new Error('套装部件必须是数值装备');
  }

  const sourceIndex = (nextNajie.装备 || []).findIndex(item => {
    const values = Object.values(stats(item));
    return item.name === sourceName && item.type === slot && Number(item.数量) > 0 &&
      values.some(value => value > 0) && !isFixedStatEquipment(item);
  });
  if (sourceIndex < 0) throw new Error(`纳戒中没有符合条件的百分比${slot}【${sourceName}】`);
  const furnaceIndex = (nextNajie.道具 || []).findIndex(
    item => item.name === FUSION_ITEM && Number(item.数量) > 0
  );
  if (furnaceIndex < 0) throw new Error(`缺少【${FUSION_ITEM}】`);

  const source = nextNajie.装备[sourceIndex];
  target.归一属性 = { 百分比: percentageStats(source) };
  target.归一来源 = source.name;
  target.bao = (Number(target.bao) || 0) + (Number(source.bao) || 0);
  source.数量 -= 1;
  nextNajie.道具[furnaceIndex].数量 -= 1;
  nextNajie.装备 = nextNajie.装备.filter(item => Number(item.数量) > 0);
  nextNajie.道具 = nextNajie.道具.filter(item => Number(item.数量) > 0);
  return { equipment: nextEquipment, najie: nextNajie, target, source };
}
