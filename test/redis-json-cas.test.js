import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareAndDeleteRedisJson,
  compareAndExpireRedisKey,
  compareAndSetRedisJson,
} from '../utils/redisJsonCas.js';

test('redis JSON compare-and-set passes the expected and next values atomically', async () => {
  let call;
  const redis = {
    async eval(script, options) {
      call = { script, options };
      return 1;
    },
  };

  assert.equal(await compareAndSetRedisJson(redis, 'auction', '{"price":1}', { price: 2 }), true);
  assert.match(call.script, /current ~= ARGV\[1\]/);
  assert.deepEqual(call.options, {
    keys: ['auction'],
    arguments: ['{"price":1}', '{"price":2}'],
  });

  redis.eval = async () => 0;
  assert.equal(await compareAndSetRedisJson(redis, 'auction', '{}', {}), false);

  redis.eval = async (script, options) => {
    call = { script, options };
    return 1;
  };
  assert.equal(await compareAndDeleteRedisJson(redis, 'auction', '{"price":2}'), true);
  assert.match(call.script, /redis\.call\('DEL'/);
  assert.deepEqual(call.options, {
    keys: ['auction'],
    arguments: ['{"price":2}'],
  });
});

test('redis lock renewal only extends the matching owner token', async () => {
  let call;
  const redis = {
    async eval(script, options) {
      call = { script, options };
      return 1;
    },
  };

  assert.equal(await compareAndExpireRedisKey(redis, 'projection-lock', 'owner-token', 120_000), true);
  assert.match(call.script, /current ~= ARGV\[1\]/);
  assert.match(call.script, /PEXPIRE/);
  assert.deepEqual(call.options, {
    keys: ['projection-lock'],
    arguments: ['owner-token', '120000'],
  });

  redis.eval = async () => 0;
  assert.equal(await compareAndExpireRedisKey(redis, 'projection-lock', 'stale-token', 120_000), false);
});
