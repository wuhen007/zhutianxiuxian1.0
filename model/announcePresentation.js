import fs from 'node:fs';

const GROUP_DESCRIPTIONS = {
  新玩法: '从修炼路线到诸天奇遇，本期新增内容都归在这里。',
  调整: '成长门槛、玩法规则与奖励体验的调整。',
  修复: '把会影响结算、成长和日常操作的问题集中收口。',
};

export const ANNOUNCE_PAGE_SIZE = 2;

export function loadAnnouncement(source = new URL('../data/announce.json', import.meta.url)) {
  return JSON.parse(fs.readFileSync(source, 'utf8'));
}

// 群内逐页展示本期模块；完整旧内容保留在同源公告网页中。
export function buildAnnouncePage(announcement = {}, requestedPage = 1) {
  const updates = Array.isArray(announcement.updates) ? announcement.updates : [];
  const configured = Number.parseInt(announcement.currentUpdateCount, 10);
  const updateCount = Number.isFinite(configured)
    ? Math.min(updates.length, Math.max(0, configured)) : updates.length;
  const totalPages = Math.max(1, Math.ceil(updateCount / ANNOUNCE_PAGE_SIZE));
  const requested = Number.parseInt(requestedPage, 10);
  const page = Math.min(totalPages, Math.max(1, Number.isFinite(requested) ? requested : 1));
  const start = (page - 1) * ANNOUNCE_PAGE_SIZE;
  const current = updates.slice(start, Math.min(start + ANNOUNCE_PAGE_SIZE, updateCount));
  const presentation = buildAnnouncePresentation(current, current.length, ANNOUNCE_PAGE_SIZE);
  for (const group of presentation.groups) {
    for (const item of group.modules) item.no = String(start + Number(item.no)).padStart(2, '0');
  }
  return {
    version: announcement.version || '诸天修仙',
    date: announcement.date || '',
    edition: announcement.edition || '版本更新公告',
    intro: announcement.intro || '本期玩法与体验调整，分章阅读。',
    updateGroups: presentation.groups,
    updateCount,
    page,
    totalPages,
    pageStart: updateCount ? start + 1 : 0,
    pageEnd: start + current.length,
    hasMore: page < totalPages,
  };
}

function splitPointSignals(text) {
  const pattern = /(#[^\s，。；：]+|\d+(?:\.\d+)?\s*(?:万|亿|%|小时|点|枚|个|条)?(?:\s*→\s*\d+(?:\.\d+)?\s*%)?)/g;
  const segments = [];
  let cursor = 0;
  for (const match of String(text).matchAll(pattern)) {
    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index), signal: false });
    segments.push({ text: match[0], signal: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), signal: false });
  return segments;
}

// overview 模块渲染上限：防止本期更新堆积过多时，整张公告图高度超出截图引擎上限
// （实测 90 个模块会渲染出 34000px+ 的长图，puppeteer 直接报 unusable image 失败）
export const ANNOUNCE_OVERVIEW_MODULE_LIMIT = 16;

export function buildAnnouncePresentation(
  updates = [],
  configuredCount = updates.length,
  displayLimit = ANNOUNCE_OVERVIEW_MODULE_LIMIT
) {
  const parsedCount = Number.parseInt(configuredCount, 10);
  const configured = Number.isFinite(parsedCount)
    ? Math.min(updates.length, Math.max(0, parsedCount))
    : updates.length;
  // 实际渲染进 overview 的模块数：既受"本期配置数"约束，也不超过渲染上限
  const count = Math.min(configured, Math.max(0, displayLimit));
  const groups = [];

  updates.slice(0, count).forEach((update, index) => {
    let group = groups.find(item => item.label === update.tag);
    if (!group) {
      group = {
        label: update.tag || '其他',
        description: GROUP_DESCRIPTIONS[update.tag] || '本期相关改动集中整理。',
        modules: [],
      };
      groups.push(group);
    }
    group.modules.push({
      ...update,
      points: (update.points || []).map(text => ({ text, segments: splitPointSignals(text) })),
      no: String(index + 1).padStart(2, '0'),
      featured: index === 0,
    });
  });

  const stats = groups.map(group => ({
    value: group.label === '修复'
      ? group.modules.reduce((sum, update) => sum + (update.points || []).length, 0)
      : group.modules.length,
    label: group.label === '新玩法'
      ? '个新玩法模块'
      : group.label === '调整'
        ? '轮经济与稀有度调整'
        : group.label === '修复'
          ? '类问题集中修复'
          : `项${group.label}内容`,
  }));

  return { count, groups, stats };
}

export function splitAnnounceDetail(detail = '') {
  const markers = [...String(detail).matchAll(/【([^】]+)】/g)];
  if (!markers.length) return detail ? [{ title: '更新说明', text: detail }] : [];
  return markers.map((marker, index) => ({
    title: marker[1],
    text: detail
      .slice(marker.index + marker[0].length, markers[index + 1]?.index ?? detail.length)
      .replace(/^[\s；;：:]+|[\s；;]+$/g, ''),
  })).filter(item => item.text);
}
