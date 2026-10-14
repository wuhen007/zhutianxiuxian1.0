import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createMemoryRoot, getMemoryEffects, recordMemoryDungeon } from '../model/memoryPath.js';
import { multiplySuiyunLoot } from '../model/suiyunLoot.js';
import { isItemPermanentlyNonTradeable } from '../model/equipmentTransfer.js';
import { calculateRiftExploreDuration, resolveRiftRewardBonus } from '../model/lingjieRift.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import * as shengxu from '../model/shengxuContent.js';
import * as locations from '../model/weimianTravel.js';
import * as fashan from '../model/fashanProxy.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const clone = value => structuredClone(value);
const event = { user_id: 'owner', isGroup: true, group_id: 'fixture', msg: '#探索灵界裂缝', reply: async message => message };
const memoryPlayer = () => ({ 名号: '测试修士', 灵根: createMemoryRoot(1), 模拟值: 0, 记忆命途: {},
  修为: 1e9, 血气: 1e9, 灵石: 1e9, 寿元: 1e9, huafenlevel_id: 30,
  power_place: locations.PLACE_LOCATION_MAP.小阴间, 法身位置: locations.PLACE_LOCATION_MAP.小阴间,
  法身: 1, 法身状态: '空闲中', 法身行动: '无行动', 血量上限: 1000, 当前血量: 500 });

function method(file, name, next, dependencies) {
  const source = read(file);
  const from = source.indexOf(`  async ${name}(`);
  const to = source.indexOf(`  async ${next}(`, from);
  assert.ok(from >= 0 && to > from);
  return new Function(...Object.keys(dependencies), `return ({${source.slice(from, to)}}).${name};`)(...Object.values(dependencies));
}

function fixture() {
  const state = { player: memoryPlayer(), values: new Map(), failWrite: false, writes: 0, allow: true, awards: [] };
  const shengxuSource = read('apps/User/ShengxuContent.js');
  const planeHelper = shengxuSource.slice(shengxuSource.indexOf('function isInShengxuPlane('), shengxuSource.indexOf('function stoneJarRequirements('));
  const actorHelpers = shengxuSource.slice(shengxuSource.indexOf('function getShengxuExploreKey('), shengxuSource.indexOf('function mergeNumericDelta('));
  const dependencies = {
    recordMemoryDungeon, getMemoryEffects, multiplySuiyunLoot, isItemPermanentlyNonTradeable,
    withPlayerMutationLock, ...shengxu, ...locations, ...fashan,
    ...new Function('getFashanActionKey', `${actorHelpers};return {getShengxuExploreKey,getActorActionKey,buildActorSnapshot};`)(fashan.getFashanActionKey),
    isInShengxuPlane: new Function('PLACE_LOCATION_MAP', `${planeHelper};return isInShengxuPlane;`)(locations.PLACE_LOCATION_MAP),
    Read_player: async () => clone(state.player),
    Write_player: async (_id, player) => {
      if (state.failWrite) { state.failWrite = false; throw new Error('injected-write-failed'); }
      state.player = clone(player); state.writes++;
    },
    redis: {
      get: async key => state.values.get(key) || null,
      set: async (key, value, options) => {
        if (options?.NX && state.values.has(key)) return null;
        state.values.set(key, value); return 'OK';
      },
      del: async key => state.values.delete(key),
      multi: () => {
        const entries = [];
        const pipeline = { set: (key, value) => { entries.push([key, value]); return pipeline; },
          exec: async () => { for (const [key, value] of entries) state.values.set(key, value); } };
        return pipeline;
      },
    },
    data: { minggeList: [] }, getMinggeEffects: () => ({}), getMinggeSecretPlaceReductionMs: () => 0,
    calculateRiftExploreDuration: () => ({ durationMs: 60000, messages: [] }),
    canStartRiftExplore: () => ({ ok: state.allow, reason: 'yuanshen' }),
    formatDuration: String, EXPLORE_PREFIX: 'rift-explore:', RIFT_ANCHOR_ITEM: '界印',
    Go: async () => true, isCultivatingExtraPath: () => state.allow,
    getShanghaiDateKey: () => 'fixture-date', getShengxuExploreDuration: () => 1,
    bigNumberTransform: String,
    getShengxuAncestorSeedSettlementResult: async () => false,
    getShengxuOpportunityOwner: () => '', FLOWER_ANCESTOR_SEED_OPPORTUNITY: 'seed',
    persistShengxuAncestorSeedSettlementResult: async (_id, value) => value,
    mergeCombatProficiency: () => {}, battleExcerpt: () => [],
    resolveShengxuSettlementReward: dungeon => shengxu.resolveShengxuDungeonReward(dungeon, () => 1),
    resolveShengxuTierReward: (dungeon, _random, rates) => shengxu.resolveShengxuTierReward(dungeon, () => .99, rates),
    config: { getConfig: () => ({ SecretPlace: { one: 0, two: 0, three: 0 } }) },
    Add_najie_thing: async (_id, name, category, amount, _quality, _lock, options) => state.awards.push({ name, category, amount, key: options.idempotencyKey }),
    rollFlowerPollenSkill: () => '', collectBreathingPage: () => ({ ok: false }), collectFlowerFieldPage: () => null,
    zd_battle: async () => {
      if (state.onBattle) state.onBattle();
      return { winner: state.won ? 'A' : 'B', A_hp: 1, msg: [] };
    },
  };
  const riftApp = {
    getPlayer: async () => ({ qq: 'owner' }), readRift: async () => ({ id: 'rift', x: 1, y: 2 }),
    getAttemptState: async () => ({ remaining: 1, used: 0, total: 1 }),
    activeAction: async () => null,
    clearRiftAction: async () => state.values.delete('xiuxian:player:owner:action'),
    exploreRift: method('apps/SecretPlace/LingjieRift.js', 'exploreRift', 'tick', dependencies),
  };
  const shengxuApp = {
    beginExplore: method('apps/User/ShengxuContent.js', 'beginExplore', 'tick', dependencies),
    settleExplore: method('apps/User/ShengxuContent.js', 'settleExplore', 'sendExploreResult', dependencies),
    sendExploreResult: async () => {},
  };
  return { ...state, state, riftApp, shengxuApp, dungeon: shengxu.getShengxuDungeon('昆仑山') };
}

test('灵界裂缝并发成功入场只+5，门槛未满足不新增任务', async () => {
  const f = fixture();
  f.state.allow = false;
  await f.riftApp.exploreRift(event);
  assert.equal(f.state.player.模拟值, 0);
  assert.equal(f.state.values.size, 0);
  f.state.allow = true;
  await Promise.all([f.riftApp.exploreRift(event), f.riftApp.exploreRift(event)]);
  assert.equal(f.state.player.模拟值, 5);
  assert.equal(f.state.player.记忆命途.秘境记录.length, 1);
});

test('灵界裂缝入场写入失败清理本次任务，重试只累计一次', async () => {
  const f = fixture();
  f.state.failWrite = true;
  await assert.rejects(f.riftApp.exploreRift(event), /injected-write-failed/);
  assert.equal(f.state.player.模拟值, 0);
  assert.equal(f.state.values.size, 0);
  await f.riftApp.exploreRift(event);
  assert.equal(f.state.player.模拟值, 5);
});

test('圣墟真身与法身成功单次入场各+5，批量预订不提前发所有轮次', async () => {
  const f = fixture();
  await f.shengxuApp.beginExplore(event, { userId: 'owner' }, f.dungeon, 1);
  await f.shengxuApp.beginExplore(event, { userId: 'owner' }, f.dungeon, 1, 'fashan');
  assert.equal(f.state.player.模拟值, 10);
  await f.shengxuApp.beginExplore(event, { userId: 'owner' }, f.dungeon, 1);
  assert.equal(f.state.player.模拟值, 10);
  const batch = fixture();
  await batch.shengxuApp.beginExplore(event, { userId: 'owner' }, batch.dungeon, 10);
  assert.equal(batch.state.player.模拟值, 0);
});

test('圣墟单次入场保存失败恢复每日资格，余额不足时不增模拟', async () => {
  const f = fixture();
  f.state.failWrite = true;
  await assert.rejects(f.shengxuApp.beginExplore(event, { userId: 'owner' }, f.dungeon, 1), /injected-write-failed/);
  assert.equal(f.state.player.模拟值, 0);
  assert.equal(f.state.values.size, 0);
  f.state.player.修为 = 0;
  await f.shengxuApp.beginExplore(event, { userId: 'owner' }, f.dungeon, 1);
  assert.equal(f.state.player.模拟值, 0);
  assert.equal(f.state.values.size, 0);
});

test('圣墟真实沉迷轮次+5且重复回执不增加，单次入场结算不再计一次', async () => {
  const f = fixture();
  const task = { qq: 'owner', taskId: 'batch:round:1', dungeonName: '昆仑山', playerName: '测试', mode: 'addiction' };
  await f.shengxuApp.settleExplore(task, false);
  await f.shengxuApp.settleExplore(task, false);
  assert.equal(f.state.player.模拟值, 5);
  await f.shengxuApp.settleExplore({ ...task, taskId: 'single', mode: 'single', memoryEntryRecorded: true }, false);
  assert.equal(f.state.player.模拟值, 5);
});

test('圣墟法身结算用最新主存档增模拟，法身位移取消不结算预订轮次', async () => {
  const f = fixture();
  const task = { qq: 'owner', taskId: 'proxy:round:1', dungeonName: '昆仑山', playerName: '测试', mode: 'addiction',
    actor: 'fashan', actorPlane: f.state.player.法身位置, actorSnapshot: clone(f.state.player) };
  f.state.onBattle = () => { f.state.player.模拟值 = 35; };
  await f.shengxuApp.settleExplore(task, false);
  assert.equal(f.state.player.模拟值, 40);
  assert.equal(f.state.player.当前血量, 500);
  f.state.player.法身位置 = locations.PLACE_LOCATION_MAP.阳间;
  const result = await f.shengxuApp.settleExplore({ ...task, taskId: 'proxy:round:2' }, false);
  assert.equal(result.actorPlaneMismatch, true);
  assert.equal(f.state.player.模拟值, 40);
});

test('圣墟与灵界裂缝的门径加速按2/3/5倍生效，裂缝掉落接入命途倍率', () => {
  const p = memoryPlayer();
  p.学习的功法 = [];
  const shengxuBase = shengxu.getShengxuExploreDuration(p, shengxu.getShengxuDungeon('昆仑山'));
  const riftBase = calculateRiftExploreDuration(p).durationMs;
  for (const [tier, speed] of [[1, 2], [2, 3], [3, 5]]) {
    p.记忆命途.因子 = { 门径: tier };
    assert.equal(shengxu.getShengxuExploreDuration(p, shengxu.getShengxuDungeon('昆仑山')), shengxuBase / speed);
    assert.equal(calculateRiftExploreDuration(p).durationMs, riftBase / speed);
  }
  p.灵根 = createMemoryRoot(2);
  p.记忆命途.因子 = { 门径: 1, 理性: 1, 大地: 1 };
  assert.equal(resolveRiftRewardBonus(p, () => 1).multiplier, 5);
});

test('圣墟记忆掉落按倍率结算，律法只补缺失档位且重复结算不复制', async () => {
  const f = fixture();
  f.state.won = true;
  f.state.player.灵根 = createMemoryRoot(2);
  f.state.player.记忆命途.因子 = { 律法: 3 };
  const task = { qq: 'owner', taskId: 'law:round:1', dungeonName: '昆仑山', playerName: '测试', mode: 'addiction' };
  await f.shengxuApp.settleExplore(task, false);
  assert.deepEqual(f.state.awards.map(item => [item.name, item.amount]), [
    ['普通进化花粉', 6], ['进化异果', 3], ['形意呼吸法', 3],
  ]);
  const before = clone(f.state.awards);
  await f.shengxuApp.settleExplore(task, false);
  assert.deepEqual(f.state.awards, before);
});
