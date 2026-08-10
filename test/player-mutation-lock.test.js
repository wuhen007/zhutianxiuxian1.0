import assert from 'node:assert/strict';
import test from 'node:test';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';

test('player mutation lock queues same-player work and supports reentry', async () => {
  const order = [];
  let releaseFirst;
  let markStarted;
  const wait = new Promise(resolve => {
    releaseFirst = resolve;
  });
  const started = new Promise(resolve => {
    markStarted = resolve;
  });

  const first = withPlayerMutationLock('10001', async () => {
    order.push('first:start');
    await withPlayerMutationLock(10001, () => order.push('first:reentered'));
    markStarted();
    await wait;
    order.push('first:end');
  });
  const second = withPlayerMutationLock('10001', () => order.push('second'));

  await started;
  assert.deepEqual(order, ['first:start', 'first:reentered']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['first:start', 'first:reentered', 'first:end', 'second']);
});
