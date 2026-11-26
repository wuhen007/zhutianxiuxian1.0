/**
 * 活跃群自动注册 —— 推送名单不再靠人工维护
 *
 * 目标：一个群只要「有人在跑修仙」，公告、定时任务、世界频道、BOSS、诡异大祭这些
 * 走 Era.notifyGroups 的推送就该自动送到，管理员不用再手工 #全局推送消息 加群号。
 *
 * 链路：
 *   1. 修仙插件的任意指令命中 → robot/index.js 的包装层记一次（不改任何业务文件）；
 *   2. 本群累计指令次数达到 minActions（默认 2）→ 判定「在玩」；
 *   3. 写进 config/xiuxian/xiuxian.yaml 的 Era.notifyGroups（节流落盘）。
 *      插件自带的 Config 每次 getConfig 都重新读盘，所以写进去就等于全局生效，
 *      二十多个推送点一处都不用改；
 *   4. 超过 idleDays（默认 30 天）没再活跃 → 自动移除（群解散 / 没人玩了）；
 *   5. 管理员手动 #删除全局推送 → 进黑名单，不会被自动加回来；
 *   6. 官方通道连续发送失败 dropAfterFails 次 → 自动移除并记黑名单（群解散的典型表现）。
 *
 * 群标识两种都兼容：
 *   - 协议号群：数字群号（如 799048038）
 *   - 纯官方群：group_openid（32 位十六进制），officialReply.resolveOpenid 会直接拿去发
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { __dirname as PluginDir } from '../app.config.js';
// 直接用插件自己的 Config 封装（每次读盘，没有跨模块缓存），
// 不走 api.js 那条重链路：它依赖云崽框架，单测和启动早期都可能还没就绪。
import config from './Config.js';

const CONFIG_FILE = path.join(PluginDir, 'config/xiuxian/notify-auto.yaml');

const DEFAULTS = {
  /** 总开关，关掉后只读配置里手写的名单，不再自动增删 */
  enable: true,
  /** 同一个群累计多少次修仙指令才算「在玩」（1 = 第一次就纳入） */
  minActions: 3,
  /** 多少天没活跃就移出名单；0 = 永不过期 */
  idleDays: 30,
  /** 官方通道连续发送失败多少次就移出名单 */
  dropAfterFails: 5,
  /** 多久扫一次活跃表（秒） */
  refreshSeconds: 60,
  /** 两次写盘的最小间隔（秒），避免频繁改写 xiuxian.yaml */
  minWriteSeconds: 60,
  /** 入名单前是否要求该群已开启「获取群内全部消息」（官方通道的群才检查） */
  requireFullVolume: true,
  /** 入名单时是否往群里发一条提示（顺带当作可达性探测，并告知怎么退出） */
  notifyOnJoin: true,
};

/** 累计指令次数 */
const COUNT_KEY = 'xiuxian:groups:active';
/** 最后活跃时间戳 */
const LAST_KEY = 'xiuxian:groups:active:last';
/** 连续发送失败次数 */
const FAIL_KEY = 'xiuxian:groups:sendfail';
/** 管理员手动删除的群（不再自动加回） */
const BLOCK_KEY = 'xiuxian:groups:block';
/** 由本模块自动加进名单的群（只有这些会被自动移除，管理员手写的不动） */
const AUTO_KEY = 'xiuxian:groups:auto';

/**
 * 打日志。用 globalThis.logger 而不是裸 logger：
 * 这个模块会被单测直接 import，没有云崽全局时不能抛异常。
 */
function say(level, msg) {
  try {
    globalThis.logger?.[level]?.(msg);
  } catch { /* 日志失败不影响主流程 */ }
}

/** 群标识：5~15 位数字（协议号群号）或 32 位十六进制（group_openid） */
const GROUP_ID_RE = /^(?:\d{5,15}|[0-9A-Fa-f]{32})$/;

/**
 * 权限类失败：主动消息未开通（40034105）、无权限、配额用尽。
 * 这类失败只说明「这条通道发不出去」，与群是否还存在无关，不能拿来判定群已失效。
 */
const PERMISSION_LIKE_RE = /40034105|无权限|permission|not\s*allowed|forbidden|403|额度|quota/i;

/**
 * 规范化群标识。
 * group_openid 是十六进制串，官方下发的大小写不一定稳定，不统一就会把同一个群
 * 记成两笔（计数被拆散、名单里出现两条只差大小写的记录）。数字群号原样保留。
 * 非法标识返回空串，调用方直接忽略。
 */
function normalizeGroupId(raw) {
  const gid = String(raw ?? '').trim();
  if (!GROUP_ID_RE.test(gid)) return '';
  return /^[0-9A-Fa-f]{32}$/.test(gid) ? gid.toUpperCase() : gid;
}

let settings = { ...DEFAULTS };
let settingsMtime = -1;
let settingsLoaded = false;

/** 待写入 Redis 的指令次数（3 秒批量落盘，避免每条指令一次往返） */
const pending = new Map();
let flushTimer = null;

/** 活跃群缓存：gid -> { count, last } */
let activeCache = new Map();
/** 黑名单缓存 */
let blockedSet = new Set();
/** 上次写配置文件的时间，用于节流 */
let lastWriteAt = 0;
let syncing = false;

/* ==================== 基础设施 ==================== */

/**
 * 用原生命令走 Redis。
 * 云崽主分支是 node-redis（hIncrBy），别的分支可能是 ioredis（hincrby），
 * sendCommand 两套都认，省得判断客户端类型。
 */
async function redisCmd(args) {
  const client = globalThis.redis;
  if (!client?.sendCommand) return null;
  try {
    return await client.sendCommand(args.map(String));
  } catch {
    return null;
  }
}

async function hgetall(key) {
  const res = await redisCmd(['HGETALL', key]);
  if (!res) return {};
  // node-redis 可能返回数组形式的 [k, v, k, v]，统一成对象
  if (Array.isArray(res)) {
    const out = {};
    for (let i = 0; i < res.length; i += 2) out[String(res[i])] = res[i + 1];
    return out;
  }
  return res;
}

async function sMembers(key) {
  const res = await redisCmd(['SMEMBERS', key]);
  return Array.isArray(res) ? res.map(String) : [];
}

/** 热加载 notify-auto.yaml（改完不用重启） */
function loadSettings() {
  try {
    const stat = fs.statSync(CONFIG_FILE);
    if (settingsLoaded && stat.mtimeMs === settingsMtime) return settings;
    const raw = YAML.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) || {};
    settings = { ...DEFAULTS, ...raw };
    settingsMtime = stat.mtimeMs;
    settingsLoaded = true;
  } catch {
    // 文件不存在或写坏了：用默认值继续，不影响主流程
    if (!settingsLoaded) settings = { ...DEFAULTS };
    settingsLoaded = true;
  }
  return settings;
}

/* ==================== 记录活跃 ==================== */

/**
 * 记一次群活跃。只写内存，3 秒后批量落 Redis。
 * 由 robot/index.js 的包装层在每个修仙指令执行前调用，同步函数，不阻塞业务。
 */
export function markActive(groupId) {
  loadSettings();
  if (!settings.enable) return;
  const gid = normalizeGroupId(groupId);
  if (!gid) return;
  pending.set(gid, (pending.get(gid) || 0) + 1);
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush().catch(() => { });
    }, 3000);
    flushTimer.unref?.();
  }
}

/** 最近一次触发计数的事件，用来在新群跨过门槛时就地回一条提示 */
const inviteEvents = new Map();

async function flush() {
  if (!pending.size) return;
  const batch = [...pending.entries()];
  pending.clear();
  const now = Date.now();
  const min = Number(settings.minActions) || 3;
  for (const [gid, n] of batch) {
    await redisCmd(['HINCRBY', COUNT_KEY, gid, n]);
    await redisCmd(['HSET', LAST_KEY, gid, now]);
    const total = Number(await redisCmd(['HGET', COUNT_KEY, gid])) || 0;
    // 刚好跨过门槛：在群里提示一次（不自动入名单）
    if (total >= min && total - n < min) {
      await inviteGroup(gid, inviteEvents.get(gid)).catch(() => { });
    }
    inviteEvents.delete(gid);
  }
  await sync().catch(() => { });
}

/* ==================== 同步名单 ==================== */

async function refresh() {
  const [counts, lasts, blocked] = await Promise.all([
    hgetall(COUNT_KEY),
    hgetall(LAST_KEY),
    sMembers(BLOCK_KEY),
  ]);
  blockedSet = new Set(blocked);
  const now = Date.now();
  const idleMs = Number(settings.idleDays) > 0 ? Number(settings.idleDays) * 86400_000 : 0;
  const next = new Map();
  for (const [gid, c] of Object.entries(counts || {})) {
    const last = Number(lasts?.[gid]) || 0;
    if (idleMs > 0 && now - last > idleMs) continue;
    next.set(gid, { count: Number(c) || 0, last });
  }
  activeCache = next;
}

/**
 * 新群邀请文案。
 * 不自动入名单，只在群里提示一次，由群主/管理员决定要不要开。
 */
export function buildInviteText(n) {
  const times = Number(n) || 3;
  return [
    '【修仙推送·可选开启｜请群主确认】',
    `检测到本群最近有人在玩修仙（已累计 ${times} 次修仙指令），判断本群可能在玩修仙游戏。`,
    '本群目前不会收到任何修仙推送，以下内容暂时看不到：',
    '· 纪元更替 / 界域事件 / 天骄与至宝刷新',
    '· 秘境开启与结算 / 渡劫播报',
    '· 妖王、域外灾厄等全服事件',
    '开启后平均每小时 1~3 条，活动期会多几条。',
    '',
    '群主或管理员可发送：',
    '  #开启本群修仙推送   开启',
    '  #关闭本群修仙推送   关闭',
    '如果你判断有误（本群并不玩修仙），忽略本条即可，不会推送任何内容。',
  ].join('\n');
}

/** 同群 30 天内只提示一次，避免群主已忽略还被反复打扰 */
const INVITE_KEY = gid => `xiuxian:push:invite:${gid}`;

/**
 * 达到门槛时在群里提示一次（走被动回复，不占主动消息配额）。
 * 已经在名单里的群、被管理员关过的群都不提示。
 */
async function inviteGroup(gid, e) {
  if (!settings.enable || !e?.reply) return;
  const cfg = config.getConfig('xiuxian', 'xiuxian');
  const list = Array.isArray(cfg?.Era?.notifyGroups) ? cfg.Era.notifyGroups : [];
  const inList = list.some(item => (normalizeGroupId(item) || String(item)) === gid);
  if (inList || blockedSet.has(gid)) return;
  const first = await redisCmd(['SET', INVITE_KEY(gid), '1', 'EX', 30 * 86400, 'NX']);
  if (String(first) !== 'OK') return;
  say('info', `[自动推送] 群 ${gid} 疑似在玩修仙，已在群内提示开启（不自动入名单）`);
  await e.reply(buildInviteText(settings.minActions));
}


/**
 * 把活跃群并入 Era.notifyGroups。
 * 只写有差异的部分，并做写盘节流——每次写都会重新序列化整份 xiuxian.yaml，
 * 且会覆盖 .last-good 备份，写太勤反而降低可靠性。
 */
async function sync() {
  loadSettings();
  if (!settings.enable) return;
  if (syncing) return;
  syncing = true;
  try {
    await refresh();

    const cfg = config.getConfig('xiuxian', 'xiuxian');
    const era = cfg?.Era;
    if (!era) return;
    if (!Array.isArray(era.notifyGroups)) era.notifyGroups = [];

    const current = era.notifyGroups.map(g => String(g));
    // 比对前先归一化，避免名单里手写的小写 openid 与自动记录的大写重复成两条
    const currentSet = new Set(current.map(g => normalizeGroupId(g) || g));
    const autoSet = new Set(await sMembers(AUTO_KEY));

    // 只回收「本模块加进去、现在又不活跃」的群；管理员手写的永远不动
    const remove = [];
    for (const gid of autoSet) {
      if (activeCache.has(gid)) continue;
      if (!currentSet.has(gid)) continue;
      remove.push(gid);
    }

    if (!remove.length) return;

    const now = Date.now();
    if (now - lastWriteAt < Number(settings.minWriteSeconds) * 1000) return;
    lastWriteAt = now;

    const removed = new Set(remove);
    era.notifyGroups = current.filter(g => !removed.has(normalizeGroupId(g) || g));
    config.setConfig('xiuxian', 'xiuxian', cfg);

    await redisCmd(['SREM', AUTO_KEY, ...remove]);
    say('info', `[自动推送] 长期无活跃，移出推送名单：${remove.join(', ')}`);
  } catch (err) {
    say('warn', `[自动推送] 同步推送名单失败：${err.message}`);
  } finally {
    syncing = false;
  }
}

/* ==================== 发送结果回写 ==================== */

/**
 * 官方通道发送结果。
 * 连续失败多半是群解散 / 机器人被踢——这类群留着只会每条推送都报错，
 * 达到阈值就自动移出名单并记黑名单，不再自动加回（除非管理员手动加）。
 *
 * 但「主动消息没权限」（40034105）不算：那只说明这个群还没在开放平台开主动消息，
 * 玩家照样在玩，踢出名单反而让该收到的推送全丢了。
 */
export async function noteSendResult(groupId, ok, reason = '') {
  loadSettings();
  if (!settings.enable) return;
  const gid = normalizeGroupId(groupId);
  if (!gid) return;

  if (ok) {
    await redisCmd(['HDEL', FAIL_KEY, gid]);
    return;
  }

  // 权限类失败与群状态无关，不累积
  if (PERMISSION_LIKE_RE.test(String(reason || ''))) {
    await redisCmd(['HDEL', FAIL_KEY, gid]);
    return;
  }

  const n = Number(await redisCmd(['HINCRBY', FAIL_KEY, gid, 1])) || 0;
  if (n < Number(settings.dropAfterFails)) return;

  await redisCmd(['HDEL', FAIL_KEY, gid]);
  await redisCmd(['SADD', BLOCK_KEY, gid]);
  await redisCmd(['SREM', AUTO_KEY, gid]);
  blockedSet.add(gid);

  try {
    const cfg = config.getConfig('xiuxian', 'xiuxian');
    const list = cfg?.Era?.notifyGroups;
    if (Array.isArray(list)) {
      const idx = list.map(String).indexOf(gid);
      if (idx >= 0) {
        list.splice(idx, 1);
        config.setConfig('xiuxian', 'xiuxian', cfg);
      }
    }
  } catch { /* 写盘失败就等下一轮 */ }

  say('warn', `[自动推送] 群 ${gid} 连续 ${settings.dropAfterFails} 次发送失败，已移出推送名单（可能是群解散或权限被收回）`);
}

/* ==================== 黑名单（配合管理指令） ==================== */

/** 管理员手动删除某个群：记黑名单，阻止自动加回 */
export async function blockGroup(groupId) {
  const gid = normalizeGroupId(groupId);
  if (!gid) return;
  await redisCmd(['SADD', BLOCK_KEY, gid]);
  await redisCmd(['SREM', AUTO_KEY, gid]);
  blockedSet.add(gid);
}

/** 管理员手动添加某个群：解除黑名单，允许以后继续自动维护 */
export async function unblockGroup(groupId) {
  const gid = normalizeGroupId(groupId);
  if (!gid) return;
  await redisCmd(['SREM', BLOCK_KEY, gid]);
  blockedSet.delete(gid);
}

/** 当前由本模块自动加进名单的群（#查看全局推送 用来打标记） */
export async function getAutoGroupIds() {
  return new Set(await sMembers(AUTO_KEY));
}

/* ==================== 安装 ==================== */

const TRACK_FLAG = Symbol.for('zhutianxiuxian.activeGroups.tracked');
/**
 * 「这条消息已经计过数」的标记。
 *
 * 一条指令往往不止调一个方法：命中的 fnc 算一次，内部再调几个本类辅助方法又各算一次
 * （这层包装是给类原型上**所有**方法套的壳）。不去重的话，一条 `#修仙帮助` 就能记 2~3 次，
 * minActions=2 直接判成「这个群在玩」——2026-11-10 祖安群（736121023）只测了一条指令
 * 就被纳入推送名单，就是这么来的。
 */
const COUNTED_FLAG = Symbol.for('zhutianxiuxian.activeGroups.counted');

/** 索引里的调用标记（`[插件名(方法名)]`）是否属于全量兜底守卫 */
export function isCatchAllHandler(logFnc) {
  // 只认方法名恰好是 guard 的；guardForge 这类具体指令不算
  return /\(guard\)/.test(String(logFnc || ''));
}

/**
 * 给每个插件类的处理器套一层，指令一命中就记一次群活跃。
 * 与 textToImage 的包装互不冲突：谁在外层都一样，这里只读 e.group_id。
 */
function installTracker(apps) {
  let wrapped = 0;
  for (const key of Object.keys(apps || {})) {
    const proto = apps[key]?.prototype;
    if (!proto || proto[TRACK_FLAG]) continue;
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      const desc = Object.getOwnPropertyDescriptor(proto, name);
      if (!desc || typeof desc.value !== 'function' || !desc.writable) continue;
      const original = desc.value;
      proto[name] = function (...args) {
        const e = args[0];
        // 同一条消息只计一次：标记挂在 e 上，后续方法调用直接跳过
        if (e && typeof e === 'object' && e.group_id && !e[COUNTED_FLAG]) {
          // 只认「这次命中的确实是修仙插件的规则」，不是所有路过的方法都算。
          //
          // loader 在调用 fnc 之前会写 e.logFnc = `[插件名(方法名)]`（lib/plugins/loader.js:307），
          // 所以这里比对一下本插件名就知道这次调用是不是它的规则命中的。
          // 不加这一步的话，普通聊天、别的插件的指令（比如抽卡 `*全部记录`）路过本插件某个方法，
          // 也会被算成「这个群在玩修仙」——2026-11-10 祖安群（736121023）就是这么被拉进推送名单的。
          const fnc = String(e.logFnc || '');
          const owned = this?.name ? fnc.includes(`[${this.name}(`) : false;
          // 兜底守卫（rule 是 ^#）对所有井号指令都会跑，哪怕那条指令属于别的插件，
          // 不能据此判定「这个群在玩修仙」——2026-11-17 的误登记就是这么来的。
          if (!owned || isCatchAllHandler(fnc)) return original.apply(this, args);
          try {
            Object.defineProperty(e, COUNTED_FLAG, { value: true, configurable: true });
          } catch {
            /* 冻结对象就算了，宁可多记也别抛 */
          }
          const gid = normalizeGroupId(e.group_id);
          if (gid) inviteEvents.set(gid, e);
          markActive(gid);
        }
        return original.apply(this, args);
      };
      wrapped += 1;
    }
    proto[TRACK_FLAG] = true;
  }
  return wrapped;
}

/**
 * 启动入口（robot/index.js 调用一次）。
 * @param {Record<string, Function>} apps 已收集的插件类
 */
export async function installActiveGroups(apps) {
  loadSettings();
  if (!settings.enable) {
    say('info', '[自动推送] 已关闭（notify-auto.yaml enable: false）');
    return;
  }
  const wrapped = installTracker(apps);
  await sync().catch(() => { });
  const timer = setInterval(() => {
    sync().catch(() => { });
  }, Math.max(10, Number(settings.refreshSeconds)) * 1000);
  timer.unref?.();
  say('info', 
    `[自动推送] 已启用：${wrapped} 个处理器会记录群活跃，`
    + `累计 ${settings.minActions} 次指令纳入名单，${settings.idleDays} 天无活跃自动移出`,
  );

  const groups = activeCache.size;
  if (groups) say('info', `[自动推送] 当前活跃群 ${groups} 个`);
}

/** 测试 / 运维用：手动触发一次同步 */
export async function syncNow() {
  lastWriteAt = 0;
  await sync();
  return [...activeCache.keys()];
}
