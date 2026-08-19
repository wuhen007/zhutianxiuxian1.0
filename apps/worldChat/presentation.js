import { clientFilter } from './filter.js';

const WORLD_DIVIDER = '━━━━━━━━━━━━━━━━━━━━';

function messageTime(timestamp) {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

/**
 * Keep world-chat delivery and history queries visually identical.
 * QQ renders this as a normal text bubble, so the fixed header and dividers
 * make a cross-server message easy to spot without relying on Markdown.
 */
export function formatWorldChatMessage(message) {
  const serverName = String(message?.name || '未知区服').trim();
  const senderName = String(message?.sender_name || '无名道友').trim();
  const images = Array.isArray(message?.images) ? message.images : [];
  const text = clientFilter(message?.msg) || (images.length ? '（附带图片）' : '');
  const lines = [
    '【🌐 跨服世界发言】',
    WORLD_DIVIDER,
    `区服：${serverName}`,
    `发言人：${senderName}`,
    `内容：${text}`,
    `时间：${messageTime(message?.ts)}`,
  ];

  if (message?.expose_level === 'public' && message?.groups?.length) {
    lines.push(`来源群：${message.groups.join('、')}`);
  }
  lines.push(WORLD_DIVIDER);
  return lines.join('\n');
}
