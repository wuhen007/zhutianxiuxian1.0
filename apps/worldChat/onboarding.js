// Public help/onboarding only. Never include realm secrets or enrollment tokens
// in group replies; connecting a bot does not opt every group into broadcasts.
export const WORLD_CHAT_HELP_PATTERN = '^#(?:世界(?:聊天|频道)?(?:\\s*(?:帮助|菜单))?|世界帮助)$';
export const WORLD_CHAT_JOIN_PATTERN = '^#(?:世界(?:聊天|频道)?\\s*加入|加入世界(?:聊天|频道))$';
export const WORLD_CHAT_LEAVE_PATTERN = '^#(?:世界(?:聊天|频道)?\\s*退出|退出世界(?:聊天|频道))$';

export function canManageWorldChatGroup(e) {
  const role = String(e.sender?.role || e.member?.role || '').toLowerCase();
  return Boolean(e.isMaster || role === 'owner' || role === 'admin' ||
    e.member?.is_owner === true || e.member?.is_admin === true);
}

export function worldChatConnectionHint(status = {}) {
  if (status.enable === false) return '世界频道已关闭；请机器人主人发送「#世界开启」后再收取消息。';
  if (status.connected && status.authed) return '公共总机已连接，已加入的群会实时接收其他区服的世界发言。';
  if (status.last_error === 'banned') return '本服被总机暂停接入，请联系总机管理员处理。';
  if (['enrollment_required', 'enrollment_invalid', 'auth_failed', 'invalid_registration_response'].includes(status.last_error)) {
    return '本服身份登记尚未通过；请机器人主人私聊发送「#世界状态」，按 docs/world-chat-quickstart.md 检查接入配置。';
  }
  if (status.last_error === 'registration_rate_limited') return '总机登记暂时限流，客户端将自动重试；请稍后用「#世界状态」核验。';
  if (status.connected) return '已接上总机，身份确认中；通过后自动接收，请用「#世界状态」查看。';
  return '正在连接公共总机，连通后自动接收；无需重复加入，可用「#世界状态」查看进度。';
}

export function buildWorldChatHelp({ status = {}, isGroup = false, joined = false } = {}) {
  const lines = [
    '【世界聊天帮助】',
    '1. 群主、群管理员或机器人主人：#加入世界聊天（也支持 #世界加入）',
    '2. 成员跨服发言：#世界发言 内容（可附图片）',
    '3. 查看消息：#世界查看 10',
    '4. 查看连接与本群接收状态：#世界状态',
    '5. 网页传音、纳戒和交易：#世界网页',
    '6. 停止本群接收：#退出世界聊天',
    '机器人主人：#世界开启 / #世界关闭 / #世界改名 区服名',
    '安装并重启后客户端会尝试自动登记、连接和重连；只有已加入的群才转发世界消息。',
    '普通群聊天不会自动上传，使用 #世界发言 才会发送到其他区服。',
    '跨服聊天不迁移玩家存档，也不会自动开放跨服交易。',
  ];
  lines.push(isGroup ? `本群接收：${joined ? '已加入' : '未加入，请群管理员操作第1步'}` : '请到需要接收世界消息的群里执行加入指令。');
  lines.push(worldChatConnectionHint(status));
  return lines.join('\n');
}

export async function joinWorldChatGroup(client, e, rememberGroupSender = () => {}) {
  if (!e.isGroup) return e.reply('请在需要接收世界消息的群里发送「#加入世界聊天」');
  if (!canManageWorldChatGroup(e)) return e.reply('仅机器人主人、群主或群管理员可让群聊加入世界频道');
  const groupId = String(e.group_id || '');
  if (!/^[\w-]{1,64}$/.test(groupId)) return e.reply('群标识格式异常，请检查机器人适配器。');
  rememberGroupSender(e);
  const added = client.joinGroup(groupId);
  // Respect an explicit global disable. Group admins cannot override the bot
  // owner's switch, but a valid subscription is retained for the next enable.
  if (client.status().enable !== false) client.connect();
  const status = client.status();
  await e.reply([
    added ? '本群已加入世界聊天，接收设置已保存。' : '本群已经加入世界聊天，无需重复加入。',
    worldChatConnectionHint(status),
    '跨服发言：#世界发言 内容；帮助：#世界帮助；退出：#退出世界聊天',
  ].join('\n'));
  return true;
}
