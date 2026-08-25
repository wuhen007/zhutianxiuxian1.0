import { AsyncLocalStorage } from 'node:async_hooks';

const LOCK_PREFIX = 'xiuxian:player:';
const LOCK_SUFFIX = ':tribulation_lock';
const LOCK_TTL_SECONDS = 900;
const RENEW_INTERVAL_MS = 30_000;
const MAX_SNAPSHOT_EPOCHS = 50_000;

const releaseScript = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

const renewScript = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('expire', KEYS[1], ARGV[2])
end
return 0
`;

const tribulationStorage = new AsyncLocalStorage();
const activeLocks = new Map();
const snapshotEpochs = new Map();
const snapshotMetadata = new WeakMap();

export const TRIBULATION_LOCK_BUSY = Symbol('tribulation-lock-busy');

export function tribulationLockKey(playerId) {
  return `${LOCK_PREFIX}${String(playerId)}${LOCK_SUFFIX}`;
}

export function getTribulationLockContext(playerId) {
  const context = tribulationStorage.getStore();
  if (!context || String(context.playerId) !== String(playerId)) return null;
  return context;
}

export function isTribulationLockActive(playerId) {
  return activeLocks.has(String(playerId));
}

function getSnapshotEpoch(playerId) {
  return snapshotEpochs.get(String(playerId)) || 0;
}

export function markTribulationSnapshot(playerId, snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  snapshotMetadata.set(snapshot, {
    playerId: String(playerId),
    epoch: getSnapshotEpoch(playerId),
  });
  return snapshot;
}

export function assertTribulationWriteAllowedSync(playerId) {
  const id = String(playerId);
  const local = activeLocks.get(id);
  if (!local) return;

  const context = getTribulationLockContext(id);
  if (context?.lockLost) {
    throw new Error(`Tribulation lock lost for player ${id}`);
  }
  if (context?.token !== local.token) {
    throw new Error(`Concurrent write rejected while player ${id} is tribulating`);
  }
}

export async function isTribulationLocked(playerId) {
  if (isTribulationLockActive(playerId)) return true;
  try {
    return Boolean(await redis.get(tribulationLockKey(playerId)));
  } catch (error) {
    console.error(`Failed to inspect tribulation lock for ${playerId}:`, error);
    // The command guard must not freeze the whole server during a Redis outage.
    return false;
  }
}

export function assertTribulationSnapshotCurrentSync(playerId, snapshot) {
  assertTribulationWriteAllowedSync(playerId);
  if (!snapshot || typeof snapshot !== 'object') return;

  const id = String(playerId);
  const metadata = snapshotMetadata.get(snapshot);
  if (!metadata) return;
  // Some legacy/admin flows intentionally copy a snapshot between IDs. Only
  // reject snapshots that were read for this same player before a tribulation.
  if (metadata.playerId === id && metadata.epoch !== getSnapshotEpoch(id)) {
    throw new Error(`Stale snapshot rejected for player ${id}`);
  }
}

export async function assertTribulationWriteAllowed(playerId, snapshot) {
  assertTribulationSnapshotCurrentSync(playerId, snapshot);
}

export async function withTribulationLock(playerId, action) {
  const id = String(playerId);
  const inherited = getTribulationLockContext(id);
  if (inherited) return action(inherited);

  const token = `tribulation:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const key = tribulationLockKey(id);
  let acquired;
  try {
    acquired = await redis.set(key, token, { EX: LOCK_TTL_SECONDS, NX: true });
  } catch (error) {
    console.error(`Failed to acquire tribulation lock for ${id}:`, error);
    return TRIBULATION_LOCK_BUSY;
  }
  if (!acquired) return TRIBULATION_LOCK_BUSY;

  const context = { playerId: id, token, lockLost: false };
  activeLocks.set(id, context);
  let renewing = false;
  const renew = async () => {
    if (renewing || context.lockLost) return;
    renewing = true;
    try {
      const renewed = await redis.eval(renewScript, {
        keys: [key],
        arguments: [token, String(LOCK_TTL_SECONDS)],
      });
      if (!Number(renewed)) context.lockLost = true;
    } catch (error) {
      console.error(`Failed to renew tribulation lock for ${id}:`, error);
      context.lockLost = true;
    } finally {
      renewing = false;
    }
  };
  const timer = setInterval(renew, RENEW_INTERVAL_MS);
  timer.unref?.();

  try {
    return await tribulationStorage.run(context, () => action(context));
  } finally {
    clearInterval(timer);
    const nextEpoch = getSnapshotEpoch(id) + 1;
    snapshotEpochs.delete(id);
    snapshotEpochs.set(id, nextEpoch);
    while (snapshotEpochs.size > MAX_SNAPSHOT_EPOCHS) {
      snapshotEpochs.delete(snapshotEpochs.keys().next().value);
    }
    try {
      await redis.eval(releaseScript, { keys: [key], arguments: [token] });
    } catch (error) {
      console.error(`Failed to release tribulation lock for ${id}:`, error);
    } finally {
      activeLocks.delete(id);
    }
  }
}
