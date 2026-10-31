/**
 * 定时任务的发送重定向
 *
 * 定时任务（cron）不走 e.reply，而是 `Bot.pickGroup(群号).sendMsg(...)`；
 * 而「公告 / 传音」这类事件驱动的发送也用同一个方法。为了只改定时任务、不动公告，
 * 这里给 Bot.pickGroup 套一层：只有「当前处于定时任务上下文」且「该群配置了官方代发」时，
 * 才把 sendMsg 改成走官方主动消息；其余情况原样返回真实 Group 对象。
 *
 * 定时任务的上下文标记由 model/textToImage.js 的 AsyncLocalStorage 提供
 * （cron 的 fnc 形如 `this.Xxx()`，不带事件参数，实例上也没有 this.e）。
 */
import BotClass from '../../../lib/bot.js';
import { isScheduledContext } from './textToImage.js';
import { isConfigured, tryOfficialActive } from './officialReply.js';

const INSTALLED = Symbol.for('zhutianxiuxian.scheduledSender');

/** 给一个 Group 对象包上「优先官方主动消息」的 sendMsg */
function wrapGroup(group, groupId) {
  return new Proxy(group, {
    get(target, prop) {
      if (prop === 'sendMsg') {
        return async (msg, ...args) => {
          try {
            const result = await tryOfficialActive(groupId, msg);
            if (result.handled) return result.res ?? true;
          } catch (err) {
            try {
              logger?.warn?.(`[官方代发] 定时任务发送异常，回退协议号：${err?.message ?? err}`);
            } catch {}
          }
          return target.sendMsg(msg, ...args);
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/**
 * 安装到 Bot.pickGroup（幂等）。
 * 必须在 Bot 已就绪后调用（插件加载阶段调用即可）。
 */
export function installScheduledSender(target) {
  if (globalThis[INSTALLED]) return false;

  /**
   * 注意：必须改 Yunzai 类原型上的 pickGroup，而不是 globalThis.Bot.pickGroup。
   * Bot 是 Proxy（lib/bot.js），它的 get 顺序是 this[prop] ?? util[prop] ?? target[prop]，
   * 而 pickGroup 正是 Yunzai 类自己的方法，所以往 Bot 上赋值会被 this[prop] 遮蔽、永远读不到。
   */
  // 测试可以传入自己的 proto；生产默认接管 Yunzai 原型
  const proto = target || BotClass?.prototype;
  if (typeof proto?.pickGroup !== 'function') return false;
  globalThis[INSTALLED] = true;

  const original = proto.pickGroup;
  proto.pickGroup = function (groupId, ...rest) {
    const group = original.call(this, groupId, ...rest);
    // 只有「定时任务上下文」+「该群配置了官方代发」才接管；公告/传音等保持原样
    if (!isScheduledContext() || !isConfigured(groupId)) return group;
    try {
      return wrapGroup(group, groupId);
    } catch {
      return group;
    }
  };

  try {
    logger?.info?.('[官方代发] 定时任务发送已接管 Bot.pickGroup（仅对已配置群生效，公告/传音不受影响）');
  } catch {}
  return true;
}
