import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  SMALL_WORLD_ALCHEMY_RATE,
  SMALL_WORLD_PILL_POOL,
  pickSmallWorldPill,
} from '../apps/Garden/smallWorldAlchemy.js';

const expectedPills = {
  小界蕴灵丹: 5_000_000,
  洞天造化丹: 15_000_000,
  世界本源丹: 30_000_000,
  鸿蒙道源丹: 210_000_000,
};

test('小世界丹房使用低产率和四档权重', () => {
  assert.equal(SMALL_WORLD_ALCHEMY_RATE, 0.05);
  assert.equal(SMALL_WORLD_PILL_POOL.reduce((sum, pill) => sum + pill.weight, 0), 100);
  assert.deepEqual(
    [0, 0.7, 0.92, 0.99].map(pickSmallWorldPill),
    Object.keys(expectedPills),
  );
});

test('四种专属神药已写入丹药列表并具有正确药力', () => {
  const medicineFile = new URL('../resources/data/item/丹药列表.json', import.meta.url);
  const medicines = JSON.parse(readFileSync(medicineFile, 'utf8'));

  for (const [name, value] of Object.entries(expectedPills)) {
    const pill = medicines.find(item => item.name === name);
    assert.ok(pill, `${name}不存在`);
    assert.equal(pill.type, '神药');
    assert.equal(pill.exp, value);
    assert.equal(pill.xueqi, value);
  }
});
