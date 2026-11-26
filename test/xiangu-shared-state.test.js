import assert from 'node:assert/strict';
import test from 'node:test';

import {
  XIANGU_SHARED_STATE_MAX_TTL_SECONDS,
  XIANGU_SHARED_STATE_MIN_TTL_SECONDS,
  XIANGU_SHARED_STATE_TTL_SECONDS,
  claimXianguUniqueTreasure,
  getDeadXianguNpcIds,
  getXianguNpcDeath,
  getXianguSharedStateKey,
  getXianguUniqueTreasureClaim,
  markXianguNpcDead,
  readXianguSharedDocument,
  resolveXianguSharedStateTtl,
  updateXianguSharedDocument,
} from '../apps/SecretPlace/xianguSharedState.js';

function createRedis(values = new Map()) {
  const ttlValues = new Map();
  const setCalls = [];
  const expireCalls = [];
  return {
    ttlValues,
    setCalls,
    expireCalls,
    async set(key, value, options) {
      if (options?.NX && values.has(key)) return null;
      values.set(key, value);
      setCalls.push({ key, value, options });
      if (Number.isFinite(Number(options?.EX))) ttlValues.set(key, Number(options.EX));
      return 'OK';
    },
    async get(key) {
      return values.get(key) ?? null;
    },
    async del(key) {
      ttlValues.delete(key);
      return values.delete(key) ? 1 : 0;
    },
    async ttl(key) {
      if (!values.has(key)) return -2;
      return ttlValues.get(key) ?? -1;
    },
    async expire(key, seconds) {
      expireCalls.push({ key, seconds });
      if (!values.has(key)) return 0;
      ttlValues.set(key, Number(seconds));
      return 1;
    },
  };
}

const treasureScope = {
  worldSeed: 'flower-2026',
  fragmentId: 'xiangu_core',
  entityId: '玉石匣·仙王经文',
};

test('同一轮同一碎片的唯一造化只有一个领取者', async () => {
  const redis = createRedis();
  const [first, second] = await Promise.all([
    claimXianguUniqueTreasure(redis, treasureScope, { id: '10001', name: '荒' }, 100),
    claimXianguUniqueTreasure(redis, treasureScope, { id: '10002', name: '谪仙' }, 101),
  ]);
  const results = [first, second];
  const winner = results.find(result => result.claimed);
  const loser = results.find(result => !result.claimed);

  assert.equal(results.filter(result => result.claimed).length, 1);
  assert.equal(loser.record.claimantId, winner.record.claimantId);
  assert.equal(loser.record.claimantName, winner.record.claimantName);
  assert.deepEqual(await getXianguUniqueTreasureClaim(redis, treasureScope), winner.record);
});

test('世界种子、碎片或实体不同则互不占用', async () => {
  const redis = createRedis();
  const claimant = { id: '10001', name: '荒' };
  const scopes = [
    treasureScope,
    { ...treasureScope, worldSeed: 'flower-2027' },
    { ...treasureScope, fragmentId: 'void_rift' },
    { ...treasureScope, entityId: '一滴帝血' },
  ];

  for (const scope of scopes) {
    assert.equal((await claimXianguUniqueTreasure(redis, scope, claimant)).claimed, true);
  }
  assert.equal(new Set(scopes.map(scope => getXianguSharedStateKey('treasure', scope))).size, 4);
});

test('NPC死亡由首位击杀者原子标记并可批量过滤', async () => {
  const redis = createRedis();
  const scope = { worldSeed: 'flower-2026', fragmentId: 'ancient_ruins', entityId: 'ning_chuan' };

  assert.deepEqual(await markXianguNpcDead(redis, scope, { id: '10001', name: '荒' }, 200), {
    marked: true,
    death: { claimantId: '10001', claimantName: '荒', claimedAt: 200 },
  });
  assert.deepEqual(await markXianguNpcDead(redis, scope, { id: '10002', name: '石毅' }, 201), {
    marked: false,
    death: { claimantId: '10001', claimantName: '荒', claimedAt: 200 },
  });
  assert.deepEqual(await getDeadXianguNpcIds(redis, scope, ['ning_chuan', 'ten_crown_king']), ['ning_chuan']);
});

test('共享记录保存在Redis，进程重建后仍能读取', async () => {
  const persisted = new Map();
  const beforeRestart = createRedis(persisted);
  const afterRestart = createRedis(persisted);
  const scope = { worldSeed: 'flower-2026', fragmentId: 'void_rift', entityId: 'exiled_immortal' };

  await markXianguNpcDead(beforeRestart, scope, { id: '10003', name: '十冠王' }, 300);
  assert.deepEqual(await getXianguNpcDeath(afterRestart, scope), {
    claimantId: '10003',
    claimantName: '十冠王',
    claimedAt: 300,
  });
});

test('共享领取、死亡标记和文档都会写入受限且可配置的TTL', async () => {
  const redis = createRedis();
  const npcScope = { ...treasureScope, entityId: 'ning_chuan' };
  const documentScope = { ...treasureScope, entityId: 'round-state' };

  await claimXianguUniqueTreasure(
    redis,
    treasureScope,
    { id: '10001', name: '荒' },
    100,
    { ttlSeconds: 321 },
  );
  await markXianguNpcDead(
    redis,
    npcScope,
    { id: '10001', name: '荒' },
    100,
    { ttlSeconds: 1 },
  );
  await updateXianguSharedDocument(redis, documentScope, document => {
    document.ready = true;
  }, { ttlSeconds: XIANGU_SHARED_STATE_MAX_TTL_SECONDS + 1 });

  assert.equal(
    await redis.ttl(getXianguSharedStateKey('treasure', treasureScope)),
    321,
  );
  assert.equal(
    await redis.ttl(getXianguSharedStateKey('npc-death', npcScope)),
    XIANGU_SHARED_STATE_MIN_TTL_SECONDS,
  );
  assert.equal(
    await redis.ttl(getXianguSharedStateKey('document', documentScope)),
    XIANGU_SHARED_STATE_MAX_TTL_SECONDS,
  );
  assert.equal(resolveXianguSharedStateTtl({ ttlSeconds: 0 }), XIANGU_SHARED_STATE_TTL_SECONDS);
});

test('旧的无TTL共享记录在读取时补过期，但已有TTL不会被续期', async () => {
  const values = new Map();
  const redis = createRedis(values);
  const treasureKey = getXianguSharedStateKey('treasure', treasureScope);
  const documentScope = { ...treasureScope, entityId: 'legacy-document' };
  const documentKey = getXianguSharedStateKey('document', documentScope);
  values.set(treasureKey, JSON.stringify({ claimantId: '10001', claimantName: '荒', claimedAt: 100 }));
  values.set(documentKey, JSON.stringify({ ready: true }));

  assert.equal((await getXianguUniqueTreasureClaim(redis, treasureScope, { ttlSeconds: 222 })).claimantId, '10001');
  assert.deepEqual(await readXianguSharedDocument(redis, documentScope, { ttlSeconds: 333 }), { ready: true });
  assert.equal(await redis.ttl(treasureKey), 222);
  assert.equal(await redis.ttl(documentKey), 333);
  assert.equal(redis.expireCalls.length, 2);

  await getXianguUniqueTreasureClaim(redis, treasureScope, { ttlSeconds: 999 });
  await readXianguSharedDocument(redis, documentScope, { ttlSeconds: 999 });
  assert.equal(redis.expireCalls.length, 2);
});

test('共享键拒绝空作用域并转义分隔符', () => {
  assert.throws(() => getXianguSharedStateKey('treasure', {}), /worldSeed不能为空/);
  assert.match(getXianguSharedStateKey('treasure', {
    worldSeed: 'round:1', fragmentId: 'core/a', entityId: '帝血:唯一',
  }), /round%3A1:core%2Fa:treasure:/);
});

test('共享文档并发更新不会丢失NPC进度', async () => {
  const redis = createRedis();
  const scope = { worldSeed: 'flower-2026', fragmentId: 'world', entityId: 'npc-state' };

  await Promise.all(Array.from({ length: 12 }, () =>
    updateXianguSharedDocument(redis, scope, document => {
      document.progress = (Number(document.progress) || 0) + 1;
    })
  ));

  assert.deepEqual(await readXianguSharedDocument(redis, scope), { progress: 12 });
});

test('共享文档损坏时从空对象恢复', async () => {
  const values = new Map();
  const redis = createRedis(values);
  const scope = { worldSeed: 'flower-2026', fragmentId: 'world', entityId: 'npc-state' };
  values.set(getXianguSharedStateKey('document', scope), '{broken');

  const result = await updateXianguSharedDocument(redis, scope, document => {
    document.ready = true;
    return 'saved';
  });

  assert.equal(result.value, 'saved');
  assert.deepEqual(await readXianguSharedDocument(redis, scope), { ready: true });
});

test('认领记录携带轮次元数据且不影响既有结构', async () => {
  const redis = createRedis();
  const scope = { worldSeed: 'eternal', fragmentId: 'unique', entityId: '一滴帝血' };
  const claimed = await claimXianguUniqueTreasure(
    redis,
    scope,
    { id: '10001', name: '荒' },
    500,
    { meta: { roundSeed: 'round-A' } },
  );
  assert.equal(claimed.claimed, true);
  assert.equal(claimed.record.roundSeed, 'round-A');
  // 不带 meta 的既有调用不产生多余字段
  const plain = await claimXianguUniqueTreasure(
    redis,
    { worldSeed: 'flower-2026', fragmentId: 'xiangu_core', entityId: '大罗剑胎' },
    { id: '10002', name: '谪仙' },
    501,
  );
  assert.equal(plain.record.roundSeed, undefined);
});

test('永久唯一范围跨轮次、跨玩家不可重复获得', async () => {
  const redis = createRedis();
  const scope = { worldSeed: 'eternal', fragmentId: 'unique', entityId: '玉石匣·仙王经文' };
  const first = await claimXianguUniqueTreasure(
    redis,
    scope,
    { id: '10001', name: '荒' },
    600,
    { meta: { roundSeed: 'round-A' } },
  );
  assert.equal(first.claimed, true);

  // 他人（同轮/异轮）再取：拒绝
  const other = await claimXianguUniqueTreasure(
    redis,
    scope,
    { id: '10002', name: '石毅' },
    601,
    { meta: { roundSeed: 'round-A' } },
  );
  assert.equal(other.claimed, false);
  assert.equal(other.record.claimantId, '10001');

  // 本人跨轮次再取：拒绝（认领记录保留首发轮次）
  const selfLater = await claimXianguUniqueTreasure(
    redis,
    scope,
    { id: '10001', name: '荒' },
    602,
    { meta: { roundSeed: 'round-B' } },
  );
  assert.equal(selfLater.claimed, false);
  assert.equal(selfLater.record.roundSeed, 'round-A');
  assert.deepEqual(await getXianguUniqueTreasureClaim(redis, scope), {
    claimantId: '10001',
    claimantName: '荒',
    claimedAt: 600,
    roundSeed: 'round-A',
  });
});
