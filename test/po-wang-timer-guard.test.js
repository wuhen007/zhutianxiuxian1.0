import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { runSequentialInterval } from '../utils/sequentialInterval.js';

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

test('sequential interval never overlaps slow ticks and stops after finish', async () => {
  let active = 0;
  let maxActive = 0;
  let ticks = 0;

  const result = await runSequentialInterval(async ({ finish }) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    ticks += 1;
    await sleep(5);
    active -= 1;
    if (ticks === 3) finish('done');
  }, {
    initialDelayMs: 0,
    intervalMs: 1,
    unref: false,
  });

  assert.equal(result, 'done');
  assert.equal(maxActive, 1);
  assert.equal(ticks, 3);
  await sleep(10);
  assert.equal(ticks, 3);
});

test('破王成帝 awaits one managed sequence instead of detached intervals', () => {
  const source = fs.readFileSync(
    new URL('../apps/User/zhetiandujie.js', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('async poWangChengDi(e)');
  const end = source.indexOf('// 解除护法双向绑定', start);
  const method = source.slice(start, end);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(method, /await runSequentialInterval/);
  assert.match(method, /finish\(false\)/);
  assert.match(method, /finish\(true\)/);
  assert.doesNotMatch(method, /setInterval/);
});

test('破王成帝在扣费前建检查点并把计时异常交给恢复流程', () => {
  const source = fs.readFileSync(
    new URL('../apps/User/zhetiandujie.js', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('async poWangChengDi(e)');
  const end = source.indexOf('// 解除护法双向绑定', start);
  const method = source.slice(start, end);

  const checkpoint = method.indexOf('createTribulationCheckpoint(');
  const debit = method.indexOf('player.修为 -= realNeed');
  const interval = method.indexOf('await runSequentialInterval');
  const settlement = method.indexOf('settleTribulationCheckpoint(', interval);
  const recovery = method.indexOf('restoreInterruptedTribulation(', settlement);

  assert.ok(checkpoint >= 0 && checkpoint < debit);
  assert.match(method.slice(checkpoint, debit), /\{\s*najie\s*\}/);
  assert.ok(interval > debit);
  assert.match(method.slice(interval, settlement), /\{\s*fail\s*,\s*finish\s*\}/);
  assert.match(method.slice(interval, settlement), /fail\(err\)/);
  assert.ok(settlement > interval);
  assert.ok(recovery > settlement);
  assert.doesNotMatch(
    method.slice(interval, settlement),
    /catch\s*\(err\)[\s\S]{0,160}?finish\(false\)/,
  );
});
