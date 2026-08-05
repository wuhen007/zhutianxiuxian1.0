export const TIANJI_COSTS = Object.freeze({
  功法溯源: { 修为: 20_000_000, 血气: 20_000_000 },
  天骄位置: { 修为: 20_000_000, 血气: 20_000_000 },
});

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
  const match = text.match(/^#(?:打听天机|推演天机)\s+(.+)$/);
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
  return {
    type: "gongfa",
    keyword: tokens[0],
    cost: parseTianjiCost(tokens[1] || ""),
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

export function searchPlayerGongfa(readPlayer, files, gongfa) {
  const results = [];
  for (const file of files) {
    const qq = file.replace(/\.json$/i, "");
    const playerData = readPlayer(qq);
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

export function formatTianjiSearchResult({ type, target, results }) {
  if (type === "tianjiao") {
    return [
      "【天机推演·天骄位置】",
      `天机锁定：${target.name}`,
      target.known ? `当前踪迹：${target.trace}` : "仍未寻得可靠踪迹。",
    ].join("\n");
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
