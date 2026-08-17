import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateFlowerDaoGain,
  calculateFlowerExtremeBonus,
  ensureFlowerPollenState,
  getFlowerDaoAttemptCost,
  getFlowerDaoGateState,
  getFlowerDaoWoundState,
  getFlowerEvolutionChance,
  getFlowerPathAttributeMultiplier,
  recordFlowerDaoAttempt,
  resolveFlowerBreakthrough,
} from '../model/flowerPollenPath.js';

test('花粉道则使用独立状态并限制每日悟道次数', () => {
  const player = ensureFlowerPollenState({ huafenlevel_id: 9, 修为: 1e12, 血气: 1e12 });
  const initial = getFlowerDaoGateState(player, 9);
  assert.equal(initial.ok, false);
  assert.equal(initial.rule.name, '圣者花粉道则');
  assert.deepEqual(player.花粉道途.daily, { date: '', count: 0 });

  const cost = getFlowerDaoAttemptCost(player, 9, 2);
  assert.equal(cost.cultivation, 23437500000000);
  const gain = calculateFlowerDaoGain(player, 9, () => 0.5, { eraIndex: 2 });
  assert.ok(gain.gain > 0);

  for (let i = 0; i < 3; i += 1) {
    const result = recordFlowerDaoAttempt(player, 9, 10, '2026-08-16');
    assert.equal(result.ok, true);
  }
  const blocked = recordFlowerDaoAttempt(player, 9, 10, '2026-08-16');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'daily');

  const nextDay = recordFlowerDaoAttempt(player, 9, 10, '2026-08-17');
  assert.equal(nextDay.ok, true);
  assert.equal(player.花粉道途.daily.count, 1);
});

test('花粉高阶节点进入多阶段蜕变劫', () => {
  const player = ensureFlowerPollenState({
    huafenlevel_id: 9,
    进化积淀: 0,
    花粉隐患: 0,
    花粉极境: [],
  });
  const result = resolveFlowerBreakthrough(player, '无暇进化花粉', () => 0, { eraIndex: 2 });
  assert.equal(result.ok, true);
  assert.equal(result.breakthrough, true);
  assert.equal(result.targetLevelId, 10);
  assert.equal(result.stages.length, 3);
  assert.ok(result.stages.every(stage => stage.ok));
  assert.equal(player.huafenlevel_id, 10);
});

test('花粉蜕变劫失败会记录失败阶段但不误升境界', () => {
  const player = ensureFlowerPollenState({ huafenlevel_id: 9, 进化积淀: 0, 花粉隐患: 0 });
  const result = resolveFlowerBreakthrough(player, '无暇进化花粉', () => 1, { eraIndex: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'breakthrough-failed');
  assert.equal(result.breakthrough, true);
  assert.equal(result.failedStage, '圣域显化');
  assert.equal(player.huafenlevel_id, 9);
  assert.equal(player.进化积淀, 44);
  assert.equal(player.花粉隐患, 11);
});

test('大宇与究极分支提供不同战斗侧重点，污染只压低花粉属性', () => {
  const neutral = ensureFlowerPollenState({ huafenlevel_id: 17, 始祖污染度: 0 });
  const greatUniverse = ensureFlowerPollenState({ huafenlevel_id: 17, 花粉路分支: '大宇', 始祖污染度: 0 });
  const ultimate = ensureFlowerPollenState({ huafenlevel_id: 17, 花粉路分支: '究极', 始祖污染度: 0 });
  const neutralBonus = calculateFlowerExtremeBonus(neutral, { 基础攻击: 1000, 基础防御: 1000, 基础血量: 1000 });
  const greatBonus = calculateFlowerExtremeBonus(greatUniverse, { 基础攻击: 1000, 基础防御: 1000, 基础血量: 1000 });
  const ultimateBonus = calculateFlowerExtremeBonus(ultimate, { 基础攻击: 1000, 基础防御: 1000, 基础血量: 1000 });

  assert.ok(greatBonus.攻击 > neutralBonus.攻击);
  assert.ok(ultimateBonus.防御 > neutralBonus.防御);
  assert.ok(greatBonus.攻击 > ultimateBonus.攻击);
  assert.equal(getFlowerPathAttributeMultiplier(neutral), 1);
  const polluted = ensureFlowerPollenState({ huafenlevel_id: 17, 花粉路分支: '大宇', 始祖污染度: 70 });
  assert.equal(getFlowerPathAttributeMultiplier(polluted), 0.9);
});

test('道伤同时压低花粉属性、悟道与进化稳定性', () => {
  const healthy = ensureFlowerPollenState({ huafenlevel_id: 9, 道伤: 0 });
  const wounded = ensureFlowerPollenState({ huafenlevel_id: 9, 道伤: 2 });
  assert.deepEqual(getFlowerDaoWoundState(wounded), {
    wounds: 2,
    chancePenalty: 0.16,
    daoMultiplier: 0.8,
    attrMultiplier: 0.9,
  });
  assert.ok(getFlowerPathAttributeMultiplier(wounded) < getFlowerPathAttributeMultiplier(healthy));
  assert.ok(
    calculateFlowerDaoGain(wounded, 9, () => 0.5, { eraIndex: 2 }).gain
      < calculateFlowerDaoGain(healthy, 9, () => 0.5, { eraIndex: 2 }).gain
  );
  assert.ok(
    getFlowerEvolutionChance(wounded, '无暇进化花粉', { eraIndex: 2 })
      < getFlowerEvolutionChance(healthy, '无暇进化花粉', { eraIndex: 2 })
  );
});
