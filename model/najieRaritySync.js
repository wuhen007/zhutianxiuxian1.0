export function buildUniqueItemRarityMap(itemLists = []) {
  const candidates = new Map();
  for (const list of itemLists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const rarity = Number(item?.稀有度);
      if (!item?.name || !Number.isFinite(rarity)) continue;
      if (!candidates.has(item.name)) candidates.set(item.name, new Set());
      candidates.get(item.name).add(rarity);
    }
  }
  return new Map([...candidates]
    .filter(([, rarities]) => rarities.size === 1)
    .map(([name, rarities]) => [name, [...rarities][0]]));
}
