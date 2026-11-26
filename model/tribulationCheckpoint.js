import { randomUUID } from 'node:crypto';

import {
  getTribulationLockContext,
  tribulationLockKey,
} from './tribulationLock.js';

const CHECKPOINT_PREFIX = 'xiuxian:player:';
const CHECKPOINT_SUFFIX = ':tribulation_checkpoint';
const CHECKPOINT_VERSION = 1;

export const TRIBULATION_CHECKPOINT_RUNNING = 'running';
export const TRIBULATION_CHECKPOINT_RECOVERING = 'recovering';
export const TRIBULATION_CHECKPOINT_SETTLED = 'settled';
export const TRIBULATION_CHECKPOINT_RECOVERED = 'recovered';

const RECOVERABLE_STATUSES = new Set([
  TRIBULATION_CHECKPOINT_RUNNING,
  TRIBULATION_CHECKPOINT_RECOVERING,
]);
const TERMINAL_STATUSES = new Set([
  TRIBULATION_CHECKPOINT_SETTLED,
  TRIBULATION_CHECKPOINT_RECOVERED,
]);
const VALID_STATUSES = new Set([...RECOVERABLE_STATUSES, ...TERMINAL_STATUSES]);

const createScript = `
-- tribulation-checkpoint:create
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return -1 end
local created = redis.call('SET', KEYS[2], ARGV[2], 'NX')
if created then return 1 end
return 0
`;

const compareAndSetScript = `
-- tribulation-checkpoint:compare-and-set
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return -1 end
if redis.call('GET', KEYS[2]) ~= ARGV[2] then return 0 end
redis.call('SET', KEYS[2], ARGV[3])
return 1
`;

const compareAndDeleteScript = `
-- tribulation-checkpoint:compare-and-delete
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return -1 end
if redis.call('GET', KEYS[2]) ~= ARGV[2] then return 0 end
return redis.call('DEL', KEYS[2])
`;

export class TribulationCheckpointError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'TribulationCheckpointError';
    this.code = code;
    Object.assign(this, details);
  }
}

export function tribulationCheckpointKey(playerId) {
  return `${CHECKPOINT_PREFIX}${String(playerId)}${CHECKPOINT_SUFFIX}`;
}

function checkpointError(message, code, details) {
  return new TribulationCheckpointError(message, code, details);
}

function getRedisClient() {
  const client = globalThis.redis;
  if (!client) {
    throw checkpointError('Redis is not available for tribulation checkpoints', 'REDIS_UNAVAILABLE');
  }
  return client;
}

function requireLockContext(playerId) {
  const id = String(playerId);
  const context = getTribulationLockContext(id);
  if (!context?.token) {
    throw checkpointError(
      `Tribulation lock context required for player ${id}`,
      'TRIBULATION_LOCK_REQUIRED',
      { playerId: id },
    );
  }
  if (context.lockLost) {
    throw checkpointError(
      `Tribulation lock has been lost for player ${id}`,
      'TRIBULATION_LOCK_LOST',
      { playerId: id },
    );
  }
  return context;
}

function serializeClone(value, label) {
  let raw;
  try {
    raw = JSON.stringify(value);
  } catch (error) {
    throw checkpointError(
      `Unable to serialize tribulation checkpoint ${label}`,
      'CHECKPOINT_NOT_SERIALIZABLE',
      { cause: error },
    );
  }
  if (raw === undefined) {
    throw checkpointError(
      `Tribulation checkpoint ${label} is not JSON serializable`,
      'CHECKPOINT_NOT_SERIALIZABLE',
    );
  }
  return JSON.parse(raw);
}

function parseCheckpoint(raw, playerId) {
  let checkpoint;
  try {
    checkpoint = JSON.parse(raw);
  } catch (error) {
    throw checkpointError(
      `Invalid tribulation checkpoint JSON for player ${playerId}`,
      'CHECKPOINT_CORRUPT',
      { playerId, cause: error },
    );
  }

  const valid = checkpoint
    && typeof checkpoint === 'object'
    && checkpoint.version === CHECKPOINT_VERSION
    && String(checkpoint.playerId) === String(playerId)
    && typeof checkpoint.attemptId === 'string'
    && checkpoint.attemptId.length > 0
    && VALID_STATUSES.has(checkpoint.status)
    && checkpoint.baseline
    && typeof checkpoint.baseline === 'object'
    && Object.hasOwn(checkpoint.baseline, 'player')
    && Object.hasOwn(checkpoint.baseline, 'equipment');
  if (!valid) {
    throw checkpointError(
      `Malformed tribulation checkpoint for player ${playerId}`,
      'CHECKPOINT_CORRUPT',
      { playerId },
    );
  }
  return checkpoint;
}

function statusView(playerId, checkpoint = null, overrides = {}) {
  if (!checkpoint) {
    return {
      exists: false,
      playerId: String(playerId),
      attemptId: null,
      status: 'none',
      recoverable: false,
      terminal: false,
      ...overrides,
    };
  }
  return {
    exists: true,
    ...checkpoint,
    recoverable: RECOVERABLE_STATUSES.has(checkpoint.status),
    terminal: TERMINAL_STATUSES.has(checkpoint.status),
    ...overrides,
  };
}

async function readRawCheckpoint(playerId) {
  const id = String(playerId);
  const raw = await getRedisClient().get(tribulationCheckpointKey(id));
  if (raw === null || raw === undefined) return { id, raw: null, checkpoint: null };
  return { id, raw, checkpoint: parseCheckpoint(raw, id) };
}

function normalizeAttemptId(attemptId) {
  const expected = typeof attemptId === 'object' ? attemptId?.attemptId : attemptId;
  return expected ? String(expected) : null;
}

function missingCheckpointError(playerId, attemptId) {
  const expectedAttemptId = normalizeAttemptId(attemptId);
  return checkpointError(
    `Tribulation checkpoint ${expectedAttemptId} is missing for player ${playerId}`,
    'CHECKPOINT_MISSING',
    {
      playerId: String(playerId),
      expectedAttemptId,
    },
  );
}

function ensureAttempt(checkpoint, attemptId, playerId) {
  const expected = normalizeAttemptId(attemptId);
  if (!expected || checkpoint.attemptId !== String(expected)) {
    throw checkpointError(
      `Tribulation checkpoint attempt changed for player ${playerId}`,
      'CHECKPOINT_ATTEMPT_MISMATCH',
      {
        playerId: String(playerId),
        expectedAttemptId: expected ? String(expected) : null,
        actualAttemptId: checkpoint.attemptId,
      },
    );
  }
}

function assertLiveLockResult(result, playerId) {
  if (Number(result) === -1) {
    throw checkpointError(
      `Tribulation lock is no longer held for player ${playerId}`,
      'TRIBULATION_LOCK_LOST',
      { playerId: String(playerId) },
    );
  }
}

async function compareAndSetCheckpoint(playerId, context, expectedRaw, nextRaw) {
  const id = String(playerId);
  const result = await getRedisClient().eval(compareAndSetScript, {
    keys: [tribulationLockKey(id), tribulationCheckpointKey(id)],
    arguments: [context.token, expectedRaw, nextRaw],
  });
  assertLiveLockResult(result, id);
  if (Number(result) !== 1) {
    throw checkpointError(
      `Tribulation checkpoint changed concurrently for player ${id}`,
      'CHECKPOINT_CHANGED',
      { playerId: id },
    );
  }
}

async function compareAndDeleteCheckpoint(playerId, context, expectedRaw) {
  const id = String(playerId);
  const client = getRedisClient();
  const result = await client.eval(compareAndDeleteScript, {
    keys: [tribulationLockKey(id), tribulationCheckpointKey(id)],
    arguments: [context.token, expectedRaw],
  });
  assertLiveLockResult(result, id);
  if (Number(result) === 1) return true;

  const latest = await client.get(tribulationCheckpointKey(id));
  if (latest === null || latest === undefined) return true;
  throw checkpointError(
    `Tribulation checkpoint changed during cleanup for player ${id}`,
    'CHECKPOINT_CHANGED',
    { playerId: id },
  );
}

export async function createTribulationCheckpoint(
  playerId,
  playerBaseline,
  equipmentBaseline,
  metadata = {},
  additionalBaselines = {},
) {
  const id = String(playerId);
  const context = requireLockContext(id);
  const now = Date.now();
  const checkpoint = {
    version: CHECKPOINT_VERSION,
    playerId: id,
    attemptId: randomUUID(),
    status: TRIBULATION_CHECKPOINT_RUNNING,
    createdAt: now,
    updatedAt: now,
    metadata: serializeClone(metadata, 'metadata'),
    baseline: serializeClone({
      ...(additionalBaselines && typeof additionalBaselines === 'object'
        ? additionalBaselines
        : {}),
      player: playerBaseline,
      equipment: equipmentBaseline,
    }, 'baseline'),
  };
  const raw = JSON.stringify(checkpoint);
  const result = await getRedisClient().eval(createScript, {
    keys: [tribulationLockKey(id), tribulationCheckpointKey(id)],
    arguments: [context.token, raw],
  });
  assertLiveLockResult(result, id);
  if (Number(result) !== 1) {
    const existing = await getTribulationCheckpoint(id);
    throw checkpointError(
      `A tribulation checkpoint already exists for player ${id}`,
      'CHECKPOINT_EXISTS',
      { playerId: id, checkpoint: existing },
    );
  }
  return statusView(id, checkpoint, { created: true });
}

export async function getTribulationCheckpoint(playerId) {
  const { id, checkpoint } = await readRawCheckpoint(playerId);
  return statusView(id, checkpoint);
}

export async function settleTribulationCheckpoint(
  playerId,
  attemptId,
  outcome = 'settled',
) {
  const id = String(playerId);
  const context = requireLockContext(id);
  const current = await readRawCheckpoint(id);
  if (!current.checkpoint) {
    if (normalizeAttemptId(attemptId)) throw missingCheckpointError(id, attemptId);
    return statusView(id, null, { settled: false, cleaned: false });
  }
  ensureAttempt(current.checkpoint, attemptId, id);

  if (TERMINAL_STATUSES.has(current.checkpoint.status)) {
    const cleaned = await compareAndDeleteCheckpoint(id, context, current.raw);
    return statusView(id, current.checkpoint, {
      exists: !cleaned,
      settled: current.checkpoint.status === TRIBULATION_CHECKPOINT_SETTLED,
      cleaned,
    });
  }

  const now = Date.now();
  const settledCheckpoint = {
    ...current.checkpoint,
    status: TRIBULATION_CHECKPOINT_SETTLED,
    outcome: serializeClone(outcome, 'outcome'),
    settledAt: now,
    updatedAt: now,
  };
  const settledRaw = JSON.stringify(settledCheckpoint);
  await compareAndSetCheckpoint(id, context, current.raw, settledRaw);
  const cleaned = await compareAndDeleteCheckpoint(id, context, settledRaw);
  return statusView(id, settledCheckpoint, {
    exists: !cleaned,
    settled: true,
    cleaned,
  });
}

export async function recoverTribulationCheckpoint(
  playerId,
  {
    expectedAttemptId,
    restoreEquipment,
    restoreNajie,
    restorePlayer,
  } = {},
) {
  const id = String(playerId);
  const context = requireLockContext(id);
  const current = await readRawCheckpoint(id);
  if (!current.checkpoint) {
    if (normalizeAttemptId(expectedAttemptId)) {
      throw missingCheckpointError(id, expectedAttemptId);
    }
    return statusView(id, null, { recovered: false, cleaned: false });
  }
  if (normalizeAttemptId(expectedAttemptId)) {
    ensureAttempt(current.checkpoint, expectedAttemptId, id);
  }

  if (TERMINAL_STATUSES.has(current.checkpoint.status)) {
    const cleaned = await compareAndDeleteCheckpoint(id, context, current.raw);
    return statusView(id, current.checkpoint, {
      exists: !cleaned,
      recovered: false,
      cleaned,
    });
  }

  if (typeof restoreEquipment !== 'function' || typeof restorePlayer !== 'function') {
    throw checkpointError(
      `Tribulation recovery callbacks are required for player ${id}`,
      'RECOVERY_CALLBACKS_REQUIRED',
      { playerId: id },
    );
  }
  if (
    Object.hasOwn(current.checkpoint.baseline, 'najie')
    && typeof restoreNajie !== 'function'
  ) {
    throw checkpointError(
      `Tribulation inventory recovery callback is required for player ${id}`,
      'RECOVERY_CALLBACKS_REQUIRED',
      { playerId: id },
    );
  }

  const now = Date.now();
  const recoveryAttempts = Number(current.checkpoint.recovery?.attempts) || 0;
  const claimedCheckpoint = {
    ...current.checkpoint,
    status: TRIBULATION_CHECKPOINT_RECOVERING,
    updatedAt: now,
    recovery: {
      attempts: recoveryAttempts + 1,
      claimedAt: now,
      lockToken: context.token,
    },
  };
  const claimedRaw = JSON.stringify(claimedCheckpoint);
  await compareAndSetCheckpoint(id, context, current.raw, claimedRaw);

  const callbackContext = {
    playerId: id,
    attemptId: claimedCheckpoint.attemptId,
    metadata: serializeClone(claimedCheckpoint.metadata, 'metadata'),
  };
  await restoreEquipment(
    serializeClone(claimedCheckpoint.baseline.equipment, 'equipment baseline'),
    callbackContext,
  );
  if (Object.hasOwn(claimedCheckpoint.baseline, 'najie')) {
    await restoreNajie(
      serializeClone(claimedCheckpoint.baseline.najie, 'inventory baseline'),
      callbackContext,
    );
  }
  await restorePlayer(
    serializeClone(claimedCheckpoint.baseline.player, 'player baseline'),
    callbackContext,
  );

  const recoveredAt = Date.now();
  const recoveredCheckpoint = {
    ...claimedCheckpoint,
    status: TRIBULATION_CHECKPOINT_RECOVERED,
    recoveredAt,
    updatedAt: recoveredAt,
  };
  const recoveredRaw = JSON.stringify(recoveredCheckpoint);
  await compareAndSetCheckpoint(id, context, claimedRaw, recoveredRaw);
  const cleaned = await compareAndDeleteCheckpoint(id, context, recoveredRaw);
  return statusView(id, recoveredCheckpoint, {
    exists: !cleaned,
    recovered: true,
    cleaned,
  });
}
