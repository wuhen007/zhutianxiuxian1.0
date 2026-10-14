import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEMORY_FACTORS, MEMORY_HOUR_MS, MEMORY_STAGES, activateMemoryPath, createMemoryRoot,
  ensureMemoryState, getMemoryStage, getMemoryEffects, getMemoryLifeMaximum,
  getMemoryFactorTier, advanceMemoryPath, recordMemoryDungeon, simulateMemoryPath,
  runMemoryJourney, buildMemoryTitanTrial, applyMemoryTitanTrial, cultivateMemoryPath,
  refineMemoryPath, settleMemoryFragments, convertMemoryPrisms, spendMemoryFragments,
  canRefineMemoryTarget, normalizeMemoryPlayer, getMemoryDungeonCost,
} from '../model/memoryPath.js';
import { createCrossRaidAvatar, hydrateCrossRaidAvatar } from '../apps/worldChat/raid.js';

function player(extra = {}) {
  const p = { id: 'fixture-memory', 名号: '记忆修士', 学习的功法: ['六相冰封'], 攻击: 100, 防御: 50, 血量上限: 1000, 当前血量: 1000, ...extra };
  assert.equal(activateMemoryPath(p, { now: 0 }).ok, true);
  return p;
}

function draw(p, n, random = () => 0) {
  for (let i = 0; i < n; i++) {
    p.模拟值 = 100;
    assert.equal(simulateMemoryPath(p, { random }).ok, true);
  }
}

test('四阶保留普通天资，黄金+10与泰坦+20本源，最终止于无漏净子', () => {
  const p = player({ 天资等级: '万古无双' });
  assert.equal(p.生命本源, 50);
  assert.equal(p.天资等级, '万古无双');
  assert.equal(activateMemoryPath(p).ok, false);
  draw(p, 3);
  assert.equal(p.生命本源, 80);
  p.模拟值 = 100;
  assert.equal(simulateMemoryPath(p).ok, false);
  assert.equal(p.模拟值, 100);
  p.mijinglevel_id = 9;
  assert.equal(advanceMemoryPath(p).ok, false);
  p.mijinglevel_id = 10;
  assert.equal(advanceMemoryPath(p).stage, 2);
  assert.equal(p.生命本源, 180);
  draw(p, 3);
  assert.equal(p.生命本源, 210);
  p.mijinglevel_id = 12;
  assert.equal(advanceMemoryPath(p).ok, false);
  for (let i = 0; i < 12; i++) assert.equal(runMemoryJourney(p, { now: i * 6 * MEMORY_HOUR_MS, random: () => 0 }).progress, i + 1);
  assert.equal(Object.keys(p.记忆命途.因子).length, 6);
  assert.ok(Object.values(p.记忆命途.因子).every(tier => tier === 2));
  assert.equal(advanceMemoryPath(p).stage, 3);
  assert.equal(p.生命本源, 300);
  draw(p, 3);
  assert.ok(Object.values(p.记忆命途.因子).every(tier => tier === 2));
  p.mijinglevel_id = 16;
  assert.equal(advanceMemoryPath(p).ok, false);
  for (let i = 0; i < 12; i++) {
    const battle = buildMemoryTitanTrial(p, { now: i * MEMORY_HOUR_MS });
    assert.equal(battle.ok, true);
    assert.equal(applyMemoryTitanTrial(p, true, { now: i * MEMORY_HOUR_MS, expectedIndex: i, random: () => 0 }).progress, i + 1);
  }
  assert.equal(p.生命本源, 480);
  assert.ok(Object.values(p.记忆命途.因子).every(tier => tier === 3));
  const upgrade = advanceMemoryPath(p, { now: 0 });
  assert.equal(upgrade.stage, 4);
  assert.equal(upgrade.grantPoem, false);
  assert.equal(p.生命本源, 680);
  draw(p, 3);
  assert.equal(p.生命本源, 740);
  p.mijinglevel_id = 20;
  assert.equal(MEMORY_STAGES.length, 4);
  assert.throws(() => createMemoryRoot(5), RangeError);
  assert.equal(getMemoryLifeMaximum(p), 740);
  assert.equal(advanceMemoryPath(p).ok, false);
});

test('非逃离秘境每次2%，50次满值，同结算ID与逃离均不重复累积', () => {
  const p = player();
  assert.equal(recordMemoryDungeon(p, { token: 'escaped', escaped: true }).gain, 0);
  assert.equal(p.记忆命途.秘境记录.includes('escaped'), false);
  assert.equal(recordMemoryDungeon(p, { token: 'single1' }).gain, 2);
  assert.equal(recordMemoryDungeon(p, { token: 'single1' }).gain, 0);
  assert.equal(recordMemoryDungeon(p, { token: 'batch', rounds: 48 }).gain, 96);
  assert.equal(p.模拟值, 98);
  assert.equal(simulateMemoryPath(p).ok, false);
  assert.equal(recordMemoryDungeon(p, { token: 'single2' }).gain, 2);
  assert.equal(recordMemoryDungeon(p, { token: 'overflow' }).gain, 0);
  assert.equal(simulateMemoryPath(p, { random: () => 0 }).factor, '门径');
  assert.equal(p.模拟值, 0);
  assert.equal(recordMemoryDungeon({ 灵根: { name: '凡体' } }, { token: 'single' }).gain, 0);
});

test('模拟不重复因子，浪漫逐级给予正确的三件套', () => {
  const p = player();
  p.模拟值 = 100;
  const result = simulateMemoryPath(p, { random: () => .1 });
  assert.equal(result.factor, '浪漫');
  assert.deepEqual(result.equipment, ['逐火之刃', '逐火之甲', '逐火圣杖']);
  p.灵根 = createMemoryRoot(2);
  assert.deepEqual(runMemoryJourney(p, { now: 0 }).equipment, ['泰坦之刃', '泰坦胸甲', '泰坦权杖']);
  p.灵根 = createMemoryRoot(3);
  assert.deepEqual(applyMemoryTitanTrial(p, true, { now: 0 }).equipment, ['星神长弓', '星神圣衣', '星神权杖']);
});

test('逐火6小时、泰坦1小时边界，失败与旧战报不推进', () => {
  const p = player();
  p.灵根 = createMemoryRoot(2);
  p.记忆命途.因子 = { 门径: 1 };
  assert.equal(runMemoryJourney(p, { now: 0 }).ok, true);
  assert.equal(runMemoryJourney(p, { now: 6 * MEMORY_HOUR_MS - 1 }).ok, false);
  assert.equal(runMemoryJourney(p, { now: 6 * MEMORY_HOUR_MS }).ok, true);
  p.灵根 = createMemoryRoot(3);
  assert.equal(applyMemoryTitanTrial(p, false, { now: 0 }).progress, 0);
  assert.equal(buildMemoryTitanTrial(p, { now: MEMORY_HOUR_MS - 1 }).ok, false);
  assert.equal(applyMemoryTitanTrial(p, true, { now: MEMORY_HOUR_MS, expectedIndex: 1 }).ok, false);
  assert.equal(applyMemoryTitanTrial(p, true, { now: MEMORY_HOUR_MS, expectedIndex: 0 }).progress, 1);
});

test('12因子保留额外悟道减伤，黄金按件数、泰坦按倍率分别结算', () => {
  const p = player();
  p.灵根 = createMemoryRoot(4);
  for (const tier of [1, 2, 3]) {
    p.记忆命途.因子 = Object.fromEntries(MEMORY_FACTORS.map(name => [name, tier]));
    const effects = getMemoryEffects(p);
    assert.equal(effects.enlightenmentBonus, .36);
    assert.ok(Math.abs(effects.tribulationReduction - .66) < 1e-12);
    assert.equal(effects.lootMultiplier, tier === 3 ? 14 : 2);
    assert.equal(effects.lootBonus, 2);
    assert.equal(effects.fishingMultiplier, tier + 1);
    assert.equal(effects.dungeonSpeed, 1);
    assert.equal(effects.dungeonTimeMultiplier, 1);
    assert.equal(effects.dungeonCostReduction, [0, .2, .3, .4][tier]);
    assert.equal(effects.learnCostMultiplier, tier === 1 ? .5 : 0);
    assert.equal(effects.teachCooldownMultiplier, tier === 3 ? .5 : 1);
    assert.equal(effects.guaranteedDrops.length, tier);
  }
  p.灵根 = { name: '凡体' };
  assert.equal(getMemoryEffects(p).lootMultiplier, 1);
  assert.equal(getMemoryFactorTier(p, '浪漫'), 0);
});

test('门径三阶仅折算入场成本，整数向上取整，无因子保留原价', () => {
  const p = player();
  for (const [tier, cost] of [[0, 101], [1, 81], [2, 71], [3, 61]]) {
    p.记忆命途.因子 = { 门径: tier };
    assert.equal(getMemoryDungeonCost(p, 101), cost);
    assert.equal(getMemoryDungeonCost(p, 1), 1);
    assert.equal(getMemoryDungeonCost(p, 0), 0);
    assert.equal(getMemoryDungeonCost(p, -100), -100);
  }
  assert.equal(getMemoryDungeonCost({ 灵根: { name: '凡体' }, 记忆命途: { 因子: { 门径: 3 } } }, 100), 100);
  p.记忆命途.因子 = { 门径: 2 };
  assert.equal(getMemoryDungeonCost(p, 100), 70);
});

test('天空炼化护持精确三/四/五权柄差，超出门槛才放行', () => {
  const p = player({ mijinglevel_id: 12 });
  for (const tier of [1, 2, 3]) {
    p.记忆命途.因子 = { 天空: tier };
    assert.equal(canRefineMemoryTarget({ mijinglevel_id: 12 + tier + 2 }, p), false);
    assert.equal(canRefineMemoryTarget({ mijinglevel_id: 12 + tier + 3 }, p), true);
  }
});

test('因子强化保留黄金额外件数，每三泰坦按原规则增加倍率', () => {
  const p = player();
  p.灵根 = createMemoryRoot(4);
  p.记忆命途.因子 = Object.fromEntries(MEMORY_FACTORS.slice(0, 9).map(name => [name, 2]));
  let previous = getMemoryEffects(p).lootMultiplier;
  assert.equal(previous, 2);
  for (const name of MEMORY_FACTORS.slice(0, 9)) {
    p.记忆命途.因子[name] = 3;
    const current = getMemoryEffects(p).lootMultiplier;
    assert.equal(getMemoryEffects(p).lootBonus, 1);
    assert.ok(current >= previous);
    previous = current;
  }
  assert.equal(previous, 11);
});

test('停用诗篇、炼化、觐见和兑换后，旧余额不增不减也不消耗凭证', () => {
  const p = player({ 记忆棱镜: 10200, 记忆碎片: 20, 仙道潜力: 8 });
  p.灵根 = createMemoryRoot(4);
  Object.assign(p.记忆命途, { 已获诗篇: true, 碎片结算时间: 0 });
  const before = structuredClone(p);
  assert.deepEqual(settleMemoryFragments(p, { now: 1000 * MEMORY_HOUR_MS }), { hours: 0, fragments: 0 });
  assert.equal(convertMemoryPrisms(p, 10000, '碎片').ok, false);
  assert.equal(convertMemoryPrisms(p, 100, '潜力').ok, false);
  assert.equal(spendMemoryFragments(p, 10), false);
  assert.equal(refineMemoryPath(p, { targetId: 'real-proof', kind: '灾厄' }).ok, false);
  assert.equal(cultivateMemoryPath(p, { now: 1000 * MEMORY_HOUR_MS }).ok, false);
  assert.deepEqual(p, before);
});

test('旧星神根与镜中本源转为无漏净子，超额本源下修且余额因子保留', () => {
  const oldRoot = { id: 7092005, name: '星神·记忆', type: '记忆命途', 攻击: 5000, 防御: 5000, 生命: 5000, eff: 30000, 法球倍率: 1000 };
  const p = { 灵根: oldRoot, 生命本源: 7800, 天资等级: '星神之资',
    记忆命途: { 因子: Object.fromEntries(MEMORY_FACTORS.map(name => [name, 3])) },
    诸天镜系统: { 本源灵根: structuredClone(oldRoot) }, 记忆棱镜: 999, 记忆碎片: 10 };
  assert.equal(normalizeMemoryPlayer(p), true);
  assert.equal(getMemoryStage(p), 4);
  assert.deepEqual(p.灵根, createMemoryRoot(4));
  assert.deepEqual(p.诸天镜系统.本源灵根, createMemoryRoot(4));
  assert.equal(p.生命本源, 740);
  assert.equal(p.天资等级, '平庸之资');
  assert.equal(Object.keys(p.记忆命途.因子).length, 12);
  assert.equal(p.记忆棱镜, 999);
  assert.equal(p.记忆碎片, 10);
  const settled = structuredClone(p);
  assert.equal(normalizeMemoryPlayer(p), false);
  assert.deepEqual(p, settled);
  p.生命本源 = 1;
  normalizeMemoryPlayer(p);
  assert.equal(p.生命本源, 1);
});

test('跨服战斗只携带因子，不输出棱镜余额、碎片或炼化身份记录', () => {
  const p = player();
  p.记忆命途.因子 = { 死亡: 3, 纷争: 2 };
  p.记忆命途.炼化记录 = ['private-player-id'];
  p.记忆棱镜 = 999;
  const snapshot = createCrossRaidAvatar(p);
  assert.deepEqual(snapshot.记忆命途, { 因子: { 纷争: 2, 死亡: 3 } });
  assert.equal(snapshot.记忆棱镜, undefined);
  assert.equal(JSON.stringify(snapshot).includes('private-player-id'), false);
  assert.equal(getMemoryFactorTier(hydrateCrossRaidAvatar(snapshot), '死亡'), 3);
});
