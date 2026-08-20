import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateLifeSourceRepairBaseCost } from '../model/lifeSourceRepair.js';

test('生命本源可以按单点计算修复代价', () => {
  assert.equal(calculateLifeSourceRepairBaseCost(100, 1), 90000000);
  assert.equal(calculateLifeSourceRepairBaseCost(149, 1), 90000000);
});

test('生命本源跨越50点阶梯时按各自区间计费', () => {
  assert.equal(calculateLifeSourceRepairBaseCost(149, 2), 210000000);
  assert.equal(calculateLifeSourceRepairBaseCost(100, 50), 4500000000);
});
