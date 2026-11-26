import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateLifeSourceRepairBaseCost,
  getLifeSourceRepairMaximum,
} from '../model/lifeSourceRepair.js';

test('生命本源可以按单点计算修复代价', () => {
  assert.equal(calculateLifeSourceRepairBaseCost(100, 1), 90000000);
  assert.equal(calculateLifeSourceRepairBaseCost(149, 1), 90000000);
});

test('生命本源跨越50点阶梯时按各自区间计费', () => {
  assert.equal(calculateLifeSourceRepairBaseCost(149, 2), 210000000);
  assert.equal(calculateLifeSourceRepairBaseCost(100, 50), 4500000000);
});

test('天魔炼化所得与命格加成共同计入可修复上限', () => {
  const player = {
    灵根: { name: '无相·万化天魔体', 生命本源: 500 },
    天魔化生: { 累计所得: { 生命本源: 37.5 } },
  };
  assert.equal(getLifeSourceRepairMaximum(player, 50), 687.5);
});

test('更换非天魔灵根后不沿用旧天魔炼化本源', () => {
  const player = {
    灵根: { name: '普通灵根', 生命本源: 20 },
    天魔化生: { 累计所得: { 生命本源: 300 } },
  };
  assert.equal(getLifeSourceRepairMaximum(player), 120);
});

test('灾厄炼化的小数生命本源按实际点数计费', () => {
  assert.equal(calculateLifeSourceRepairBaseCost(102.5, 0.5), 45000000);
  assert.equal(calculateLifeSourceRepairBaseCost(149.5, 1), 105000000);
  assert.equal(calculateLifeSourceRepairBaseCost(102.5, 47.5), 4275000000);
});
