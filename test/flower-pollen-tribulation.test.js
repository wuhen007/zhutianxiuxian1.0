import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ensureFlowerPollenState,
  getFlowerTribulationCost,
  getFlowerTribulationGateState,
  resolveFlowerTribulation,
} from '../model/flowerPollenPath.js';

test('花粉专属渡劫拥有独立状态和成本', () => {
  const player = ensureFlowerPollenState({ huafenlevel_id: 9 });
  const gate = getFlowerTribulationGateState(player, 9);
  assert.equal(gate.ok, false);
  assert.equal(gate.rule.name, '圣者花劫');
  assert.deepEqual(player.花粉渡劫.history, []);
  assert.equal(getFlowerTribulationCost(9, 2).cultivation, 3_072_000_000);
});

test('高阶花粉渡劫必须先圆满花粉道则', () => {
  const player = ensureFlowerPollenState({ huafenlevel_id: 9 });
  const result = resolveFlowerTribulation(player, () => 0, { now: 1000 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'dao');
  assert.equal(player.花粉渡劫.history.length, 0);
});

test('渡过花粉专属劫会留下印记并净化本源', () => {
  const player = ensureFlowerPollenState({
    huafenlevel_id: 9,
    花粉隐患: 20,
    始祖污染度: 20,
    进化积淀: 0,
  });
  player.花粉道途.stages.saintPrinciple = 600;
  const result = resolveFlowerTribulation(player, () => 0, { now: 1000, maxHp: 1000 });
  assert.equal(result.ok, true);
  assert.equal(result.stages.length, 3);
  assert.equal(getFlowerTribulationGateState(player, 9).ok, true);
  assert.equal(player.花粉隐患, 6);
  assert.equal(player.始祖污染度, 13);
  assert.equal(player.进化积淀, 45);
  assert.equal(player.花粉渡劫.history.at(-1).ok, true);
});

test('花粉专属劫失败会记录失败次数和污染增长', () => {
  const player = ensureFlowerPollenState({
    huafenlevel_id: 9,
    花粉隐患: 0,
    始祖污染度: 0,
    进化积淀: 0,
  });
  player.花粉道途.stages.saintPrinciple = 600;
  const result = resolveFlowerTribulation(player, () => 1, { now: 1000 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'failed');
  assert.equal(result.failedStage, '圣域显化');
  assert.equal(result.failures, 1);
  assert.equal(player.花粉隐患, 10);
  assert.equal(player.始祖污染度, 7);
  assert.equal(getFlowerTribulationGateState(player, 9).ok, false);
});
