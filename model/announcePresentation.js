const GROUP_DESCRIPTIONS = {
  新玩法: '从修炼路线到诸天奇遇，本期新增内容都归在这里。',
  调整: '价格、稀有度与养成规则统一重算，涉及交易和成长成本。',
  修复: '把会影响结算、成长和日常操作的问题集中收口。',
};

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

export function buildAnnouncePresentation(updates = [], configuredCount = updates.length) {
  const parsedCount = Number.parseInt(configuredCount, 10);
  const count = Number.isFinite(parsedCount)
    ? Math.min(updates.length, Math.max(0, parsedCount))
    : updates.length;
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
