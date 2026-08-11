const NORMAL_TECHNIQUE = '圣体秘术';
const ULTIMATE_TECHNIQUE = '终极圣体秘术';
const NORMAL_TYPES = new Set(['圣体', '小成圣体', '圣体道胎', '大成圣体']);
const NORMAL_REALMS = ['轮海', '道宫', '四极', '化龙'];
const IMMORTAL_REALMS = {
  仙台一层天: 1,
  仙台二层天: 1.2,
  仙台三层天: 1.5,
  仙台四层天: 2,
  仙台五层天: 2.5,
  仙台六层天: 3,
};

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const sumFields = (source, fields) => fields.reduce((sum, field) => sum + Math.max(0, number(source?.[field])), 0);
const hasProgress = source => Object.values(source || {}).some(value => number(value) > 0);

function deductAttributes(player, deduction, minimums) {
  if (deduction <= 0) return;

  for (const field of ['攻击加成', '防御加成', '生命加成']) {
    if (player[field] !== undefined) player[field] = Math.max(0, number(player[field]) - deduction);
  }

  const directFields = [
    ['攻击', '攻击'],
    ['防御', '防御'],
    ['血量上限', '血量上限'],
  ];
  for (const [field, minimumField] of directFields) {
    if (player[field] !== undefined) {
      player[field] = Math.max(number(minimums?.[minimumField]), number(player[field]) - deduction);
    }
  }

  if (player.当前血量 !== undefined && player.血量上限 !== undefined) {
    player.当前血量 = Math.min(number(player.当前血量), number(player.血量上限));
  }
}

function inferImmortalCompletionBonus(progress) {
  return Object.entries(IMMORTAL_REALMS).reduce((sum, [realm, multiplier]) => {
    if (number(progress?.[realm]) < 100) return sum;
    return sum + Math.round(90_000_000 * multiplier * 0.5);
  }, 0);
}

/**
 * 洗去不再符合当前圣体阶段的秘术、进度和永久属性。
 * 直接修改 player，并返回调用方需要同步移除的功法名称。
 */
export function resetIneligibleShengtiCultivation(player, minimums = {}) {
  const learned = Array.isArray(player?.学习的功法) ? player.学习的功法 : [];
  const type = player?.灵根?.type;
  const removedTechniques = [];
  let normalDeduction = 0;
  let ultimateDeduction = 0;

  const hasNormalState = learned.includes(NORMAL_TECHNIQUE)
    || sumFields(player?.圣体秘境加成, NORMAL_REALMS) > 0
    || hasProgress(player?.圣体秘境完成度);
  if (!NORMAL_TYPES.has(type) && hasNormalState) {
    normalDeduction = sumFields(player.圣体秘境加成, NORMAL_REALMS);
    player.圣体秘境加成 = Object.fromEntries(NORMAL_REALMS.map(realm => [realm, 0]));
    player.圣体秘境完成度 = Object.fromEntries(NORMAL_REALMS.map(realm => [realm, 0]));
    removedTechniques.push(NORMAL_TECHNIQUE);
  }

  const hasUltimateState = learned.includes(ULTIMATE_TECHNIQUE)
    || number(player?.仙台秘境加成) > 0
    || hasProgress(player?.仙台秘境完成度);
  if (type !== '大成圣体' && hasUltimateState) {
    ultimateDeduction = Math.max(0, number(player.仙台秘境加成))
      + inferImmortalCompletionBonus(player.仙台秘境完成度);
    player.仙台秘境加成 = 0;
    player.仙台秘境完成度 = Object.fromEntries(Object.keys(IMMORTAL_REALMS).map(realm => [realm, 0]));
    removedTechniques.push(ULTIMATE_TECHNIQUE);
  }

  if (removedTechniques.length > 0) {
    const removed = new Set(removedTechniques);
    player.学习的功法 = learned.filter(name => !removed.has(name));
  }

  const attributeDeduction = normalDeduction + ultimateDeduction;
  deductAttributes(player, attributeDeduction, minimums);

  return {
    changed: removedTechniques.length > 0,
    removedTechniques,
    normalDeduction,
    ultimateDeduction,
    attributeDeduction,
  };
}
