import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateLegacyPlayerActionKey } from '../utils/playerActionKey.js';

function createRedis(entries, ttlEntries = []) {
  const values = new Map(entries);
  const ttls = new Map(ttlEntries);
  return {
    values,
    ttls,
    evalCalls: [],
    async get(key) { return values.get(key) ?? null; },
    async pTTL(key) {
      if (!values.has(key)) return -2;
      return ttls.get(key) ?? -1;
    },
    async eval(script, { keys }) {
      this.evalCalls.push({ script, keys });
      const [canonicalKey, ...legacyKeys] = keys;
      if (values.has(canonicalKey)) {
        for (const legacyKey of legacyKeys) {
          values.delete(legacyKey);
          ttls.delete(legacyKey);
        }
        return 0;
      }

      let migrated = 0;
      for (const legacyKey of legacyKeys) {
        if (!values.has(legacyKey)) continue;
        const ttl = ttls.get(legacyKey) ?? -1;
        if (migrated === 0 && (ttl > 0 || ttl === -1)) {
          values.set(canonicalKey, values.get(legacyKey));
          if (ttl > 0) ttls.set(canonicalKey, ttl);
          else ttls.delete(canonicalKey);
          migrated = 1;
        }
        values.delete(legacyKey);
        ttls.delete(legacyKey);
      }
      return migrated;
    },
  };
}

test('带 qg 前缀的频道别名行动键迁移到归一化玩家键并保留剩余时限', async () => {
  const legacyKey = 'xiuxian:player:qg_CHANNEL_ID:action';
  const canonicalKey = 'xiuxian:player:10001:action';
  const raw = '{"action":"投影诸天"}';
  const redis = createRedis([[legacyKey, raw]], [[legacyKey, 45_000]]);

  const result = await migrateLegacyPlayerActionKey(redis, '10001', 'qg_CHANNEL_ID');
  assert.deepEqual(result, { key: canonicalKey, migrated: true });
  assert.equal(redis.values.get(canonicalKey), raw);
  assert.equal(redis.values.has(legacyKey), false);
  assert.equal(await redis.pTTL(canonicalKey), 45_000);
  assert.equal(redis.evalCalls.length, 1);
});

test('迁移时已经到期的旧行动不会在归一化键上复活', async () => {
  const legacyKey = 'xiuxian:player:qg_EXPIRED:action';
  const canonicalKey = 'xiuxian:player:10002:action';
  const redis = createRedis(
    [[legacyKey, '{"action":"投影诸天","billingId":"expired"}']],
    [[legacyKey, -2]],
  );

  const result = await migrateLegacyPlayerActionKey(redis, '10002', 'qg_EXPIRED');
  assert.deepEqual(result, { key: canonicalKey, migrated: false });
  assert.equal(redis.values.has(canonicalKey), false);
  assert.equal(redis.values.has(legacyKey), false);
});

test('无过期时间的旧行动迁移后仍保持永久', async () => {
  const legacyKey = 'xiuxian:player:qg_PERSISTENT:action';
  const canonicalKey = 'xiuxian:player:10003:action';
  const raw = '{"action":"投影诸天","billingId":"persistent"}';
  const redis = createRedis([[legacyKey, raw]], [[legacyKey, -1]]);

  const result = await migrateLegacyPlayerActionKey(redis, '10003', 'qg_PERSISTENT');
  assert.deepEqual(result, { key: canonicalKey, migrated: true });
  assert.equal(redis.values.get(canonicalKey), raw);
  assert.equal(await redis.pTTL(canonicalKey), -1);
  assert.equal(redis.values.has(legacyKey), false);
});

test('归一化行动已存在时以其为准并清理陈旧旧键', async () => {
  const legacyKey = 'xiuxian:player:qg_CONFLICT:action';
  const canonicalKey = 'xiuxian:player:10004:action';
  const current = '{"action":"投影诸天","billingId":"current"}';
  const stale = '{"action":"投影诸天","billingId":"stale"}';
  const redis = createRedis([[canonicalKey, current], [legacyKey, stale]]);

  const result = await migrateLegacyPlayerActionKey(redis, '10004', 'qg_CONFLICT');
  assert.deepEqual(result, { key: canonicalKey, migrated: false });
  assert.equal(redis.values.get(canonicalKey), current);
  assert.equal(redis.values.has(legacyKey), false);
});

test('多个旧别名原子收敛到一个归一化行动键', async () => {
  const prefixedKey = 'xiuxian:player:qg_ALIAS:action';
  const strippedKey = 'xiuxian:player:ALIAS:action';
  const canonicalKey = 'xiuxian:player:10005:action';
  const first = '{"action":"投影诸天","billingId":"first"}';
  const second = '{"action":"投影诸天","billingId":"second"}';
  const redis = createRedis([[prefixedKey, first], [strippedKey, second]]);

  const result = await migrateLegacyPlayerActionKey(redis, '10005', 'qg_ALIAS');
  assert.deepEqual(result, { key: canonicalKey, migrated: true });
  assert.equal(redis.values.get(canonicalKey), first);
  assert.equal(redis.values.has(prefixedKey), false);
  assert.equal(redis.values.has(strippedKey), false);
});
