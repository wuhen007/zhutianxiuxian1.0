export function normalizeSellableEquipmentQuality(najie) {
  let changed = false;
  for (const item of Array.isArray(najie?.装备) ? najie.装备 : []) {
    if (!item || item.islockd != 0 || (item.type === '帝兵' && item.author_name)) continue;
    if (item.pinji === undefined || item.pinji === null) {
      item.pinji = 0;
      changed = true;
    }
  }
  return changed;
}
