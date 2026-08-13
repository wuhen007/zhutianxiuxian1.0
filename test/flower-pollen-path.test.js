import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateFlowerExtremeBonus,
  completeFlowerExtremeTrial,
  ensureFlowerPollenState,
  getFlowerEvolutionChance,
  getRequiredPollenQuality,
  resolveFlowerEvolution,
  getNextFlowerExtremeTrial,
} from '../model/flowerPollenPath.js';

test('flower pollen state is initialized for old saves', () => {
  const player = {};
  ensureFlowerPollenState(player);
  assert.deepEqual(player.花粉极境, []);
  assert.equal(player.huafenlevel_id, 1);
  assert.equal(player.花粉隐患, 0);
});

test('better pollen raises success while hidden risk lowers it', () => {
  const clean = { huafenlevel_id: 5, 进化积淀: 50, 花粉隐患: 0, 学习的功法: ['基础呼吸法'] };
  const risky = { ...clean, 花粉隐患: 100 };
  assert.ok(getFlowerEvolutionChance(clean, '灵性进化花粉') > getFlowerEvolutionChance(risky, '灵性进化花粉'));
  assert.ok(getFlowerEvolutionChance(clean, '神性进化花粉') > getFlowerEvolutionChance(clean, '灵性进化花粉'));
  const ancestorSeedBonus = getFlowerEvolutionChance(risky, '灵性进化花粉', { ancestorSeed: true })
    - getFlowerEvolutionChance(risky, '灵性进化花粉');
  assert.ok(Math.abs(ancestorSeedBonus - 0.08) < Number.EPSILON * 2);
});

test('late evolution requires better pollen and records the ultimate branch', () => {
  assert.equal(getRequiredPollenQuality(18), 4);
  const player = {
    huafenlevel_id: 16,
    进化积淀: 300,
    花粉隐患: 10,
    花粉极境: ['究极根基'],
    学习的功法: ['盗引呼吸法'],
  };
  const result = resolveFlowerEvolution(player, '无暇进化花粉', () => 0);
  assert.equal(result.ok, true);
  assert.equal(player.huafenlevel_id, 17);
  assert.equal(player.花粉路分支, '究极');
});

test('extreme trials consume accumulation and grant realm-only bonuses', () => {
  const player = { huafenlevel_id: 2, 进化积淀: 40, 花粉隐患: 20, 花粉极境: [] };
  assert.equal(completeFlowerExtremeTrial(player).ok, true);
  assert.deepEqual(player.花粉极境, ['本源觉醒']);
  assert.deepEqual(calculateFlowerExtremeBonus(player, {
    基础攻击: 1000,
    基础防御: 2000,
    基础血量: 3000,
  }), { 攻击: 30, 防御: 60, 血量: 90, rate: 0.03 });
});

test('missed early extremes can be completed after later evolution', () => {
  const player = { huafenlevel_id: 8, 进化积淀: 500, 花粉隐患: 0, 花粉极境: [] };
  assert.deepEqual(getNextFlowerExtremeTrial(player), {
    name: '本源觉醒',
    accumulation: 40,
    realmLevel: 2,
  });
  assert.equal(completeFlowerExtremeTrial(player).ok, true);
  assert.equal(getNextFlowerExtremeTrial(player).name, '十二枷锁尽断');
});
