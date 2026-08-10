import { AsyncLocalStorage } from 'node:async_hooks';

const queues = new Map();
const context = new AsyncLocalStorage();

// ponytail: process-local serialization; use a renewable Redis lock for multi-process deployments.
export async function withPlayerMutationLock(playerId, task) {
  const key = String(playerId);
  const heldLocks = context.getStore();
  if (heldLocks?.has(key)) return task();

  const previous = queues.get(key) || Promise.resolve();
  let release;
  const current = new Promise(resolve => {
    release = resolve;
  });
  queues.set(key, current);

  await previous;
  const nextLocks = new Set(heldLocks);
  nextLocks.add(key);
  try {
    return await context.run(nextLocks, task);
  } finally {
    release();
    if (queues.get(key) === current) queues.delete(key);
  }
}
