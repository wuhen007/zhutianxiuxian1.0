/**
 * 夜间静默（Night Quiet）
 *
 * 目的：每天 startHour 至 endHour 之间不再产生世界事件推送，同时冻结对应玩法：
 *   - 时代定时任务整体跳过 → 域外灾厄不生成、绝灵侵蚀不扣纳戒、限时裂界不开启、
 *     仙路不判定、仙古秘境/大道炉/天骄成长/位面修复全部停摆；
 *   - 维度镇守（永恒大战）定时任务跳过 → 厄土大恐怖/维度灾厄不来袭。
 *
 * 设计要点：
 *   1. 只挡「定时任务」，玩家主动指令与管理员手动推进不受影响；
 *   2. 跳过 = 什么都没发生，不需要任何持久化状态，进程重启也安全；
 *   3. 恢复由原有 cron 自然完成（整点触发），不需要额外唤醒定时器；
 *   4. 唯一需要补偿的是裂界的绝对到期时间（见 planeRiftFestival.extendRiftsForQuiet）。
 *
 * 配置位于 config/xiuxian/xiuxian.yaml 的 Era.nightQuiet。
 */
import config from './Config.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** 主配置每次读取都要解析 YAML，这里做 5 秒缓存，避免定时任务与查询互相拖慢 */
const CACHE_MS = 5000;

const DEFAULTS = {
  enabled: false,
  startHour: 0,
  endHour: 8,
  timezoneOffset: 8,
  pauseWorldClock: true,
  pauseDimensionGuard: true,
  extendRifts: true,
  resumeGraceMinutes: 10,
};

let cache = null;
let cacheAt = 0;

function normalizeHour(value, fallback) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 24) return fallback;
  return numeric;
}

function normalizeOffset(value) {
  const numeric = Number(value);
  // 只支持整小时时区（默认 UTC+8），避免半小时时区把窗口算歪。
  if (!Number.isFinite(numeric) || Math.abs(numeric) > 14) return DEFAULTS.timezoneOffset;
  return Math.trunc(numeric);
}

/** 读取并归一化夜间静默配置；读失败按「关闭」处理，绝不因为配置异常把世界卡死。 */
export function readNightQuietConfig(force = false) {
  if (!force && cache && Date.now() - cacheAt < CACHE_MS) return cache;
  let raw = {};
  try {
    raw = config.getConfig('xiuxian', 'xiuxian')?.Era?.nightQuiet || {};
  } catch (error) {
    console.error('[夜间静默] 读取配置失败，按关闭处理:', error?.message || error);
    raw = {};
  }
  const grace = Number(raw.resumeGraceMinutes);
  const result = {
    enabled: raw.enabled === true,
    startHour: normalizeHour(raw.startHour, DEFAULTS.startHour),
    endHour: normalizeHour(raw.endHour, DEFAULTS.endHour),
    timezoneOffset: normalizeOffset(raw.timezoneOffset),
    pauseWorldClock: raw.pauseWorldClock !== false,
    pauseDimensionGuard: raw.pauseDimensionGuard !== false,
    extendRifts: raw.extendRifts !== false,
    resumeGraceMinutes: Number.isFinite(grace) && grace >= 0 && grace <= 180
      ? Math.trunc(grace)
      : DEFAULTS.resumeGraceMinutes,
  };
  if (result.startHour === result.endHour) result.enabled = false; // 起止相同视为不启用，避免误配成全天静默
  cache = result;
  cacheAt = Date.now();
  return result;
}

/** 某天的「本地零点」对应的真实时间戳（毫秒）。offset 为整小时时区偏移。 */
function localDayStart(now, offset) {
  const shifted = now + offset * HOUR_MS;
  return Math.floor(shifted / DAY_MS) * DAY_MS - offset * HOUR_MS;
}

/**
 * 给定时刻所在的静默窗口；不在窗口内返回 null。
 * 返回 { start, end }，均为真实时间戳，区间语义为 [start, end)。
 */
export function getQuietWindowAt(now = Date.now(), cfg = readNightQuietConfig()) {
  if (!cfg?.enabled) return null;
  const { startHour, endHour, timezoneOffset: offset } = cfg;
  if (startHour === endHour) return null; // 起止相同不是「全天静默」，视为未配置
  const dayStart = localDayStart(now, offset);
  const start = dayStart + startHour * HOUR_MS;
  const end = dayStart + endHour * HOUR_MS;

  if (startHour < endHour) {
    return now >= start && now < end ? { start, end } : null;
  }
  // 跨零点：窗口横跨两天
  if (now >= start) return { start, end: end + DAY_MS };
  if (now < end) return { start: start - DAY_MS, end };
  return null;
}

/**
 * 最近一个「已经结束」的静默窗口；用于恢复时补算裂界时长。
 * 还没结束的窗口不算，保证只会对已经过去的静默做补偿。
 */
export function getLastQuietWindow(now = Date.now(), cfg = readNightQuietConfig()) {
  if (!cfg?.enabled) return null;
  const { startHour, endHour, timezoneOffset: offset } = cfg;
  const duration = (endHour - startHour + 24) % 24 * HOUR_MS;
  if (duration <= 0) return null;
  const dayStart = localDayStart(now, offset);
  let best = null;
  for (const dayOffset of [0, -1]) {
    const start = dayStart + dayOffset * DAY_MS + startHour * HOUR_MS;
    const end = start + duration;
    if (end > now) continue;
    if (!best || end > best.end) best = { start, end };
  }
  return best;
}

/** 当前是否处于静默窗口。 */
export function isNightQuiet(now = Date.now(), cfg = readNightQuietConfig()) {
  return Boolean(getQuietWindowAt(now, cfg));
}

/** 距静默开始 / 结束还有多久，用于状态查询。 */
export function describeNightQuiet(now = Date.now(), cfg = readNightQuietConfig()) {
  if (!cfg?.enabled) return '夜间静默：未启用';
  const current = getQuietWindowAt(now, cfg);
  const pad = hour => `${String(hour).padStart(2, '0')}:00`;
  const windowText = `${pad(cfg.startHour)}-${pad(cfg.endHour)}`;
  if (current) {
    const minutes = Math.max(0, Math.ceil((current.end - now) / 60000));
    return `夜间静默：进行中（${windowText}），${minutes} 分钟后恢复`;
  }
  // 计算下一次开始时刻
  const dayStart = localDayStart(now, cfg.timezoneOffset);
  let nextStart = dayStart + cfg.startHour * HOUR_MS;
  while (nextStart <= now) nextStart += DAY_MS;
  const minutes = Math.max(0, Math.ceil((nextStart - now) / 60000));
  return `夜间静默：待机（${windowText}），${minutes} 分钟后开始`;
}

/** 仅供自检 / 单元测试使用 */
export function __resetNightQuietCache() {
  cache = null;
  cacheAt = 0;
}
