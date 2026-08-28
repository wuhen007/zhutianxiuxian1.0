import { withPlayerMutationLock } from '../utils/playerMutationLock.js';

const MINUTE_MS = 60 * 1000;
const SETTLEMENT_LOCK_TTL_SECONDS = 5 * 60;
const RELEASE_LOCK_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  end
  return 0
`;
const RENEW_LOCK_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('expire', KEYS[1], ARGV[2])
  end
  return 0
`;

export const SECRET_PLACE_SETTLEMENT_BUSY = Symbol('secret-place-settlement-busy');

export function hasPendingSecretPlaceSettlement(action) {
  if (!action || typeof action !== 'object' || action.is_jiesuan == 1) return false;
  return action.Place_action == '0' || action.Place_actionplus == '0';
}

export function getSecretPlaceSettlementLockKey(playerId) {
  return `xiuxian:player:${String(playerId)}:secret-place-settlement-lock`;
}

async function releaseSettlementLock(redisClient, key, token) {
  try {
    if (typeof redisClient.eval === 'function') {
      await redisClient.eval(RELEASE_LOCK_SCRIPT, { keys: [key], arguments: [token] });
      return;
    }
    if (await redisClient.get(key) === token && typeof redisClient.del === 'function') {
      await redisClient.del(key);
    }
  } catch (error) {
    console.error(`[秘境结算] 释放玩家锁失败 ${key}:`, error);
  }
}

export async function withSecretPlaceSettlementLock(playerId, task, options = {}) {
  return withPlayerMutationLock(playerId, async () => {
    const redisClient = options.redisClient ?? globalThis.redis;
    if (!redisClient?.set) return task();

    const ttlSeconds = Math.max(30, Math.trunc(Number(options.ttlSeconds) || SETTLEMENT_LOCK_TTL_SECONDS));
    const key = getSecretPlaceSettlementLockKey(playerId);
    const token = `secret-place:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const acquired = await redisClient.set(key, token, { NX: true, EX: ttlSeconds });
    if (!acquired) return SECRET_PLACE_SETTLEMENT_BUSY;

    let renewing = false;
    const renewTimer = typeof redisClient.eval === 'function'
      ? setInterval(async () => {
          if (renewing) return;
          renewing = true;
          try {
            await redisClient.eval(RENEW_LOCK_SCRIPT, {
              keys: [key],
              arguments: [token, String(ttlSeconds)],
            });
          } catch (error) {
            console.error(`[秘境结算] 续租玩家锁失败 ${key}:`, error);
          } finally {
            renewing = false;
          }
        }, Math.max(10_000, Math.floor(ttlSeconds * 1000 / 3)))
      : null;
    renewTimer?.unref?.();

    try {
      return await task();
    } finally {
      if (renewTimer) clearInterval(renewTimer);
      await releaseSettlementLock(redisClient, key, token);
    }
  });
}

export function getSecretPlaceActionEndTime(action) {
  if (!action || typeof action !== 'object') return NaN;
  if (action.Place_actionplus == '0') {
    return Number(action.start_time) + Number(action.total_time) * MINUTE_MS;
  }
  return Number(action.end_time);
}

export function accelerateSecretPlaceAction(action, requestedReduceMs, now = Date.now()) {
  const reduceMs = Math.max(0, Math.trunc(Number(requestedReduceMs) || 0));
  const timestamp = Math.trunc(Number(now) || Date.now());
  const endTime = getSecretPlaceActionEndTime(action);
  if (!Number.isFinite(endTime) || endTime <= timestamp || reduceMs <= 0) {
    return { action: { ...action }, actualReduceMs: 0, endTime };
  }

  const actualReduceMs = Math.min(reduceMs, endTime - timestamp);
  const next = { ...action };
  if (next.Place_actionplus == '0') {
    const startTime = Number(next.start_time);
    const totalCount = Math.max(1, Math.trunc(Number(next.total_count) || 1));
    const settledCount = Math.max(0, Math.trunc(Number(next.settled_count) || 0));
    const durationMs = Math.max(0, Number(next.total_time) * MINUTE_MS - actualReduceMs);
    const interval = durationMs / totalCount;
    next.total_time = durationMs / MINUTE_MS;
    next.remaining_time = Math.max(0, (startTime + durationMs - timestamp) / MINUTE_MS);
    next.interval = interval;
    next.next_settle_time = Math.max(timestamp, startTime + interval * (settledCount + 1));
    return { action: next, actualReduceMs, endTime: startTime + durationMs };
  }

  next.end_time = endTime - actualReduceMs;
  return { action: next, actualReduceMs, endTime: next.end_time };
}

export async function recordSecretPlaceItemToHistory(redisClient, playerId, itemName, itemClass, count = 1) {
  try {
    const key = `xiuxian:player:${String(playerId)}:addiction_history`;
    const raw = await redisClient.get(key);
    if (!raw) return false;
    const history = JSON.parse(raw);
    history.items_gained = Array.isArray(history.items_gained) ? history.items_gained : [];
    const existing = history.items_gained.find(item => item.name === itemName);
    if (existing) {
      existing.count = (Number(existing.count) || 0) + count;
    } else {
      history.items_gained.push({ name: itemName, class: itemClass || '道具', count });
    }
    await redisClient.set(key, JSON.stringify(history));
    return true;
  } catch (error) {
    console.error(`[秘境结算] 记录物品历史失败 ${playerId}/${itemName}:`, error);
    return false;
  }
}

export function createSecretPlaceAddictionAction({
  durationMinutes,
  totalCount,
  place,
  xf,
  now = Date.now(),
}) {
  const interval = durationMinutes * MINUTE_MS / totalCount;

  return {
    action: '秘境历练',
    start_time: now,
    total_time: durationMinutes,
    remaining_time: durationMinutes,
    total_count: totalCount,
    settled_count: 0,
    interval,
    next_settle_time: now + interval,
    shutup: '1',
    working: '1',
    Place_action: '1',
    Place_actionplus: '0',
    power_up: '1',
    mojie: '1',
    xijie: '1',
    plant: '1',
    mine: '1',
    Place_address: place,
    XF: xf,
  };
}

export function normalizeLegacySecretPlaceAddictionAction(action) {
  if (!action || action.Place_actionplus != '0' || action.next_settle_time != null) {
    return action;
  }

  const totalCount = Number(action.total_count ?? action.cishu);
  const settledCount = Number(action.settled_count ?? 0);
  const durationMs = action.total_time != null
    ? Number(action.total_time) * MINUTE_MS
    : Number(action.time);
  const startTime = action.start_time != null
    ? Number(action.start_time)
    : Number(action.end_time) - durationMs;

  if (
    !Number.isFinite(totalCount) || totalCount <= 0 ||
    !Number.isFinite(settledCount) || settledCount < 0 ||
    !Number.isFinite(durationMs) || durationMs <= 0 ||
    !Number.isFinite(startTime)
  ) {
    return action;
  }

  const interval = durationMs / totalCount;
  return {
    ...action,
    start_time: startTime,
    total_time: durationMs / MINUTE_MS,
    remaining_time: Math.max(0, (totalCount - settledCount) * interval / MINUTE_MS),
    total_count: totalCount,
    settled_count: settledCount,
    interval,
    next_settle_time: startTime + interval * (settledCount + 1),
  };
}
