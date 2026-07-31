import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getReverseLifeTribulationWaves,
  ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS,
} from '../apps/User/zhetianTribulationRules.js';

test('遮天各境界使用独立雷劫倍率', () => {
  assert.deepEqual(ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS, {
    斩道: 30,
    圣人: 45,
    圣人王: 60,
    大圣: 90,
    准帝: 120,
    大帝: 150,
    逆活: 180,
  });
});

test('逆活每多一世增加七道雷劫', () => {
  assert.equal(getReverseLifeTribulationWaves(1), 7);
  assert.equal(getReverseLifeTribulationWaves(5), 35);
  assert.equal(getReverseLifeTribulationWaves(9), 63);
});
