import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { INNATE_TREASURE_CATALOG } from './innateTreasure.js';
import { getTreasureContestProfile } from './innateTreasureContest.js';
import {
  formatRealmEventLocation,
  formatRealmEventTravel,
} from './realmEventLocation.js';

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
  '灭仙剑', '灭仙符', '灭仙衣',
  '诛仙枪', '诛仙花', '诛仙甲',
  '光明剑', '光明符', '光明衣',
  '神月剑', '神日花', '神星甲',
  '【武祖】万仙武极天', '【神命】无法无天', '【如梦】道祖的加护',
  '【邪神】斩仙灭神剑', '【邪神】魔渊的凝视', '【邪神】冥王真祖甲',
  '【光阴】天道之剑', '【光阴】命运之心', '【光阴】主宰之甲',
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

export function findEndlessProduct(selector) {
  const text = String(selector || '').trim();
  return ENDLESS_SHOP.find(item => String(item.id) === text || item.name === text) || null;
}

export function getEndlessProductRewardAmount(product, purchases = 1) {
  const count = Math.max(0, Math.trunc(Number(purchases) || 0));
  const quantity = Math.max(1, Math.trunc(Number(product?.quantity) || 1));
  return count * quantity;
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
  if (target.归一属性) throw new Error(`当前${slot}已经完成万象归一`);
  if (!Object.values(stats(target)).some(value => value > 99)) throw new Error('套装部件必须是数值装备');

  const sourceIndex = (nextNajie.装备 || []).findIndex(item => {
    const values = Object.values(stats(item));
    return item.name === sourceName && item.type === slot && Number(item.数量) > 0 &&
      values.some(value => value > 0) && values.every(value => value <= 99);
  });
  if (sourceIndex < 0) throw new Error(`纳戒中没有符合条件的百分比${slot}【${sourceName}】`);
  const furnaceIndex = (nextNajie.道具 || []).findIndex(
    item => item.name === FUSION_ITEM && Number(item.数量) > 0
  );
  if (furnaceIndex < 0) throw new Error(`缺少【${FUSION_ITEM}】`);

  const source = nextNajie.装备[sourceIndex];
  target.归一属性 = { 百分比: stats(source) };
  target.归一来源 = source.name;
  target.bao = (Number(target.bao) || 0) + (Number(source.bao) || 0);
  source.数量 -= 1;
  nextNajie.道具[furnaceIndex].数量 -= 1;
  nextNajie.装备 = nextNajie.装备.filter(item => Number(item.数量) > 0);
  nextNajie.道具 = nextNajie.道具.filter(item => Number(item.数量) > 0);
  return { equipment: nextEquipment, najie: nextNajie, target, source };
}
