import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPlayerPlaneName } from './planeCoords.js';
import { getDungeonGongfaReduction } from './gongfaProficiency.js';
import { hasPercentageStats } from './tianjiaoTaint.js';
import { isNameablePercentageEquipment } from './equipmentStats.js';
import { writeJsonAtomically } from '../utils/atomicJson.js';
import {
  DAO_TREASURE_ALL_ATTRIBUTE_BONUS,
  DAO_TREASURE_FIXED_ATTRIBUTES,
} from './daoTreasure.js';

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
  '太初仙刃',
  '无量天尺',
  '逐日仙辇',
  '造化仙池',
  '周天星辰旗',
  '万道神炉',
  '菩提祖树',
  '因果神灯',
  '万劫天碑',
  '定海珠',
]);

export const ETERNAL_MAP_NAME = '永恒仙图';
export const ETERNAL_MAP_COMPONENTS = Object.freeze([
  '太初仙刃', '无量天尺', '逐日仙辇', '造化仙池', '周天星辰旗',
  '万道神炉', '菩提祖树', '因果神灯', '万劫天碑',
]);
export const ETERNAL_MAP_SYNTHESIS_COSTS = Object.freeze({
  界核: 9,
  宇宙核心: 1,
  鸿蒙道火: 90,
});
export const ETERNAL_MAP_GESTATION_WORLD_YEARS = 9000;

export const CONTESTABLE_INNATE_TREASURE_NAMES = Object.freeze(
  INNATE_TREASURE_NAMES.filter(name => name !== '虚天舟')
);

export const CHAOS_PROTECTED_RARITY = 7;

const LEGACY_RARITY_RANK = Object.freeze({
  普通: 0, 锻造: 0, 稀有: 1, 珍贵: 2, 史诗: 3, 传说: 4,
  顶级: 5, 神级: 6, 仙级: 7, 先天: 8,
});

function readChaosItemRarity(item) {
  const rarity = Number(item?.稀有度);
  if (Number.isFinite(rarity)) return rarity;
  return LEGACY_RARITY_RANK[item?.type] ?? LEGACY_RARITY_RANK[item?.品级] ?? 0;
}

export function getChaosItemRarity(item, catalogItem = null) {
  return Math.max(readChaosItemRarity(item), readChaosItemRarity(catalogItem));
}

export function getChaosItemRestriction(item, catalogItem = null) {
  const inspected = catalogItem ? { ...catalogItem, ...item } : item;
  const name = item?.name || '该物品';
  if (item?.全服唯一 || catalogItem?.全服唯一) return `【${name}】具有全服唯一性，不可进行混沌复制或演化。`;
  if (name === '圣法碎片') return '【圣法碎片】具有唯一性，不可进行混沌复制或演化。';
  if (inspected?.type === '帝兵' && inspected?.author_name) {
    return `【${name}】是炼制帝兵，受本命烙印保护，不可进行混沌复制或演化。`;
  }
  if (hasPercentageStats(inspected) || isNameablePercentageEquipment(inspected)) {
    return `【${name}】是百分比装备，不可进行混沌复制或演化。`;
  }
  const rarity = getChaosItemRarity(item, catalogItem);
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
  太初仙刃: {
    title: '太初裁道',
    lore: '太初第一缕锋芒所化，专斩诸法尚未圆满之处。',
    summary: 'PVE无视防御，并可令下一场战斗的首击获得强化。',
    passives: ['PVE战斗中无视敌方15%防御。'],
    authorities: [
      { command: '#太初一斩', cooldownKey: '太初一斩', effect: '下一场战斗首次命中伤害提升至2.5倍；对首领额外增伤部分不超过其最大生命2%。' },
    ],
  },
  无量天尺: {
    title: '无量护世',
    lore: '尺量诸天，也量劫力，超出承受之限的毁灭皆被截断。',
    summary: '限制首次受击伤害，并可连续抵御三次攻击。',
    passives: ['每场战斗首次受到的伤害不超过自身最大生命45%。'],
    authorities: [
      { command: '#无量护身', cooldownKey: '无量护身', effect: '下一场战斗前3次受到的伤害降低20%。' },
    ],
  },
  逐日仙辇: {
    title: '逐光巡天',
    lore: '仙辇追逐大日横渡诸界，光阴与山河都在车轮下退去。',
    summary: '缩短位面穿梭时间并提升战斗速度。',
    passives: ['位面穿梭时间缩短15%；战斗速度提升10%。'],
    authorities: [],
  },
  造化仙池: {
    title: '造化回春',
    lore: '一池造化液孕育万灵，可补生命本源，也可滋养仙道根基。',
    summary: '强化治疗，并修复道伤、恢复生命本源、大幅提升仙道潜力。',
    passives: ['治疗效果提升25%。'],
    authorities: [
      { command: '#造化回春 [@玩家]', cooldownKey: '造化回春', effect: '为自己或同位面玩家恢复至自然生命本源上限、修复全部道伤并解除无法证道，增加500点仙道潜力。' },
    ],
  },
  周天星辰旗: {
    title: '周天列宿',
    lore: '诸天星斗皆为旗上道纹，展开时可调度群星护持同行之人。',
    summary: '提高队伍速度，并可在下一场战斗展开群体护盾。',
    passives: ['所在队伍全体战斗速度提升8%。'],
    authorities: [
      { command: '#星辰护界', cooldownKey: '星辰护界', effect: '下一场战斗为自己生成25%最大生命护盾，为队友生成15%最大生命护盾。' },
    ],
  },
  万道神炉: {
    title: '万道归炉',
    lore: '万道皆可为火，丹器入炉便在诸法共鸣中蜕变。',
    summary: '缩短炼丹炼器耗时、扩充炼器炉容量，并可令下一炉丹药多倍产出或炼器开炉获得系数加成。',
    passives: ['炼丹与炼器耗时缩短20%；炼器炉容量+5个格子；百分比装备属性溢出自动补偿至理论极限。'],
    authorities: [
      { command: '#万道开炉', cooldownKey: '万道开炉', effect: '锁定下一次普通丹药成功出炉倍率（70%为2倍、30%为3倍），或下一次炼器开炉系数+0.5，24小时内有效，可与仙宠双倍叠加。' },
    ],
  },
  菩提祖树: {
    title: '菩提道祖',
    lore: '祖树叶落一念明，枝桠间沉淀着诸世修士的悟道回响。',
    summary: '大幅提高修炼与悟道收益，并可顿悟悟道兼得闭关修行。',
    passives: ['修炼收益提升12500%；悟道收益提升200%。'],
    authorities: [
      { command: '#菩提悟道', cooldownKey: '菩提悟道', effect: '立刻无条件无代价获得一次顿悟的悟道，并直接获得闭关72小时的修为与血气收益。' },
    ],
  },
  因果神灯: {
    title: '照见因果',
    lore: '灯火照见因果来路，使缠身之债在光中显形并消散。',
    summary: '减少因果债获取，并可主动消减已有因果债。',
    passives: ['获得的因果债降低25%。'],
    authorities: [
      { command: '#因果净照', cooldownKey: '因果净照', effect: '消减40点因果债。' },
    ],
  },
  万劫天碑: {
    title: '万劫留痕',
    lore: '天碑铭刻诸世大劫，持碑者借万劫磨砺元神而不失本真。',
    summary: '降低渡劫伤害，并可恢复、永久淬炼元神上限。',
    passives: ['渡劫所受伤害降低15%。'],
    authorities: [
      { command: '#万劫淬神', cooldownKey: '万劫淬神', effect: '恢复50%最大元神，并永久增加当前元神上限的10%，淬炼次数不限。' },
    ],
  },
  定海珠: {
    title: '诸海之宗',
    lore: '混沌初开，二十四颗定海珠映照诸海诸天，珠光所至，风浪、时序与万法皆归宁定。',
    summary: '以定海护盾抵挡开局攻势，免疫首次控制，并可演化诸天反击攻盾之敌。',
    passives: [
      '镇海：战斗开始时获得20%最大生命护盾。',
      '每场战斗首次冻结、沉默、行动条推退或强制控制无效。',
    ],
    authorities: [
      { command: '#演化诸天', cooldownKey: '演化诸天', effect: '下一场战斗的定海护盾提升至50%最大生命；护盾破碎或持有者完成3次行动时，对最后攻击者返还实际吸收伤害的80%，且只结算一次。' },
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
  太初一斩: 24 * 60 * 60 * 1000,
  无量护身: 24 * 60 * 60 * 1000,
  造化回春: 7 * 24 * 60 * 60 * 1000,
  星辰护界: 24 * 60 * 60 * 1000,
  万道开炉: 72 * 60 * 60 * 1000,
  菩提悟道: 72 * 60 * 60 * 1000,
  因果净照: 7 * 24 * 60 * 60 * 1000,
  万劫淬神: 7 * 24 * 60 * 60 * 1000,
  演化诸天: 24 * 60 * 60 * 1000,
  永恒改命: 10 * 24 * 60 * 60 * 1000,
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
  return { owners: {}, equipped: {}, decree: null, landscapeRealms: [], eternalMap: null };
}

export function readInnateTreasureState(options = {}) {
  const strict = options === true || options?.strict === true;
  try {
    if (!fs.existsSync(STATE_FILE)) return defaultState();
    return { ...defaultState(), ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
  } catch (error) {
    if (strict) {
      const failure = new Error(`先天至宝全服状态读取失败：${error.message}`);
      failure.cause = error;
      throw failure;
    }
    console.error('[先天至宝] 读取全局状态失败:', error.message);
    return defaultState();
  }
}

export function writeInnateTreasureState(state) {
  writeJsonAtomically(STATE_FILE, state);
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

export function createEternalImmortalMap(ownerId, now = Date.now()) {
  return {
    id: 39_000_009,
    name: ETERNAL_MAP_NAME,
    class: '装备',
    type: '至宝',
    品阶: '大道至宝',
    大道至宝本体: true,
    永恒仙图本体: true,
    author_name: String(ownerId),
    绑定者: String(ownerId),
    固定全属性: DAO_TREASURE_FIXED_ATTRIBUTES,
    全属性倍率加成: DAO_TREASURE_ALL_ATTRIBUTE_BONUS,
    atk: 0,
    def: 0,
    HP: 0,
    bao: 0,
    全属性: 0,
    出售价: 0,
    pinji: 6,
    稀有度: 10,
    数量: 1,
    islockd: 1,
    不可交易: true,
    不可出售: true,
    合成时间: now,
  };
}

export function consumeEternalMapSynthesisMaterials(najie) {
  const materials = Array.isArray(najie?.材料) ? najie.材料 : [];
  const missing = Object.entries(ETERNAL_MAP_SYNTHESIS_COSTS)
    .map(([name, required]) => {
      const owned = materials
        .filter(item => item?.name === name)
        .reduce((sum, item) => sum + Math.max(0, Number(item.数量) || 0), 0);
      return owned >= required ? null : { name, required, owned };
    })
    .filter(Boolean);
  if (missing.length) return { ok: false, missing };

  for (const [name, required] of Object.entries(ETERNAL_MAP_SYNTHESIS_COSTS)) {
    let remaining = required;
    for (const item of materials) {
      if (item?.name !== name || remaining <= 0) continue;
      const consumed = Math.min(Math.max(0, Number(item.数量) || 0), remaining);
      item.数量 = (Number(item.数量) || 0) - consumed;
      remaining -= consumed;
    }
  }
  najie.材料 = materials.filter(item => (Number(item?.数量) || 0) > 0);
  return { ok: true };
}

export function getEternalMapGestationStatus(record, worldYear) {
  if (!record) return { phase: 'available', remainingWorldYears: 0 };
  if (record.status !== 'gestating') return { phase: 'formed', remainingWorldYears: 0 };
  const readyAtWorldYear = Number(record.readyAtWorldYear) || 0;
  const remainingWorldYears = Math.max(0, Math.ceil(readyAtWorldYear - (Number(worldYear) || 0)));
  return {
    phase: remainingWorldYears > 0 ? 'gestating' : 'ready',
    remainingWorldYears,
    readyAtWorldYear,
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

export function buildInnateTreasureTransfer(state, name, currentOwnerId, nextOwnerId, now = Date.now()) {
  if (!isInnateTreasureName(name)) return { ok: false, reason: 'unknown' };
  const currentOwner = String(currentOwnerId);
  const nextOwner = String(nextOwnerId);
  const ownerRecord = state?.owners?.[name];
  if (!ownerRecord) return { ok: false, reason: 'unclaimed' };
  if (String(ownerRecord.ownerId) !== currentOwner) {
    return { ok: false, reason: 'not-owner', ownerId: String(ownerRecord.ownerId) };
  }
  if (currentOwner === nextOwner) return { ok: false, reason: 'same-owner' };

  const nextState = JSON.parse(JSON.stringify({ ...defaultState(), ...(state || {}) }));
  nextState.owners ||= {};
  nextState.equipped ||= {};
  nextState.owners[name] = {
    ownerId: nextOwner,
    claimedAt: now,
    previousOwnerId: currentOwner,
    transferredAt: now,
  };
  delete nextState.equipped[name];
  return { ok: true, name, ownerId: nextOwner, previousOwnerId: currentOwner, nextState };
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

function authorityCommandKey(command) {
  return String(command || '').trim().replace(/^#/, '').split(/\s+/)[0];
}

function normalizeAuthorityLookupKey(value) {
  return authorityCommandKey(value) || String(value || '').trim();
}

function catalogAuthorityDescriptor(entry = {}) {
  const requestedName = String(entry.sourceTreasureName || entry.sourceTreasureId || '').trim();
  const requestedKeys = [entry.cooldownKey, entry.authorityKey, entry.command, entry.name]
    .map(normalizeAuthorityLookupKey)
    .filter(Boolean);
  const catalogs = requestedName && INNATE_TREASURE_CATALOG[requestedName]
    ? [[requestedName, INNATE_TREASURE_CATALOG[requestedName]]]
    : Object.entries(INNATE_TREASURE_CATALOG);

  for (const [treasureName, catalog] of catalogs) {
    for (const authority of catalog.authorities || []) {
      const commandKey = authorityCommandKey(authority.command);
      const aliases = [authority.cooldownKey, commandKey, authority.command]
        .map(normalizeAuthorityLookupKey)
        .filter(Boolean);
      if (!aliases.some(alias => requestedKeys.includes(alias))) continue;
      return {
        treasureName,
        name: authority.cooldownKey || commandKey,
        authorityKey: authority.cooldownKey || commandKey,
        cooldownKey: authority.cooldownKey || '',
        command: authority.command || '',
        effect: authority.effect || '',
        passive: false,
      };
    }
    for (const [index, effect] of (catalog.passives || []).entries()) {
      const displayName = `${catalog.title || treasureName}·被动${index + 1}`;
      const passiveKey = `被动:${index + 1}`;
      const aliases = [displayName, passiveKey, effect]
        .map(normalizeAuthorityLookupKey)
        .filter(Boolean);
      if (!aliases.some(alias => requestedKeys.includes(alias))) continue;
      return {
        treasureName,
        name: displayName,
        authorityKey: passiveKey,
        cooldownKey: '',
        command: '',
        effect,
        passive: true,
      };
    }
  }
  return null;
}

export function createOtherShoreDaoTreasureRuntime(item) {
  const isOtherShoreTreasure = item?.彼岸大道至宝 === true ||
    (item?.大道至宝本体 === true && Array.isArray(item?.authorities));
  if (!isOtherShoreTreasure || !item?.name || !Array.isArray(item.authorities)) return null;
  const authorities = item.authorities.map((entry, index) => {
    const source = entry && typeof entry === 'object' ? entry : { name: entry };
    const descriptor = catalogAuthorityDescriptor(source);
    if (!descriptor) return null;
    return {
      id: String(source.id || `${item.name}:authority:${index + 1}`),
      ...descriptor,
      enhanced: source.enhanced === true,
      mode: String(source.mode || ''),
    };
  }).filter(Boolean);
  const rawMultiplier = Number(item.冷却倍率 ?? item.cooldownMultiplier);
  return {
    name: String(item.name),
    sourceForgeId: String(item.sourceForgeId || ''),
    cooldownMultiplier: Number.isFinite(rawMultiplier)
      ? Math.max(0.05, Math.min(1, rawMultiplier))
      : 1,
    authorities,
  };
}

export function getEquippedOtherShoreDaoAuthority(player, treasureName = '', authorityKey = '') {
  const runtime = player?.彼岸大道至宝运行时;
  if (!runtime || String(runtime.name || '') !== String(player?.当前大道至宝 || '')) return null;
  const requestedTreasure = String(treasureName || '');
  const requestedKey = normalizeAuthorityLookupKey(authorityKey);
  return (runtime.authorities || []).find((authority) => {
    if (requestedTreasure && authority.treasureName !== requestedTreasure) return false;
    if (!requestedKey) return authority.passive === true;
    return [authority.authorityKey, authority.cooldownKey, authority.name, authority.command]
      .map(normalizeAuthorityLookupKey)
      .filter(Boolean)
      .includes(requestedKey);
  }) || null;
}

export function hasEquippedInnateTreasure(player, name, authorityKey = '') {
  if (player?.当前先天至宝 === name ||
    (player?.当前大道至宝 === ETERNAL_MAP_NAME && ETERNAL_MAP_COMPONENTS.includes(name))) {
    return true;
  }
  return Boolean(getEquippedOtherShoreDaoAuthority(player, name, authorityKey));
}

export function applyDinghaiBattleOpening(holder, { active = false, shieldField = '护盾值' } = {}) {
  const shieldPassive = hasEquippedInnateTreasure(holder, '定海珠', '被动:1');
  const controlPassive = hasEquippedInnateTreasure(holder, '定海珠', '被动:2');
  const evolutionAuthority = active && hasEquippedInnateTreasure(holder, '定海珠', '演化诸天');
  if (!shieldPassive && !controlPassive && !evolutionAuthority) return { active: false, shield: 0 };
  const blockedOpeningControl = Boolean(holder.dongjie || Number(holder._东皇冻结回合) > 0);
  const maxHp = Math.max(1, Number(holder.血量上限) || Number(holder.当前血量) || 1);
  const shield = shieldPassive || evolutionAuthority
    ? Math.max(1, Math.floor(maxHp * (evolutionAuthority ? 0.5 : 0.2)))
    : 0;
  holder[shieldField] = Math.max(0, Number(holder[shieldField]) || 0) + shield;
  holder._定海珠护盾字段 = shieldField;
  holder._定海珠护盾值 = shield;
  holder._定海珠控制免疫 = controlPassive && !blockedOpeningControl;
  if (controlPassive && blockedOpeningControl) {
    holder.dongjie = false;
    holder._东皇冻结回合 = 0;
  }
  holder._定海珠演化激活 = evolutionAuthority;
  holder._定海珠演化剩余行动 = evolutionAuthority ? 3 : 0;
  holder._定海珠吸收伤害 = 0;
  holder._定海珠最后攻击者 = null;
  holder._定海珠反击已结算 = false;
  return { active: evolutionAuthority, shield, blockedOpeningControl: controlPassive && blockedOpeningControl };
}

export function consumeDinghaiControlImmunity(holder) {
  if (!holder?._定海珠控制免疫) return false;
  holder._定海珠控制免疫 = false;
  return true;
}

function isDinghaiBoss(target) {
  return target?.boss === true || target?.type === 'boss' ||
    /BOSS|Boss|首领|天骄/.test(String(target?.名号 || target?.name || ''));
}

function settleDinghaiEvolution(holder, reason) {
  if (!holder?._定海珠演化激活 || holder._定海珠反击已结算) {
    return { ended: false, damage: 0, target: null, reason };
  }
  holder._定海珠演化激活 = false;
  holder._定海珠反击已结算 = true;
  holder._定海珠演化剩余行动 = 0;

  const shieldField = holder._定海珠护盾字段 || '护盾值';
  const ownShield = Math.max(0, Number(holder._定海珠护盾值) || 0);
  holder[shieldField] = Math.max(0, (Number(holder[shieldField]) || 0) - ownShield);
  holder._定海珠护盾值 = 0;

  const target = holder._定海珠最后攻击者;
  const absorbed = Math.max(0, Number(holder._定海珠吸收伤害) || 0);
  if (!target || absorbed <= 0 || Number(target.当前血量) <= 0) {
    return { ended: true, damage: 0, target, reason };
  }
  const orbMultiplier = Math.max(0, Number(holder.法球倍率 ?? holder.灵根?.法球倍率 ?? 1) || 0);
  const attackCap = Math.max(0, Math.floor((Number(holder.攻击) || 0) * orbMultiplier * 3));
  const bossCap = isDinghaiBoss(target)
    ? Math.max(0, Math.floor((Number(target.血量上限) || Number(target.当前血量) || 0) * 0.03))
    : Number.POSITIVE_INFINITY;
  const damage = Math.max(0, Math.min(Math.floor(absorbed * 0.8), attackCap, bossCap));
  target.当前血量 = Math.max(0, (Number(target.当前血量) || 0) - damage);
  return { ended: true, damage, target, reason };
}

export function recordDinghaiShieldAbsorption(holder, attacker, absorbed) {
  const ownShield = Math.max(0, Number(holder?._定海珠护盾值) || 0);
  const amount = Math.min(ownShield, Math.max(0, Number(absorbed) || 0));
  if (amount <= 0) return { ended: false, damage: 0, target: null };
  holder._定海珠护盾值 = ownShield - amount;
  holder._定海珠吸收伤害 = Math.max(0, Number(holder._定海珠吸收伤害) || 0) + amount;
  if (attacker) holder._定海珠最后攻击者 = attacker;
  return holder._定海珠护盾值 <= 0
    ? settleDinghaiEvolution(holder, '护盾破碎')
    : { ended: false, damage: 0, target: null };
}

export function tickDinghaiEvolution(holder) {
  if (!holder?._定海珠演化激活 || holder._定海珠反击已结算) {
    return { ended: false, damage: 0, target: null };
  }
  holder._定海珠演化剩余行动 = Math.max(0, Number(holder._定海珠演化剩余行动) - 1);
  return holder._定海珠演化剩余行动 <= 0
    ? settleDinghaiEvolution(holder, '三次行动完成')
    : { ended: false, damage: 0, target: null };
}

export function getAuthorityState(player) {
  if (!player.先天权柄 || typeof player.先天权柄 !== 'object') player.先天权柄 = {};
  if (!player.先天权柄.冷却 || typeof player.先天权柄.冷却 !== 'object') {
    player.先天权柄.冷却 = {};
  }
  return player.先天权柄;
}

const TREASURE_AUTHORITY_STATE_KEYS = Object.freeze({
  太极图: Object.freeze(['太极模式', '阴阳逆转待用']),
  盘古幡: Object.freeze(['盘古开天待用']),
  诛仙四剑: Object.freeze(['诛仙剑阵待用']),
  天地玄黄玲珑塔: Object.freeze(['玄黄护道待用']),
  东皇钟: Object.freeze(['东皇镇世待用']),
  太初仙刃: Object.freeze(['太初仙刃首击待用']),
  无量天尺: Object.freeze(['无量护身待用']),
  周天星辰旗: Object.freeze(['星辰护界待用']),
  万道神炉: Object.freeze(['万道开炉待用']),
  定海珠: Object.freeze(['定海珠演化待用']),
});

export function clearInnateTreasureAuthorityState(player, treasureName) {
  const state = getAuthorityState(player);
  const cooldownKeys = (INNATE_TREASURE_CATALOG[treasureName]?.authorities || [])
    .map(authority => authority.cooldownKey)
    .filter(Boolean);
  for (const key of cooldownKeys) delete state.冷却[key];
  for (const key of TREASURE_AUTHORITY_STATE_KEYS[treasureName] || []) delete state[key];
  return player;
}

export function transferInnateTreasureAuthorityState(sourcePlayer, targetPlayer, treasureName) {
  const source = getAuthorityState(sourcePlayer);
  const target = getAuthorityState(targetPlayer);
  const cooldownKeys = (INNATE_TREASURE_CATALOG[treasureName]?.authorities || [])
    .map(authority => authority.cooldownKey)
    .filter(Boolean);
  for (const key of cooldownKeys) {
    const sourceExpiry = Number(source.冷却[key]) || 0;
    if (sourceExpiry > 0) target.冷却[key] = Math.max(Number(target.冷却[key]) || 0, sourceExpiry);
    delete source.冷却[key];
  }
  for (const key of TREASURE_AUTHORITY_STATE_KEYS[treasureName] || []) {
    delete target[key];
    if (Object.prototype.hasOwnProperty.call(source, key)) target[key] = source[key];
    delete source[key];
  }
  return { sourcePlayer, targetPlayer };
}

export function getCooldownRemaining(player, key, now = Date.now()) {
  const expiresAt = Number(player?.先天权柄?.冷却?.[key]) || 0;
  return Math.max(0, expiresAt - now);
}

export function startAuthorityCooldown(player, key, now = Date.now()) {
  const duration = AUTHORITY_COOLDOWNS[key];
  if (!duration) throw new Error(`未知权柄冷却：${key}`);
  const inherited = getEquippedOtherShoreDaoAuthority(player, '', key);
  const multiplier = inherited
    ? Math.max(0.05, Math.min(1, Number(player.彼岸大道至宝运行时?.cooldownMultiplier) || 1))
    : 1;
  const expiresAt = now + Math.max(1, Math.round(duration * multiplier));
  getAuthorityState(player).冷却[key] = expiresAt;
  return expiresAt;
}

export function getTimedActionMultiplier(player) {
  if (hasEquippedInnateTreasure(player, '混沌钟', '被动:1')) return 0.7;
  if (hasEquippedInnateTreasure(player, '东皇钟', '被动:1')) return 0.8;
  return 1;
}

export function getCraftingTimedActionMultiplier(player) {
  return getTimedActionMultiplier(player) * (hasEquippedInnateTreasure(player, '万道神炉', '被动:1') ? 0.8 : 1);
}

export function getInnateSpeedMultiplier(player) {
  return hasEquippedInnateTreasure(player, '逐日仙辇', '被动:1') ? 1.1 : 1;
}

export function getCausalDebtMultiplier(player) {
  return hasEquippedInnateTreasure(player, '因果神灯', '被动:1') ? 0.75 : 1;
}

export function consumeAlchemyMultiplier(player, now = Date.now()) {
  const state = getAuthorityState(player);
  const pending = state.万道开炉待用;
  if (!pending || Number(pending.expiresAt) <= now || !hasEquippedInnateTreasure(player, '万道神炉', '万道开炉')) {
    if (pending && Number(pending.expiresAt) <= now) delete state.万道开炉待用;
    return 1;
  }
  delete state.万道开炉待用;
  return Number(pending.multiplier) === 3 ? 3 : 2;
}

export function temperMyriadTribulationSpirit(player) {
  const state = getAuthorityState(player);
  const currentMax = Math.max(1, Math.floor(Number(player.元神上限) || Number(player.元神) || 1));
  const previousCount = Math.max(0, Math.floor(Number(state.万劫淬神次数) || 0));
  player.元神上限 = currentMax + Math.max(1, Math.floor(currentMax * 0.1));
  state.万劫淬神次数 = previousCount + 1;
  const restored = Math.floor(player.元神上限 * 0.5);
  player.元神 = Math.min(player.元神上限, Math.max(0, Number(player.元神) || 0) + restored);
  return { increased: true, count: state.万劫淬神次数, restored, max: player.元神上限 };
}

export function tryEternalFateRewrite(player, now = Date.now()) {
  if (player?.当前大道至宝 !== ETERNAL_MAP_NAME || getCooldownRemaining(player, '永恒改命', now) > 0) {
    return false;
  }
  startAuthorityCooldown(player, '永恒改命', now);
  player.当前血量 = Math.max(1, Number(player.当前血量) || 0);
  player.元神 = Math.max(1, Number(player.元神) || 0);
  player.修仙状态 = '空闲';
  player.道果状态 = '永恒仙图·既定命运改写';
  getAuthorityState(player).永恒改命记录 = [
    ...(Array.isArray(player.先天权柄.永恒改命记录) ? player.先天权柄.永恒改命记录 : []),
    { type: '身灭道消', at: now, state: 'rewritten' },
  ].slice(-10);
  return true;
}

export function applyNewTreasureDamageRules(attacker, defender, damage) {
  let result = Math.max(0, Math.floor(Number(damage) || 0));
  const messages = [];
  if (attacker?._太初仙刃首击倍率) {
    const base = result;
    const desiredExtra = Math.floor(base * (Number(attacker._太初仙刃首击倍率) - 1));
    const boss = defender?.boss === true || defender?.type === 'boss' || /BOSS|Boss|首领|天骄/.test(String(defender?.名号 || defender?.name || ''));
    const extra = boss
      ? Math.min(desiredExtra, Math.floor((Number(defender?.血量上限) || Number(defender?.当前血量) || 0) * 0.02))
      : desiredExtra;
    result += Math.max(0, extra);
    delete attacker._太初仙刃首击倍率;
    messages.push(`【太初一斩】${attacker.名号 || '持刃者'}的首次命中迸发太初锋芒。`);
  }
  if (Number(defender?._无量护身剩余) > 0) {
    result = Math.floor(result * 0.8);
    defender._无量护身剩余 -= 1;
    messages.push(`【无量护身】${defender.名号 || '持尺者'}将本次伤害削减20%。`);
  }
  if (defender?._无量天尺首伤上限) {
    result = Math.min(result, Math.max(1, Math.floor(Number(defender._无量天尺首伤上限))));
    delete defender._无量天尺首伤上限;
    messages.push(`【无量天尺】首次受击伤害被截断在最大生命45%以内。`);
  }
  return { damage: result, messages };
}

export function getDungeonTimedActionMultiplier(player) {
  const technique = getDungeonGongfaReduction(player);
  return Math.max(0.5, getTimedActionMultiplier(player) * (1 - technique.rate));
}

export function applyInnateTravelReduction(player, travelTime, random = Math.random) {
  const original = Math.max(1, Math.ceil(Number(travelTime) || 1));
  if (hasEquippedInnateTreasure(player, '逐日仙辇', '被动:1')) {
    const travelTime = Math.max(1, Math.ceil(original * 0.85));
    return { travelTime, reduction: original - travelTime };
  }
  if (!hasEquippedInnateTreasure(player, '虚天舟', '被动:1')) {
    return { travelTime: original, reduction: 0 };
  }
  const reduction = 5 + Math.floor(Math.min(Math.max(Number(random()) || 0, 0), 1 - Number.EPSILON) * 6);
  return { travelTime: Math.max(1, original - reduction), reduction: Math.min(reduction, original - 1) };
}

export function getPetTreasureRules(player) {
  if (!hasEquippedInnateTreasure(player, '炼妖壶', '被动:1')) {
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
  return hasEquippedInnateTreasure(player, '山河社稷图', '被动:1') ? 2 : 1;
}

export function getHabitatSlotBonus(player) {
  return hasEquippedInnateTreasure(player, '山河社稷图', '被动:1') ? 2 : 0;
}

export function getInnerWorldOpenChance(baseChance, player) {
  const chance = Math.min(1, Math.max(0, Number(baseChance) || 0));
  if (!hasEquippedInnateTreasure(player, '天地玄黄玲珑塔', '玄黄护道')) return chance;
  const guarded = player?.先天权柄?.玄黄护道待用 === true;
  return guarded ? 1 - (1 - chance) * 0.7 : chance;
}

export function consumeXuanhuangGuard(player) {
  if (!player?.先天权柄?.玄黄护道待用) return false;
  delete player.先天权柄.玄黄护道待用;
  return true;
}

export function getInnerWorldYieldMultiplier(player) {
  return hasEquippedInnateTreasure(player, '崆峒印', '被动:2') ? 1.3 : 1;
}

export function getTribulationDamageMultiplier(player) {
  const xuanhuang = hasEquippedInnateTreasure(player, '天地玄黄玲珑塔', '玄黄护道') &&
    player?.先天权柄?.玄黄护道待用 === true
    ? 0.7
    : 1;
  return xuanhuang * getPassiveTribulationDamageMultiplier(player);
}

export function getPassiveTribulationDamageMultiplier(player) {
  return hasEquippedInnateTreasure(player, '万劫天碑', '被动:1') ? 0.85 : 1;
}

export function hasReincarnationProtection(player, now = Date.now()) {
  return hasEquippedInnateTreasure(player, '六道轮回盘', '被动:1') ||
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
    // 菩提祖树：修炼收益 +12500%（×126）、悟道收益 +200%（×3）
    cultivationMultiplier: (ownerOrSect ? 2 : 1) * (hasEquippedInnateTreasure(player, '菩提祖树', '被动:1') ? 126 : 1),
    wudaoMultiplier: hasEquippedInnateTreasure(player, '菩提祖树', '被动:1') ? 3 : 1,
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
