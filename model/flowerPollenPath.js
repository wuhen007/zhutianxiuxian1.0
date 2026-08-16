import { addGongfaProficiency, getGongfaProficiencyProfile } from './gongfaProficiency.js';

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
// ==== 进化成本（用户定档：2^等级 × 1250000，受时代影响）====
export const EVOLUTION_BASE_COST = 1250000;

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
  12: '盗引呼吸法', // 神祇境
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
  return player;
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

/** 进化成本 = 125万 × 2^等级 × 时代成本系数（用户定档公式） */
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
  return FLOWER_BRANCH_PROFILES[player?.花粉路分支] || NEUTRAL_FLOWER_BRANCH;
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
  const rule = getFlowerDaoRuleForRealm(realmId);
  const path = player.花粉道途;
  if (!rule) return { ok: true, rule: null, exp: 0, stage: null, path };
  const exp = Math.max(0, Math.min(rule.targetExp, Math.trunc(number(path.stages[rule.key]))));
  return { ok: exp >= rule.targetExp, rule, exp, stage: getFlowerDaoStage(exp, rule), path };
}

export function getFlowerDaoAttemptCost(player, realmId, eraIndex = 2) {
  const rule = getFlowerDaoRuleForRealm(realmId);
  if (!rule) return null;
  const base = getFlowerEvolutionCost(realmId, eraIndex);
  const amount = Math.max(100000, Math.trunc(base * 0.08));
  return { cultivation: amount, blood: amount, rule };
}

export function calculateFlowerDaoGain(player, realmId, random = Math.random, options = {}) {
  const rule = getFlowerDaoRuleForRealm(realmId);
  if (!rule) return { gain: 0, rule: null };
  const pollution = getPollenPollutionState(player);
  const branch = getFlowerBranchProfile(player);
  const [, breathing] = getBestBreathingMethod(player);
  const era = getFlowerEraProfile(options.eraIndex);
  const multiplier = clamp(1 + breathing * 2 + branch.daoBonus + era.chanceShift - pollution.successPenalty, 0.5, 2.5);
  const randomFactor = 0.9 + clamp(number(random()), 0, 1) * 0.2;
  return { gain: Math.max(1, Math.trunc(rule.baseGain * multiplier * randomFactor)), rule, multiplier };
}

export function recordFlowerDaoAttempt(player, realmId, gain, dateKey = '') {
  const gate = getFlowerDaoGateState(player, realmId);
  if (!gate.rule) return { ok: false, reason: 'no-rule' };
  if (gate.ok) return { ok: false, reason: 'complete', gate };
  if (gate.path.daily.date !== dateKey) {
    gate.path.daily.date = dateKey;
    gate.path.daily.count = 0;
  }
  if (gate.path.daily.count >= FLOWER_DAO_DAILY_LIMIT) return { ok: false, reason: 'daily', gate };
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
  return clamp(
    gate.rule.baseChance
      + breathing * pollution.breathingMultiplier
      + branch.chanceShift
      + era.chanceShift * 0.5
      + failureProtection
      + stoneJarBonus
      - riskPenalty
      - pollution.successPenalty
      - pollution.markSuccessPenalty,
    0.15,
    0.95
  );
}

export function resolveFlowerTribulation(player, random = Math.random, options = {}) {
  ensureFlowerPollenState(player);
  const realmId = Math.trunc(number(options.realmId, player.huafenlevel_id));
  const gate = getFlowerTribulationGateState(player, realmId);
  if (!gate.rule) return { ok: false, reason: 'no-rule' };
  if (gate.completed) return { ok: false, reason: 'complete', gate };
  const daoGate = getFlowerDaoGateState(player, realmId);
  if (!daoGate.ok) return { ok: false, reason: 'dao', daoGate, gate };

  const chance = getFlowerTribulationChance(player, realmId, options);
  const stageAdjustments = [0.05, 0.02, 0, -0.05];
  const stages = gate.rule.stages.map((name, index) => {
    const stageChance = clamp(chance + (stageAdjustments[index] || 0), 0.15, 0.95);
    return { name, chance: stageChance, ok: number(random()) < stageChance };
  });
  const failed = stages.find(stage => !stage.ok);
  const now = Math.trunc(number(options.now, Date.now()));

  if (failed) {
    gate.path.failures[realmId] = gate.failures + 1;
    player.花粉隐患 = Math.min(200, player.花粉隐患 + gate.rule.failureRisk);
    const mutated = number(random()) < getMutationChance(player);
    const stoneJarRate = options.stoneJar ? 0.5 : 1;
    const pollutionGain = Math.max(1, Math.trunc(gate.rule.failurePollution * stoneJarRate)) + (mutated ? 6 : 0);
    player.始祖污染度 = Math.min(POLLUTION_MAX, player.始祖污染度 + pollutionGain);
    player.进化积淀 += Math.max(6, Math.trunc(gate.rule.rewardAccumulation * 0.2));
    gate.path.history.push({ realmId, name: gate.rule.name, ok: false, failedStage: failed.name, at: now });
    gate.path.history = gate.path.history.slice(-20);
    return {
      ok: false,
      reason: mutated ? 'mutated' : 'failed',
      rule: gate.rule,
      chance,
      stages,
      failedStage: failed.name,
      pollutionGain,
      mutated,
      failures: gate.failures + 1,
    };
  }

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
    chance,
    stages,
    rewardAccumulation: gate.rule.rewardAccumulation,
    riskRelief: gate.rule.riskRelief,
    pollutionRelief: gate.rule.pollutionRelief,
    record,
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
  ));
}

export function getFlowerBreakthroughRule(currentLevelId) {
  return FLOWER_BREAKTHROUGH_RULES[Math.trunc(number(currentLevelId, 0))] || null;
}

export function resolveFlowerBreakthrough(player, mediumName, random = Math.random, options = {}) {
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
  player.huafenlevel_id = targetLevelId;
  if (targetLevelId === 17) {
    player.花粉路分支 = player.花粉极境.includes('究极根基') ? '究极' : '大宇';
  } else if (targetLevelId === 18) {
    player.花粉路前身分支 = player.花粉路分支 || (player.花粉极境.includes('究极根基') ? '究极' : '大宇');
    player.花粉路分支 = '宇究';
  }
  return { ok: true, breakthrough: true, chance, targetLevelId, stages, branch: player.花粉路分支 };
}

export function resolveFlowerEvolution(player, mediumName, random = Math.random, options = {}) {
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

  player.huafenlevel_id = targetLevelId;
  if (targetLevelId === 17) {
    player.花粉路分支 = player.花粉极境.includes('究极根基') ? '究极' : '大宇';
  } else if (targetLevelId === 18) {
    player.花粉路前身分支 = player.花粉路分支 || (player.花粉极境.includes('究极根基') ? '究极' : '大宇');
    player.花粉路分支 = '宇究';
  }
  return { ok: true, chance, targetLevelId, branch: player.花粉路分支 };
}

export function getNextFlowerExtremeTrial(player) {
  ensureFlowerPollenState(player);
  const formerBranch = player.花粉路前身分支
    || (player.花粉极境.includes('究极根基') ? '究极' : '大宇');
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
  return getPollenPollutionState(player).attrMultiplier;
}

export { BREATHING_BONUSES };
