import { getDailyTaskDateKey } from './dailyTask.js';

const CLAIM_TTL_SECONDS = 2 * 24 * 60 * 60;

export function getDailyActionClaimKey(playerId, action, now = Date.now()) {
  return `xiuxian:player:${playerId}:daily_action_claim:${action}:${getDailyTaskDateKey(now)}`;
}

export async function reserveDailyAction(redisClient, playerId, action, now = Date.now()) {
  const key = getDailyActionClaimKey(playerId, action, now);
  return Boolean(await redisClient.set(key, '1', { NX: true, EX: CLAIM_TTL_SECONDS }));
}

export async function resetDailyAction(redisClient, playerId, action, now = Date.now()) {
  return redisClient.del(getDailyActionClaimKey(playerId, action, now));
}
