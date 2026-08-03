import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

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
