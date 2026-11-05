import { hasSuiyunAuthority } from './suiyunAuthority.js';
import { addGongfaProficiency, getGongfaProficiencyProfile } from './gongfaProficiency.js';
import { reduceTribulationDamageByDefense } from './tribulationDamage.js';
import { getPassiveTribulationDamageMultiplier } from './innateTreasure.js';
import { getExtraCultivationLevelProduct } from './extraCultivation.js';
import {getFlowerPollenProgression} from './flowerPollenProgression.js';
import {getFlowerBranchState,normalizeFlowerBranchState} from './flowerPollenBranch.js';

export const FLOWER_POLLEN_MEDIA = Object.freeze({
  普通进化花粉: Object.freeze({ quality: 1, chance: 0.05, risk: 12, accumulation: 10 }),
  灵性进化花粉: Object.freeze({ quality: 2, chance: 0.12, risk: 8, accumulation: 14 }),
  神性进化花粉: Object.freeze({ quality: 3, chance: 0.2, risk: 4, accumulation: 20 }),
  无暇进化花粉: Object.freeze({ quality: 4, chance: 0.3, risk: 1, accumulation: 28 }),
});

const BREATHING_BONUSES = Object.freeze({
  基础呼吸法: 0.03,
  形意呼吸法: 0.06,
  太极呼吸法: 0.08,
  大雷音呼吸法: 0.12,
  道引呼吸法: 0.16,
  盗引呼吸法: 0.2,
});

// 异果是花粉路的高收益加速物，但会留下不可忽视的进化根基损伤。
export const FLOWER_FRUITS = Object.freeze({
  进化异果: Object.freeze({ quality: 1, accumulation: 48, rootDamage: 8, risk: 5, pollution: 2, description: '前期异花结出的进化果实' }),
  本源异果: Object.freeze({ quality: 2, accumulation: 120, rootDamage: 16, risk: 8, pollution: 5, description: '蕴含本源生命因子的异果' }),
  祖种异果: Object.freeze({ quality: 3, accumulation: 280, rootDamage: 28, risk: 12, pollution: 9, description: '接近花粉祖种的禁忌果实' }),
});
export const FLOWER_ROOT_DAMAGE_MAX = 100;

// 花粉路祖种：独立于普通异果的三次悟道与异果孕育状态。
export const FLOWER_ANCESTOR_SEED_NAME = '花粉路祖种';
export const SUPER_FLOWER_FRUIT_NAME = '超级异果';
export const FLOWER_ANCESTOR_BREEDING_MS = 8 * 60 * 60 * 1000;
export const FLOWER_ANCESTOR_DORMANT_MS = 24 * 60 * 60 * 1000;
export const FLOWER_ANCESTOR_WUDAO_LIMIT = 3;
export const FLOWER_ANCESTOR_WUDAO_MULTIPLIER = 3;

const EXTREME_TRIALS = Object.freeze({
  2: [{ name: '本源觉醒', accumulation: 40 }],
  3: [
    { name: '十二枷锁尽断', accumulation: 60 },
    { name: '第一隐藏枷锁', accumulation: 80, requires: '十二枷锁尽断' },
    { name: '第二隐藏枷锁', accumulation: 100, requires: '第一隐藏枷锁' },
    { name: '第三隐藏枷锁', accumulation: 120, requires: '第二隐藏枷锁' },
  ],
  4: [{ name: '无敌画卷', accumulation: 100, requires: '十二枷锁尽断' }],
  5: [{ name: '观想真形', accumulation: 120 }],
  10: [{ name: '大圣道果', accumulation: 160, maxRisk: 100 }],
  14: [{ name: '恒王道果', accumulation: 200, maxRisk: 80 }],
  16: [{ name: '究极根基', accumulation: 240, maxRisk: 35 }],
  17: [
    { name: '大宇净化', accumulation: 260, branch: '大宇' },
    { name: '究极道果', accumulation: 260, branch: '究极' },
  ],
  21: [{ name: '道祖道果', accumulation: 320, maxRisk: 70 }],
  22: [{ name: '路尽道果', accumulation: 380, maxRisk: 60 }],
  23: [{ name: '祭道蜕变', accumulation: 450, maxRisk: 50 }],
});

// 花粉路高阶突破前先圆满独立道则。
export const FLOWER_DAO_DAILY_LIMIT = 3;
export const FLOWER_DAO_RULES = Object.freeze([
  Object.freeze({ realmId: 9, key: 'saintPrinciple', name: '圣者花粉道则', targetExp: 600, baseGain: 24, nextRealm: '圣者境' }),
  Object.freeze({ realmId: 11, key: 'reflectionPrinciple', name: '映照法则', targetExp: 1200, baseGain: 40, nextRealm: '神祇境' }),
  Object.freeze({ realmId: 14, key: 'godKingPrinciple', name: '神王道则', targetExp: 2400, baseGain: 80, nextRealm: '天尊境' }),
  Object.freeze({ realmId: 16, key: 'originPrinciple', name: '混元本源法则', targetExp: 4800, baseGain: 160, nextRealm: '大宇/究极境' }),
  Object.freeze({ realmId: 19, key: 'immortalKingPrinciple', name: '仙王道则', targetExp: 9600, baseGain: 320, nextRealm: '仙王巨头' }),
  Object.freeze({ realmId: 21, key: 'ancestorPrinciple', name: '道祖法则', targetExp: 19200, baseGain: 640, nextRealm: '路尽级仙帝' }),
  Object.freeze({ realmId: 22, key: 'roadEndPrinciple', name: '路尽法则', targetExp: 38400, baseGain: 1280, nextRealm: '祭道' }),
  Object.freeze({ realmId: 23, key: 'sacrificePrinciple', name: '祭道法则', targetExp: 76800, baseGain: 2560, nextRealm: '祭道之上' }),
  Object.freeze({ realmId: 24, key: 'beyondPrinciple', name: '超脱法则', targetExp: 153600, baseGain: 5120, nextRealm: '唯一道之上' }),
]);

// 高阶节点触发多阶段花粉蜕变劫，前期仍保持轻量进化节奏。
export const FLOWER_BREAKTHROUGH_RULES = Object.freeze({
  9: Object.freeze({ name: '圣者蜕变劫', stages: Object.freeze(['圣域显化', '花粉潮汐', '道果定型']) }),
  11: Object.freeze({ name: '映照花粉劫', stages: Object.freeze(['映照自身', '诸天回响', '法则定型']) }),
  14: Object.freeze({ name: '神王生命劫', stages: Object.freeze(['神王真形', '万道共振', '神王道果', '始祖注视']) }),
  16: Object.freeze({ name: '混元本源劫', stages: Object.freeze(['混元归一', '本源反噬', '大宇门槛', '究极定型']) }),
  19: Object.freeze({ name: '仙王不朽劫', stages: Object.freeze(['不朽真形', '界海回响', '王域成环']) }),
  21: Object.freeze({ name: '道祖开路劫', stages: Object.freeze(['文明道火', '诸天映照', '道祖立誓', '祖源反扑']) }),
  22: Object.freeze({ name: '路尽终极劫', stages: Object.freeze(['路尽回望', '万道寂灭', '自身路尽']) }),
  23: Object.freeze({ name: '祭道升华劫', stages: Object.freeze(['焚尽旧道', '祭掉因果', '新道重燃']) }),
  24: Object.freeze({ name: '超脱蜕变劫', stages: Object.freeze(['诸世剥离', '唯一真形', '超脱定锚']) }),
});

export const FLOWER_BRANCH_PROFILES = Object.freeze({
  大宇: Object.freeze({ name: '大宇', attackRate: 0.08, defenseRate: 0, healthRate: 0.03, chanceShift: -0.02, mutationMultiplier: 1.25, daoBonus: 0.12, description: '爆发更强，污染和异变更易积累' }),
  究极: Object.freeze({ name: '究极', attackRate: 0.03, defenseRate: 0.08, healthRate: 0.06, chanceShift: 0.04, mutationMultiplier: 0.75, daoBonus: 0.08, description: '根基更稳，净化和悟道效率更高' }),
  宇究: Object.freeze({ name: '宇究', attackRate: 0.06, defenseRate: 0.06, healthRate: 0.06, chanceShift: 0.02, mutationMultiplier: 0.9, daoBonus: 0.15, description: '两条支路归一，攻守兼备' }),
});
const NEUTRAL_FLOWER_BRANCH = Object.freeze({
  name: '未分支',
  attackRate: 0,
  defenseRate: 0,
  healthRate: 0,
  chanceShift: 0,
  mutationMultiplier: 1,
  daoBonus: 0,
  description: '尚未进入大宇/究极分支',
});

// 花粉路专属渡劫：渡劫通过后才能进行对应境界跃迁。
export const FLOWER_TRIBULATION_RULES = Object.freeze({
  5: Object.freeze({ name: '观想花劫', stages: Object.freeze(['花粉入梦', '观想真形', '神魂定锚']), baseChance: 0.82, costRate: 0.04, failureRisk: 6, failurePollution: 4, rewardAccumulation: 24, riskRelief: 8, pollutionRelief: 4 }),
  7: Object.freeze({ name: '王境花劫', stages: Object.freeze(['王域初鸣', '血肉重塑', '王道落印']), baseChance: 0.78, costRate: 0.05, failureRisk: 8, failurePollution: 5, rewardAccumulation: 32, riskRelief: 10, pollutionRelief: 5 }),
  9: Object.freeze({ name: '圣者花劫', stages: Object.freeze(['圣域显化', '花粉潮汐', '圣道定锚']), baseChance: 0.72, costRate: 0.06, failureRisk: 10, failurePollution: 7, rewardAccumulation: 45, riskRelief: 14, pollutionRelief: 7 }),
  11: Object.freeze({ name: '映照诸天劫', stages: Object.freeze(['映照自身', '诸天回响', '真灵分光', '法则归一']), baseChance: 0.68, costRate: 0.07, failureRisk: 12, failurePollution: 8, rewardAccumulation: 60, riskRelief: 16, pollutionRelief: 8 }),
  14: Object.freeze({ name: '神王生命劫', stages: Object.freeze(['神王真形', '万道共振', '生命跃迁', '神王道果']), baseChance: 0.64, costRate: 0.08, failureRisk: 14, failurePollution: 9, rewardAccumulation: 80, riskRelief: 18, pollutionRelief: 9 }),
  16: Object.freeze({ name: '混元本源劫', stages: Object.freeze(['混元归一', '本源反噬', '大宇门槛', '究极定型']), baseChance: 0.6, costRate: 0.09, failureRisk: 16, failurePollution: 10, rewardAccumulation: 100, riskRelief: 20, pollutionRelief: 10 }),
  17: Object.freeze({ name: '大宇究极分岔劫', stages: Object.freeze(['分支显影', '道果分岔', '自身路定型']), baseChance: 0.58, costRate: 0.1, failureRisk: 18, failurePollution: 12, rewardAccumulation: 120, riskRelief: 22, pollutionRelief: 12 }),
  19: Object.freeze({ name: '仙王不朽劫', stages: Object.freeze(['不朽真形', '界海回响', '王域成环', '仙王道果']), baseChance: 0.54, costRate: 0.11, failureRisk: 20, failurePollution: 14, rewardAccumulation: 150, riskRelief: 24, pollutionRelief: 14 }),
  21: Object.freeze({ name: '道祖开路劫', stages: Object.freeze(['文明道火', '诸天映照', '祖源反扑', '道祖立誓']), baseChance: 0.5, costRate: 0.12, failureRisk: 22, failurePollution: 16, rewardAccumulation: 190, riskRelief: 26, pollutionRelief: 16 }),
  22: Object.freeze({ name: '路尽终极劫', stages: Object.freeze(['路尽回望', '万道寂灭', '自身路尽', '终极定锚']), baseChance: 0.46, costRate: 0.13, failureRisk: 24, failurePollution: 18, rewardAccumulation: 240, riskRelief: 28, pollutionRelief: 18 }),
  23: Object.freeze({ name: '祭道焚因果劫', stages: Object.freeze(['焚尽旧道', '祭掉因果', '新道重燃', '祭道定形']), baseChance: 0.42, costRate: 0.14, failureRisk: 26, failurePollution: 20, rewardAccumulation: 300, riskRelief: 30, pollutionRelief: 20 }),
  24: Object.freeze({ name: '超脱离尘劫', stages: Object.freeze(['诸世剥离', '唯一真形', '超脱定锚', '彼岸回望']), baseChance: 0.38, costRate: 0.15, failureRisk: 28, failurePollution: 22, rewardAccumulation: 360, riskRelief: 32, pollutionRelief: 22 }),
});
// ==== 花粉渡劫·伤害模型（对标遮天渡劫）====
// 雷劫基准总缩放：调平衡只改这一个数（对标 TRIBULATION_BASE_ATK_SCALE）
export const FLOWER_TRIBULATION_ATK_SCALE = 1;
// 每阶段雷劫道数（用户定档：每个阶段至少 10 道）
export const FLOWER_TRIBULATION_WAVES_PER_STAGE = 10;
// 每道雷劫间隔（毫秒）：对标遮天 10 秒，QQ 群取 3 秒平衡节奏
export const FLOWER_TRIBULATION_WAVE_INTERVAL_MS = 3000;
// 劫难倍率（对标 ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS，按花粉路数值规模标定）
// 校准基准：9级圣者花劫 四体系基础攻 7200万 下，倍率3 → 无装备必死/中配需复活搏/高配稳过。
// 全局再缩放用 FLOWER_TRIBULATION_ATK_SCALE。
export const FLOWER_TRIBULATION_DAMAGE_MULTIPLIERS = Object.freeze({
  5: 2, 7: 3, 9: 3, 11: 4, 14: 5, 16: 6, 17: 5, 19: 7, 21: 8, 22: 9, 23: 11, 24: 13,
});
// 阶段伤害系数（对标遮天 0.05→0.15→0.4→1.0 阶梯，按阶段数取表）
export const FLOWER_TRIBULATION_STAGE_RATIOS = Object.freeze({
  3: Object.freeze([0.25, 0.6, 1.0]),
  4: Object.freeze([0.2, 0.45, 0.75, 1.0]),
});
// 时代难度系数：神话/太古/天命/末法/绝灵（与时代成功率偏移同向，时代越差天劫越凶）
export const FLOWER_TRIBULATION_ERA_DIFFICULTY = Object.freeze([0.8, 0.85, 1.0, 1.3, 1.6]);
// 失败保护：每失败 1 次，下次渡劫雷劫伤害 -3%，上限 -15%（伤害模型保底）
export const FLOWER_TRIBULATION_FAILURE_PROTECTION = 0.03;
export const FLOWER_TRIBULATION_FAILURE_PROTECTION_CAP = 0.15;

// ==== 进化成本（用户定档：1亿 × 2^等级，受时代影响）====
export const EVOLUTION_BASE_COST = 100000000;

// 时代消耗系数：与 Level.js 时代口径保持一致（神话-25% / 太古-20% / 天命 / 末法×2 / 绝灵×3）
export const ERA_COST_RATES = Object.freeze([0.75, 0.8, 1.0, 2.0, 3.0]);
// 时代成功率偏移：神话+8% / 太古+4% / 天命0 / 末法-8% / 绝灵-15%
export const ERA_CHANCE_SHIFTS = Object.freeze([0.08, 0.04, 0, -0.08, -0.15]);
export const ERA_NAMES = Object.freeze(['神话时代', '太古时代', '天命时代', '末法时代', '绝灵时代']);

// ==== 功法卡（突破指定大境界需对应呼吸法）====
export const GONGFA_GATES = Object.freeze({
  5: '形意呼吸法', // 观想境
  7: '太极呼吸法', // 塑形境
  10: '大雷音呼吸法', // 圣者境
  11: '道引呼吸法', // 映照诸天
  18: '盗引呼吸法', // 宇究境（17级可进入魂河古地刷取）
});

// ==== 始祖污染（原著：花粉路被始祖污染，进化失败可能异变）====
export const POLLUTION_MAX = 100;
export const POLLUTION_POLLUTED_THRESHOLD = 60; // 污染期
export const POLLUTION_BASE_MUTATION_RATE = 0.03; // 基础异变率
export const POLLUTION_MUTATION_RATE_CAP = 0.25;
export const POLLUTION_MARK_DURATION_MS = 24 * 60 * 60 * 1000; // 始祖印记 24h
export const POLLUTION_PURIFY_FLOWER = 20; // 净化花露
export const POLLUTION_PURIFY_STONE_JAR = 40; // 石罐本体
export const POLLUTION_PURIFY_HERB = 60; // 本源圣药（P1 掉落，判定保留）
export const POLLUTION_CLEAR_REWARD = 50; // 破而后立：清零积淀奖励

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

export function ensureFlowerPollenState(player) {
  if (!player || typeof player !== 'object') return player;
  player.huafenlevel_id = Math.max(1, Math.trunc(number(player.huafenlevel_id, 1)));
  player.进化积淀 = Math.max(0, Math.trunc(number(player.进化积淀)));
  player.花粉隐患 = Math.max(0, Math.min(200, Math.trunc(number(player.花粉隐患))));
  if (!Array.isArray(player.花粉极境)) player.花粉极境 = [];
  if (typeof player.花粉路分支 !== 'string') player.花粉路分支 = '';
  normalizeFlowerBranchState(player);
  // 始祖污染度 0-100
  player.始祖污染度 = Math.max(0, Math.min(POLLUTION_MAX, Math.trunc(number(player.始祖污染度))));
  if (!player.始祖印记 || typeof player.始祖印记 !== 'object') player.始祖印记 = { until: 0 };
  if (!player.花粉道途 || typeof player.花粉道途 !== 'object' || Array.isArray(player.花粉道途)) {
    player.花粉道途 = { version: 1, stages: {}, daily: { date: '', count: 0 } };
  }
  const flowerDao = player.花粉道途;
  if (!flowerDao.stages || typeof flowerDao.stages !== 'object' || Array.isArray(flowerDao.stages)) flowerDao.stages = {};
  if (!flowerDao.daily || typeof flowerDao.daily !== 'object' || Array.isArray(flowerDao.daily)) flowerDao.daily = { date: '', count: 0 };
  flowerDao.daily.count = Math.max(0, Math.trunc(number(flowerDao.daily.count)));
  if (typeof flowerDao.daily.date !== 'string') flowerDao.daily.date = '';
  flowerDao.version = 1;
  if (!player.花粉渡劫 || typeof player.花粉渡劫 !== 'object' || Array.isArray(player.花粉渡劫)) {
    player.花粉渡劫 = { version: 1, completed: {}, failures: {}, history: [] };
  }
  const flowerTribulation = player.花粉渡劫;
  if (!flowerTribulation.completed || typeof flowerTribulation.completed !== 'object' || Array.isArray(flowerTribulation.completed)) flowerTribulation.completed = {};
  if (!flowerTribulation.failures || typeof flowerTribulation.failures !== 'object' || Array.isArray(flowerTribulation.failures)) flowerTribulation.failures = {};
  if (!Array.isArray(flowerTribulation.history)) flowerTribulation.history = [];
  flowerTribulation.version = 1;
  if (!player.花粉根基 || typeof player.花粉根基 !== 'object' || Array.isArray(player.花粉根基)) {
    player.花粉根基 = { version: 1, 损伤: 0, 服用记录: [], 修复次数: 0 };
  }
  const root = player.花粉根基;
  root.损伤 = Math.max(0, Math.min(FLOWER_ROOT_DAMAGE_MAX, Math.trunc(number(root.损伤))));
  if (!Array.isArray(root.服用记录)) root.服用记录 = [];
  root.修复次数 = Math.max(0, Math.trunc(number(root.修复次数)));
  root.version = 1;
  if (!player.花粉路祖种状态 || typeof player.花粉路祖种状态 !== 'object' || Array.isArray(player.花粉路祖种状态)) {
    player.花粉路祖种状态 = {
      version: 1,
      悟道次数: 0,
      孕育开始时间: 0,
      孕育完成时间: 0,
      沉寂结束时间: 0,
      待领取异果: 0,
      上次孕育时间: 0,
    };
  }
  const ancestor = player.花粉路祖种状态;
  ancestor.悟道次数 = Math.max(0, Math.min(FLOWER_ANCESTOR_WUDAO_LIMIT, Math.trunc(number(ancestor.悟道次数))));
  ancestor.孕育开始时间 = Math.max(0, Math.trunc(number(ancestor.孕育开始时间)));
  ancestor.孕育完成时间 = Math.max(0, Math.trunc(number(ancestor.孕育完成时间)));
  ancestor.沉寂结束时间 = Math.max(0, Math.trunc(number(ancestor.沉寂结束时间)));
  ancestor.待领取异果 = Math.max(0, Math.trunc(number(ancestor.待领取异果)));
  ancestor.上次孕育时间 = Math.max(0, Math.trunc(number(ancestor.上次孕育时间)));
  ancestor.version = 1;
  player.花粉悟道法则 = Math.max(0, Math.trunc(number(player.花粉悟道法则)));
  player.花粉道途.法则储备 = Math.max(0, Math.trunc(number(player.花粉道途.法则储备)));
  return player;
}

export function getFlowerAncestorSeedState(player, now = Date.now()) {
  ensureFlowerPollenState(player);
  const state = player.花粉路祖种状态;
  const current = Math.trunc(number(now, Date.now()));
  const breeding = state.孕育完成时间 > current;
  const dormant = state.沉寂结束时间 > current;
  return {
    ...state,
    breeding,
    dormant,
    ready: !breeding && !dormant && state.待领取异果 <= 0,
    breedingRemainMs: breeding ? state.孕育完成时间 - current : 0,
    dormantRemainMs: dormant ? state.沉寂结束时间 - current : 0,
  };
}

/** 懒结算祖种的 8 小时孕育与完成后的 24 小时沉寂。 */
export function settleFlowerAncestorSeed(player, now = Date.now()) {
  ensureFlowerPollenState(player);
  const state = player.花粉路祖种状态;
  const current = Math.trunc(number(now, Date.now()));
  const result = { changed: false, completed: false, awakened: false, state };
  if (state.孕育完成时间 > 0 && current >= state.孕育完成时间) {
    const completedAt = state.孕育完成时间;
    state.孕育开始时间 = 0;
    state.孕育完成时间 = 0;
    state.待领取异果 += 1;
    state.沉寂结束时间 = Math.max(state.沉寂结束时间, completedAt + FLOWER_ANCESTOR_DORMANT_MS);
    state.悟道次数 = FLOWER_ANCESTOR_WUDAO_LIMIT;
    state.上次孕育时间 = completedAt;
    result.changed = true;
    result.completed = true;
  }
  if (state.沉寂结束时间 > 0 && current >= state.沉寂结束时间) {
    state.沉寂结束时间 = 0;
    state.悟道次数 = 0;
    result.changed = true;
    result.awakened = true;
  }
  return result;
}

export function beginFlowerAncestorBreeding(player, now = Date.now(), options = {}) {
  if (options.hasSeed !== true) return { ok: false, reason: 'seed' };
  if (options.hasStoneJar !== true) return { ok: false, reason: 'stone-jar' };
  ensureFlowerPollenState(player);
  const settled = settleFlowerAncestorSeed(player, now);
  const state = player.花粉路祖种状态;
  const current = Math.trunc(number(now, Date.now()));
  if (state.孕育完成时间 > current) return { ok: false, reason: 'breeding', state, settled };
  if (state.沉寂结束时间 > current) return { ok: false, reason: 'dormant', state, settled };
  if (state.待领取异果 > 0) return { ok: false, reason: 'fruit-pending', state, settled };
  state.孕育开始时间 = current;
  state.孕育完成时间 = current + FLOWER_ANCESTOR_BREEDING_MS;
  return {
    ok: true,
    startedAt: state.孕育开始时间,
    completeAt: state.孕育完成时间,
    durationMs: FLOWER_ANCESTOR_BREEDING_MS,
    state,
  };
}

function applyFlowerDaoLawPoints(player, points, realmId) {
  ensureFlowerPollenState(player);
  const path = player.花粉道途;
  const requested = Math.max(0, Math.trunc(number(points)));
  const priorReserve = Math.max(0, Math.trunc(number(path.法则储备)));
  let remaining = requested + priorReserve;
  const filled = [];
  for (const rule of FLOWER_DAO_RULES.filter(item => item.realmId <= Number(realmId)).sort((a, b) => a.realmId - b.realmId)) {
    const before = Math.max(0, Math.min(rule.targetExp, Math.trunc(number(path.stages[rule.key]))));
    const add = Math.min(Math.max(0, rule.targetExp - before), remaining);
    if (add > 0) {
      path.stages[rule.key] = before + add;
      remaining -= add;
      filled.push({ key: rule.key, name: rule.name, before, after: before + add, gain: add });
    }
  }
  path.法则储备 = remaining;
  player.花粉悟道法则 += requested;
  return { requested, applied: requested + priorReserve - remaining, reserve: remaining, filled };
}

function completePriorFlowerDaoLaws(player, realmId) {
  ensureFlowerPollenState(player);
  const completed = [];
  for (const rule of FLOWER_DAO_RULES.filter(item => item.realmId < Number(realmId))) {
    const before = Math.max(0, Math.min(rule.targetExp, Math.trunc(number(player.花粉道途.stages[rule.key]))));
    if (before >= rule.targetExp) continue;
    player.花粉道途.stages[rule.key] = rule.targetExp;
    completed.push({ key: rule.key, name: rule.name, before, after: rule.targetExp, gain: rule.targetExp - before });
  }
  return completed;
}

/** 将存下的法则点灌入当前及此前尚未圆满的道则。 */
function settleFlowerDaoLawReserve(player, realmId) {
  const reserve = Math.max(0, Math.trunc(number(player?.花粉道途?.法则储备)));
  if (!reserve) return;
  applyFlowerDaoLawPoints(player, 0, realmId);
}

export function consumeSuperFlowerFruit(player, now = Date.now(), options = {}) {
  if (now && typeof now === 'object') {
    options = now;
    now = Date.now();
  }
  if (options.hasFruit !== true) return { ok: false, reason: 'fruit' };
  ensureFlowerPollenState(player);
  const settled = settleFlowerAncestorSeed(player, now);
  const qiLevel = Math.max(1, Math.trunc(number(player.level_id, 1)));
  const bodyLevel = Math.max(1, Math.trunc(number(player.Physique_id, 1)));
  const extraLevels = Math.max(1, Math.trunc(number(getExtraCultivationLevelProduct(player), 1)));
  const gain = qiLevel * bodyLevel * extraLevels * 2_000_000;
  const potentialGain = extraLevels * 1000;
  const flowerLevel = Math.max(1, Math.trunc(number(player.huafenlevel_id, 1)));
  const completedPrior = completePriorFlowerDaoLaws(player, flowerLevel);
  const law = applyFlowerDaoLawPoints(player, flowerLevel * 100, flowerLevel);
  law.completedPrior = completedPrior;
  const before = {
    cultivation: number(player.修为),
    blood: number(player.血气),
    potential: number(player.仙道潜力),
    wounds: number(player.道伤),
  };
  player.修为 = before.cultivation + gain;
  player.血气 = before.blood + gain;
  player.仙道潜力 = before.potential + potentialGain;
  player.道伤 = 0;
  delete player.道伤修复度;
  if (player.花粉路祖种状态.待领取异果 > 0) player.花粉路祖种状态.待领取异果 -= 1;
  player.花粉路祖种状态.服用超级异果次数 = Math.max(0, Math.trunc(number(player.花粉路祖种状态.服用超级异果次数))) + 1;
  return {
    ok: true,
    cultivationGain: gain,
    bloodGain: gain,
    potentialGain,
    lawGain: flowerLevel * 100,
    law,
    extraLevels,
    flowerLevel,
    before,
    settled,
  };
}

export function applyAncestorWudao(player, realmId = player?.huafenlevel_id, random = Math.random, options = {}) {
  if (options.hasSeed !== true) return { ok: false, reason: 'seed' };
  ensureFlowerPollenState(player);
  const current = Math.trunc(number(options.now, Date.now()));
  const settled = settleFlowerAncestorSeed(player, current);
  const state = player.花粉路祖种状态;
  if (state.孕育完成时间 > current) return { ok: false, reason: 'breeding', state, settled };
  if (state.沉寂结束时间 > current) return { ok: false, reason: 'dormant', state, settled };
  if (state.悟道次数 >= FLOWER_ANCESTOR_WUDAO_LIMIT) return { ok: false, reason: 'limit', state, settled };
  const gain = calculateFlowerDaoGain(player, realmId, random, {
    ...options,
    ancestorSeed: true,
    ancestorWudao: false,
  });
  if (!gain.rule) return { ok: false, reason: 'no-rule', state, settled };
  const gate = getFlowerDaoGateState(player, realmId);
  if (gate.ok) return { ok: false, reason: 'complete', gate, state, settled };
  const postGainMultiplier = Number.isFinite(Number(options.postGainMultiplier))
    ? Math.max(0, Number(options.postGainMultiplier))
    : 1;
  const normalGain = Math.max(1, Math.floor(gain.gain * postGainMultiplier));
  const boostedGain = normalGain * FLOWER_ANCESTOR_WUDAO_MULTIPLIER;
  const before = gate.exp;
  const after = Math.min(gate.rule.targetExp, before + boostedGain);
  gate.path.stages[gate.rule.key] = after;
  state.悟道次数 += 1;
  return {
    ok: true,
    gain: after - before,
    rawGain: boostedGain,
    normalGain,
    multiplier: gain.multiplier * postGainMultiplier * FLOWER_ANCESTOR_WUDAO_MULTIPLIER,
    bonuses: gain.bonuses,
    before,
    after,
    completed: after >= gate.rule.targetExp,
    gate: getFlowerDaoGateState(player, realmId),
    state,
    settled,
  };
}

export function getFlowerRootState(player) {
  ensureFlowerPollenState(player);
  const damage = Math.max(0, Math.min(FLOWER_ROOT_DAMAGE_MAX, Math.trunc(number(player.花粉根基?.损伤))));
  return { damage, max: FLOWER_ROOT_DAMAGE_MAX, ratio: damage / FLOWER_ROOT_DAMAGE_MAX, damaged: damage > 0, critical: damage >= FLOWER_ROOT_DAMAGE_MAX };
}

export function consumeFlowerFruit(player, fruitName, now = Date.now()) {
  ensureFlowerPollenState(player);
  const fruit = FLOWER_FRUITS[fruitName];
  if (!fruit) return { ok: false, reason: 'unknown-fruit' };
  const root = getFlowerRootState(player);
  if (root.critical) return { ok: false, reason: 'root-critical', root };
  const before = root.damage;
  player.进化积淀 += fruit.accumulation;
  player.花粉隐患 = Math.min(200, player.花粉隐患 + fruit.risk);
  player.始祖污染度 = Math.min(POLLUTION_MAX, player.始祖污染度 + fruit.pollution);
  player.花粉根基.损伤 = Math.min(FLOWER_ROOT_DAMAGE_MAX, before + fruit.rootDamage);
  player.花粉根基.服用记录.push({ name: fruitName, accumulation: fruit.accumulation, at: Math.trunc(number(now, Date.now())) });
  player.花粉根基.服用记录 = player.花粉根基.服用记录.slice(-20);
  return { ok: true, fruit, beforeDamage: before, afterDamage: player.花粉根基.损伤, rootCritical: player.花粉根基.损伤 >= FLOWER_ROOT_DAMAGE_MAX };
}

export function repairFlowerRoot(player, amount, source = '净化花露') {
  ensureFlowerPollenState(player);
  const requested = Math.max(0, Math.trunc(number(amount)));
  const before = getFlowerRootState(player).damage;
  const repaired = Math.min(before, requested);
  player.花粉根基.损伤 = before - repaired;
  if (repaired > 0) player.花粉根基.修复次数 += 1;
  return { repaired, before, after: player.花粉根基.损伤, source };
}

export function recordFlowerBreathingPractice(player, amount = 3) {
  const best = getBestBreathingMethod(player);
  if (!best[0]) return { name: '', gained: 0 };
  const gained = addGongfaProficiency(player, best[0], amount);
  return { name: best[0], gained, profile: getGongfaProficiencyProfile(player, best[0]) };
}

export function getRequiredPollenQuality(targetLevelId) {
  const target = Math.max(2, Math.trunc(number(targetLevelId, 2)));
  if (target >= 18) return 4;
  if (target >= 11) return 3;
  if (target >= 6) return 2;
  return 1;
}

/** 时代画像：成本系数 + 成功率偏移（eraIndex 0-4，默认天命） */
export function getFlowerEraProfile(eraIndex = 2) {
  const index = Math.max(0, Math.min(4, Math.trunc(number(eraIndex, 2))));
  return {
    index,
    name: ERA_NAMES[index],
    costRate: ERA_COST_RATES[index],
    chanceShift: ERA_CHANCE_SHIFTS[index],
  };
}

/** 进化成本 = 1亿 × 2^等级 × 时代成本系数（用户定档公式） */
export function getFlowerEvolutionCost(currentLevelId, eraIndex = 2) {
  const level = Math.max(1, Math.min(25, Math.trunc(number(currentLevelId, 1))));
  const { costRate } = getFlowerEraProfile(eraIndex);
  return Math.trunc(EVOLUTION_BASE_COST * 2 ** level * costRate);
}

export function getBestBreathingMethod(player) {
  const learned = Array.isArray(player?.学习的功法) ? player.学习的功法 : [];
  const best = Object.entries(BREATHING_BONUSES)
    .filter(([name]) => learned.includes(name))
    .sort((a, b) => b[1] - a[1])[0] || ['', 0];
  if (!best[0]) return ['', 0, null];
  const profile = getGongfaProficiencyProfile(player, best[0]);
  const masteryMultiplier = 1 + Math.min(0.5, profile.exp / 2000);
  return [best[0], best[1] * masteryMultiplier, profile];
}

/** 功法卡：突破到目标等级所需呼吸法 */
export function getGongfaGate(targetLevelId) {
  const level = Math.max(1, Math.trunc(number(targetLevelId, 1)));
  const gongfa = GONGFA_GATES[level];
  return gongfa ? { level, gongfa } : null;
}

export function checkGongfaGate(player, targetLevelId) {
  const gate = getGongfaGate(targetLevelId);
  if (!gate) return { ok: true, gate: null };
  const learned = Array.isArray(player?.学习的功法) ? player.学习的功法 : [];
  return { ok: learned.includes(gate.gongfa), gate };
}

/** 始祖污染状态：污染期 / 始祖印记 / 各项惩罚 */
export function getPollenPollutionState(player, now = Date.now()) {
  ensureFlowerPollenState(player);
  const pollution = player.始祖污染度;
  const polluted = pollution >= POLLUTION_POLLUTED_THRESHOLD;
  const markUntil = number(player.始祖印记?.until, 0);
  const marked = markUntil > now;
  return {
    pollution,
    polluted,
    marked,
    markRemainMs: Math.max(0, markUntil - now),
    // 污染期惩罚：全属性-10%、成功率-15%、呼吸法加成减半
    attrMultiplier: polluted ? 0.9 : 1,
    successPenalty: polluted ? 0.15 : 0,
    breathingMultiplier: polluted ? 0.5 : 1,
    markSuccessPenalty: marked ? 0.2 : 0,
  };
}

export function getFlowerDaoWoundState(player) {
  const wounds = Math.max(0, number(player?.道伤));
  return {
    wounds,
    chancePenalty: Math.min(0.4, wounds * 0.08),
    daoMultiplier: Math.max(0.5, 1 - wounds * 0.1),
    attrMultiplier: Math.max(0.7, 1 - wounds * 0.05),
  };
}

/** 异变率：基础 3% + 隐患加成 + 境界因子 */
export function getMutationChance(player) {
  ensureFlowerPollenState(player);
  const levelFactor = (player.huafenlevel_id - 1) * 0.004;
  const riskFactor = (player.花粉隐患 / 200) * 0.15;
  const branch = getFlowerBranchProfile(player);
  return clamp(
    POLLUTION_BASE_MUTATION_RATE + (riskFactor + levelFactor) * branch.mutationMultiplier,
    POLLUTION_BASE_MUTATION_RATE,
    POLLUTION_MUTATION_RATE_CAP
  );
}

/** 触发始祖接引：修为/血气被夺 50%、烙下始祖印记、污染度回落污染期阈值 */
export function applyAncestorCall(player) {
  ensureFlowerPollenState(player);
  const seizedCultivation = Math.floor(Number(player.修为) * 0.5);
  const seizedBlood = Math.floor(Number(player.血气) * 0.5);
  player.修为 = Math.max(0, Number(player.修为) - seizedCultivation);
  player.血气 = Math.max(0, Number(player.血气) - seizedBlood);
  player.始祖印记 = { until: Date.now() + POLLUTION_MARK_DURATION_MS };
  player.始祖污染度 = POLLUTION_POLLUTED_THRESHOLD;
  return { seizedCultivation, seizedBlood, markUntil: player.始祖印记.until };
}

/** 净化始祖污染度；清零时返回破而后立奖励 */
export function purifyPollution(player, amount) {
  ensureFlowerPollenState(player);
  const before = player.始祖污染度;
  const purified = Math.min(before, Math.max(0, Math.trunc(number(amount))));
  player.始祖污染度 = Math.max(0, before - purified);
  const cleared = before > 0 && player.始祖污染度 === 0;
  if (cleared) player.进化积淀 += POLLUTION_CLEAR_REWARD;
  return { purified, before, after: player.始祖污染度, cleared, reward: cleared ? POLLUTION_CLEAR_REWARD : 0 };
}

export function getFlowerBranchProfile(player) {
  return FLOWER_BRANCH_PROFILES[getFlowerBranchState(player).branch] || NEUTRAL_FLOWER_BRANCH;
}

export function getFlowerDaoRuleForRealm(realmId) {
  return FLOWER_DAO_RULES.find(rule => rule.realmId === Number(realmId)) || null;
}

function getFlowerDaoStage(exp, rule) {
  if (!rule) return { name: '未开启', nextExp: 0 };
  const current = Math.max(0, Math.min(rule.targetExp, Math.trunc(number(exp))));
  if (current >= rule.targetExp) return { name: '圆满', nextExp: rule.targetExp };
  if (current >= Math.floor(rule.targetExp / 2)) return { name: '大成', nextExp: rule.targetExp };
  if (current >= Math.floor(rule.targetExp / 6)) return { name: '小成', nextExp: Math.floor(rule.targetExp / 2) };
  return { name: '初悟', nextExp: Math.floor(rule.targetExp / 6) };
}

export function getFlowerDaoGateState(player, realmId = player?.huafenlevel_id) {
  ensureFlowerPollenState(player);
  settleFlowerDaoLawReserve(player, realmId);
  const rule = getFlowerDaoRuleForRealm(realmId);
  const path = player.花粉道途;
  if (!rule) return { ok: true, rule: null, exp: 0, stage: null, path };
  const exp = Math.max(0, Math.min(rule.targetExp, Math.trunc(number(path.stages[rule.key]))));
  return { ok: exp >= rule.targetExp, rule, exp, stage: getFlowerDaoStage(exp, rule), path };
}

export function getFlowerDaoAttemptCost(player, realmId, eraIndex = 2) {
  const rule = getFlowerDaoRuleForRealm(realmId);
  if (!rule) return null;
  const level = Math.max(1, Math.trunc(number(realmId, 1)));
  const era = getFlowerEraProfile(eraIndex);
  const base = getFlowerEvolutionCost(realmId, eraIndex);
  const amount = Math.max(100000, Math.trunc(base * 0.08));
  return {
    potential: Math.max(1, Math.trunc(level * 100 * era.costRate)),
    cultivation: amount,
    blood: amount,
    lifespan: Math.max(1, Math.trunc(level * 200000 * era.costRate)),
    spirit: Math.max(1, Math.trunc(level * 10000000 * era.costRate)),
    rule,
    era,
  };
}

function explicitWudaoBonus(item) {
  const raw = Number(item?.悟道加成 ?? item?.悟道收益);
  if (!Number.isFinite(raw)) return 0;
  return clamp(Math.abs(raw) > 1 ? raw / 100 : raw, -0.5, 0.5);
}

/** 只读取装备上明确配置的悟道词条，避免由战斗属性反推出不存在的悟道收益。 */
export function getFlowerDaoEquipmentBonuses(equipment = {}) {
  const sumSlots = slots => clamp(
    slots.reduce((sum, slot) => sum + explicitWudaoBonus(equipment?.[slot]), 0),
    -0.5,
    0.5
  );
  return {
    equipment: sumSlots(['武器', '护具', '法宝', '遗珍']),
    treasure: sumSlots(['帝兵', '至宝']),
  };
}

export function calculateFlowerDaoGain(player, realmId, random = Math.random, options = {}) {
  const rule = getFlowerDaoRuleForRealm(realmId);
  if (!rule) return { gain: 0, rule: null };
  const pollution = getPollenPollutionState(player);
  const branch = getFlowerBranchProfile(player);
  const [, breathing] = getBestBreathingMethod(player);
  const era = getFlowerEraProfile(options.eraIndex);
  const wound = getFlowerDaoWoundState(player);
  const root = getFlowerRootState(player);
  const bonuses = {
    breathing: breathing * pollution.breathingMultiplier * 2,
    branch: branch.daoBonus,
    era: era.chanceShift,
    accumulation: Math.min(0.2, number(player?.进化积淀) / 1000),
    ancestorSeed: options.ancestorSeed ? 0.08 : 0,
    stoneJar: options.stoneJar ? 0.1 : 0,
    physique: clamp(number(options.physiqueBonus), -0.5, 0.5),
    aptitude: clamp(number(options.aptitudeBonus), -0.5, 0.5),
    technique: clamp(number(options.techniqueBonus), -0.5, 0.5),
    mingge: clamp(number(options.minggeBonus), -0.5, 1),
    title: clamp(number(options.titleBonus), -0.5, 0.5),
    equipment: clamp(number(options.equipmentBonus), -0.5, 0.5),
    treasure: clamp(number(options.treasureBonus), -0.5, 1),
    risk: -Math.min(0.35, number(player?.花粉隐患) * 0.0035),
    root: -Math.min(0.25, root.damage * 0.0025),
    pollution: -pollution.successPenalty - pollution.markSuccessPenalty,
    world: clamp(number(options.worldBonus), 0, 0.5),
    wound: wound.daoMultiplier - 1,
    daoHeart: clamp(number(options.daoHeartMultiplier, 1), 0.5, 1) - 1,
    ideal: hasSuiyunAuthority(player, '理想') ? .2 : 0,
  };
  const additiveBonus = Object.entries(bonuses)
    .filter(([name]) => !['world', 'wound', 'daoHeart'].includes(name))
    .reduce((sum, [, value]) => sum + value, 0);
  const multiplier = clamp(
    clamp(1 + additiveBonus, 0.25, 4)
      * (1 + bonuses.world)
      * wound.daoMultiplier
      * (1 + bonuses.daoHeart),
    0.1,
    5
  );
  const ancestorWudaoMultiplier = options.ancestorWudao ? FLOWER_ANCESTOR_WUDAO_MULTIPLIER : 1;
  const randomFactor = 0.9 + clamp(number(random()), 0, 1) * 0.2;
  return {
    gain: Math.max(1, Math.trunc(rule.baseGain * multiplier * randomFactor * ancestorWudaoMultiplier)),
    rule,
    multiplier: multiplier * ancestorWudaoMultiplier,
    randomFactor,
    bonuses,
    era,
  };
}

export function recordFlowerDaoAttempt(player, realmId, gain, dateKey = '', dailyLimit = FLOWER_DAO_DAILY_LIMIT) {
  const gate = getFlowerDaoGateState(player, realmId);
  if (!gate.rule) return { ok: false, reason: 'no-rule' };
  if (gate.ok) return { ok: false, reason: 'complete', gate };
  if (gate.path.daily.date !== dateKey) {
    gate.path.daily.date = dateKey;
    gate.path.daily.count = 0;
  }
  const limit = Math.max(FLOWER_DAO_DAILY_LIMIT, Math.trunc(number(dailyLimit, FLOWER_DAO_DAILY_LIMIT)));
  if (gate.path.daily.count >= limit) return { ok: false, reason: 'daily', gate };
  gate.path.daily.count += 1;
  const before = gate.exp;
  const after = Math.min(gate.rule.targetExp, before + Math.max(0, Math.trunc(number(gain))));
  gate.path.stages[gate.rule.key] = after;
  return { ok: true, before, after, gain: after - before, completed: after >= gate.rule.targetExp, gate };
}

export function getFlowerTribulationRule(currentLevelId) {
  return FLOWER_TRIBULATION_RULES[Math.trunc(number(currentLevelId, 0))] || null;
}

export function getFlowerTribulationGateState(player, realmId = player?.huafenlevel_id) {
  ensureFlowerPollenState(player);
  const level = Math.trunc(number(realmId, 0));
  const rule = getFlowerTribulationRule(level);
  const path = player.花粉渡劫;
  if (!rule) return { ok: true, rule: null, completed: false, failures: 0, path };
  const record = path.completed[level];
  return {
    ok: Boolean(record),
    rule,
    completed: Boolean(record),
    record: record || null,
    failures: Math.max(0, Math.trunc(number(path.failures[level]))),
    path,
  };
}

export function getFlowerTribulationCost(currentLevelId, eraIndex = 2) {
  const rule = getFlowerTribulationRule(currentLevelId);
  if (!rule) return null;
  const amount = Math.max(100000, Math.trunc(getFlowerEvolutionCost(currentLevelId, eraIndex) * rule.costRate));
  return { cultivation: amount, blood: amount, rule };
}

/**
 * 雷劫基准攻击：四体系基础攻击之和（练气+炼体+秘境+仙古+花粉×属性倍率）。
 * 天道只认境界、不认外物——装备/帝兵/至宝/额外加成一律不计入，杜绝"越肝装备天雷越猛"的反向激励。
 */
export function getFlowerTribulationBaseAtk(player, levels = {}) {
  ensureFlowerPollenState(player);
  const get = (list, id) => Number(list?.find(item => Number(item.level_id) === Number(id))?.基础攻击) || 0;
  const 练气 = get(levels.Level_list, player.level_id);
  const 炼体 = get(levels.LevelMax_list, player.Physique_id);
  const 秘境 = get(levels.Levelmijing_list, player.mijinglevel_id);
  const 仙古 = get(levels.xiangujinshi_list, player.xiangulevel_id);
  const 花粉 = get(levels.huafen_list, player.huafenlevel_id);
  const 倍率 = getFlowerPathAttributeMultiplier(player);
  return Math.trunc((练气 + 炼体 + 秘境 + 仙古 + 花粉 * 倍率) * FLOWER_TRIBULATION_ATK_SCALE);
}

/**
 * 减伤链汇总：呼吸法/分支/污染期/始祖印记/石罐/净化资源/失败保护。
 * 返回总减免率（上限 70%）与分项明细，供渡劫结算与战报展示。
 */
export function calcFlowerTribulationMitigation(player, options = {}) {
  ensureFlowerPollenState(player);
  const pollution = getPollenPollutionState(player);
  const [, breathing] = getBestBreathingMethod(player);
  const branch = getFlowerBranchProfile(player);
  const realmId = Math.trunc(number(options.realmId, player.huafenlevel_id));
  const failures = Math.max(0, Math.trunc(number(player.花粉渡劫?.failures?.[realmId])));
  const protection = Math.min(FLOWER_TRIBULATION_FAILURE_PROTECTION_CAP, failures * FLOWER_TRIBULATION_FAILURE_PROTECTION);
  const breathingRate = breathing * pollution.breathingMultiplier * 0.5;
  const branchRate = branch.name === '究极' ? 0.08 : branch.name === '宇究' ? 0.06 : branch.name === '大宇' ? -0.03 : 0;
  const pollutedRate = pollution.polluted ? 0.05 : 0;
  const markedRate = pollution.marked ? 0.1 : 0;
  const stoneJarRate = options.stoneJar ? 0.08 : 0;
  const herbRate = options.herb ? 0.25 : options.dew ? 0.15 : 0;
  const rate = Math.min(0.7, Math.max(0, breathingRate + branchRate + pollutedRate + markedRate + stoneJarRate + herbRate + protection));
  return { rate, breathingRate, branchRate, pollutedRate, markedRate, stoneJarRate, herbRate, protection };
}

/**
 * 单道雷劫伤害 = 基准攻 × 阶段系数 × 劫难倍率 × 时代难度 × 递增系数(1+0.02×(wave-1))，
 * 再经防御减免（防御×0.3 抵扣）与减伤链总减免，最低 1 点。
 */
export function calculateFlowerTribulationWave(baseAtk, rule, realmId, stageIndex, wave, options = {}) {
  const stageCount = Math.max(1, Math.trunc(number(rule?.stages?.length, 3)));
  const ratios = FLOWER_TRIBULATION_STAGE_RATIOS[stageCount] || FLOWER_TRIBULATION_STAGE_RATIOS[3];
  const stageRatio = ratios[Math.min(Math.max(0, Math.trunc(number(stageIndex, 0))), ratios.length - 1)] || 1;
  const multiplier = FLOWER_TRIBULATION_DAMAGE_MULTIPLIERS[Math.trunc(number(realmId, 9))] || 10;
  const eraDifficulty = FLOWER_TRIBULATION_ERA_DIFFICULTY[Math.max(0, Math.min(4, Math.trunc(number(options.eraIndex, 2))))] || 1;
  const waveFactor = 1 + 0.02 * (Math.max(1, Math.trunc(number(wave, 1))) - 1);
  const raw = Math.max(1, Math.trunc(baseAtk * stageRatio * multiplier * eraDifficulty * waveFactor));
  const { damage: afterDefense, reduction } = reduceTribulationDamageByDefense(raw, Math.max(0, number(options.defense)));
  const mitigationRate = clamp(number(options.mitigationRate), 0, 0.7);
  const treasureMultiplier = Math.max(0, number(options.treasureMultiplier, 1));
  const damage = Math.max(1, Math.trunc(afterDefense * (1 - mitigationRate) * treasureMultiplier));
  return { raw, reduction, damage, stageRatio, multiplier, eraDifficulty, waveFactor, mitigationRate };
}

/**
 * 整场花粉渡劫·伤害模拟（纯同步，供测试与战报预览）。
 * 每阶段 FLOWER_TRIBULATION_WAVES_PER_STAGE 道雷劫，血量归零即中断。
 * options: { realmId, eraIndex, defense, maxHp, levels, stoneJar, dew, herb }
 */
export function simulateFlowerTribulation(player, options = {}) {
  ensureFlowerPollenState(player);
  const realmId = Math.trunc(number(options.realmId, player.huafenlevel_id));
  const gate = getFlowerTribulationGateState(player, realmId);
  if (!gate.rule) return { ok: false, reason: 'no-rule', gate };
  if (gate.completed) return { ok: false, reason: 'complete', gate };
  const daoGate = getFlowerDaoGateState(player, realmId);
  if (!daoGate.ok) return { ok: false, reason: 'dao', daoGate, gate };

  const baseAtk = getFlowerTribulationBaseAtk(player, options.levels);
  const mitigation = calcFlowerTribulationMitigation(player, { realmId, stoneJar: options.stoneJar, dew: options.dew, herb: options.herb });
  let hp = Math.max(0, number(options.maxHp, number(player.血量上限)));
  if (hp <= 0) hp = Math.max(1, number(options.currentHp, 1));
  const defense = Math.max(0, number(options.defense));

  const stages = gate.rule.stages.map((name, stageIndex) => {
    const waves = [];
    for (let wave = 1; wave <= FLOWER_TRIBULATION_WAVES_PER_STAGE; wave++) {
      const waveResult = calculateFlowerTribulationWave(baseAtk, gate.rule, realmId, stageIndex, wave, {
        eraIndex: options.eraIndex,
        defense,
        mitigationRate: mitigation.rate,
        treasureMultiplier: getPassiveTribulationDamageMultiplier(player),
      });
      hp = Math.max(0, hp - waveResult.damage);
      waves.push({ wave, damage: waveResult.damage, hp });
      if (hp <= 0) break;
    }
    return { name, waves, survived: hp > 0 };
  });
  const failed = stages.find(stage => !stage.survived);
  return { ok: !failed, reason: failed ? 'failed' : 'ok', baseAtk, mitigation, stages, hp, failedStage: failed?.name || null, gate, rule: gate.rule };
}

export function getFlowerTribulationChance(player, realmId = player?.huafenlevel_id, options = {}) {
  const gate = getFlowerTribulationGateState(player, realmId);
  if (!gate.rule) return 0;
  const pollution = getPollenPollutionState(player);
  const branch = getFlowerBranchProfile(player);
  const [, breathing] = getBestBreathingMethod(player);
  const era = getFlowerEraProfile(options.eraIndex);
  const riskPenalty = Math.min(0.2, player.花粉隐患 * 0.001);
  const failureProtection = Math.min(0.15, gate.failures * 0.03);
  const stoneJarBonus = options.stoneJar ? 0.08 : 0;
  const wound = getFlowerDaoWoundState(player);
  return clamp(
    gate.rule.baseChance
      + breathing * pollution.breathingMultiplier
      + branch.chanceShift
      + era.chanceShift * 0.5
      + failureProtection
      + stoneJarBonus
      - riskPenalty
      - pollution.successPenalty
      - pollution.markSuccessPenalty
      - wound.chancePenalty,
    0.15,
    0.95
  );
}

/**
 * 花粉渡劫奖惩结算（单点维护，供 resolveFlowerTribulation 与指令层复用）。
 * outcome: { ok, failedStage }；失败追加：修为血气各 -15%（当前总量）+ 道伤 +1。
 */
export function applyFlowerTribulationOutcome(player, outcome, random = Math.random, options = {}) {
  ensureFlowerPollenState(player);
  const realmId = Math.trunc(number(options.realmId, player.huafenlevel_id));
  const gate = getFlowerTribulationGateState(player, realmId);
  if (!gate.rule) return { ok: false, reason: 'no-rule' };
  const now = Math.trunc(number(options.now, Date.now()));

  if (outcome.ok) {
    const record = { name: gate.rule.name, completedAt: now };
    gate.path.completed[realmId] = record;
    player.花粉隐患 = Math.max(0, player.花粉隐患 - gate.rule.riskRelief);
    player.始祖污染度 = Math.max(0, player.始祖污染度 - gate.rule.pollutionRelief);
    player.进化积淀 += gate.rule.rewardAccumulation;
    gate.path.history.push({ realmId, name: gate.rule.name, ok: true, at: now });
    gate.path.history = gate.path.history.slice(-20);
    return {
      ok: true,
      rule: gate.rule,
      rewardAccumulation: gate.rule.rewardAccumulation,
      riskRelief: gate.rule.riskRelief,
      pollutionRelief: gate.rule.pollutionRelief,
      record,
    };
  }

  gate.path.failures[realmId] = gate.failures + 1;
  player.花粉隐患 = Math.min(200, player.花粉隐患 + gate.rule.failureRisk);
  const mutated = number(random()) < getMutationChance(player);
  const stoneJarRate = options.stoneJar ? 0.5 : 1;
  const pollutionGain = Math.max(1, Math.trunc(gate.rule.failurePollution * stoneJarRate)) + (mutated ? 6 : 0);
  player.始祖污染度 = Math.min(POLLUTION_MAX, player.始祖污染度 + pollutionGain);
  player.进化积淀 += Math.max(6, Math.trunc(gate.rule.rewardAccumulation * 0.2));
  const lossRate = hasSuiyunAuthority(player, '霜华') ? .5 : 1;
  const cultivationLoss = Math.max(0, Math.floor(Number(player.修为 || 0) * 0.15 * lossRate));
  const bloodLoss = Math.max(0, Math.floor(Number(player.血气 || 0) * 0.15 * lossRate));
  player.修为 = Math.max(0, Number(player.修为 || 0) - cultivationLoss);
  player.血气 = Math.max(0, Number(player.血气 || 0) - bloodLoss);
  player.道伤 = Math.max(0, number(player.道伤)) + lossRate;
  gate.path.history.push({ realmId, name: gate.rule.name, ok: false, failedStage: outcome.failedStage || '', at: now });
  gate.path.history = gate.path.history.slice(-20);
  return {
    ok: false,
    reason: mutated ? 'mutated' : 'failed',
    rule: gate.rule,
    pollutionGain,
    mutated,
    failures: gate.failures + 1,
    punishment: { cultivationLoss, bloodLoss, wounds: lossRate },
  };
}

/**
 * 花粉专属渡劫结算（伤害模型）：逐道雷劫扣血，血量归零即失败。
 * 保留契约：道则前置(dao)/失败惩罚(failures+隐患+污染)/成功奖励(印记+净化+积淀)/history 记录。
 * options: { now, stoneJar, eraIndex, defense, maxHp, levels, dew, herb }
 */
export function resolveFlowerTribulation(player, random = Math.random, options = {}) {
  ensureFlowerPollenState(player);
  const realmId = Math.trunc(number(options.realmId, player.huafenlevel_id));
  const gate = getFlowerTribulationGateState(player, realmId);
  if (!gate.rule) return { ok: false, reason: 'no-rule' };
  if (gate.completed) return { ok: false, reason: 'complete', gate };
  const daoGate = getFlowerDaoGateState(player, realmId);
  if (!daoGate.ok) return { ok: false, reason: 'dao', daoGate, gate };

  const simulation = simulateFlowerTribulation(player, options);
  const outcome = applyFlowerTribulationOutcome(player, { ok: simulation.ok, failedStage: simulation.failedStage }, random, options);
  return {
    ...outcome,
    failedStage: simulation.failedStage,
    chance: 0,
    stages: simulation.stages,
    hp: simulation.hp,
    baseAtk: simulation.baseAtk,
  };
}

export function getFlowerEvolutionChance(player, mediumName, options = {}) {
  ensureFlowerPollenState(player);
  const medium = FLOWER_POLLEN_MEDIA[mediumName];
  if (!medium) return 0;
  const pollution = getPollenPollutionState(player);
  const base = 0.75 - Math.min(0.35, (player.huafenlevel_id - 1) * 0.018);
  const accumulation = Math.min(0.2, player.进化积淀 / 1000);
  const risk = Math.min(0.35, player.花粉隐患 * 0.0035);
  const ancestorSeed = options.ancestorSeed ? 0.08 : 0;
  const [, breathing] = getBestBreathingMethod(player);
  const eraShift = getFlowerEraProfile(options.eraIndex).chanceShift;
  const branch = getFlowerBranchProfile(player);
  const root = getFlowerRootState(player);
  const rootDamagePenalty = Math.min(0.25, root.damage * 0.0025);
  const wound = getFlowerDaoWoundState(player);
  return Math.max(0.1, Math.min(0.95,
    base
    + medium.chance
    + accumulation
    + breathing * pollution.breathingMultiplier
    + ancestorSeed
    - risk
    + eraShift
    + branch.chanceShift
    - rootDamagePenalty
    - pollution.successPenalty
    - pollution.markSuccessPenalty
    - wound.chancePenalty
  ));
}

export function getFlowerBreakthroughRule(currentLevelId) {
  return FLOWER_BREAKTHROUGH_RULES[Math.trunc(number(currentLevelId, 0))] || null;
}

export function resolveFlowerBreakthrough(player, mediumName, random = Math.random, options = {}) {
  const progression=getFlowerPollenProgression(player);
  if(progression)return {ok:false,reason:progression.reason,progression};
  ensureFlowerPollenState(player);
  const rule = getFlowerBreakthroughRule(player.huafenlevel_id);
  if (!rule) return { ok: false, reason: 'not-required' };
  const medium = FLOWER_POLLEN_MEDIA[mediumName];
  const targetLevelId = player.huafenlevel_id + 1;
  if (!medium) return { ok: false, reason: 'unknown-medium' };
  if (medium.quality < getRequiredPollenQuality(targetLevelId)) {
    return { ok: false, reason: 'quality', requiredQuality: getRequiredPollenQuality(targetLevelId) };
  }
  const chance = getFlowerEvolutionChance(player, mediumName, options);
  player.进化积淀 += medium.accumulation;
  player.花粉隐患 = Math.min(200, player.花粉隐患 + medium.risk);
  const stageAdjustments = [0.04, 0.01, -0.04, -0.02];
  const stages = rule.stages.map((name, index) => {
    const stageChance = clamp(chance + (stageAdjustments[index] || 0), 0.15, 0.95);
    const ok = number(random()) < stageChance;
    return { name, chance: stageChance, ok };
  });
  const failed = stages.find(stage => !stage.ok);
  if (failed) {
    player.进化积淀 += 16;
    player.花粉隐患 = Math.min(200, player.花粉隐患 + 10);
    const mutationChance = getMutationChance(player);
    if (number(random()) < mutationChance) {
      const pollutionGain = 12 + Math.floor(player.huafenlevel_id / 2);
      player.始祖污染度 = Math.min(POLLUTION_MAX, player.始祖污染度 + pollutionGain);
      return { ok: false, reason: 'mutated', breakthrough: true, chance, mutationChance, pollutionGain, pollution: player.始祖污染度, failedStage: failed.name, stages };
    }
    return { ok: false, reason: 'breakthrough-failed', breakthrough: true, chance, failedStage: failed.name, stages };
  }
  const previousBranch=getFlowerBranchState(player);
  player.huafenlevel_id = targetLevelId;
  if (targetLevelId === 17) {
    player.花粉路分支 = player.花粉极境.includes('究极根基') ? '究极' : '大宇';
    player.花粉路前身分支 = player.花粉路分支;
  } else if (targetLevelId === 18) {
    if(previousBranch.branch==='大宇'||previousBranch.branch==='究极')player.花粉路前身分支=previousBranch.branch;
    else delete player.花粉路前身分支;
    player.花粉路分支 = '宇究';
  }
  return { ok: true, breakthrough: true, chance, targetLevelId, stages, branch: player.花粉路分支 };
}

export function resolveFlowerEvolution(player, mediumName, random = Math.random, options = {}) {
  const progression=getFlowerPollenProgression(player);
  if(progression)return {ok:false,reason:progression.reason,progression};
  ensureFlowerPollenState(player);
  const medium = FLOWER_POLLEN_MEDIA[mediumName];
  if (!medium) return { ok: false, reason: 'unknown-medium' };
  const targetLevelId = player.huafenlevel_id + 1;
  if (medium.quality < getRequiredPollenQuality(targetLevelId)) {
    return { ok: false, reason: 'quality', requiredQuality: getRequiredPollenQuality(targetLevelId) };
  }

  const chance = getFlowerEvolutionChance(player, mediumName, options);
  player.进化积淀 += medium.accumulation;
  player.花粉隐患 = Math.min(200, player.花粉隐患 + medium.risk);
  if (number(random()) >= chance) {
    // 失败三态之二：常规失败（积淀/隐患累积，指令层再扣 30% 修为血气）或 始祖异变（污染度增长）
    player.进化积淀 += 12;
    player.花粉隐患 = Math.min(200, player.花粉隐患 + 6);
    const mutationChance = getMutationChance(player);
    if (number(random()) < mutationChance) {
      const pollutionGain = 10 + Math.floor(player.huafenlevel_id / 2);
      player.始祖污染度 = Math.min(POLLUTION_MAX, player.始祖污染度 + pollutionGain);
      return {
        ok: false,
        reason: 'mutated',
        chance,
        mutationChance,
        pollutionGain,
        pollution: player.始祖污染度,
      };
    }
    return { ok: false, reason: 'failed', chance };
  }

  const previousBranch=getFlowerBranchState(player);
  player.huafenlevel_id = targetLevelId;
  if (targetLevelId === 17) {
    player.花粉路分支 = player.花粉极境.includes('究极根基') ? '究极' : '大宇';
    player.花粉路前身分支 = player.花粉路分支;
  } else if (targetLevelId === 18) {
    if(previousBranch.branch==='大宇'||previousBranch.branch==='究极')player.花粉路前身分支=previousBranch.branch;
    else delete player.花粉路前身分支;
    player.花粉路分支 = '宇究';
  }
  return { ok: true, chance, targetLevelId, branch: player.花粉路分支 };
}

export function getNextFlowerExtremeTrial(player) {
  ensureFlowerPollenState(player);
  const branchState=getFlowerBranchState(player);
  const formerBranch = branchState.formerBranch || (['大宇','究极'].includes(branchState.branch)?branchState.branch:'');
  for (const realmLevel of Object.keys(EXTREME_TRIALS).map(Number).sort((a, b) => a - b)) {
    if (realmLevel > player.huafenlevel_id) break;
    const trial = EXTREME_TRIALS[realmLevel].find(candidate => {
      if (player.花粉极境.includes(candidate.name)) return false;
      if (candidate.requires && !player.花粉极境.includes(candidate.requires)) return false;
      if (candidate.branch && candidate.branch !== formerBranch) return false;
      return true;
    });
    if (trial) return { ...trial, realmLevel };
  }
  return null;
}

export function completeFlowerExtremeTrial(player) {
  const trial = getNextFlowerExtremeTrial(player);
  if (!trial) return { ok: false, reason: 'no-trial' };
  if (player.进化积淀 < trial.accumulation) {
    return { ok: false, reason: 'accumulation', trial };
  }
  if (trial.maxRisk !== undefined && player.花粉隐患 > trial.maxRisk) {
    return { ok: false, reason: 'risk', trial };
  }
  player.进化积淀 -= trial.accumulation;
  player.花粉隐患 = Math.max(0, player.花粉隐患 - (trial.name === '大宇净化' ? 60 : 12));
  player.花粉极境.push(trial.name);
  return { ok: true, trial };
}

export function calculateFlowerExtremeBonus(player, realm = {}) {
  ensureFlowerPollenState(player);
  const rate = Math.min(0.3, player.花粉极境.length * 0.03);
  const branch = getFlowerBranchProfile(player);
  return {
    攻击: Math.trunc(number(realm.基础攻击) * (rate + branch.attackRate)),
    防御: Math.trunc(number(realm.基础防御) * (rate + branch.defenseRate)),
    血量: Math.trunc(number(realm.基础血量) * (rate + branch.healthRate)),
    rate,
  };
}

export function getFlowerPathAttributeMultiplier(player) {
  return getPollenPollutionState(player).attrMultiplier
    * getFlowerDaoWoundState(player).attrMultiplier;
}

export { BREATHING_BONUSES };
