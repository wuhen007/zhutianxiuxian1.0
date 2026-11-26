import { isConfigured, tryOfficialActive } from '../../model/officialReply.js';

export function readyWorldChatBot(bot = globalThis.Bot) {
  if (!bot || typeof bot.pickGroup !== 'function') return null;
  if (Array.isArray(bot.uin) && bot.uin.length === 0) return null;
  return bot;
}

function failedSendResult(result) {
  if (result === false || result?.status === 'failed') return true;
  return Number.isFinite(Number(result?.retcode)) && Number(result.retcode) !== 0;
}

function sendResultError(groupId, result) {
  const reason =
    result?.wording ||
    result?.message ||
    result?.msg ||
    (result?.retcode !== undefined ? `retcode_${result.retcode}` : 'unknown');
  return new Error(`group_send_failed:${groupId}:${reason}`);
}

export async function sendWorldGroupMessage(
  bot,
  groupId,
  message,
  fallback
) {
  // 世界频道优先用官方身份发（配了代发的群才走这条）。
  // 广播式消息没有触发消息可借，只能走主动消息，受每群 20 条/分钟、1000 条/天限制；
  // 超限/超时/失败都会返回 handled:false，自动落到下面的协议号逻辑，不丢消息。
  if (isConfigured(groupId)) {
    try {
      const official = await tryOfficialActive(groupId, message, { scope: 'worldChat' });
      if (official?.handled) return official.res ?? true;
    } catch (error) {
      globalThis.logger?.warn?.(`[worldchat] 官方发送异常，回退协议号：${error.message}`);
    }
  }

  let primaryError;
  try {
    const group = bot.pickGroup(groupId, true);
    if (!group?.sendMsg) throw new Error(`group_unavailable:${groupId}`);
    const result = await group.sendMsg(message);
    if (failedSendResult(result)) throw sendResultError(groupId, result);
    return result;
  } catch (error) {
    primaryError = error;
  }

  if (typeof fallback === 'function') {
    const result = await fallback(message);
    if (failedSendResult(result)) throw sendResultError(groupId, result);
    return result;
  }
  throw primaryError;
}

export function extractWorldImageUrls(message) {
  if (!Array.isArray(message)) return [];
  return [...new Set(message
    .filter((item) => item?.type === 'image')
    .map((item) => item.url || item.file)
    .filter(Boolean))].slice(0, 3);
}
