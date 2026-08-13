const PAGE_SIZE = 12;

const TEMPLATE_ALIASES = new Map([
  ['1', 'a'],
  ['a', 'a'],
  ['甲', 'a'],
  ['2', 'b'],
  ['b', 'b'],
  ['乙', 'b'],
  ['3', 'c'],
  ['c', 'c'],
  ['丙', 'c'],
]);

function cleanToken(value) {
  return String(value || '').trim().replace(/[：:＝=]/g, ' ').replace(/\s+/g, ' ');
}

function toPage(value) {
  const page = Number.parseInt(value, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function formatPercent(value) {
  const number = Number(value);
  return `${Number.isFinite(number) ? (number * 100).toFixed(0) : '0'}%`;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getQualityTier(linggen) {
  const efficiency = Math.max(0, toNumber(linggen?.eff));
  const orbMultiplier = Math.max(0, toNumber(linggen?.法球倍率));
  const allAttributeBonus = ['攻击', '防御', '生命'].reduce(
    (total, key) => total + toNumber(linggen?.[key]),
    0,
  );
  const lifeSource = Math.max(0, toNumber(linggen?.生命本源));

  // 高倍率跨度很大，用对数压缩避免单项倍率吞掉攻防生命等综合属性。
  const qualityScore = Math.log1p(efficiency) * 1.4
    + Math.log1p(orbMultiplier) * 1.1
    + Math.log1p(Math.max(0, allAttributeBonus)) * 1.8
    + Math.log1p(lifeSource / 100) * 0.8;
  const tiers = [
    [20, 'quality-rainbow', '七彩'],
    [15, 'quality-red', '绯红'],
    [10, 'quality-orange', '橙耀'],
    [6, 'quality-gold', '金辉'],
    [3, 'quality-purple', '紫极'],
    [1.2, 'quality-blue', '苍蓝'],
    [0.3, 'quality-green', '灵青'],
    [0, 'quality-white', '凡白'],
  ];
  const [, qualityClass, qualityLabel] = tiers.find(([minimum]) => qualityScore >= minimum);

  return {
    qualityScore: Number(qualityScore.toFixed(3)),
    qualityClass,
    qualityLabel,
  };
}

function parseTemplateToken(token) {
  const normalized = cleanToken(token)
    .replace(/^(?:模板|模版|风格|样式)/i, '')
    .toLowerCase();
  return TEMPLATE_ALIASES.get(normalized) || null;
}

export function parseLinggenAtlasCommand(command = '') {
  const rest = cleanToken(command).replace(/^#灵根图鉴\s*/i, '');
  const tokens = rest ? rest.split(' ') : [];
  let page = 1;
  let category = '';
  let template = 'a';
  const categoryParts = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (/^(?:第)?\d+页?$/.test(token)) {
      page = toPage(token.replace(/^第/, '').replace(/页$/, ''));
      continue;
    }

    const templateToken = parseTemplateToken(token);
    if (templateToken) {
      template = templateToken;
      continue;
    }

    if (/^(?:分类|类别|类型|type)$/i.test(token)) {
      for (const restToken of tokens.slice(index + 1)) {
        if (/^(?:第)?\d+页?$/.test(restToken)) {
          page = toPage(restToken.replace(/^第/, '').replace(/页$/, ''));
        } else {
          const restTemplate = parseTemplateToken(restToken);
          if (restTemplate) template = restTemplate;
          else categoryParts.push(restToken);
        }
      }
      break;
    }

    categoryParts.push(token);
  }

  category = categoryParts.join(' ').trim();
  if (/^(?:全部|所有|all)$/i.test(category)) category = '';
  return { page, category, template };
}

export function buildLinggenAtlasData(allLinggen = [], player = {}, options = {}) {
  const source = Array.isArray(allLinggen) ? allLinggen : [];
  const requestedCategory = cleanToken(options.category);
  const categories = [];
  const categorySet = new Set();

  const normalized = source.map((linggen, index) => {
    const groupName = cleanToken(linggen?.归类 || linggen?.type || '其他') || '其他';
    if (!categorySet.has(groupName)) {
      categorySet.add(groupName);
      categories.push(groupName);
    }

    const currentName = player?.灵根?.name;
    const isCurrent = Boolean(currentName && currentName === linggen?.name)
      || (!currentName && player?.灵根?.id != null && player.灵根.id === linggen?.id);

    const quality = getQualityTier(linggen);
    return {
      ...linggen,
      index: index + 1,
      groupName,
      typeLabel: cleanToken(linggen?.type || groupName),
      eff: formatPercent(linggen?.eff),
      法球倍率: formatPercent(linggen?.法球倍率),
      攻击加成: formatPercent(linggen?.攻击),
      防御加成: formatPercent(linggen?.防御),
      生命加成: formatPercent(linggen?.生命),
      生命本源: toNumber(linggen?.生命本源),
      isCurrent,
      ...quality,
    };
  });

  const filtered = requestedCategory
    ? normalized.filter(item => item.groupName === requestedCategory || item.typeLabel === requestedCategory)
    : normalized;
  const pageSize = Math.max(1, Number.parseInt(options.pageSize, 10) || PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(toPage(options.page), totalPages);
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  const groups = [];
  const groupsByName = new Map();

  for (const item of pageItems) {
    if (!groupsByName.has(item.groupName)) {
      const group = { groupName: item.groupName, linggens: [] };
      groupsByName.set(item.groupName, group);
      groups.push(group);
    }
    groupsByName.get(item.groupName).linggens.push(item);
  }

  return {
    title: '灵根图鉴',
    current: player?.灵根?.name || '未觉醒',
    currentType: player?.灵根?.type || '待觉醒',
    totalLinggens: normalized.length,
    visibleCount: filtered.length,
    pageSize,
    page,
    totalPages,
    category: requestedCategory || '全部灵根',
    categoryKey: requestedCategory,
    categories,
    groups,
    entries: pageItems,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
    empty: filtered.length === 0,
    emptyMessage: requestedCategory ? `未找到“${requestedCategory}”分类的灵根` : '灵根库暂为空',
    template: TEMPLATE_ALIASES.get(String(options.template || '').toLowerCase()) || options.template || 'a',
  };
}

export { PAGE_SIZE };
