import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acquireRedisLock,
  commitClaimWithRollback,
  migrateDropToBaodi,
  releaseRedisLock,
} from '../apps/SecretPlace/xianyiBaodiState.js';

function createLockRedis() {
  const locks = new Map();
  return {
    async set(key, token, options) {
      if (options?.NX && locks.has(key)) return null;
      locks.set(key, token);
      return 'OK';
    },
    async eval(_script, { keys, arguments: args }) {
      if (locks.get(keys[0]) !== args[0]) return 0;
      locks.delete(keys[0]);
      return 1;
    },
  };
}

test('仙遗宝地锁只允许一个操作进入且只能由持有者释放', async () => {
  const redis = createLockRedis();
  const key = 'lock:baodi:1';

  assert.equal(await acquireRedisLock(redis, key, 'token-a'), true);
  assert.equal(await acquireRedisLock(redis, key, 'token-b'), false);
  assert.equal(await releaseRedisLock(redis, key, 'token-b'), 0);
  assert.equal(await acquireRedisLock(redis, key, 'token-b'), false);
  assert.equal(await releaseRedisLock(redis, key, 'token-a'), 1);
  assert.equal(await acquireRedisLock(redis, key, 'token-b'), true);
});

test('宝地保存失败时恢复领取者原纳戒', async () => {
  const originalNajie = { 灵石: 10 };
  const mergedNajie = { 灵石: 110 };
  const writes = [];

  await assert.rejects(
    commitClaimWithRollback({
      originalNajie,
      mergedNajie,
      writeNajie: async najie => writes.push(structuredClone(najie)),
      commitBaodi: async () => { throw new Error('redis unavailable'); },
    }),
    /redis unavailable/
  );

  assert.deepEqual(writes, [mergedNajie, originalNajie]);
});

test('掉落迁移遇到已有宝地时保留原宝地且不标记为新建', async () => {
  const existing = { id: 'baodi_1', discovered: { 灵石: 50 } };
  let evalArgs;
  const redis = {
    async eval(_script, args) {
      evalArgs = args;
      return [0, JSON.stringify(existing)];
    },
  };

  const result = await migrateDropToBaodi(redis, {
    baodiKey: 'baodi:key',
    baodiIndexKey: 'baodi:index',
    dropKey: 'drop:key',
    dropIndexKey: 'drop:index',
    baodi: { id: 'baodi_1', discovered: { 灵石: 0 }, createdAt: 123 },
    ttlSeconds: 60,
  });

  assert.deepEqual(evalArgs.keys, ['baodi:key', 'baodi:index', 'drop:key', 'drop:index']);
  assert.deepEqual(result, { baodi: existing, created: false });
});

test('源掉落已被捡取时不再创建仙遗宝地', async () => {
  const redis = { async eval() { return [-1, '']; } };
  const result = await migrateDropToBaodi(redis, {
    baodiKey: 'baodi:key',
    baodiIndexKey: 'baodi:index',
    dropKey: 'drop:key',
    dropIndexKey: 'drop:index',
    baodi: { id: 'baodi_1', createdAt: 123 },
    ttlSeconds: 60,
  });

  assert.equal(result, null);
});
