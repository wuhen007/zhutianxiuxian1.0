export const TIANJI_COSTS = Object.freeze({
  功法溯源: { 修为: 20_000_000, 血气: 20_000_000 },
  天骄位置: { 修为: 20_000_000, 血气: 20_000_000 },
});

import fs from 'node:fs/promises';
import path from 'node:path';
import { getSuiyunStage } from './suiyun.js';
import { getSuiyunTimeline } from './suiyunRegistry.js';

const NUMERALS = Object.freeze({
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  百: 100,
  千: 1000,
  万: 10000,
  亿: 100000000,
});

export function parseTianjiCost(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const normalized = text.replace(/[，,]/g, "").replace(/^两/, "二");
  const digit = /^[0-9]+$/.test(normalized)
    ? Number(normalized)
    : parseMixedUnitNumber(normalized);
  return Number.isFinite(digit) && digit >= 0 ? digit : null;
}

function parseMixedUnitNumber(text) {
  const match = text.match(/^(\d+)([万亿])$/);
  if (!match) return parseChineseNumber(text);
  return Number(match[1]) * NUMERALS[match[2]];
}

function parseChineseNumber(text) {
  let total = 0;
  let section = 0;
  let current = 0;
  for (const char of text) {
    const value = NUMERALS[char];
    if (value === undefined) return Number.NaN;
    if (value >= 10000) {
      section = (section || current || 1) * value;
      total += section;
      section = 0;
      current = 0;
    } else if (value >= 10) {
      section += (current || 1) * value;
      current = 0;
    } else {
      current = value;
    }
  }
  return total + section + current;
}

export function parseTianjiCommand(message) {
  const text = String(message ?? "").trim();
  const match = text.match(/^#(?:打听天机|推演天机)\s*(.+)$/);
  if (!match) return null;
  const rest = match[1].trim();
  const locationMatch = rest.match(/^位置\s+(.+)$/);
  if (locationMatch) {
    const name = locationMatch[1].replace(/\s*(灵石|源石)\s*$/i, "").trim();
    return {
      type: "tianjiao",
      name,
      cost: parseTianjiCost(locationMatch[1].match(/(灵石|源石)/i)?.[0] || ""),
    };
  }
  const positionMatch = rest.match(/^(.+?)位置(?:\s+(灵石|源石))?$/);
  if (positionMatch) {
    return {
      type: "tianjiao",
      name: positionMatch[1].trim(),
      cost: parseTianjiCost(positionMatch[2] || ""),
    };
  }
  const tokens = rest.split(/\s+/);
  const cost = tokens.length > 1 ? parseTianjiCost(tokens.at(-1)) : null;
  if (cost !== null) tokens.pop();
  return {
    type: "possession",
    keyword: tokens.join(' '),
    cost,
  };
}

export function requestNameFrom(message) {
  const parsed = parseTianjiCommand(message);
  return parsed?.type === 'tianjiao' ? parsed.name : '';
}

export function findTianjiaoByName(list, name) {
  const target = String(name ?? "").trim();
  if (!target) return null;
  return (list || []).find((item) => item?.名号 === target) || null;
}

export async function searchPlayerGongfa(readPlayer, files, gongfa) {
  const results = [];
  for (const file of files) {
    const qq = file.replace(/\.json$/i, "");
    const playerData = await readPlayer(qq);
    if (
      Array.isArray(playerData?.学习的功法) &&
      playerData.学习的功法.includes(gongfa)
    ) {
      results.push({
        qq,
        name: playerData.名号 || "未知修士",
        realm: Number(playerData.mijinglevel_id) || 0,
      });
    }
  }
  return results;
}

export function isTianjiAdmin(e, masters = [], playerId = '') {
  const ids = [String(e.user_id).replace(/^qg_/, ''), String(playerId)];
  return Boolean(e.isMaster || e?.member?.is_owner || masters.map(String).some(id => ids.includes(id)));
}

export function isSuiyunInheritanceQuery(keyword) {
  return ['岁云传承', '岁云一脉'].includes(keyword);
}

// Only inspect owned slots, not descriptions, reward receipts or historical records.
export function findPlayerPossessions({ player = {}, najie = {}, equipment = {} }, keyword) {
  const entries = [];
  const add = (container, key, kind, category, location) => {
    const value = container?.[key];
    const name = typeof value === 'string' ? value : value?.name;
    if (!name || (value?.数量 != null && !(Number(value.数量) > 0))) return;
    entries.push({ container, key, kind, category, location, name,
      quantity: Number(value?.数量) || 1, slot: value?.type });
  };
  add(player, '灵根', 'root', '灵根', '当前灵根');
  add(player, '隐藏灵根', 'root', '灵根', '隐藏灵根');
  add(player.诸天镜系统, '本源灵根', 'root', '灵根', '诸天镜本源灵根');
  for (const avatar of player.诸天化身谱 || []) {
    add(avatar, 'root', 'root', '灵根', `化身·${avatar.name}`);
  }
  for (const index of Object.keys(player.学习的功法 || [])) {
    add(player.学习的功法, index, 'skill', '功法', '已学功法');
  }
  add(player, '仙宠', 'item', '仙宠', '出战仙宠');
  for (const key of ['当前先天至宝', '当前大道至宝']) {
    add(player, key, 'item', '装备', key);
  }
  const visit = (container, category, location) => {
    for (const [key, value] of Object.entries(container || {})) {
      if (!value || typeof value !== 'object') continue;
      if (value.name) add(container, key, 'item', value.class || category, `${location}·${key}`);
      else visit(value, category, `${location}·${key}`);
    }
  };
  visit(equipment, '装备', '已装备');
  for (const [category, items] of Object.entries(najie)) {
    if (Array.isArray(items)) visit(items, category, `纳戒·${category}`);
  }
  visit(player.无尽至宝列表, '无尽至宝', '无尽至宝');
  const suiyun = isSuiyunInheritanceQuery(keyword);
  const matches = entries.filter(entry => suiyun
    ? entry.kind === 'root' && getSuiyunStage({ 灵根: entry.container[entry.key] }) > 0
    : entry.name === keyword);
  if (suiyun && player.岁云?.已觉醒) {
    matches.push({ kind: 'suiyun', category: '灵根', location: '岁云觉醒记录', name: '岁云传承', quantity: 1 });
  }
  return matches;
}

export async function readTianjiState(qq, paths) {
  const read = async (directory, optional) => {
    try { return JSON.parse(await fs.readFile(path.join(directory, `${qq}.json`), 'utf8')); }
    catch (error) { if (optional && error.code === 'ENOENT') return {}; throw error; }
  };
  const [player, najie, equipment] = await Promise.all([
    read(paths.player_path), read(paths.najie_path, true), read(paths.equipment_path, true),
  ]);
  return { player, najie, equipment };
}

export async function searchPlayerPossessions(readState, files, keyword, { timeline } = {}) {
  const results = [];
  results.errors = [];
  results.totalChecked = 0;
  for (const file of files) {
    const qq = file.replace(/\.json$/i, '');
    try {
      const state = await readState(qq);
      const line = getSuiyunTimeline(state.player);
      if (timeline != null && line !== String(timeline)) continue;
      results.totalChecked++;
      const matches = findPlayerPossessions(state, keyword);
      if (!matches.length) continue;
      results.push({ qq, name: state.player.名号 || '未知修士', timeline: line,
        realm: Number(state.player.mijinglevel_id) || 0,
        matches: matches.map(({ kind, category, location, name, quantity, slot }) => ({ kind, category, location, name, quantity, slot })) });
    } catch (error) {
      results.errors.push({ qq, message: error.message });
    }
  }
  return results;
}

export function formatTianjiSearchResult({ type, target, results }) {
  if (type === "tianjiao") {
    return [
      "【天机推演·天骄位置】",
      `天机锁定：${target.name}`,
      target.known ? `当前踪迹：${target.trace}` : "仍未寻得可靠踪迹。",
    ].join("\n");
  }
  if (type === 'possession') {
    return [
      '【天机推演·持有溯源】',
      `查找【${target}】：检查${results.totalChecked}名修士，命中${results.length}人。`,
      ...results.map((player, index) =>
        `${index + 1}. ${player.name}（ID：${player.qq}｜时间线：${player.timeline}）\n` +
        player.matches.map(item => `  ${item.location}：【${item.name}】×${item.quantity}`).join('\n')),
      results.errors.length ? `另有${results.errors.length}份存档读取异常：${results.errors.map(item => item.qq).join('、')}` : '',
    ].filter(Boolean).join('\n');
  }
  if (!results || results.length === 0) {
    return [
      "【天机推演·功法溯源】",
      `经过推演诸天万界，并无修士修炼【${target}】此功法。`,
    ].join("\n");
  }
  return [
    "【天机推演·功法溯源】",
    `经过推演诸天万界，发现【${target}】的修炼者信息：`,
    "",
    `共计发现 ${results.length} 名修士修炼此功法：`,
    "",
    ...results.slice(0, 10).map(
      (player, index) =>
        `${index + 1}. ${player.name} (ID: ${player.qq}) - 境界: ${player.realm}`
    ),
    results.length > 10
      ? `...还有 ${results.length - 10} 名修士的信息被天机所遮蔽`
      : "",
    "",
    `推演完成！共检查了 ${results.totalChecked || results.length} 名修士的修行记录。`,
  ]
    .filter(Boolean)
    .join("\n");
}
