import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPlayerPlaneName } from './planeCoords.js';
import { getDungeonGongfaReduction } from './gongfaProficiency.js';
import { hasPercentageStats } from './tianjiaoTaint.js';

export const INNATE_TREASURE_NAMES = Object.freeze([
  '混沌珠',
  '太极图',
  '盘古幡',
  '诛仙四剑',
  '山河社稷图',
  '天地玄黄玲珑塔',
  '东皇钟',
  '混沌钟',
  '六道轮回盘',
  '炼妖壶',
  '崆峒印',
  '虚天舟',
]);

export const CONTESTABLE_INNATE_TREASURE_NAMES = Object.freeze(
  INNATE_TREASURE_NAMES.filter(name => name !== '虚天舟')
);

export const CHAOS_PROTECTED_RARITY = 7;

const LEGACY_RARITY_RANK = Object.freeze({
  普通: 0, 锻造: 0, 稀有: 1, 珍贵: 2, 史诗: 3, 传说: 4,
  顶级: 5, 神级: 6, 仙级: 7, 先天: 8,
});
const PERCENT_EQUIPMENT_TYPES = new Set(['武器', '护具', '法宝']);

export function getChaosItemRarity(item) {
  const rarity = Number(item?.稀有度);
  if (Number.isFinite(rarity)) return rarity;
  return LEGACY_RARITY_RANK[item?.type] ?? LEGACY_RARITY_RANK[item?.品级] ?? 0;
}

function hasLegacyPercentageStats(item) {
  if (item?.class !== '装备' && !PERCENT_EQUIPMENT_TYPES.has(item?.type)) return false;
  const atk = Number(item?.atk) || 0;
  const def = Number(item?.def) || 0;
  const hp = Number(item?.HP) || 0;
  if (atk >= 99 || def >= 99 || hp >= 99) return false;
  return atk >= 1.5 || def >= 1.2 ||
    (item?.type === '法宝' && (atk >= 1 || def >= 1)) || atk + def > 1.95;
}

export function getChaosItemRestriction(item) {
  const name = item?.name || '该物品';
  if (name === '圣法碎片') return '【圣法碎片】具有唯一性，不可进行混沌复制或演化。';
  if (item?.type === '帝兵' && item?.author_name) {
    return `【${name}】是炼制帝兵，受本命烙印保护，不可进行混沌复制或演化。`;
  }
  if (hasPercentageStats(item) || hasLegacyPercentageStats(item)) {
    return `【${name}】是百分比装备，不可进行混沌复制或演化。`;
  }
  const rarity = getChaosItemRarity(item);
  if (rarity >= CHAOS_PROTECTED_RARITY) {
    return `【${name}】稀有度为${rarity}，达到保护线${CHAOS_PROTECTED_RARITY}，不可进行混沌复制或演化。`;
  }
  return '';
}

export const INNATE_TREASURE_CATALOG = Object.freeze({
  混沌珠: {
    title: '万象之源',
    lore: '珠内混沌未分，万物的形、质与可能皆可在其中重新书写。',
    summary: '复制物品、演化材料，并变幻同类同阶物品。',
    passives: [],
    authorities: [
      { command: '#混沌复制 物品*数量', cooldownKey: '混沌复制', effect: '复制纳戒中的一组物品；稀有度越高，单次上限越低，稀有度7及以上与受保护物品不可复制。' },
      { command: '#混沌演化 材料*数量', cooldownKey: '混沌演化', effect: '将材料演化为同阶或更高一阶材料；最高可演化至稀有度6，受保护物品不可参与。' },
      { command: '#混沌变幻 物品*数量', cooldownKey: '混沌变幻', effect: '将物品随机变为同类别、同品阶的另一种物品。' },
    ],
  },
  太极图: {
    title: '阴阳之宗',
    lore: '一图分阴阳，动静、生灭与攻守皆在两仪流转之间。',
    summary: '切换阴阳战斗形态，并逆转一次致命伤害。',
    passives: [
      '阴相：受击时有30%概率化去本次伤害，并立即反击。',
      '阳相：造成实际伤害时，吸血率至少提升至50%。',
    ],
    authorities: [
      { command: '#切换太极 阴/阳', effect: '随时切换阴相或阳相。' },
      { command: '#阴阳逆转', cooldownKey: '阴阳逆转', effect: '下一场战斗开局定住敌人一回合；首次致命伤害转为等量治疗，并将伤害等量返还。' },
    ],
  },
  盘古幡: {
    title: '开天圣器',
    lore: '幡动则混沌开裂，锋芒所至，诸法与万界壁垒皆不能阻。',
    summary: '破除敌方防御，以开天余威强化讨伐与洗劫。',
    passives: ['PVE战斗中无视敌方30%防御。'],
    authorities: [
      { command: '#开天', cooldownKey: '开天', effect: '下一场PVE令敌方防御归零，并斩去普通敌人30%、首领3%的初始气血；讨伐天骄成功后，下一次洗劫奖励翻倍，并有30%概率打碎天骄本世的护身法宝。' },
    ],
  },
  诛仙四剑: {
    title: '杀伐之极',
    lore: '诛、戮、陷、绝四剑齐出，非只斩血肉，更斩生机与道途。',
    summary: '常驻禁疗与残血斩杀，主动布阵降下一柄杀剑。',
    passives: [
      '令战斗对手无法治疗；对手气血低于25%时直接斩杀。',
      '讨伐天骄造成双倍进度伤害；胜利后降低仇恨并令其畏惧8小时。',
    ],
    authorities: [
      { command: '#布诛仙剑阵', cooldownKey: '诛仙剑阵', effect: '下一场战斗随机必定触发一剑：戮仙使敌方额外承伤50%；绝仙每回合流失20%最大气血；陷仙每回合30%概率沉默神通；诛仙造成必中且无法防御的5倍神通伤害。' },
    ],
  },
  山河社稷图: {
    title: '万里山河',
    lore: '图中自成社稷乾坤，山川万灵皆可栖息，也可映照外界诸境。',
    summary: '强化小世界产出与栖息位，并可收摄副本共享收益。',
    passives: ['小世界产出翻倍；仙宠栖息位额外增加2个。'],
    authorities: [
      { command: '#图中巡游', cooldownKey: '图中巡游', effect: '额外结算6小时小世界产出。' },
      { command: '#收摄山河 灵界裂缝/副本', cooldownKey: '收摄山河', effect: '将通关过的内容收摄为持续6小时的山河投影，每小时产出修为、血气与灵石。' },
      { command: '#邀请山河投影 @玩家', effect: '邀请最多2名玩家共享山河投影的完整收益。' },
    ],
  },
  天地玄黄玲珑塔: {
    title: '玄黄不灭',
    lore: '玄黄母气垂落万重，立于塔下，万劫加身亦难损其本真。',
    summary: '在渡劫或开启内景地时提供一次玄黄护道。',
    passives: [],
    authorities: [
      { command: '#玄黄护道', cooldownKey: '玄黄护道', effect: '蓄下一次护道：渡劫伤害降低30%，或开启内景地时将失败概率降低30%。先触发者消耗效果。' },
    ],
  },
  东皇钟: {
    title: '镇世天音',
    lore: '钟声一响，时空凝滞，鸿蒙万界皆在浩荡天音中归于秩序。',
    summary: '缩短计时行动，并在战斗中镇封敌人。',
    passives: ['所有接入至宝计时规则的行动耗时缩短20%。'],
    authorities: [
      { command: '#东皇镇世', cooldownKey: '东皇镇世', effect: '下一场战斗镇封普通PVE敌人3回合、PVP或首领1回合；首领的攻击额外降低30%。' },
    ],
  },
  混沌钟: {
    title: '岁月禁器',
    lore: '钟体之外星河流转，钟声所及，正在流逝的岁月也会被截断。',
    summary: '大幅缩短计时行动，并可立即完成当前行动。',
    passives: ['所有接入至宝计时规则的行动耗时缩短30%。'],
    authorities: [
      { command: '#截断岁月', cooldownKey: '截断岁月', effect: '立即完成当前计时行动；轮回、关押与永寂等封禁状态不能被截断。' },
    ],
  },
  六道轮回盘: {
    title: '生死之枢',
    lore: '六道往复，生死相衔；持盘者立于轮回之上，也可为他人暂改归途。',
    summary: '抵御寿元轮回，压制敌方速度与行动进度。',
    passives: [
      '自身寿元枯竭时不会被强制送入轮回。',
      '战斗中令对手速度降低20%；每次行动有20%概率将对手行动进度推退20%。',
    ],
    authorities: [
      { command: '#执掌轮回 @玩家', cooldownKey: '执掌轮回', effect: '庇护一名玩家24小时，使其寿元枯竭时不进入轮回。' },
    ],
  },
  炼妖壶: {
    title: '万灵造化',
    lore: '壶中可容万灵本源，吞吐之间不灭其真性，却令血脉与天赋彼此交融。',
    summary: '全面强化仙宠寻宝，并允许两只仙宠融合能力。',
    passives: ['仙宠寻宝满60分钟即可结束，上限延长至24小时，宝物收益翻倍。'],
    authorities: [
      { command: '#炼妖融合 主宠*副宠', cooldownKey: '炼妖融合', effect: '消耗副宠，使主宠永久继承副宠50%的对应能力；每只主宠只能融合一次。' },
    ],
  },
  崆峒印: {
    title: '人皇正统',
    lore: '古印承载亿万众生愿力，人道气运所聚之处，便是人皇敕令所达之疆。',
    summary: '庇荫宗门修炼与内景地，并可敕封整个位面。',
    passives: [
      '执掌者及其所在宗门成员修炼收益提升至2倍。',
      '执掌者进入内景地的收益增加30%。',
    ],
    authorities: [
      { command: '#人皇敕令 修炼/历练', cooldownKey: '人皇敕令', effect: '敕封当前位面24小时。修炼敕令令修炼、悟道收益+50%，修炼额外获得35%血气；历练敕令令副本收益+100%。' },
      { command: '#借人皇气运修炼', effect: '修炼敕令期间，同位面玩家可使用一次，立即取得相当于闭关1200分钟的修炼收益。' },
    ],
  },
  虚天舟: {
    title: '诸界无碍',
    lore: '虚天之主往来精神宇宙与诸天位面所乘之舟，一叶横空，万界壁垒皆化清风。',
    summary: '位面穿梭缩短5至10分钟，搭载三名道友并免受至尊和天骄截杀。',
    passives: [
      '位面穿梭固定缩短5至10分钟，最低保留1分钟。',
      '虚天舟航程不会触发禁区至尊截杀或仇敌天骄伏击。',
      '承接虚天之主传承后，小世界丹房中的炼丹仙宠可以炼制定神丹和太虚养神丹。',
    ],
    authorities: [
      { command: '#邀请登舟 @玩家', effect: '邀请同位面的空闲玩家登舟，最多搭载3名乘员。' },
      { command: '#同意登舟', effect: '接受最近一次虚天舟邀请。' },
      { command: '#虚天舟乘员', effect: '查看当前已经登舟的乘员。' },
      { command: '#离开虚天舟', effect: '在启航前主动离舟。' },
    ],
  },
});

export const AUTHORITY_COOLDOWNS = Object.freeze({
  混沌复制: 12 * 60 * 60 * 1000,
  混沌演化: 24 * 60 * 60 * 1000,
  混沌变幻: 6 * 60 * 60 * 1000,
  炼妖融合: 30 * 24 * 60 * 60 * 1000,
  玄黄护道: 24 * 60 * 60 * 1000,
  图中巡游: 72 * 60 * 60 * 1000,
  收摄山河: 72 * 60 * 60 * 1000,
  开天: 6 * 60 * 60 * 1000,
  诛仙剑阵: 24 * 60 * 60 * 1000,
  东皇镇世: 24 * 60 * 60 * 1000,
  截断岁月: 7 * 24 * 60 * 60 * 1000,
  人皇敕令: 7 * 24 * 60 * 60 * 1000,
  执掌轮回: 24 * 60 * 60 * 1000,
  阴阳逆转: 24 * 60 * 60 * 1000,
});

export const INNATE_TREASURE_PROJECTION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export const PANGU_TALISMAN_SHATTER_CHANCE = 0.3;

export function tryPanguShatterTalisman(status, active, random = Math.random) {
  if (!active || status?.护身法宝已碎 || random() >= PANGU_TALISMAN_SHATTER_CHANCE) return false;
  status.护身法宝已碎 = true;
  return true;
}

const TREASURE_SET = new Set(INNATE_TREASURE_NAMES);
const STATE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'resources',
  'data',
  'innate_treasure_state.json'
);

function defaultState() {
  return { owners: {}, equipped: {}, decree: null, landscapeRealms: [] };
}

export function readInnateTreasureState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return defaultState();
    return { ...defaultState(), ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
  } catch (error) {
    console.error('[先天至宝] 读取全局状态失败:', error.message);
    return defaultState();
  }
}

export function writeInnateTreasureState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export function isInnateTreasureName(name) {
  return TREASURE_SET.has(String(name || ''));
}

export function isInnateTreasureItem(item) {
  return isInnateTreasureName(item?.name) || isInnateTreasureName(item?.先天至宝本体);
}

export function migrateLegacyInnateTreasureSlot(equipment = {}, now = Date.now()) {
  const migrated = { ...equipment };
  if (isInnateTreasureItem(migrated.帝兵)) {
    if (!isInnateTreasureItem(migrated.至宝)) migrated.至宝 = migrated.帝兵;
    migrated.帝兵 = null;
  }
  if (isInnateTreasureItem(migrated.至宝)) {
    migrated.至宝 = { ...migrated.至宝, type: '至宝' };
    if (migrated.至宝.先天至宝本体 && Number(migrated.至宝.先天投影截止) <= now) {
      migrated.至宝 = null;
    }
  }
  return migrated;
}

export function createInnateTreasure(name, ownerId, now = Date.now()) {
  if (!isInnateTreasureName(name)) throw new Error(`未知先天至宝：${name}`);
  return {
    id: 29000000 + INNATE_TREASURE_NAMES.indexOf(name) + 1,
    name,
    class: '装备',
    type: '至宝',
    品阶: '先天至宝',
    author_name: String(ownerId),
    atk: 100000000,
    def: 100000000,
    HP: 100000000,
    全属性: 100,
    bao: 1,
    出售价: 0,
    绑定者: String(ownerId),
    认主时间: now,
    pinji: 6,
    数量: 1,
    islockd: 1,
  };
}

export function createInnateTreasureProjection(name, ownerId, now = Date.now()) {
  if (!isInnateTreasureName(name)) throw new Error(`未知先天至宝：${name}`);
  return {
    id: 29100000 + INNATE_TREASURE_NAMES.indexOf(name) + 1,
    name: `${name}·七日投影`,
    class: '装备',
    type: '至宝',
    品阶: '先天投影',
    先天至宝本体: name,
    先天投影截止: now + INNATE_TREASURE_PROJECTION_DURATION_MS,
    author_name: String(ownerId),
    atk: 0,
    def: 0,
    HP: 0,
    全属性: 0,
    bao: 1,
    出售价: 0,
    绑定者: String(ownerId),
    认主时间: now,
    pinji: 6,
    数量: 1,
    islockd: 1,
  };
}

export function getInnateTreasureProjectionName(item) {
  if (!item?.先天至宝本体 || !isInnateTreasureName(item.先天至宝本体)) return '';
  if (Number(item.先天投影截止) <= Date.now()) return '';
  return item.先天至宝本体;
}

export function claimInnateTreasure(name, ownerId, now = Date.now()) {
  const state = readInnateTreasureState();
  if (state.owners[name]) return { ok: false, ownerId: state.owners[name].ownerId };
  state.owners[name] = { ownerId: String(ownerId), claimedAt: now };
  writeInnateTreasureState(state);
  return { ok: true };
}

export function releaseInnateTreasure(name, ownerId) {
  const state = readInnateTreasureState();
  if (state.owners[name]?.ownerId !== String(ownerId)) return false;
  delete state.owners[name];
  delete state.equipped[name];
  writeInnateTreasureState(state);
  return true;
}

/**
 * 计算一次先天至宝发放方案（纯逻辑，不写任何文件）。
 * 供管理员 #发 指令调用：先在此判定归属占用，再执行 IO。
 * @param {string} name 至宝名称
 * @param {string|number} ownerId 目标玩家QQ
 * @param {{force?: boolean}} [options] force=true 允许覆盖已被他人认主的至宝
 * @returns {{ok:boolean, reason?:string, ownerId?:string, name?:string, treasure?:object}}
 */
export function buildInnateTreasureGrant(name, ownerId, options = {}) {
  const force = Boolean(options.force);
  if (!isInnateTreasureName(name)) return { ok: false, reason: 'unknown' };
  const state = readInnateTreasureState();
  const existingOwner = state.owners?.[name]?.ownerId;
  if (existingOwner && existingOwner !== String(ownerId) && !force) {
    return { ok: false, reason: 'owned', ownerId: existingOwner };
  }
  return {
    ok: true,
    name,
    ownerId: String(ownerId),
    treasure: createInnateTreasure(name, ownerId),
  };
}

export function updateEquippedInnateTreasure(ownerId, treasureName, sectName = '') {
  const state = readInnateTreasureState();
  for (const [name, record] of Object.entries(state.equipped)) {
    if (record.ownerId === String(ownerId) && name !== treasureName) delete state.equipped[name];
  }
  if (isInnateTreasureName(treasureName)) {
    state.equipped[treasureName] = {
      ownerId: String(ownerId),
      sectName: String(sectName || ''),
      equippedAt: Date.now(),
    };
  }
  writeInnateTreasureState(state);
}

export function hasEquippedInnateTreasure(player, name) {
  return player?.当前先天至宝 === name;
}

export function getAuthorityState(player) {
  if (!player.先天权柄 || typeof player.先天权柄 !== 'object') player.先天权柄 = {};
  if (!player.先天权柄.冷却 || typeof player.先天权柄.冷却 !== 'object') {
    player.先天权柄.冷却 = {};
  }
  return player.先天权柄;
}

export function getCooldownRemaining(player, key, now = Date.now()) {
  const expiresAt = Number(player?.先天权柄?.冷却?.[key]) || 0;
  return Math.max(0, expiresAt - now);
}

export function startAuthorityCooldown(player, key, now = Date.now()) {
  const duration = AUTHORITY_COOLDOWNS[key];
  if (!duration) throw new Error(`未知权柄冷却：${key}`);
  getAuthorityState(player).冷却[key] = now + duration;
  return now + duration;
}

export function getTimedActionMultiplier(player) {
  if (hasEquippedInnateTreasure(player, '混沌钟')) return 0.7;
  if (hasEquippedInnateTreasure(player, '东皇钟')) return 0.8;
  return 1;
}

export function getDungeonTimedActionMultiplier(player) {
  const technique = getDungeonGongfaReduction(player);
  return Math.max(0.5, getTimedActionMultiplier(player) * (1 - technique.rate));
}

export function applyInnateTravelReduction(player, travelTime, random = Math.random) {
  const original = Math.max(1, Math.ceil(Number(travelTime) || 1));
  if (!hasEquippedInnateTreasure(player, '虚天舟')) {
    return { travelTime: original, reduction: 0 };
  }
  const reduction = 5 + Math.floor(Math.min(Math.max(Number(random()) || 0, 0), 1 - Number.EPSILON) * 6);
  return { travelTime: Math.max(1, original - reduction), reduction: Math.min(reduction, original - 1) };
}

export function getPetTreasureRules(player) {
  if (!hasEquippedInnateTreasure(player, '炼妖壶')) {
    return { requiredMinutes: null, maxMinutes: null, rewardMultiplier: 1 };
  }
  return { requiredMinutes: 60, maxMinutes: 24 * 60, rewardMultiplier: 2 };
}

export function getPetAbilityBonus(pet, type) {
  const nativeBonus = pet?.type === type ? Number(pet?.加成) || 0 : 0;
  const inherited = pet?.炼妖继承能力;
  const inheritedBonus = inherited?.type === type ? Number(inherited?.加成) || 0 : 0;
  return nativeBonus + inheritedBonus;
}

export function getSmallWorldYieldMultiplier(player) {
  return hasEquippedInnateTreasure(player, '山河社稷图') ? 2 : 1;
}

export function getHabitatSlotBonus(player) {
  return hasEquippedInnateTreasure(player, '山河社稷图') ? 2 : 0;
}

export function getInnerWorldOpenChance(baseChance, player) {
  const chance = Math.min(1, Math.max(0, Number(baseChance) || 0));
  if (!hasEquippedInnateTreasure(player, '天地玄黄玲珑塔')) return chance;
  const guarded = player?.先天权柄?.玄黄护道待用 === true;
  return guarded ? 1 - (1 - chance) * 0.7 : chance;
}

export function consumeXuanhuangGuard(player) {
  if (!player?.先天权柄?.玄黄护道待用) return false;
  delete player.先天权柄.玄黄护道待用;
  return true;
}

export function getInnerWorldYieldMultiplier(player) {
  return hasEquippedInnateTreasure(player, '崆峒印') ? 1.3 : 1;
}

export function getTribulationDamageMultiplier(player) {
  return hasEquippedInnateTreasure(player, '天地玄黄玲珑塔') &&
    player?.先天权柄?.玄黄护道待用 === true
    ? 0.7
    : 1;
}

export function hasReincarnationProtection(player, now = Date.now()) {
  return hasEquippedInnateTreasure(player, '六道轮回盘') ||
    Number(player?.先天权柄?.轮回庇护截止) > now;
}

export function getKongtongModifiers(player, now = Date.now()) {
  const state = readInnateTreasureState();
  const owner = state.equipped?.['崆峒印'];
  const sectName = String(player?.宗门?.宗门名称 || '');
  const ownerOrSect = Boolean(owner) && (
    owner.ownerId === String(player?.id || '') ||
    (sectName && owner.sectName === sectName)
  );
  const decree = state.decree && Number(state.decree.expiresAt) > now ? state.decree : null;
  return {
    cultivationMultiplier: ownerOrSect ? 2 : 1,
    decree,
  };
}

export function getInnateDungeonRewardMultiplier(player, now = Date.now()) {
  const state = readInnateTreasureState();
  const decree = state.decree && Number(state.decree.expiresAt) > now
    ? state.decree
    : null;
  let multiplier = 1;
  if (decree?.type === '历练' && decree.plane === getPlayerPlaneName(player)) multiplier *= 2;
  if (player?.先天权柄?.盘古开天待用 === true) multiplier *= 2;
  return multiplier;
}

export function setKongtongDecree(ownerId, plane, type, now = Date.now()) {
  const state = readInnateTreasureState();
  state.decree = {
    ownerId: String(ownerId),
    plane,
    type,
    startedAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000,
    borrowedQqs: [],
  };
  writeInnateTreasureState(state);
  return state.decree;
}

export function claimKongtongBorrow(qq, now = Date.now()) {
  const state = readInnateTreasureState();
  const decree = state.decree;
  if (!decree || decree.type !== '修炼' || Number(decree.expiresAt) <= now) {
    return { ok: false, reason: 'inactive' };
  }
  if (!Array.isArray(decree.borrowedQqs)) decree.borrowedQqs = [];
  if (decree.borrowedQqs.includes(String(qq))) return { ok: false, reason: 'claimed' };
  decree.borrowedQqs.push(String(qq));
  writeInnateTreasureState(state);
  return { ok: true, decree };
}

export function formatCooldown(ms) {
  const minutes = Math.ceil(Math.max(0, ms) / 60000);
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours}小时`;
  return `${Math.ceil(hours / 24)}天`;
}
