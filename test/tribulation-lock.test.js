import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TRIBULATION_LOCK_BUSY,
  assertTribulationWriteAllowed,
  isTribulationLockActive,
  markTribulationSnapshot,
  withTribulationLock,
} from '../model/tribulationLock.js';

test('渡劫租约拒绝并发写入并允许持有者写入', async () => {
  const previousRedis = global.redis;
  const values = new Map();
  global.redis = {
    async set(key, value, options) {
      if (options?.NX && values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    },
    async get(key) {
      return values.get(key) || null;
    },
    async eval(_script, { keys, arguments: args }) {
      if (values.get(keys[0]) !== args[0]) return 0;
      if (_script.includes('del')) {
        values.delete(keys[0]);
        return 1;
      }
      return 1;
    },
  };

  let release;
  let started;
  const staleSnapshot = markTribulationSnapshot('lock-test', {});
  try {
    const startedPromise = new Promise(resolve => { started = resolve; });
    const running = withTribulationLock('lock-test', async () => {
      started();
      await new Promise(resolve => { release = resolve; });
      await assertTribulationWriteAllowed('lock-test');
    });
    await startedPromise;
    assert.equal(isTribulationLockActive('lock-test'), true);
    assert.equal(await withTribulationLock('lock-test', async () => true), TRIBULATION_LOCK_BUSY);
    await assert.rejects(() => assertTribulationWriteAllowed('lock-test'));
    release();
    await running;
    assert.equal(isTribulationLockActive('lock-test'), false);
    await assert.rejects(() => assertTribulationWriteAllowed('lock-test', staleSnapshot));
    const freshSnapshot = markTribulationSnapshot('lock-test', {});
    await assertTribulationWriteAllowed('lock-test', freshSnapshot);
  } finally {
    release?.();
    global.redis = previousRedis;
  }
});
