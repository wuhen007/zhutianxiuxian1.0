import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GRAND_UNIVERSE_LAW_STAGES,
  UNIVERSE_DUNGEON_AURA_COST,
  ascendSmallWorldToGrandUniverse,
  createItemUniverseDungeon,
  createReincarnationUniverseDungeon,
  editUniverseDungeon,
  enterUniverseDungeon,
  getGrandUniverseLawCap,
  getGrandUniverseLawStage,
  getReincarnationDungeonCost,
  improveGrandUniverseLaws,
  isGrandUniverseAbsoluteSpiritImmune,
  refineItemIntoUniverseAura,
} from '../model/grandUniverse.js';

function king(overrides = {}) {
  return {
    mijinglevel_id: 18,
    已创自身之道: true,
    自身之道名称: '万象道',
    修炼次数: 220,
    仙道潜力: 1_000_000,
    修为: 1_000_000_000_000_000,
    血气: 1_000_000_000_000_000,
    源石: 1_000_000_000,
    当前血量: 1_000_000,
    ...overrides,
  };
}

function smallWorld(overrides = {}) {
  return {
    level: 5,
    world_name: '万象界',
    attributes: { 面积: '十万里疆域', 特殊资源: [] },
    药田: [],
    栖息地: [],
    ...overrides,
  };
}

test('仙王以自身之道将圆满小世界升格为绝灵免疫的大宇宙', () => {
  const player = king();
  const world = smallWorld();
  const result = ascendSmallWorldToGrandUniverse(player, world, 1000);
  assert.equal(result.ok, true);
  assert.equal(world.大宇宙.创世之道, '万象道');
  assert.equal(world.大宇宙.承载上限, '真仙');
  assert.equal(world.attributes.面积, '无垠星海');
  assert.equal(world.attributes.特殊资源.includes('宇宙本源'), true);
  assert.equal(isGrandUniverseAbsoluteSpiritImmune(world), true);
  assert.deepEqual(world.药田, []);
  assert.deepEqual(world.栖息地, []);
});

test('升格要求圆满小世界、仙王权柄和已开创的自身之道', () => {
  assert.equal(ascendSmallWorldToGrandUniverse(king({ mijinglevel_id: 17 }), smallWorld()).reason, 'authority');
  assert.equal(ascendSmallWorldToGrandUniverse(king({ 已创自身之道: false }), smallWorld()).reason, 'own-way');
  assert.equal(ascendSmallWorldToGrandUniverse(king(), smallWorld({ level: 4 })).reason, 'world-level');
  assert.equal(ascendSmallWorldToGrandUniverse(king({ 修炼次数: 150 }), smallWorld()).reason, 'dao');
});

test('普通仙王法则封顶红尘仙，仙王巨头可完善到帝光仙王', () => {
  const ordinary = king();
  const ordinaryWorld = smallWorld();
  ascendSmallWorldToGrandUniverse(ordinary, ordinaryWorld);
  assert.equal(getGrandUniverseLawCap(ordinary), 1);
  assert.equal(improveGrandUniverseLaws(ordinary, ordinaryWorld).stage.capacity, '红尘仙');
  assert.equal(improveGrandUniverseLaws(ordinary, ordinaryWorld).reason, 'cap');

  const giant = king({ mijinglevel_id: 19 });
  const giantWorld = smallWorld();
  ascendSmallWorldToGrandUniverse(giant, giantWorld);
  while (getGrandUniverseLawStage(giantWorld).level < GRAND_UNIVERSE_LAW_STAGES.length - 1) {
    assert.equal(improveGrandUniverseLaws(giant, giantWorld).ok, true);
  }
  assert.equal(getGrandUniverseLawCap(giant), 5);
  assert.equal(getGrandUniverseLawStage(giantWorld).capacity, '帝光仙王');
  assert.equal(giantWorld.大宇宙.法则完善次数, 5);
});

test('已有物品可炼成灵韵并与另一件物品共同铸造自定义秘境', () => {
  const player = king();
  const world = smallWorld();
  const najie = {
    材料: [{ name: '世界树心', 数量: 4, pinji: 4, 出售价: 1_000_000_000 }],
  };
  ascendSmallWorldToGrandUniverse(player, world);
  const refined = refineItemIntoUniverseAura(world, najie, {
    category: '材料', itemName: '世界树心', amount: 2,
  });
  assert.equal(refined.ok, true);
  assert.ok(refined.aura > UNIVERSE_DUNGEON_AURA_COST);
  assert.equal(najie.材料[0].数量, 2);

  const created = createItemUniverseDungeon(world, najie, {
    name: '世界树境', category: '材料', itemName: '世界树心', now: 2000,
  });
  assert.equal(created.ok, true);
  assert.equal(najie.材料[0].数量, 1);
  assert.equal(created.dungeon.source.mode, 'item');
  assert.equal(editUniverseDungeon(world, '世界树境', '敌人', '太古树祖').ok, true);
  assert.equal(created.dungeon.enemyName, '太古树祖');

  const run = enterUniverseDungeon(player, world, '世界树境', { now: 3000, random: () => 0 });
  assert.equal(run.success, true);
  assert.equal(run.rewards.aura, 20);
  assert.equal(enterUniverseDungeon(player, world, '世界树境', { now: 3001 }).reason, 'cooldown');
});

test('准仙帝付出完整代价演绎轮回秘境，仙帝获得权能减免', () => {
  const quasi = king({ mijinglevel_id: 20 });
  const world = smallWorld();
  ascendSmallWorldToGrandUniverse(quasi, world);
  world.大宇宙.灵韵 = 5000;
  const quasiCost = getReincarnationDungeonCost(quasi);
  assert.equal(quasiCost.multiplier, 1);
  const result = createReincarnationUniverseDungeon(quasi, world, { name: '万灵轮回' });
  assert.equal(result.ok, true);
  assert.equal(result.dungeon.source.mode, 'reincarnation');
  assert.equal(quasi.修为, 1_000_000_000_000_000 - quasiCost.cultivation);

  const emperorCost = getReincarnationDungeonCost(king({ mijinglevel_id: 21 }));
  assert.equal(emperorCost.multiplier, 0.35);
  assert.ok(emperorCost.cultivation < quasiCost.cultivation);
  assert.ok(emperorCost.aura < quasiCost.aura);
});
