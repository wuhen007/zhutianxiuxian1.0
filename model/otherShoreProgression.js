import { getOtherShoreTravelTier } from './otherShoreRules.js';

/**
 * 彼岸世界的层级推进与大道至宝配方。
 *
 * 这个模块只描述规则，不读写玩家、Redis 或背包。调用方可以先用
 * validate/preview 得到缺口，再在自己的事务中完成消耗与结算。
 */

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

const copy = (value) => {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
};

const text = (value) => String(value ?? '').trim();

const whole = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
};

const bool = (value) => value === true || value === 1 || value === 'true';

export const OTHER_SHORE_LAYER_ORDER = Object.freeze(['canglan', 'true_world', 'qiankun']);

const LAYER_ALIASES = Object.freeze({
  canglan: 'canglan',
  'cang-lan': 'canglan',
  沧澜: 'canglan',
  沧澜界: 'canglan',
  true_world: 'true_world',
  'true-world': 'true_world',
  trueworld: 'true_world',
  真世界: 'true_world',
  qiankun: 'qiankun',
  'qian-kun': 'qiankun',
  乾坤: 'qiankun',
  乾坤界: 'qiankun',
});

const LAYER_CATALOG = [
  {
    id: 'canglan',
    name: '沧澜界',
    order: 0,
    kind: 'star-sea',
    enemyRange: '圣王~准帝，最高大帝~真仙',
    description: '彼岸第一层星海，每一格都是一颗大星，承担全服开图与前线营地循环。',
    entry: '裂界残忆抵达彼岸节点后开放。',
    requirements: [],
  },
  {
    id: 'true_world',
    name: '真世界',
    order: 1,
    kind: 'higher-world',
    enemyRange: '真仙~仙王巨头，最高准仙帝',
    description: '古文明主战场，准仙帝敌人会留下纪元积累与大道至宝炼制法。',
    entry: '完成沧澜界首个关键战役并锚定裂界母锚。',
    requirements: [
      {
        id: 'canglan-campaign',
        label: '沧澜界关键战役首通',
        type: 'counter',
        minimum: 1,
      },
      {
        id: 'rift-mother-anchor',
        label: '裂界母锚已锚定',
        type: 'flag',
      },
    ],
  },
  {
    id: 'qiankun',
    name: '乾坤界',
    order: 2,
    kind: 'dimension-world',
    enemyRange: '仙帝~祭道',
    description: '只能从彼岸探索抵达的高维战场，盛产维度航路与大道至宝稳定材料。',
    entry: '真世界探索完成后，由仙帝打破维度壁垒进入。',
    requirements: [
      {
        id: 'true-world-exploration',
        label: '真世界入口已开启',
        type: 'flag',
      },
      {
        id: 'immortal-emperor',
        label: '仙帝级维度力量',
        type: 'realm',
        minimumTier: 'immortal_emperor',
      },
      {
        id: 'dimension-break',
        label: '已完成维度破壁',
        type: 'flag',
      },
    ],
  },
];

export const OTHER_SHORE_LAYERS = deepFreeze(LAYER_CATALOG);
export const OTHER_SHORE_LAYER_CATALOG = OTHER_SHORE_LAYERS;
export const OTHER_SHORE_WORLD_LAYERS = OTHER_SHORE_LAYERS;
export const OTHER_SHORE_LAYER_MAP = deepFreeze(
  Object.fromEntries(OTHER_SHORE_LAYERS.map((layer) => [layer.id, layer])),
);

export const OTHER_SHORE_DAO_TREASURE_MATERIALS = deepFreeze([
  {
    id: 'true-world-source-crystal',
    name: '真界源晶',
    aliases: ['真界源晶', '真界源晶·彼岸'],
    baseQuantity: 300,
    description: '真世界本源凝结的稳定晶核。',
  },
  {
    id: 'dao-rule-origin',
    name: '大道规则本源',
    aliases: ['大道规则本源', '大道规则本源·彼岸'],
    baseQuantity: 150,
    description: '用于固定新至宝权柄边界的规则本源。',
  },
  {
    id: 'dimension-anchor-crystal',
    name: '维度锚晶',
    aliases: ['维度锚晶', '维度锚'],
    baseQuantity: 30,
    description: '把炼器过程钉在当前维度，避免新权柄漂移。',
  },
  {
    id: 'era-dao-marrow',
    name: '纪元道髓',
    aliases: ['纪元道髓', '纪元髓'],
    baseQuantity: 20,
    description: '从真世界纪元积累中提炼出的器道骨髓。',
  },
  {
    id: 'all-heavens-mother-metal',
    name: '诸天母金',
    aliases: ['诸天母金', '母金'],
    baseQuantity: 10,
    description: '承载多件先天至宝权柄而不互相湮灭的母材。',
  },
]);

export const OTHER_SHORE_FORGE_MATERIALS = OTHER_SHORE_DAO_TREASURE_MATERIALS;
export const OTHER_SHORE_DAO_TREASURE_BASE_MATERIALS = deepFreeze({
  'true-world-source-crystal': 300,
  'dao-rule-origin': 150,
});
export const OTHER_SHORE_DAO_TREASURE_MATERIAL_COSTS = OTHER_SHORE_DAO_TREASURE_BASE_MATERIALS;
export const OTHER_SHORE_DAO_TREASURE_MATERIAL_MAP = deepFreeze(
  Object.fromEntries(
    OTHER_SHORE_DAO_TREASURE_MATERIALS.flatMap((material) =>
      [material.id, material.name, ...(material.aliases || [])].map((key) => [key, material]),
    ),
  ),
);

const BASE_MATERIAL_COST = OTHER_SHORE_DAO_TREASURE_BASE_MATERIALS;

const STABILIZER_COSTS = Object.freeze({
  'three-innate-erasure': {
    'dimension-anchor-crystal': 30,
    'era-dao-marrow': 20,
    'all-heavens-mother-metal': 10,
  },
  'custom-ancient-method': {
    'dimension-anchor-crystal': 50,
    'era-dao-marrow': 35,
    'all-heavens-mother-metal': 18,
  },
  'dao-fruit-five-treasure': {
    'dimension-anchor-crystal': 80,
    'era-dao-marrow': 55,
    'all-heavens-mother-metal': 30,
  },
  'return-truth-edit': {
    'dimension-anchor-crystal': 120,
    'era-dao-marrow': 90,
    'all-heavens-mother-metal': 60,
  },
});

const RECIPE_ALIASES = Object.freeze({
  1: 'three-innate-erasure',
  三宝归墟法: 'three-innate-erasure',
  三宝消史法: 'three-innate-erasure',
  'three-innate-erasure': 'three-innate-erasure',
  2: 'custom-ancient-method',
  彼岸定法: 'custom-ancient-method',
  自定炼法: 'custom-ancient-method',
  'custom-ancient-method': 'custom-ancient-method',
  3: 'dao-fruit-five-treasure',
  道果五宝法: 'dao-fruit-five-treasure',
  五宝留史法: 'dao-fruit-five-treasure',
  'dao-fruit-five-treasure': 'dao-fruit-five-treasure',
  4: 'return-truth-edit',
  还真编权法: 'return-truth-edit',
  三十源本法: 'return-truth-edit',
  'return-truth-edit': 'return-truth-edit',
});

const recipe = (value) => ({
  ...value,
  materials: { ...BASE_MATERIAL_COST, ...STABILIZER_COSTS[value.id] },
});

export const OTHER_SHORE_DAO_TREASURE_RECIPES = deepFreeze([
  recipe({
    id: 'three-innate-erasure',
    index: 1,
    name: '三宝归墟法',
    aliases: ['三宝消史法', '第一法'],
    layer: 'true_world',
    description: '投入三件先天至宝，使其从古史中彻底消失，融合三者权柄生成全新大道至宝。',
    requirements: {
      knownRecipe: true,
      innateTreasures: 3,
      consumeInnateTreasures: true,
      daoFruit: false,
      specialMethod: false,
      returnTruthPower: false,
      quasiImmortalEmperorSources: 0,
      customAuthorities: 0,
    },
    output: {
      authorityMode: 'fused',
      authorityCount: 'all-selected',
      cooldownMultiplier: 0.5,
      innateTreasuresPreserved: false,
      customAuthorityEditing: false,
    },
  }),
  recipe({
    id: 'custom-ancient-method',
    index: 2,
    name: '彼岸定法',
    aliases: ['自定炼法', '第二法'],
    layer: 'true_world',
    description: '为持有者预留的第二炼制法接口，具体权柄与消耗由彼岸古法条目补充。',
    requirements: {
      knownRecipe: true,
      innateTreasures: 0,
      consumeInnateTreasures: false,
      daoFruit: false,
      specialMethod: true,
      returnTruthPower: false,
      quasiImmortalEmperorSources: 0,
      customAuthorities: 0,
    },
    output: {
      authorityMode: 'custom-method',
      authorityCount: 'method-defined',
      cooldownMultiplier: 0.65,
      innateTreasuresPreserved: true,
      customAuthorityEditing: 'method-defined',
    },
  }),
  recipe({
    id: 'dao-fruit-five-treasure',
    index: 3,
    name: '道果五宝法',
    aliases: ['五宝留史法', '第三法'],
    layer: 'true_world',
    minRealmTier: 'quasi_immortal_emperor',
    description: '以自身道果和五件先天至宝强行开炉；五件至宝不消失，新器只继承部分权柄并随机强化一项。',
    requirements: {
      knownRecipe: true,
      innateTreasures: 5,
      consumeInnateTreasures: false,
      daoFruit: true,
      specialMethod: false,
      returnTruthPower: false,
      quasiImmortalEmperorSources: 0,
      customAuthorities: 0,
    },
    output: {
      authorityMode: 'partial-random',
      authorityCount: 'partial',
      cooldownMultiplier: 0.8,
      innateTreasuresPreserved: true,
      customAuthorityEditing: false,
      randomEnhancedAuthority: true,
    },
  }),
  recipe({
    id: 'return-truth-edit',
    index: 4,
    name: '还真编权法',
    aliases: ['三十源本法', '第四法'],
    layer: 'true_world',
    minRealmTier: 'quasi_immortal_emperor',
    description: '持有如梦道祖部分还真之力，收集三十位准仙帝敌人本源，自定义编辑三项强化权柄。',
    requirements: {
      knownRecipe: true,
      innateTreasures: 0,
      consumeInnateTreasures: false,
      daoFruit: false,
      specialMethod: false,
      returnTruthPower: true,
      quasiImmortalEmperorSources: 30,
      customAuthorities: 3,
    },
    output: {
      authorityMode: 'custom-enhanced',
      authorityCount: 3,
      cooldownMultiplier: 0.7,
      innateTreasuresPreserved: true,
      customAuthorityEditing: true,
      editableAuthorityCount: 3,
    },
  }),
]);

export const OTHER_SHORE_DAO_TREASURE_RECIPE_MAP = deepFreeze(
  Object.fromEntries(
    OTHER_SHORE_DAO_TREASURE_RECIPES.flatMap((entry) =>
      [entry.id, entry.index, String(entry.index), entry.name, ...(entry.aliases || [])].map((key) => [key, entry]),
    ),
  ),
);
export const OTHER_SHORE_FORGE_RECIPES = OTHER_SHORE_DAO_TREASURE_RECIPES;
export const OTHER_SHORE_DAO_TREASURE_RECIPE_CATALOG = OTHER_SHORE_DAO_TREASURE_RECIPES;

const REALM_TIER_ORDER = Object.freeze([
  'below_emperor',
  'emperor',
  'true_immortal',
  'immortal_king',
  'quasi_immortal_emperor',
  'immortal_emperor',
]);

function normalizeRealmTier(value) {
  if (value && typeof value === 'object') {
    return normalizeRealmTier(value.tier ?? value.realmTier ?? value.name ?? value.境界);
  }
  const source = text(value);
  if (!source) return 'below_emperor';
  if (/准仙帝|quasi[_ -]?immortal[_ -]?emperor/i.test(source)) return 'quasi_immortal_emperor';
  if (/仙帝|祭道|路尽|immortal[_ -]?emperor/i.test(source)) return 'immortal_emperor';
  if (/仙王|帝光仙王|immortal[_ -]?king/i.test(source)) return 'immortal_king';
  if (/真仙|红尘仙|true[_ -]?immortal/i.test(source)) return 'true_immortal';
  if (/大帝|emperor/i.test(source)) return 'emperor';
  return 'below_emperor';
}

function realmTierFromContext(context = {}) {
  const explicit = normalizeRealmTier(context?.realmTier);
  const travelTier = getOtherShoreTravelTier(context);
  return REALM_TIER_ORDER.indexOf(explicit) > REALM_TIER_ORDER.indexOf(travelTier)
    ? explicit
    : travelTier;
}

function normalizeLayerId(value) {
  const key = text(value).toLowerCase();
  return LAYER_ALIASES[key] || LAYER_ALIASES[text(value)] || null;
}

function layerIndex(value) {
  const id = normalizeLayerId(value);
  return id ? OTHER_SHORE_LAYER_ORDER.indexOf(id) : -1;
}

function nested(context, ...keys) {
  let current = context;
  for (const key of keys) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

function firstDefined(context, paths) {
  for (const path of paths) {
    const value = Array.isArray(path) ? nested(context, ...path) : context?.[path];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function collectionIncludes(collection, aliases) {
  if (collection instanceof Set) collection = [...collection];
  if (!Array.isArray(collection)) return false;
  const wanted = aliases.map((value) => text(value));
  return collection.some((entry) => {
    const value = typeof entry === 'object' ? entry.id ?? entry.name ?? entry.starId : entry;
    return wanted.includes(text(value));
  });
}

function hasCanglanCampaignClear(context) {
  const direct = firstDefined(context, [
    'canglanCampaignClears',
    'campaignClears',
    ['frontier', 'campaignClears'],
    ['progression', 'canglanCampaignClears'],
    ['expedition', 'campaigns'],
    ['frontier', 'expedition', 'campaigns'],
    ['world', 'expedition', 'campaigns'],
  ]);
  if (whole(direct) >= 1) return true;
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    if (
      Object.values(direct).some(
        (value) => whole(value?.clearCount ?? value?.clears ?? value) > 0 || bool(value?.completed ?? value),
      )
    )
      return true;
  }
  const campaigns = firstDefined(context, ['clearedCampaigns', ['progression', 'clearedCampaigns']]);
  if (Array.isArray(campaigns)) return campaigns.length > 0;
  if (campaigns && typeof campaigns === 'object')
    return Object.values(campaigns).some((value) => whole(value) > 0 || bool(value));
  return bool(firstDefined(context, ['canglanCampaignCleared', '玄阙神炉首通']));
}

function hasMotherAnchor(context) {
  if (bool(firstDefined(context, ['riftMotherAnchor', 'motherAnchor', '裂界母锚已锚定']))) return true;
  const stars = firstDefined(context, ['clearedKeyStars', 'anchoredKeyStars', ['progression', 'clearedKeyStars']]);
  if (collectionIncludes(stars, ['裂界母锚', '0,-4', 'rift-mother-anchor'])) return true;
  if (stars && typeof stars === 'object' && !Array.isArray(stars)) {
    return Object.entries(stars).some(
      ([key, value]) =>
        ['裂界母锚', '0,-4', 'rift-mother-anchor'].includes(text(key)) &&
        (bool(value) ||
          value?.phase === 'anchored' ||
          value?.phase === 'cleared' ||
          value?.anchored === true ||
          value?.cleared === true),
    );
  }
  const worldStates = firstDefined(context, ['worldStates', ['world', 'states'], ['progression', 'worldStates']]);
  const motherState = worldStates?.['0,-4'];
  return Boolean(
    motherState &&
      (motherState.phase === 'anchored' ||
        motherState.phase === 'cleared' ||
        motherState.anchored === true ||
        motherState.cleared === true),
  );
}

function hasTrueWorldAccess(context) {
  if (bool(firstDefined(context, ['trueWorldUnlocked', 'trueWorldAccess', '真世界已开放']))) return true;
  const unlocked = firstDefined(context, ['unlockedLayers', 'openedLayers', ['progression', 'unlockedLayers']]);
  if (collectionIncludes(unlocked, ['true_world', '真世界'])) return true;
  if (unlocked && typeof unlocked === 'object' && !Array.isArray(unlocked)) {
    return bool(unlocked.true_world ?? unlocked.真世界);
  }
  return false;
}

function hasTrueWorldExploration(context) {
  const completed = firstDefined(context, [
    'trueWorldExplorationComplete',
    'trueWorldExplored',
    '真世界探索完成',
    ['progression', 'trueWorldExplorationComplete'],
  ]);
  if (bool(completed) || completed?.status === 'complete' || completed?.completed === true) return true;
  const campaignClears = firstDefined(context, [
    'trueWorldCampaignClears',
    ['progression', 'trueWorldCampaignClears'],
  ]);
  if (whole(campaignClears) > 0) return true;
  const progress = firstDefined(context, [
    'trueWorldExploration',
    '真世界探索度',
    ['progression', 'trueWorldExploration'],
  ]);
  if (progress && typeof progress === 'object') {
    return progress.status === 'complete'
      || progress.completed === true
      || whole(progress.percent ?? progress.progress) >= 100;
  }
  return progress === true || whole(progress) >= 100;
}

function hasDimensionBreak(context) {
  const value = firstDefined(context, [
    'dimensionBreak',
    'dimensionBroken',
    'qiankunUnlocked',
    '乾坤界已破壁',
    ['progression', 'dimensionBreak'],
  ]);
  return bool(value) || value?.status === 'complete' || value?.completed === true;
}

export function getOtherShoreLayer(layer) {
  const id = normalizeLayerId(layer);
  return id ? OTHER_SHORE_LAYER_MAP[id] : null;
}

export function normalizeOtherShoreLayer(layer) {
  return normalizeLayerId(layer);
}

export function validateOtherShoreLayerAccess(layer, context = {}) {
  const id = normalizeLayerId(layer);
  if (!id) {
    return {
      ok: false,
      allowed: false,
      layer: null,
      reason: 'unknown-layer',
      missing: [{ id: 'layer', label: '有效的彼岸世界层级', required: text(layer), available: null }],
    };
  }

  const profile = OTHER_SHORE_LAYER_MAP[id];
  const missing = [];
  const currentLayer = normalizeLayerId(context.currentLayer ?? context.currentWorld ?? context.currentWorldLayer);
  if (currentLayer && layerIndex(currentLayer) < profile.order - 1) {
    missing.push({
      id: 'previous-layer',
      label: `先抵达${OTHER_SHORE_LAYER_MAP[OTHER_SHORE_LAYER_ORDER[profile.order - 1]].name}`,
      required: OTHER_SHORE_LAYER_ORDER[profile.order - 1],
      available: currentLayer,
    });
  }

  if (id === 'true_world') {
    const explicitAccess = hasTrueWorldAccess(context);
    if (!explicitAccess && !hasCanglanCampaignClear(context)) {
      missing.push({ id: 'canglan-campaign', label: '沧澜界关键战役首通', required: 1, available: 0 });
    }
    if (!explicitAccess && !hasMotherAnchor(context)) {
      missing.push({ id: 'rift-mother-anchor', label: '裂界母锚已锚定', required: true, available: false });
    }
  }

  if (id === 'qiankun') {
    if (!hasTrueWorldExploration(context)) {
      missing.push({ id: 'true-world-exploration', label: '真世界入口已开启', required: true, available: false });
    }
    const actualTier = realmTierFromContext(context);
    if (REALM_TIER_ORDER.indexOf(actualTier) < REALM_TIER_ORDER.indexOf('immortal_emperor')) {
      missing.push({
        id: 'immortal-emperor',
        label: '仙帝级维度力量',
        required: 'immortal_emperor',
        available: actualTier,
      });
    }
    if (!hasDimensionBreak(context)) {
      missing.push({ id: 'dimension-break', label: '已完成维度破壁', required: true, available: false });
    }
  }

  return {
    ok: missing.length === 0,
    allowed: missing.length === 0,
    layer: copy(profile),
    reason: missing.length === 0 ? null : 'requirements-missing',
    missing,
    requirements: copy(profile.requirements),
  };
}

export const checkOtherShoreLayerAccess = validateOtherShoreLayerAccess;
export const canAccessOtherShoreLayer = (layer, context = {}) => validateOtherShoreLayerAccess(layer, context).ok;
export const isOtherShoreLayerUnlocked = canAccessOtherShoreLayer;
export const canEnterOtherShoreLayer = canAccessOtherShoreLayer;
export const getOtherShoreLayerAccess = validateOtherShoreLayerAccess;
export const OTHER_SHORE_LAYER_REQUIREMENTS = deepFreeze(
  Object.fromEntries(OTHER_SHORE_LAYERS.map((layer) => [layer.id, layer.requirements])),
);

function normalizeMaterialId(value) {
  const key = text(value);
  return OTHER_SHORE_DAO_TREASURE_MATERIAL_MAP[key]?.id || null;
}

function materialInventory(input = {}) {
  const source = input.materials ?? input.materialInventory ?? input.材料 ?? {};
  const inventory = {};
  if (Array.isArray(source)) {
    for (const entry of source) {
      const id = normalizeMaterialId(typeof entry === 'string' ? entry : entry?.id ?? entry?.name ?? entry?.名称);
      const amount = typeof entry === 'string' ? 1 : entry.quantity ?? entry.数量 ?? entry.amount ?? entry.count;
      if (id) inventory[id] = (inventory[id] || 0) + whole(amount);
    }
    return inventory;
  }
  if (!source || typeof source !== 'object') return inventory;
  for (const [key, amount] of Object.entries(source)) {
    const id = normalizeMaterialId(key);
    const value =
      amount && typeof amount === 'object' ? amount.quantity ?? amount.数量 ?? amount.amount ?? amount.count : amount;
    if (id) inventory[id] = (inventory[id] || 0) + whole(value);
  }
  return inventory;
}

function treasureEntries(input = {}) {
  const source = input.innateTreasures ?? input.treasures ?? input.先天至宝 ?? [];
  if (Array.isArray(source))
    return source
      .map((entry) => (typeof entry === 'string' ? { id: entry, name: entry } : entry))
      .filter((entry) => entry && typeof entry === 'object');
  if (Number.isFinite(Number(source)))
    return Array.from({ length: whole(source) }, (_, index) => ({ id: `treasure-${index + 1}` }));
  if (source && typeof source === 'object' && Number.isFinite(Number(source.count ?? source.quantity))) {
    return Array.from({ length: whole(source.count ?? source.quantity) }, (_, index) => ({
      id: `treasure-${index + 1}`,
    }));
  }
  return [];
}

function uniqueTreasureCount(entries) {
  const ids = new Set();
  for (const entry of entries) {
    const id = text(entry.id ?? entry.name ?? entry.名称);
    if (id) ids.add(id);
  }
  return ids.size;
}

function hasDaoFruit(input) {
  const value = firstDefined(input, ['daoFruit', 'hasDaoFruit', '道果', '自身道果']);
  return (
    bool(value) || (typeof value === 'string' && value.trim().length > 0) || Boolean(value && typeof value === 'object')
  );
}

function hasSpecialMethod(input) {
  const value = firstDefined(input, [
    'specialMethod',
    'specialMethodProof',
    'customMethod',
    '彼岸炼法',
    '第二法凭证',
    'specialMethodId',
    'methodId',
  ]);
  return (
    bool(value) || (typeof value === 'string' && value.trim().length > 0) || Boolean(value && typeof value === 'object')
  );
}

function hasKnownForgeMethod(recipe, input) {
  if (bool(firstDefined(input, ['recipeKnown', 'hasForgeMethod', '炼制法已掌握']))) return true;
  if (recipe.requirements.specialMethod && hasSpecialMethod(input)) return true;
  let source = firstDefined(input, [
    'knownRecipes',
    'knownRecipeIds',
    'obtainedRecipes',
    'daoTreasureRecipes',
    '彼岸大道至宝炼制法',
    '大道至宝炼制法',
  ]);
  if (source instanceof Set) source = [...source];
  if (typeof source === 'string') source = source.split(/[、,，\s]+/).filter(Boolean);
  const aliases = [recipe.id, String(recipe.index), recipe.name, ...(recipe.aliases || [])].map(text);
  if (Array.isArray(source)) {
    return source.some((entry) => {
      const value = text(typeof entry === 'object' ? entry.id ?? entry.name ?? entry.名称 : entry);
      return aliases.includes(value);
    });
  }
  if (source && typeof source === 'object') {
    return Object.entries(source).some(([key, value]) => aliases.includes(text(key)) && bool(value));
  }
  return false;
}

function hasReturnTruthPower(input) {
  const value = firstDefined(input, [
    'returnTruthPower',
    'hasReturnTruthPower',
    'hasDreamAncestorReturnTruth',
    '还真之力',
    '如梦道祖还真之力',
  ]);
  return (
    bool(value) || (typeof value === 'string' && value.trim().length > 0) || Boolean(value && typeof value === 'object')
  );
}

function sourceCount(input) {
  const direct = firstDefined(input, [
    'quasiImmortalEmperorSources',
    'quasiImmortalSources',
    '准仙帝本源',
    ['sources', 'quasiImmortalEmperor'],
  ]);
  if (Array.isArray(direct)) return direct.length;
  if (direct && typeof direct === 'object')
    return Object.values(direct).reduce((sum, value) => sum + whole(value?.quantity ?? value?.count ?? value), 0);
  return whole(direct);
}

function authorityEntries(input) {
  const source = firstDefined(input, ['customAuthorities', 'authorities', '自定义权柄', '强化权柄']);
  if (typeof source === 'string')
    return [
      ...new Set(
        source
          .split(/[、,，\s]+/)
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    ];
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    return Object.entries(source)
      .filter(([, value]) => bool(value) || (value && typeof value === 'object'))
      .map(([key]) => key);
  }
  if (!Array.isArray(source)) return [];
  return [
    ...new Set(
      source
        .map((entry) => text(typeof entry === 'object' ? entry.id ?? entry.name ?? entry.名称 : entry))
        .filter(Boolean),
    ),
  ];
}

export function getOtherShoreDaoTreasureRecipe(recipeId) {
  const key = text(recipeId);
  const resolved = RECIPE_ALIASES[key] || RECIPE_ALIASES[Number(recipeId)] || key;
  return (
    OTHER_SHORE_DAO_TREASURE_RECIPE_MAP[resolved] ||
    OTHER_SHORE_DAO_TREASURE_RECIPE_MAP[key] ||
    OTHER_SHORE_DAO_TREASURE_RECIPE_MAP[Number(recipeId)] ||
    null
  );
}

export const getOtherShoreForgeRecipe = getOtherShoreDaoTreasureRecipe;

function missingEntry(id, label, required, available) {
  return { id, label, required, available };
}

export function validateOtherShoreDaoTreasureRecipe(recipeId, input = {}) {
  const selected = getOtherShoreDaoTreasureRecipe(recipeId);
  if (!selected) {
    return {
      ok: false,
      valid: false,
      recipe: null,
      recipeId: null,
      reason: 'unknown-recipe',
      missing: [missingEntry('recipe', '有效的大道至宝配方', text(recipeId), null)],
      errors: ['未知大道至宝配方'],
    };
  }

  const missing = [];
  const errors = [];
  const accessContext = { ...input };
  const currentLayer = normalizeLayerId(input.currentLayer ?? input.layer ?? input.worldLayer);
  if (currentLayer) accessContext.currentLayer = currentLayer;
  const layerAccess =
    currentLayer && layerIndex(currentLayer) >= layerIndex(selected.layer)
      ? { ok: true, missing: [] }
      : validateOtherShoreLayerAccess(selected.layer, accessContext);
  if (!layerAccess.ok) {
    for (const entry of layerAccess.missing) missing.push({ ...entry, scope: 'layer' });
  }

  const actualTier = realmTierFromContext(input);
  if (selected.minRealmTier && REALM_TIER_ORDER.indexOf(actualTier) < REALM_TIER_ORDER.indexOf(selected.minRealmTier)) {
    missing.push(missingEntry('realm', '达到准仙帝级炼器境界', selected.minRealmTier, actualTier));
  }

  const inventory = materialInventory(input);
  const requiredMaterials = {};
  for (const [id, required] of Object.entries(selected.materials)) {
    const available = inventory[id] || 0;
    requiredMaterials[id] = required;
    if (available < required) {
      const material = OTHER_SHORE_DAO_TREASURE_MATERIAL_MAP[id];
      missing.push(missingEntry(id, material?.name || id, required, available));
    }
  }

  const treasures = treasureEntries(input);
  const requiredTreasures = selected.requirements.innateTreasures;
  const availableTreasures = uniqueTreasureCount(treasures);
  if (availableTreasures < requiredTreasures) {
    missing.push(missingEntry('innate-treasures', '不同的先天至宝', requiredTreasures, availableTreasures));
  }
  if (selected.requirements.knownRecipe && !hasKnownForgeMethod(selected, input)) {
    missing.push(missingEntry('forge-method', `已获得「${selected.name}」炼制法`, true, false));
  }
  if (selected.requirements.specialMethod && !hasSpecialMethod(input)) {
    missing.push(missingEntry('special-method', '第二炼制法具体规则条目', true, false));
  }
  if (selected.requirements.daoFruit && !hasDaoFruit(input)) {
    missing.push(missingEntry('dao-fruit', '自身道果', true, false));
  }
  if (selected.requirements.returnTruthPower && !hasReturnTruthPower(input)) {
    missing.push(missingEntry('return-truth-power', '如梦道祖部分还真之力', true, false));
  }
  const requiredSources = selected.requirements.quasiImmortalEmperorSources;
  const availableSources = sourceCount(input);
  if (availableSources < requiredSources) {
    missing.push(missingEntry('quasi-immortal-emperor-sources', '准仙帝敌人本源', requiredSources, availableSources));
  }
  const requiredAuthorities = selected.requirements.customAuthorities;
  const authorities = authorityEntries(input);
  if (authorities.length < requiredAuthorities) {
    missing.push(missingEntry('custom-authorities', '自定义强化权柄', requiredAuthorities, authorities.length));
  }

  const consumed = {
    materials: copy(requiredMaterials),
    innateTreasures: selected.requirements.consumeInnateTreasures ? requiredTreasures : 0,
    daoFruit: selected.requirements.daoFruit,
    specialMethod: selected.requirements.specialMethod,
    returnTruthPower: selected.requirements.returnTruthPower,
    quasiImmortalEmperorSources: requiredSources,
  };
  const preserved = {
    innateTreasures: selected.requirements.consumeInnateTreasures ? 0 : requiredTreasures,
    daoFruit: selected.requirements.daoFruit ? 0 : null,
    specialMethod: selected.requirements.specialMethod ? 0 : null,
    returnTruthPower: selected.requirements.returnTruthPower ? 0 : null,
    quasiImmortalEmperorSources: 0,
  };
  const output = {
    ...copy(selected.output),
    customAuthorities: selected.output.customAuthorityEditing ? authorities.slice(0, 3) : [],
  };
  return {
    ok: missing.length === 0 && errors.length === 0,
    valid: missing.length === 0 && errors.length === 0,
    reason: missing.length === 0 && errors.length === 0 ? null : 'requirements-missing',
    recipeId: selected.id,
    recipe: copy(selected),
    layer: selected.layer,
    actualRealmTier: actualTier,
    missing,
    errors,
    requiredMaterials,
    availableMaterials: inventory,
    consumed,
    preserved,
    output,
  };
}

export const checkOtherShoreDaoTreasureRecipe = validateOtherShoreDaoTreasureRecipe;
export const validateDaoTreasureRecipe = validateOtherShoreDaoTreasureRecipe;

export function previewOtherShoreDaoTreasureForge(recipeId, input = {}) {
  const validation = validateOtherShoreDaoTreasureRecipe(recipeId, input);
  return {
    ...validation,
    preview: {
      recipeId: validation.recipeId,
      recipeName: validation.recipe?.name || null,
      layer: validation.layer || null,
      ready: validation.ok,
      consumes: copy(validation.consumed || null),
      preserves: copy(validation.preserved || null),
      output: copy(validation.output || null),
      note: validation.recipe?.description || '',
    },
  };
}

export const previewOtherShoreDaoTreasureRecipe = previewOtherShoreDaoTreasureForge;
export const previewDaoTreasureRecipe = previewOtherShoreDaoTreasureForge;

function unlockedLayerIds(state = {}) {
  const source = state.unlockedLayers ?? state.openedLayers;
  if (source instanceof Set) return unlockedLayerIds({ ...state, unlockedLayers: [...source] });
  if (Array.isArray(source)) {
    const indexes = source.map(normalizeLayerId).filter(Boolean).map(layerIndex);
    const max = Math.max(-1, ...indexes);
    return max < 0 ? ['canglan'] : OTHER_SHORE_LAYER_ORDER.slice(0, max + 1);
  }
  const current = normalizeLayerId(state.currentLayer ?? state.currentWorldLayer);
  if (!current) return ['canglan'];
  return OTHER_SHORE_LAYER_ORDER.slice(0, layerIndex(current) + 1);
}

function serializeViewerForge(forge, playerId) {
  if (!forge || typeof forge !== 'object') return null;
  const viewer = text(playerId);
  let source = forge;
  if (forge.players && typeof forge.players === 'object') source = forge.players[viewer];
  else if (forge.byPlayer && typeof forge.byPlayer === 'object') source = forge.byPlayer[viewer];
  else if (forge.playerId !== undefined && viewer && text(forge.playerId) !== viewer) source = null;
  if (!source || typeof source !== 'object') return null;
  const result = {};
  for (const key of ['forgeId', 'status', 'recipeId', 'recipeName', 'progress', 'startedAt', 'readyAt', 'completedAt']) {
    const value = source[key];
    if (['string', 'number', 'boolean'].includes(typeof value)) result[key] = value;
  }
  return Object.keys(result).length ? result : null;
}

export function serializeOtherShoreProgression(state = {}) {
  const unlocked = unlockedLayerIds(state);
  const requestedLayer = normalizeLayerId(state.currentLayer ?? state.currentWorldLayer);
  const currentLayer = requestedLayer || unlocked.at(-1) || 'canglan';
  const visibleLayers = unlocked.includes(currentLayer)
    ? unlocked
    : OTHER_SHORE_LAYER_ORDER.slice(0, layerIndex(currentLayer) + 1);
  const forge = serializeViewerForge(state.forge || state.daoTreasure, state.playerId);
  const canglanCampaignClears = whole(firstDefined(state, [
    'canglanCampaignClears',
    'campaignClears',
    ['progression', 'canglanCampaignClears'],
  ]));
  return {
    version: 1,
    currentLayer,
    unlockedLayers: visibleLayers,
    layers: OTHER_SHORE_LAYERS.map((layer) => ({
      id: layer.id,
      name: layer.name,
      order: layer.order,
      kind: layer.kind,
      enemyRange: layer.enemyRange,
      description: layer.description,
      unlocked: visibleLayers.includes(layer.id),
      entry: layer.entry,
    })),
    materials: OTHER_SHORE_DAO_TREASURE_MATERIALS.map((material) => ({
      id: material.id,
      name: material.name,
      baseQuantity: material.baseQuantity,
      description: material.description,
    })),
    recipes: OTHER_SHORE_DAO_TREASURE_RECIPES.map((entry) => ({
      id: entry.id,
      index: entry.index,
      name: entry.name,
      layer: entry.layer,
      minRealmTier: entry.minRealmTier || null,
      materials: copy(entry.materials),
      requirements: copy(entry.requirements),
      output: copy(entry.output),
      description: entry.description,
    })),
    prerequisites: {
      canglanCampaignClears,
      riftMotherAnchor: hasMotherAnchor(state),
      trueWorldUnlocked: visibleLayers.includes('true_world'),
      trueWorldExplorationComplete: hasTrueWorldExploration(state),
      dimensionBreak: hasDimensionBreak(state),
      realmTier: realmTierFromContext(state),
    },
    forge,
  };
}

export default Object.freeze({
  OTHER_SHORE_LAYERS,
  OTHER_SHORE_WORLD_LAYERS,
  OTHER_SHORE_LAYER_REQUIREMENTS,
  OTHER_SHORE_DAO_TREASURE_MATERIALS,
  OTHER_SHORE_DAO_TREASURE_BASE_MATERIALS,
  OTHER_SHORE_DAO_TREASURE_MATERIAL_COSTS,
  OTHER_SHORE_DAO_TREASURE_RECIPES,
  OTHER_SHORE_DAO_TREASURE_RECIPE_CATALOG,
  getOtherShoreLayer,
  validateOtherShoreLayerAccess,
  canAccessOtherShoreLayer,
  canEnterOtherShoreLayer,
  getOtherShoreDaoTreasureRecipe,
  validateOtherShoreDaoTreasureRecipe,
  validateDaoTreasureRecipe,
  previewOtherShoreDaoTreasureForge,
  previewDaoTreasureRecipe,
  serializeOtherShoreProgression,
});
