import { isDeepStrictEqual } from 'node:util';

const SLOT_BY_TYPE = {
  武器: '武器',
  护具: '护具',
  法宝: '法宝',
  帝兵: '帝兵',
  至宝: '至宝',
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function comparable(item, overrideType = '') {
  const value = clone(item);
  delete value.数量;
  if (overrideType === '至宝') delete value.type;
  return value;
}

function sameInstance(item, expected) {
  if (!item || !expected || item.name !== expected.name || item.pinji != expected.pinji) return false;
  return isDeepStrictEqual(
    comparable(item, expected.type),
    comparable(expected, expected.type)
  );
}

function findEquipmentIndex(items, expected) {
  const exact = items.findIndex(item => sameInstance(item, expected));
  if (exact >= 0) return exact;
  return items.findIndex(item =>
    item?.name === expected?.name &&
    item?.pinji == expected?.pinji &&
    Boolean(item?.归一属性) === Boolean(expected?.归一属性)
  );
}

export function selectEquipmentByCode(najie, code) {
  const index = Number(code) - 101;
  if (!Number.isInteger(index) || index < 0) return null;
  const item = najie?.装备?.[index];
  return item ? { index, item } : null;
}

export function swapEquipmentState(najie, equipment, expected, options = {}) {
  const slot = SLOT_BY_TYPE[expected?.type];
  if (!slot) return { ok: false, reason: 'unsupported-type', message: '该物品不能装备到普通装备槽。' };

  const nextNajie = clone(najie);
  const nextEquipment = clone(equipment);
  nextNajie.装备 = Array.isArray(nextNajie.装备) ? nextNajie.装备 : [];

  let index;
  if (Number.isInteger(options.inventoryIndex)) {
    index = options.inventoryIndex;
    if (!sameInstance(nextNajie.装备[index], expected)) {
      return { ok: false, reason: 'stale-code', message: '纳戒内容已经变化，请重新查看纳戒后再输入装备代号。' };
    }
  } else {
    index = findEquipmentIndex(nextNajie.装备, expected);
  }

  const selected = nextNajie.装备[index];
  const quantity = Math.trunc(Number(selected?.数量));
  if (index < 0 || !selected || quantity < 1) {
    return { ok: false, reason: 'missing', message: `纳戒中已没有【${expected?.name || '该装备'}】。` };
  }

  if (quantity === 1) nextNajie.装备.splice(index, 1);
  else selected.数量 = quantity - 1;

  const previous = nextEquipment[slot];
  if (previous?.name) {
    nextNajie.装备.push({
      ...clone(previous),
      数量: 1,
      islockd: previous.大道至宝本体 ? 1 : 0,
    });
  }

  nextEquipment[slot] = {
    ...clone(selected),
    type: expected.type,
    数量: 1,
  };
  return { ok: true, najie: nextNajie, equipment: nextEquipment, item: nextEquipment[slot] };
}
