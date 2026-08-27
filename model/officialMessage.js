import config from './Config.js';

export const DAILY_SIGN_BUTTONS = [
  [
    { text: '修仙签到', command: '#修仙签到', permission: false },
    { text: '天道赐福', command: '#天道赐福', permission: false },
  ],
  [
    { text: '道法赐福', command: '#道法赐福', permission: false },
    { text: '垂钓签到', command: '#垂纶', permission: false },
  ],
  [
    { text: '巡界签到', command: '#巡界签到', permission: false },
    { text: '星海之缘签到', command: '#星海之缘签到', permission: false },
  ],
];

export function isOfficialMessageEvent(e) {
  const adapterId = String(e?.bot?.adapter?.id || e?.adapter?.id || '').toLowerCase();
  if (adapterId === 'qqbot') return true;
  if (String(e?.user_id || '').startsWith('qg_')) return true;
  if (String(e?.qqbot_user_id || '').trim()) return true;
  return config.getConfig('xiuxian', 'xiuxian')?.BotType === 'official';
}

export function buildOfficialMessage(markdown, buttonRows = [], userId = '', content = []) {
  const message = (Array.isArray(content) ? content : [content]).filter(Boolean);
  if (markdown) message.push({ type: 'markdown', data: markdown });
  const rows = buttonRows.map(row => row.map(({ command, permission, ...button }) => ({
    ...button,
    callback: command,
    permission: permission ?? userId,
  })));
  if (rows.length) message.push({ type: 'button', data: rows });
  return message;
}

export function replyOfficialMessage(e, { markdown, text = markdown, buttons = [], content = [] }) {
  if (!isOfficialMessageEvent(e)) return e.reply(text);
  return e.reply(buildOfficialMessage(markdown, buttons, String(e.qqbot_user_id || e.user_id || ''), content));
}

export function replyImageWithButtons(e, { image, buttons = [] }) {
  if (!isOfficialMessageEvent(e)) return e.reply(image);
  return e.reply(buildOfficialMessage('', buttons, String(e.qqbot_user_id || e.user_id || ''), [image]));
}

export function replyOfficialButtons(e, { markdown, buttons = [] }) {
  if (!isOfficialMessageEvent(e)) return false;
  return e.reply(buildOfficialMessage(markdown, buttons, String(e.qqbot_user_id || e.user_id || '')));
}
