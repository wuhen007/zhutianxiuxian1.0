import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateEquippedStats,
  getEquipmentAllAttributeMultiplier,
} from '../model/equipmentStats.js';

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
  // 三件各 +9900% 的百分比装备：先加算（29700%）后乘一次基础属性，
  // 未达 50000% 上限，最终倍率为 298 倍
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
  assert.deepEqual(
    calculateEquippedStats(base, [{
      atk: 100,
      def: 200,
      HP: 300,
      归一属性: { 百分比: { atk: 0.5, def: 0.25, HP: 1 } },
    }]),
    { 攻击: 1600, 防御: 1450, 血量上限: 2300 }
  );
});

test('百分比装备单属性加成上限为 50000%', () => {
  const base = { 攻击: 1000, 防御: 1000, 血量上限: 1000 };
  // 60000% 应被钳制到 50000%（501 倍）
  assert.equal(
    calculateEquippedStats(base, [{ 归一属性: { 百分比: { atk: 600 } } }]).攻击,
    501000
  );
  // 6000% 未达上限，正常生效（61 倍）
  assert.equal(
    calculateEquippedStats(base, [{ 归一属性: { 百分比: { atk: 60 } } }]).攻击,
    61000
  );
  // 恰好 5000% 正常生效（51 倍）
  assert.equal(
    calculateEquippedStats(base, [{ 归一属性: { 百分比: { atk: 50 } } }]).攻击,
    51000
  );
  // 4900% 正常生效（50 倍）
  assert.equal(
    calculateEquippedStats(base, [{ 归一属性: { 百分比: { atk: 49 } } }]).攻击,
    50000
  );
});

test('大罗剑胎对至尊体系列提供十五倍，其他灵根提供七点五倍', () => {
  const sword = {
    name: '大罗剑胎',
    至尊体全属性倍率: 15,
    其他灵根全属性倍率: 7.5,
  };

  assert.equal(getEquipmentAllAttributeMultiplier({ 灵根: { type: '至尊体' } }, sword), 15);
  assert.equal(getEquipmentAllAttributeMultiplier({ 灵根: { type: '涅槃至尊体' } }, sword), 15);
  assert.equal(getEquipmentAllAttributeMultiplier({ 灵根: { type: '终极至尊体' } }, sword), 15);
  assert.equal(getEquipmentAllAttributeMultiplier({ 灵根: { type: '天灵根' } }, sword), 7.5);
  assert.equal(getEquipmentAllAttributeMultiplier({ 灵根: { type: '至尊体' } }, { name: '普通剑' }), 1);
});
