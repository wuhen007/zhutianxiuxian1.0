import assert from 'node:assert/strict';
import test from 'node:test';
import { runTaskOnce } from '../utils/taskGuard.js';

test('runTaskOnce skips overlap and releases its lock', async () => {
  let release;
  const first = runTaskOnce('test-task', () => new Promise(resolve => {
    release = resolve;
  }));

  assert.equal(await runTaskOnce('test-task', () => 'overlap'), false);
  release('done');
  assert.equal(await first, 'done');
  assert.equal(await runTaskOnce('test-task', () => 'next'), 'next');
});
