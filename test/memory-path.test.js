import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEMORY_FACTORS, MEMORY_HOUR_MS, MEMORY_STAGES, activateMemoryPath, createMemoryRoot,
  ensureMemoryState, getMemoryStage, getMemoryEffects, getMemoryLifeMaximum,
  getMemoryFactorTier, advanceMemoryPath, recordMemoryDungeon, simulateMemoryPath,
  runMemoryJourney, buildMemoryTitanTrial, applyMemoryTitanTrial, cultivateMemoryPath,
  refineMemoryPath, settleMemoryFragments, convertMemoryPrisms, spendMemoryFragments,
  canRefineMemoryTarget,
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

test('初始金血250本源、星神之资，完整五阶境界/因子/十二试炼流程不死锁', () => {
  const p = player();
  assert.equal(p.生命本源, 250);
  assert.equal(p.天资等级, '星神之资');
  assert.equal(activateMemoryPath(p).ok, false);
  draw(p, 3);
  assert.equal(p.生命本源, 550);
  p.模拟值 = 100;
  assert.equal(simulateMemoryPath(p).ok, false);
  assert.equal(p.模拟值, 100);
  p.mijinglevel_id = 9;
  assert.equal(advanceMemoryPath(p).ok, false);
  p.mijinglevel_id = 10;
  assert.equal(advanceMemoryPath(p).stage, 2);
  assert.equal(p.生命本源, 900);
  draw(p, 3);
  assert.equal(p.生命本源, 1200);
  p.mijinglevel_id = 12;
  assert.equal(advanceMemoryPath(p).ok, false);
  for (let i = 0; i < 12; i++) assert.equal(runMemoryJourney(p, { now: i * 6 * MEMORY_HOUR_MS, random: () => 0 }).progress, i + 1);
  assert.equal(Object.keys(p.记忆命途.因子).length, 6);
  assert.ok(Object.values(p.记忆命途.因子).every(tier => tier === 2));
  assert.equal(advanceMemoryPath(p).stage, 3);
  assert.equal(p.生命本源, 1200);
  draw(p, 3);
  assert.ok(Object.values(p.记忆命途.因子).every(tier => tier === 2));
  p.mijinglevel_id = 16;
  assert.equal(advanceMemoryPath(p).ok, false);
  for (let i = 0; i < 12; i++) {
    const battle = buildMemoryTitanTrial(p, { now: i * MEMORY_HOUR_MS });
    assert.equal(battle.ok, true);
    assert.equal(applyMemoryTitanTrial(p, true, { now: i * MEMORY_HOUR_MS, expectedIndex: i, random: () => 0 }).progress, i + 1);
  }
  assert.equal(p.生命本源, 3000);
  assert.ok(Object.values(p.记忆命途.因子).every(tier => tier === 3));
  const upgrade = advanceMemoryPath(p, { now: 0 });
  assert.equal(upgrade.stage, 4);
  assert.equal(upgrade.grantPoem, true);
  assert.equal(p.生命本源, 4200);
  draw(p, 3);
  assert.equal(p.生命本源, 4800);
  p.mijinglevel_id = 19;
  assert.equal(advanceMemoryPath(p).ok, false);
  p.mijinglevel_id = 20;
  assert.equal(advanceMemoryPath(p).stage, 5);
  assert.equal(p.生命本源, 7800);
  assert.equal(getMemoryLifeMaximum(p), 7800);
  assert.equal(advanceMemoryPath(p).ok, false);
});

test('成功秘境记录每次5%，满100且同结算ID不重复累积', () => {
  const p = player();
  assert.equal(recordMemoryDungeon(p, { token: 'single1' }).gain, 5);
  assert.equal(recordMemoryDungeon(p, { token: 'single1' }).gain, 0);
  assert.equal(recordMemoryDungeon(p, { token: 'batch', rounds: 18 }).gain, 90);
  assert.equal(p.模拟值, 95);
  assert.equal(simulateMemoryPath(p).ok, false);
  assert.equal(recordMemoryDungeon(p, { token: 'single2' }).gain, 5);
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

test('12因子三个级别的生活加成，金泰坦掉落不双加', () => {
  const p = player();
  p.灵根 = createMemoryRoot(5);
  for (const tier of [1, 2, 3]) {
    p.记忆命途.因子 = Object.fromEntries(MEMORY_FACTORS.map(name => [name, tier]));
    const effects = getMemoryEffects(p);
    assert.equal(effects.enlightenmentBonus, .56);
    assert.equal(effects.tribulationReduction, .86);
    assert.equal(effects.lootMultiplier, tier === 3 ? 15 : 11);
    assert.equal(effects.fishingMultiplier, tier + 1);
    assert.equal(effects.dungeonSpeed, [0, 2, 3, 5][tier]);
    assert.equal(effects.learnCostMultiplier, tier === 1 ? .5 : 0);
    assert.equal(effects.teachCooldownMultiplier, tier === 3 ? .5 : 1);
    assert.equal(effects.guaranteedDrops.length, tier);
  }
  p.灵根 = { name: '凡体' };
  assert.equal(getMemoryEffects(p).lootMultiplier, 1);
  assert.equal(getMemoryFactorTier(p, '浪漫'), 0);
});

test('天空炼化护持精确三/四/五权柄差，超出门槛才放行', () => {
  const p = player({ mijinglevel_id: 12 });
  for (const tier of [1, 2, 3]) {
    p.记忆命途.因子 = { 天空: tier };
    assert.equal(canRefineMemoryTarget({ mijinglevel_id: 12 + tier + 2 }, p), false);
    assert.equal(canRefineMemoryTarget({ mijinglevel_id: 12 + tier + 3 }, p), true);
  }
});

test('逐个因子蜕变泰坦不会降低已有掉落倍率，也不把两种倍率相加', () => {
  const p = player();
  p.灵根 = createMemoryRoot(4);
  p.记忆命途.因子 = Object.fromEntries(MEMORY_FACTORS.slice(0, 9).map(name => [name, 2]));
  let previous = getMemoryEffects(p).lootMultiplier;
  assert.equal(previous, 9);
  for (const name of MEMORY_FACTORS.slice(0, 9)) {
    p.记忆命途.因子[name] = 3;
    const current = getMemoryEffects(p).lootMultiplier;
    assert.ok(current >= previous);
    previous = current;
  }
  assert.equal(previous, 12);
});

test('诗篇从第四阶实际取得时计时，现实小时0.1，重启不重复发', () => {
  const p = player();
  assert.equal(settleMemoryFragments(p, { now: MEMORY_HOUR_MS }).hours, 0);
  p.灵根 = createMemoryRoot(4);
  Object.assign(p.记忆命途, { 已获诗篇: true, 碎片结算时间: 0 });
  assert.deepEqual(settleMemoryFragments(p, { now: 2.5 * MEMORY_HOUR_MS }), { hours: 2, fragments: .2 });
  assert.equal(p.记忆碎片, .2);
  assert.equal(settleMemoryFragments(p, { now: 2.5 * MEMORY_HOUR_MS }).hours, 0);
  const restored = structuredClone(p);
  restored.记忆命途.碎片结算时间 = String(restored.记忆命途.碎片结算时间);
  assert.equal(settleMemoryFragments(restored, { now: 3 * MEMORY_HOUR_MS }).fragments, .1);
  assert.equal(restored.记忆碎片, .3);
  assert.equal(settleMemoryFragments(restored, { now: 4 * MEMORY_HOUR_MS }).fragments, .1);
});

test('棱镜两种兑换10000换0.1/100换2，非法和不足不扣余额', () => {
  const p = player(); p.记忆棱镜 = 10200;
  assert.equal(convertMemoryPrisms(p, 10000, '碎片').gain, .1);
  assert.equal(convertMemoryPrisms(p, 100, '潜力').gain, 2);
  assert.equal(p.仙道潜力, 2);
  assert.equal(p.记忆碎片, .1);
  for (const amount of [0, -100, 1.5, 99, Infinity, 300]) assert.equal(convertMemoryPrisms(p, amount, '潜力').ok, false);
  assert.equal(p.记忆棱镜, 100);
  assert.equal(spendMemoryFragments(p, -1), false);
  assert.equal(spendMemoryFragments(p, .2), false);
  assert.equal(spendMemoryFragments(p, .1), true);
  assert.equal(p.记忆碎片, 0);
});

test('六相冰封只消费真实本源一次、随机100至300；每日觐见冷却24小时', () => {
  const p = player();
  assert.equal(refineMemoryPath(p, { targetId: 'a', random: () => 0 }).gain, 100);
  assert.equal(refineMemoryPath(p, { targetId: 'a' }).ok, false);
  assert.equal(refineMemoryPath(p, { targetId: 'b', kind: '灾厄', random: () => 1 }).gain, 300);
  p.学习的功法 = [];
  assert.equal(refineMemoryPath(p, { targetId: 'c' }).ok, false);
  assert.equal(cultivateMemoryPath(p, { now: 0, random: () => 0 }).gain, 2000);
  assert.equal(cultivateMemoryPath(p, { now: 24 * MEMORY_HOUR_MS - 1 }).ok, false);
  assert.equal(cultivateMemoryPath(p, { now: 24 * MEMORY_HOUR_MS, random: () => 1 }).gain, 5000);
  assert.equal(p.记忆棱镜, 7400);
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
