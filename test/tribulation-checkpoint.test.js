import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTribulationCheckpoint,
  getTribulationCheckpoint,
  recoverTribulationCheckpoint,
  settleTribulationCheckpoint,
  tribulationCheckpointKey,
} from '../model/tribulationCheckpoint.js';
import { tribulationLockKey, withTribulationLock } from '../model/tribulationLock.js';

class MemoryRedis {
  constructor() {
    this.values = new Map();
    this.ttls = new Map();
    this.failCheckpointDelete = 0;
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async set(key, value, options = {}) {
    if (options.NX && this.values.has(key)) return null;
    this.values.set(key, value);
    this.ttls.set(key, Number.isFinite(Number(options.EX)) ? Number(options.EX) : -1);
    return 'OK';
  }

  async incr(key) {
    const current = this.values.get(key) ?? '0';
    if (!/^\d+$/.test(String(current))) throw new Error('ERR value is not an integer');
    const next = String(Number(current) + 1);
    this.values.set(key, next);
    this.ttls.set(key, -1);
    return next;
  }

  async eval(script, { keys, arguments: args }) {
    if (script.includes('tribulation-checkpoint:create')) {
      if (this.values.get(keys[0]) !== args[0]) return -1;
      if (this.values.has(keys[1])) return 0;
      this.values.set(keys[1], args[1]);
      this.ttls.set(keys[1], -1);
      return 1;
    }
    if (script.includes('tribulation-checkpoint:compare-and-set')) {
      if (this.values.get(keys[0]) !== args[0]) return -1;
      if (this.values.get(keys[1]) !== args[1]) return 0;
      this.values.set(keys[1], args[2]);
      return 1;
    }
    if (script.includes('tribulation-checkpoint:compare-and-delete')) {
      if (this.failCheckpointDelete > 0) {
        this.failCheckpointDelete -= 1;
        throw new Error('simulated Redis delete outage');
      }
      if (this.values.get(keys[0]) !== args[0]) return -1;
      if (this.values.get(keys[1]) !== args[1]) return 0;
      this.values.delete(keys[1]);
      this.ttls.delete(keys[1]);
      return 1;
    }

    if (script.includes('tribulation-lock:acquire')) {
      const revision = this.values.get(keys[2]) ?? '0';
      if (!/^\d+$/.test(String(revision))) return [-2, revision];
      if (this.values.has(keys[0])) return [0, revision];
      if (this.values.has(keys[1])) return [-1, revision];
      const next = await this.incr(keys[2]);
      this.values.set(keys[0], args[0]);
      this.ttls.set(keys[0], Number(args[1]));
      return [1, next];
    }
    if (script.includes('tribulation-lock:release')) {
      if (this.values.get(keys[0]) !== args[0]) {
        return [0, this.values.get(keys[1]) ?? '0'];
      }
      this.values.delete(keys[0]);
      this.ttls.delete(keys[0]);
      const next = await this.incr(keys[1]);
      return [1, next];
    }
    if (script.includes('tribulation-lock:renew')) {
      if (this.values.get(keys[0]) !== args[0]) return 0;
      this.ttls.set(keys[0], Number(args[1]));
      return 1;
    }
    if (script.includes('tribulation-lock:verify')) {
      return this.values.get(keys[0]) === args[0] ? 1 : 0;
    }

    const key = keys[0];
    if (script.includes('tribulation-lock:inspect')) {
      if (!this.values.has(key)) return [0, '', -2];
      return [1, this.values.get(key), this.ttls.get(key) ?? -1];
    }
    if (this.values.get(key) !== args[0]) return 0;
    if (script.includes("redis.call('del'")) {
      this.values.delete(key);
      this.ttls.delete(key);
      return 1;
    }
    if (script.includes("redis.call('expire'")) {
      this.ttls.set(key, Number(args[1]));
      return 1;
    }
    throw new Error('Unsupported Redis script in test');
  }
}

async function runLocked(playerId, action) {
  return withTribulationLock(playerId, action);
}

test('中断恢复会按装备再玩家的顺序精确还原完整基线', async () => {
  const previousRedis = globalThis.redis;
  const mock = new MemoryRedis();
  globalThis.redis = mock;
  const playerId = 'checkpoint-interrupted';
  const playerBaseline = {
    id: playerId,
    修为: 81_920_000_000,
    血气: 61_440_000_000,
    攻击: 19_876_543,
    防御: 12_345_678,
    当前血量: 55_000_000,
    nested: { buffs: ['baseline'] },
  };
  const equipmentBaseline = {
    武器: { name: '古剑', atk: 1234 },
    帝兵: { name: '帝钟', atk: 8888, 全属性: 15 },
  };
  const najieBaseline = {
    道具: [{ name: '雷池真液', 数量: 5 }],
  };

  try {
    const created = await runLocked(playerId, () => createTribulationCheckpoint(
      playerId,
      playerBaseline,
      equipmentBaseline,
      { tribulation: '圣人王劫' },
      { najie: najieBaseline },
    ));
    assert.equal(created.created, true);
    assert.match(created.attemptId, /^[0-9a-f-]{36}$/);
    assert.equal(mock.ttls.get(tribulationCheckpointKey(playerId)), -1);

    playerBaseline.修为 -= 20_480_000_000;
    playerBaseline.血气 -= 20_480_000_000;
    playerBaseline.攻击 = 999_999_999;
    equipmentBaseline.帝兵.atk = 777_777;
    equipmentBaseline.帝兵.圣人王 = true;
    najieBaseline.道具[0].数量 = 0;

    const order = [];
    let restoredEquipment;
    await assert.rejects(
      () => runLocked(playerId, () => recoverTribulationCheckpoint(playerId, {
        restoreEquipment: async equipment => {
          order.push('equipment');
          restoredEquipment = equipment;
          equipment.帝兵.atk = -1;
        },
        restoreNajie: async () => {
          order.push('najie');
        },
        restorePlayer: async () => {
          order.push('player');
          throw new Error('player write interrupted');
        },
      })),
      /player write interrupted/,
    );
    assert.deepEqual(order, ['equipment', 'najie', 'player']);
    assert.equal(restoredEquipment.帝兵.圣人王, undefined);

    const interrupted = await getTribulationCheckpoint(playerId);
    assert.equal(interrupted.status, 'recovering');
    assert.equal(interrupted.recoverable, true);
    assert.equal(interrupted.recovery.attempts, 1);
    assert.deepEqual(interrupted.baseline.equipment, {
      武器: { name: '古剑', atk: 1234 },
      帝兵: { name: '帝钟', atk: 8888, 全属性: 15 },
    });

    let finalPlayer;
    let finalEquipment;
    let finalNajie;
    const retryOrder = [];
    const recovered = await runLocked(playerId, () => recoverTribulationCheckpoint(playerId, {
      restoreEquipment: async equipment => {
        retryOrder.push('equipment');
        finalEquipment = equipment;
      },
      restoreNajie: async najie => {
        retryOrder.push('najie');
        finalNajie = najie;
      },
      restorePlayer: async player => {
        retryOrder.push('player');
        finalPlayer = player;
      },
    }));
    assert.equal(recovered.status, 'recovered');
    assert.equal(recovered.recovered, true);
    assert.equal(recovered.cleaned, true);
    assert.deepEqual(retryOrder, ['equipment', 'najie', 'player']);
    assert.deepEqual(finalEquipment, {
      武器: { name: '古剑', atk: 1234 },
      帝兵: { name: '帝钟', atk: 8888, 全属性: 15 },
    });
    assert.deepEqual(finalNajie, {
      道具: [{ name: '雷池真液', 数量: 5 }],
    });
    assert.deepEqual(finalPlayer, {
      id: playerId,
      修为: 81_920_000_000,
      血气: 61_440_000_000,
      攻击: 19_876_543,
      防御: 12_345_678,
      当前血量: 55_000_000,
      nested: { buffs: ['baseline'] },
    });
    assert.equal((await getTribulationCheckpoint(playerId)).status, 'none');
  } finally {
    globalThis.redis = previousRedis;
  }
});

test('已结算检查点即使清理时崩溃也只清理而绝不回滚', async () => {
  const previousRedis = globalThis.redis;
  const mock = new MemoryRedis();
  globalThis.redis = mock;
  const playerId = 'checkpoint-settled';

  try {
    const created = await runLocked(playerId, () => createTribulationCheckpoint(
      playerId,
      { 修为: 100, 血气: 200, 攻击: 300 },
      { 帝兵: { atk: 10 } },
    ));
    mock.failCheckpointDelete = 1;
    await assert.rejects(
      () => runLocked(playerId, () => settleTribulationCheckpoint(
        playerId,
        created.attemptId,
        { result: 'success', nextLevel: 13 },
      )),
      /simulated Redis delete outage/,
    );

    const terminal = await getTribulationCheckpoint(playerId);
    assert.equal(terminal.status, 'settled');
    assert.deepEqual(terminal.outcome, { result: 'success', nextLevel: 13 });

    let callbackCount = 0;
    const cleanup = await runLocked(playerId, () => recoverTribulationCheckpoint(playerId, {
      restoreEquipment: async () => { callbackCount += 1; },
      restorePlayer: async () => { callbackCount += 1; },
    }));
    assert.equal(cleanup.status, 'settled');
    assert.equal(cleanup.recovered, false);
    assert.equal(cleanup.cleaned, true);
    assert.equal(callbackCount, 0);
    assert.equal((await getTribulationCheckpoint(playerId)).exists, false);
  } finally {
    globalThis.redis = previousRedis;
  }
});

test('创建和恢复都要求当前锁且原子拒绝错误锁令牌', async () => {
  const previousRedis = globalThis.redis;
  const mock = new MemoryRedis();
  globalThis.redis = mock;
  const playerId = 'checkpoint-lock-check';
  let callbackCount = 0;

  try {
    await assert.rejects(
      () => createTribulationCheckpoint(playerId, {}, {}),
      error => error?.code === 'TRIBULATION_LOCK_REQUIRED',
    );
    const created = await runLocked(playerId, () => createTribulationCheckpoint(playerId, {}, {}));
    await assert.rejects(
      () => recoverTribulationCheckpoint(playerId, {
        restoreEquipment: async () => { callbackCount += 1; },
        restorePlayer: async () => { callbackCount += 1; },
      }),
      error => error?.code === 'TRIBULATION_LOCK_REQUIRED',
    );

    await runLocked(playerId, async context => {
      const lockKey = tribulationLockKey(playerId);
      mock.values.set(lockKey, 'another-process-token');
      try {
        await assert.rejects(
          () => recoverTribulationCheckpoint(playerId, {
            restoreEquipment: async () => { callbackCount += 1; },
            restorePlayer: async () => { callbackCount += 1; },
          }),
          error => error?.code === 'TRIBULATION_LOCK_LOST',
        );
      } finally {
        mock.values.set(lockKey, context.token);
      }
    });
    assert.equal(callbackCount, 0);
    assert.equal((await getTribulationCheckpoint(playerId)).attemptId, created.attemptId);
  } finally {
    globalThis.redis = previousRedis;
  }
});

test('恢复完成后的重复调用是无副作用空操作', async () => {
  const previousRedis = globalThis.redis;
  const mock = new MemoryRedis();
  globalThis.redis = mock;
  const playerId = 'checkpoint-repeat';
  const calls = [];

  try {
    await runLocked(playerId, () => createTribulationCheckpoint(
      playerId,
      { 修为: 123 },
      { 武器: { name: '剑' } },
    ));
    await runLocked(playerId, () => recoverTribulationCheckpoint(playerId, {
      restoreEquipment: async () => { calls.push('equipment'); },
      restorePlayer: async () => { calls.push('player'); },
    }));
    const repeated = await runLocked(playerId, () => recoverTribulationCheckpoint(playerId, {
      restoreEquipment: async () => { calls.push('unexpected-equipment'); },
      restorePlayer: async () => { calls.push('unexpected-player'); },
    }));
    assert.deepEqual(calls, ['equipment', 'player']);
    assert.deepEqual(repeated, {
      exists: false,
      playerId,
      attemptId: null,
      status: 'none',
      recoverable: false,
      terminal: false,
      recovered: false,
      cleaned: false,
    });
  } finally {
    globalThis.redis = previousRedis;
  }
});

test('已知attempt的检查点缺失会报错而普通恢复仍是空操作', async () => {
  const previousRedis = globalThis.redis;
  const mock = new MemoryRedis();
  globalThis.redis = mock;
  const settlePlayerId = 'checkpoint-missing-settle';
  const recoverPlayerId = 'checkpoint-missing-recover';

  try {
    const settleAttempt = await runLocked(settlePlayerId, () => createTribulationCheckpoint(
      settlePlayerId,
      { 修为: 100 },
      { 武器: null },
    ));
    mock.values.delete(tribulationCheckpointKey(settlePlayerId));
    mock.ttls.delete(tribulationCheckpointKey(settlePlayerId));
    await assert.rejects(
      () => runLocked(settlePlayerId, () => settleTribulationCheckpoint(
        settlePlayerId,
        settleAttempt.attemptId,
        'success',
      )),
      error => error?.code === 'CHECKPOINT_MISSING',
    );

    const recoverAttempt = await runLocked(recoverPlayerId, () => createTribulationCheckpoint(
      recoverPlayerId,
      { 修为: 200 },
      { 武器: null },
    ));
    mock.values.delete(tribulationCheckpointKey(recoverPlayerId));
    mock.ttls.delete(tribulationCheckpointKey(recoverPlayerId));
    let callbackCount = 0;
    await assert.rejects(
      () => runLocked(recoverPlayerId, () => recoverTribulationCheckpoint(recoverPlayerId, {
        expectedAttemptId: recoverAttempt.attemptId,
        restoreEquipment: async () => { callbackCount += 1; },
        restorePlayer: async () => { callbackCount += 1; },
      })),
      error => error?.code === 'CHECKPOINT_MISSING',
    );
    assert.equal(callbackCount, 0);

    const ordinaryRecovery = await runLocked(recoverPlayerId, () =>
      recoverTribulationCheckpoint(recoverPlayerId));
    assert.equal(ordinaryRecovery.status, 'none');
    assert.equal(ordinaryRecovery.recovered, false);
  } finally {
    globalThis.redis = previousRedis;
  }
});

test('SET NX保留首个检查点且错误attemptId不能结算', async () => {
  const previousRedis = globalThis.redis;
  const mock = new MemoryRedis();
  globalThis.redis = mock;
  const playerId = 'checkpoint-cas';

  try {
    const first = await runLocked(playerId, async () => {
      const created = await createTribulationCheckpoint(playerId, { 修为: 10 }, { 武器: null });
      await assert.rejects(
        () => createTribulationCheckpoint(playerId, { 修为: 999 }, { 武器: null }),
        error => error?.code === 'CHECKPOINT_EXISTS',
      );
      await assert.rejects(
        () => settleTribulationCheckpoint(playerId, 'wrong-attempt', 'success'),
        error => error?.code === 'CHECKPOINT_ATTEMPT_MISMATCH',
      );
      return created;
    });
    const stored = await getTribulationCheckpoint(playerId);
    assert.equal(stored.attemptId, first.attemptId);
    assert.equal(stored.baseline.player.修为, 10);
  } finally {
    globalThis.redis = previousRedis;
  }
});

test('包含纳戒基线时恢复必须提供纳戒回调', async () => {
  const previousRedis = globalThis.redis;
  const mock = new MemoryRedis();
  globalThis.redis = mock;
  const playerId = 'checkpoint-najie-callback';

  try {
    await runLocked(playerId, () => createTribulationCheckpoint(
      playerId,
      { 修为: 100 },
      { 武器: { name: '剑' } },
      {},
      { najie: { 道具: [{ name: '雷池真液', 数量: 3 }] } },
    ));

    await assert.rejects(
      () => runLocked(playerId, () => recoverTribulationCheckpoint(playerId, {
        restoreEquipment: async () => {},
        restorePlayer: async () => {},
      })),
      error => error?.code === 'RECOVERY_CALLBACKS_REQUIRED',
    );
    assert.equal((await getTribulationCheckpoint(playerId)).status, 'running');

    await runLocked(playerId, () => recoverTribulationCheckpoint(playerId, {
      restoreEquipment: async () => {},
      restoreNajie: async () => {},
      restorePlayer: async () => {},
    }));
    assert.equal((await getTribulationCheckpoint(playerId)).exists, false);
  } finally {
    globalThis.redis = previousRedis;
  }
});
