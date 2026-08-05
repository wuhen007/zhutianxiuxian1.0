import { calculateEquippedStats } from './equipmentStats.js';
import { createRealmEventLocation } from './realmEventLocation.js';
import { getPlayerPlaneCoordinate, getPlayerPlaneName } from './planeCoords.js';
import { PLACE_LOCATION_MAP, SPECIAL_LOCATIONS } from './weimianTravel.js';

export const TIANJIAO_PLANES = Object.freeze([2, 2.5]);
export const HUAYUNFEI_DEVOUR_CHANCE = 0.4;
export const TIANJIAO_BREAKTHROUGH_INTERVAL = 5000;
export const TIANJIAO_IMPROVEMENT_INTERVAL = 3000;
export const TIANJIAO_TRACE_DURATION_MS = 24 * 60 * 60 * 1000;
export const TIANJIAO_DUNGEON_TRACE_CHANCE = 0.1;
export const TIANJIAO_EVENT_TRACE_CHANCE = 0.15;
export const TIANJIAO_HEALING_YEARS = 1000;
export const TIANJIAO_HEALING_RECOVERY = 20;

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
const ARTIFACT_PREFIXES = Object.freeze(['太初', '紫极', '吞天', '星河', '万劫', '天命', '不灭', '混元', '九霄', '虚空']);
const ARTIFACT_SUFFIXES = Object.freeze(['问道', '镇世', '破劫', '照夜', '归一', '无双', '葬星', '凌天']);
const ARTIFACT_CORES = Object.freeze({
  武器: ['剑', '战戟', '天刀', '神枪', '羽刃', '道尺', '古矛', '仙锏'],
  护具: ['战甲', '仙衣', '道袍', '神铠', '羽衣', '玄甲', '天衣', '圣铠'],
  法宝: ['古镜', '神炉', '道塔', '宝印', '天钟', '仙图', '宝轮', '星盘'],
  帝兵: ['帝剑', '皇戟', '天刀', '古钟', '神炉', '道塔', '王印', '仙轮'],
});
const REINCARNATION_PREFIXES = Object.freeze(['紫微', '星墟', '北斗', '天外', '轮回', '太初', '九霄', '万古']);
const REINCARNATION_SUFFIXES = Object.freeze(['转世身', '归来者', '道胎', '新生', '轮回子', '再世身']);
const INITIAL_TEMPLATE_FIELDS = Object.freeze([
  '境界', 'level_id', 'Physique_id', 'mijinglevel_id', 'xiangulevel_id',
  '攻击', '防御', '当前血量', '血量上限', '暴击率', '暴击伤害', '速度',
  '闪避率', '首次闪避', '闪避增攻', '闪避增攻上限', '灵根', '学习的功法',
]);

function cloneValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

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
  return Number.isFinite(years) && years > 0 && years % TIANJIAO_BREAKTHROUGH_INTERVAL === 0;
}

export function isTianjiaoImprovementYear(eraYears) {
  const years = Number(eraYears);
  return Number.isFinite(years) && years > 0 && years % TIANJIAO_IMPROVEMENT_INTERVAL === 0;
}

function randomEntry(items, random) {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

const ALLOWED_TIANJIAO_PLANES = Object.freeze(
  Object.keys(PLACE_LOCATION_MAP).filter(plane => !SPECIAL_LOCATIONS.includes(plane)),
);

function planeNameFromId(planeId) {
  return Object.entries(PLACE_LOCATION_MAP)
    .find(([, id]) => Number(id) === Number(planeId))?.[0] || null;
}

export function createTianjiaoTrace(tianjiao, options = {}) {
  const random = options.random || Math.random;
  const now = Number(options.now) || Date.now();
  const requestedPlane = options.destination?.plane || options.plane || planeNameFromId(tianjiao?.位面);
  const plane = ALLOWED_TIANJIAO_PLANES.includes(requestedPlane)
    ? requestedPlane
    : randomEntry(ALLOWED_TIANJIAO_PLANES, random);
  const destination = options.destination?.plane === plane && options.destination?.coordinate
    ? options.destination
    : createRealmEventLocation({ plane, random });
  if (!destination || SPECIAL_LOCATIONS.includes(destination.plane)) return null;
  return {
    name: tianjiao.名号,
    plane: destination.plane,
    location: destination.location,
    coordinate: { ...destination.coordinate },
    source: options.source || '未知线索',
    reincarnation: Number(tianjiao.轮回世数) || 0,
    traceVersion: Number(tianjiao.踪迹代数) || 0,
    foundAt: now,
    expiresAt: now + TIANJIAO_TRACE_DURATION_MS,
  };
}

export function formatTianjiaoTrace(trace) {
  if (!trace) return '踪迹未明';
  return `${trace.plane}·${trace.location}（坐标 ${trace.coordinate.x},${trace.coordinate.y}）`;
}

export function getKnownTianjiaoTrace(player, tianjiao, now = Date.now()) {
  const personal = player?.天骄踪迹?.[tianjiao?.名号];
  const currentLife = Number(tianjiao?.轮回世数) || 0;
  const currentTraceVersion = Number(tianjiao?.踪迹代数) || 0;
  const isCurrent = trace =>
    Number(trace?.reincarnation || 0) === currentLife &&
    Number(trace?.traceVersion || 0) === currentTraceVersion;
  if (personal && Number(personal.expiresAt) > now && isCurrent(personal)) return personal;
  const publicTrace = tianjiao?.公开踪迹;
  return publicTrace && Number(publicTrace.expiresAt) > now && isCurrent(publicTrace) ? publicTrace : null;
}

export function getTianjiaoTraceReach(player, trace) {
  if (!trace) return { ok: false, reason: 'unknown' };
  if (getPlayerPlaneName(player) !== trace.plane) return { ok: false, reason: 'plane' };
  const coordinate = getPlayerPlaneCoordinate(player, trace.plane);
  if (!coordinate || coordinate.x !== Number(trace.coordinate?.x) || coordinate.y !== Number(trace.coordinate?.y)) {
    return { ok: false, reason: 'coordinate' };
  }
  return { ok: true, reason: null };
}

export function rollDungeonTianjiaoTrace(player, tianjiaoList, options = {}) {
  const random = options.random || Math.random;
  const chance = Number(options.chance ?? TIANJIAO_DUNGEON_TRACE_CHANCE);
  const candidates = (tianjiaoList || []).filter(tianjiao => tianjiao?.名号);
  if (candidates.length === 0 || random() >= chance) return null;
  const tianjiao = randomEntry(candidates, random);
  const trace = createTianjiaoTrace(tianjiao, { random, now: options.now, source: '副本寻迹' });
  if (!trace) return null;
  player.天骄踪迹 ||= {};
  player.天骄踪迹[tianjiao.名号] = trace;
  return trace;
}

export function rollRealmEventTianjiaoTrace(tianjiaoList, event, options = {}) {
  const random = options.random || Math.random;
  const chance = Number(options.chance ?? TIANJIAO_EVENT_TRACE_CHANCE);
  const candidates = (tianjiaoList || []).filter(tianjiao => tianjiao?.名号);
  if (candidates.length === 0 || random() >= chance) return null;
  const tianjiao = randomEntry(candidates, random);
  const trace = createTianjiaoTrace(tianjiao, {
    random,
    now: options.now,
    source: '位面事件',
    destination: event,
  });
  if (!trace) return null;
  tianjiao.公开踪迹 = trace;
  return trace;
}

export function ensureTianjiaoInitialTemplate(tianjiao) {
  if (!tianjiao || tianjiao.初始模板) return false;
  const template = {};
  for (const field of INITIAL_TEMPLATE_FIELDS) {
    if (tianjiao[field] !== undefined) template[field] = cloneValue(tianjiao[field]);
  }
  if (!isIndependentTianjiao(tianjiao) && tianjiao.装备) template.装备 = cloneValue(tianjiao.装备);
  tianjiao.初始模板 = template;
  return true;
}

export function resetTianjiaoToInitialTemplate(tianjiao, context, random = Math.random) {
  ensureTianjiaoInitialTemplate(tianjiao);
  const template = tianjiao.初始模板 || {};
  for (const field of INITIAL_TEMPLATE_FIELDS) {
    if (template[field] === undefined) delete tianjiao[field];
    else tianjiao[field] = cloneValue(template[field]);
  }

  delete tianjiao.攻击加成;
  delete tianjiao.防御加成;
  delete tianjiao.生命加成;
  delete tianjiao.吞噬本源次数;
  delete tianjiao.吞噬本源记录;
  delete tianjiao.公开踪迹;
  if (isIndependentTianjiao(tianjiao)) tianjiao.装备 = getStarterTianjiaoEquipment(context);
  else if (template.装备) tianjiao.装备 = cloneValue(template.装备);
  else delete tianjiao.装备;

  tianjiao.轮回世数 = Math.max(0, Math.floor(Number(tianjiao.轮回世数) || 0)) + 1;
  tianjiao.踪迹代数 = Math.max(0, Math.floor(Number(tianjiao.踪迹代数) || 0)) + 1;
  tianjiao.轮回称号 = `${randomEntry(REINCARNATION_PREFIXES, random)}${randomEntry(REINCARNATION_SUFFIXES, random)}`;
  return { life: tianjiao.轮回世数, title: tianjiao.轮回称号 };
}

function rollSetbackType(defeats, random) {
  const roll = random();
  if (defeats <= 3) return roll < 0.7 ? '轻伤' : roll < 0.95 ? '道心受创' : '道心破碎';
  if (defeats <= 6) return roll < 0.4 ? '轻伤' : roll < 0.85 ? '道心受创' : '道心破碎';
  return roll < 0.2 ? '轻伤' : roll < 0.7 ? '道心受创' : '道心破碎';
}

function erodeGrowthAfterDaoHeartBreak(tianjiao, random) {
  const fields = ['攻击加成', '防御加成', '生命加成'].filter(field => Number(tianjiao?.[field]) > 0);
  if (fields.length === 0) return null;
  const field = randomEntry(fields, random);
  const before = Number(tianjiao[field]) || 0;
  tianjiao[field] = Math.max(0, Math.trunc(before * 0.9));
  return `${field}因道心崩裂衰退10%`;
}

export function registerTianjiaoDefeat(tianjiao, status, worldYear, random = Math.random) {
  status.本世败绩 = Math.max(0, Math.floor(Number(status.本世败绩) || 0)) + 1;
  const defeats = status.本世败绩;
  if (status.isHealing || defeats % 3 !== 0 || Number(status.currentHP) <= 0) {
    return { defeats, setback: null };
  }

  const type = rollSetbackType(defeats, random);
  status.养伤 = {
    type,
    startedAtWorldYear: Number(worldYear) || 0,
    untilWorldYear: (Number(worldYear) || 0) + TIANJIAO_HEALING_YEARS,
  };
  status.isHealing = true;
  if (type === '道心受创') status.下次自强倍率 = 0.7;
  if (type === '道心破碎') {
    status.下次自强倍率 = 0.5;
    status.下次证道阻断 = true;
  }
  const lostGrowth = type === '道心破碎' ? erodeGrowthAfterDaoHeartBreak(tianjiao, random) : null;
  tianjiao.踪迹代数 = Math.max(0, Math.floor(Number(tianjiao.踪迹代数) || 0)) + 1;
  delete tianjiao.公开踪迹;
  return { defeats, setback: { ...status.养伤, lostGrowth } };
}

export function isTianjiaoHealing(status, worldYear) {
  if (!status?.isHealing) return false;
  const until = Number(status.养伤?.untilWorldYear);
  return Number.isFinite(until) && until > Number(worldYear);
}

export function recoverTianjiaoFromSetback(status, worldYear) {
  if (!status?.isHealing) return null;
  const until = Number(status.养伤?.untilWorldYear);
  if (Number.isFinite(until) && until > Number(worldYear)) return null;
  const type = status.养伤.type;
  status.currentHP = Math.min(100, Math.max(1, Number(status.currentHP) || 1) + TIANJIAO_HEALING_RECOVERY);
  status.isHealing = false;
  delete status.养伤;
  return { type, currentHP: status.currentHP };
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

function randomArtifactName(slot, random) {
  return `${randomEntry(ARTIFACT_PREFIXES, random)}${randomEntry(ARTIFACT_CORES[slot], random)}·${randomEntry(ARTIFACT_SUFFIXES, random)}`;
}

function hasPercentageStats(item) {
  return Object.values(item?.归一属性?.百分比 || {}).some(value => Number(value) > 0);
}

function washPercentageEquipment(tianjiao, equipment, slot, random) {
  const current = equipment[slot];
  const crafted = cloneItem(current);
  const pathLevel = Math.max(Number(tianjiao.mijinglevel_id) || 1, Number(tianjiao.xiangulevel_id) || 1);
  const legacyName = `${tianjiao.名号}祭炼的${slot}`;
  const wasPercentageEquipment = hasPercentageStats(current);
  if (!crafted.天骄炼制 || crafted.name === legacyName) crafted.name = randomArtifactName(slot, random);
  crafted.天骄炼制 = true;
  crafted.百分比洗礼次数 = Math.max(0, Math.floor(Number(crafted.百分比洗礼次数) || 0)) + 1;
  crafted.归一属性 ||= { 百分比: {} };
  crafted.归一属性.百分比 ||= {};
  const stat = randomEntry(['atk', 'def', 'HP'], random);
  const rate = Number((0.01 + pathLevel * 0.002 + random() * 0.03).toFixed(3));
  crafted.归一属性.百分比[stat] = Number(crafted.归一属性.百分比[stat] || 0) + rate;
  equipment[slot] = crafted;
  const action = wasPercentageEquipment ? `第${crafted.百分比洗礼次数}次洗礼` : '炼成';
  return `${action}百分比${slot}【${crafted.name}】（${stat}+${(rate * 100).toFixed(1)}%）`;
}

function improveEquipment(tianjiao, context, random) {
  const equipment = ensureTianjiaoEquipment(tianjiao, context);
  const slot = ['武器', '护具', '法宝'][Math.floor(random() * 3)];
  const realm = getTianjiaoRealmStats(tianjiao, context);
  const current = equipment[slot];

  const washChance = hasPercentageStats(current) ? 0.7 : 0.3;
  if (random() < washChance) return washPercentageEquipment(tianjiao, equipment, slot, random);

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
  const wasForged = oldWeapon?.author_name === tianjiao.名号 && oldWeapon?.name !== STARTER_NAMES.帝兵;
  const legacyName = `${tianjiao.名号}·本命道兵`;
  const weaponName = !wasForged || oldWeapon.name === legacyName
    ? randomArtifactName('帝兵', random)
    : oldWeapon.name;
  const gain = Number((0.1 + Math.max(0, pathLevel - 8) * 0.05 + random() * 0.1).toFixed(2));
  const fixedRate = (0.003 + random() * 0.002) * Math.max(1, pathLevel - 8);
  equipment.帝兵 = {
    ...cloneItem(oldWeapon),
    name: weaponName,
    type: '帝兵',
    class: '装备',
    品阶: pathLevel >= 16 ? '极道帝兵' : '本命道兵',
    author_name: tianjiao.名号,
    天骄本命: true,
    洗礼次数: Math.max(0, Math.floor(Number(oldWeapon?.洗礼次数) || 0)) + 1,
    atk: (Number(oldWeapon?.atk) || 0) + Math.max(1, Math.trunc(realm.laterRealms.攻击 * fixedRate)),
    def: (Number(oldWeapon?.def) || 0) + Math.max(1, Math.trunc(realm.laterRealms.防御 * fixedRate)),
    HP: (Number(oldWeapon?.HP) || 0) + Math.max(1, Math.trunc(realm.laterRealms.血量上限 * fixedRate)),
    bao: Math.min(1, Math.max(Number(oldWeapon?.bao) || 0, pathLevel * 0.03) + 0.01),
    全属性: Number((Number(oldWeapon?.全属性) + gain).toFixed(2)),
  };
  const action = wasForged ? `第${equipment.帝兵.洗礼次数}次洗礼` : '炼成';
  return `${action}本命帝兵【${equipment.帝兵.name}】（全属性+${gain}）`;
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
