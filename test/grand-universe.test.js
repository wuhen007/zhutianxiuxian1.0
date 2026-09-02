import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  GRAND_UNIVERSE_LAW_STAGES,
  UNIVERSE_DUNGEON_AURA_COST,
  ascendSmallWorldToGrandUniverse,
  canGrandUniverseCarryMijingRealm,
  createItemUniverseDungeon,
  createReincarnationUniverseDungeon,
  editUniverseDungeon,
  enterGrandUniverse,
  enterUniverseDungeon,
  getGrandUniverseLawCap,
  getGrandUniverseLawStage,
  getReincarnationDungeonCost,
  improveGrandUniverseLaws,
  isGrandUniverseAbsoluteSpiritImmune,
  leaveGrandUniverse,
  refineItemIntoUniverseAura,
  setGrandUniverseOpen,
} from '../model/grandUniverse.js';

const appSource = fs.readFileSync(new URL('../apps/Garden/GrandUniverse.js', import.meta.url), 'utf8');
const xiuxianSource = fs.readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
const levelSource = fs.readFileSync(new URL('../apps/User/Level.js', import.meta.url), 'utf8');

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
  assert.equal(world.大宇宙.对外开放, true);
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
  const world = smallWorld({ player_qq: '10001' });
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

  const run = enterUniverseDungeon(player, world, '世界树境', {
    now: 3000, random: () => 0, universeId: '10001',
  });
  assert.equal(run.success, true);
  assert.equal(run.rewards.aura, 20);
  const visitorRun = enterUniverseDungeon(king(), world, '世界树境', {
    now: 3001, random: () => 0, universeId: '10001',
  });
  assert.equal(visitorRun.success, true);
  assert.equal(enterUniverseDungeon(player, world, '世界树境', {
    now: 3001, universeId: '10001',
  }).reason, 'cooldown');
});

test('升格后的大宇宙是可开关的玩家位面，访客可进入与离开', () => {
  const owner = king();
  const visitor = king();
  const world = smallWorld({ player_qq: '10001' });
  ascendSmallWorldToGrandUniverse(owner, world, 1000);

  const entered = enterGrandUniverse(visitor, world, {
    ownerId: '10001', visitorId: '20002', now: 2000,
  });
  assert.equal(entered.ok, true);
  assert.deepEqual(visitor.大宇宙位置, {
    界主: '10001', 宇宙名: '万象界', 进入时间: 2000,
  });
  assert.equal(world.大宇宙.访客记录[0].玩家, '20002');

  assert.equal(leaveGrandUniverse(visitor).ok, true);
  assert.equal(visitor.大宇宙位置, undefined);
  assert.equal(setGrandUniverseOpen(world, false).open, false);
  assert.equal(enterGrandUniverse(visitor, world, {
    ownerId: '10001', visitorId: '20002', now: 3000,
  }).reason, 'closed');
});

test('大宇宙应用接入位面列表、访客入口和访客秘境链路', () => {
  assert.match(appSource, /#大宇宙列表/);
  assert.match(appSource, /#开放大宇宙/);
  assert.match(appSource, /#关闭大宇宙/);
  assert.match(appSource, /#进入大宇宙/);
  assert.match(appSource, /#离开大宇宙/);
  assert.match(appSource, /mutateAccessibleUniverse/);
  assert.match(appSource, /enterUniverseDungeon\(player, world, name, \{ universeId: ownerId \}\)/);
  assert.match(xiuxianSource, /大宇宙位置\?\.宇宙名/);
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

// 将某座大宇宙的法则完善到指定等级
function raiseLawTo(world, targetLevel) {
  const ascender = king({ mijinglevel_id: 21, 修炼次数: 100_000 });
  let guard = 0;
  while (getGrandUniverseLawStage(world).level < targetLevel && guard++ < 20) {
    assert.equal(improveGrandUniverseLaws(ascender, world).ok, true);
  }
}

test('大宇宙按法则承载决定可否证道仙王/仙王巨头', () => {
  const base = smallWorld({ player_qq: '10001' });
  ascendSmallWorldToGrandUniverse(king(), base);

  // 无大宇宙的小世界不可作为承载判定对象
  assert.equal(canGrandUniverseCarryMijingRealm(smallWorld(), 18).reason, 'universe');
  // 宇宙初生（承载真仙）：仙王、仙王巨头均不可
  assert.equal(canGrandUniverseCarryMijingRealm(base, 18).reason, 'capacity');
  assert.equal(canGrandUniverseCarryMijingRealm(base, 19).reason, 'capacity');
  assert.equal(canGrandUniverseCarryMijingRealm(base, 18).required.capacity, '仙王');

  // 王境法域（承载仙王）：可证道仙王，但仍不可证道仙王巨头
  raiseLawTo(base, 2);
  assert.equal(canGrandUniverseCarryMijingRealm(base, 18).ok, true);
  assert.equal(canGrandUniverseCarryMijingRealm(base, 18).stage.capacity, '仙王');
  assert.equal(canGrandUniverseCarryMijingRealm(base, 19).reason, 'capacity');
  assert.equal(canGrandUniverseCarryMijingRealm(base, 19).required.capacity, '仙王巨头');

  // 巨头天宇（承载仙王巨头）：仙王与仙王巨头皆可证道
  raiseLawTo(base, 4);
  assert.equal(canGrandUniverseCarryMijingRealm(base, 18).ok, true);
  assert.equal(canGrandUniverseCarryMijingRealm(base, 19).ok, true);
  assert.equal(canGrandUniverseCarryMijingRealm(base, 19).stage.capacity, '仙王巨头');

  // 大宇宙最高只到帝光仙王：准仙帝不在承载表内，一律不可
  assert.equal(canGrandUniverseCarryMijingRealm(base, 20).reason, 'unsupported');
});

test('#证道 突破仙王/仙王巨头时认可承载足够的大宇宙（防回归）', () => {
  // 拦截不再只认仙域：仙域之外先查身处的大宇宙，承载足够即放行
  assert.match(levelSource, /import \{ canGrandUniverseCarryMijingRealm \} from '\.\.\/\.\.\/model\/grandUniverse\.js'/);
  assert.match(levelSource, /if \(player\.power_place !== 6\) \{[\s\S]*?canGrandUniverseCarryMijingRealm\(hostWorld, targetLevel\)/);
  assert.match(levelSource, /if \(carry\?\.ok\) \{\s*\/\/ 身处法则足以承载目标境界的大宇宙，允许在此证道/);
  // 承载不足时应提示完善至目标法则阶段，而不是直接要求回仙域
  assert.match(levelSource, /【诸天有缺·宇宙难载】[\s\S]*?完善至【\$\{carry\.required\.name\}】（可承载\$\{carry\.required\.capacity\}）/);
  // 非大宇宙且非仙域仍走原「需仙域完整法则承载」提示
  assert.match(levelSource, /【诸天有缺·仙路难行】[\s\S]*?需仙域完整法则承载/);
});
