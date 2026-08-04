const DEFAULT_NEGATIVE_CHANCE = 0.12;
const DEFAULT_RARITY_WEIGHTS = Object.freeze({
  1: 70,
  2: 25,
  3: 5,
});

/**
 * 命格效果的统一契约。配置表出现未注册字段时，覆盖测试会直接失败。
 * mode 只描述数值语义；具体玩法仍需在对应结算点消费。
 */
export const MINGGE_EFFECT_REGISTRY = Object.freeze({
  攻击加成: { mode: 'bonus-rate', consumer: 'battle' },
  防御加成: { mode: 'bonus-rate', consumer: 'battle' },
  生命加成: { mode: 'bonus-rate', consumer: 'battle' },
  暴击加成: { mode: 'chance', consumer: 'battle' },
  速度: { mode: 'initial-flat', consumer: 'initial' },
  生命本源额外: { mode: 'initial-flat', consumer: 'initial' },
  寿元额外: { mode: 'initial-flat', consumer: 'initial' },
  幸运值: { mode: 'initial-percent-point', consumer: 'initial' },
  仙道潜力额外: { mode: 'initial-flat', consumer: 'initial' },
  修炼加成: { mode: 'bonus-rate', consumer: 'cultivation' },
  境界突破成功率: { mode: 'chance', consumer: 'breakthrough' },
  元神修炼加成: { mode: 'bonus-rate', consumer: 'yuanshen' },
  心神额外上限: { mode: 'initial-flat', consumer: 'initial' },
  心神消耗减少: { mode: 'cost-reduction', consumer: 'spirit-heart' },
  心神消耗增加: { mode: 'cost-increase', consumer: 'spirit-heart' },
  悟道收益: { mode: 'bonus-rate', consumer: 'wudao' },
  顿悟概率: { mode: 'chance', consumer: 'wudao' },
  悟道寿元消耗减少: { mode: 'cost-reduction', consumer: 'wudao' },
  悟道寿元消耗增加: { mode: 'cost-increase', consumer: 'wudao' },
  仙道潜力收益: { mode: 'bonus-rate', consumer: 'potential' },
  仙道潜力消耗减少: { mode: 'cost-reduction', consumer: 'potential' },
  仙道潜力消耗增加: { mode: 'cost-increase', consumer: 'potential' },
  采矿加成: { mode: 'bonus-rate', consumer: 'mining' },
  采药加成: { mode: 'bonus-rate', consumer: 'herb-gathering' },
  制符加成: { mode: 'bonus-rate', consumer: 'talisman' },
  炼丹成功率: { mode: 'chance', consumer: 'alchemy' },
  炼丹品质: { mode: 'chance', consumer: 'alchemy' },
  炼器成功率: { mode: 'bonus-rate', consumer: 'forging' },
  炼制装备加成: { mode: 'bonus-rate', consumer: 'forging' },
  锻造经验加成: { mode: 'bonus-rate', consumer: 'forging' },
  签到奖励倍率: { mode: 'direct-multiplier', consumer: 'sign' },
  灵石收益: { mode: 'bonus-rate', consumer: 'currency' },
  源石收益: { mode: 'bonus-rate', consumer: 'source-stone' },
  出售价格倍率: { mode: 'direct-multiplier', consumer: 'selling' },
  秘境加速: { mode: 'flat-seconds', consumer: 'secret-place' },
  寻宝加成: { mode: 'bonus-rate', consumer: 'treasure' },
  复活概率: { mode: 'chance', consumer: 'resurrection' },
  修复道伤代价减少: { mode: 'cost-reduction', consumer: 'repair' },
  修复道伤代价增加: { mode: 'cost-increase', consumer: 'repair' },
  修复本源代价减少: { mode: 'cost-reduction', consumer: 'repair' },
  修复本源代价增加: { mode: 'cost-increase', consumer: 'repair' },
  证道修为减少: { mode: 'cost-reduction', consumer: 'zhengdao' },
  渡劫修为减少: { mode: 'cost-reduction', consumer: 'tribulation' },
  内景地开启概率: { mode: 'chance', consumer: 'inner-world' },
  内景地收益: { mode: 'bonus-rate', consumer: 'inner-world' },
  内景地消耗倍率: { mode: 'direct-multiplier', consumer: 'inner-world' },
});

const POSITIVE_OMENS = {
  1: '命宫深处，一点星火自混沌中亮起。它虽不曾惊动诸天，却已在无声处为你照见前路。',
  2: '紫气横贯九霄，命星穿过层层天阙。沉寂万载的道钟无风自鸣，似在宣告一位非凡之人的到来。',
  3: '诸天星海骤然黯淡，唯有一颗命星贯穿古今。岁月长河为你停滞半息，三千大道同时垂眸。',
};

const NEGATIVE_OMENS = {
  1: '命轮转动之际，一缕灰雾悄然缠上命星。此厄尚浅，却会在漫漫仙途中如影随形。',
  2: '天机忽乱，命宫染煞，九霄之上的道钟发出一声低沉哀鸣。此命有缺，前路注定多劫。',
  3: '你落名仙籍的一刻，天穹浮现无光黑日，岁月长河倒卷三千丈。大道闭门，诸天星辰皆避其锋。',
};

function safeRandom(random) {
  const value = Number(random());
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1 - Number.EPSILON);
}

function weightedRarity(pool, rarityWeights, random) {
  const rarities = [...new Set(pool.map(item => Number(item.rarity)))];
  const weighted = rarities
    .map(rarity => ({ rarity, weight: Number(rarityWeights[rarity]) || 0 }))
    .filter(item => item.weight > 0);

  if (!weighted.length) return rarities[0];

  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = safeRandom(random) * total;
  for (const item of weighted) {
    if (roll < item.weight) return item.rarity;
    roll -= item.weight;
  }
  return weighted[weighted.length - 1].rarity;
}

/**
 * 开局抽取一条命格。先判定正负面，再按稀有度权重抽取，避免传说命格泛滥。
 */
export function drawMingge(minggeList, options = {}) {
  if (!Array.isArray(minggeList) || minggeList.length === 0) {
    throw new Error('命格词条列表为空，无法推演命数');
  }

  const random = options.random || Math.random;
  const negativeChance = Math.min(
    Math.max(Number(options.negativeChance ?? DEFAULT_NEGATIVE_CHANCE), 0),
    1
  );
  const rarityWeights = options.rarityWeights || DEFAULT_RARITY_WEIGHTS;
  const negativePool = minggeList.filter(item => item?.isNegative === true);
  const positivePool = minggeList.filter(item => item?.isNegative !== true);
  const drawNegative = negativePool.length > 0 && safeRandom(random) < negativeChance;
  let pool = drawNegative ? negativePool : positivePool;
  if (!pool.length) pool = minggeList;

  const rarity = weightedRarity(pool, rarityWeights, random);
  const rarityPool = pool.filter(item => Number(item.rarity) === rarity);
  const candidates = rarityPool.length ? rarityPool : pool;
  const index = Math.floor(safeRandom(random) * candidates.length);
  return candidates[index];
}

/** 玩家存档只保存命格身份，效果始终从配置表解析，便于后续平衡调整。 */
export function createPlayerMingge(mingge, obtainedAt = Date.now()) {
  if (!mingge?.id) throw new Error('无效命格，无法写入玩家命宫');
  return {
    id: mingge.id,
    name: mingge.name,
    rarity: mingge.rarity,
    rarityName: mingge.rarityName,
    category: mingge.category,
    isNegative: mingge.isNegative === true,
    severity: Number(mingge.severity) || 0,
    obtainedAt,
    初始效果已应用: false,
  };
}

export function hasPlayerMingge(player) {
  const identity = player?.命格;
  return typeof identity === 'string'
    ? identity.trim().length > 0
    : Boolean(identity?.id);
}

export function findPlayerMingge(player, minggeList) {
  const identity = player?.命格;
  const id = typeof identity === 'string' ? identity : identity?.id;
  if (!id || !Array.isArray(minggeList)) return null;
  return minggeList.find(item => item.id === id) || null;
}

export function getMinggeEffects(player, minggeList) {
  const identities = [
    player?.命格,
    ...(Array.isArray(player?.附加命格) ? player.附加命格 : []),
  ].filter(Boolean);
  if (!identities.length || !Array.isArray(minggeList)) return {};

  const byId = new Map(minggeList.map(item => [item.id, item]));
  const merged = {};
  for (const identity of identities) {
    const id = typeof identity === 'string' ? identity : identity?.id;
    const effects = byId.get(id)?.effects || {};
    for (const [key, value] of Object.entries(effects)) {
      const mode = MINGGE_EFFECT_REGISTRY[key]?.mode;
      if (mode === 'boolean') merged[key] = Boolean(merged[key] || value);
      else if (mode === 'direct-multiplier') merged[key] = (merged[key] ?? 1) * Number(value);
      else if (Number.isFinite(Number(value))) merged[key] = (Number(merged[key]) || 0) + Number(value);
      else merged[key] = value;
    }
  }
  return merged;
}

export function getMinggeDirectMultiplier(effects, key, fallback = 1) {
  const value = Number(effects?.[key]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function getMinggeBonusMultiplier(effects, key) {
  const value = Number(effects?.[key]);
  return Math.max(0, 1 + (Number.isFinite(value) ? value : 0));
}

export function getMinggeEffectNumber(effects, key, fallback = 0) {
  const value = Number(effects?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

export function calculateMinggeGain(amount, effects, key) {
  const value = Number(amount) || 0;
  if (value <= 0) return Math.trunc(value);
  return Math.max(0, Math.floor(value * getMinggeBonusMultiplier(effects, key)));
}

export function calculateMinggeCurrencyGain(amount, effects, options = {}) {
  let gain = calculateMinggeGain(amount, effects, '灵石收益');
  if (gain <= 0) return gain;
  if (options.source === 'sale') {
    gain = Math.floor(gain * getMinggeDirectMultiplier(effects, '出售价格倍率'));
  }
  return Math.max(0, gain);
}

export function calculateMinggeSourceGain(amount, effects) {
  return calculateMinggeGain(amount, effects, '源石收益');
}

/** 按数学期望随机取整，避免小额产出因 floor 永远吃不到百分比加成。 */
export function calculateMinggeYield(amount, effects, key, random = Math.random) {
  const value = Math.max(0, Number(amount) || 0);
  const expected = value * getMinggeBonusMultiplier(effects, key);
  const integer = Math.floor(expected);
  const fraction = expected - integer;
  return integer + (safeRandom(random) < fraction ? 1 : 0);
}

export function calculateMinggeChance(baseChance, effects, key, options = {}) {
  const min = Number.isFinite(Number(options.min)) ? Number(options.min) : 0;
  const max = Number.isFinite(Number(options.max)) ? Number(options.max) : 1;
  const chance = (Number(baseChance) || 0) + getMinggeEffectNumber(effects, key);
  return Math.min(Math.max(chance, min), max);
}

export function calculateMinggeCost(
  baseCost,
  effects,
  reductionKey,
  increaseKey,
  options = {}
) {
  const base = Math.max(0, Number(baseCost) || 0);
  if (base === 0) return 0;
  const reduction = Math.max(0, getMinggeEffectNumber(effects, reductionKey));
  const increase = increaseKey
    ? Math.max(0, getMinggeEffectNumber(effects, increaseKey))
    : 0;
  const minMultiplier = Number.isFinite(Number(options.minMultiplier))
    ? Number(options.minMultiplier)
    : 0;
  const maxMultiplier = Number.isFinite(Number(options.maxMultiplier))
    ? Number(options.maxMultiplier)
    : 3;
  const multiplier = Math.min(
    Math.max(1 - reduction + increase, minMultiplier),
    maxMultiplier
  );
  const adjusted = base * multiplier;
  const rounded = multiplier <= 1 ? Math.floor(adjusted) : Math.ceil(adjusted);
  const minimum = Number.isFinite(Number(options.minimum))
    ? Math.max(0, Number(options.minimum))
    : 0;
  return Math.max(minimum, rounded);
}

export function calculateMinggePotentialGain(amount, effects) {
  return calculateMinggeGain(amount, effects, '仙道潜力收益');
}

export function calculateMinggePotentialCost(amount, effects) {
  return calculateMinggeCost(
    amount,
    effects,
    '仙道潜力消耗减少',
    '仙道潜力消耗增加'
  );
}

export function grantMinggePotential(player, effects, amount) {
  const gain = calculateMinggePotentialGain(amount, effects);
  player.仙道潜力 = Math.max(0, (Number(player.仙道潜力) || 0) + gain);
  return gain;
}

export function consumeMinggePotential(player, effects, amount) {
  const cost = calculateMinggePotentialCost(amount, effects);
  player.仙道潜力 = Math.max(0, (Number(player.仙道潜力) || 0) - cost);
  return cost;
}

export function getMinggeSecretPlaceReductionMs(effects) {
  return Math.max(0, getMinggeEffectNumber(effects, '秘境加速')) * 1000;
}

/**
 * 应用只应在获得命格时结算一次的字段，重复调用不会重复叠加。
 */
export function applyInitialMinggeEffects(player, mingge, obtainedAt = Date.now()) {
  if (!player || typeof player !== 'object') throw new Error('玩家数据无效');

  const previous = player.命格;
  const alreadyApplied = previous?.id === mingge.id && previous?.初始效果已应用 === true;
  const stored = createPlayerMingge(mingge, previous?.obtainedAt ?? obtainedAt);
  if (alreadyApplied) {
    stored.初始效果已应用 = true;
    player.命格 = stored;
    return player;
  }

  const effects = mingge.effects || {};
  player.仙道潜力 = Math.max(
    0,
    (Number(player.仙道潜力) || 0) + (Number(effects.仙道潜力额外) || 0)
  );
  player.生命本源 = Math.max(
    1,
    (Number(player.生命本源) || 0) + (Number(effects.生命本源额外) || 0)
  );
  player.寿元 = Math.max(
    1,
    (Number(player.寿元) || 0) + (Number(effects.寿元额外) || 0)
  );
  player.速度 = Math.max(
    1,
    (Number(player.速度) || 0) + (Number(effects.速度) || 0)
  );
  player.幸运 = (Number(player.幸运) || 0) +
    (Number(effects.幸运值) || 0) / 100;
  const spiritHeartGain = Math.max(0, Math.trunc(Number(effects.心神额外上限) || 0));
  player.心神额外上限 = Math.max(
    0,
    (Number(player.心神额外上限) || 0) + spiritHeartGain
  );
  if (spiritHeartGain && Number.isFinite(Number(player.心神))) {
    player.心神 = Math.max(0, Number(player.心神) + spiritHeartGain);
  }
  stored.初始效果已应用 = true;
  player.命格 = stored;
  return player;
}

/**
 * 回滚某条命格在「获得时」一次性结算的字段（速度/仙道潜力/生命本源/寿元/幸运/心神）。
 * 与 applyInitialMinggeEffects 完全对称，仅做减法，不掉用 stored 赋值。
 * 用于重抽命格时先减回旧值，再叠加新值，避免速度等属性只增不减地累加。
 * @param {object} effects 命格配置里的 effects 对象（含 速度 / 仙道潜力额外 等字段）
 */
export function rollbackInitialMinggeEffects(player, effects) {
  const e = effects || {};
  player.仙道潜力 = Math.max(0, (Number(player.仙道潜力) || 0) - (Number(e.仙道潜力额外) || 0));
  player.生命本源 = Math.max(1, (Number(player.生命本源) || 0) - (Number(e.生命本源额外) || 0));
  player.寿元 = Math.max(1, (Number(player.寿元) || 0) - (Number(e.寿元额外) || 0));
  player.速度 = Math.max(1, (Number(player.速度) || 0) - (Number(e.速度) || 0));
  player.幸运 = (Number(player.幸运) || 0) - (Number(e.幸运值) || 0) / 100;
  const spiritHeartGain = Math.max(0, Math.trunc(Number(e.心神额外上限) || 0));
  player.心神额外上限 = Math.max(0, (Number(player.心神额外上限) || 0) - spiritHeartGain);
  if (spiritHeartGain && Number.isFinite(Number(player.心神))) {
    player.心神 = Math.max(0, Number(player.心神) - spiritHeartGain);
  }
  return player;
}

/**
 * 应用某条命格在「获得时」一次性结算的字段，逻辑与 applyInitialMinggeEffects 内部一致，
 * 但去掉 alreadyApplied 守卫、不赋值 player.命格，专供重抽「减旧加新」复用。
 * @param {object} effects 命格配置里的 effects 对象
 */
export function applyInitialMinggeEffectsRaw(player, effects) {
  const e = effects || {};
  player.仙道潜力 = Math.max(0, (Number(player.仙道潜力) || 0) + (Number(e.仙道潜力额外) || 0));
  player.生命本源 = Math.max(1, (Number(player.生命本源) || 0) + (Number(e.生命本源额外) || 0));
  player.寿元 = Math.max(1, (Number(player.寿元) || 0) + (Number(e.寿元额外) || 0));
  player.速度 = Math.max(1, (Number(player.速度) || 0) + (Number(e.速度) || 0));
  player.幸运 = (Number(player.幸运) || 0) + (Number(e.幸运值) || 0) / 100;
  const spiritHeartGain = Math.max(0, Math.trunc(Number(e.心神额外上限) || 0));
  player.心神额外上限 = Math.max(0, (Number(player.心神额外上限) || 0) + spiritHeartGain);
  if (spiritHeartGain && Number.isFinite(Number(player.心神))) {
    player.心神 = Math.max(0, Number(player.心神) + spiritHeartGain);
  }
  return player;
}

function safeRate(value) {
  return Math.max(Number(value) || 0, -0.95);
}

/**
 * 命格的攻防生命倍率只作用于练气、炼体、秘境、仙古四体系基础值。
 * 固定加成、极境、装备等来源必须在调用此函数后另行加算。
 */
export function applyMinggeFourRealmMultipliers(baseStats, effects = {}) {
  const bonus = calculateMinggeFourRealmBonus(baseStats, effects);
  return {
    攻击: (Number(baseStats?.攻击) || 0) + bonus.攻击,
    防御: (Number(baseStats?.防御) || 0) + bonus.防御,
    血量: (Number(baseStats?.血量) || 0) + bonus.血量,
  };
}

export function calculateMinggeFourRealmBonus(baseStats, effects = {}) {
  return {
    攻击: Math.trunc((Number(baseStats?.攻击) || 0) * safeRate(effects.攻击加成)),
    防御: Math.trunc((Number(baseStats?.防御) || 0) * safeRate(effects.防御加成)),
    血量: Math.trunc((Number(baseStats?.血量) || 0) * safeRate(effects.生命加成)),
  };
}

export function formatMinggeEffectValue(key, value) {
  if (typeof value === 'boolean') return value ? '开启' : '关闭';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (key === '秘境加速') return `${number > 0 ? '+' : ''}${number}秒`;
  if (key.endsWith('倍率')) return `${number.toFixed(2).replace(/\.00$/, '')}倍`;
  if (/(减少|增加)$/.test(key)) return `${Math.abs(number * 100).toFixed(0)}%`;
  if (/(加成|成功率|品质|收益|概率)$/.test(key)) {
    return `${number > 0 ? '+' : ''}${(number * 100).toFixed(0)}%`;
  }
  return `${number > 0 ? '+' : ''}${number}`;
}

export function buildMinggeAtlasData(minggeList, player = null) {
  const list = Array.isArray(minggeList) ? minggeList : [];
  const identities = [
    player?.命格,
    ...(Array.isArray(player?.附加命格) ? player.附加命格 : []),
  ].filter(Boolean);
  const currentKeys = new Set(identities.map(identity =>
    typeof identity === 'string' ? identity : identity?.id
  ));
  const currentNames = identities.map(identity => {
    if (typeof identity === 'string') {
      return list.find(item => item.id === identity || item.name === identity)?.name || identity;
    }
    return identity?.name || list.find(item => item.id === identity?.id)?.name;
  }).filter(Boolean);
  const entries = list.map(item => ({
    ...item,
    isCurrent: currentKeys.has(item.id) || currentKeys.has(item.name),
    severityName: item.isNegative
      ? ['微瑕', '深重', '禁忌'][Math.min(Math.max(Number(item.severity) || 1, 1), 3) - 1]
      : '',
    effectEntries: Object.entries(item.effects || {}).map(([name, value]) => ({
      name,
      value: formatMinggeEffectValue(name, value),
    })),
  }));
  const definitions = [
    { title: '传说命格', subtitle: '命数绝巅，万中无一', className: 'legendary', rarity: 3 },
    { title: '稀有命格', subtitle: '天命垂青，自有不凡', className: 'rare', rarity: 2 },
    { title: '普通命格', subtitle: '起于微末，亦可争渡', className: 'normal', rarity: 1 },
    { title: '负面命格', subtitle: '天命有缺，前路多劫', className: 'negative', negative: true },
  ];
  const groups = definitions.map(group => ({
    ...group,
    items: entries.filter(item => group.negative
      ? item.isNegative === true
      : item.isNegative !== true && Number(item.rarity) === group.rarity),
  })).filter(group => group.items.length > 0);

  return {
    title: '命格图鉴',
    currentName: currentNames.join(' · ') || '尚未显化',
    currentCount: identities.length,
    fateLimit: Math.max(1, Math.trunc(Number(player?.命格词条上限) || 1)),
    hasCurrent: identities.length > 0,
    groups,
    summary: {
      total: entries.length,
      legendary: entries.filter(item => item.isNegative !== true && Number(item.rarity) === 3).length,
      rare: entries.filter(item => item.isNegative !== true && Number(item.rarity) === 2).length,
      normal: entries.filter(item => item.isNegative !== true && Number(item.rarity) === 1).length,
      negative: entries.filter(item => item.isNegative === true).length,
    },
  };
}

export function formatMinggeDrawMessage(mingge, playerName = '') {
  const isNegative = mingge?.isNegative === true;
  const rarity = Number(mingge?.rarity) || 1;
  const severity = Math.min(Math.max(Number(mingge?.severity) || rarity, 1), 3);
  const omen = isNegative
    ? NEGATIVE_OMENS[severity]
    : POSITIVE_OMENS[rarity] || POSITIVE_OMENS[1];
  const effectLines = Object.entries(mingge?.effects || {}).map(
    ([key, value]) => `  ${key}：${formatMinggeEffectValue(key, value)}`
  );
  const fateRank = isNegative
    ? `${mingge.rarityName}·厄命${severity === 3 ? '禁忌' : severity === 2 ? '深重' : '微瑕'}`
    : `${mingge.rarityName}·${mingge.category}`;
  const opening = playerName
    ? `当【${playerName}】的真名烙入仙籍，沉寂无尽岁月的诸天命盘轰然复苏。`
    : '当你的真名烙入仙籍，沉寂无尽岁月的诸天命盘轰然复苏。';
  const ending = isNegative
    ? '「天命有缺，亦非绝路。若敢以凡躯逆伐诸天，厄命终可成为踏碎大道的第一块阶石。」'
    : '「命由天授，道由己争。今日命星归位，自此万劫在前，亦当一念横渡。」';

  return [
    '【诸天命盘·命格初定】',
    '',
    opening,
    omen,
    '一道超越因果的目光自岁月尽头垂落，在你的神魂最深处刻下一枚永世不灭的命印。',
    '',
    `命格：【${mingge.name}】`,
    `命阶：【${fateRank}】`,
    `命格批言：${mingge.desc}`,
    '',
    '大道铭文：',
    ...(effectLines.length ? effectLines : ['  此命不显于外，唯待岁月印证']),
    '',
    ending,
  ].join('\n');
}

export { DEFAULT_NEGATIVE_CHANCE, DEFAULT_RARITY_WEIGHTS };
