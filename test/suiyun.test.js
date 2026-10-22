import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  SUIYUN_STAGES, SUIYUN_HOUR_MS, SUIYUN_DAY_MS, activateSuiyun, advanceSuiyun,
  getSuiyunStage, getSuiyunEffects, ensureSuiyunState, createSuiyunRoot,
  advanceSuiyunToRealm, cultivateSuiyun, refineSuiyun,
  spendMoonlight, getSuiyunPower, spendSuiyunPower,
  ascendSuiyunPalace, settleSuiyunPalace, getSuiyunLifeMaximum,
} from '../model/suiyun.js';
import { getLifeSourceRepairMaximum } from '../model/lifeSourceRepair.js';
import { claimSuiyunUnique, readSuiyunUnique, releaseSuiyunUnique, rollAndGrantSuiyunRemnant } from '../model/suiyunRegistry.js';

function player() {
  const value = { id: 'test-suiyun', 灵根: { name: '凡体' }, 学习的功法: ['月华炼天功'], 攻击: 100, 防御: 100, 血量上限: 1000, 当前血量: 1000 };
  assert.equal(activateSuiyun(value, { now: 0 }).ok, true);
  return value;
}

test('觉醒无境界要求，本源按总量200设置，顶级天资名称为岁云', () => {
  const p = player();
  assert.equal(getSuiyunStage(p), 1);
  assert.equal(p.生命本源, 200);
  assert.equal(p.天资等级, '岁云');
  assert.equal(p.linggenshow, 0);
  assert.equal(getLifeSourceRepairMaximum(p, 500), 200);
  assert.equal(activateSuiyun(p).ok, false);
  assert.equal(getSuiyunEffects({ 灵根: { name: '凡体' }, 岁云: p.岁云 }).lootMultiplier, 1);
});

test('无试炼境界达标自动连升，三体系门槛一致，跌境不回退且不重复补本源', () => {
  for (const [route, boundaries] of [
    ['mijinglevel_id', [10, 12, 16, 20]],
    ['xiangulevel_id', [8, 11, 15, 21]],
    ['huafenlevel_id', [8, 11, 15, 21]],
  ]) {
    const p = player();
    for (const [index, realm] of boundaries.entries()) {
      p[route] = realm - 1;
      assert.equal(advanceSuiyunToRealm(p), false);
      p[route] = realm;
      assert.equal(advanceSuiyunToRealm(p, { now: 1000 + index }), true);
      assert.equal(getSuiyunStage(p), index + 2);
      assert.equal(p.法球倍率, SUIYUN_STAGES[index + 1].orb);
      assert.equal(p.生命本源, SUIYUN_STAGES[index + 1].life);
      assert.equal(p.岁云.自动晋升待结算, true);
    }
    p[route] = 1;
    p.生命本源 = 123;
    assert.equal(advanceSuiyunToRealm(p), false);
    assert.equal(p.生命本源, 123);
    assert.equal(getSuiyunStage(p), 5);
  }
  const p = player();
  p.mijinglevel_id = 20;
  p.岁云.累计炼化月华 = 1234;
  assert.equal(advanceSuiyunToRealm(p, { now: 123 }), true);
  assert.equal(getSuiyunStage(p), 5);
  assert.equal(p.岁云.累计炼化月华, 1234);
  assert.equal(p.岁云.岁云之力启用时间, 123);
  assert.deepEqual(p.已领悟法则, ['岁云法则']);
  const avatar = { ...player(), mijinglevel_id: 20, 诸天镜系统: { 当前化身: '门矢士' } };
  assert.equal(advanceSuiyunToRealm(avatar), false);
  assert.equal(getSuiyunStage(avatar), 1);
});

test('逐阶境界门槛、本源上限、法则及最终奖励只触发一次', () => {
  const p = player();
  Object.assign(p.岁云, { 引月入体: 12, 化霜入剑: 12, 月之见证: 9 });
  for (let stage = 2; stage <= 5; stage++) {
    const spec = SUIYUN_STAGES[stage - 1];
    p.mijinglevel_id = spec.realm - 1;
    assert.equal(advanceSuiyun(p).ok, false);
    p.mijinglevel_id++;
    const result = advanceSuiyun(p);
    assert.equal(result.ok, true);
    assert.equal(result.grantEquipment, stage === 5);
    assert.equal(p.生命本源, spec.life);
    assert.equal(getSuiyunStage(p), stage);
    assert.equal(getLifeSourceRepairMaximum(p), spec.life);
  }
  assert.equal(p.岁云法则, true);
  assert.equal(p.灵根.eff, 30000);
  assert.equal(p.灵根.攻击, 5000);
  assert.equal(p.灵根.法球倍率, 1000);
  assert.equal(advanceSuiyun(p).ok, false);
});

test('五阶被动精确对应需求，无关灵根没有被动', () => {
  for (let i = 0; i < 5; i++) {
    const effects = getSuiyunEffects({ 灵根: createSuiyunRoot(i + 1) });
    assert.equal(effects.enlightenmentBonus, [.2, .2, .2, .45, .45][i]);
    assert.equal(effects.tribulationReduction, [.2, .3, .5, .75, .85][i]);
    assert.equal(effects.lootMultiplier, [1, 5, 10, 10, 10][i]);
    assert.equal(effects.madoka, i === 4);
    assert.equal(effects.noDemonicValue, true);
  }
  assert.equal(getSuiyunEffects({}).noDemonicValue, false);
});

test('云月修炼24小时边界与闭区间2000到5000', () => {
  const p = player();
  assert.equal(cultivateSuiyun(p, { now: 0, random: () => 0 }).gain, 2000);
  assert.equal(cultivateSuiyun(p, { now: SUIYUN_DAY_MS - 1 }).ok, false);
  assert.equal(cultivateSuiyun(p, { now: SUIYUN_DAY_MS, random: () => 1 }).gain, 5000);
  assert.equal(p.月华值, 7000);
});

test('炼化须学功法、真实目标ID防重复，奖励100到300，本源封顶', () => {
  const p = player();
  p.学习的功法 = [];
  assert.equal(refineSuiyun(p, { targetId: '1' }).ok, false);
  p.学习的功法 = ['月华炼天功'];
  assert.equal(refineSuiyun(p, {}).ok, false);
  assert.equal(refineSuiyun(p, { targetId: '1', random: () => 0 }).gain, 100);
  assert.equal(refineSuiyun(p, { targetId: '1' }).ok, false);
  assert.equal(refineSuiyun(p, { targetId: '2', kind: '灾厄', sourceLifeEssence: 90000, random: () => 1 }).gain, 300);
  assert.equal(p.生命本源, 600);
  assert.equal(getSuiyunLifeMaximum(p), 600);
  assert.equal(getLifeSourceRepairMaximum(p), 600);
  assert.equal(refineSuiyun(p, { targetId: '3', kind: '玩家', sourceLifeEssence: 90000 }).lifeGain, 0);
  p.灵根 = createSuiyunRoot(4);
  p.岁云.炼化本源 = 0;
  p.生命本源 = 5400;
  refineSuiyun(p, { targetId: '4', sourceLifeEssence: 1000000 });
  assert.equal(p.生命本源, 15000);
});

test('灾厄与魔主潜力按炼化前本源上限5%发放，五阶封顶和受伤均保留收益且不乘权重', () => {
  for (const [index, spec] of SUIYUN_STAGES.entries()) {
    for (const capped of [false, true]) {
      for (const weight of [.1, .5]) {
        const p = player();
        p.灵根 = createSuiyunRoot(index + 1);
        p.岁云.炼化本源 = capped ? spec.cap - spec.life : 0;
        const maximum = getSuiyunLifeMaximum(p);
        p.生命本源 = maximum / 2;
        p.仙道潜力 = 7.125;
        p.魔道值 = 9;
        const result = refineSuiyun(p, { targetId: 'potential', kind: '灾厄', sourceLifeEssence: 100, weight });
        assert.equal(result.resourceGains.potential, maximum * .05, `${spec.name}/${capped}/${weight}`);
        assert.equal(p.仙道潜力, 7.125 + maximum * .05);
        assert.equal(p.魔道值, 9);
        assert.equal(refineSuiyun(p, { targetId: 'potential', kind: '灾厄' }).ok, false);
        assert.equal(p.仙道潜力, 7.125 + maximum * .05);
      }
    }
  }
  const growing = player();
  growing.岁云.炼化本源 = 350;
  growing.生命本源 = 550;
  const result = refineSuiyun(growing, { targetId: 'before-growth', kind: '灾厄', sourceLifeEssence: 100000 });
  assert.equal(growing.生命本源, 600);
  assert.equal(result.resourceGains.potential, 27.5, '本次增长前上限550，不取本次增长后的600');
  const ordinary = player();
  ordinary.仙道潜力 = 1;
  refineSuiyun(ordinary, { targetId: 'tianjiao', kind: '天骄' });
  refineSuiyun(ordinary, { targetId: 'player', kind: '玩家' });
  cultivateSuiyun(ordinary, { now: 0 });
  assert.equal(ordinary.仙道潜力, 1, '新增百分比潜力仅适用于灾厄与魔主');
});

test('月华不再兑换潜力，只按救赎扣减并保留透支保护，岁云之力独立保留', () => {
  const p = player();
  p.月华值 = 300;
  p.岁云之力 = .3;
  for (const bad of [0, -100, Infinity, NaN, 'x', undefined]) assert.equal(spendMoonlight(p, bad), false);
  assert.equal(p.月华值, 300);
  assert.equal(spendMoonlight(p, 301), false);
  assert.equal(p.月华值, 300);
  for (let i = 0; i < 3; i++) assert.equal(spendMoonlight(p, 100), true);
  assert.equal(p.月华值, 0);
  assert.equal(p.仙道潜力, undefined);
  assert.equal(getSuiyunPower(p), .3);
  assert.equal(spendMoonlight(p, 100), false);
  assert.equal(spendSuiyunPower(p, -.1), false);
  assert.equal(spendSuiyunPower(p, Infinity), false);
  assert.equal(spendSuiyunPower(p, .4), false);
  assert.equal(spendSuiyunPower(p, .1), true);
  assert.equal(getSuiyunPower(p), .2);
});

test('月华天宫只结算已存在世界、保留不足一小时、重复读取无重复收益', () => {
  const p = player();
  p.灵根 = createSuiyunRoot(4);
  assert.deepEqual(settleSuiyunPalace(p, null), { hours: 0, power: 0, potentialGain: 0 });
  const world = { world_name: '旧世界' };
  assert.equal(ascendSuiyunPalace(world, 0), true);
  assert.equal(ascendSuiyunPalace(world, 999), false);
  assert.equal(settleSuiyunPalace(p, world, { now: SUIYUN_HOUR_MS - 1 }).power, 0);
  assert.equal(settleSuiyunPalace(p, world, { now: 2.5 * SUIYUN_HOUR_MS }).power, 1);
  assert.equal(settleSuiyunPalace(p, world, { now: 2.5 * SUIYUN_HOUR_MS }).power, 0);
  assert.equal(settleSuiyunPalace(p, world, { now: 3 * SUIYUN_HOUR_MS }).power, .5);
  assert.equal(p.岁云之力, 1.5);
});

test('唯一归属在同时间线互斥、至宝跨时间线互斥且可持久重读', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyun-registry-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const options = { file: path.join(dir, 'claims'), timeline: 'line1' };
  assert.equal(claimSuiyunUnique('root', 'a', options).ok, true);
  assert.equal(claimSuiyunUnique('root', 'b', options).ok, false);
  assert.equal(readSuiyunUnique('root', options).ownerId, 'a');
  assert.equal(claimSuiyunUnique('root', 'a', options).alreadyOwned, true);
  assert.equal(claimSuiyunUnique('root', 'b', { ...options, timeline: 'line2' }).ok, true);
  assert.equal(claimSuiyunUnique('treasure', 'a', options).ok, true);
  assert.equal(claimSuiyunUnique('treasure', 'b', { ...options, timeline: 'line2' }).ok, false);
  assert.equal(releaseSuiyunUnique('root', 'b', options), false);
});

test('星海十万分之一掉落，批量并发只发一次；失败保留归属供幂等重试', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyun-drops-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const options = { file: path.join(dir, 'claims'), location: '往世星海', random: () => 0 };
  const p = { id: 'a' };
  let drops = 0;
  const grant = async ({ idempotencyKey }) => { assert.ok(idempotencyKey); drops++; };
  assert.equal((await rollAndGrantSuiyunRemnant(p, grant, { ...options, location: '其他秘境' })).ok, false);
  assert.equal((await rollAndGrantSuiyunRemnant(p, grant, { ...options, random: () => .00001 })).ok, false);
  const batch = await Promise.all(Array.from({ length: 12 }, () => rollAndGrantSuiyunRemnant(p, grant, options)));
  assert.equal(batch.filter(result => result.ok).length, 1);
  assert.equal(drops, 1);
  const other = { ...options, timeline: 'pending' };
  await assert.rejects(rollAndGrantSuiyunRemnant(p, () => { throw new Error('write interrupted'); }, other));
  assert.equal((await rollAndGrantSuiyunRemnant({ id: 'b' }, grant, other)).ok, false);
  assert.equal((await rollAndGrantSuiyunRemnant(p, grant, { ...other, random: () => 1 })).ok, true);
});

test('真实纳戒发放函数遇到时间线封锁必须报错，唯一凭证不随普通历史淘汰', async () => {
  const source = fs.readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
  const recordStart = source.indexOf('const MAX_REWARD_CLAIMS =');
  const recordEnd = source.indexOf('export async function Add_灵石', recordStart);
  const start = source.indexOf('export async function Add_najie_thing(');
  const end = source.indexOf('//替换装备', start);
  let stored = { 道具: [] };
  let locked = true;
  const item = { name: '岁云的残念', class: '道具', 全服唯一: true };
  const deps = {
    normalizeNajieThingClass: value => value,
    withPlayerMutationLock: async (_id, task) => task(),
    foundthing: async () => item,
    Read_najie: async () => structuredClone(stored),
    Write_najie: async (_id, next) => { if (locked) return false; stored = structuredClone(next); return true; },
    data: { daoju_list: [item] },
  };
  const { add, record } = new Function(...Object.keys(deps),
    `${source.slice(recordStart, recordEnd)}\n${source.slice(start, end).replace('export ', '')}\nreturn { add: Add_najie_thing, record: recordRewardClaim };`)(...Object.values(deps));
  const grant = () => add('owner', item.name, '道具', 1, undefined, 1, { idempotencyKey: 'suiyun:remnant:main:owner' });
  await assert.rejects(grant(), /纳戒写入被封锁/);
  assert.equal(stored.道具.length, 0);
  locked = false;
  await grant();
  await grant();
  assert.equal(stored.道具[0].数量, 1);
  for (let i = 0; i < 600; i++) record(stored, `normal:${i}`, 1);
  assert.ok(stored._rewardClaims['suiyun:remnant:main:owner']);
  assert.equal(Object.keys(stored._rewardClaims).length, 501);
});

test('天宫写入失败只回滚本世界，保留并发玩家已完成的小时产出', async () => {
  const source = fs.readFileSync(new URL('../apps/User/Suiyun.js', import.meta.url), 'utf8');
  const start = source.indexOf('  async settlePalace(');
  const end = source.indexOf('\n  async power(', start);
  const worlds = ['a', 'b'].map(id => ({ player_qq: id, world_name: '月华天宫', 月华天宫: true, 月华天宫上次结算时间: 0 }));
  const players = { a: player(), b: player() };
  for (const p of Object.values(players)) p.灵根 = createSuiyunRoot(4);
  let rejectA;
  let persistedWorlds;
  const deps = {
    data: { xiaoshijie: worlds },
    ascendSuiyunPalace, settleSuiyunPalace,
    Date: { now: () => 2 * SUIYUN_HOUR_MS },
    saveWorlds: () => { persistedWorlds = structuredClone(worlds); },
    transactionFor: ids => {
      const before = ids.map(id => [id, structuredClone(players[id])]);
      return { commit() {}, rollback() { for (const [id, value] of before) players[id] = value; } };
    },
    Write_player: async (id, value) => {
      if (id === 'a') await new Promise((_resolve, reject) => { rejectA = reject; });
      players[id] = structuredClone(value);
    },
  };
  const settle = new Function(...Object.keys(deps), `return ({${source.slice(start, end)}}).settlePalace;`)(...Object.values(deps));
  const a = settle('a', structuredClone(players.a));
  await settle('b', structuredClone(players.b));
  const rejected = assert.rejects(a, /write-interrupted/);
  rejectA(new Error('write-interrupted'));
  await rejected;
  assert.equal(players.a.岁云之力, 0);
  assert.equal(players.b.岁云之力, 1);
  assert.equal(persistedWorlds[0].月华天宫上次结算时间, 0);
  assert.equal(persistedWorlds[1].月华天宫上次结算时间, 2 * SUIYUN_HOUR_MS);
});
