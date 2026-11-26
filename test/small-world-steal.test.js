import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SMALL_WORLD_GUARD_ENERGY_COST,
  SMALL_WORLD_STEAL_COOLDOWN_MS,
  calculateGuardInterceptChance,
  consumeGuardEnergy,
  getStealCooldownRemaining,
  isCropStealable,
  isWorldStealProtected,
  recordCropSteal,
} from '../apps/Garden/smallWorldSteal.js';

const seed = { requirements: { 灵气浓度: 1000 } };
const world = {
  attributes: {
    灵气浓度: 1000,
    时间流速: '1:1',
  },
};

test('只有真正成熟且未被偷过的作物可以偷菜', () => {
  const crop = { 种植时间: '2026-01-01T00:00:00.000Z', 当前阶段: 5 };

  assert.equal(
    isCropStealable(crop, seed, world, new Date('2026-01-01T03:59:59.000Z')),
    false
  );
  assert.equal(
    isCropStealable(crop, seed, world, new Date('2026-01-01T04:00:00.000Z')),
    true
  );

  recordCropSteal(crop, '10001', Date.parse('2026-01-01T04:00:00.000Z'));
  assert.equal(
    isCropStealable(crop, seed, world, new Date('2026-01-01T05:00:00.000Z')),
    false
  );
  assert.equal(crop.偷菜记录[0].偷取者, '10001');
});

test('偷菜者冷却12小时，目标世界保护6小时', () => {
  const now = Date.parse('2026-01-02T00:00:00.000Z');
  const lastAction = now - 5 * 60 * 60 * 1000;

  assert.equal(
    getStealCooldownRemaining(lastAction, now),
    SMALL_WORLD_STEAL_COOLDOWN_MS - 5 * 60 * 60 * 1000
  );
  assert.equal(isWorldStealProtected(lastAction, now), true);
  assert.equal(isWorldStealProtected(now - 6 * 60 * 60 * 1000, now), false);
});

test('仙宠守卫拦截率受品质、等级、类型、特性和精力影响', () => {
  const basicPet = {
    type: '修炼',
    品级: '仙胎',
    等级: 1,
    精力: 100,
    最大精力: 100,
    特性: [],
    累倒: false,
  };
  const strongPet = {
    type: '战斗',
    品级: '仙灵',
    等级: 100,
    精力: 100,
    最大精力: 100,
    特性: ['强韧', '神速'],
    累倒: false,
  };
  const tiredPet = { ...strongPet, 精力: 10 };

  assert.ok(
    calculateGuardInterceptChance(strongPet) > calculateGuardInterceptChance(basicPet)
  );
  assert.ok(
    calculateGuardInterceptChance(tiredPet) < calculateGuardInterceptChance(strongPet)
  );
  assert.ok(calculateGuardInterceptChance(strongPet) <= 0.8);
  assert.equal(calculateGuardInterceptChance({ ...strongPet, 精力: 0 }), 0);
  assert.equal(calculateGuardInterceptChance({ ...strongPet, 累倒: true }), 0);
});

test('守卫遭遇偷菜会消耗精力，耗尽时自动撤下', () => {
  const pet = {
    精力: SMALL_WORLD_GUARD_ENERGY_COST,
    最大精力: 100,
    守卫: true,
  };

  assert.equal(consumeGuardEnergy(pet), 0);
  assert.equal(pet.精力, 0);
  assert.equal(pet.守卫, false);
});
