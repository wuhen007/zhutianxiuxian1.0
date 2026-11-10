import { pushGroup } from './officialReply.js'

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

async function sendByRoute(botRoot, bot, route, message, botId) {
  // 群消息统一走 pushGroup：官方号优先，失败/未配置再回退协议号。
  //
  // 原来这里靠 `isMainBot` + `Bot.pickGroup`（该原型方法被 scheduledSender 包了一层，
  // 只在 isScheduledContext() 为真时接管官方发送）这两层判断。任意一环不成立
  // —— notify_bot_id 对不上、ALS 上下文没传进来 —— 都会**静默**走协议号，
  // 日志里连一条「回退」都不会留下。2026-11-10 19:59 的沉迷结算图就是这么漏的。
  // 现在只认一个出口，官方发不出去会留下 warn，可查。
  if (route.type === 'group') {
    const res = await pushGroup(route.target, message);
    if (!res.ok) throw new Error(res.reason || `send failed for ${route.target}`);
    return true;
  }

  const sender = bot?.pickUser?.(route.target);
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
