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
  return player;
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
  return Object.entries(BREATHING_BONUSES)
    .filter(([name]) => learned.includes(name))
    .sort((a, b) => b[1] - a[1])[0] || ['', 0];
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
  return clamp(
    POLLUTION_BASE_MUTATION_RATE + riskFactor + levelFactor,
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
  return Math.max(0.1, Math.min(0.95,
    base
    + medium.chance
    + accumulation
    + breathing * pollution.breathingMultiplier
    + ancestorSeed
    - risk
    + eraShift
    - pollution.successPenalty
    - pollution.markSuccessPenalty
  ));
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
  return {
    攻击: Math.trunc(number(realm.基础攻击) * rate),
    防御: Math.trunc(number(realm.基础防御) * rate),
    血量: Math.trunc(number(realm.基础血量) * rate),
    rate,
  };
}

export { BREATHING_BONUSES };
