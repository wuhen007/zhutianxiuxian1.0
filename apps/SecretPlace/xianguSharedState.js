const KEY_PREFIX = 'xiuxian:xiangu:shared';
export const XIANGU_SHARED_STATE_TTL_SECONDS = 30 * 24 * 60 * 60;
export const XIANGU_SHARED_STATE_MIN_TTL_SECONDS = 60;
export const XIANGU_SHARED_STATE_MAX_TTL_SECONDS = 90 * 24 * 60 * 60;
const DOCUMENT_LOCK_TTL_SECONDS = 5;
const RELEASE_DOCUMENT_LOCK_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  end
  return 0
`;

function required(value, name) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${name}不能为空`);
  return normalized;
}

function encodeKeyPart(value, name) {
  return encodeURIComponent(required(value, name));
}

/** Keep shared round state finite even when a round is manually left open. */
export function resolveXianguSharedStateTtl(options = {}) {
  const raw = Number(options?.ttlSeconds);
  if (!Number.isFinite(raw) || raw <= 0) return XIANGU_SHARED_STATE_TTL_SECONDS;
  return Math.min(
    XIANGU_SHARED_STATE_MAX_TTL_SECONDS,
    Math.max(XIANGU_SHARED_STATE_MIN_TTL_SECONDS, Math.trunc(raw)),
  );
}

export function getXianguSharedStateKey(kind, scope = {}) {
  return [
    KEY_PREFIX,
    encodeKeyPart(scope.worldSeed, 'worldSeed'),
    encodeKeyPart(scope.fragmentId, 'fragmentId'),
    encodeKeyPart(kind, 'kind'),
    encodeKeyPart(scope.entityId, 'entityId'),
  ].join(':');
}

function parseRecord(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { claimantId: '', claimantName: '', claimedAt: 0 };
  }
}

function parseDocument(raw) {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function releaseDocumentLock(redisClient, key, token) {
  try {
    if (typeof redisClient.eval === 'function') {
      await redisClient.eval(RELEASE_DOCUMENT_LOCK_SCRIPT, {
        keys: [key],
        arguments: [token],
      });
      return;
    }
    if (await redisClient.get(key) === token && typeof redisClient.del === 'function') {
      await redisClient.del(key);
    }
  } catch {
    // 锁有5秒租期；文档若已提交，不应因释放失败让调用方误判并回滚奖励。
  }
}

async function ensureLegacyTtl(redisClient, key, ttlSeconds) {
  // New keys use SET EX atomically. Only migrate truly persistent legacy keys;
  // refreshing an existing TTL on every read would keep abandoned rounds alive.
  if (typeof redisClient.ttl !== 'function' || typeof redisClient.expire !== 'function') return;
  try {
    if (Number(await redisClient.ttl(key)) === -1) {
      await redisClient.expire(key, ttlSeconds);
    }
  } catch {
    // TTL migration is cleanup only. Reads and claims must remain available when
    // an older Redis wrapper does not expose a compatible TTL command.
  }
}

async function claim(redisClient, kind, scope, claimant = {}, now = Date.now(), options = {}) {
  const key = getXianguSharedStateKey(kind, scope);
  const ttlSeconds = resolveXianguSharedStateTtl(options);
  const record = {
    claimantId: required(claimant.id, 'claimant.id'),
    claimantName: String(claimant.name || claimant.id),
    claimedAt: Math.max(0, Math.trunc(Number(now) || 0)),
    ...(options.meta && typeof options.meta === 'object' ? options.meta : {}),
  };
  const claimed = Boolean(await redisClient.set(key, JSON.stringify(record), {
    NX: true,
    EX: ttlSeconds,
  }));
  const existing = claimed ? null : await redisClient.get(key);
  if (existing) await ensureLegacyTtl(redisClient, key, ttlSeconds);
  return {
    claimed,
    record: claimed ? record : parseRecord(existing),
  };
}

async function getRecord(redisClient, kind, scope, options = {}) {
  const key = getXianguSharedStateKey(kind, scope);
  const raw = await redisClient.get(key);
  if (raw) await ensureLegacyTtl(redisClient, key, resolveXianguSharedStateTtl(options));
  return parseRecord(raw);
}

export function claimXianguUniqueTreasure(redisClient, scope, claimant, now, options) {
  return claim(redisClient, 'treasure', scope, claimant, now, options);
}

export function getXianguUniqueTreasureClaim(redisClient, scope, options) {
  return getRecord(redisClient, 'treasure', scope, options);
}

export async function markXianguNpcDead(redisClient, scope, killer, now, options) {
  const result = await claim(redisClient, 'npc-death', scope, killer, now, options);
  return { marked: result.claimed, death: result.record };
}

export function getXianguNpcDeath(redisClient, scope, options) {
  return getRecord(redisClient, 'npc-death', scope, options);
}

export async function getDeadXianguNpcIds(redisClient, scope, npcIds = [], options) {
  const uniqueIds = [...new Set(npcIds.map(String).filter(Boolean))];
  const deaths = await Promise.all(uniqueIds.map(entityId =>
    getXianguNpcDeath(redisClient, { ...scope, entityId }, options)
  ));
  return uniqueIds.filter((_, index) => deaths[index]);
}

export async function readXianguSharedDocument(redisClient, scope, options = {}) {
  const key = getXianguSharedStateKey('document', scope);
  const raw = await redisClient.get(key);
  if (raw) await ensureLegacyTtl(redisClient, key, resolveXianguSharedStateTtl(options));
  return parseDocument(raw);
}

export async function updateXianguSharedDocument(redisClient, scope, updater, options = {}) {
  if (typeof updater !== 'function') throw new TypeError('updater必须是函数');
  const key = getXianguSharedStateKey('document', scope);
  const lockKey = `${key}:lock`;
  const attempts = Math.max(1, Math.trunc(Number(options.attempts) || 50));
  const retryDelay = Math.max(1, Math.trunc(Number(options.retryDelay) || 5));
  const ttlSeconds = resolveXianguSharedStateTtl(options);
  const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const acquired = await redisClient.set(lockKey, token, { NX: true, EX: DOCUMENT_LOCK_TTL_SECONDS });
    if (!acquired) {
      await wait(retryDelay);
      continue;
    }

    try {
      const document = parseDocument(await redisClient.get(key));
      const value = await updater(document);
      await redisClient.set(key, JSON.stringify(document), { EX: ttlSeconds });
      return { document, value };
    } finally {
      await releaseDocumentLock(redisClient, lockKey, token);
    }
  }

  throw new Error('仙古共享状态繁忙，请稍后再试');
}
