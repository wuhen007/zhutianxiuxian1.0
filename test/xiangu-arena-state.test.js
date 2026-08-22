import assert from 'node:assert/strict';
import test from 'node:test';

import {
  closeXianguArena,
  getXianguArenaBattleGate,
  joinXianguArena,
  readXianguArenaState,
  recordXianguArenaBattleWin,
  startXianguArena,
} from '../apps/SecretPlace/xianguArenaState.js';

function createRedis(values = new Map()) {
  return {
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
  };
}

test('擂台开启、报名和胜场在进程重建后仍保留', async () => {
  const values = new Map();
  const beforeRestart = createRedis(values);
  const afterRestart = createRedis(values);
  const roundId = 'round-2026';

  const started = await startXianguArena(beforeRestart, {
    roundId,
    playerId: '10001',
    playerName: '荒',
    now: 1000,
    duration: 3000,
    cooldown: 5000,
    desc: '擂台开启',
  });
  assert.equal(started.status, 'started');

  await joinXianguArena(beforeRestart, {
    roundId,
    playerId: '10002',
    playerName: '石毅',
    now: 1100,
  });
  assert.equal((await recordXianguArenaBattleWin(beforeRestart, {
    roundId,
    winnerId: '10001',
    loserId: '10002',
    now: 1200,
  })).recorded, true);

  const restored = await readXianguArenaState(afterRestart, roundId);
  assert.equal(restored.activeEvent.location, '擂台区域');
  assert.equal(restored.participants.length, 2);
  assert.equal(restored.participants[0].wins, 1);
});

test('擂台只接受已报名双方，同一胜者不能重复刷同一对手', async () => {
  const redis = createRedis();
  const roundId = 'round-a';
  await startXianguArena(redis, {
    roundId,
    playerId: '1',
    playerName: '甲',
    now: 100,
    duration: 1000,
  });

  const state = await readXianguArenaState(redis, roundId);
  assert.equal(getXianguArenaBattleGate(state, '1', '2', 200).ok, false);
  await joinXianguArena(redis, { roundId, playerId: '2', playerName: '乙', now: 200 });
  assert.equal(getXianguArenaBattleGate(await readXianguArenaState(redis, roundId), '1', '2', 200).ok, true);

  const [first, repeated] = await Promise.all([
    recordXianguArenaBattleWin(redis, { roundId, winnerId: '1', loserId: '2', now: 300 }),
    recordXianguArenaBattleWin(redis, { roundId, winnerId: '1', loserId: '2', now: 301 }),
  ]);
  assert.equal([first, repeated].filter(result => result.recorded).length, 1);
  assert.equal((await readXianguArenaState(redis, roundId)).participants[0].wins, 1);
});

test('擂台到期后只结算一次，不同轮次互不复用名单', async () => {
  const redis = createRedis();
  await startXianguArena(redis, {
    roundId: 'round-old',
    playerId: '1',
    playerName: '旧冠王',
    now: 100,
    duration: 100,
  });
  assert.equal(await closeXianguArena(redis, 'round-old', 150), null);
  const settlement = await closeXianguArena(redis, 'round-old', 200);
  assert.equal(settlement.participants[0].name, '旧冠王');
  assert.equal(await closeXianguArena(redis, 'round-old', 201), null);
  assert.equal((await readXianguArenaState(redis, 'round-old')).activeEvent, null);
  assert.deepEqual((await readXianguArenaState(redis, 'round-new')).participants, []);
});
