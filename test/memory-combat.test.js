import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryRoot, getMemoryLifeMaximum } from '../model/memoryPath.js';
import {
  consumeMemoryTrick, createMemoryTribulationState, hasMemoryCombatEffects, recordMemoryAttack,
  resetMemoryCombat, tickMemoryCombatRound, tickMemoryTribulationRound, tryMemoryLethalSurvival, tryMemoryTimeRevival,
} from '../model/memoryCombat.js';

const unit = (factors, extra = {}) => ({
  名号: '记忆行者', 灵根: createMemoryRoot(2), 记忆命途: { 因子: factors },
  攻击: 1000, 防御: 500, 当前血量: 10000, 血量上限: 10000, 速度: 100,
  生命本源: 1000, 仙道潜力: 123, ...extra,
});

test('负世每全局回合按开场攻击线性增长，纷争每三回合按开场生命上限增长且同轮幂等', () => {
  for (const tier of [1, 2, 3]) {
    const player = unit({ 负世: tier, 纷争: tier });
    resetMemoryCombat(player);
    for (let round = 1; round <= 6; round++) {
      tickMemoryCombatRound(player, round);
      tickMemoryCombatRound(player, round);
    }
    assert.equal(player.攻击, 1000 * (1 + [0, .01, .02, .03][tier] * 6));
    assert.equal(player.血量上限, 10000 * (1 + [0, .02, .04, .08][tier] * 2));
    assert.equal(player.当前血量, 10000, '增加上限不免费回复气血');
    assert.equal(player.仙道潜力, 123);
    assert.equal(Object.keys(player).some(key => key.startsWith('_memory')), false);
  }
});

test('诡计在第6/4/2次真实攻击封锁对手下一击，不按连击重复触发', () => {
  for (const tier of [1, 2, 3]) {
    const player = unit({ 诡计: tier });
    const target = unit({});
    const interval = [0, 6, 4, 2][tier];
    for (let action = 1; action < interval; action++) {
      recordMemoryAttack(player, target, action);
      recordMemoryAttack(player, target, action);
      assert.equal(consumeMemoryTrick(target).skipped, false);
    }
    recordMemoryAttack(player, target, interval);
    const cancel = consumeMemoryTrick(target);
    assert.equal(cancel.skipped, true);
    assert.match(cancel.message, /在激烈的战斗之中体内能量突然停滞也不是没有可能/);
    assert.equal(consumeMemoryTrick(target).skipped, false);
  }
});

test('死亡一次保1、纷争一次半血复活，禁复活和境界镇杀不能触发', () => {
  const player = unit({ 死亡: 1, 纷争: 1 }, { 当前血量: 0 });
  assert.equal(tryMemoryLethalSurvival(player).guarded, true);
  assert.equal(player.当前血量, 1);
  player.当前血量 = 0;
  assert.equal(tryMemoryLethalSurvival(player).revived, true);
  assert.equal(player.当前血量, 5000);
  player.当前血量 = 0;
  assert.equal(tryMemoryLethalSurvival(player).revived, false);
  for (const extra of [{ 不可复活: true }, { _高境界镇杀: true }, { _高境界压制: true }, { _tahua_type: 'mirror_self' }]) {
    assert.equal(tryMemoryLethalSurvival(unit({ 死亡: 3, 纷争: 3 }, { 当前血量: 0, ...extra })).revived, false);
  }
});

test('死亡灰暗按12/8/4击叠印，12/12/8印处决普通怪；玩家天骄首领大帝改为25%上限伤害', () => {
  for (const tier of [1, 2, 3]) {
    const attacks = [0, 144, 96, 32][tier];
    for (const protectedFields of [null, { id: 'player' }, { 天骄: true }, { boss: true }, { mijinglevel_id: 16 }]) {
      const attacker = unit({ 死亡: tier });
      const target = { 名号: '敌方', 攻击: 1, 当前血量: 10000, 血量上限: 10000, ...protectedFields };
      for (let action = 1; action < attacks; action++) recordMemoryAttack(attacker, target, action);
      assert.equal(target.当前血量, 10000);
      recordMemoryAttack(attacker, target, attacks);
      assert.equal(target.当前血量, protectedFields ? 7500 : 0);
    }
  }
  const lower = unit({ 死亡: 3, 诡计: 3 }, { mijinglevel_id: 19 });
  const higher = { 当前血量: 10000, 血量上限: 10000, mijinglevel_id: 20 };
  for (let attack = 1; attack <= 200; attack++) recordMemoryAttack(lower, higher, attack);
  assert.equal(higher.当前血量, 10000);
  assert.equal(consumeMemoryTrick(higher).skipped, false);
  const attacker = unit({ 死亡: 3 });
  const ordinaryCalamity = { id: 'foreign-natural-1000-1', 名号: '吞界孽犼', type: '孽兽', 当前血量: 10000, 血量上限: 10000, mijinglevel_id: 10 };
  for (let attack = 1; attack <= 32; attack++) recordMemoryAttack(attacker, ordinaryCalamity, attack);
  assert.equal(ordinaryCalamity.当前血量, 0, '低境界普通灾厄ID不误认成玩家');
});

test('时间因子渡劫消耗500/400/300本源，避劫满血不改变本源上限，每场只一次并计12道冷却', () => {
  for (const tier of [1, 2, 3]) {
    const player = unit({ 时间: tier }, { 当前血量: 100 });
    const maximum = getMemoryLifeMaximum(player);
    const state = createMemoryTribulationState();
    tickMemoryTribulationRound(state);
    const result = tryMemoryTimeRevival(player, state, { damage: 100 });
    assert.equal(result.cost, [0, 500, 400, 300][tier]);
    assert.equal(player.生命本源, 1000 - result.cost);
    assert.equal(player.当前血量, 10000);
    assert.equal(getMemoryLifeMaximum(player), maximum);
    assert.equal(state.cooldown, 12);
    for (let round = 0; round < 12; round++) tickMemoryTribulationRound(state);
    assert.equal(state.cooldown, 0);
    assert.equal(tryMemoryTimeRevival(player, state, { damage: 20000 }).revived, false);
  }
  const poor = unit({ 时间: 1 }, { 当前血量: 0, 生命本源: 499 });
  assert.equal(tryMemoryTimeRevival(poor, createMemoryTribulationState()).revived, false);
  assert.equal(poor.生命本源, 499);
});

test('学习同名技能不赋予因子；非记忆根与召唤物不获得战斗成长', () => {
  const player = unit({ 负世: 3, 纷争: 3 }, { 灵根: { name: '普通灵根' }, 学习的功法: ['负世', '纷争', '死亡'] });
  assert.equal(hasMemoryCombatEffects(player), false);
  assert.deepEqual(tickMemoryCombatRound(player, 1).messages, []);
  assert.equal(player.攻击, 1000);
});
