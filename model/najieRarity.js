const NAJIE_ITEM_CLASSES = [
  '装备',
  '丹药',
  '道具',
  '功法',
  '草药',
  '材料',
  '食材',
  '盒子',
  '宝石',
  '仙宠',
  '仙宠口粮',
];

function validRarity(value) {
  const rarity = Number(value);
  return Number.isInteger(rarity) && rarity >= 1 && rarity <= 10 ? rarity : null;
}

export async function enrichNajieDisplayRarity(najie, resolveItem) {
  const displayNajie = { ...najie };

  await Promise.all(NAJIE_ITEM_CLASSES.map(async itemClass => {
    displayNajie[itemClass] = await Promise.all((najie[itemClass] || []).map(async item => {
      if (validRarity(item?.稀有度)) return item;
      const source = item?.name ? await resolveItem(item.name) : null;
      return { ...item, 稀有度: validRarity(source?.稀有度) || 1 };
    }));
  }));

  return displayNajie;
}
