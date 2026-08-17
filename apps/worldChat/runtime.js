export function readyWorldChatBot(bot = globalThis.Bot) {
  if (!bot || typeof bot.pickGroup !== 'function') return null;
  if (Array.isArray(bot.uin) && bot.uin.length === 0) return null;
  return bot;
}

export async function sendWorldGroupMessage(bot, groupId, message) {
  const group = bot.pickGroup(groupId, true);
  if (!group?.sendMsg) throw new Error(`group_unavailable:${groupId}`);
  return group.sendMsg(message);
}

export function extractWorldImageUrls(message) {
  if (!Array.isArray(message)) return [];
  return [...new Set(message
    .filter((item) => item?.type === 'image')
    .map((item) => item.url || item.file)
    .filter(Boolean))].slice(0, 3);
}
