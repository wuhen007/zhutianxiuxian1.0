export const TRADE_LIMITS = Object.freeze({
  maxLines: 4,
  maxItemAmount: 20,
  maxLingshi: 100_000_000,
  maxSourceStone: 1_000_000,
  ttlMs: 30 * 60 * 1000,
});

const FORBIDDEN_ASSET = /圣法碎片|圣法残片|至宝|帝兵|天帝兵|仙帝兵/i;
const SAFE_NAME = /[\u0000-\u001f\u007f]/g;

export function cleanTradeLabel(value, max = 60) {
  return String(value || '')
    .replace(SAFE_NAME, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function isForbiddenTradeAsset(asset = {}) {
  return FORBIDDEN_ASSET.test(
    `${cleanTradeLabel(asset.name)} ${cleanTradeLabel(asset.type)}`
  );
}

function positiveInteger(value) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
}

export function normalizeTradeAsset(asset = {}) {
  const kind = asset.kind === 'currency' ? 'currency' : 'item';
  const amount = positiveInteger(asset.amount);
  const name = cleanTradeLabel(asset.name, 50);
  const type = cleanTradeLabel(asset.type, 30);
  if (!amount || !name || isForbiddenTradeAsset({ name, type })) return null;

  if (kind === 'currency') {
    if (!['灵石', '源石'].includes(name)) return null;
    const max = name === '灵石' ? TRADE_LIMITS.maxLingshi : TRADE_LIMITS.maxSourceStone;
    if (amount > max) return null;
    return { kind, name, amount };
  }

  if (!type || amount > TRADE_LIMITS.maxItemAmount) return null;
  return { kind, name, type, amount };
}

export function validateTradeBundle(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > TRADE_LIMITS.maxLines) {
    return { ok: false, reason: 'invalid_bundle' };
  }
  const items = value.map(normalizeTradeAsset);
  if (items.some((item) => !item)) return { ok: false, reason: 'forbidden_or_invalid_asset' };
  const seen = new Set();
  for (const item of items) {
    const key = `${item.kind}:${item.type || ''}:${item.name}`;
    if (seen.has(key)) return { ok: false, reason: 'duplicate_asset' };
    seen.add(key);
  }
  return { ok: true, items };
}

export function validateTradeOffer(give, want) {
  const giveResult = validateTradeBundle(give);
  if (!giveResult.ok) return giveResult;
  const wantResult = validateTradeBundle(want);
  if (!wantResult.ok) return wantResult;
  return { ok: true, give: giveResult.items, want: wantResult.items };
}

function parseTradeAmount(value) {
  const match = String(value || '').trim().match(/(?:x|×)?\s*(\d[\d_]*)$/i);
  const amount = Number(match?.[1]?.replace(/_/g, ''));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
}

// 格式：灵石|100000；物品|道具|九转金丹|1；多项用逗号分隔。
export function parseTradeBundle(value) {
  const parts = String(value || '')
    .split(/[，,；;]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const result = [];
  for (const part of parts) {
    const fields = part.split(/[|/：:]/).map((field) => field.trim());
    if (fields[0] === '灵石' || fields[0] === '源石') {
      result.push({ kind: 'currency', name: fields[0], amount: parseTradeAmount(fields[1]) });
      continue;
    }
    if (fields[0] === '物品' || fields[0] === '道具') {
      result.push({
        kind: 'item',
        type: fields[1],
        name: fields[2],
        amount: parseTradeAmount(fields[3]),
      });
      continue;
    }
    return { ok: false, reason: '格式应为 灵石|数量 或 物品|类型|名称|数量' };
  }
  const validation = validateTradeBundle(result);
  return validation.ok
    ? { ok: true, items: validation.items }
    : { ok: false, reason: validation.reason };
}

export function tradePolicyAllows(policy, peerServerId) {
  if (!policy?.enabled) return false;
  const allow = Array.isArray(policy.allow_servers) ? policy.allow_servers : [];
  const deny = Array.isArray(policy.deny_servers) ? policy.deny_servers : [];
  if (deny.includes(String(peerServerId))) return false;
  return allow.includes('*') || allow.includes(String(peerServerId));
}

export function publicTradeView(trade) {
  if (!trade) return null;
  return {
    code: trade.code,
    status: trade.status,
    seller_server_id: trade.seller_server_id,
    seller_name: trade.seller_name,
    target_server_id: trade.target_server_id,
    target_name: trade.target_name,
    give: trade.give,
    want: trade.want,
    created_at: trade.created_at,
    expires_at: trade.expires_at,
    buyer_name: trade.buyer_name || '',
  };
}
