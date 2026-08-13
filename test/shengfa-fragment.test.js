import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySuperdimensionalOpening,
  ascendSuperdimensionalStarRealm,
  canCreateWithSuperdimensionalPower,
  completeShengfaRefinement,
  getSuperdimensionalRewriteName,
  getSuperdimensionalRewriteTarget,
  rollShengfaDungeonEncounter,
  settleSuperdimensionalStarRealm,
  SHENGFA_GONGFA,
  SHENGFA_REFINE_MS,
  startShengfaRefinement,
} from '../model/shengfaFragment.js';
import { getGongfaTriggerChance } from '../model/gongfaProficiency.js';

test('圣法碎片炼化480分钟且不提升境界', () => {
  const player = {
    level_id: 12,
    Physique_id: 11,
    mijinglevel_id: 3,
    xiangulevel_id: 2,
    学习的功法: [],
  };
  const started = startShengfaRefinement(player, { now: 1000 });
  assert.equal(started.endTime, 1000 + SHENGFA_REFINE_MS);
  assert.equal(completeShengfaRefinement(player, started.endTime - 1).ok, false);
  assert.equal(completeShengfaRefinement(player, started.endTime).ok, true);
  assert.deepEqual(
    [player.level_id, player.Physique_id, player.mijinglevel_id, player.xiangulevel_id],
    [12, 11, 3, 2],
  );
  assert.equal(player.天资等级, '无演无尽');
  assert.equal(player.灵根.type, '神慧者');
  assert.equal(player.神慧境界, 1);
  assert.ok(SHENGFA_GONGFA.every(name => player.学习的功法.includes(name)));
});

test('仅无化如是能以超低概率获得机缘', () => {
  assert.equal(rollShengfaDungeonEncounter({ 天资等级: '万古无双' }, { random: () => 0 }).encountered, false);
  const player = { 天资等级: '无化如是' };
  assert.equal(rollShengfaDungeonEncounter(player, { random: () => 0 }).encountered, true);
  assert.equal(rollShengfaDungeonEncounter(player, { random: () => 0 }).encountered, false);
});

test('超维之光绝对先手并压制仙帝以下目标', () => {
  const holder = { 神慧: 1, 名号: '持有者' };
  const target = {
    mijinglevel_id: 20,
    xiangulevel_id: 20,
    灵根: { 攻击: 1, 防御: 1, 生命: 1 },
    攻击: 200,
    防御: 200,
    血量上限: 200,
    当前血量: 200,
  };
  const result = applySuperdimensionalOpening(holder, [target]);
  assert.equal(result.active, true);
  assert.equal(holder._超维绝对先手, true);
  assert.equal(target._帝兵失效, true);
  assert.equal(target.灵根.type, '无');
  assert.equal(target._功法压制概率, 0.5);
  assert.equal(getGongfaTriggerChance({ ...target, 学习的功法: ['测试功法'] }, { class: '功法', name: '测试功法', pr: 1 }, 1, () => 0.49), 0);

  const emperor = { mijinglevel_id: 21, xiangulevel_id: 0, 灵根: {}, 攻击: 1, 防御: 1, 血量上限: 1, 当前血量: 1 };
  applySuperdimensionalOpening(holder, [emperor]);
  assert.equal(emperor._帝兵失效, undefined);
  const xianguEmperor = { mijinglevel_id: 0, xiangulevel_id: 21, 灵根: {}, 攻击: 1, 防御: 1, 血量上限: 1, 当前血量: 1 };
  applySuperdimensionalOpening(holder, [xianguEmperor]);
  assert.equal(xianguEmperor._帝兵失效, undefined);
  const namedEmperor = { 名号: '无上仙帝', 灵根: {}, 攻击: 1, 防御: 1, 血量上限: 1, 当前血量: 1 };
  applySuperdimensionalOpening(holder, [namedEmperor]);
  assert.equal(namedEmperor._帝兵失效, undefined);
});

test('超维星界按寻宝公式每小时结算120倍与0.01点超维之力', () => {
  const player = { 神慧: 1, level_id: 2, Physique_id: 3, mijinglevel_id: 4, xiangulevel_id: 5, 修为: 0, 血气: 0 };
  const world = { world_name: '旧世界', attributes: { 特殊资源: [] } };
  ascendSuperdimensionalStarRealm(world, 1000);
  const reward = settleSuperdimensionalStarRealm(player, world, {
    now: 1000 + 2 * 60 * 60 * 1000,
    random: () => 0.5,
  });
  assert.equal(reward.hours, 2);
  assert.equal(reward.cultivation, Math.trunc(2000 + 10000 * 2 ** 2 * 4 * 5 * 2.5) * 120 * 2);
  assert.equal(reward.blood, Math.trunc(2000 + 10000 * 3 ** 2 * 4 * 5 * 2.5) * 120 * 2);
  assert.equal(player.超维之力, 0.02);
  assert.equal(world.world_name, '超维星界');
  assert.equal(world.悟道加成, 0.5);
});

test('超维造物仅允许稀有度8以下', () => {
  assert.equal(canCreateWithSuperdimensionalPower({ 稀有度: 7 }), true);
  assert.equal(canCreateWithSuperdimensionalPower({ 稀有度: 8 }), false);
});

test('超维改写支持为被提及的玩家改写且兼容前后两种顺序', () => {
  const before = {
    at: 'qg_123456',
    msg: '#超维改写天资 @123456 无化如是',
    message: [
      { type: 'text', text: '#超维改写天资 ' },
      { type: 'at', qq: '123456' },
      { type: 'text', text: ' 无化如是' },
    ],
  };
  const after = {
    msg: '#超维改写灵根 神慧者 @654321',
    message: [
      { type: 'text', text: '#超维改写灵根 神慧者 ' },
      { type: 'at', qq: '654321' },
    ],
  };
  assert.equal(getSuperdimensionalRewriteTarget(before, 'self'), '123456');
  assert.equal(getSuperdimensionalRewriteName(before, '天资'), '无化如是');
  assert.equal(getSuperdimensionalRewriteTarget(after, 'self'), '654321');
  assert.equal(getSuperdimensionalRewriteName(after, '灵根'), '神慧者');
});
