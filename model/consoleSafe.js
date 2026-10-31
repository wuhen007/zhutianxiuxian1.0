import util from 'node:util';

/**
 * 控制台日志净化
 * ------------------------------------------------------------
 * 现象：MCSManager 面板里偶发 `�`（U+FFFD），但 logs/*.log 文件完全正常。
 * 原因：面板通过 Windows 终端通道（pty）读取进程输出，该通道只认 BMP 字符，
 *       emoji 这类 4 字节 UTF-8 字符（U+10000 以上）会被吞成 U+FFFD。
 *       实例日志里能直接看到 EF BF BD，说明不是前端渲染问题，而是通道本身丢字符。
 * 处理：在 process.stdout / process.stderr 这一层把非 BMP 字符降级为等价 BMP 符号，
 *       让输出流里不再出现 4 字节字符。
 * 边界：只清洗控制台输出。发给 QQ 的消息、存档、日志文件内容都不受影响。
 */

/** 常见 emoji → BMP 近似符号，保持日志可读性 */
const BMP_FALLBACK = {
  '🌟': '★', '⭐': '★', '✨': '✧', '💫': '✧', '🔆': '☀',
  '💀': '☠', '🔥': '♨', '⚡': 'ϟ', '💥': '✹', '❄': '❄',
  '📍': '◆', '📌': '◆', '🔖': '◆', '📜': '▤', '📖': '▤', '📕': '▤',
  '📝': '✎', '✍': '✎', '🎯': '◎', '🔍': '⌕', '🔎': '⌕',
  '🎉': '☆', '🎊': '☆', '🏆': '♛', '👑': '♛', '💎': '◇', '🎁': '▣',
  '⏰': '◷', '⏳': '◷', '⌛': '◷', '🚀': '↑', '⛔': '⊘', '🚫': '⊘',
  '✅': '√', '❌': '×', '⚠': '!', '💡': '※', '🔔': '♪', '🎵': '♪',
  '🗡': '†', '⚔': '⚔', '🛡': '⛨', '🏮': '◉', '🌙': '☾', '🌕': '◯',
  '🩸': '≈', '💧': '≈', '🌊': '≈', '🍀': '❀', '🌸': '❀', '🌺': '❀',
};

const HAS_NON_BMP = /[\u{10000}-\u{10FFFF}]/u;
const NON_BMP_G = /[\u{10000}-\u{10FFFF}]/gu;

/** ANSI CSI 序列：颜色（SGR）、光标移动、清行等 */
const ANSI_CSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
/** ANSI OSC 序列：设置窗口标题等，以 BEL 或 ST 结尾 */
const ANSI_OSC = /\x1b\][^\u0007]*(?:\u0007|\x1b\\)/g;

/**
 * 把字符串里的非 BMP 字符替换成 BMP 等价符号，未收录的直接去掉；
 * 同时剥掉 ANSI 转义序列。
 *
 * 为什么连颜色也要剥：MCSM 的终端通道会把子进程输出里的 ESC（0x1B）替换成 `?`，
 * 于是 `\x1b[32m` 在面板上显示成 `?[32m`，一行日志开头就是一片 `?[32m[时间][INFO]?[39m`。
 * 与其指望通道修复 ESC，不如直接不给它 ESC——纯文本在任何终端里都不会变乱码。
 *
 * @param {string} text
 * @returns {string}
 */
export function toConsoleSafe(text) {
  if (typeof text !== 'string' || !text) return text;

  let out = text;
  // 先剥 ANSI：控制序列里没有多字节字符，先处理可以让后续判断更省事
  if (out.includes('\x1b')) {
    out = out.replace(ANSI_OSC, '').replace(ANSI_CSI, '');
  }
  if (HAS_NON_BMP.test(out)) {
    out = out.replace(NON_BMP_G, ch => BMP_FALLBACK[ch] ?? '');
  }
  return out;
}

/**
 * 给可写流挂上净化钩子。字符串 chunk 才处理，Buffer 原样放行（避免破坏二进制内容）。
 */
function wrapStream(stream, flag) {
  if (!stream || typeof stream.write !== 'function' || stream[flag]) return;
  Object.defineProperty(stream, flag, { value: true, enumerable: false });

  const original = stream.write.bind(stream);
  stream.write = function (chunk, ...rest) {
    if (typeof chunk === 'string') {
      const next = toConsoleSafe(chunk);
      if (next !== chunk) chunk = next;
    }
    return original(chunk, ...rest);
  };
}

/**
 * 安装全局净化（幂等）。包装 stdout/stderr 之后，console.* 与 log4js 控制台输出都会经过这里。
 * @returns {boolean} 本次是否真正安装
 */
export function installConsoleSafe() {
  if (globalThis.__miaoConsoleSafe) return false;
  globalThis.__miaoConsoleSafe = true;
  wrapStream(process.stdout, '__consoleSafeWrapped');
  wrapStream(process.stderr, '__consoleSafeWrapped');
  // 启动标记：重启后能在面板里直接确认净化已生效
  process.stdout.write('[consoleSafe] 面板日志净化已启用（剥离 ANSI 颜色 / 降级 emoji）\n');
  return true;
}

/** 便捷方法：手动净化一段文本（给需要自己拼日志的地方用） */
export { toConsoleSafe as safeText };

// 模块被 import 时立即生效。ESM 会先求值依赖，再执行当前模块体，
// 因此本文件作为 index.js 的第一条 import，能保证后续模块的顶层日志也被覆盖。
installConsoleSafe();

export default { toConsoleSafe, installConsoleSafe, safeText: toConsoleSafe, util };
