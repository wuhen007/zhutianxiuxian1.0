import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateZhetianTribulationCosts,
  rollZhetianMinggeRevival,
} from '../apps/User/zhetianTribulationMingge.js';

test('渡劫修为命格只减少修为，不减少血气', () => {
  assert.deepEqual(
    calculateZhetianTribulationCosts(1000, { 渡劫修为减少: 0.4 }),
    {
      bloodCost: 1000,
      cultivationCost: 600,
      reduction: 0.4,
    }
  );
});

test('证道使用独立的证道修为减免词条', () => {
  assert.deepEqual(
    calculateZhetianTribulationCosts(
      1000,
      { 渡劫修为减少: 0.1, 证道修为减少: 0.4 },
      'zhengdao'
    ),
    {
      bloodCost: 1000,
      cultivationCost: 600,
      reduction: 0.4,
    }
  );
});

test('命格复活按词条概率判定', () => {
  assert.deepEqual(rollZhetianMinggeRevival({ 复活概率: 0.1 }, () => 0.09), {
    chance: 0.1,
    revived: true,
  });
  assert.deepEqual(rollZhetianMinggeRevival({ 复活概率: 0.1 }, () => 0.1), {
    chance: 0.1,
    revived: false,
  });
});
