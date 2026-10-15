import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import {
  accelerateSecretPlaceAction,
  createSecretPlaceAddictionAction,
  getSecretPlaceSettlementLockKey,
  hasPendingSecretPlaceSettlement,
  normalizeLegacySecretPlaceAddictionAction,
  recordSecretPlaceItemToHistory,
  SECRET_PLACE_SETTLEMENT_BUSY,
  withSecretPlaceSettlementLock,
} from '../model/secretPlaceAddiction.js';

test('仅未完成结算的普通或沉迷秘境阻止新动作覆盖', () => {
  assert.equal(hasPendingSecretPlaceSettlement({ Place_action: '0' }), true);
  assert.equal(hasPendingSecretPlaceSettlement({ Place_actionplus: '0' }), true);
  assert.equal(hasPendingSecretPlaceSettlement({ Place_action: '0', is_jiesuan: 1 }), false);
  assert.equal(hasPendingSecretPlaceSettlement({ Place_action: '1', Place_actionplus: '1' }), false);
  assert.equal(hasPendingSecretPlaceSettlement({ action: '位面穿梭' }), false);
});

function createRedis(values = new Map()) {
  return {
    values,
    async set(key, value, options) {
      if (options?.NX && values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    },
    async get(key) {
      return values.get(key) ?? null;
    },
    async del(key) {
      return values.delete(key) ? 1 : 0;
    },
    async eval(_script, { keys, arguments: args }) {
      if (values.get(keys[0]) !== args[0]) return 0;
      if (args.length > 1) return 1;
      values.delete(keys[0]);
      return 1;
    },
  };
}

test('宗门沉迷秘境创建当前结算器需要的状态字段', () => {
  const action = createSecretPlaceAddictionAction({
    durationMinutes: 60,
    totalCount: 10,
    place: { name: '高级' },
    xf: 1,
    now: 1_000,
  });

  assert.equal(action.start_time, 1_000);
  assert.equal(action.total_time, 60);
  assert.equal(action.total_count, 10);
  assert.equal(action.settled_count, 0);
  assert.equal(action.interval, 6 * 60 * 1000);
  assert.equal(action.next_settle_time, 1_000 + 6 * 60 * 1000);
  assert.equal(action.Place_actionplus, '0');
});

test('旧版宗门沉迷状态可迁移并继续分次结算', () => {
  const legacy = {
    action: '历练',
    end_time: 3_601_000,
    time: 3_600_000,
    cishu: 10,
    Place_action: '1',
    Place_actionplus: '0',
    Place_address: { name: '高级' },
  };
  const action = normalizeLegacySecretPlaceAddictionAction(legacy);

  assert.equal(action.start_time, 1_000);
  assert.equal(action.total_time, 60);
  assert.equal(action.total_count, 10);
  assert.equal(action.settled_count, 0);
  assert.equal(action.interval, 6 * 60 * 1000);
  assert.equal(action.next_settle_time, 1_000 + 6 * 60 * 1000);
});

test('结算卡按新总时长重排节点且不会推迟下一轮', () => {
  const action = createSecretPlaceAddictionAction({
    durationMinutes: 60,
    totalCount: 10,
    place: { name: '高级' },
    now: 1_000,
  });
  const previousNext = action.next_settle_time;
  const result = accelerateSecretPlaceAction(action, 5 * 60 * 1000, 301_000);

  assert.equal(result.action.total_time, 55);
  assert.equal(result.action.interval, 5.5 * 60 * 1000);
  assert.equal(result.action.next_settle_time, 331_000);
  assert.ok(result.action.next_settle_time <= previousNext);
  assert.equal(result.endTime, 1_000 + 55 * 60 * 1000);
  assert.equal(result.action.end_time, result.endTime);
});

test('岁云殿堂27张仙品卡同步旧结束时间，剩余4分27秒', () => {
  const start = 1_000_000_000_000;
  const action = {
    ...createSecretPlaceAddictionAction({ durationMinutes: 140, totalCount: 40,
      place: { name: '岁云殿堂' }, now: start }),
    end_time: start + 140 * 60_000,
  };
  const result = accelerateSecretPlaceAction(action, 135 * 60_000, start + 33_000);
  assert.equal(result.action.end_time - (start + 33_000), 267_000);
  assert.equal(result.action.end_time, result.endTime);
  assert.equal(action.end_time, start + 140 * 60_000);
  const completed = accelerateSecretPlaceAction(action, 200 * 60_000, start + 33_000);
  assert.equal(completed.action.end_time, start + 33_000);
});

test('修仙状态兼容已完成旧沉迷记录，并保留进行中行动显示', async () => {
  const source = fs.readFileSync(new URL('../apps/SecretPlace/SecretPlace.js', import.meta.url), 'utf8');
  const method = source.slice(source.indexOf('async Xiuxianstate(e) {'), source.indexOf('  //秘境地点'));
  let action;
  const dependencies = {
    verc: () => true,
    channel: async id => id,
    Read_player: async () => ({ 名号: '测试', power_place: '遮天位面' }),
    getLocationName: value => value,
    formatTime: value => String(value),
    redis: { get: async key => key.endsWith(':fashan') ? null : JSON.stringify(action) },
  };
  const app = new (new Function(...Object.keys(dependencies), `return class { ${method} }`)(...Object.values(dependencies)))();
  const future = Date.now() + 140 * 60_000;
  for (const [flags, expected] of [
    [{ Place_actionplus: '1', Place_action: 1, settled_count: 40 }, '真身沉迷行动已结束'],
    [{ Place_actionplus: 1, Place_action: '1', settled_count: 40 }, '真身沉迷行动已结束'],
    [{ Place_actionplus: '0', Place_action: '1', settled_count: 3 }, '真身正在沉迷【岁云殿堂】'],
    [{ Place_actionplus: 0, Place_action: '1', settled_count: 3 }, '真身正在沉迷【岁云殿堂】'],
    [{ Place_actionplus: '1', Place_action: '0', settled_count: 40 }, '真身正在镇守仙境中'],
    [{ Place_actionplus: '1', Place_action: '1', total_count: undefined, settled_count: undefined,
      action: '闭关' }, '真身正在闭关中'],
  ]) {
    action = { action: '镇守仙境', total_count: 40, start_time: Date.now(), total_time: 140,
      end_time: future, next_settle_time: future, Place_address: { name: '岁云殿堂' }, ...flags };
    let reply;
    await app.Xiuxianstate({ user_id: 'test', reply: value => { reply = value; } });
    assert.ok(reply.includes(expected), reply);
    if (expected === '真身沉迷行动已结束') assert.ok(!reply.includes('剩余时间'), reply);
  }
});

test('同一玩家的秘境结算在进程内串行执行', async () => {
  const redis = createRedis();
  let active = true;
  let payouts = 0;
  const settle = () => withSecretPlaceSettlementLock('10001', async () => {
    if (!active) return false;
    await new Promise(resolve => setTimeout(resolve, 5));
    active = false;
    payouts++;
    return true;
  }, { redisClient: redis, ttlSeconds: 30 });

  const results = await Promise.all([settle(), settle()]);
  assert.deepEqual(results, [true, false]);
  assert.equal(payouts, 1);
  assert.equal(await redis.get(getSecretPlaceSettlementLockKey('10001')), null);
});

test('外部进程持有秘境锁时返回忙状态', async () => {
  const redis = createRedis();
  redis.values.set(getSecretPlaceSettlementLockKey('10001'), 'other-worker');
  let called = false;
  const result = await withSecretPlaceSettlementLock('10001', async () => {
    called = true;
  }, { redisClient: redis });

  assert.equal(result, SECRET_PLACE_SETTLEMENT_BUSY);
  assert.equal(called, false);
});

test('秘境物品历史记录失败不会打断奖励主流程', async () => {
  const redis = createRedis(new Map([
    ['xiuxian:player:10001:addiction_history', '{broken-json'],
  ]));
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(await recordSecretPlaceItemToHistory(redis, '10001', '白毫', '仙宠', 1), false);
  } finally {
    console.error = originalError;
  }

  redis.values.set('xiuxian:player:10001:addiction_history', JSON.stringify({ items_gained: [] }));
  assert.equal(await recordSecretPlaceItemToHistory(redis, '10001', '白毫', '仙宠', 1), true);
  const history = JSON.parse(redis.values.get('xiuxian:player:10001:addiction_history'));
  assert.deepEqual(history.items_gained, [{ name: '白毫', class: '仙宠', count: 1 }]);
});
