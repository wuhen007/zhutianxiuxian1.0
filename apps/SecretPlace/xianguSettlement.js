import {
  readXianguSharedDocument,
  resolveXianguSharedStateTtl,
  updateXianguSharedDocument,
} from './xianguSharedState.js';

const SETTLEMENT_KEY_PREFIX = 'xiuxian:xiangu:settlement';
const RECEIPT_LOCK_TTL_SECONDS = 60;
const PLAYER_LOCK_TTL_SECONDS = 60;
const RECEIPT_INDEX_LIMIT = 200;
const PLAYER_RECEIPT_LIMIT = 200;
const RELEASE_LOCK_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  end
  return 0
`;

export const XIANGU_SETTLEMENT_STATES = Object.freeze({
  PENDING: 'pending',
  APPLYING: 'applying',
  APPLIED: 'applied',
});

export const XIANGU_SETTLEMENT_PLAYER_CLAIMS = '_xianguSettlementReceipts';

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function required(value, name) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function encodeKeyPart(value, name) {
  return encodeURIComponent(required(value, name));
}

function normalizeTime(value, fallback = Date.now()) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : Math.trunc(fallback);
}

function cloneData(value, fallback = {}) {
  if (value === undefined) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw new TypeError('settlement payload must be JSON serializable');
  }
}

function errorMessage(error) {
  return String(error?.message || error || 'settlement delivery failed').slice(0, 500);
}

function normalizeLegacyRewardPayload(kind, value) {
  const payload = cloneData(value?.payload ?? value?.reward);
  if (!isRecord(payload) || payload.bag || ![
    'treasure-cell',
    'unique-treasure',
    'npc-kill-loot',
    'npc-ecology-loot',
    'marrow-pool',
  ].includes(kind)) return payload;

  // Early receipts stored growth fields directly on payload. Keep those keys
  // for callers that still inspect them, while exposing the current bag shape
  // to the idempotent recovery applier.
  const bagKeys = ['xiuwei', 'xueqi', 'sourceStone', 'potential', 'items', 'seeds', 'techniques'];
  if (!bagKeys.some(key => Object.hasOwn(payload, key))) return payload;
  const bag = {};
  for (const key of bagKeys) {
    if (Object.hasOwn(payload, key)) bag[key] = cloneData(payload[key]);
  }
  return { ...payload, bag };
}

function normalizeOwnerScope(input = {}) {
  if (!isRecord(input)) throw new TypeError('settlement scope must be an object');
  return {
    worldSeed: required(input.worldSeed, 'worldSeed'),
    playerId: required(input.playerId ?? input.recipientId ?? input.claimantId, 'playerId'),
  };
}

export function normalizeXianguSettlementScope(input = {}) {
  const owner = normalizeOwnerScope(input);
  return {
    ...owner,
    receiptId: required(input.receiptId ?? input.idempotencyKey ?? input.id, 'receiptId'),
  };
}

export function getXianguSettlementReceiptKey(input = {}) {
  const scope = normalizeXianguSettlementScope(input);
  return [
    SETTLEMENT_KEY_PREFIX,
    encodeKeyPart(scope.worldSeed, 'worldSeed'),
    encodeKeyPart(scope.playerId, 'playerId'),
    encodeKeyPart(scope.receiptId, 'receiptId'),
  ].join(':');
}

// Receipt locks protect one idempotency key. This second lock serializes all
// receipt load/apply/save cycles for one player so two different rewards cannot
// read the same stale player snapshot and overwrite each other.
export function getXianguSettlementPlayerLockKey(playerId) {
  return [
    SETTLEMENT_KEY_PREFIX,
    'player-lock',
    encodeKeyPart(playerId, 'playerId'),
    'lock',
  ].join(':');
}

export function buildXianguSettlementReceiptId(kind, claimScope = {}, playerId) {
  const normalizedKind = encodeKeyPart(kind, 'kind');
  const worldSeed = encodeKeyPart(claimScope.worldSeed, 'worldSeed');
  const fragmentId = encodeKeyPart(claimScope.fragmentId ?? 'world', 'fragmentId');
  const entityId = encodeKeyPart(claimScope.entityId, 'entityId');
  const recipient = encodeKeyPart(playerId, 'playerId');
  return `xiangu:${normalizedKind}:${worldSeed}:${fragmentId}:${entityId}:${recipient}`;
}

function getReceiptIndexScope(scope) {
  return {
    worldSeed: scope.worldSeed,
    fragmentId: 'settlement-index',
    entityId: scope.playerId,
  };
}

function getGlobalReceiptIndexScope(scope) {
  return {
    worldSeed: 'all-rounds',
    fragmentId: 'settlement-index',
    entityId: scope.playerId,
  };
}

function decodeKeyPart(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
}

// Index documents are an optimization, not the source of truth. Recovery can
// explicitly rebuild its candidate list from durable receipt keys when an
// index write was interrupted by a Redis/shared-document outage.
async function discoverReceiptEntries(redisClient, owner, allWorlds, options = {}) {
  if (options.rebuildIndex !== true || typeof redisClient?.keys !== 'function') return [];
  const playerPart = encodeKeyPart(owner.playerId, 'playerId');
  const worldPart = allWorlds ? '*' : encodeKeyPart(owner.worldSeed, 'worldSeed');
  let keys;
  try {
    keys = await redisClient.keys(`${SETTLEMENT_KEY_PREFIX}:${worldPart}:${playerPart}:*`);
  } catch {
    return [];
  }
  const prefix = `${SETTLEMENT_KEY_PREFIX}:`;
  return (Array.isArray(keys) ? keys : [])
    .map(value => String(value || ''))
    .filter(key => key.startsWith(prefix) && !key.endsWith(':lock'))
    .map(key => key.slice(prefix.length).split(':'))
    .filter(parts => parts.length >= 3)
    .map(parts => ({
      worldSeed: decodeKeyPart(parts.shift()),
      playerId: decodeKeyPart(parts.shift()),
      receiptId: decodeKeyPart(parts.join(':')),
    }))
    .filter(entry => entry.worldSeed && entry.playerId === owner.playerId && entry.receiptId)
    .map(({ worldSeed, receiptId }) => ({ worldSeed, receiptId }));
}

function normalizeStoredReceipt(value, scope) {
  if (!isRecord(value)) return null;
  try {
    const normalizedScope = normalizeXianguSettlementScope({ ...value, ...scope });
    const state = Object.values(XIANGU_SETTLEMENT_STATES).includes(value.state)
      ? value.state
      : XIANGU_SETTLEMENT_STATES.PENDING;
    return {
      receiptId: normalizedScope.receiptId,
      worldSeed: normalizedScope.worldSeed,
      playerId: normalizedScope.playerId,
      kind: String(value.kind || value.type || 'reward'),
      payload: normalizeLegacyRewardPayload(String(value.kind || value.type || 'reward'), value),
      source: cloneData(value.source),
      metadata: cloneData(value.metadata),
      state,
      createdAt: normalizeTime(value.createdAt),
      updatedAt: normalizeTime(value.updatedAt ?? value.createdAt),
      attempts: Math.max(0, Math.trunc(Number(value.attempts) || 0)),
      leaseUntil: Math.max(0, Math.trunc(Number(value.leaseUntil) || 0)),
      appliedAt: Math.max(0, Math.trunc(Number(value.appliedAt) || 0)),
      confirmedAt: Math.max(0, Math.trunc(Number(value.confirmedAt) || 0)),
      lastError: value.lastError ? String(value.lastError).slice(0, 500) : '',
      result: value.result === undefined ? undefined : cloneData(value.result),
    };
  } catch {
    return null;
  }
}

function createReceipt(input, timestamp) {
  const scope = normalizeXianguSettlementScope(input);
  return {
    ...scope,
    kind: String(input.kind || input.type || 'reward'),
    payload: cloneData(input.payload ?? input.reward),
    source: cloneData(input.source ?? input.claim ?? {}),
    metadata: cloneData(input.metadata),
    state: XIANGU_SETTLEMENT_STATES.PENDING,
    createdAt: timestamp,
    updatedAt: timestamp,
    attempts: 0,
    leaseUntil: 0,
    appliedAt: 0,
    confirmedAt: 0,
    lastError: '',
  };
}

async function ensureReceiptTtl(redisClient, key, options = {}) {
  if (typeof redisClient.ttl !== 'function' || typeof redisClient.expire !== 'function') return;
  try {
    if (Number(await redisClient.ttl(key)) === -1) {
      await redisClient.expire(key, resolveXianguSharedStateTtl(options));
    }
  } catch {
    // Cleanup compatibility must not make a pending reward unavailable.
  }
}

async function readReceipt(redisClient, scope, options = {}) {
  const key = getXianguSettlementReceiptKey(scope);
  const raw = await redisClient.get(key);
  if (raw) await ensureReceiptTtl(redisClient, key, options);
  return normalizeStoredReceipt(raw ? JSON.parse(raw) : null, scope);
}

async function readReceiptSafely(redisClient, scope, options = {}) {
  try {
    return await readReceipt(redisClient, scope, options);
  } catch {
    return null;
  }
}

async function writeReceipt(redisClient, receipt, options = {}) {
  await redisClient.set(getXianguSettlementReceiptKey(receipt), JSON.stringify(receipt), {
    EX: resolveXianguSharedStateTtl(options),
  });
  return receipt;
}

async function acquireReceiptLock(redisClient, key, options = {}) {
  const attempts = Math.max(1, Math.trunc(Number(options.attempts) || 40));
  const retryDelay = Math.max(1, Math.trunc(Number(options.retryDelay) || 10));
  const ttlSeconds = Math.max(5, Math.trunc(Number(options.lockTtlSeconds) || RECEIPT_LOCK_TTL_SECONDS));
  const token = `settlement:${Date.now()}:${Math.random().toString(36).slice(2)}`;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await redisClient.set(key, token, { NX: true, EX: ttlSeconds })) return token;
    await new Promise(resolve => setTimeout(resolve, retryDelay));
  }
  return null;
}

async function releaseReceiptLock(redisClient, key, token) {
  try {
    if (typeof redisClient.eval === 'function') {
      await redisClient.eval(RELEASE_LOCK_SCRIPT, { keys: [key], arguments: [token] });
      return;
    }
    if (await redisClient.get(key) === token && typeof redisClient.del === 'function') {
      await redisClient.del(key);
    }
  } catch {
    // The lock has a short Redis expiry. A committed receipt must not be rolled back here.
  }
}

async function withReceiptLock(redisClient, scope, action, options = {}) {
  const receiptKey = getXianguSettlementReceiptKey(scope);
  const token = await acquireReceiptLock(redisClient, `${receiptKey}:lock`, options);
  if (!token) return { locked: false };
  try {
    return await action();
  } finally {
    await releaseReceiptLock(redisClient, `${receiptKey}:lock`, token);
  }
}

async function withPlayerSettlementLock(redisClient, playerId, action, options = {}) {
  const lockKey = getXianguSettlementPlayerLockKey(playerId);
  const lockOptions = {
    ...options,
    attempts: options.playerLockAttempts ?? options.attempts,
    retryDelay: options.playerLockRetryDelay ?? options.retryDelay,
    lockTtlSeconds: options.playerLockTtlSeconds ?? options.lockTtlSeconds ?? PLAYER_LOCK_TTL_SECONDS,
  };
  const token = await acquireReceiptLock(redisClient, lockKey, lockOptions);
  if (!token) return { locked: false };
  try {
    return { locked: true, value: await action() };
  } finally {
    await releaseReceiptLock(redisClient, lockKey, token);
  }
}

async function addReceiptToIndex(redisClient, receipt, timestamp, options = {}) {
  await updateXianguSharedDocument(redisClient, getReceiptIndexScope(receipt), document => {
    const receiptIds = Array.isArray(document.receiptIds)
      ? document.receiptIds.map(String).filter(Boolean)
      : [];
    if (!receiptIds.includes(receipt.receiptId)) receiptIds.push(receipt.receiptId);
    document.receiptIds = receiptIds.slice(-RECEIPT_INDEX_LIMIT);
    document.updatedAt = timestamp;
  }, options);
  await updateXianguSharedDocument(redisClient, getGlobalReceiptIndexScope(receipt), document => {
    const entries = Array.isArray(document.entries) ? document.entries.filter(isRecord) : [];
    if (!entries.some(entry => entry.worldSeed === receipt.worldSeed && entry.receiptId === receipt.receiptId)) {
      entries.push({ worldSeed: receipt.worldSeed, receiptId: receipt.receiptId });
    }
    document.entries = entries.slice(-RECEIPT_INDEX_LIMIT);
    document.updatedAt = timestamp;
  }, options);
}

async function removeReceiptFromIndex(redisClient, receipt, options = {}) {
  await updateXianguSharedDocument(redisClient, getReceiptIndexScope(receipt), document => {
    document.receiptIds = (Array.isArray(document.receiptIds) ? document.receiptIds : [])
      .map(String)
      .filter(receiptId => receiptId && receiptId !== receipt.receiptId);
  }, options);
  await updateXianguSharedDocument(redisClient, getGlobalReceiptIndexScope(receipt), document => {
    document.entries = (Array.isArray(document.entries) ? document.entries : [])
      .filter(entry => isRecord(entry) &&
        (entry.worldSeed !== receipt.worldSeed || entry.receiptId !== receipt.receiptId));
  }, options);
}

async function cleanupAppliedReceiptIndex(redisClient, receipt, options = {}) {
  if (!receipt || receipt.state !== XIANGU_SETTLEMENT_STATES.APPLIED) return;
  try {
    await removeReceiptFromIndex(redisClient, receipt, options);
  } catch {
    // The receipt itself is already confirmed. A stale index is recoverable and must not
    // turn a completed payout back into a pending failure.
  }
}

export async function createXianguSettlementReceipt(redisClient, input = {}, options = {}) {
  const timestamp = normalizeTime(options.now ?? input.createdAt);
  const draft = createReceipt(input, timestamp);
  const key = getXianguSettlementReceiptKey(draft);
  let created = Boolean(await redisClient.set(key, JSON.stringify(draft), {
    NX: true,
    EX: resolveXianguSharedStateTtl(options),
  }));
  let repaired = false;
  let receipt = created ? draft : await readReceiptSafely(redisClient, draft, options);

  if (!receipt) {
    const repair = await withReceiptLock(redisClient, draft, async () => {
      const current = await readReceiptSafely(redisClient, draft, options);
      if (current) return { receipt: current, repaired: false };
      await writeReceipt(redisClient, draft, options);
      return { receipt: draft, repaired: true };
    }, options);
    if (!repair.locked) throw new Error('settlement receipt is busy');
    receipt = repair.receipt;
    repaired = repair.repaired;
    created = created || repaired;
  }

  try {
    await addReceiptToIndex(redisClient, receipt, timestamp, options);
  } catch (error) {
    // The receipt key is already durable. Indexes are only a recovery aid, so
    // an intermittent shared-document failure must not strand a payout in a
    // pending state or force callers back to a non-idempotent fallback.
    console.error('[仙古结算] 收据索引更新失败，将由后续重试修复:', error);
  }
  return { created, repaired, receipt };
}

export async function getXianguSettlementReceipt(redisClient, input = {}, options = {}) {
  const scope = normalizeXianguSettlementScope(input);
  return readReceiptSafely(redisClient, scope, options);
}

export async function listXianguSettlementReceipts(redisClient, input = {}, options = {}) {
  const owner = normalizeOwnerScope(input);
  const allWorlds = options.allWorlds === true;
  const document = await readXianguSharedDocument(
    redisClient,
    allWorlds ? getGlobalReceiptIndexScope(owner) : getReceiptIndexScope(owner),
    options,
  );
  const entries = allWorlds
    ? (Array.isArray(document.entries) ? document.entries : [])
      .filter(isRecord)
      .map(entry => ({ worldSeed: String(entry.worldSeed || ''), receiptId: String(entry.receiptId || '') }))
      .filter(entry => entry.worldSeed && entry.receiptId)
    : (Array.isArray(document.receiptIds) ? document.receiptIds : [])
      .map(receiptId => ({ worldSeed: owner.worldSeed, receiptId: String(receiptId || '') }))
      .filter(entry => entry.receiptId);
  const discoveredEntries = await discoverReceiptEntries(redisClient, owner, allWorlds, options);
  const uniqueEntries = [...new Map([...entries, ...discoveredEntries].map(entry => [
    `${entry.worldSeed}:${entry.receiptId}`,
    entry,
  ])).values()];
  const receipts = (await Promise.all(uniqueEntries.map(entry =>
    getXianguSettlementReceipt(redisClient, { ...owner, ...entry }, options)
  ))).filter(Boolean);
  const includeApplied = options.includeApplied === true;
  const limit = Math.max(1, Math.trunc(Number(options.limit) || RECEIPT_INDEX_LIMIT));
  return receipts
    .filter(receipt => includeApplied || receipt.state !== XIANGU_SETTLEMENT_STATES.APPLIED)
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(0, limit);
}

export function hasXianguSettlementReceiptClaim(player, receiptOrId) {
  if (!isRecord(player)) return false;
  const receiptId = typeof receiptOrId === 'string'
    ? receiptOrId.trim()
    : String(receiptOrId?.receiptId || '').trim();
  return Boolean(receiptId && isRecord(player[XIANGU_SETTLEMENT_PLAYER_CLAIMS]) &&
    player[XIANGU_SETTLEMENT_PLAYER_CLAIMS][receiptId]);
}

export function markXianguSettlementReceiptClaim(player, receipt, options = {}) {
  if (!isRecord(player)) throw new TypeError('player must be an object');
  const receiptId = required(receipt?.receiptId ?? receipt, 'receiptId');
  const claims = isRecord(player[XIANGU_SETTLEMENT_PLAYER_CLAIMS])
    ? player[XIANGU_SETTLEMENT_PLAYER_CLAIMS]
    : {};
  const existing = claims[receiptId];
  if (!existing) {
    claims[receiptId] = {
      claimedAt: normalizeTime(options.now),
      worldSeed: String(receipt?.worldSeed || ''),
      kind: String(receipt?.kind || 'reward'),
    };
  }
  const stale = Object.entries(claims)
    .sort((left, right) => Number(right[1]?.claimedAt) - Number(left[1]?.claimedAt))
    .slice(PLAYER_RECEIPT_LIMIT);
  for (const [id] of stale) delete claims[id];
  player[XIANGU_SETTLEMENT_PLAYER_CLAIMS] = claims;
  return { marked: !existing, claim: claims[receiptId] };
}

export async function confirmXianguSettlementReceipt(redisClient, input = {}, details = {}, options = {}) {
  const scope = normalizeXianguSettlementScope(input);
  const timestamp = normalizeTime(options.now ?? details.now);
  const run = async () => {
    const outcome = await withReceiptLock(redisClient, scope, async () => {
      const receipt = await readReceiptSafely(redisClient, scope, options);
      if (!receipt) return { status: 'missing', receipt: null };
      if (receipt.state === XIANGU_SETTLEMENT_STATES.APPLIED) {
        return { status: 'already-applied', receipt };
      }
      receipt.state = XIANGU_SETTLEMENT_STATES.APPLIED;
      receipt.leaseUntil = 0;
      receipt.appliedAt ||= timestamp;
      receipt.confirmedAt = timestamp;
      receipt.updatedAt = timestamp;
      receipt.lastError = '';
      if (details.result !== undefined) receipt.result = cloneData(details.result);
      await writeReceipt(redisClient, receipt, options);
      return { status: 'applied', receipt };
    }, options);
    // The receipt key is durable even while another worker owns the short
    // delivery lock. Return it with the busy result so callers can retain a
    // local claim marker and retry without paying the payload twice.
    const result = outcome.locked === false
      ? { status: 'busy', receipt: await readReceiptSafely(redisClient, scope, options) }
      : outcome;
    await cleanupAppliedReceiptIndex(redisClient, result.receipt, options);
    return result;
  };

  const playerOutcome = await withPlayerSettlementLock(redisClient, scope.playerId, run, options);
  if (!playerOutcome.locked) {
    return {
      status: 'busy',
      receipt: await readReceiptSafely(redisClient, scope, options),
    };
  }
  return playerOutcome.value;
}

export async function retryXianguSettlementReceipt(redisClient, input = {}, handlers = {}, options = {}) {
  const scope = normalizeXianguSettlementScope(input);
  const apply = typeof handlers === 'function' ? handlers : handlers.apply;
  const isApplied = typeof handlers === 'function' ? null : handlers.isApplied;
  if (typeof apply !== 'function') throw new TypeError('handlers.apply must be a function');

  const timestamp = normalizeTime(options.now);
  const leaseMs = Math.max(5_000, Math.trunc(Number(options.leaseMs) || RECEIPT_LOCK_TTL_SECONDS * 1000));
  const run = async () => {
    const outcome = await withReceiptLock(redisClient, scope, async () => {
      const receipt = await readReceiptSafely(redisClient, scope, options);
      if (!receipt) return { status: 'missing', receipt: null };
      if (receipt.state === XIANGU_SETTLEMENT_STATES.APPLIED) {
        return { status: 'already-applied', receipt };
      }
      if (receipt.state === XIANGU_SETTLEMENT_STATES.APPLYING && receipt.leaseUntil > timestamp) {
        return { status: 'busy', receipt };
      }

      if (typeof isApplied === 'function' && await isApplied(receipt)) {
        receipt.state = XIANGU_SETTLEMENT_STATES.APPLIED;
        receipt.leaseUntil = 0;
        receipt.appliedAt ||= timestamp;
        receipt.confirmedAt = timestamp;
        receipt.updatedAt = timestamp;
        receipt.lastError = '';
        await writeReceipt(redisClient, receipt, options);
        return { status: 'recovered', receipt, result: { alreadyApplied: true } };
      }

      receipt.state = XIANGU_SETTLEMENT_STATES.APPLYING;
      receipt.attempts += 1;
      receipt.leaseUntil = timestamp + leaseMs;
      receipt.updatedAt = timestamp;
      receipt.lastError = '';
      await writeReceipt(redisClient, receipt, options);

      try {
        const result = await apply(receipt, {
          receiptId: receipt.receiptId,
          hasPlayerClaim: player => hasXianguSettlementReceiptClaim(player, receipt),
          markPlayerClaim: (player, markOptions) => markXianguSettlementReceiptClaim(player, receipt, {
            now: timestamp,
            ...markOptions,
          }),
        });
        receipt.state = XIANGU_SETTLEMENT_STATES.APPLIED;
        receipt.leaseUntil = 0;
        receipt.appliedAt = timestamp;
        receipt.confirmedAt = timestamp;
        receipt.updatedAt = timestamp;
        receipt.lastError = '';
        receipt.result = result === undefined ? undefined : cloneData(result);
        await writeReceipt(redisClient, receipt, options);
        return {
          status: result?.claimRejected
            ? 'rejected'
            : result?.alreadyApplied
              ? 'recovered'
              : 'applied',
          receipt,
          result,
        };
      } catch (error) {
        receipt.state = XIANGU_SETTLEMENT_STATES.PENDING;
        receipt.leaseUntil = 0;
        receipt.updatedAt = timestamp;
        receipt.lastError = errorMessage(error);
        await writeReceipt(redisClient, receipt, options);
        const failure = { status: 'pending', receipt, error };
        if (options.throwOnError) throw error;
        return failure;
      }
    }, options);
    // The receipt key is durable even while another worker owns the short
    // delivery lock. Return it with the busy result so callers can retain a
    // local claim marker and retry without paying the payload twice.
    const result = outcome.locked === false
      ? { status: 'busy', receipt: await readReceiptSafely(redisClient, scope, options) }
      : outcome;
    await cleanupAppliedReceiptIndex(redisClient, result.receipt, options);
    return result;
  };

  const playerOutcome = await withPlayerSettlementLock(redisClient, scope.playerId, run, options);
  if (!playerOutcome.locked) {
    return {
      status: 'busy',
      receipt: await readReceiptSafely(redisClient, scope, options),
    };
  }
  return playerOutcome.value;
}

export async function deliverXianguSettlementReceipt(redisClient, input = {}, handlers = {}, options = {}) {
  if (typeof handlers.loadPlayer !== 'function' || typeof handlers.savePlayer !== 'function') {
    throw new TypeError('handlers.loadPlayer and handlers.savePlayer must be functions');
  }
  if (typeof handlers.apply !== 'function') throw new TypeError('handlers.apply must be a function');

  return retryXianguSettlementReceipt(redisClient, input, {
    isApplied: async receipt => {
      const player = await handlers.loadPlayer(receipt.playerId, receipt);
      return hasXianguSettlementReceiptClaim(player, receipt) ||
        Boolean(typeof handlers.isApplied === 'function' && await handlers.isApplied(player, receipt));
    },
    apply: async (receipt, context) => {
      const player = await handlers.loadPlayer(receipt.playerId, receipt);
      if (!isRecord(player)) throw new TypeError('player record is unavailable');
      if (context.hasPlayerClaim(player) ||
        Boolean(typeof handlers.isApplied === 'function' && await handlers.isApplied(player, receipt))) {
        return { alreadyApplied: true };
      }

      if (typeof handlers.claim === 'function') {
        // Claiming runs under the same player lock as apply/save. A transient
        // claim error is allowed to throw and leaves the receipt pending; only
        // an explicit non-accepted result is terminally rejected.
        const claimResult = await handlers.claim(player, receipt, context);
        const accepted = claimResult === true ||
          claimResult?.claimed === true ||
          claimResult?.marked === true;
        if (!accepted) {
          if (claimResult?.pending === true || claimResult?.retry === true) {
            throw new Error('settlement claim is pending');
          }
          if (typeof handlers.onClaimRejected === 'function') {
            await handlers.onClaimRejected(player, receipt, claimResult, context);
          }
          // Persist a player-side marker even though the reward payload is not
          // applied. This prevents a later recovery pass from paying a claim
          // that lost its shared world slot.
          context.markPlayerClaim(player);
          const saved = await handlers.savePlayer(receipt.playerId, player, receipt);
          if (saved === false) throw new Error('player record was not saved');
          return { claimRejected: true, claim: claimResult };
        }
      }

      const result = await handlers.apply(player, receipt, context);
      context.markPlayerClaim(player);
      const saved = await handlers.savePlayer(receipt.playerId, player, receipt);
      if (saved === false) throw new Error('player record was not saved');
      return result;
    },
  }, options);
}

export async function recoverXianguSettlementReceipts(redisClient, input = {}, handlers = {}, options = {}) {
  const receipts = await listXianguSettlementReceipts(redisClient, input, {
    ...options,
    allWorlds: options.allWorlds !== false,
  });
  const kindFilter = Array.isArray(options.kinds)
    ? new Set(options.kinds.map(value => String(value || '').trim()).filter(Boolean))
    : options.kind
      ? new Set([String(options.kind).trim()])
      : null;
  const results = [];
  for (const receipt of receipts) {
    if (kindFilter && !kindFilter.has(receipt.kind)) continue;
    results.push(await deliverXianguSettlementReceipt(redisClient, receipt, handlers, options));
  }
  return results;
}
