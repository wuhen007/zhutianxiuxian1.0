import { AsyncLocalStorage } from 'node:async_hooks';

const queues = new Map();
const context = new AsyncLocalStorage();

export const PLAYER_MUTATION_LOCK_DEFAULTS = Object.freeze({
  maxQueueDepth: 32,
  waitTimeoutMs: 30_000,
});

export class PlayerMutationLockError extends Error {
  constructor(code, playerId) {
    const messages = {
      queue_full: `Player mutation queue is full for ${playerId}`,
      wait_timeout: `Timed out waiting for player mutation lock ${playerId}`,
    };
    super(messages[code] || `Player mutation lock failed for ${playerId}`);
    this.name = 'PlayerMutationLockError';
    this.code = code;
    this.playerId = String(playerId);
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function deleteQueueIfIdle(key, queue) {
  if (!queue.active && queue.pending.length === 0 && queues.get(key) === queue) {
    queues.delete(key);
  }
}

function runNext(key, queue) {
  if (queue.active) return;

  const entry = queue.pending.shift();
  if (!entry) {
    deleteQueueIfIdle(key, queue);
    return;
  }

  entry.started = true;
  if (entry.waitTimer) clearTimeout(entry.waitTimer);
  queue.active = true;

  const heldLocks = new Set(entry.heldLocks);
  heldLocks.add(key);
  Promise.resolve()
    .then(() => context.run(heldLocks, entry.task))
    .then(entry.resolve, entry.reject)
    .finally(() => {
      queue.active = false;
      runNext(key, queue);
    });
}

function expireWaitingEntry(key, queue, entry) {
  if (entry.started) return;
  const index = queue.pending.indexOf(entry);
  if (index < 0) return;

  queue.pending.splice(index, 1);
  entry.reject(new PlayerMutationLockError('wait_timeout', key));
  deleteQueueIfIdle(key, queue);
}

// ponytail: process-local serialization; use a renewable Redis lock for multi-process deployments.
export async function withPlayerMutationLock(playerId, task, options = {}) {
  if (typeof task !== 'function') {
    throw new TypeError('Player mutation task must be a function');
  }

  const key = String(playerId);
  const heldLocks = context.getStore();
  if (heldLocks?.has(key)) return task();

  let queue = queues.get(key);
  if (!queue) {
    queue = { active: false, pending: [] };
    queues.set(key, queue);
  }

  const maxQueueDepth = positiveInteger(
    options.maxQueueDepth,
    PLAYER_MUTATION_LOCK_DEFAULTS.maxQueueDepth
  );
  if (queue.active && queue.pending.length >= maxQueueDepth) {
    throw new PlayerMutationLockError('queue_full', key);
  }

  const waitTimeoutMs = positiveInteger(
    options.waitTimeoutMs,
    PLAYER_MUTATION_LOCK_DEFAULTS.waitTimeoutMs
  );
  return new Promise((resolve, reject) => {
    const entry = {
      heldLocks,
      reject,
      resolve,
      started: false,
      task,
      waitTimer: null,
    };
    queue.pending.push(entry);
    runNext(key, queue);

    if (!entry.started) {
      entry.waitTimer = setTimeout(
        () => expireWaitingEntry(key, queue, entry),
        waitTimeoutMs
      );
    }
  });
}

export function getPlayerMutationLockStats(playerId) {
  const queue = queues.get(String(playerId));
  return queue
    ? { active: queue.active, pending: queue.pending.length }
    : { active: false, pending: 0 };
}

export function withAssociationMutationLock(associationName, task, options) {
  return withPlayerMutationLock(`association:${associationName}`, task, options);
}
