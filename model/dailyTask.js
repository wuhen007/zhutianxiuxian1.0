import { getShanghaiDateKey } from './weimianTravel.js';

export const DAILY_TASK_WENXIAN_EXP = 50;

export function getDailyTaskDateKey(timestamp = Date.now()) {
  return getShanghaiDateKey(timestamp);
}

export function findDailyTaskIndex(records, playerId) {
  if (!Array.isArray(records)) return -1;
  return records.findIndex(record => String(record?.player) === String(playerId));
}

export function wasDailyTaskAcceptedToday(timestamp, now = Date.now()) {
  const acceptedAt = Number(timestamp);
  return Number.isFinite(acceptedAt)
    && acceptedAt > 0
    && getDailyTaskDateKey(acceptedAt) === getDailyTaskDateKey(now);
}

export function isDailyTaskComplete(record) {
  return record?.wancheng1 === 2
    && record?.wancheng2 === 2
    && record?.wancheng3 === 2;
}

export function getDailyTaskPotentialReward(player) {
  const secretRealmLevel = Math.max(0, Math.floor(Number(player?.mijinglevel_id) || 0));
  const ancientRealmLevel = Math.max(0, Math.floor(Number(player?.xiangulevel_id) || 0));
  return Math.max(secretRealmLevel, ancientRealmLevel) * 10;
}
