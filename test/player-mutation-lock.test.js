import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPlayerMutationLockStats,
  PlayerMutationLockError,
  withAssociationMutationLock,
  withPlayerMutationLock,
} from '../utils/playerMutationLock.js';

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

test('association mutation lock queues work for the same sect', async () => {
  const order = [];
  let releaseFirst;
  const wait = new Promise(resolve => {
    releaseFirst = resolve;
  });

  const first = withAssociationMutationLock('测试宗', async () => {
    order.push('first:start');
    await wait;
    order.push('first:end');
  });
  const second = withAssociationMutationLock('测试宗', () => order.push('second'));

  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(order, ['first:start']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['first:start', 'first:end', 'second']);
});

test('player mutation lock bounds the number of retained waiters', async () => {
  let releaseFirst;
  const first = withPlayerMutationLock('bounded', () => new Promise(resolve => {
    releaseFirst = resolve;
  }));
  const second = withPlayerMutationLock('bounded', () => 'second', {
    maxQueueDepth: 2,
  });
  const third = withPlayerMutationLock('bounded', () => 'third', {
    maxQueueDepth: 2,
  });

  await assert.rejects(
    withPlayerMutationLock('bounded', () => 'overflow', { maxQueueDepth: 2 }),
    error => error instanceof PlayerMutationLockError && error.code === 'queue_full'
  );
  assert.deepEqual(getPlayerMutationLockStats('bounded'), { active: true, pending: 2 });

  releaseFirst();
  assert.deepEqual(await Promise.all([first, second, third]), [undefined, 'second', 'third']);
  assert.deepEqual(getPlayerMutationLockStats('bounded'), { active: false, pending: 0 });
});

test('timed-out player mutation waiters are removed while the owner keeps exclusivity', async () => {
  let releaseFirst;
  const first = withPlayerMutationLock('stalled', () => new Promise(resolve => {
    releaseFirst = resolve;
  }));

  await assert.rejects(
    withPlayerMutationLock('stalled', () => 'never-runs', { waitTimeoutMs: 20 }),
    error => error instanceof PlayerMutationLockError && error.code === 'wait_timeout'
  );
  assert.deepEqual(getPlayerMutationLockStats('stalled'), { active: true, pending: 0 });

  releaseFirst();
  await first;
  assert.deepEqual(getPlayerMutationLockStats('stalled'), { active: false, pending: 0 });
});
