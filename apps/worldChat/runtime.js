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
