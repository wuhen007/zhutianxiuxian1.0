import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getDailyActionClaimKey,
  reserveDailyAction,
  resetDailyAction,
} from '../model/dailyAction.js';

function createRedis() {
  const values = new Map();
  return {
    async set(key, value, options) {
      if (options?.NX && values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    },
    async del(key) {
      return values.delete(key) ? 1 : 0;
    },
  };
}

test('同一玩家同一日的自动和手动操作只能预约一次', async () => {
  const redis = createRedis();
  const now = Date.parse('2026-07-28T16:00:01Z');
  assert.match(getDailyActionClaimKey('10001', 'sign', now), /2026-07-29$/);
  assert.equal(await reserveDailyAction(redis, '10001', 'sign', now), true);
  assert.equal(await reserveDailyAction(redis, '10001', 'sign', now), false);
  await resetDailyAction(redis, '10001', 'sign', now);
  assert.equal(await reserveDailyAction(redis, '10001', 'sign', now), true);
});
