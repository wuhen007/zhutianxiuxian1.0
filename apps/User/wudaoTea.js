export const WUDAO_TEA_ITEM = '悟道古茶叶';
export const WUDAO_TEA_ITEMS = [WUDAO_TEA_ITEM, '悟道茶叶', '悟道古茶树'];

export function isWudaoTeaItem(itemName) {
  return WUDAO_TEA_ITEMS.includes(itemName);
}

export async function findWudaoTeaItem(hasItem) {
  for (const itemName of WUDAO_TEA_ITEMS) {
    if (await hasItem(itemName)) return itemName;
  }
  return '';
}
