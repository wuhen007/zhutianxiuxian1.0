import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activateTianjiaoScent,
  applyPveStatMultiplier,
  calculateTianjiTrainingReward,
  consumeSourceStoneField,
  consumeTianjiaoScent,
  getSourceStoneFieldAccess,
  getTianjiaoScentAccess,
  prepareSourceStoneField,
} from '../model/tianjiTalismans.js';

test('天机历练符沿用寻宝四境修血公式且每张独立翻倍', () => {
  const values = [0, 0, 0.1, 0, 0, 0.9];
  let index = 0;
  const reward = calculateTianjiTrainingReward(
    { level_id: 2, Physique_id: 3, mijinglevel_id: 4, xiangulevel_id: 5, 幸运: 0 },
    2,
    { random: () => values[index++] },
  );
  assert.equal(reward.doubleChance, 0.2);
  assert.equal(reward.doubled, 1);
  assert.equal(reward.cultivation, 4_806_000);
  assert.equal(reward.blood, 10_806_000);
});

test('万里定位符首次讨伐锁定目标并提供三次免线索追息', () => {
  const player = {};
  assert.equal(activateTianjiaoScent(player, 100).ok, true);
  assert.equal(getTianjiaoScentAccess(player, '王腾').ok, true);
  assert.deepEqual(consumeTianjiaoScent(player, '王腾'), { ok: true, target: '王腾', remaining: 2 });
  assert.equal(getTianjiaoScentAccess(player, '华云飞').reason, 'target');
  consumeTianjiaoScent(player, '王腾');
  assert.equal(consumeTianjiaoScent(player, '王腾').remaining, 0);
  assert.equal(getTianjiaoScentAccess(player, '王腾').reason, 'none');
});

test('源石场绑定当前位置，为三场PVE提供职业倍率', () => {
  const player = {
    occupation: '源地师',
    源石: 2_000_000,
    power_place: 2,
    遮天位面坐标: { x: 10, y: 20 },
  };
  const prepared = prepareSourceStoneField(player, 100);
  assert.equal(prepared.ok, true);
  assert.equal(player.源石, 1_000_000);

  const combatant = { 攻击: 100, 防御: 80, 当前血量: 50, 血量上限: 100 };
  const consumed = consumeSourceStoneField(player, combatant, 101);
  assert.equal(consumed.multiplier, 1.2);
  assert.deepEqual(combatant, { 攻击: 120, 防御: 96, 当前血量: 60, 血量上限: 120 });
  assert.equal(player.源石场.remaining, 2);

  player.遮天位面坐标 = { x: 11, y: 20 };
  assert.equal(getSourceStoneFieldAccess(player, 102).reason, 'coordinate');
  assert.equal(player.源石场.remaining, 2);
});

test('源天神阵提供35%倍率', () => {
  const combatant = { 攻击: 100, 防御: 100, 当前血量: 100, 血量上限: 100 };
  applyPveStatMultiplier(combatant, 1.35);
  assert.equal(combatant.攻击, 135);
  assert.equal(combatant.血量上限, 135);
});
