import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  accelerateSecretPlaceAction,
  getSecretPlaceActionEndTime,
  getSecretPlaceSettlementLockKey,
  hasPendingSecretPlaceSettlement,
  isShengxuExploreAction,
  SECRET_PLACE_SETTLEMENT_BUSY,
  withSecretPlaceSettlementLock,
} from '../model/secretPlaceAddiction.js';
import { syncShengxuExploreTiming } from '../model/shengxuContent.js';
import { getLocationId } from '../model/weimianTravel.js';
import { getFashanActionKey } from '../model/fashanProxy.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const source = read('apps/User/ShengxuContent.js');
const bodyKey = 'xiuxian:player:card-test:action';
const taskKey = 'xiuxian:shengxu:explore:card-test';
const minute = 60_000;

function method(name, next, dependencies) {
  const start = source.indexOf(`  async ${name}(`);
  const end = source.indexOf(`  ${next}(`, start);
  assert.ok(start >= 0 && end > start);
  return new Function(...Object.keys(dependencies), `return ({${source.slice(start, end)}}).${name};`)(...Object.values(dependencies));
}

function fixture({ rounds = 1, settled = 0, remaining = 7 * minute } = {}) {
  const state = {
    now: 1_000_000_000, values: new Map(), cards: {}, messages: [], awards: new Set(),
    summaries: 0, failSave: false, incomplete: false,
  };
  const task = {
    qq: 'card-test', taskId: `card-test:${rounds}`, actor: 'body', dungeonName: '昆仑山',
    mode: rounds > 1 ? 'addiction' : 'single', start_time: state.now - settled * 7 * minute,
    end_time: state.now + remaining, interval: 7 * minute, next_settle_time: state.now + 7 * minute,
    total_count: rounds, settled_count: settled,
  };
  state.values.set(taskKey, JSON.stringify(task));
  state.values.set(bodyKey, JSON.stringify({
    action: rounds > 1 ? '圣墟沉迷' : '圣墟探索', actor: 'body', Place_actionplus: 'shengxu',
    shengxuTaskId: task.taskId, Place_address: { name: task.dungeonName },
    start_time: task.start_time, end_time: task.end_time, time: remaining,
  }));
  const redis = {
    get: async key => state.values.get(key) ?? null,
    set: async (key, value, options) => {
      if (key === bodyKey && state.failSave) { state.failSave = false; throw Error('action-write-failed'); }
      if (options?.NX && state.values.has(key)) return null;
      state.values.set(key, value); return 'OK';
    },
    del: async key => state.values.delete(key),
    keys: async () => [...state.values.keys()].filter(key => key.startsWith('xiuxian:shengxu:explore:')),
  };
  const dependencies = {
    redis, accelerateSecretPlaceAction, getSecretPlaceActionEndTime, hasPendingSecretPlaceSettlement,
    isShengxuExploreAction, syncShengxuExploreTiming, SECRET_PLACE_SETTLEMENT_BUSY, getLocationId,
    withSecretPlaceSettlementLock: (id, task) => withSecretPlaceSettlementLock(id, task, { redisClient: redis }),
    Date: class extends Date { static now() { return state.now; } },
    getActorActionKey: (id, actor) => actor === 'fashan' ? getFashanActionKey(id) : `xiuxian:player:${id}:action`,
    verc: () => true, channel: async id => id, existplayer: async () => true,
    safeNumber: value => Number(value) || 0, formatTime: String,
    console: { error() {} },
    exist_najie_thing: async (_id, name) => state.cards[name] || 0,
    Add_najie_thing: async (_id, name, _type, quantity) => {
      const count = (state.cards[name] || 0) + quantity;
      assert.ok(count >= 0, '结算卡库存不得透支');
      state.cards[name] = count;
    },
  };
  const app = {
    settleExplorations: method('settleExplorations', 'async settleAddiction', dependencies),
    settleAddiction: method('settleAddiction', 'addAddictionSummary', dependencies),
    settleExplore: async task => {
      if (state.incomplete) return { settled: false };
      const duplicate = state.awards.has(task.taskId);
      state.awards.add(task.taskId);
      return { settled: true, alreadySettled: duplicate };
    },
    addAddictionSummary() {},
    sendAddictionResult: async () => state.summaries++,
    clearShengxuAction: async task => {
      const key = dependencies.getActorActionKey(task.qq, task.actor);
      if (JSON.parse(await redis.get(key) || '{}').shengxuTaskId === task.taskId) await redis.del(key);
    },
  };
  const sell = read('apps/User/UserSellAll.js');
  const quick = new Function(...Object.keys(dependencies),
    `return ({${sell.slice(sell.indexOf('async quickSettleDungeon('), sell.indexOf('  async all_food('))}}).quickSettleDungeon;`,
  )(...Object.values(dependencies));
  const home = read('apps/User/UserHome.js');
  const singleBlock = home.slice(home.indexOf('if (thing_exist.type === "秘境结算")'), home.indexOf('//寄术原因'));
  const single = new Function(...Object.keys(dependencies),
    `return async function(e, usr_qq, thing_exist, quantity) { ${singleBlock} };`,
  )(...Object.values(dependencies));
  const e = { user_id: 'card-test', reply: async message => state.messages.push(message) };
  return {
    state, task, app, redis,
    quick: () => quick(e),
    single: (name, quantity = 1) => single(e, 'card-test', { name, type: '秘境结算' }, quantity),
    action: () => JSON.parse(state.values.get(bodyKey)),
  };
}

test('圣墟结算卡部分加速与后台时间同步，旧任务也能生效', async () => {
  const f = fixture();
  f.state.cards.玄品秘境结算卡 = 2;
  await f.single('玄品秘境结算卡', 2);
  assert.equal(f.action().end_time, f.state.now + 5 * minute);
  assert.equal(f.state.cards.玄品秘境结算卡, 0);
  await f.app.settleExplorations();
  assert.equal(f.state.awards.size, 0);
  f.state.now += 5 * minute;
  await f.app.settleExplorations();
  await f.app.settleExplorations();
  assert.equal(f.state.awards.size, 1);
  assert.equal(f.state.values.has(bodyKey), false);
  assert.equal(f.state.values.has(taskKey), false);
});

test('高品卡可结清短于卡片面值的剩余时间，超额请求只扣所需张数', async () => {
  const f = fixture({ remaining: 10_000 });
  f.state.cards.帝品秘境结算卡 = 10;
  await Promise.all([f.single('帝品秘境结算卡', 10), f.single('帝品秘境结算卡', 10)]);
  assert.equal(f.state.cards.帝品秘境结算卡, 9);
  assert.equal(f.action().end_time, f.state.now);
  await f.app.settleExplorations();
  assert.equal(f.state.awards.size, 1);
});

test('一键消耗结算卡结清圣墟沉迷，分批补齐所有未结轮次且只汇总一次', async () => {
  const f = fixture({ rounds: 25, remaining: 175 * minute });
  f.state.cards.帝品秘境结算卡 = 6;
  await f.quick();
  assert.equal(f.action().end_time, f.state.now);
  assert.equal(f.state.cards.帝品秘境结算卡, 0);
  for (let i = 0; i < 4; i++) await f.app.settleExplorations();
  assert.equal(f.state.awards.size, 25);
  assert.equal(f.state.summaries, 1);
  assert.equal(f.state.values.has(bodyKey), false);
  assert.equal(f.state.values.has(taskKey), false);
});

test('沉迷中途加速不重算已结轮次，重复同步不继续缩短时间', async () => {
  const f = fixture({ rounds: 10, settled: 4, remaining: 42 * minute });
  f.state.cards.仙品秘境结算卡 = 3;
  await f.single('仙品秘境结算卡', 3);
  await f.app.settleExplorations();
  const saved = JSON.parse(f.state.values.get(taskKey));
  assert.equal(saved.settled_count, 6);
  assert.equal(saved.next_settle_time, f.state.now + 6 * minute);
  assert.equal(saved.end_time, f.state.now + 27 * minute);
  assert.equal(saved.interval, 7 * minute);
  await f.app.settleExplorations();
  assert.equal(f.state.values.get(taskKey), JSON.stringify(saved));
  assert.equal(f.state.awards.size, 2);
});

test('结算失败保留任务轮次，外部结算锁持有时不会发奖', async () => {
  const f = fixture({ rounds: 10, remaining: 70 * minute });
  f.state.cards.帝品秘境结算卡 = 3;
  await f.quick();
  const lock = getSecretPlaceSettlementLockKey('card-test');
  f.state.values.set(lock, 'other-worker');
  await f.app.settleExplorations();
  assert.equal(f.state.awards.size, 0);
  f.state.values.delete(lock);
  f.state.incomplete = true;
  await f.app.settleExplorations();
  assert.equal(JSON.parse(f.state.values.get(taskKey)).settled_count, 0);
  f.state.incomplete = false;
  await f.app.settleExplorations();
  assert.equal(f.state.awards.size, 10);
  assert.equal(f.state.summaries, 1);
});

for (const mode of ['single', 'quick']) {
  test(`${mode}写入失败返还结算卡，非探索行动不会扣卡`, async () => {
    const f = fixture();
    f.state.cards.仙品秘境结算卡 = 2;
    const previous = f.state.values.get(bodyKey);
    f.state.failSave = true;
    if (mode === 'single') await f.single('仙品秘境结算卡');
    else await f.quick();
    assert.equal(f.state.cards.仙品秘境结算卡, 2);
    assert.equal(f.state.values.get(bodyKey), previous);
    f.state.values.set(bodyKey, JSON.stringify({ action: '闭关', end_time: f.state.now + minute }));
    if (mode === 'single') await f.single('仙品秘境结算卡');
    else await f.quick();
    assert.equal(f.state.cards.仙品秘境结算卡, 2);
  });
}

test('任务身份、真身法身和逃离标记隔离，不串改其他探索的时间', () => {
  const f = fixture();
  const earlier = { ...f.action(), end_time: f.state.now + minute };
  for (const action of [
    { ...earlier, shengxuTaskId: 'replacement' },
    { ...earlier, actor: 'fashan' },
    { ...earlier, escaped: true },
    { ...earlier, end_time: 'invalid' },
  ]) assert.equal(syncShengxuExploreTiming(f.task, action), f.task);
  const synced = syncShengxuExploreTiming(f.task, earlier);
  assert.equal(synced.end_time, earlier.end_time);
  assert.equal(syncShengxuExploreTiming(synced, earlier), synced);
  assert.equal(hasPendingSecretPlaceSettlement(earlier), true);
  assert.equal(hasPendingSecretPlaceSettlement({ ...earlier, escaped: true }), false);
});

test('普通秘境仍按原规则消耗卡片，不受圣墟补齐尾秒逻辑影响', async () => {
  const f = fixture({ remaining: 10_000 });
  const action = { ...f.action(), action: '秘境历练', Place_action: '0', Place_actionplus: '1' };
  delete action.shengxuTaskId;
  f.state.values.set(bodyKey, JSON.stringify(action));
  f.state.cards.帝品秘境结算卡 = 1;
  await f.single('帝品秘境结算卡');
  await f.quick();
  assert.equal(f.state.cards.帝品秘境结算卡, 1);
  assert.equal(f.action().end_time, action.end_time);
});
