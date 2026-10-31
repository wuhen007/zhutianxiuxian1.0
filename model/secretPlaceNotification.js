function stringId(value) {
  if (value == null) return '';
  return String(value).trim();
}

function isFailedSend(result) {
  const retcode = Number(result?.retcode);
  return result?.status === 'failed' || (Number.isFinite(retcode) && retcode !== 0);
}

function sendFailureMessage(result) {
  return result?.message || result?.wording || 'unknown send failure';
}

export function getSecretPlaceSummaryNotificationRoute(entry) {
  const configuredType = entry?.notify_type;
  const hasConfiguredRoute = configuredType === 'private' || configuredType === 'group';
  const type = hasConfiguredRoute
    ? configuredType
    : stringId(entry?.qq_group)
      ? 'group'
      : 'private';
  const target = stringId(
    entry?.notify_target ?? (type === 'group' ? entry?.qq_group : entry?.qq)
  );
  const botId = stringId(entry?.notify_bot_id);
  const playerId = stringId(entry?.qq ?? (type === 'private' ? target : ''));

  const action = botId ? { notify_bot_id: botId } : {};
  if (hasConfiguredRoute) {
    action.notify_type = type;
    action.notify_target = target;
    if (type === 'group') action.group_id = target;
  } else if (type === 'group') {
    // Keep old summary entries on the legacy path so pseudo-groups can fall back to private.
    action.group_id = target;
  }

  return {
    // key 不带 botId：同群同类型的消息合并成一批。
    // 带 botId 会把「协议号触发」和「官方号触发」拆成两批，同一秒往同一个群发两张图。
    key: JSON.stringify([type, target]),
    type,
    target,
    playerId,
    action,
  };
}

export function applySecretPlaceNotificationContext(action, event, playerId) {
  if (!action || typeof action !== 'object') return action;

  const botId = stringId(event?.self_id || event?.bot?.uin || event?.bot?.id);
  if (botId) action.notify_bot_id = botId;

  const privateReply = event?.qqbot_reply_type === 'private'
    || event?.qqbot_private_as_group === true
    || !event?.isGroup;

  if (privateReply) {
    const target = stringId(playerId || event?.user_id);
    if (target) {
      action.notify_type = 'private';
      action.notify_target = target;
    }
    delete action.group_id;
    return action;
  }

  const target = stringId(event?.group_id);
  if (target) {
    action.notify_type = 'group';
    action.notify_target = target;
    action.group_id = event.group_id;
  }
  return action;
}

function getNotificationRoute(action, playerId) {
  const configuredType = action?.notify_type;
  if (configuredType === 'private' || configuredType === 'group') {
    return {
      type: configuredType,
      target: stringId(action.notify_target || (configuredType === 'group' ? action.group_id : playerId)),
      legacy: false,
    };
  }

  if (stringId(action?.group_id)) {
    return { type: 'group', target: stringId(action.group_id), legacy: true };
  }
  return { type: 'private', target: stringId(playerId), legacy: true };
}

function resolveBot(botRoot, botId) {
  if (botId && botRoot?.[botId]) return botRoot[botId];
  return botRoot;
}

/**
 * 条目指定的 bot 是否就是主 bot。
 * Bot.uin 是数组（带 now 属性），兼容写成字符串的情况。
 */
function isMainBot(botRoot, botId) {
  if (!botId) return false;
  try {
    const uins = [String(botRoot?.uin), ...(Array.isArray(botRoot?.uin) ? botRoot.uin.map(String) : [])];
    return uins.includes(String(botId));
  } catch {
    return false;
  }
}

async function sendByRoute(botRoot, bot, route, message, botId) {
  // 群消息且是主 bot 时走主实例：官方代发的接管挂在 Yunzai.prototype.pickGroup 上，
  // 而 Bot[uin] 拿到的是适配器实例，它没有这层包装，直接用会永远走协议号。
  const sender =
    route.type === 'group'
      ? isMainBot(botRoot, botId)
        ? botRoot?.pickGroup?.(route.target)
        : bot?.pickGroup?.(route.target)
      : bot?.pickUser?.(route.target);
  if (!sender?.sendMsg) throw new Error(`missing ${route.type} sender for ${route.target}`);

  const result = await sender.sendMsg(message);
  if (isFailedSend(result)) throw new Error(sendFailureMessage(result));
  return true;
}

export async function sendSecretPlaceNotification(action, playerId, message, options = {}) {
  const botRoot = options.botRoot ?? globalThis.Bot;
  const logger = options.logger ?? console;
  const route = getNotificationRoute(action, playerId);
  const bot = resolveBot(botRoot, stringId(action?.notify_bot_id));
  const attempts = [route];

  // Older QQBot private actions were persisted as a group whose id equals the player id.
  if (route.legacy && route.type === 'group' && route.target === stringId(playerId)) {
    attempts.push({ type: 'private', target: stringId(playerId), legacy: true });
  }

  let lastError;
  for (const attempt of attempts) {
    try {
      await sendByRoute(botRoot, bot, attempt, message, action?.notify_bot_id);
      return true;
    } catch (error) {
      lastError = error;
    }
  }

  const detail = lastError?.message || String(lastError || 'unknown error');
  logger.error?.(`[秘境通知] 玩家${playerId}消息发送失败，奖励结算继续: ${detail}`);
  return false;
}
