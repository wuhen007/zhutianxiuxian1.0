import assert from 'node:assert/strict';
import test from 'node:test';

import {
  consumeFlowerFruit,
  ensureFlowerPollenState,
  getBestBreathingMethod,
  getFlowerEvolutionChance,
  getFlowerRootState,
  recordFlowerBreathingPractice,
  repairFlowerRoot,
} from '../model/flowerPollenPath.js';

test('异果增加进化积淀并记录根基损伤', () => {
  const player = ensureFlowerPollenState({ huafenlevel_id: 5, 进化积淀: 10 });
  const result = consumeFlowerFruit(player, '本源异果', 1000);
  assert.equal(result.ok, true);
  assert.equal(player.进化积淀, 130);
  assert.equal(result.beforeDamage, 0);
  assert.equal(result.afterDamage, 16);
  assert.equal(player.花粉根基.服用记录.length, 1);
  assert.equal(getFlowerRootState(player).damage, 16);
});

test('根基损伤会压低进化成功率，临界时禁止继续服用异果', () => {
  const clean = ensureFlowerPollenState({ huafenlevel_id: 5 });
  const damaged = ensureFlowerPollenState({ huafenlevel_id: 5, 花粉根基: { 损伤: 80 } });
  assert.ok(getFlowerEvolutionChance(clean, '普通进化花粉') > getFlowerEvolutionChance(damaged, '普通进化花粉'));
  damaged.花粉根基.损伤 = 100;
  const result = consumeFlowerFruit(damaged, '进化异果');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'root-critical');
});

test('净化材料可以重塑花粉进化根基', () => {
  const player = ensureFlowerPollenState({ 花粉根基: { 损伤: 70 } });
  const result = repairFlowerRoot(player, 45, '本源圣药');
  assert.equal(result.repaired, 45);
  assert.equal(result.after, 25);
  assert.equal(player.花粉根基.修复次数, 1);
});

test('花粉悟道会培养当前最高阶呼吸法', () => {
  const player = ensureFlowerPollenState({ 学习的功法: ['基础呼吸法', '大雷音呼吸法'] });
  const before = getBestBreathingMethod(player);
  assert.equal(before[0], '大雷音呼吸法');
  const result = recordFlowerBreathingPractice(player, 3);
  assert.equal(result.name, '大雷音呼吸法');
  assert.equal(result.gained, 3);
  assert.equal(result.profile.exp, 3);
  assert.ok(getBestBreathingMethod(player)[1] > before[1]);
});
