import { ENDLESS_TREASURES } from './endlessTreasure.js';

const ABILITY_TAGS = Object.freeze(['爆发', '生存', '速度', '召唤', '火焰', '规则']);
// 本命专属的霜月领域免疫封宝，天象仍从原有至宝中准确封禁两件。
const SEALABLE_TREASURES = ENDLESS_TREASURES.filter(treasure => !treasure.intrinsic);

const PHENOMENA = Object.freeze([
  Object.freeze({
    id: 'sealed_treasures',
    name: '黯星封宝',
    tone: 'danger',
    description: '两件无尽至宝被黯星遮蔽，本日开局后不会提供属性、形态与战斗技能。',
  }),
  Object.freeze({
    id: 'ability_ebb',
    name: '万法低潮',
    tone: 'danger',
    abilityMultiplier: 0.75,
  }),
  Object.freeze({
    id: 'ability_surge',
    name: '诸天共鸣',
    tone: 'jade',
    abilityMultiplier: 1.25,
  }),
  Object.freeze({
    id: 'trace_drought',
    name: '道痕枯潮',
    tone: 'danger',
    tokenMultiplier: 0.7,
    description: '劫境道痕收益降低30%。',
  }),
  Object.freeze({
    id: 'shop_inflation',
    name: '天市炽盛',
    tone: 'danger',
    shopPriceMultiplier: 1.25,
    description: '无尽商店价格上涨25%。',
  }),
  Object.freeze({
    id: 'shop_discount',
    name: '万宝潮生',
    tone: 'gold',
    shopPriceMultiplier: 0.8,
    description: '无尽商店价格降低20%。',
  }),
  Object.freeze({
    id: 'shop_expansion',
    name: '商路拓界',
    tone: 'jade',
    shopLimitRate: 0.2,
    description: '所有限购商品今日额外增加20%额度，最低增加1件。',
  }),
]);

function dateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function hash(text) {
  let value = 2166136261;
  for (const char of text) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function getDailyEndlessCelestial(now = new Date()) {
  const day = dateKey(now);
  const seed = hash(day);
  const phenomenon = PHENOMENA[seed % PHENOMENA.length];
  const result = { ...phenomenon, dateKey: day };
  if (phenomenon.abilityMultiplier) {
    result.abilityTag = ABILITY_TAGS[(seed >>> 4) % ABILITY_TAGS.length];
    const verb = phenomenon.abilityMultiplier > 1 ? '增强25%' : '削弱25%';
    result.description = `所有带有【${result.abilityTag}】标签的能力效果与战技伤害${verb}。`;
  }
  if (phenomenon.id === 'sealed_treasures') {
    const first = seed % SEALABLE_TREASURES.length;
    const second = (first + 1 + ((seed >>> 8) % (SEALABLE_TREASURES.length - 1))) % SEALABLE_TREASURES.length;
    const disabled = [SEALABLE_TREASURES[first], SEALABLE_TREASURES[second]];
    result.disabledTreasureIds = disabled.map(item => item.id);
    result.disabledTreasureNames = disabled.map(item => item.name);
    result.description = `【${result.disabledTreasureNames.join('】、【')}】本日失效，不提供属性、形态与战斗技能。`;
  }
  return result;
}

export function getEndlessCelestialPrice(basePrice, celestial = null) {
  return Math.max(
    1,
    Math.round(Number(basePrice || 0) * Number(celestial?.shopPriceMultiplier || 1))
  );
}

export function getEndlessCelestialAbilityMultiplier(celestial, ability) {
  if (!celestial?.abilityTag || !ability?.tags?.includes(celestial.abilityTag)) return 1;
  return Math.max(0, Number(celestial.abilityMultiplier) || 1);
}

export function formatEndlessCelestial(celestial) {
  const current = celestial || getDailyEndlessCelestial();
  return [
    `【今日天象·${current.name}】`,
    `日期：${current.dateKey}`,
    current.description,
    '天象对当日开启的整局劫境生效；已在进行中的队伍不随日期切换。',
  ];
}
