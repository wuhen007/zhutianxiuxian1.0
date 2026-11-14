/**
 * 长文本自动转图片
 *
 * 修仙插件里 e.reply 的调用点有 6900+ 处，逐处改造不现实，所以这里做了一层
 * 事件级拦截：修仙的指令处理器一执行，就给当前事件装一个 e.reply 包装函数，
 * 之后无论代码里写的是 e.reply(...) 还是 this.reply(...)（基类也会转成 e.reply），
 * 都会经过同一道判断。
 *
 * 判断规则：
 *   1. 只处理「纯文本」——消息里带 at / 图片 / markdown / 按钮 / 合并转发的，原样放行；
 *   2. 去掉空白字符后超过阈值（默认 30 字）才转图，短消息保持文本；
 *   3. 长文本按页切分，每张图的字数上限可控，避免长图被截图引擎截断；
 *   4. 任何一步失败（浏览器起不来、渲染超时、图片发送失败）都回退成原来的文本，
 *      连续失败 3 次会熔断 5 分钟，避免每条消息都白等一次渲染。
 *
 * 配置文件（可选，不建就用默认值；改完即时生效，不必重启）：
 *   plugins/zhutianxiuxian1.0/config/xiuxian/text2image.yaml
 *
 *   enable: true            # 总开关
 *   threshold: 30           # 超过多少字转图片（按去掉空白后的字符数算）
 *   maxCharsPerImage: 1200  # 单张图片最多承载多少字
 *   maxImages: 4            # 一次回复最多几张图，超出则回退文本
 *   timeout: 15000          # 单张渲染超时（毫秒）
 */
import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { __dirname as PluginDir } from '../app.config.js';
import { tryOfficialSend } from './officialReply.js';
import { isOfficialMessageEvent, buildOfficialMessage } from './officialMessage.js';

const CONFIG_FILE = path.join(PluginDir, 'config/xiuxian/text2image.yaml');
const TPL_FILE = path.join(PluginDir, 'resources/html/text2img/text.html');
/** 背景图：换成别的图只要替换这个文件（或改这里指向的路径），重启后生效 */
const WHALE_FILE = path.join(PluginDir, 'resources/html/text2img/deepseek-whale.svg');
const RENDER_NAME = 'xxhs-text2img';

let whaleUrlCache = null;

/** 模板写在 temp/html 下，相对路径解析不到插件资源，所以转成 file:// 绝对地址传进去 */
function getWhaleUrl() {
  if (whaleUrlCache === null) {
    whaleUrlCache = fs.existsSync(WHALE_FILE) ? pathToFileURL(WHALE_FILE).href : '';
  }
  return whaleUrlCache;
}

const DEFAULTS = {
  enable: true,
  threshold: 30,
  maxCharsPerImage: 1200,
  maxImages: 4,
  timeout: 15000,
};

/** 熔断：连续失败 BREAKER_LIMIT 次后暂停 BREAKER_COOL 毫秒 */
const BREAKER_LIMIT = 3;
const BREAKER_COOL = 5 * 60 * 1000;

const breaker = { fails: 0, until: 0 };

/** 渲染结果缓存，避免同一段文字反复截图 */
const cache = new Map();
const CACHE_MAX = 40;

let settings = { ...DEFAULTS };
let settingsMtime = -1;
let settingsLoaded = false;
/** 「超过张数上限」提示节流 */
let lastTooLongWarn = 0;

/** 本模块的标记，挂在事件对象上，保证只包装一次 */
const HOOK_FLAG = Symbol.for('zhutianxiuxian.text2image.hook');

/**
 * 定时任务上下文标记。
 * 定时任务的 fnc 不带事件参数（this.e 也为空），我们借 AsyncLocalStorage 把
 * 「这条链路是定时任务」的信息透传到 Bot.pickGroup 的发送里，
 * 从而只让定时任务走官方主动消息，公告/传音等事件驱动的发送不受影响。
 */
const scheduledAls = new AsyncLocalStorage();

export function isScheduledContext() {
  return scheduledAls.getStore()?.scheduled === true;
}
/** 包装函数自己发图时置位，防止递归转换 */
const SELF_FLAG = Symbol.for('zhutianxiuxian.text2image.sending');

/**
 * 这些内容转成图片会失真，必须保持文本：
 *  - CQ 码 / 官方 Bot 的 at 标签：画到图里只会露出原始标记，@ 也不会真的生效
 *  - 纯链接：变成图就无法点开了
 *  - 「获得掉落」清单：合并后只有几十字，画成图片反而要多点开一层
 */
const KEEP_AS_TEXT = /\[CQ:[^\]]*\]|<qqbot-at-user[^>]*\/?>|^\s*获得掉落/mi;
const PURE_URL = /^https?:\/\/\S+$/i;

// 回复里写有「下一步指令说明」时，把文本中的 #指令 收集成按钮。
// 只认带引导词的回复，避免把任何提到 # 的普通文本都加上按钮。
const CMD_HINT = /(?:发送|回复|使用|输入|前往|点击|按|请)\s*#/;
const CMD_TOKEN = /#[\u4e00-\u9fa5A-Za-z0-9_]{2,16}/g;
function commandButtonsFrom(text) {
  if (!CMD_HINT.test(text)) return [];
  const seen = new Set();
  const cmds = [];
  for (const m of text.matchAll(CMD_TOKEN)) {
    const cmd = m[0];
    if (seen.has(cmd)) continue;
    seen.add(cmd);
    cmds.push({ text: cmd.slice(1).slice(0, 10), command: cmd });
    if (cmds.length >= 9) break; // 3 行 × 3 列
  }
  const rows = [];
  for (let i = 0; i < cmds.length; i += 3) rows.push(cmds.slice(i, i + 3));
  return rows;
}

function warn(message) {
  try {
    logger?.warn?.(`[文字转图片] ${message}`);
  } catch {}
}

function info(message) {
  try {
    logger?.info?.(`[文字转图片] ${message}`);
  } catch {}
}

function toPositiveInt(value, fallback) {
  const num = Number.parseInt(value, 10);
  return Number.isSafeInteger(num) && num > 0 ? num : fallback;
}

/** 读取配置：按 mtime 缓存，改 yaml 不用重启 */
export function getSettings() {
  try {
    const stat = fs.statSync(CONFIG_FILE);
    if (!settingsLoaded || stat.mtimeMs !== settingsMtime) {
      const raw = YAML.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) ?? {};
      const next = {
        enable: raw.enable === undefined ? DEFAULTS.enable : Boolean(raw.enable),
        threshold: toPositiveInt(raw.threshold, DEFAULTS.threshold),
        maxCharsPerImage: toPositiveInt(raw.maxCharsPerImage, DEFAULTS.maxCharsPerImage),
        maxImages: toPositiveInt(raw.maxImages, DEFAULTS.maxImages),
        timeout: toPositiveInt(raw.timeout, DEFAULTS.timeout),
      };
      // threshold 允许 0（等价于「全部转图」），上面 toPositiveInt 会拦掉 0，这里单独兜一下
      if (Number.parseInt(raw.threshold, 10) === 0) next.threshold = 0;
      settings = next;
      settingsLoaded = true;
      settingsMtime = stat.mtimeMs;
      info(`配置已加载 ${JSON.stringify(settings)}`);
    }
  } catch {
    // 没有配置文件就走默认值，不刷日志
    if (!settingsLoaded) {
      settings = { ...DEFAULTS };
      settingsLoaded = true;
    }
  }
  return settings;
}

/**
 * 从 e.reply 的入参里提取纯文本。
 * 返回 null 表示「不适合转图」，保持原样。
 */
export function extractText(msg) {
  if (typeof msg === 'string') return msg.trim() ? msg : null;
  if (Array.isArray(msg)) {
    if (!msg.length) return null;
    const parts = [];
    for (const item of msg) {
      if (typeof item === 'string') {
        parts.push(item);
        continue;
      }
      // 只接受纯文本段；at / image / markdown / button / node 等一律不转
      if (item && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string') {
        parts.push(item.text);
        continue;
      }
      return null;
    }
    const text = parts.join('');
    return text.trim() ? text : null;
  }
  if (msg && typeof msg === 'object' && msg.type === 'text' && typeof msg.text === 'string') {
    return msg.text.trim() ? msg.text : null;
  }
  return null;
}

/** 字数：去掉空白字符后按码点计数（emoji 算一个字） */
export function countChars(text) {
  return [...String(text ?? '').replace(/\s+/g, '')].length;
}

export function shouldConvert(text, cfg = getSettings()) {
  if (text === null || text === undefined) return false;
  if (!cfg.enable) return false;
  return countChars(text) > cfg.threshold;
}

/**
 * 按「行」切页，尽量不打断句子；单行超长时按字数硬切。
 */
export function splitPages(text, limit = 1200) {
  const src = String(text ?? '');
  const max = Math.max(1, Number(limit) || 1200);
  const pages = [];
  let current = '';

  const flush = () => {
    if (current) {
      pages.push(current);
      current = '';
    }
  };

  for (const line of src.split('\n')) {
    const candidate = current ? `${current}\n${line}` : line;
    if ([...candidate].length <= max) {
      current = candidate;
      continue;
    }
    flush();
    const chars = [...line];
    while (chars.length > max) pages.push(chars.splice(0, max).join(''));
    current = chars.join('');
  }
  flush();

  return pages.length ? pages : [src];
}

function cacheKey(text, page, total) {
  return crypto.createHash('sha1').update(`${page}/${total}\n${text}`).digest('hex').slice(0, 16);
}

function remember(key, buffer) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, buffer);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

function breakerAllowed() {
  return Date.now() >= breaker.until;
}

function breakerFail(reason) {
  breaker.fails += 1;
  if (breaker.fails >= BREAKER_LIMIT) {
    breaker.fails = 0;
    breaker.until = Date.now() + BREAKER_COOL;
    warn(`连续 ${BREAKER_LIMIT} 次渲染失败，暂停转图 5 分钟：${reason}`);
  }
}

function breakerOk() {
  breaker.fails = 0;
}

function withTimeout(promise, ms) {
  if (!ms) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`渲染超时（${ms}ms）`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

let rendererModule = null;

async function getRenderer() {
  if (!rendererModule) {
    rendererModule = import('../../../lib/puppeteer/puppeteer.js').then(m => m.default);
  }
  try {
    return await rendererModule;
  } catch (err) {
    rendererModule = null;
    throw err;
  }
}

/**
 * 渲染单页，返回 PNG Buffer；失败返回 null。
 * 进程内第一次渲染时 Chromium 可能还没就绪（browserInit 返回 false），
 * 这里重试一次，避免冷启动那一下就触发熔断、白等 5 分钟。
 */
async function renderPage(text, page, total, saveId) {
  const renderer = await getRenderer();
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const buffer = await renderer.render(RENDER_NAME, {
      tplFile: TPL_FILE,
      saveId,
      text,
      page,
      total,
      whaleUrl: getWhaleUrl(),
      imgType: 'png',
    });
    if (buffer && Buffer.isBuffer(buffer) && buffer.length >= 512) return buffer;
    if (attempt === 1) await new Promise(resolve => setTimeout(resolve, 300));
  }
  return null;
}

function toImageSegment(buffer) {
  const seg = globalThis.segment;
  if (seg?.image) return seg.image(buffer);
  return { type: 'image', file: buffer };
}

/**
 * 判断并生成图片消息。
 * @returns 图片段数组；返回 null 表示应当按原样发送文本
 */
export async function buildImageReply(msg) {
  const cfg = getSettings();
  if (!cfg.enable) return null;
  if (!breakerAllowed()) return null;

  const text = extractText(msg);
  if (!shouldConvert(text, cfg)) return null;

  // 带 CQ 码 / at 标签 / 纯链接的内容，画进图片里会坏掉，保持文本
  if (KEEP_AS_TEXT.test(text) || PURE_URL.test(text.trim())) return null;

  const pages = splitPages(text, cfg.maxCharsPerImage);
  if (pages.length > cfg.maxImages) {
    // 长文本来回刷屏没必要，这条提示每分钟最多一次
    if (Date.now() - lastTooLongWarn > 60_000) {
      lastTooLongWarn = Date.now();
      warn(`内容 ${countChars(text)} 字需 ${pages.length} 张图，超过上限 ${cfg.maxImages}，改回文本发送`);
    }
    return null;
  }

  const segments = [];
  for (let i = 0; i < pages.length; i += 1) {
    const key = cacheKey(pages[i], i + 1, pages.length);
    let buffer = cache.get(key);
    if (!buffer) {
      try {
        buffer = await withTimeout(renderPage(pages[i], i + 1, pages.length, `t2i-${key}`), cfg.timeout);
      } catch (err) {
        buffer = null;
        warn(`渲染失败，回退文本：${err?.message ?? err}`);
      }
      if (!buffer) {
        breakerFail('渲染返回空');
        return null;
      }
      breakerOk();
      remember(key, buffer);
    }
    segments.push(toImageSegment(buffer));
  }

  return segments;
}

/**
 * 给事件装 e.reply 拦截器（幂等）。
 * 只作用于修仙插件自己的指令处理过程：包装函数只在修仙处理器进入时才安装。
 */
export function installTextToImageHook(e) {
  if (!e || typeof e !== 'object' || e[HOOK_FLAG] || typeof e.reply !== 'function') return false;
  e[HOOK_FLAG] = true;

  const original = e.reply;
  // 触发消息指纹：官方全量事件和协议号事件是同一条消息，用「内容 + 时间」把 msg_id 配回来
  const trigger = {
    groupId: String(e.group_id ?? ''),
    content: String(e.msg ?? e.raw_message ?? ''),
    time: Date.now(),
  };
  // 事件本身来自官方 Bot 时不再代发，避免绕回自己
  const fromOfficial = String(e.self_id ?? '').startsWith('qqbot-');
  const cmdCapable = isOfficialMessageEvent(e);

  e.reply = async function (msg, quote = false, data = {}) {
    // 自己发图时直接放行，避免递归
    if (this?.[SELF_FLAG]) return original.call(this, msg, quote, data);

    // 带「下一步指令说明」的纯文本：正文保持纯文本气泡，后面跟一条指令按钮。
    // 这是唯一会自动出按钮的分支，其余回复完全走下面的原路径（转图 / 纯文本）。
    if (cmdCapable && typeof msg === 'string'
      && !KEEP_AS_TEXT.test(msg) && !PURE_URL.test(msg.trim())) {
      const rows = commandButtonsFrom(msg);
      if (rows.length) {
        const out = buildOfficialMessage('', rows, '', [{ type: 'text', text: msg }]);
        if (!fromOfficial) {
          try {
            const route = await tryOfficialSend(trigger, out);
            if (route.handled) return route.res ?? true;
          } catch (err) {
            warn(`指令按钮代发异常，回退协议号：${err?.message ?? err}`);
          }
        }
        return original.call(this, out, quote, data);
      }
    }

    let payload = null;
    try {
      payload = await buildImageReply(msg);
    } catch (err) {
      warn(`转图判断异常，按文本发送：${err?.message ?? err}`);
      payload = null;
    }

    // 官方优先：带 msg_id 属于被动消息，不吃「20 条/分钟、1000 条/天」的主动消息配额；
    // 发不出去会自动回退到下面的协议号发送。
    // 引用回复也走官方：官方 v2 没有引用样式，发出后引用会被丢弃，但消息内容不丢——
    // 之前对 quote 直接放行协议号，导致洗劫/兑换这类带引用的回复永远都是协议号身份。
    if (!fromOfficial) {
      try {
        const route = await tryOfficialSend(trigger, payload || msg);
        if (route.handled) return route.res ?? true;
      } catch (err) {
        warn(`官方代发异常，回退协议号：${err?.message ?? err}`);
      }
    }

    if (!payload) return original.call(this, msg, quote, data);

    try {
      this[SELF_FLAG] = true;
      const result = await original.call(this, payload, quote, data);
      if (result === false) {
        // 图片没发出去：退回文本，别让用户什么都收不到
        warn('图片发送失败，回退文本重发');
        return original.call(this, msg, quote, data);
      }
      return result;
    } catch (err) {
      warn(`图片发送异常，回退文本重发：${err?.message ?? err}`);
      return original.call(this, msg, quote, data);
    } finally {
      this[SELF_FLAG] = false;
    }
  };

  return true;
}

/**
 * 给插件类的所有原型方法套一层：处理器一执行，就给当前事件装 e.reply 拦截器。
 *
 * 这样插件里 6900+ 处 e.reply 调用不必逐个改；而且只包装本插件自己的类，
 * 其它插件拿到的事件对象完全不受影响。
 *
 * @returns 被包装的方法数量
 */
export function wrapPluginClass(cls) {
  const proto = cls?.prototype;
  if (!proto || proto.__textToImageWrapped) return 0;

  let wrapped = 0;
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === 'constructor') continue;
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (!desc || typeof desc.value !== 'function' || !desc.writable) continue;

    const original = desc.value;
    proto[name] = function (...args) {
      const e = args[0];
      // 处理器第一个参数就是事件；工具方法拿到的是别的东西，这里自然跳过
      if (e && typeof e === 'object' && typeof e.reply === 'function') {
        installTextToImageHook(e);
        return original.apply(this, args);
      }
      // 没有事件参数、且实例上也没有当前事件 = 定时任务触发（cron 的 fnc 是 this.Xxx()）
      if (!this?.e && args.length === 0) {
        return scheduledAls.run({ scheduled: true }, () => original.apply(this, args));
      }
      return original.apply(this, args);
    };
    wrapped += 1;
  }
  proto.__textToImageWrapped = wrapped;
  return wrapped;
}

/** 测试/运维用：清空缓存与熔断状态 */
export function resetTextToImageState() {
  cache.clear();
  breaker.fails = 0;
  breaker.until = 0;
  settingsLoaded = false;
  settingsMtime = -1;
}
