import { isDeepStrictEqual } from 'node:util';

const CATEGORIES = ['装备', '丹药', '道具', '功法', '草药', '材料', '食材', '仙宠', '仙宠口粮', '盒子', '宝石'];
const QUALITIES = ['劣', '普', '优', '精', '极', '绝', '顶'];
export const DISCARD_USAGE = '用法：#丢弃物品名*数量（省略数量默认丢弃1件）\n有品级或多个同名物品时会列出选项，回复 序号*数量，或先回复序号再回复数量。\n丢弃直接生效，无需二次确认；穿戴中的装备请先更换回纳戒。';

function validateQuantity(quantity) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('丢弃数量须为正整数。');
}

function stockQuantity(item) {
  const quantity = Number(item?.数量);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error(`【${item?.name || '物品'}】存档数量异常，请重新查看纳戒。`);
  }
  return quantity;
}

function sameVariant(left, right) {
  const comparable = ({ 数量, islockd, 锁定, ...item }) => item;
  return isDeepStrictEqual(comparable(left), comparable(right));
}

function qualities(item) {
  return [item.pinji, item.品级, item.品阶].filter(value => value !== undefined && value !== null && value !== '');
}

export function planItemDiscard(najie, input) {
  const parts = typeof input === 'string' ? input.trim().split('*').map(part => part.trim()) : [];
  const name = parts[0];
  if (!name || parts.length > 2 || (parts.length === 2 && !/^\d+$/.test(parts[1]))) {
    throw new Error(DISCARD_USAGE + '\n丢弃数量须为正整数。');
  }
  const quantity = parts.length === 2 ? Number(parts[1]) : 1;
  validateQuantity(quantity);

  const choices = [];
  for (const category of CATEGORIES) {
    if (!Array.isArray(najie?.[category])) continue;
    for (const [index, item] of najie[category].entries()) {
      if (item?.name !== name) continue;
      const available = stockQuantity(item);
      let choice = choices.find(candidate => candidate.category === category && sameVariant(candidate.item, item));
      if (!choice) {
        choice = { category, item: structuredClone(item), entries: [], quantity: 0 };
        choices.push(choice);
      }
      choice.entries.push({ index, item: structuredClone(item) });
      choice.quantity += available;
      if (!Number.isSafeInteger(choice.quantity)) throw new Error(`【${name}】存档数量异常，请重新查看纳戒。`);
    }
  }
  if (!choices.length) throw new Error(`纳戒中没有【${name}】，请核对物品名称；穿戴中的装备请先更换回纳戒。`);

  const needsSelection = choices.length > 1 || choices.some(choice => qualities(choice.item).length > 0);
  if (!needsSelection && quantity > choices[0].quantity) throw new Error(`【${name}】数量不足，当前有${choices[0].quantity}件。`);
  return { name, quantity, choices, needsSelection };
}

export function formatDiscardChoice(choice, index) {
  const qualityNames = qualities(choice.item).map(value => {
    const quality = QUALITIES[value] ?? String(value);
    return QUALITIES.includes(quality) ? `${quality}品` : quality;
  });
  const quality = qualityNames.length ? `【${[...new Set(qualityNames)].join(' / ')}】` : '';
  const codes = choice.category === '装备' ? `，代号${choice.entries.map(entry => entry.index + 101).join('/')}` : '';
  return `${index}. ${choice.item.name}${quality}×${choice.quantity}（${choice.category}${codes}）`;
}

export function applyItemDiscard(najie, choice, quantity = 1) {
  validateQuantity(quantity);
  if (!CATEGORIES.includes(choice?.category) || !choice.item || !Array.isArray(choice.entries) || !choice.entries.length) {
    throw new Error('丢弃记录已失效，请重新发起。');
  }
  const items = najie?.[choice.category];
  if (!Array.isArray(items)) throw new Error('纳戒内容已经变化，请重新发起丢弃。');

  let previousIndex = -1;
  let available = 0;
  for (const entry of choice.entries) {
    if (!Number.isSafeInteger(entry?.index) || entry.index <= previousIndex || !entry.item ||
        !sameVariant(choice.item, entry.item) || !isDeepStrictEqual(items[entry.index], entry.item)) {
      throw new Error('待丢弃物品已经变化，本次操作已取消，请重新查看纳戒后发起。');
    }
    available += stockQuantity(items[entry.index]);
    previousIndex = entry.index;
  }
  if (!isDeepStrictEqual(choice.item, choice.entries[0].item) ||
      !Number.isSafeInteger(available) || available !== choice.quantity) {
    throw new Error('丢弃记录已失效，请重新发起。');
  }
  if (quantity > available) throw new Error(`【${choice.item.name}】数量不足，当前有${available}件。`);

  let remaining = quantity;
  const removed = [];
  for (const { index } of choice.entries) {
    const amount = Math.min(Number(items[index].数量), remaining);
    const rest = Number(items[index].数量) - amount;
    if (rest === 0) removed.push(index);
    else items[index].数量 = rest;
    remaining -= amount;
    if (remaining === 0) break;
  }
  for (const index of removed.reverse()) items.splice(index, 1);
  return { name: choice.item.name, quantity };
}
