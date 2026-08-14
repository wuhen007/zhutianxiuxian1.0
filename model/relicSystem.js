import { randomUUID } from 'node:crypto';

export const RELIC_PARTS = Object.freeze(['武器', '护具', '法宝']);
export const RELIC_EXPANSION_ITEM = '界纹拓印';
export const MAX_RELIC_BAG_SIZE = 200;

export const RELIC_QUALITIES = Object.freeze({
  凡耀: Object.freeze({ affixCount: 1, rarity: 1 }),
  灵玄: Object.freeze({ affixCount: 2, rarity: 2 }),
  至圣: Object.freeze({ affixCount: 3, rarity: 3 }),
  大道: Object.freeze({ affixCount: 4, rarity: 4 }),
  超脱: Object.freeze({ affixCount: 5, rarity: 5 }),
});

export const RELIC_AFFIXES = Object.freeze({
  迅行: Object.freeze({ field: '速度加成', min: 0.02, max: 0.04 }),
  护道: Object.freeze({ field: '开战护盾率', min: 0.04, max: 0.08 }),
  武极: Object.freeze({ field: '近战伤害加成', min: 0.03, max: 0.06 }),
  万法: Object.freeze({ field: '神通伤害加成', min: 0.03, max: 0.06 }),
  金身: Object.freeze({ field: '近战伤害减免', min: 0.02, max: 0.05 }),
  破法: Object.freeze({ field: '神通伤害减免', min: 0.02, max: 0.05 }),
  洞虚: Object.freeze({ field: '暴击率', min: 0.01, max: 0.03 }),
  绝杀: Object.freeze({ field: '暴击伤害', min: 0.04, max: 0.08 }),
  破界: Object.freeze({ field: '穿透', min: 0.01, max: 0.03 }),
  逍遥: Object.freeze({ field: '闪避率', min: 0.01, max: 0.02 }),
  生生: Object.freeze({ field: '治疗效果加成', min: 0.03, max: 0.06 }),
  饮血: Object.freeze({ field: '吸血率', min: 0.01, max: 0.03 }),
});

export const RELIC_SETS = Object.freeze({
  荒古战血: Object.freeze({
    description: '战血沸腾，专精近身征伐。',
    effects: Object.freeze({ 近战伤害加成: 0.12, 暴击率: 0.03 }),
  }),
  万法天章: Object.freeze({
    description: '万法归流，强化神通与破界之力。',
    effects: Object.freeze({ 神通伤害加成: 0.12, 穿透: 0.03 }),
  }),
  玄黄不灭: Object.freeze({
    description: '玄黄护体，开战凝盾并抵御两类伤害。',
    effects: Object.freeze({ 开战护盾率: 0.15, 近战伤害减免: 0.05, 神通伤害减免: 0.05 }),
  }),
  虚空行者: Object.freeze({
    description: '踏空而行，以极速与闪避争夺先机。',
    effects: Object.freeze({ 速度加成: 0.08, 闪避率: 0.03 }),
  }),
  阴阳道图: Object.freeze({
    description: '阴阳流转，兼顾近战与神通抗性。',
    effects: Object.freeze({ 近战伤害减免: 0.08, 神通伤害减免: 0.08 }),
  }),
  诸世归一: Object.freeze({
    description: '诸世道韵归于一身，攻守均衡。',
    effects: Object.freeze({ 全伤害类型加成: 0.06, 全类型减免: 0.04 }),
  }),
});

export const FISH_KING_RELIC_QUALITY_WEIGHTS = Object.freeze([
  Object.freeze({ quality: '凡耀', weight: 0.5 }),
  Object.freeze({ quality: '灵玄', weight: 0.28 }),
  Object.freeze({ quality: '至圣', weight: 0.15 }),
  Object.freeze({ quality: '大道', weight: 0.06 }),
  Object.freeze({ quality: '超脱', weight: 0.01 }),
]);

export const FISH_KING_RELIC_SETS = Object.freeze({
  凡间: '玄黄不灭',
  仙界: '万法天章',
  遮天位面: '荒古战血',
  下界八域: '阴阳道图',
  九天十地: '诸世归一',
  太初星墟: '虚空行者',
});

export const RELIC_EFFECT_CAPS = Object.freeze({
  速度加成: 0.25,
  开战护盾率: 0.3,
  近战伤害加成: 0.4,
  神通伤害加成: 0.4,
  近战伤害减免: 0.35,
  神通伤害减免: 0.35,
  暴击率: 0.15,
  暴击伤害: 0.4,
  穿透: 0.15,
  闪避率: 0.15,
  治疗效果加成: 0.3,
  吸血率: 0.15,
  全伤害类型加成: 0.15,
  全类型减免: 0.15,
});

const PERSISTED_COMBAT_FIELDS = Object.freeze([
  '近战伤害加成',
  '神通伤害加成',
  '近战伤害减免',
  '神通伤害减免',
  '穿透',
  '闪避率',
  '治疗效果加成',
  '吸血率',
  '全伤害类型加成',
  '全类型减免',
]);

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function randomIndex(length, random) {
  return Math.min(length - 1, Math.max(0, Math.floor(finite(random(), 0) * length)));
}

function rollValue(definition, random) {
  const value = definition.min + (definition.max - definition.min) * finite(random(), 0);
  return Number(value.toFixed(4));
}

function normalizeRelic(relic) {
  if (!relic || typeof relic !== 'object') return null;
  if (!RELIC_QUALITIES[relic.品质] || !RELIC_SETS[relic.套装]) return null;
  const affixes = Array.isArray(relic.副词条)
    ? relic.副词条
      .filter(item => RELIC_AFFIXES[item?.name] && Number.isFinite(Number(item?.value)))
      .slice(0, RELIC_QUALITIES[relic.品质].affixCount)
      .map(item => ({ name: item.name, value: Number(item.value) }))
    : [];
  return {
    id: String(relic.id || randomUUID()),
    name: String(relic.name || `${relic.套装}遗珍`),
    品质: relic.品质,
    套装: relic.套装,
    副词条: affixes,
    获得时间: finite(relic.获得时间, Date.now()),
  };
}

export function createEmptyRelicState() {
  return {
    version: 1,
    背包: [],
    铭刻: {
      武器: [null, null],
      护具: [null, null],
      法宝: [null, null],
    },
    拓展: { 武器: false, 护具: false, 法宝: false },
  };
}

export function normalizeRelicState(source) {
  const empty = createEmptyRelicState();
  const current = source && typeof source === 'object' ? source : {};
  empty.背包 = (Array.isArray(current.背包) ? current.背包 : [])
    .map(normalizeRelic)
    .filter(Boolean)
    .slice(0, MAX_RELIC_BAG_SIZE);
  for (const part of RELIC_PARTS) {
    const slots = Array.isArray(current.铭刻?.[part]) ? current.铭刻[part] : [];
    empty.铭刻[part] = [normalizeRelic(slots[0]), normalizeRelic(slots[1])];
    empty.拓展[part] = Boolean(current.拓展?.[part]);
    if (!empty.拓展[part] && empty.铭刻[part][1]) {
      if (empty.背包.length < MAX_RELIC_BAG_SIZE) empty.背包.push(empty.铭刻[part][1]);
      empty.铭刻[part][1] = null;
    }
  }
  return empty;
}

export function createRelic({ quality, setName, random = Math.random, id } = {}) {
  const qualityConfig = RELIC_QUALITIES[quality];
  if (!qualityConfig) throw new Error(`未知遗珍品质：${quality || '空'}`);
  if (!RELIC_SETS[setName]) throw new Error(`未知遗珍套装：${setName || '空'}`);
  const pool = Object.keys(RELIC_AFFIXES);
  const affixes = [];
  for (let index = 0; index < qualityConfig.affixCount; index++) {
    const selected = pool.splice(randomIndex(pool.length, random), 1)[0];
    affixes.push({ name: selected, value: rollValue(RELIC_AFFIXES[selected], random) });
  }
  return {
    id: String(id || randomUUID()),
    name: `${setName}遗珍`,
    品质: quality,
    套装: setName,
    副词条: affixes,
    获得时间: Date.now(),
  };
}

export function rollFishKingRelicQuality(random = Math.random) {
  const roll = Math.min(0.999999999, Math.max(0, finite(random(), 0)));
  let cumulative = 0;
  for (const entry of FISH_KING_RELIC_QUALITY_WEIGHTS) {
    cumulative += entry.weight;
    if (roll < cumulative) return entry.quality;
  }
  return FISH_KING_RELIC_QUALITY_WEIGHTS.at(-1).quality;
}

export function createFishKingRelic({ plane, random = Math.random, id } = {}) {
  const quality = rollFishKingRelicQuality(random);
  const setNames = Object.keys(RELIC_SETS);
  const setName = FISH_KING_RELIC_SETS[plane]
    || setNames[randomIndex(setNames.length, random)];
  return createRelic({ quality, setName, random, id });
}

export function addRelicToBag(state, relic) {
  const current = normalizeRelicState(state);
  if (current.背包.length >= MAX_RELIC_BAG_SIZE) throw new Error('遗珍背包已满');
  const normalized = normalizeRelic(relic);
  if (!normalized) throw new Error('遗珍数据无效');
  current.背包.push(normalized);
  return current;
}

export function engraveRelic(state, bagIndex, part, slotNumber = 1) {
  const current = normalizeRelicState(state);
  if (!RELIC_PARTS.includes(part)) throw new Error('铭刻部位必须是武器、护具或法宝');
  const slotIndex = Number(slotNumber) - 1;
  if (![0, 1].includes(slotIndex)) throw new Error('铭刻位只能是1或2');
  if (slotIndex === 1 && !current.拓展[part]) throw new Error(`${part}的第二铭刻位尚未拓展`);
  const index = Number(bagIndex) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= current.背包.length) {
    throw new Error('遗珍背包中没有这个编号');
  }
  const relic = current.背包.splice(index, 1)[0];
  const replaced = current.铭刻[part][slotIndex];
  current.铭刻[part][slotIndex] = relic;
  if (replaced) current.背包.push(replaced);
  return { state: current, relic, replaced };
}

export function removeEngravedRelic(state, part, slotNumber = 1) {
  const current = normalizeRelicState(state);
  if (!RELIC_PARTS.includes(part)) throw new Error('卸下部位必须是武器、护具或法宝');
  const slotIndex = Number(slotNumber) - 1;
  if (![0, 1].includes(slotIndex)) throw new Error('铭刻位只能是1或2');
  const relic = current.铭刻[part][slotIndex];
  if (!relic) throw new Error(`${part}第${slotNumber}铭刻位没有遗珍`);
  if (current.背包.length >= MAX_RELIC_BAG_SIZE) throw new Error('遗珍背包已满，无法卸下');
  current.铭刻[part][slotIndex] = null;
  current.背包.push(relic);
  return { state: current, relic };
}

export function expandRelicSlot(state, part) {
  const current = normalizeRelicState(state);
  if (!RELIC_PARTS.includes(part)) throw new Error('拓展部位必须是武器、护具或法宝');
  if (current.拓展[part]) throw new Error(`${part}的第二铭刻位已经开启`);
  current.拓展[part] = true;
  return current;
}

export function getEngravedRelics(state) {
  const current = normalizeRelicState(state);
  return RELIC_PARTS.flatMap(part => current.铭刻[part]
    .map((relic, index) => ({ part, slot: index + 1, relic }))
    .filter(item => item.relic));
}

export function getActiveRelicResonances(state) {
  const current = normalizeRelicState(state);
  const setsByPart = RELIC_PARTS.map(part => new Set(
    current.铭刻[part].filter(Boolean).map(relic => relic.套装)
  ));
  return Object.keys(RELIC_SETS).filter(setName => setsByPart.every(sets => sets.has(setName)));
}

export function calculateRelicEffects(source) {
  const state = normalizeRelicState(source?.遗珍 || source);
  const effects = {};
  const add = (field, value) => {
    effects[field] = finite(effects[field]) + finite(value);
  };
  for (const { relic } of getEngravedRelics(state)) {
    for (const affix of relic.副词条) {
      const definition = RELIC_AFFIXES[affix.name];
      if (definition) add(definition.field, affix.value);
    }
  }
  const resonances = getActiveRelicResonances(state);
  for (const setName of resonances) {
    for (const [field, value] of Object.entries(RELIC_SETS[setName].effects)) add(field, value);
  }
  for (const [field, cap] of Object.entries(RELIC_EFFECT_CAPS)) {
    effects[field] = Math.min(cap, Math.max(0, finite(effects[field])));
  }
  return { effects, resonances, count: getEngravedRelics(state).length };
}

export function applyRelicEffectsToPlayer(player, source, { rebuiltCombatStats = false } = {}) {
  if (!player || typeof player !== 'object') return calculateRelicEffects(source);
  const summary = calculateRelicEffects(source);
  const effects = summary.effects;
  const previous = player._遗珍属性 || {};
  const baseSpeed = Math.max(1, finite(player.速度, 100) - finite(previous.速度增量));
  const speedIncrease = Math.trunc(baseSpeed * finite(effects.速度加成));
  player.速度 = baseSpeed + speedIncrease;

  for (const field of PERSISTED_COMBAT_FIELDS) {
    const base = finite(player[field]) - finite(previous.战斗属性?.[field]);
    player[field] = base + finite(effects[field]);
  }

  const previousCritRate = rebuiltCombatStats ? 0 : finite(previous.暴击率);
  const previousCritDamage = rebuiltCombatStats ? 0 : finite(previous.暴击伤害);
  player.暴击率 = finite(player.暴击率) - previousCritRate + finite(effects.暴击率);
  player.暴击伤害 = finite(player.暴击伤害, 1.5) - previousCritDamage + finite(effects.暴击伤害);
  player.遗珍开战护盾率 = finite(effects.开战护盾率);
  player._遗珍属性 = {
    速度增量: speedIncrease,
    暴击率: finite(effects.暴击率),
    暴击伤害: finite(effects.暴击伤害),
    战斗属性: Object.fromEntries(PERSISTED_COMBAT_FIELDS.map(field => [field, finite(effects[field])])),
    共鸣: summary.resonances,
  };
  return summary;
}

export function applyRelicBattleOpening(unit, shieldField = '护盾值') {
  if (!unit || unit._遗珍开战护盾已应用) return { amount: 0, message: '' };
  unit._遗珍开战护盾已应用 = true;
  const rate = Math.min(RELIC_EFFECT_CAPS.开战护盾率, Math.max(0, finite(unit.遗珍开战护盾率)));
  const amount = Math.trunc(Math.max(0, finite(unit.血量上限)) * rate);
  if (amount <= 0) return { amount: 0, message: '' };
  unit[shieldField] = Math.max(0, finite(unit[shieldField])) + amount;
  return {
    amount,
    message: `【遗珍护道】${unit.名号 || '修士'}开战获得${amount}点护盾。`,
  };
}

export function formatRelicAffix(affix) {
  const definition = RELIC_AFFIXES[affix?.name];
  if (!definition) return '';
  return `${affix.name}·${definition.field}+${(finite(affix.value) * 100).toFixed(1)}%`;
}

export function formatRelicEffects(effects) {
  return Object.entries(effects || {})
    .filter(([, value]) => finite(value) > 0)
    .map(([field, value]) => `${field}+${(finite(value) * 100).toFixed(1)}%`);
}
