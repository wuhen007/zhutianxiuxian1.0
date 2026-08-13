import { getDailyTaskDateKey } from "./dailyTask.js";

export const FACTION_NONE = "无";
export const FACTION_EXIT_COOLDOWN_MS = 72 * 60 * 60 * 1000;
export const FACTION_ELITE_EXIT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export const FACTION_POSITION_ORDER = {
  瑶池: ["记名女弟子", "正式女弟子", "亲传女弟子", "真传女弟子", "圣女"],
  摇光圣地: [
    "记名弟子",
    "外门弟子",
    "内门弟子",
    "核心弟子",
    "真传弟子",
    "圣子",
    "圣女",
  ],
  剑云海: ["传人"],
  菩提基因: ["外勤进化者"],
  大梦净土: ["外门弟子"],
  阳间第一山: ["记名门徒"],
};

const ELITE_POSITIONS = new Set(["圣子", "圣女", "传人"]);

function getHistoryEntry(player, faction, create = false) {
  if (!player || !faction || faction === FACTION_NONE) return null;
  if (!player.势力履历) {
    if (!create) return null;
    player.势力履历 = {};
  }
  if (!player.势力履历[faction] && create) {
    player.势力履历[faction] = {
      已领取入门奖励: false,
      已领取晋升奖励: [],
    };
  }
  return player.势力履历[faction] || null;
}

function updateHighestPosition(entry, faction, position) {
  if (!position) return;
  const order = FACTION_POSITION_ORDER[faction] || [];
  const nextIndex = order.indexOf(position);
  const currentIndex = order.indexOf(entry.最高职位);
  if (!entry.最高职位 || nextIndex > currentIndex) entry.最高职位 = position;
}

export function getFactionDateKey(now = Date.now()) {
  return getDailyTaskDateKey(now);
}

export function wasFactionRewardClaimedToday(value, now = Date.now()) {
  if (value === null || value === undefined || value === "") return false;
  const currentKey = getFactionDateKey(now);
  const stored = String(value);
  if (stored === currentKey) return true;
  return /^\d{1,2}$/.test(stored) && Number(stored) === Number(currentKey.slice(-2));
}

export function isFactionMember(player, faction) {
  return player?.势力 === faction;
}

export function getFactionJoinBlock(player, now = Date.now()) {
  if (player?.势力 && player.势力 !== FACTION_NONE) {
    return { ok: false, reason: "member", faction: player.势力 };
  }
  const cooldownUntil = Number(player?.势力脱离冷却至) || 0;
  if (cooldownUntil > now) {
    return {
      ok: false,
      reason: "cooldown",
      cooldownUntil,
      remainingMs: cooldownUntil - now,
    };
  }
  return { ok: true };
}

export function formatFactionCooldown(milliseconds) {
  const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return [days && `${days}天`, hours && `${hours}小时`, minutes && `${minutes}分钟`]
    .filter(Boolean)
    .join("");
}

export function hasClaimedFactionJoinReward(player, faction) {
  return Boolean(getHistoryEntry(player, faction)?.已领取入门奖励);
}

export function recordFactionJoin(player, faction, position, now = Date.now(), firstJoin = false) {
  const entry = getHistoryEntry(player, faction, true);
  if (firstJoin) entry.已领取入门奖励 = true;
  entry.最近加入时间 = now;
  updateHighestPosition(entry, faction, position);
  return entry;
}

export function hasClaimedFactionPositionReward(player, faction, position) {
  const rewards = getHistoryEntry(player, faction)?.已领取晋升奖励;
  return Array.isArray(rewards) && rewards.includes(position);
}

export function recordFactionPositionReward(player, faction, position) {
  const entry = getHistoryEntry(player, faction, true);
  entry.已领取晋升奖励 ??= [];
  if (!entry.已领取晋升奖励.includes(position)) {
    entry.已领取晋升奖励.push(position);
  }
  updateHighestPosition(entry, faction, position);
  return entry;
}

export function getFactionExitCooldownMs(position) {
  return ELITE_POSITIONS.has(position)
    ? FACTION_ELITE_EXIT_COOLDOWN_MS
    : FACTION_EXIT_COOLDOWN_MS;
}

export function applyFactionExit(player, now = Date.now()) {
  const faction = player?.势力;
  const position = player?.势力职位 || "";
  if (!faction || faction === FACTION_NONE) return null;

  const entry = getHistoryEntry(player, faction, true);
  entry.已领取入门奖励 = true;
  entry.已领取晋升奖励 ??= [];
  const order = FACTION_POSITION_ORDER[faction] || [];
  const currentIndex = order.indexOf(position);
  for (const earnedPosition of order.slice(1, currentIndex + 1)) {
    if (!entry.已领取晋升奖励.includes(earnedPosition)) {
      entry.已领取晋升奖励.push(earnedPosition);
    }
  }
  updateHighestPosition(entry, faction, position);
  entry.最近脱离时间 = now;

  const cooldownMs = getFactionExitCooldownMs(position);
  player.势力 = FACTION_NONE;
  player.势力职位 = "";
  player.势力脱离冷却至 = now + cooldownMs;

  return { faction, position, cooldownMs, cooldownUntil: player.势力脱离冷却至 };
}
