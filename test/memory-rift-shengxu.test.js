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
  let to = source.indexOf(`  async ${next}(`, from);
  if (to < 0) to = source.indexOf(`  ${next}(`, from);
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
    verc: () => true, channel: async id => id, existplayer: async () => true,
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
          exec: async () => {
            if (state.failTask) { state.failTask = false; throw new Error('injected-task-failed'); }
            for (const [key, value] of entries) state.values.set(key, value);
          } };
        return pipeline;
      },
    },
    data: { minggeList: [] }, getMinggeEffects: () => ({}), getMinggeSecretPlaceReductionMs: () => 0,
    calculateRiftExploreDuration: () => ({ durationMs: 60000, messages: [] }),
    canStartRiftExplore: () => ({ ok: state.allow, reason: 'yuanshen' }),
    formatDuration: String, EXPLORE_PREFIX: 'xiuxian:lingjie_rift:explore:', RIFT_ANCHOR_ITEM: '界印',
    createRiftMonster: () => ({ 名号: '测试裂缝怪物', 攻击: 10, 防御: 10, 血量上限: 100 }),
    consumeBlackEmperorBattleFormation: () => ({}), awardDungeonGongfaProficiency: () => ({}),
    adjustDaoHeart: () => {}, resolveRiftRewardBonus: () => ({ multiplier: 1 }),
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
      if (state.onBattle) await state.onBattle();
      return { winner: state.won ? 'A' : 'B', A_hp: 1, msg: [] };
    },
  };
  const riftApp = {
    getPlayer: async () => ({ qq: 'owner' }), readRift: async () => ({ id: 'rift', x: 1, y: 2 }),
    getAttemptState: async () => ({ remaining: 1, used: 0, total: 1 }),
    activeAction: async () => null,
    clearRiftAction: async () => state.values.delete('xiuxian:player:owner:action'),
    exploreRift: method('apps/SecretPlace/LingjieRift.js', 'exploreRift', 'tick', dependencies),
    completeExploration: method('apps/SecretPlace/LingjieRift.js', 'completeExploration', 'battlePlayer', dependencies),
    battlePlayer: clone, recordAttempt: async () => ({ remaining: 0, used: 1, total: 1 }),
    sendResult: async () => {}, grantMainRewards: async () => [], resolveAftermath: async () => [],
  };
  const shengxuApp = {
    beginExplore: method('apps/User/ShengxuContent.js', 'beginExplore', 'tick', dependencies),
    settleExplore: method('apps/User/ShengxuContent.js', 'settleExplore', 'sendExploreResult', dependencies),
    sendExploreResult: async () => {},
  };
  const giveup = method('apps/SecretPlace/SecretPlace.js', 'Giveup', 'quickReplay', dependencies);
  return { ...state, state, riftApp, shengxuApp, giveup, dungeon: shengxu.getShengxuDungeon('昆仑山') };
}

test('灵界裂缝并发入场不提前发进度，正常战败结算+2且重试不重复', async () => {
  const f = fixture();
  f.state.allow = false;
  await f.riftApp.exploreRift(event);
  assert.equal(f.state.player.模拟值, 0);
  assert.equal(f.state.values.size, 0);
  f.state.allow = true;
  await Promise.all([f.riftApp.exploreRift(event), f.riftApp.exploreRift(event)]);
  assert.equal(f.state.player.模拟值, 0);
  const task = JSON.parse(f.state.values.get('xiuxian:lingjie_rift:explore:owner'));
  await f.riftApp.completeExploration(task);
  await f.riftApp.completeExploration(task);
  assert.equal(f.state.player.模拟值, 2);
  assert.equal(f.state.player.记忆命途.秘境记录.length, 1);
});

test('灵界裂缝任务创建与结算写入失败都不增加进度，结算重试只累计一次', async () => {
  const f = fixture();
  f.state.failTask = true;
  await assert.rejects(f.riftApp.exploreRift(event), /injected-task-failed/);
  assert.equal(f.state.player.模拟值, 0);
  assert.equal(f.state.values.size, 0);
  await f.riftApp.exploreRift(event);
  const task = JSON.parse(f.state.values.get('xiuxian:lingjie_rift:explore:owner'));
  f.state.failWrite = true;
  await assert.rejects(f.riftApp.completeExploration(task), /injected-write-failed/);
  assert.equal(f.state.player.模拟值, 0);
  await f.riftApp.completeExploration(task);
  assert.equal(f.state.player.模拟值, 2);
});

test('圣墟真身与法身单次在结算后各+2，入场和批量预订不提前发进度', async () => {
  const f = fixture();
  await f.shengxuApp.beginExplore(event, { userId: 'owner' }, f.dungeon, 1);
  await f.shengxuApp.beginExplore(event, { userId: 'owner' }, f.dungeon, 1, 'fashan');
  assert.equal(f.state.player.模拟值, 0);
  await f.shengxuApp.beginExplore(event, { userId: 'owner' }, f.dungeon, 1);
  assert.equal(f.state.player.模拟值, 0);
  await f.shengxuApp.settleExplore(JSON.parse(f.state.values.get('xiuxian:shengxu:explore:owner')), false);
  assert.equal(f.state.player.模拟值, 2);
  await f.shengxuApp.settleExplore(JSON.parse(f.state.values.get('xiuxian:shengxu:explore:owner:fashan')), false);
  assert.equal(f.state.player.模拟值, 4);
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

for (const kind of ['rift', 'shengxu']) {
  test(`${kind}主动逃离移除独立后台任务，旧结算回执不增加进度`, async () => {
    const f = fixture();
    const key = kind === 'rift' ? 'xiuxian:lingjie_rift:explore:owner' : 'xiuxian:shengxu:explore:owner';
    if (kind === 'rift') await f.riftApp.exploreRift(event);
    else await f.shengxuApp.beginExplore(event, { userId: 'owner' }, f.dungeon, 1);
    const task = JSON.parse(f.state.values.get(key));
    await f.giveup(event);
    assert.equal(f.state.values.has(key), false);
    assert.equal(JSON.parse(f.state.values.get('xiuxian:player:owner:action')).escaped, true);
    if (kind === 'rift') await f.riftApp.completeExploration(task);
    else await f.shengxuApp.settleExplore(task, false);
    assert.equal(f.state.player.模拟值, 0);
    assert.equal(f.state.awards.length, 0);
  });

  test(`${kind}胜利完成一次增加2%进度`, async () => {
    const f = fixture();
    f.state.won = true;
    if (kind === 'rift') {
      await f.riftApp.exploreRift(event);
      await f.riftApp.completeExploration(JSON.parse(f.state.values.get('xiuxian:lingjie_rift:explore:owner')));
    } else {
      await f.shengxuApp.beginExplore(event, { userId: 'owner' }, f.dungeon, 1);
      await f.shengxuApp.settleExplore(JSON.parse(f.state.values.get('xiuxian:shengxu:explore:owner')), false);
    }
    assert.equal(f.state.player.模拟值, 2);
  });
}

test('圣墟战斗进行时主动逃离，迟到的结算不会补发进度或奖励', async () => {
  const f = fixture();
  f.state.won = true;
  await f.shengxuApp.beginExplore(event, { userId: 'owner' }, f.dungeon, 1);
  const task = JSON.parse(f.state.values.get('xiuxian:shengxu:explore:owner'));
  f.state.onBattle = async () => {
    await f.giveup(event);
    f.state.values.set('xiuxian:player:owner:action', JSON.stringify({ shengxuTaskId: 'replacement' }));
  };
  const result = await f.shengxuApp.settleExplore(task, false);
  assert.equal(result.escaped, true);
  assert.equal(f.state.player.模拟值, 0);
  assert.equal(f.state.awards.length, 0);
});

test('圣墟真实沉迷轮次+2且重复回执不增加，旧版入场已记数任务不再计一次', async () => {
  const f = fixture();
  const task = { qq: 'owner', taskId: 'batch:round:1', dungeonName: '昆仑山', playerName: '测试', mode: 'addiction' };
  await f.shengxuApp.settleExplore(task, false);
  await f.shengxuApp.settleExplore(task, false);
  assert.equal(f.state.player.模拟值, 2);
  await f.shengxuApp.settleExplore({ ...task, taskId: 'single', mode: 'single', memoryEntryRecorded: true }, false);
  assert.equal(f.state.player.模拟值, 2);
});

test('圣墟法身结算用最新主存档增模拟，法身位移取消不结算预订轮次', async () => {
  const f = fixture();
  const task = { qq: 'owner', taskId: 'proxy:round:1', dungeonName: '昆仑山', playerName: '测试', mode: 'addiction',
    actor: 'fashan', actorPlane: f.state.player.法身位置, actorSnapshot: clone(f.state.player) };
  f.state.onBattle = () => { f.state.player.模拟值 = 35; };
  await f.shengxuApp.settleExplore(task, false);
  assert.equal(f.state.player.模拟值, 37);
  assert.equal(f.state.player.当前血量, 500);
  f.state.player.法身位置 = locations.PLACE_LOCATION_MAP.阳间;
  const result = await f.shengxuApp.settleExplore({ ...task, taskId: 'proxy:round:2' }, false);
  assert.equal(result.actorPlaneMismatch, true);
  assert.equal(f.state.player.模拟值, 37);
});

test('门径不再改变圣墟与灵界裂缝耗时或加速提示，裂缝掉落仍保留命途倍率', () => {
  const p = memoryPlayer();
  p.学习的功法 = [];
  const shengxuBase = shengxu.getShengxuExploreDuration(p, shengxu.getShengxuDungeon('昆仑山'));
  const riftBase = calculateRiftExploreDuration(p).durationMs;
  for (const tier of [1, 2, 3]) {
    p.记忆命途.因子 = { 门径: tier };
    assert.equal(shengxu.getShengxuExploreDuration(p, shengxu.getShengxuDungeon('昆仑山')), shengxuBase);
    assert.equal(calculateRiftExploreDuration(p).durationMs, riftBase);
    assert.ok(calculateRiftExploreDuration(p).messages.every(message => !message.includes('门径')));
  }
  p.灵根 = createMemoryRoot(2);
  p.记忆命途.因子 = { 门径: 1, 理性: 1, 大地: 1 };
  assert.equal(resolveRiftRewardBonus(p, () => 1).multiplier, 2);
});

test('圣墟门径仅优惠四种入场资源，三档按每轮向上取整', () => {
  const dungeon = { requiredLevel: 1, scale: .100001, duration: 15 };
  const base = shengxu.getShengxuExploreCost(dungeon);
  assert.deepEqual(base, { xiuwei: 100001, xueqi: 100001, lingshi: 50001, shouyuan: 3 });
  const p = memoryPlayer();
  for (const [tier, expected] of [
    [1, { xiuwei: 80001, xueqi: 80001, lingshi: 40001, shouyuan: 3 }],
    [2, { xiuwei: 70001, xueqi: 70001, lingshi: 35001, shouyuan: 3 }],
    [3, { xiuwei: 60001, xueqi: 60001, lingshi: 30001, shouyuan: 2 }],
  ]) {
    p.记忆命途.因子 = { 门径: tier };
    assert.deepEqual(shengxu.getShengxuExploreCost(dungeon, p), expected);
  }
  assert.deepEqual(shengxu.getShengxuExploreCost(dungeon, { 灵根: { name: '普通灵根' } }), base);
});

test('圣墟真身法身及批量检查、扣款、存档成本与显示都按门径折后单价', async () => {
  const fields = { 修为: 'xiuwei', 血气: 'xueqi', 灵石: 'lingshi', 寿元: 'shouyuan' };
  for (const [tier, xiuwei, lingshi] of [[1, 1152000, 576000], [2, 1008000, 504000], [3, 864000, 432000]]) {
    for (const actor of ['body', 'fashan']) for (const count of [1, 10]) {
      const f = fixture();
      const expected = { xiuwei: xiuwei * count, xueqi: xiuwei * count, lingshi: lingshi * count, shouyuan: 2 * count };
      f.state.player.记忆命途.因子 = { 门径: tier };
      Object.assign(f.state.player, { 源石: 17, 元神: 13, 心神: 9 });
      for (const [field, key] of Object.entries(fields)) f.state.player[field] = expected[key];
      const message = await f.shengxuApp.beginExplore(event, { userId: 'owner' }, f.dungeon, count, actor);
      const taskKey = `xiuxian:shengxu:explore:owner${actor === 'fashan' ? ':fashan' : ''}`;
      const task = JSON.parse(f.state.values.get(taskKey));
      assert.deepEqual(task.cost, expected);
      for (const [field, key] of Object.entries(fields)) {
        assert.equal(f.state.player[field], 0, `${tier}:${actor}:${count}:${field}`);
        assert.ok(message.includes(`${field}${expected[key]}`));
      }
      assert.equal(f.state.player.源石, 17);
      assert.equal(f.state.player.元神, 13);
      assert.equal(f.state.player.心神, 9);
    }
  }
});

test('圣墟折后余额少一仍拦截，入场写入失败保留原余额并清理任务资格', async () => {
  const f = fixture();
  f.state.player.记忆命途.因子 = { 门径: 3 };
  f.state.player.修为 = 863999;
  const short = await f.shengxuApp.beginExplore(event, { userId: 'owner' }, f.dungeon, 1);
  assert.match(short, /修为需864,000/);
  assert.equal(f.state.player.修为, 863999);
  assert.equal(f.state.values.size, 0);
  f.state.player.修为 = 864000;
  const before = clone(f.state.player);
  f.state.failWrite = true;
  await assert.rejects(f.shengxuApp.beginExplore(event, { userId: 'owner' }, f.dungeon, 1), /injected-write-failed/);
  assert.deepEqual(f.state.player, before);
  assert.equal(f.state.values.size, 0);
  await f.shengxuApp.beginExplore(event, { userId: 'owner' }, f.dungeon, 1);
  assert.equal(f.state.player.修为, 0);
});

test('圣墟副本面板采用玩家门径折后成本，探索时长不再被门径缩短', async () => {
  const p = memoryPlayer();
  p.记忆命途.因子 = { 门径: 3 };
  Object.assign(p, { 修为: 864000, 血气: 864000, 灵石: 432000, 寿元: 2 });
  let panel;
  const app = { getPlayer: async () => ({ userId: 'owner', player: p }) };
  app.dungeons = method('apps/User/ShengxuContent.js', 'dungeons', 'explore', {
    ...shengxu, ...locations, verc: () => true, bigNumberTransform: String,
    Show: class { async get_shengxu_placeData(value) { panel = value; return {}; } },
    puppeteer: { screenshot: async () => 'fixture-panel' },
  });
  assert.equal(await app.dungeons(event), 'fixture-panel');
  const kunlun = panel.dungeons.find(item => item.name === '昆仑山');
  assert.equal(kunlun.xiuweiCost, '864000');
  assert.equal(kunlun.xueqiCost, '864000');
  assert.equal(kunlun.lingshiCost, '432000');
  assert.equal(kunlun.shouyuanCost, 2);
  assert.equal(kunlun.durationActual, 7);
  assert.equal(kunlun.ready, true);
});

test('灵界裂缝原本免费入场，门径调整后四资源与源石元神仍不扣减', async () => {
  const f = fixture();
  f.state.player.记忆命途.因子 = { 门径: 3 };
  Object.assign(f.state.player, { 源石: 17, 元神: 13 });
  const before = clone(f.state.player);
  await f.riftApp.exploreRift(event);
  assert.ok(f.state.values.has('xiuxian:lingjie_rift:explore:owner'));
  assert.deepEqual(f.state.player, before);
  assert.equal(f.state.writes, 0);
});

test('圣墟记忆掉落按倍率结算，律法只补缺失档位且重复结算不复制', async () => {
  const f = fixture();
  f.state.won = true;
  f.state.player.灵根 = createMemoryRoot(2);
  f.state.player.记忆命途.因子 = { 律法: 3 };
  const task = { qq: 'owner', taskId: 'law:round:1', dungeonName: '昆仑山', playerName: '测试', mode: 'addiction' };
  await f.shengxuApp.settleExplore(task, false);
  assert.deepEqual(f.state.awards.map(item => [item.name, item.amount]), [
    ['普通进化花粉', 4], ['进化异果', 2], ['形意呼吸法', 2],
  ]);
  const before = clone(f.state.awards);
  await f.shengxuApp.settleExplore(task, false);
  assert.deepEqual(f.state.awards, before);
});
