import { calculateEquippedStats } from './equipmentStats.js';

export const TIANJIAO_PLANES = Object.freeze([2, 2.5]);
export const HUAYUNFEI_DEVOUR_CHANCE = 0.4;

const ERA_FACTORS = Object.freeze([1, 0.75, 0.5, 0.08, 0.02]);
const IMPROVEMENT_CHANCES = Object.freeze([0.9, 0.85, 0.8, 0.7, 0.6]);
const REALM_LIMITS = Object.freeze({ mijinglevel_id: 24, xiangulevel_id: 25 });
const STARTER_NAMES = Object.freeze({
  武器: '烂铁匕首',
  护具: '破铜护具',
  法宝: '廉价炮仗',
  帝兵: '废铁',
});
const HOLY_LANDS = Object.freeze(['摇光圣地', '姬家', '姜家', '瑶池圣地', '紫府圣地', '万初圣地']);
const CULTIVATOR_SURNAMES = Object.freeze(['姬', '姜', '李', '周', '陆', '顾', '宁', '楚']);
const CULTIVATOR_NAMES = Object.freeze(['玄', '尘', '道一', '凌霄', '无极', '长风', '天衡', '星河']);

function cloneItem(item) {
  if (!item) return null;
  return {
    ...item,
    ...(item.归一属性 && {
      归一属性: {
        ...item.归一属性,
        百分比: { ...(item.归一属性.百分比 || {}) },
      },
    }),
  };
}

function maxRealm(levels) {
  return (levels || []).reduce((highest, realm) =>
    Number(realm?.level_id) > Number(highest?.level_id || 0) ? realm : highest, null) || {};
}

function findRealm(levels, levelId) {
  return (levels || []).find(realm => Number(realm?.level_id) === Number(levelId)) || {};
}

function realmStats(realm) {
  return {
    攻击: Number(realm?.基础攻击) || 0,
    防御: Number(realm?.基础防御) || 0,
    血量上限: Number(realm?.基础血量) || 0,
  };
}

function addStats(...stats) {
  return stats.reduce((total, current) => ({
    攻击: total.攻击 + (Number(current?.攻击) || 0),
    防御: total.防御 + (Number(current?.防御) || 0),
    血量上限: total.血量上限 + (Number(current?.血量上限) || 0),
  }), { 攻击: 0, 防御: 0, 血量上限: 0 });
}

export function isIndependentTianjiao(tianjiao) {
  return TIANJIAO_PLANES.includes(Number(tianjiao?.位面));
}

export function getTianjiaoBreakthroughChance(field, currentLevel, eraIndex) {
  const level = Math.max(1, Math.floor(Number(currentLevel) || 1));
  if (!REALM_LIMITS[field] || level >= REALM_LIMITS[field]) return 0;

  const isImmortalBarrier =
    (field === 'mijinglevel_id' && level === 16) ||
    (field === 'xiangulevel_id' && level === 15);
  if (isImmortalBarrier && Number(eraIndex) === 4) return 0;

  let barrierFactor = 1;
  if (field === 'mijinglevel_id' && level === 10) barrierFactor = 0.65;
  if (field === 'mijinglevel_id' && level === 11) barrierFactor = 0.35;
  if ((field === 'mijinglevel_id' && level === 15) ||
      (field === 'xiangulevel_id' && level === 14)) barrierFactor = 0.12;
  if (isImmortalBarrier) barrierFactor = 0.025;

  const eraFactor = ERA_FACTORS[Number(eraIndex)] ?? ERA_FACTORS.at(-1);
  return Math.min(1, 0.55 * Math.pow(0.9, level - 1) * barrierFactor * eraFactor);
}

export function getTianjiaoImprovementChance(eraIndex) {
  return IMPROVEMENT_CHANCES[Number(eraIndex)] ?? IMPROVEMENT_CHANCES.at(-1);
}

export function isTianjiaoBreakthroughYear(eraYears) {
  const years = Number(eraYears);
  return Number.isFinite(years) && years >= 0 && years % 2000 === 0;
}

function randomEntry(items, random) {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function talentByName(context, name, fallback) {
  return { ...(context.talentList || []).find(talent => talent?.name === name) || fallback };
}

function evolveHuayunfeiByCount(tianjiao, context) {
  const count = Math.max(0, Math.floor(Number(tianjiao.吞噬本源次数) || 0));
  if (count >= 10 && tianjiao.灵根?.name !== '混沌体') {
    tianjiao.灵根 = talentByName(context, '混沌体', {
      name: '混沌体', type: '混沌体', 法球倍率: 1.45, 攻击: 5, 防御: 5, 生命: 5,
    });
    return '混沌体';
  }
  if (count >= 5 && tianjiao.灵根?.name === '伪·魔胎仙体') {
    tianjiao.灵根 = talentByName(context, '魔胎仙体', {
      name: '魔胎仙体', type: '魔胎', 法球倍率: 8, 攻击: 5, 防御: 2, 生命: 3,
    });
    return '魔胎仙体';
  }
  return null;
}

export function advanceSpecialTianjiaoEvolution(tianjiao, context, random = Math.random) {
  if (tianjiao?.名号 === '霸王浑战') {
    if (Number(tianjiao.mijinglevel_id) < 15 || tianjiao.灵根?.name === '大成·苍天霸体') return null;
    tianjiao.灵根 = talentByName(context, '大成·苍天霸体', {
      name: '大成·苍天霸体', type: '大成霸体', 法球倍率: 2, 攻击: 5, 防御: 3, 生命: 3,
    });
    return {
      name: tianjiao.名号,
      message: '准帝霸血贯穿轮海，苍天霸体臻至大成',
      evolvedTo: tianjiao.灵根.name,
    };
  }

  if (tianjiao?.名号 !== '华云飞') return null;
  const repairedEvolution = evolveHuayunfeiByCount(tianjiao, context);
  if (repairedEvolution) {
    return {
      name: tianjiao.名号,
      message: `吞噬本源积累圆满，体质进化为【${repairedEvolution}】`,
      evolvedTo: repairedEvolution,
      count: Number(tianjiao.吞噬本源次数) || 0,
    };
  }
  if ((Number(tianjiao.吞噬本源次数) || 0) >= 10 || random() >= HUAYUNFEI_DEVOUR_CHANCE) return null;

  const realm = findRealm(context.secretLevels, tianjiao.mijinglevel_id).level || tianjiao.境界 || '同境界';
  const targetType = random() < 0.5 ? '圣人先贤尸骸' : '同境天骄';
  const randomName = `${randomEntry(CULTIVATOR_SURNAMES, random)}${randomEntry(CULTIVATOR_NAMES, random)}`;
  const targetName = targetType === '圣人先贤尸骸'
    ? `${randomEntry(HOLY_LANDS, random)}圣人先贤·${randomName}`
    : `${realm}天骄·${randomName}`;
  tianjiao.吞噬本源次数 = Math.max(0, Math.floor(Number(tianjiao.吞噬本源次数) || 0)) + 1;
  tianjiao.吞噬本源记录 = [
    ...(Array.isArray(tianjiao.吞噬本源记录) ? tianjiao.吞噬本源记录 : []),
    { 目标: targetName, 类型: targetType, 境界: realm },
  ].slice(-10);
  const evolvedTo = evolveHuayunfeiByCount(tianjiao, context);
  return {
    name: tianjiao.名号,
    targetName,
    targetType,
    realm,
    count: tianjiao.吞噬本源次数,
    evolvedTo,
    message: targetType === '圣人先贤尸骸'
      ? `潜入${targetName.split('圣人先贤')[0]}祖地，吞噬【${targetName}】的遗蜕本源（${tianjiao.吞噬本源次数}/10）`
      : `猎杀同境界的【${targetName}】，吞噬其天骄本源（${tianjiao.吞噬本源次数}/10）`,
  };
}

export function attemptTianjiaoBreakthrough(tianjiao, context, random = Math.random) {
  const candidates = ['mijinglevel_id', 'xiangulevel_id'].filter(field => {
    const level = Number(tianjiao?.[field]) || 1;
    return level > 1 && level < REALM_LIMITS[field];
  });
  if (candidates.length === 0) return null;

  const field = candidates.length === 1
    ? candidates[0]
    : candidates[Math.floor(random() * candidates.length)];
  const oldLevel = Number(tianjiao[field]) || 1;
  const chance = getTianjiaoBreakthroughChance(field, oldLevel, context.eraIndex);
  if (random() >= chance) return null;

  const levels = field === 'mijinglevel_id' ? context.secretLevels : context.ancientLevels;
  const oldRealm = findRealm(levels, oldLevel).level || `第${oldLevel}境`;
  const newLevel = oldLevel + 1;
  const newRealm = findRealm(levels, newLevel).level || `第${newLevel}境`;
  tianjiao[field] = newLevel;
  tianjiao.境界 = newRealm;
  return { field, oldLevel, newLevel, oldRealm, newRealm, chance };
}

export function getTianjiaoRealmStats(tianjiao, context) {
  const cultivation = maxRealm(context.cultivationLevels);
  const physique = maxRealm(context.physiqueLevels);
  const secret = findRealm(context.secretLevels, tianjiao?.mijinglevel_id || 1);
  const ancient = findRealm(context.ancientLevels, tianjiao?.xiangulevel_id || 1);
  return {
    level_id: Number(cultivation.level_id) || 1,
    Physique_id: Number(physique.level_id) || 1,
    base: addStats(realmStats(cultivation), realmStats(physique), realmStats(secret), realmStats(ancient)),
    laterRealms: addStats(realmStats(secret), realmStats(ancient)),
    baseCritical: (Number(cultivation.基础暴击) || 0) + (Number(physique.基础暴击) || 0),
  };
}

export function getStarterTianjiaoEquipment(context) {
  const normal = context.equipmentList || [];
  const imperial = context.imperialWeaponList || [];
  const fallback = (slot, name) => ({ name, type: slot, atk: 0, def: 0, HP: 0, bao: 0, 全属性: 0 });
  return {
    武器: cloneItem(normal.find(item => item.name === STARTER_NAMES.武器)) || fallback('武器', STARTER_NAMES.武器),
    护具: cloneItem(normal.find(item => item.name === STARTER_NAMES.护具)) || fallback('护具', STARTER_NAMES.护具),
    法宝: cloneItem(normal.find(item => item.name === STARTER_NAMES.法宝)) || fallback('法宝', STARTER_NAMES.法宝),
    帝兵: cloneItem(imperial.find(item => item.name === STARTER_NAMES.帝兵)) || fallback('帝兵', STARTER_NAMES.帝兵),
  };
}

function ensureTianjiaoEquipment(tianjiao, context) {
  const starter = getStarterTianjiaoEquipment(context);
  if (!tianjiao.装备 || Array.isArray(tianjiao.装备)) tianjiao.装备 = {};
  for (const slot of Object.keys(STARTER_NAMES)) {
    if (!tianjiao.装备[slot]) tianjiao.装备[slot] = starter[slot];
  }
  return tianjiao.装备;
}

function itemScore(item, base) {
  const stats = calculateEquippedStats(base, [item]);
  return stats.攻击 + stats.防御 + stats.血量上限;
}

function improveEquipment(tianjiao, context, random) {
  const equipment = ensureTianjiaoEquipment(tianjiao, context);
  const slot = ['武器', '护具', '法宝'][Math.floor(random() * 3)];
  const realm = getTianjiaoRealmStats(tianjiao, context);
  const current = equipment[slot];

  if (random() < 0.3) {
    const stat = ['atk', 'def', 'HP'][Math.floor(random() * 3)];
    const rate = Number((0.01 + Math.max(tianjiao.mijinglevel_id || 1, tianjiao.xiangulevel_id || 1) * 0.002 + random() * 0.03).toFixed(3));
    const crafted = cloneItem(current);
    crafted.name = `${tianjiao.名号}祭炼的${slot}`;
    crafted.天骄炼制 = true;
    crafted.归一属性 ||= { 百分比: {} };
    crafted.归一属性.百分比 ||= {};
    crafted.归一属性.百分比[stat] = Number(crafted.归一属性.百分比[stat] || 0) + rate;
    equipment[slot] = crafted;
    return `炼制百分比${slot}【${crafted.name}】（${stat}+${(rate * 100).toFixed(1)}%）`;
  }

  const candidates = [...(context.equipmentList || []), ...(context.specialEquipmentList || [])]
    .filter(item => item?.type === slot && itemScore(item, realm.base) > itemScore(current, realm.base));
  if (candidates.length === 0) return improveEquipment(tianjiao, context, () => 0);
  const found = candidates[Math.floor(random() * candidates.length)];
  equipment[slot] = cloneItem(found);
  return `搜刮并换上${slot}【${found.name}】`;
}

function forgeImperialWeapon(tianjiao, context, random) {
  const equipment = ensureTianjiaoEquipment(tianjiao, context);
  const realm = getTianjiaoRealmStats(tianjiao, context);
  const oldWeapon = equipment.帝兵;
  const pathLevel = Math.max(Number(tianjiao.mijinglevel_id) || 1, Number(tianjiao.xiangulevel_id) || 1);
  const gain = Number((0.1 + Math.max(0, pathLevel - 8) * 0.05 + random() * 0.1).toFixed(2));
  const fixedRate = 0.01 * Math.max(1, pathLevel - 8);
  equipment.帝兵 = {
    ...cloneItem(oldWeapon),
    name: `${tianjiao.名号}·本命道兵`,
    type: '帝兵',
    class: '装备',
    品阶: pathLevel >= 16 ? '极道帝兵' : '本命道兵',
    author_name: tianjiao.名号,
    atk: Math.max(Number(oldWeapon?.atk) || 0, Math.trunc(realm.laterRealms.攻击 * fixedRate)),
    def: Math.max(Number(oldWeapon?.def) || 0, Math.trunc(realm.laterRealms.防御 * fixedRate)),
    HP: Math.max(Number(oldWeapon?.HP) || 0, Math.trunc(realm.laterRealms.血量上限 * fixedRate)),
    bao: Math.max(Number(oldWeapon?.bao) || 0, Math.min(1, pathLevel * 0.03)),
    全属性: Number((Number(oldWeapon?.全属性) + gain).toFixed(2)),
  };
  return `炼成本命道兵【${equipment.帝兵.name}】（全属性+${gain}）`;
}

function addExtraBonus(tianjiao, context, random) {
  const base = getTianjiaoRealmStats(tianjiao, context).base;
  const rate = 0.005 + random() * 0.015;
  const gains = {
    攻击加成: Math.max(1, Math.trunc(base.攻击 * rate)),
    防御加成: Math.max(1, Math.trunc(base.防御 * rate)),
    生命加成: Math.max(1, Math.trunc(base.血量上限 * rate)),
  };
  for (const [field, gain] of Object.entries(gains)) {
    tianjiao[field] = (Number(tianjiao[field]) || 0) + gain;
  }
  return `夯实道基，额外全属性提升${(rate * 100).toFixed(1)}%基础值`;
}

function learnTechnique(tianjiao, context, random) {
  tianjiao.学习的功法 ||= [];
  const candidates = (context.techniqueList || [])
    .filter(item => item?.name && item.class === '功法' && !tianjiao.学习的功法.includes(item.name));
  if (candidates.length === 0) return null;
  const technique = candidates[Math.floor(random() * candidates.length)];
  tianjiao.学习的功法.push(technique.name);
  return `悟得新功法【${technique.name}】`;
}

export function applyTianjiaoImprovement(tianjiao, action, context, random = Math.random) {
  if (action === 'equipment') return improveEquipment(tianjiao, context, random);
  if (action === 'imperialWeapon') return forgeImperialWeapon(tianjiao, context, random);
  if (action === 'extraBonus') return addExtraBonus(tianjiao, context, random);
  if (action === 'technique') return learnTechnique(tianjiao, context, random);
  return null;
}

export function improveTianjiao(tianjiao, context, random = Math.random) {
  const actions = ['equipment', 'imperialWeapon', 'extraBonus', 'technique'];
  const count = 1 + Math.floor(random() * actions.length);
  for (let index = actions.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [actions[index], actions[swap]] = [actions[swap], actions[index]];
  }
  return actions.slice(0, count)
    .map(action => applyTianjiaoImprovement(tianjiao, action, context, random))
    .filter(Boolean);
}

export function buildTianjiaoBattleStats(tianjiao, context) {
  const realms = getTianjiaoRealmStats(tianjiao, context);
  const equipment = tianjiao?.装备 && !Array.isArray(tianjiao.装备)
    ? { ...getStarterTianjiaoEquipment(context), ...tianjiao.装备 }
    : getStarterTianjiaoEquipment(context);
  const withBonus = addStats(realms.base, {
    攻击: tianjiao?.攻击加成,
    防御: tianjiao?.防御加成,
    血量上限: tianjiao?.生命加成,
  });
  const root = tianjiao?.灵根 || {};
  const withRoot = {
    攻击: withBonus.攻击 * (1 + (Number(root.攻击) || 0)),
    防御: withBonus.防御 * (1 + (Number(root.防御) || 0)),
    血量上限: withBonus.血量上限 * (1 + (Number(root.生命) || 0)),
  };
  const stats = calculateEquippedStats(withRoot, [equipment.武器, equipment.护具, equipment.法宝, equipment.帝兵]);
  const imperialMultiplier = Number(equipment.帝兵?.全属性) || 0;
  stats.攻击 += Math.trunc(realms.laterRealms.攻击 * imperialMultiplier);
  stats.防御 += Math.trunc(realms.laterRealms.防御 * imperialMultiplier);
  stats.血量上限 += Math.trunc(realms.laterRealms.血量上限 * imperialMultiplier);

  return {
    ...tianjiao,
    level_id: realms.level_id,
    Physique_id: realms.Physique_id,
    攻击: Math.max(1, stats.攻击),
    防御: Math.max(1, stats.防御),
    当前血量: Math.max(1, stats.血量上限),
    血量上限: Math.max(1, stats.血量上限),
    暴击率: Math.max(Number(tianjiao?.暴击率) || 0, realms.baseCritical) +
      ['武器', '护具', '法宝', '帝兵'].reduce((sum, slot) => sum + (Number(equipment[slot]?.bao) || 0), 0),
    装备: equipment,
  };
}
