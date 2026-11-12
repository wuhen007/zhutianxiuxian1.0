import config from './Config.js';
import { isConfigured } from './officialReply.js';

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

/** 状态 / 信息 / 排行榜面板底下的通用导航 */
export const STATUS_NAV_BUTTONS = [
  [
    { text: '修仙状态', command: '#修仙状态', permission: false },
    { text: '我的练气', command: '#我的练气', permission: false },
    { text: '我的纳戒', command: '#我的纳戒', permission: false },
  ],
  [
    { text: '修仙助手', command: '#修仙助手', permission: false },
    { text: '我的装备', command: '#我的装备', permission: false },
    { text: '我的炼体', command: '#我的炼体', permission: false },
  ],
  [
    { text: '天榜', command: '#天榜', permission: false },
    { text: '魔道榜', command: '#魔道榜', permission: false },
  ],
];

export function isOfficialMessageEvent(e) {
  const adapterId = String(e?.bot?.adapter?.id || e?.adapter?.id || '').toLowerCase();
  if (adapterId === 'qqbot') return true;
  if (String(e?.user_id || '').startsWith('qg_')) return true;
  if (String(e?.qqbot_user_id || '').trim()) return true;
  // 协议号收、官方号发：判的是发送出口，不是入口。该群配了官方代发就走 markdown。
  return isConfigured(e?.group_id) || config.getConfig('xiuxian', 'xiuxian')?.BotType === 'official';
}

// 官方文档上限是每行 5 个，但手机 QQ 上每行 4 个就会显示不全。
// 统一按每行最多 3 个折行，所有按钮组（含动态生成的）都经这里，不必逐个改。
const BUTTONS_PER_ROW = 3;
const MAX_BUTTON_ROWS = 5;

export function buildOfficialMessage(markdown, buttonRows = [], userId = '', content = []) {
  const message = (Array.isArray(content) ? content : [content]).filter(Boolean);
  if (markdown) message.push({ type: 'markdown', data: markdown });
  // 只拆「超过 3 个」的行，原有的行顺序与分组保持不变
  //（仙古九宫格 3×3、签到 3×2 这类有布局含义的不会被打乱）。
  const fitted = [];
  for (const row of buttonRows) {
    const list = Array.isArray(row) ? row : [row];
    for (let i = 0; i < list.length; i += BUTTONS_PER_ROW) {
      fitted.push(list.slice(i, i + BUTTONS_PER_ROW));
    }
  }
  const rows = fitted.slice(0, MAX_BUTTON_ROWS).map(row => row.map(({ command, permission, ...button }) => ({
    ...button,
    callback: command,
    // 官方 keyboard 的 specify_user_ids 要平台用户 ID，群/C2C 的 openid 不能填（会提示"无权限操作"）。
    // 默认所有人可点；指令本身按点按者的身份执行，别人点也只是操作自己的角色。
    permission: permission ?? false,
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

/** 图片/转发消息已经自己发出去了，只补一条状态导航 */
export async function sendStatusNav(e) {
  return replyOfficialButtons(e, { buttons: STATUS_NAV_BUTTONS });
}

/**
 * 把「【XX状态】\n字段：值\n说明文字」这种纯文本面板转成轻量 markdown。
 * 只把首行提为标题、把「字段：值」变成加粗列表，其余说明原样保留。
 */
export function plainStateToMarkdown(text) {
  const lines = String(text || '').split('\n');
  if (!lines.length) return '';
  const head = lines[0].replace(/^【(.+)】$/, '## $1');
  const body = lines.slice(1).map(line => {
    if (!line.trim()) return '';
    const m = /^([^：:\n]{1,16})[：:]\s*(.+)$/.exec(line);
    // 说明性文字用块引用，避免被渲染成上一条列表项的续行
    return m ? `- **${m[1]}**：${m[2]}` : `> ${line}`;
  });
  return [head, '', ...body].join('\n');
}
