/**
 * 指令容错：忽略井号后的空格与全角井号
 *
 * 玩家很常发 `# 修仙状态`（井号后多打一个空格）或 `＃修仙状态`（全角井号），
 * 而云崽的指令匹配是严格的 `^#修仙状态$`，这类输入会全部匹配不上，
 * 表现就是「发了没反应」—— 既不报错也没有提示，很难自己发现。
 *
 * 做法：包装 loader.dealEvent。它负责把消息段拼成 e.msg，
 * 而 deal 在它之后才开始遍历插件做正则匹配，所以在这里改 e.msg 正好来得及，
 * 且对官方通道和协议号通道同时生效（两个通道最终都走同一个 loader）。
 *
 * 只动「开头是井号」的消息，其它消息一律不碰，避免误触发。
 */
const FLAG = Symbol.for('zhutianxiuxian.hashSpaceFix');

/**
 * 把指令开头的全角井号、井号后空白、首尾空白统一掉。
 *   `＃修仙状态` / `# 修仙状态` / `#修仙状态 ` → `#修仙状态`
 * 非指令消息（开头不是井号）原样返回，避免动到普通聊天。
 */
export function normalizeHashSpace(text) {
  const raw = String(text ?? '');
  if (!raw) return raw;
  if (!/^\s*[#＃]/.test(raw)) return raw;
  // 尾部空白也要去掉：多数指令用 `^#xxx$` 锚定，多一个空格就匹配不上
  return raw.trimStart().replace(/^[#＃]\s*/, '#').trimEnd();
}

/**
 * 给一个 loader 实例套上 dealEvent 包装。
 * 抽成独立函数是为了能离线测试（测试传桩对象，不碰真实 loader）。
 */
export function wrapDealEvent(target) {
  if (!target || typeof target.dealEvent !== 'function') return false;
  const original = target.dealEvent;
  target.dealEvent = function (e, groupCfg) {
    const result = original.call(this, e, groupCfg);
    try {
      if (e && typeof e.msg === 'string') {
        const fixed = normalizeHashSpace(e.msg);
        if (fixed !== e.msg) {
          // 留一份原始输入，排查误触发时能对照
          if (e.raw_message === undefined) e.raw_message = e.msg;
          e.msg = fixed;
        }
      }
    } catch {}
    return result;
  };
  return true;
}

export async function installHashSpaceFix() {
  if (globalThis[FLAG]) return false;
  // 动态加载：避免本模块在被 import 时就把云崽 loader 初始化一遍
  let loader;
  try {
    loader = (await import('../../../lib/plugins/loader.js')).default;
  } catch {
    return false;
  }
  if (!wrapDealEvent(loader)) return false;
  globalThis[FLAG] = true;
  try {
    logger?.info?.('[指令容错] 已忽略井号后的空格与全角井号');
  } catch {}
  return true;
}
