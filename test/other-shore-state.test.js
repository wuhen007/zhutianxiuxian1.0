import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANG_LAN_WORLD_STATE_KEY,
  deliverOtherShorePlayerMutation,
  deliverOtherShorePlayerMutations,
  ensureOtherShoreWorldState,
  readOtherShoreWorldState,
  updateOtherShoreWorldState,
} from '../model/otherShoreState.js';

function createRedis() {
  const values = new Map();
  return {
    values,
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value, options = {}) {
      if (options.NX && values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    },
    async del(key) {
      return values.delete(key) ? 1 : 0;
    },
    async eval(_script, { keys, arguments: args }) {
      if (values.get(keys[0]) !== args[0]) return 0;
      if (keys.length === 2 && args.length === 2) {
        values.set(keys[1], args[1]);
        return 1;
      }
      return values.delete(keys[0]) ? 1 : 0;
    },
  };
}

test('沧澜共享文档首次读取时建立永久世界状态', async () => {
  const redis = createRedis();
  const created = await ensureOtherShoreWorldState(redis, () => ({ version: 1, visits: 0 }));
  assert.deepEqual(created, { version: 1, visits: 0 });
  assert.deepEqual(await readOtherShoreWorldState(redis), created);
  assert.ok(redis.values.has(CANG_LAN_WORLD_STATE_KEY));
});

test('沧澜共享文档并发推进不会覆盖其他修士的探索贡献', async () => {
  const redis = createRedis();
  const create = () => ({ version: 1, visits: 0 });
  await Promise.all(Array.from({ length: 12 }, () =>
    updateOtherShoreWorldState(redis, create, document => {
      document.visits = Math.max(0, Number(document.visits) || 0) + 1;
    })
  ));
  assert.equal((await readOtherShoreWorldState(redis)).visits, 12);
});

test('损坏的沧澜共享文档会从版本化初始星图恢复', async () => {
  const redis = createRedis();
  redis.values.set(CANG_LAN_WORLD_STATE_KEY, '{broken');
  const result = await updateOtherShoreWorldState(
    redis,
    () => ({ version: 1, recovered: false }),
    document => {
      document.recovered = true;
      return 'saved';
    },
  );
  assert.equal(result.value, 'saved');
  assert.deepEqual(await readOtherShoreWorldState(redis), { version: 1, recovered: true });
});

test('玩家写盘失败时保留全服待投递回执并可由同一动作恢复', async () => {
  const redis = createRedis();
  const create = () => ({ version: 1 });
  const mutationKey = 'player-1:run-1:move:1,0';
  await updateOtherShoreWorldState(redis, create, document => {
    document.pendingPlayerMutations = {
      [mutationKey]: {
        id: 'receipt-1',
        message: '移动完成',
        playerPatch: { 心神: 9 },
      },
    };
  });

  await assert.rejects(
    deliverOtherShorePlayerMutation(redis, create, mutationKey, async () => {
      throw new Error('disk unavailable');
    }),
    /disk unavailable/,
  );
  assert.equal(
    (await readOtherShoreWorldState(redis)).pendingPlayerMutations[mutationKey].id,
    'receipt-1',
  );

  let deliveredPatch = null;
  const delivered = await deliverOtherShorePlayerMutation(
    redis,
    create,
    mutationKey,
    async receipt => {
      deliveredPatch = receipt.playerPatch;
    },
  );
  assert.equal(delivered.message, '移动完成');
  assert.deepEqual(deliveredPatch, { 心神: 9 });
  assert.equal((await readOtherShoreWorldState(redis)).pendingPlayerMutations, undefined);
});

test('同一远征的多个玩家回执严格按提交时间恢复', async () => {
  const redis = createRedis();
  const create = () => ({ version: 1 });
  await updateOtherShoreWorldState(redis, create, document => {
    document.pendingPlayerMutations = {
      'player-1:run-1:move:2,0': { id: 'second', createdAt: 20, playerPatch: { 心神: 8 } },
      'player-1:run-1:move:1,0': { id: 'first', createdAt: 10, playerPatch: { 心神: 9 } },
      'player-2:run-1:move:1,0': { id: 'other', createdAt: 5, playerPatch: { 心神: 7 } },
    };
  });
  const order = [];
  const delivered = await deliverOtherShorePlayerMutations(
    redis,
    create,
    key => key.startsWith('player-1:run-1:'),
    async receipt => order.push(receipt.id),
  );
  assert.deepEqual(order, ['first', 'second']);
  assert.deepEqual(delivered.map(receipt => receipt.id), ['first', 'second']);
  assert.deepEqual(
    Object.keys((await readOtherShoreWorldState(redis)).pendingPlayerMutations),
    ['player-2:run-1:move:1,0'],
  );
});
