const REGULAR_SEED_POOLS = {
  '边缘区域': [
    { name: '灵火灵种', type: '火', quality: '普通', successRate: 0.6, attrs: { 攻击加成: 0.02, 血气加成: 0.03 } },
    { name: '灵水灵种', type: '水', quality: '普通', successRate: 0.6, attrs: { 防御加成: 0.02, 血气加成: 0.03 } },
    { name: '灵木灵种', type: '木', quality: '普通', successRate: 0.6, attrs: { 血气加成: 0.04, 攻击加成: 0.01 } },
    { name: '灵金灵种', type: '金', quality: '普通', successRate: 0.6, attrs: { 攻击加成: 0.015, 防御加成: 0.015 } },
    { name: '灵土灵种', type: '土', quality: '普通', successRate: 0.6, attrs: { 血气加成: 0.05, 防御加成: 0.01 } }
  ],
  '中层区域': [
    { name: '灵火道种', type: '火', quality: '普通', successRate: 0.6, attrs: { 攻击加成: 0.02, 血气加成: 0.03 } },
    { name: '灵水道种', type: '水', quality: '普通', successRate: 0.6, attrs: { 防御加成: 0.02, 血气加成: 0.03 } },
    { name: '灵木道种', type: '木', quality: '普通', successRate: 0.6, attrs: { 血气加成: 0.04, 攻击加成: 0.01 } },
    { name: '青鸾焰', type: '火', quality: '稀有', successRate: 0.7, attrs: { 攻击加成: 0.05, 暴击加成: 0.05 }, skill: '青鸾焚天' },
    { name: '玄冰魄', type: '水', quality: '稀有', successRate: 0.7, attrs: { 防御加成: 0.05, 血气加成: 0.03 }, skill: '玄冰护体' },
    { name: '乙木精', type: '木', quality: '稀有', successRate: 0.7, attrs: { 血气加成: 0.08, 恢复加成: 0.1 }, skill: '乙木逢春' },
    { name: '锐金刃', type: '金', quality: '稀有', successRate: 0.7, attrs: { 攻击加成: 0.06, 穿透加成: 0.1 }, skill: '锐金破甲' },
    { name: '厚土印', type: '土', quality: '稀有', successRate: 0.7, attrs: { 防御加成: 0.06, 减伤加成: 0.1 }, skill: '厚土无敌' }
  ],
  '深层区域': [
    { name: '青鸾焰', type: '火', quality: '稀有', successRate: 0.7, attrs: { 攻击加成: 0.05, 暴击加成: 0.05 }, skill: '青鸾焚天' },
    { name: '玄冰魄', type: '水', quality: '稀有', successRate: 0.7, attrs: { 防御加成: 0.05, 血气加成: 0.03 }, skill: '玄冰护体' },
    { name: '乙木精', type: '木', quality: '稀有', successRate: 0.7, attrs: { 血气加成: 0.08, 恢复加成: 0.1 }, skill: '乙木逢春' },
    { name: '锐金刃', type: '金', quality: '稀有', successRate: 0.7, attrs: { 攻击加成: 0.06, 穿透加成: 0.1 }, skill: '锐金破甲' },
    { name: '厚土印', type: '土', quality: '稀有', successRate: 0.7, attrs: { 防御加成: 0.06, 减伤加成: 0.1 }, skill: '厚土无敌' },
    { name: '朱雀焚天炎', type: '火', quality: '传说', successRate: 0.75, attrs: { 攻击加成: 0.12, 暴击加成: 0.15, 血气加成: 0.05 }, skill: '朱雀降世', extra: '修炼效率+20%' },
    { name: '鲲鹏水灵', type: '水', quality: '传说', successRate: 0.75, attrs: { 血气加成: 0.15, 防御加成: 0.08 }, skill: '鲲鹏展翅', extra: '寿元消耗-30%' },
    { name: '混沌金莲', type: '金', quality: '传说', successRate: 0.75, attrs: { 攻击加成: 0.1, 防御加成: 0.1, 血气加成: 0.05 }, skill: '混沌归一', extra: '可兼容多种道则' },
    { name: '太虚神土', type: '土', quality: '传说', successRate: 0.75, attrs: { 防御加成: 0.12, 血气加成: 0.08, 减伤加成: 0.15 }, skill: '太虚护体', extra: '减伤额外+15%' }
  ],
  '火道禁区': [
    { name: '青鸾焰', type: '火', quality: '稀有', successRate: 0.7, attrs: { 攻击加成: 0.05, 暴击加成: 0.05 }, skill: '青鸾焚天' },
    { name: '朱雀焚天炎', type: '火', quality: '传说', successRate: 0.75, attrs: { 攻击加成: 0.12, 暴击加成: 0.15, 血气加成: 0.05 }, skill: '朱雀降世', extra: '修炼效率+20%' },
    { name: '太阳真火', type: '火', quality: '传说', successRate: 0.78, attrs: { 攻击加成: 0.16, 暴击加成: 0.18 }, skill: '大日临空', extra: '火道威能+20%' }
  ],
  '核心区域': [
    { name: '朱雀焚天炎', type: '火', quality: '传说', successRate: 0.75, attrs: { 攻击加成: 0.12, 暴击加成: 0.15, 血气加成: 0.05 }, skill: '朱雀降世', extra: '修炼效率+20%' },
    { name: '鲲鹏水灵', type: '水', quality: '传说', successRate: 0.75, attrs: { 血气加成: 0.15, 防御加成: 0.08 }, skill: '鲲鹏展翅', extra: '寿元消耗-30%' },
    { name: '混沌金莲', type: '金', quality: '传说', successRate: 0.75, attrs: { 攻击加成: 0.1, 防御加成: 0.1, 血气加成: 0.05 }, skill: '混沌归一', extra: '可兼容多种道则' },
    { name: '太虚神土', type: '土', quality: '传说', successRate: 0.75, attrs: { 防御加成: 0.12, 血气加成: 0.08, 减伤加成: 0.15 }, skill: '太虚护体', extra: '减伤额外+15%' }
  ],
  '隐藏区域': [
    { name: '鲲鹏水灵', type: '水', quality: '传说', successRate: 0.75, attrs: { 血气加成: 0.15, 防御加成: 0.08 }, skill: '鲲鹏展翅', extra: '寿元消耗-30%' },
    { name: '混沌金莲', type: '金', quality: '传说', successRate: 0.75, attrs: { 攻击加成: 0.1, 防御加成: 0.1, 血气加成: 0.05 }, skill: '混沌归一', extra: '可兼容多种道则' },
    { name: '太虚神土', type: '土', quality: '传说', successRate: 0.75, attrs: { 防御加成: 0.12, 血气加成: 0.08, 减伤加成: 0.15 }, skill: '太虚护体', extra: '减伤额外+15%' }
  ]
};

const QUALITY_WEIGHTS = {
  '边缘区域': { 普通: 1 },
  '中层区域': { 普通: 0.6, 稀有: 0.4 },
  '深层区域': { 稀有: 0.6, 传说: 0.4 },
  '火道禁区': { 稀有: 0.25, 传说: 0.75 },
  '核心区域': { 传说: 1 },
  '隐藏区域': { 传说: 1 }
};

export const XIANGU_SEED_NAME_ALIASES = Object.freeze({
  世界树嫩芽: '世界树幼苗',
  世界树种子: '世界树幼苗',
  宇宙雏形种子: '宇宙雏形种',
  万道树苗: '万道树',
  青月焰种: '青月焰'
});

function safeRandom(random) {
  const value = Number(random());
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, 1 - Number.EPSILON);
}

function weightedPick(entries, getWeight, random) {
  if (!entries.length) return null;
  const total = entries.reduce((sum, entry) => sum + Math.max(0, Number(getWeight(entry)) || 0), 0);
  if (total <= 0) return entries[Math.floor(safeRandom(random) * entries.length)];
  let roll = safeRandom(random) * total;
  for (const entry of entries) {
    roll -= Math.max(0, Number(getWeight(entry)) || 0);
    if (roll < 0) return entry;
  }
  return entries[entries.length - 1];
}

export function normalizeXianguSeedName(name) {
  const rawName = String(name || '').trim();
  return XIANGU_SEED_NAME_ALIASES[rawName] || rawName;
}

export function getXianguTopSeedCatalog(config = {}) {
  return Array.isArray(config?.道种配置?.顶级道种) ? config.道种配置.顶级道种 : [];
}

export function findXianguTopSeed(config, name) {
  const canonicalName = normalizeXianguSeedName(name);
  return getXianguTopSeedCatalog(config).find(seed => seed.名称 === canonicalName) || null;
}

export function resolveXianguSeedExtremeName(config, levels, name) {
  const topSeed = findXianguTopSeed(config, name);
  if (!topSeed) return null;
  const extremeName = `神火极境·${topSeed.名称}`;
  const shenhuoRealm = (levels || []).find(level => Number(level?.level_id) === 8);
  return shenhuoRealm?.极境?.[extremeName] ? extremeName : null;
}

export function getXianguSeedDropRule(config, location) {
  return config?.道种配置?.区域掉落?.[location] || {};
}

export function shouldDropXianguSeed(config, location, source = 'treasure', random = Math.random) {
  const rule = getXianguSeedDropRule(config, location);
  const chanceKey = source === 'boss' ? 'Boss道种率' : source === 'unique' ? '唯一机缘道种率' : '机缘格道种率';
  return safeRandom(random) < Math.max(0, Math.min(1, Number(rule[chanceKey]) || 0));
}

function getTopSeedCandidates(config, location, fragmentId) {
  const regional = getXianguTopSeedCatalog(config).filter(seed =>
    Array.isArray(seed.出现区域) && seed.出现区域.includes(location)
  );
  if (!fragmentId) return regional;
  return regional.filter(seed => Array.isArray(seed.出现碎片) && seed.出现碎片.includes(fragmentId));
}

function buildTopSeedReward(definition, source, now) {
  return {
    名称: definition.名称,
    品质: definition.品质 || '神话',
    类型: definition.类型,
    融合成功率: Number(definition.融合成功率) || 0.8,
    属性加成: definition.属性加成 || {},
    专属技能: definition.专属技能 || null,
    额外效果: definition.额外效果 || null,
    极境名称: `神火极境·${definition.名称}`,
    顶级道种: true,
    掉落来源: source,
    获得时间: new Date(now).toISOString()
  };
}

function drawRegularSeed(location, random, now) {
  const pool = REGULAR_SEED_POOLS[location] || REGULAR_SEED_POOLS['边缘区域'];
  const weights = QUALITY_WEIGHTS[location] || QUALITY_WEIGHTS['边缘区域'];
  const quality = weightedPick(Object.entries(weights), entry => entry[1], random)?.[0] || '普通';
  const candidates = pool.filter(seed => seed.quality === quality);
  const selected = candidates[Math.floor(safeRandom(random) * candidates.length)] || pool[0];
  return {
    名称: selected.name,
    品质: selected.quality,
    类型: selected.type,
    融合成功率: selected.successRate,
    属性加成: selected.attrs,
    专属技能: selected.skill || null,
    额外效果: selected.extra || null,
    顶级道种: false,
    获得时间: new Date(now).toISOString()
  };
}

export function drawXianguSeed(config, options = {}) {
  const {
    location = '边缘区域',
    fragmentId = null,
    source = 'treasure',
    forceTop = false,
    random = Math.random,
    now = Date.now()
  } = options;
  const rule = getXianguSeedDropRule(config, location);
  const topChanceKey = source === 'boss' ? 'Boss顶级道种占比' : source === 'unique' ? '唯一机缘顶级道种占比' : '顶级道种占比';
  const topChance = forceTop ? 1 : Math.max(0, Math.min(1, Number(rule[topChanceKey]) || 0));
  const topCandidates = getTopSeedCandidates(config, location, fragmentId);

  if (topCandidates.length > 0 && safeRandom(random) < topChance) {
    const selected = weightedPick(topCandidates, seed => seed.权重, random);
    return buildTopSeedReward(selected, source, now);
  }
  return drawRegularSeed(location, random, now);
}

export function grantXianguSeed(player, seed) {
  player.xiangu_seeds = Array.isArray(player.xiangu_seeds) ? player.xiangu_seeds : [];
  player.xiangu_seeds.push({ ...seed, 属性加成: { ...(seed.属性加成 || {}) } });
  if (player.xiangu_run && typeof player.xiangu_run === 'object') {
    const acquiredSeeds = Array.isArray(player.xiangu_run.获得道种)
      ? [...player.xiangu_run.获得道种]
      : [];
    acquiredSeeds.push(seed.名称);
    player.xiangu_run.获得道种 = acquiredSeeds;
  }
  return seed;
}

export function getRegularXianguSeedNames(location) {
  const pool = REGULAR_SEED_POOLS[location] || REGULAR_SEED_POOLS['边缘区域'];
  return pool.map(seed => seed.name);
}
