import { isDeepStrictEqual } from 'node:util';

export class EquipmentTransferError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'EquipmentTransferError';
    this.code = code;
  }
}

function clone(value) {
  return structuredClone(value);
}

function quantityOf(item) {
  return Math.max(0, Number(item?.数量) || 0);
}

function comparableEquipment(item) {
  const copy = clone(item);
  delete copy.数量;
  delete copy.owner_name;
  delete copy.islockd;
  return copy;
}

function isSameVariant(left, right) {
  return isDeepStrictEqual(comparableEquipment(left), comparableEquipment(right));
}

function selectEquipment(equipment, selector) {
  if (Number.isInteger(selector.index)) {
    const item = equipment[selector.index];
    if (!item) {
      throw new EquipmentTransferError('not-found', '装备代号已失效，请重新查看纳戒');
    }
    if (selector.expected && !isSameVariant(item, selector.expected)) {
      throw new EquipmentTransferError('stale-code', '装备代号对应的物品已变化，请重新查看纳戒');
    }
    return [{ item, index: selector.index }];
  }

  let matches = equipment
    .map((item, index) => ({ item, index }))
    .filter(entry => entry.item?.name === selector.name);

  if (selector.pinji !== undefined) {
    matches = matches.filter(entry => entry.item.pinji == selector.pinji);
  }
  if (matches.length === 0) {
    throw new EquipmentTransferError('not-found', `纳戒中没有指定的装备【${selector.name}】`);
  }

  const first = matches[0].item;
  if (matches.some(entry => !isSameVariant(first, entry.item))) {
    throw new EquipmentTransferError(
      'ambiguous',
      `纳戒中存在多件不同属性的【${selector.name}】，请指定品质或使用装备代号`,
    );
  }
  return matches;
}

export function applyEquipmentTransfer(sourceNajie, targetNajie, selector, quantity, targetId) {
  const amount = Math.trunc(Number(quantity));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new EquipmentTransferError('invalid-quantity', '赠送数量必须是正整数');
  }

  sourceNajie.装备 ||= [];
  targetNajie.装备 ||= [];
  const selected = selectEquipment(sourceNajie.装备, selector);
  const sourceItem = selected[0].item;
  if (sourceItem.pinji === undefined || sourceItem.pinji === null) {
    throw new EquipmentTransferError('missing-quality', `装备【${sourceItem.name}】缺少品质数据`);
  }

  const available = selected.reduce((total, entry) => total + quantityOf(entry.item), 0);
  if (available < amount) {
    throw new EquipmentTransferError('insufficient', `【${sourceItem.name}】数量不足`);
  }

  let remaining = amount;
  for (const { item } of selected) {
    const consumed = Math.min(quantityOf(item), remaining);
    item.数量 = quantityOf(item) - consumed;
    remaining -= consumed;
    if (remaining === 0) break;
  }
  sourceNajie.装备 = sourceNajie.装备.filter(item => quantityOf(item) > 0);

  const transferred = {
    ...clone(sourceItem),
    owner_name: String(targetId),
    数量: amount,
    islockd: sourceItem.大道至宝本体 ? 1 : 0,
  };
  const existing = targetNajie.装备.find(item => isSameVariant(item, transferred));
  if (existing) {
    existing.数量 = quantityOf(existing) + amount;
  } else {
    targetNajie.装备.push(transferred);
  }

  return {
    item: clone(transferred),
    quantity: amount,
  };
}

export async function transferEquipment(
  { sourceId, targetId, selector, quantity },
  { readNajie, writeNajie, withPlayerLock },
) {
  const sourceKey = String(sourceId);
  const targetKey = String(targetId);
  if (sourceKey === targetKey) {
    throw new EquipmentTransferError('same-player', '无需把装备赠送给自己');
  }

  const lockIds = [sourceKey, targetKey].sort();
  const acquire = index => index >= lockIds.length
    ? execute()
    : withPlayerLock(lockIds[index], () => acquire(index + 1));

  const execute = async () => {
    const [sourceBefore, targetBefore] = await Promise.all([
      readNajie(sourceKey),
      readNajie(targetKey),
    ]);
    const sourceSnapshot = clone(sourceBefore);
    const targetSnapshot = clone(targetBefore);
    const result = applyEquipmentTransfer(sourceBefore, targetBefore, selector, quantity, targetKey);

    try {
      await writeNajie(sourceKey, sourceBefore);
      await writeNajie(targetKey, targetBefore);
    } catch (error) {
      const rollbackErrors = [];
      for (const [playerId, snapshot] of [[targetKey, targetSnapshot], [sourceKey, sourceSnapshot]]) {
        try {
          await writeNajie(playerId, snapshot);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (rollbackErrors.length > 0) {
        throw new AggregateError([error, ...rollbackErrors], '装备赠送写入及回滚均失败');
      }
      throw new EquipmentTransferError(
        'write-failed',
        '装备赠送写入中断，双方纳戒已恢复',
        { cause: error },
      );
    }
    return result;
  };

  return acquire(0);
}
