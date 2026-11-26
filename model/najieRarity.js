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

/** 丹药/道具效果字段白名单：旧存档条目缺少这些字段时，从数据表补全以便渲染效果文本。 */
const DISPLAY_EFFECT_FIELDS = ['道心', 'yuanshen', 'heart', 'heartMax'];

function mergeDisplayEffectFields(item, source) {
  const merged = { ...item };
  for (const field of DISPLAY_EFFECT_FIELDS) {
    if (merged[field] == null && source?.[field] != null) {
      merged[field] = source[field];
    }
  }
  return merged;
}

export async function enrichNajieDisplayRarity(najie, resolveItem) {
  const displayNajie = { ...najie };

  await Promise.all(NAJIE_ITEM_CLASSES.map(async itemClass => {
    displayNajie[itemClass] = await Promise.all((najie[itemClass] || []).map(async item => {
      const source = item?.name ? await resolveItem(item.name) : null;
      let enriched = mergeDisplayEffectFields(item, source);
      if (!validRarity(enriched?.稀有度)) {
        enriched = { ...enriched, 稀有度: validRarity(source?.稀有度) || 1 };
      }
      return enriched;
    }));
  }));

  return displayNajie;
}
