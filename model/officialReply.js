/**
 * 官方 Bot 代发（官方优先，协议号兜底）
 *
 * 背景：修仙插件按 QQ 号存档，身份必须来自协议号；但「对外说话」可以借官方 Bot 的嘴巴。
 * 所以这里只接管发送这一步：
 *   1. 触发消息如果是全量模式下官方 Bot 也收到的那一条，就能拿到它的 msg_id
 *      → 用 msg_id 发出去属于「被动消息」，不吃每群 20 条/分钟、也不吃每群每天 1000 条；
 *   2. 拿不到 msg_id、或官方接口报错（配额/审核/上传失败），只要还没发出去内容，
 *      立刻回退给协议号发送，用户无感；
 *   3. 已经发出去至少一条时不再回退，避免同一条消息出现两次。
 *
 * 配置：plugins/zhutianxiuxian1.0/config/xiuxian/official-reply.yaml（改完即时生效）
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { __dirname as PluginDir } from '../app.config.js';
import { noteSendResult } from './activeGroups.js';

const CONFIG_FILE = path.join(PluginDir, 'config/xiuxian/official-reply.yaml');

const DEFAULTS = {
  enable: false,
  /** 单次发送超时（毫秒）。超时可能已经发出去了，此时不回退，避免重复 */
  timeout: 15000,
  /** 找不到 msg_id 时是否允许改用主动消息（会消耗 20 条/分钟、1000 条/天的额度） */
  allowActive: false,
  /** 群号 → 官方 group_openid */
  groups: {},
  /** 回复往往比官方事件先到，最多等这么久再放弃（毫秒） */
  matchWait: 1200,
  /** 定时任务（cron）的推送是否改走官方「主动消息」 */
  scheduledActive: true,
  /** 世界频道（跨服发言）是否改走官方「主动消息」。广播式，配额消耗比定时任务快，单独开关 */
  worldChatActive: true,
  /** 主动消息本地限流：每个群每分钟最多发几条，超出回退协议号（与官方硬限 20 对齐） */
  activePerMinute: 20,
};

let cache = null;
let cacheMtime = -1;
/** 配置解析失败只告警一次，避免每条消息刷屏 */
let warnedConfigError = false;
let bridgeModule;
/** 每个群第一次代发成功时记一条，方便确认链路真的切过去了 */
const firstSuccess = new Set();
/** 定时任务（主动消息）每个群首次成功单独记一条，否则会被被动回复的首次记录掩盖 */
const firstActiveSuccess = new Set();
/** 「配对不上」提示的节流时间戳 */
let lastMissLog = 0;
/** 「按时间兜底匹配」提示的节流时间戳 */
let lastTimeMatchLog = 0;
/** 运行统计：成功代发（被动/主动）、回退、未配对 */
const stats = { ok: 0, active: 0, fallback: 0, miss: 0 };
/** 主动消息限流：群 → 最近一分钟的发送时间戳 */
const activeBuckets = new Map();
/** 限流提示节流：群 → 上次提示时间 */
const activeWarnAt = new Map();

/**
 * 官方被动回复窗口：同一条用户消息的 msg_id 可以在 5 分钟内复用，最多回 5 条。
 *
 * 为什么需要这个：渡劫这类链路是「一次指令、之后每 60 秒回一条」，共 9 道。
 * 但 findMessage 的时间容差只有 6 秒（它解决的是「回复比官方事件先到」的毫秒级错位），
 * 所以第 2 道雷劫开始就再也配不上 trigger 的 msg_id，全部回退协议号。
 * 判据不是「这条消息和触发消息隔了多久」，而是「触发消息是否还在 5 分钟窗口内、这个 id 用没用满 5 次」。
 */
const PASSIVE_WINDOW = 5 * 60 * 1000;
const PASSIVE_LIMIT = 5;
/** 触发消息会话 → 已经用上的 msg_id（key 见 sessionKeyOf） */
const passiveSessions = new Map();
/** msg_id → { count, at }：某个 msg_id 已被我们用掉的回复次数（含借用别人的） */
const msgIdUsage = new Map();
/** 复用提示的节流时间戳 */
let lastReuseLog = 0;
/** 借用提示的节流时间戳 */
let lastBorrowLog = 0;

function sessionKeyOf(trigger) {
  return `${trigger.groupId}|${trigger.time}|${trigger.content}`;
}

/** 这个 msg_id 还能被动回复几次（官方：群聊每条用户消息最多 5 次） */
function remainingQuota(msgId) {
  if (!msgId) return 0;
  const used = msgIdUsage.get(String(msgId));
  if (!used) return PASSIVE_LIMIT;
  return Math.max(0, PASSIVE_LIMIT - used.count);
}

/**
 * 借一条同群近期消息的 msg_id。
 * 优先挑额度剩得最多的（一般是刚发的新消息），让后续还能接着用。
 */
function borrowMsgId(bridge, openid, now) {
  if (typeof bridge?.listMessages !== 'function') return null;
  let list = [];
  try {
    list = bridge.listMessages(openid, now - PASSIVE_WINDOW) || [];
  } catch {
    return null;
  }
  let best = null;
  let bestQuota = 0;
  let bestAge = Infinity;
  for (const item of list) {
    if (!item?.msgId) continue;
    const quota = remainingQuota(item.msgId);
    if (quota <= 0) continue;
    const age = Number.isFinite(item.ageMs)
      ? item.ageMs
      : now - (item.localTime || item.time || now);
    // 额度多的优先；额度一样时挑最新的，免得挂在一条快过期的消息上
    if (quota > bestQuota || (quota === bestQuota && age < bestAge)) {
      best = item;
      bestQuota = quota;
      bestAge = age;
    }
  }
  return best;
}

/** 清掉超出窗口的会话，避免 Map 无限增长 */
function sweepSessions(now = Date.now()) {
  for (const [key, item] of passiveSessions) {
    if (now - item.triggerAt > PASSIVE_WINDOW) passiveSessions.delete(key);
  }
  for (const [msgId, item] of msgIdUsage) {
    if (now - item.at > PASSIVE_WINDOW + 60_000) msgIdUsage.delete(msgId);
  }
}

/**
 * 主动消息本地限流。
 * 官方限制是每群 20 条/分钟、每群每天 1000 条；修仙的转世叙事一次能刷十几条，
 * 这里按分钟先掐一道，超出的回退协议号，避免把配额烧光或撞平台频控。
 */
function activeAllowed(groupId, perMinute) {
  const now = Date.now();
  const key = String(groupId);
  const list = (activeBuckets.get(key) || []).filter(ts => now - ts < 60_000);
  if (list.length >= perMinute) {
    activeBuckets.set(key, list);
    if (now - (activeWarnAt.get(key) || 0) > 60_000) {
      activeWarnAt.set(key, now);
      log('warn', `群 ${key} 主动消息已达本地上限（${perMinute}/分钟），后续回退协议号`);
    }
    return false;
  }
  list.push(now);
  activeBuckets.set(key, list);
  return true;
}

function log(level, message) {
  try {
    logger?.[level]?.(`[官方代发] ${message}`);
  } catch {}
}

/** 读取配置（按 mtime 缓存，改 yaml 不用重启） */
export function getSettings() {
  try {
    const stat = fs.statSync(CONFIG_FILE);
    if (!cache || stat.mtimeMs !== cacheMtime) {
      const raw = YAML.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) ?? {};
      const groups = {};
      for (const [k, v] of Object.entries(raw.groups ?? {})) {
        const gid = String(k).trim();
        const openid = String(v ?? '').trim();
        if (gid && openid) groups[gid] = openid;
      }
      cache = {
        enable: Boolean(raw.enable),
        timeout: Number.parseInt(raw.timeout, 10) || DEFAULTS.timeout,
        allowActive: Boolean(raw.allowActive),
        matchWait: Number.parseInt(raw.matchWait, 10) || DEFAULTS.matchWait,
        scheduledActive: raw.scheduledActive === undefined ? DEFAULTS.scheduledActive : Boolean(raw.scheduledActive),
        // 世界频道（跨服发言）属于「一条消息广播到所有群」，没有触发消息可借用，
        // 只能走主动消息；单独给个开关，关掉就回退协议号
        worldChatActive: raw.worldChatActive === undefined ? DEFAULTS.worldChatActive : Boolean(raw.worldChatActive),
        activePerMinute: Number.parseInt(raw.activePerMinute, 10) || DEFAULTS.activePerMinute,
        groups,
      };
      cacheMtime = stat.mtimeMs;
      log(
        'info',
        `配置已加载：${Object.keys(groups).length} 个群，` +
          `配对兜底主动消息=${cache.allowActive ? '允许' : '禁止'}，` +
          `定时任务走官方=${cache.scheduledActive ? `是（每群 ≤${cache.activePerMinute} 条/分钟）` : '否'}`,
      );
    }
  } catch (err) {
    if (!cache) cache = { ...DEFAULTS, groups: {} };
    // 配置读失败会静默降级成「空 groups」，表现就是官方号突然不说话了。
    // 改 yaml 最容易踩的是缩进和中文冒号，这里留一条，别让人靠猜。
    if (!warnedConfigError) {
      warnedConfigError = true;
      log('error', `读取 official-reply.yaml 失败，官方代发已全部回退协议号：${err?.message ?? err}`);
    }
  }
  return cache;
}

/**
 * 把推送目标解析成官方 group_openid。两种来源：
 *
 *  1. 老群：配置 groups 里存的是「数字群号 → openid」，查表即可；
 *  2. 新群：只挂了官方 Bot、没挂协议号，压根不知道数字群号（官方不下发群号，
 *     也没有群列表接口）。这种群直接把 group_openid 当推送目标写进配置就行，
 *     32 位十六进制串本身就是 openid，原样拿去发。
 *
 * 所以「按 openid 推送」是成立的：不用先想办法把 openid 和群号对上——本来也对不上。
 */
const OPENID_RE = /^[0-9A-Fa-f]{32}$/;

export function resolveOpenid(groupId, cfg = getSettings()) {
  const key = String(groupId ?? '').trim();
  if (!key) return '';
  const mapped = cfg?.groups?.[key];
  if (mapped) return mapped;
  return OPENID_RE.test(key) ? key : '';
}

/**
 * 判断两个群标识是不是同一个群。
 *
 * 同一个群在两条通道上的写法不一样：协议号给的是数字群号，官方通道给的是 group_openid。
 * 管理员在协议号群里授权时存的是群号，玩家在官方群里触发时带的是 openid，
 * 直接字符串比较必然对不上。这里用 official-reply.yaml 的映射表把两边打通。
 */
export function groupsEqual(a, b) {
  const x = String(a ?? '').trim();
  const y = String(b ?? '').trim();
  if (!x || !y) return false;
  if (x === y) return true;
  // group_openid 是十六进制，大小写不该影响判定
  if (x.toUpperCase() === y.toUpperCase()) return true;
  try {
    const map = getSettings().groups || {};
    if (map[x] && String(map[x]).toUpperCase() === y.toUpperCase()) return true;
    if (map[y] && String(map[y]).toUpperCase() === x.toUpperCase()) return true;
  } catch { /* 配置读不到就只认全等 */ }
  return false;
}

/**
 * 懒加载 qqbot-api 的发送桥。
 * 用动态 import + 兜底：没装/未启用那个插件时，这里只是不可用，不能把修仙插件搞崩。
 */
async function getBridge() {
  if (bridgeModule === undefined) {
    try {
      bridgeModule = await import('../../qqbot-api/model/bridge.js');
    } catch {
      bridgeModule = null;
    }
  }
  const bridge = bridgeModule?.getBridge?.() || globalThis[Symbol.for('trss.qqbot.bridge')] || null;
  if (!bridge?.ready?.()) return null;
  return bridge;
}

function withTimeout(promise, ms) {
  if (!ms) return promise;
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve({ ok: false, sent: 0, timeout: true }), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * 尝试用官方 Bot 发送。
 * @param {{ groupId: string, content: string, time: number }} trigger 触发消息（用于配对 msg_id）
 * @param {any} msg 消息内容（字符串 / 段数组 / Buffer 均可）
 * @returns {Promise<{ handled: boolean, passive?: boolean, reason?: string, error?: Error }>}
 *          handled=true 表示这条消息已经由官方发出（或不确定），调用方不要再发；
 *          handled=false 表示完全没发出去，调用方可以安全回退。
 */
export async function tryOfficialSend(trigger, msg) {
  const cfg = getSettings();
  if (!cfg.enable) return { handled: false, reason: 'disabled' };

  const openid = resolveOpenid(trigger?.groupId, cfg);
  if (!openid) return { handled: false, reason: 'no-openid' };

  const bridge = await getBridge();
  if (!bridge) return { handled: false, reason: 'bridge-not-ready' };

  // 先看这条触发消息是否已经用过、且仍在官方被动窗口内。
  // 渡劫这类「一次指令、每 60 秒回一条」的链路全靠这段复用，否则第 2 条就开始回退协议号。
  const sessionKey = sessionKeyOf(trigger);
  const now = Date.now();
  const session = passiveSessions.get(sessionKey);

  let matched = null;
  let msgId = '';
  let borrowed = null;

  // 1. 触发消息自己还有额度就继续用
  if (session && now - session.triggerAt <= PASSIVE_WINDOW) {
    // 会话还在窗口内。额度够就复用；额度用光了也不必再查缓存——
    // 再查一次拿到的还是同一个 msg_id，白等 matchWait（默认 1.2s），渡劫每分钟一次会一直卡。
    if (remainingQuota(session.msgId) > 0) msgId = session.msgId;
  } else {
    if (session) passiveSessions.delete(sessionKey);
    // 修仙的回复常常比官方全量事件先到（实测 20ms 就发出去了），
    // 这里在 matchWait 窗口内轮询等它，避免每次都白判「配不上」。
    matched = bridge.findMessage(openid, trigger.content, trigger.time, 6000);
    if (!matched && cfg.matchWait > 0) {
      const deadline = Date.now() + cfg.matchWait;
      while (!matched && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 120));
        matched = bridge.findMessage(openid, trigger.content, trigger.time, 6000);
      }
    }
    if (matched?.msgId && remainingQuota(matched.msgId) > 0) {
      msgId = matched.msgId;
      // 立刻记进会话，后续消息就不必再查缓存了
      passiveSessions.set(sessionKey, { msgId, triggerAt: trigger.time });
    }
  }

  // 2. 自己配不上、或这条消息的 5 次额度已经用光 → 借同群近期其它消息的 msg_id。
  //    被动回复只看 msg_id 是否在有效期内、msg_seq 是否重复，不校验内容与被回复消息是否相关，
  //    所以定时推送、渡劫后续消息都能借最近任意一条用户消息发出去，不消耗主动配额。
  if (!msgId) {
    const picked = borrowMsgId(bridge, openid, now);
    if (picked) {
      msgId = picked.msgId;
      borrowed = picked;
      if (Date.now() - lastBorrowLog > 60_000) {
        lastBorrowLog = Date.now();
        log('info', `借用群 ${trigger.groupId} 近期消息的 msg_id 发被动回复（该消息 ${Math.round(picked.ageMs / 1000)}s 前）`);
      }
    }
  }

  if (!msgId) {
    if (!cfg.allowActive) {
      // 半分钟最多提示一次，方便排查「为什么还走协议号」
      if (Date.now() - lastMissLog > 30_000) {
        lastMissLog = Date.now();
        const preview = String(trigger.content || '').slice(0, 24).replace(/\n/g, ' ');
        const sameGroup = bridge.pending?.(openid) ?? '?';
        const recent = (bridge.recent?.(openid, 3) || [])
          .map(i => `「${i.content}」${i.ageMs}ms前`)
          .join(' / ');
        // session 还在却用不了，说明是撞上了 5 分钟 / 5 条上限，这跟「压根没配上」是两回事
        const why = session ? '（本会话已超过 5 分钟或 5 条上限）' : '';
        log('info', `未匹配到触发消息${why}（群 ${trigger.groupId}「${preview}」，本群缓存 ${sameGroup} 条，最近：${recent || '无'}），本条走协议号`);
      }
      stats.miss += 1;
      return { handled: false, reason: 'no-msg-id' };
    }
    // 走主动消息：官方限制每群 20 条/分钟、1000 条/天，
    // 渡劫这类一分钟一条的长流程必须先过本地限流，否则会把配额烧光。
    if (!activeAllowed(trigger.groupId, cfg.activePerMinute)) {
      stats.miss += 1;
      return { handled: false, reason: 'active-rate-limited' };
    }
  }

  const result = await withTimeout(
    bridge.sendGroup(openid, msg, { msgId, passive: Boolean(msgId) }),
    cfg.timeout,
  );

  if (result?.ok) {
    const gid = String(trigger.groupId);
    if (msgId) {
      // 按实际发出的段数扣额度：一条回复被拆成多段时，平台按段数算「回复次数」，
      // 只按调用次数记会误判还剩额度，然后撞 400。
      const spent = Number(result?.sent) || 1;
      const usage = msgIdUsage.get(msgId) || { count: 0, at: now };
      usage.count += spent;
      msgIdUsage.set(msgId, usage);
      // 自己触发的 msg_id 记进会话，后续同一条指令的消息直接复用；
      // 借来的不记，下次重新挑额度最充裕的那条，免得一直挂在快用完的 id 上。
      if (!borrowed) passiveSessions.set(sessionKey, { msgId, triggerAt: trigger.time });
      if (msgIdUsage.size > 500) sweepSessions();
      if (!borrowed && Date.now() - lastReuseLog > 60_000) {
        lastReuseLog = Date.now();
        log('info', `复用触发消息 msg_id 被动回复（群 ${gid}，该 msg_id 已用 ${usage.count}/${PASSIVE_LIMIT} 次）`);
      }
    }
    if (matched?.matchedBy === 'time' && Date.now() - lastTimeMatchLog > 60_000) {
      lastTimeMatchLog = Date.now();
      log('info', `按时间兜底匹配到触发消息（群 ${gid}），内容未完全一致`);
    }
    if (!firstSuccess.has(gid)) {
      firstSuccess.add(gid);
      log('info', `群 ${gid} 首次以官方身份发送成功（${msgId ? '被动回复' : '主动消息'}）`);
    }
    // 成功了就清掉失败计数，避免偶发失败累积成「被判死」
    noteSendResult(gid, true).catch(() => { });
    stats.ok += 1;
    if (!msgId) stats.active += 1;
    // 每 50 条打一次汇总，避免刷屏，又能在日志里追踪趋势
    if (stats.ok % 50 === 0) {
      log('info', `代发统计：成功 ${stats.ok}（被动 ${stats.ok - stats.active} / 主动 ${stats.active}），回退 ${stats.fallback}，未配对 ${stats.miss}`);
    }
    return { handled: true, passive: Boolean(msgId), res: result.res };
  }

  if (result?.timeout) {
    // 超时可能已经发出去了，宁可少一条也不重复
    log('warn', `发送超时（${cfg.timeout}ms），不自动回退，避免重复发送`);
    return { handled: true, timeout: true };
  }

  const sent = Number(result?.sent || 0);
  const reason = result?.error?.message || 'unknown';
  if (sent > 0) {
    log('warn', `官方发送中途失败（已发出 ${sent} 条），不再回退：${reason}`);
    return { handled: true };
  }

  stats.fallback += 1;
  log('warn', `官方发送失败，回退协议号：${reason}`);
  // 群解散 / 机器人被踢都会连续失败，累计到阈值由 activeGroups 移出推送名单；
  // 但「主动消息无权限」这类不算，那个群还在正常玩，只是这条通道发不出去
  noteSendResult(trigger?.groupId, false, reason).catch(() => { });
  return { handled: false, reason, error: result?.error };
}

/** 这个群号（或 group_openid）是否配置了官方代发 */
export function isConfigured(groupId) {
  const cfg = getSettings();
  return Boolean(cfg.enable && resolveOpenid(groupId, cfg));
}

/**
 * 定时任务专用：没有触发消息，只能发「主动消息」。
 * 主动消息受每群 20 条/分钟、每群每天 1000 条限制，失败时由调用方回退协议号。
 */
export async function tryOfficialActive(groupId, msg, options = {}) {
  const cfg = getSettings();
  if (!cfg.enable || !cfg.scheduledActive) return { handled: false, reason: 'disabled' };
  // 世界频道有独立开关：它是广播式主动消息，配额烧得比定时任务快得多
  if (options.scope === 'worldChat' && !cfg.worldChatActive) {
    return { handled: false, reason: 'worldchat-disabled' };
  }

  const openid = resolveOpenid(groupId, cfg);
  if (!openid) return { handled: false, reason: 'no-openid' };

  const bridge = await getBridge();
  if (!bridge) return { handled: false, reason: 'bridge-not-ready' };

  if (!activeAllowed(groupId, cfg.activePerMinute)) {
    stats.fallback += 1;
    return { handled: false, reason: 'local-rate-limit' };
  }

  const result = await withTimeout(bridge.sendGroup(openid, msg, { passive: false }), cfg.timeout);

  if (result?.ok) {
    stats.ok += 1;
    stats.active += 1;
    const gid = String(groupId);
    noteSendResult(gid, true).catch(() => { });
    if (!firstActiveSuccess.has(gid)) {
      firstActiveSuccess.add(gid);
      log('info', `群 ${gid} 定时任务首次以官方身份发送成功（主动消息）`);
    }
    // 每 50 条打一次汇总，方便在日志里追踪主动消息占比
    if (stats.active % 50 === 0) {
      log('info', `主动消息统计：本进程已发 ${stats.active} 条（累计成功 ${stats.ok}，回退 ${stats.fallback}）`);
    }
    return { handled: true, res: result.res };
  }
  if (result?.timeout) {
    log('warn', `定时任务发送超时（${cfg.timeout}ms），不回退，避免重复`);
    return { handled: true };
  }
  if (Number(result?.sent || 0) > 0) {
    log('warn', '定时任务发送中途失败（已发出部分），不回退');
    return { handled: true };
  }

  stats.fallback += 1;
  const reason = result?.error?.message || 'unknown';
  log('warn', `定时任务官方发送失败，回退协议号：${reason}`);
  noteSendResult(groupId, false, reason).catch(() => { });
  return { handled: false, reason, error: result?.error };
}

/** 运行统计（自检/排查用） */
export function getStats() {
  return { ...stats };
}

/** 仅用于自检：当前是否具备代发条件 */
export function statusText() {
  const cfg = getSettings();
  return [
    `官方代发：${cfg.enable ? '开启' : '关闭'}`,
    `已配置群：${Object.entries(cfg.groups).map(([gid, oid]) => `${gid}（${oid.slice(0, 8)}…）`).join('、') || '无'}`,
    `无 msg_id 时：${cfg.allowActive ? '允许主动消息' : '回退协议号'}`,
  ].join('\n');
}
