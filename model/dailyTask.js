import { getShanghaiDateKey } from './weimianTravel.js';

export const DAILY_TASK_WENXIAN_EXP = 1500;
export const DAILY_TASK_LINGSHI_PROGRESS_FIELD = '_dailyTaskLingshiProgress';

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

export function resetDailyTaskLingshiProgress(player, now = Date.now()) {
  const progress = { date: getDailyTaskDateKey(now), gained: 0, spent: 0 };
  player[DAILY_TASK_LINGSHI_PROGRESS_FIELD] = progress;
  return progress;
}

export function updateDailyTaskLingshiProgress(previousPlayer, nextPlayer, now = Date.now()) {
  const date = getDailyTaskDateKey(now);
  const previous = previousPlayer?.[DAILY_TASK_LINGSHI_PROGRESS_FIELD];
  const progress = previous?.date === date
    ? {
        date,
        gained: Math.max(0, Number(previous.gained) || 0),
        spent: Math.max(0, Number(previous.spent) || 0),
      }
    : { date, gained: 0, spent: 0 };
  const delta = (Number(nextPlayer?.灵石) || 0) - (Number(previousPlayer?.灵石) || 0);
  if (delta > 0) progress.gained += delta;
  if (delta < 0) progress.spent += -delta;
  nextPlayer[DAILY_TASK_LINGSHI_PROGRESS_FIELD] = progress;
  return progress;
}

export function getDailyTaskLingshiProgress(player, now = Date.now()) {
  const progress = player?.[DAILY_TASK_LINGSHI_PROGRESS_FIELD];
  if (progress?.date !== getDailyTaskDateKey(now)) return { gained: 0, spent: 0 };
  return {
    gained: Math.max(0, Number(progress.gained) || 0),
    spent: Math.max(0, Number(progress.spent) || 0),
  };
}
