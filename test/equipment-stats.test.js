import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateEquippedStats } from '../model/equipmentStats.js';

test('装备百分比统一加算后只乘一次基础属性', () => {
  const base = { 攻击: 1000, 防御: 1000, 血量上限: 1000 };

  assert.equal(
    calculateEquippedStats(base, [{ atk: 0.5 }, { atk: 0.5 }, { atk: 0.5 }]).攻击,
    2500
  );
  assert.equal(
    calculateEquippedStats(base, [{ atk: 1 }, { atk: 1 }, { atk: 1 }]).攻击,
    4000
  );
  assert.deepEqual(
    calculateEquippedStats(base, [
      { atk: 99, def: 99, HP: 99 },
      { atk: 99, def: 99, HP: 99 },
      { atk: 99, def: 99, HP: 99 },
    ]),
    { 攻击: 298000, 防御: 298000, 血量上限: 298000 }
  );
  assert.deepEqual(
    calculateEquippedStats(base, [{ atk: 0.5 }, { atk: 100, def: 200, HP: 300 }]),
    { 攻击: 1600, 防御: 1200, 血量上限: 1300 }
  );
});
