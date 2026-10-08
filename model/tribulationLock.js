import { AsyncLocalStorage } from 'node:async_hooks';

const LOCK_PREFIX = 'xiuxian:player:';
const LOCK_SUFFIX = ':tribulation_lock';
// A live long-running tribulation renews every 30s. If its process disappears,
// ordinary commands should not be held by a fifteen-minute abandoned lease.
const LOCK_TTL_SECONDS = 120;
const CHECKPOINT_SUFFIX = ':tribulation_checkpoint';
const WRITE_RESERVATION_SUFFIX = ':tribulation_write_reservation';
const REVISION_SUFFIX = ':tribulation_revision';
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
export const TRIBULATION_LOCK_TTL_SECONDS = LOCK_TTL_SECONDS;
export const TRIBULATION_WRITE_RESERVATION_TTL_SECONDS = LOCK_TTL_SECONDS;
export const TRIBULATION_SNAPSHOT_FENCE_FIELD = '__tribulationSnapshotFence';

export function tribulationLockKey(playerId) {
  return `${LOCK_PREFIX}${String(playerId)}${LOCK_SUFFIX}`;
}

export function tribulationCheckpointKey(playerId) {
  return `${LOCK_PREFIX}${String(playerId)}${CHECKPOINT_SUFFIX}`;
}

export function tribulationWriteReservationKey(playerId) {
  return `${LOCK_PREFIX}${String(playerId)}${WRITE_RESERVATION_SUFFIX}`;
}

export function tribulationRevisionKey(playerId) {
  return `${LOCK_PREFIX}${String(playerId)}${REVISION_SUFFIX}`;
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
  const context = getTribulationLockContext(id);
  if (context?.leaseUntil && Date.now() >= context.leaseUntil) context.lockLost = true;
  // Detached continuations must not write after their lease was released/lost.
  if (context?.lockLost || context?.closed) {
    throw new Error(`Tribulation lock lost or closed for player ${id}`);
  }
  const local = activeLocks.get(id);
  if (!local) return;

  if (context?.token !== local.token) {
    throw new Error(`Concurrent write rejected while player ${id} is tribulating`);
  }
}

export function touchTribulationProgress(playerId, phase = 'running') {
  const context = getTribulationLockContext(playerId);
  if (!context || context.closed || context.lockLost) return;
  context.lastProgressAt = Date.now();
  context.phase = phase;
}

function progressView(playerId, token) {
  const context = activeLocks.get(String(playerId));
  const parsed = /^tribulation:(\d+):/.exec(String(token || ''));
  const startedAt = context?.startedAt || (parsed ? Number(parsed[1]) : null);
  return {
    startedAt,
    elapsedSeconds: startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : null,
    idleSeconds: context?.lastProgressAt ? Math.max(0, Math.floor((Date.now() - context.lastProgressAt) / 1000)) : null,
    phase: context?.phase || null,
    kind: context?.kind || '渡劫/受保护操作',
    leaseLost: Boolean(context?.lockLost),
    replySuppressed: Boolean(context?.replySuppressed),
  };
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

export async function getTribulationLockStatus(playerId) {
  const local = isTribulationLockActive(playerId);
  try {
    const key = tribulationLockKey(playerId);
    const token = await redis.get(key);
    const remote = Boolean(token);
    let ttlSeconds = null;
    if (remote && typeof redis.ttl === 'function') {
      const ttl = Number(await redis.ttl(key));
      if (Number.isFinite(ttl) && ttl >= 0) ttlSeconds = ttl;
    }
    return {
      locked: local || remote,
      local,
      remote,
      ttlSeconds,
      available: true,
      ...progressView(playerId, token),
    };
  } catch (error) {
    console.error(`Failed to inspect tribulation lock for ${playerId}:`, error);
    return {
      locked: local,
      local,
      remote: false,
      ttlSeconds: null,
      available: false,
      ...progressView(playerId),
    };
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
  const context = getTribulationLockContext(playerId);
  if (!context) return;
  // A process pause longer than the short lease must never let a stale owner
  // write before its renewal timer notices expiry/replacement.
  let token;
  try {
    token = await redis.get(tribulationLockKey(playerId));
  } catch (error) {
    context.lockLost = true;
    throw new Error('渡劫租约核验暂不可用，停止本次写档', { cause: error });
  }
  if (token !== context.token) context.lockLost = true;
  assertTribulationSnapshotCurrentSync(playerId, snapshot);
}

// Local callers added around the upstream lock expect these helpers. Ordinary
// writes intentionally retain upstream semantics: they do not create a Redis
// reservation or advance a player-wide revision.
export async function captureTribulationSnapshotFence() {
  return undefined;
}

export async function withTribulationWriteGuard(playerId, snapshot, action) {
  if (typeof action !== 'function') {
    throw new TypeError('Tribulation write action must be a function');
  }
  await assertTribulationWriteAllowed(playerId, snapshot);
  touchTribulationProgress(playerId, 'writing');
  return action(getTribulationLockContext(playerId));
}

export async function withTribulationWriteTransaction(playerId, snapshots, action) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    throw new TypeError('Tribulation write transaction requires at least one snapshot');
  }
  if (typeof action !== 'function') {
    throw new TypeError('Tribulation write transaction action must be a function');
  }
  for (const snapshot of snapshots) {
    await assertTribulationWriteAllowed(playerId, snapshot);
  }
  return action(getTribulationLockContext(playerId));
}

export async function withTribulationLock(playerId, action, options = {}) {
  if (typeof action !== 'function') throw new TypeError('Tribulation action must be a function');
  const id = String(playerId);
  const inherited = getTribulationLockContext(id);
  if (inherited) {
    assertTribulationWriteAllowedSync(id);
    return action(inherited);
  }

  const token = `tribulation:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const key = tribulationLockKey(id);
  const acquisitionAt = Date.now();
  let acquired;
  try {
    acquired = await redis.set(key, token, { EX: LOCK_TTL_SECONDS, NX: true });
  } catch (error) {
    console.error(`Failed to acquire tribulation lock for ${id}:`, error);
    return TRIBULATION_LOCK_BUSY;
  }
  if (!acquired) return TRIBULATION_LOCK_BUSY;

  const context = { playerId: id, token, lockLost: false, closed: false,
    leaseUntil: acquisitionAt + LOCK_TTL_SECONDS * 1000,
    startedAt: Date.now(), lastProgressAt: Date.now(), phase: 'running',
    kind: typeof options.kind === 'string' ? options.kind.slice(0, 32) : '渡劫/受保护操作' };
  activeLocks.set(id, context);
  let renewing = false;
  const renew = async () => {
    if (renewing || context.lockLost) return;
    renewing = true;
    const renewalAt = Date.now();
    try {
      const renewed = await redis.eval(renewScript, {
        keys: [key],
        arguments: [token, String(LOCK_TTL_SECONDS)],
      });
      if (!Number(renewed)) context.lockLost = true;
      else context.leaseUntil = renewalAt + LOCK_TTL_SECONDS * 1000;
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
    context.closed = true;
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
