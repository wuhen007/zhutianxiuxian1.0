import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  EquipmentTransferError,
  applyEquipmentTransfer,
  isItemPermanentlyNonTradeable,
  isItemTransferRestricted,
  transferEquipment,
} from '../model/equipmentTransfer.js';

function najie(equipment = []) {
  return { 装备: structuredClone(equipment) };
}

const namedPercentageTreasure = {
  name: '星海之心',
  class: '装备',
  type: '法宝',
  atk: 1.83,
  def: 1.26,
  HP: 2.4,
  bao: 0.35,
  pinji: 6,
  稀有度: 10,
  author_name: 'forge-master',
  owner_name: '10001',
  数量: 1,
  islockd: 0,
};

test('name transfer preserves a top-quality percentage equipment instance', () => {
  const source = najie([namedPercentageTreasure]);
  const target = najie();

  const result = applyEquipmentTransfer(
    source,
    target,
    { name: namedPercentageTreasure.name },
    1,
    '20002',
  );

  assert.equal(source.装备.length, 0);
  assert.equal(target.装备.length, 1);
  assert.deepEqual(target.装备[0], {
    ...namedPercentageTreasure,
    owner_name: '20002',
  });
  assert.equal(result.item.pinji, 6);
  assert.equal(result.item.atk, 1.83);
  assert.equal(result.item.def, 1.26);
  assert.equal(result.item.HP, 2.4);
});

test('receiver write failure restores both inventories', async () => {
  const stores = new Map([
    ['20002', najie([{ ...namedPercentageTreasure, owner_name: '20002' }])],
    ['10001', najie()],
  ]);
  const before = structuredClone([...stores.entries()]);
  const lockOrder = [];
  let failReceiverOnce = true;

  await assert.rejects(
    transferEquipment({
      sourceId: '20002',
      targetId: '10001',
      selector: { name: namedPercentageTreasure.name },
      quantity: 1,
    }, {
      readNajie: async playerId => structuredClone(stores.get(playerId)),
      writeNajie: async (playerId, value) => {
        if (playerId === '10001' && failReceiverOnce) {
          failReceiverOnce = false;
          throw new Error('receiver write failed');
        }
        stores.set(playerId, structuredClone(value));
      },
      withPlayerLock: async (playerId, task) => {
        lockOrder.push(playerId);
        return task();
      },
    }),
    error => error instanceof EquipmentTransferError && error.code === 'write-failed',
  );

  assert.deepEqual([...stores.entries()], before);
  assert.deepEqual(lockOrder, ['10001', '20002']);
});

test('name transfer rejects different variants with the same name', () => {
  const source = najie([
    namedPercentageTreasure,
    { ...namedPercentageTreasure, pinji: 5, atk: 1.5 },
  ]);
  const target = najie();

  assert.throws(
    () => applyEquipmentTransfer(source, target, { name: namedPercentageTreasure.name }, 1, '20002'),
    error => error instanceof EquipmentTransferError && error.code === 'ambiguous',
  );
  assert.equal(source.装备.length, 2);
  assert.equal(target.装备.length, 0);
});

test('equipment code refuses to send a different item after the inventory changes', () => {
  const source = najie([{ ...namedPercentageTreasure, name: '后来入包的装备' }]);
  const target = najie();

  assert.throws(
    () => applyEquipmentTransfer(source, target, {
      index: 0,
      expected: namedPercentageTreasure,
    }, 1, '20002'),
    error => error instanceof EquipmentTransferError && error.code === 'stale-code',
  );
  assert.equal(source.装备[0].name, '后来入包的装备');
  assert.equal(target.装备.length, 0);
});

test('gift rejects locked and non-tradeable unique items without changing inventories', () => {
  for (const restriction of [
    { islockd: 1 },
    { 不可交易: 1 },
    { 全服唯一: 1 },
    { 大道至宝本体: true },
    { 品阶: '先天至宝', islockd: 0 },
    { type: '帝兵', author_name: '10001' },
  ]) {
    const protectedItem = { ...namedPercentageTreasure, ...restriction };
    const source = najie([protectedItem]);
    const target = najie();

    assert.equal(isItemTransferRestricted(protectedItem), true);
    assert.throws(
      () => applyEquipmentTransfer(source, target, { name: protectedItem.name }, 1, '20002'),
      error => error instanceof EquipmentTransferError && error.code === 'transfer-forbidden',
    );
    assert.deepEqual(source, najie([protectedItem]));
    assert.deepEqual(target, najie());
  }
});

test('gift command checks both inventory lock state and catalog trade restrictions', () => {
  const source = fs.readFileSync(new URL('../apps/User/MoneyOperation.js', import.meta.url), 'utf8');
  assert.equal(isItemPermanentlyNonTradeable({ islockd: 1 }), false);
  assert.match(source, /isItemTransferRestricted\(sourceItem\) \|\| isItemPermanentlyNonTradeable\(catalogItem\)/);
  assert.match(source, /已锁定或属于不可交易造化，不能赠送/);
});

test('shared inventory helper refuses equipment removal without quality', () => {
  const source = fs.readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
  const moneyOperation = fs.readFileSync(new URL('../apps/User/MoneyOperation.js', import.meta.url), 'utf8');
  assert.match(source, /pinji === undefined \|\| pinji === null\) && x < 0/);
  assert.match(source, /扣除装备必须指定品质/);
  assert.match(source, /if \(!target\) throw new Error\(`纳戒中不存在指定品质的装备/);
  assert.match(moneyOperation, /'装备', -1, wallet\.pinji/);
});
