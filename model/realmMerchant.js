const ELEMENTS = ['金', '木', '土', '水', '火'];

export const WHITE_BEARD_MIN_PRICE = 100_000_000_000;
export const WHITE_BEARD_MAX_PRICE = 999_900_000_000;
export const WHITE_BEARD_MIN_POWER = 450;
export const BLACK_MARKET_MAX_PRICE = 3_000_000_000;

const BLACK_MEDICINE_NAMES = [
  '一级进化液', '二级进化液', '三级进化液',
  '圣品战魂丹', '圣品霸血丹', '九曜天星丹',
  '煌天造化丹', '神域造化丹', '鸿蒙道源丹',
  '梦蝶仙酿', '纪元道果', '九转天药', '万仙无极天药',
  '真龙不死药', '九妙不死药', '蟠桃神药',
];

const BLACK_UTILITY_PRICES = {
  道法仙术一日卡: 300_000_000,
  位面传送阵: 500_000_000,
  大位面传送阵: 1_800_000_000,
  星图: 800_000_000,
  界隙锚符: 1_200_000_000,
  欺天石: 25_000_000,
};

const BLACK_POTENTIAL_PRICES = {
  叩仙丹: 600_000_000,
  问道丹: 1_200_000_000,
  化仙丹: 2_400_000_000,
};

const BLACK_FORBIDDEN_PRICES = {
  轮回命签: 2_500_000_000,
  命宫拓碑: BLACK_MARKET_MAX_PRICE,
};

const SUFFIX_BLUEPRINTS = [
  { kind: 'five', coefficient: 1.2, priceMultiplier: 1 },
  { kind: 'four', coefficient: 1.17, priceMultiplier: 1.02 },
  { kind: 'three', coefficient: 1.15, priceMultiplier: 1.04 },
  { kind: 'pure', coefficient: 1.25, priceMultiplier: 1.06 },
  { kind: 'destroy', coefficient: 1.6, defensePenalty: 0.5, priceMultiplier: 1.1 },
  { kind: 'generate', coefficient: 1.4, priceMultiplier: 1.09 },
  { kind: 'support', coefficient: 1.3, priceMultiplier: 1.07 },
  { kind: 'ultimate', coefficient: 1.3, priceMultiplier: 1.15 },
];

function randomIndex(length, random) {
  return Math.min(length - 1, Math.floor(random() * length));
}

function pick(items, random) {
  return items[randomIndex(items.length, random)];
}

function shuffle(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, random);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function roundStat(value) {
  return Math.floor(value * 1000) / 1000;
}

function activeElements(material) {
  return ELEMENTS.filter(element => number(material[element]) > 0);
}

function addRecipeMaterial(recipe, material, count) {
  const existing = recipe.find(item => item.material.name === material.name);
  if (existing) existing.count += count;
  else recipe.push({ material, count });
}

function getSuffixPlan(blueprint, random) {
  if (blueprint.kind === 'ultimate') return { ...blueprint, suffix: '终极至宝', elements: [] };
  if (blueprint.kind === 'five') return { ...blueprint, suffix: '五行杂灵', elements: [...ELEMENTS] };
  if (blueprint.kind === 'four') {
    return { ...blueprint, suffix: '四圣显化', elements: shuffle(ELEMENTS, random).slice(0, 4) };
  }
  if (blueprint.kind === 'three') {
    return { ...blueprint, suffix: '三灵共堂', elements: shuffle(ELEMENTS, random).slice(0, 3) };
  }
  if (blueprint.kind === 'pure') {
    const main = pick(ELEMENTS, random);
    return { ...blueprint, suffix: `纯${main}`, elements: [main], main };
  }

  const firstIndex = randomIndex(ELEMENTS.length, random);
  const distance = blueprint.kind === 'destroy' ? 1 : 2;
  const elements = [ELEMENTS[firstIndex], ELEMENTS[(firstIndex + distance) % ELEMENTS.length]];
  const ordered = [...elements].sort((a, b) => ELEMENTS.indexOf(a) - ELEMENTS.indexOf(b));
  const main = blueprint.kind === 'support' ? ordered[1] : ordered[0];
  const prefix = blueprint.kind === 'destroy' ? '毁' : blueprint.kind === 'support' ? '供' : '神';
  const ending = blueprint.kind === 'destroy' ? '灭灵' : '相生';
  return { ...blueprint, suffix: `${prefix}${main}${ending}`, elements, main };
}

function getCoreMaterials(materials) {
  const universe = materials.find(item => item.name === '宇宙核心');
  const boundary = materials.find(item => item.name === '界核');
  if (!universe || !boundary) throw new Error('白须仙翁缺少宇宙核心或界核锻造材料');
  return { universe, boundary };
}

function createRecipe(type, suffixPlan, materials, random) {
  const recipe = [];
  const elementalMaterials = materials.filter(item => activeElements(item).length === 1);
  for (const element of suffixPlan.elements) {
    const candidates = elementalMaterials.filter(item => activeElements(item)[0] === element);
    if (!candidates.length) throw new Error(`白须仙翁缺少${element}属性锻造材料`);
    addRecipeMaterial(recipe, pick(candidates, random), 1 + randomIndex(3, random));
  }

  if (suffixPlan.main && suffixPlan.elements.length === 2) {
    const elementTotals = Object.fromEntries(ELEMENTS.map(element => [element, 0]));
    for (const { material, count } of recipe) {
      for (const element of ELEMENTS) elementTotals[element] += number(material[element]) * count;
    }
    const otherMax = Math.max(...suffixPlan.elements
      .filter(element => element !== suffixPlan.main)
      .map(element => elementTotals[element]));
    if (elementTotals[suffixPlan.main] <= otherMax) {
      const candidates = elementalMaterials.filter(item => activeElements(item)[0] === suffixPlan.main);
      const material = candidates.sort((a, b) => number(b[suffixPlan.main]) - number(a[suffixPlan.main]))[0];
      const needed = Math.floor((otherMax - elementTotals[suffixPlan.main]) / number(material[suffixPlan.main])) + 1;
      addRecipeMaterial(recipe, material, needed);
    }
  }

  const { universe, boundary } = getCoreMaterials(materials);
  const coreCount = 2 + randomIndex(29, random);
  if (type === '武器') addRecipeMaterial(recipe, universe, coreCount);
  else if (type === '护具') addRecipeMaterial(recipe, boundary, coreCount);
  else {
    addRecipeMaterial(recipe, universe, Math.ceil(coreCount / 2));
    addRecipeMaterial(recipe, boundary, Math.floor(coreCount / 2));
  }
  return recipe;
}

function calculateRecipe(recipe, suffixPlan) {
  const totals = recipe.reduce((result, { material, count }) => {
    result.atk += number(material.攻) * count;
    result.def += number(material.防) * count;
    result.HP += number(material.血) * count;
    result.bao += number(material.暴) * count;
    const unitPower = 100 * (
      number(material.攻) + number(material.防) + number(material.血) + 2 * number(material.暴)
    );
    const unitCost = Math.max(number(material.出售价) / 10000, unitPower ** 2 * 100000);
    result.materialCost += unitCost * count;
    return result;
  }, { atk: 0, def: 0, HP: 0, bao: 0, materialCost: 0 });

  const equipment = {
    atk: roundStat(totals.atk * suffixPlan.coefficient),
    def: roundStat(totals.def * (suffixPlan.coefficient - (suffixPlan.defensePenalty || 0))),
    HP: roundStat(totals.HP * suffixPlan.coefficient),
    bao: roundStat(totals.bao),
  };
  const power = Math.round(100 * (equipment.atk + equipment.def + equipment.HP + 2 * equipment.bao));
  return { equipment, power, materialCost: Math.ceil(totals.materialCost), rawTotal: totals.atk + totals.def + totals.HP };
}

export function calculateWhiteBeardPrice(power, materialCost, suffixMultiplier = 1) {
  const quote = (materialCost * 0.2 + 500000 * power ** 2) * 1.25 * suffixMultiplier;
  const softened = WHITE_BEARD_MAX_PRICE * quote / (WHITE_BEARD_MAX_PRICE + quote);
  const rounded = Math.ceil(softened / 10_000_000) * 10_000_000;
  return Math.min(WHITE_BEARD_MAX_PRICE, Math.max(WHITE_BEARD_MIN_PRICE, rounded));
}

function createStockItem(type, template, suffixPlan, materials, random, serial, id) {
  const recipe = createRecipe(type, suffixPlan, materials, random);
  const result = calculateRecipe(recipe, suffixPlan);
  if (result.power < WHITE_BEARD_MIN_POWER) {
    throw new Error(`白须仙翁生成了低于${WHITE_BEARD_MIN_POWER}%的装备`);
  }
  const displayName = `${template.name}·${suffixPlan.suffix}`;
  const dominant = suffixPlan.main || pick(ELEMENTS, random);
  const equipment = {
    ...template,
    ...result.equipment,
    id: ELEMENTS.indexOf(dominant) + 1,
    name: `${displayName}${serial}${id}`,
    pinji: 6,
    稀有度: Math.max(3, number(template.稀有度)),
    出售价: Math.floor(1_000_000 * result.rawTotal),
    来源: '白须仙翁',
    锻造后缀: suffixPlan.suffix,
    锻造配方: recipe.map(item => ({ name: item.material.name, count: item.count })),
  };
  return {
    id,
    displayName,
    type,
    suffix: suffixPlan.suffix,
    power: result.power,
    materialCost: result.materialCost,
    price: calculateWhiteBeardPrice(result.power, result.materialCost, suffixPlan.priceMultiplier),
    recipe: equipment.锻造配方,
    equipment,
    soldTo: null,
    soldAt: null,
  };
}

export function createWhiteBeardStock(options) {
  const random = options.random || Math.random;
  const templates = {
    武器: options.weaponTemplates || [],
    护具: options.armorTemplates || [],
    法宝: options.treasureTemplates || [],
  };
  const materials = (options.materials || []).filter(item =>
    item?.name && ['攻', '防', '血', '暴'].every(key => Number.isFinite(Number(item[key])))
  );
  for (const [type, pool] of Object.entries(templates)) {
    if (!pool.length) throw new Error(`白须仙翁缺少${type}模板`);
  }

  const count = 3 + randomIndex(3, random);
  const types = ['武器', '护具', '法宝'];
  while (types.length < count) types.push(pick(['武器', '护具', '法宝'], random));
  const blueprints = shuffle(SUFFIX_BLUEPRINTS, random).slice(0, count);
  const serial = String(options.serial || Date.now()).slice(-6);
  return types.map((type, index) => createStockItem(
    type,
    pick(templates[type], random),
    getSuffixPlan(blueprints[index], random),
    materials,
    random,
    serial,
    index + 1,
  ));
}

function requireItems(names, pools) {
  const allItems = pools.flat();
  return names.map(name => {
    const item = allItems.find(entry => entry.name === name);
    if (!item) throw new Error(`黑衣神秘人缺少商品：${name}`);
    if (item.不可交易) throw new Error(`黑衣神秘人不可出售：${name}`);
    return item;
  });
}

function createBlackStockEntry(item, price, category) {
  return {
    displayName: item.name,
    category,
    description: item.desc || '来历不明，效力却真实无虚。',
    price: Math.min(BLACK_MARKET_MAX_PRICE, Math.max(1, Math.trunc(price))),
    quantity: 1,
    item: JSON.parse(JSON.stringify(item)),
    soldTo: null,
    soldAt: null,
  };
}

export function createBlackMarketStock(options) {
  const random = options.random || Math.random;
  const pills = options.pills || [];
  const props = options.props || [];
  const medicinePool = requireItems(BLACK_MEDICINE_NAMES, [pills]);
  const utilityPool = requireItems(Object.keys(BLACK_UTILITY_PRICES), [props]);
  const potentialPool = requireItems(Object.keys(BLACK_POTENTIAL_PRICES), [pills]);
  const forbiddenPool = requireItems(Object.keys(BLACK_FORBIDDEN_PRICES), [props]);
  const targetCount = 5 + randomIndex(3, random);
  const selected = [];

  for (const item of shuffle(medicinePool, random).slice(0, 2 + randomIndex(2, random))) {
    const price = Math.max(200_000_000, number(item.出售价) * 3);
    selected.push(createBlackStockEntry(item, price, '丹药神药'));
  }
  const utility = pick(utilityPool, random);
  selected.push(createBlackStockEntry(utility, BLACK_UTILITY_PRICES[utility.name], '诸天奇物'));

  if (random() < 0.35) {
    const potential = pick(potentialPool, random);
    selected.push(createBlackStockEntry(potential, BLACK_POTENTIAL_PRICES[potential.name], '潜力丹药'));
  }
  if (random() < 0.25) {
    const sign = forbiddenPool.find(item => item.name === '轮回命签');
    selected.push(createBlackStockEntry(sign, BLACK_FORBIDDEN_PRICES[sign.name], '禁忌之物'));
  }
  if (random() < 0.08) {
    const tablet = forbiddenPool.find(item => item.name === '命宫拓碑');
    selected.push(createBlackStockEntry(tablet, BLACK_FORBIDDEN_PRICES[tablet.name], '禁忌之物'));
  }

  const selectedNames = new Set(selected.map(entry => entry.displayName));
  const commonRemainder = shuffle([...medicinePool, ...utilityPool], random)
    .filter(item => !selectedNames.has(item.name));
  while (selected.length < targetCount && commonRemainder.length) {
    const item = commonRemainder.shift();
    const utilityPrice = BLACK_UTILITY_PRICES[item.name];
    const price = utilityPrice || Math.max(200_000_000, number(item.出售价) * 3);
    selected.push(createBlackStockEntry(item, price, utilityPrice ? '诸天奇物' : '丹药神药'));
  }

  return selected.slice(0, targetCount).map((entry, index) => ({ ...entry, id: index + 1 }));
}
