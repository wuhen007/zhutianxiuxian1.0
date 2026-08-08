import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getXianguInstancePresence,
  getXianguPresenceSnapshot,
  removeXianguPresence,
  upsertXianguPresence,
} from '../apps/SecretPlace/xianguPresence.js';

function createRedis() {
  const values = new Map();
  const sets = new Map();
  return {
    values,
    sets,
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value) {
      values.set(key, value);
      return 'OK';
    },
    async del(key) {
      return values.delete(key) ? 1 : 0;
    },
    async expire() {
      return 1;
    },
    async sAdd(key, value) {
      const set = sets.get(key) || new Set();
      set.add(String(value));
      sets.set(key, set);
      return 1;
    },
    async sRem(key, value) {
      return sets.get(key)?.delete(String(value)) ? 1 : 0;
    },
    async sMembers(key) {
      return [...(sets.get(key) || [])];
    },
  };
}

function player(fragmentId = 'edge_camp', instanceId = 'round:edge') {
  return {
    in_xiangu: true,
    xiangu_world_seed: 'round-1',
    xiangu_realm_map: {
      fragmentId,
      instanceId,
      playerPos: { x: 4, y: 5 },
    },
  };
}

test('秘境坐标按世界、碎片和实例隔离', async () => {
  const redis = createRedis();
  const first = getXianguPresenceSnapshot(player(), '10001', 1);
  const secondPlayer = player();
  secondPlayer.xiangu_realm_map.playerPos = { x: 5, y: 5 };
  const second = getXianguPresenceSnapshot(secondPlayer, '10002', 2);
  const elsewhere = getXianguPresenceSnapshot(player('spirit_lake', 'round:lake'), '10003', 3);

  await Promise.all([
    upsertXianguPresence(redis, first),
    upsertXianguPresence(redis, second),
    upsertXianguPresence(redis, elsewhere),
  ]);

  assert.deepEqual(
    (await getXianguInstancePresence(redis, first, { excludeId: '10001' })).map(entry => entry.id),
    ['10002'],
  );
});

test('切换碎片会从旧坐标索引移除，并且相邻查询遵守距离', async () => {
  const redis = createRedis();
  const origin = getXianguPresenceSnapshot(player(), '10001', 1);
  const nearbyPlayer = player();
  nearbyPlayer.xiangu_realm_map.playerPos = { x: 5, y: 5 };
  const nearby = getXianguPresenceSnapshot(nearbyPlayer, '10002', 2);
  const farPlayer = player();
  farPlayer.xiangu_realm_map.playerPos = { x: 9, y: 9 };
  const far = getXianguPresenceSnapshot(farPlayer, '10003', 3);

  await Promise.all([
    upsertXianguPresence(redis, origin),
    upsertXianguPresence(redis, nearby),
    upsertXianguPresence(redis, far),
  ]);
  assert.deepEqual(
    (await getXianguInstancePresence(redis, origin, { excludeId: '10001', maxDistance: 1 }))
      .map(entry => entry.id),
    ['10002'],
  );

  const moved = getXianguPresenceSnapshot(player('spirit_lake', 'round:lake'), '10002', 4);
  await upsertXianguPresence(redis, moved);
  assert.deepEqual(
    (await getXianguInstancePresence(redis, origin, { excludeId: '10001' })).map(entry => entry.id),
    ['10003'],
  );
});

test('撤离会移除玩家的实时坐标', async () => {
  const redis = createRedis();
  const snapshot = getXianguPresenceSnapshot(player(), '10001', 1);
  await upsertXianguPresence(redis, snapshot);
  await removeXianguPresence(redis, '10001');
  assert.deepEqual(await getXianguInstancePresence(redis, snapshot), []);
});
