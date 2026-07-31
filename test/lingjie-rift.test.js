import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  RIFT_ANCHOR_ITEM,
  RIFT_ATTEMPT_MAX,
  RIFT_ATTEMPT_MIN,
  RIFT_DURATION_MS,
  RIFT_EXPLORE_MS,
  RIFT_XIUWEI_PILLS,
  RIFT_XUEQI_PILLS,
  canStartRiftExplore,
  calculateRiftExploreDuration,
  createLevelThirtyNpc,
  createRift,
  createRiftMonster,
  getEffectiveRiftEndTime,
  getRiftBaseAttempts,
  isRiftMilestone,
  parseMortalCoordinate,
  pickAffordableForgeMaterial,
  resolveRiftRewardBonus,
  rollCorpseExtras,
  rollRiftAftermath,
} from '../model/lingjieRift.js';

function readJson(path) {
  return JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
}

test('灵界裂缝只在正数两千年刻度检查刷新', () => {
  assert.equal(isRiftMilestone(0), false);
  assert.equal(isRiftMilestone(1000), false);
  assert.equal(isRiftMilestone(2000), true);
  assert.equal(isRiftMilestone(10000), true);
});

test('裂缝随机坐标处于凡间地图内并持续六小时', () => {
  const values = [0, 0.999999, 0];
  let index = 0;
  const now = 1000;
  const rift = createRift({ epoch: 2, index: 3, years: 4000 }, () => values[index++], now);
  assert.deepEqual({ x: rift.x, y: rift.y }, { x: 0, y: 999 });
  assert.equal(rift.baseAttempts, RIFT_ATTEMPT_MIN);
  assert.equal(rift.expiresAt - rift.createdAt, RIFT_DURATION_MS);
});

test('裂缝基础探索次数在二至五次间随机且兼容旧裂缝', () => {
  const rift = createRift({}, () => 0.999999, 1000);
  assert.equal(rift.baseAttempts, RIFT_ATTEMPT_MAX);
  assert.equal(getRiftBaseAttempts(rift), RIFT_ATTEMPT_MAX);
  assert.equal(getRiftBaseAttempts({}), RIFT_ATTEMPT_MIN);
});

test('凡间坐标指令支持中英文逗号并拒绝越界', () => {
  assert.deepEqual(parseMortalCoordinate('#前往123,456'), { x: 123, y: 456 });
  assert.deepEqual(parseMortalCoordinate('#探索 9，88'), { x: 9, y: 88 });
  assert.equal(parseMortalCoordinate('#前往1000,1'), null);
  assert.equal(parseMortalCoordinate('#前往甲,乙'), null);
});

test('紫府元神、凡间位置、裂缝坐标和剩余时间共同控制准入', () => {
  const now = 1000;
  const rift = { x: 10, y: 20, expiresAt: now + RIFT_EXPLORE_MS };
  const player = { power_place: 0, yuanshenlevel_id: 0, 凡间坐标: { x: 10, y: 20 } };
  assert.equal(canStartRiftExplore(player, { ...rift, expiresAt: rift.expiresAt + 1 }, now).ok, true);
  assert.equal(canStartRiftExplore({ ...player, yuanshenlevel_id: undefined }, rift, now).reason, 'yuanshen');
  assert.equal(canStartRiftExplore({ ...player, power_place: 1 }, rift, now).reason, 'plane');
  assert.equal(canStartRiftExplore({ ...player, 凡间坐标: { x: 10, y: 21 } }, rift, now).reason, 'coordinate');
  assert.equal(canStartRiftExplore(player, { ...rift, expiresAt: rift.expiresAt - 1 }, now).reason, 'time');
  assert.equal(canStartRiftExplore(player, rift, now, RIFT_EXPLORE_MS - 1).ok, true);
});

test('裂缝探索继承行字秘、道法仙术和命格秘境加速', () => {
  const timing = calculateRiftExploreDuration({
    学习的功法: ['行字秘', '天璇步法'],
    mijinglevel_id: 16,
    daofaxianshu: 2,
  }, 60 * 1000);

  assert.equal(timing.durationMs, 8 * 60 * 1000);
  assert.equal(timing.reductionMs, 7 * 60 * 1000);
  assert.ok(timing.messages.some(message => message.includes('行字秘')));
  assert.ok(timing.messages.some(message => message.includes('道法仙术')));
  assert.ok(timing.messages.some(message => message.includes('命格')));
  assert.ok(!timing.messages.some(message => message.includes('天璇步法')));
});

test('秘境结算卡缩短玩家行动后会同步提前裂缝结算', () => {
  const task = { end_time: 1000, rift: { id: 'rift_1' } };
  assert.equal(getEffectiveRiftEndTime(task, {
    action: '探索灵界裂缝',
    riftId: 'rift_1',
    end_time: 500,
  }), 500);
  assert.equal(getEffectiveRiftEndTime(task, {
    action: '探索其他秘境',
    riftId: 'rift_1',
    end_time: 500,
  }), 1000);
});

test('裂缝怪物全属性处于数百万区间', () => {
  const monster = createRiftMonster(() => 0.5);
  assert.ok(monster.攻击 >= 2000000 && monster.攻击 <= 6500000);
  assert.ok(monster.防御 >= 2000000 && monster.防御 <= 6500000);
  assert.ok(monster.血量上限 >= 2000000 && monster.血量上限 <= 6500000);
});

test('伏杀者属性严格采用练气30加炼体30再加150万', () => {
  const level = { 基础攻击: 520000, 基础防御: 520000, 基础血量: 1040000, 基础暴击: 0.16 };
  const physique = { 基础攻击: 52000, 基础防御: 560000, 基础血量: 1040000, 基础暴击: 0.16 };
  const npc = createLevelThirtyNpc(level, physique, '测试伏杀者');
  assert.equal(npc.攻击, 2072000);
  assert.equal(npc.防御, 2580000);
  assert.equal(npc.血量上限, 3580000);
  assert.equal(npc.level_id, 30);
  assert.equal(npc.Physique_id, 30);
  assert.equal(npc.灵根.type, '天灵根');
});

test('战后事件按单人偷袭、三人埋伏、尸体和无事分流', () => {
  assert.equal(rollRiftAftermath(() => 0.1), 'single_ambush');
  assert.equal(rollRiftAftermath(() => 0.2), 'triple_ambush');
  assert.equal(rollRiftAftermath(() => 0.3), 'corpse');
  assert.equal(rollRiftAftermath(() => 0.8), 'none');
});

test('尸体稀有掉落与低价锻造材料筛选可控', () => {
  const extras = rollCorpseExtras(() => 0);
  assert.deepEqual(extras, { luckyGrass: true, rootWater: true, fateReroll: true, fateSlot: true });
  const selected = pickAffordableForgeMaterial([
    { name: '昂贵材料', class: '材料', 出售价: 10001 },
    { name: '普通材料', class: '材料', 出售价: 10000 },
  ], () => 0);
  assert.equal(selected.name, '普通材料');
});

test('裂缝奖励继承灵根、幸运、天地气运和剑云海庇护倍率', () => {
  const player = {
    灵根: { type: '魔卡少女·觉醒' },
    幸运: 1,
    addluckyNo: 0.2,
    islucky: 1,
    天地气运: 1,
    剑云海庇护: { 副本奖励: 1 },
  };
  const rolls = [0, 0];
  const bonus = resolveRiftRewardBonus(player, () => rolls.shift());

  assert.equal(bonus.multiplier, 40);
  assert.equal(bonus.stateChanged, true);
  assert.equal(player.剑云海庇护.副本奖励, 0);
  assert.equal(player.islucky, 0);
  assert.equal(player.addluckyNo, 0);
  assert.equal(player.幸运, 0.8);
  assert.ok(bonus.messages.some(message => message.includes('福源丹在本次探索后失效')));
});

test('神慧者获得十倍裂缝物品且普通玩家保持原数量', () => {
  assert.equal(resolveRiftRewardBonus({ 灵根: { type: '神慧者' } }, () => 1).multiplier, 10);
  assert.equal(resolveRiftRewardBonus({}, () => 1).multiplier, 1);
});

test('新增丹药、命格道具和元神功法均存在于主数据表', () => {
  const pills = readJson('../resources/data/item/丹药列表.json');
  const props = readJson('../resources/data/item/道具列表.json');
  const skills = readJson('../resources/data/item/功法列表.json');
  const byName = new Map(pills.map(item => [item.name, item]));

  for (const name of RIFT_XIUWEI_PILLS) {
    assert.ok(byName.get(name).exp >= 300000 && byName.get(name).exp <= 1590000);
  }
  for (const name of RIFT_XUEQI_PILLS) {
    assert.ok(byName.get(name).xueqi >= 300000 && byName.get(name).xueqi <= 1590000);
  }
  assert.ok(pills.some(item => item.type === '仙道潜力' && item.potential > 0));
  assert.ok(props.some(item => item.name === '轮回命签'));
  assert.ok(props.some(item => item.name === '命宫拓碑'));
  assert.ok(props.some(item => item.name === RIFT_ANCHOR_ITEM && item.type === '裂缝锚定'));
  assert.ok(skills.some(item => item.name === '太虚蕴神经'));
});
