const NAJIE_CATEGORIES = [
  "装备",
  "丹药",
  "道具",
  "功法",
  "草药",
  "材料",
  "食材",
  "盒子",
  "仙宠",
  "仙宠口粮",
  "宝石",
];

const INDEPENDENT_ITEM_CATEGORIES = new Set(["装备", "仙宠", "宝石"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function prepareIndependentDropItem(item, extra = {}) {
  return {
    ...clone(item),
    ...clone(extra),
    数量: 1,
    islockd: 0,
  };
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function itemQuantity(item) {
  return toFiniteNumber(item?.数量, 1);
}

function mergeStackableItems(currentItems, droppedItems) {
  const merged = clone(currentItems);

  for (const droppedItem of droppedItems) {
    if (!droppedItem || typeof droppedItem !== "object") continue;

    const quantity = itemQuantity(droppedItem);
    if (quantity <= 0) continue;

    const existingItem = merged.find(
      (item) => item && item.name === droppedItem.name
    );

    if (existingItem) {
      existingItem.数量 = itemQuantity(existingItem) + quantity;
    } else {
      merged.push({ ...clone(droppedItem), 数量: quantity });
    }
  }

  return merged;
}

/**
 * 将外部奖励内容合并进玩家现有纳戒，不改变双方传入对象。
 * 装备、仙宠、宝石可能带有独立养成属性，因此保留为独立条目。
 */
export function mergeNajieContents(currentNajie = {}, droppedNajie = {}) {
  const merged = clone(currentNajie || {});

  merged.灵石 =
    toFiniteNumber(currentNajie?.灵石) + toFiniteNumber(droppedNajie?.灵石);
  merged.源石 =
    toFiniteNumber(currentNajie?.源石) + toFiniteNumber(droppedNajie?.源石);

  for (const category of NAJIE_CATEGORIES) {
    const currentItems = Array.isArray(currentNajie?.[category])
      ? currentNajie[category]
      : [];
    const droppedItems = Array.isArray(droppedNajie?.[category])
      ? droppedNajie[category]
      : [];

    if (INDEPENDENT_ITEM_CATEGORIES.has(category)) {
      merged[category] = [...clone(currentItems), ...clone(droppedItems)];
    } else {
      merged[category] = mergeStackableItems(currentItems, droppedItems);
    }
  }

  return merged;
}

export { NAJIE_CATEGORIES };
