import { resolveDecadeCombatSkill } from './decadeCombat.js';

export const GONGFA_PROFICIENCY_MAX = 1000;
export const GONGFA_DAILY_GAIN_MAX = 20;
export const DOUZI_MIMIC_BASE_CHANCE = 0.02;
export const DOUZI_MIMIC_MAX_CHANCE = 0.1;
export const NUMBER_SECRET_TRIGGER_CHANCE = 0.05;

const ZHEZI_HEAL_RATES = Object.freeze([0.1, 0.1, 0.15, 0.2, 0.25, 0.35]);
const BUMIE_HEAL_RATES = Object.freeze([0.12, 0.12, 0.2, 0.3, 0.4, 0.55]);

export const GONGFA_PROFICIENCY_STAGES = Object.freeze([
  Object.freeze({ name: '初窥门径', min: 0, trigger: 1, combat: 1, numeric: 1 }),
  Object.freeze({ name: '略有所成', min: 100, trigger: 1.03, combat: 1.02, numeric: 1.02 }),
  Object.freeze({ name: '融会贯通', min: 250, trigger: 1.06, combat: 1.04, numeric: 1.04 }),
  Object.freeze({ name: '炉火纯青', min: 500, trigger: 1.09, combat: 1.07, numeric: 1.06 }),
  Object.freeze({ name: '登峰造极', min: 750, trigger: 1.12, combat: 1.1, numeric: 1.08 }),
  Object.freeze({ name: '出神入化', min: 1000, trigger: 1.15, combat: 1.15, numeric: 1.1 }),
]);

const DUNGEON_REDUCTIONS = Object.freeze({
  鲲鹏宝术: Object.freeze([0, 0.02, 0.04, 0.06, 0.08, 0.1]),
  行字秘: Object.freeze([0, 0.01, 0.03, 0.05, 0.07, 0.08]),
});

const WUDAO_REDUCTIONS = Object.freeze({
  '浑源法门·悟道': Object.freeze([0, 0.03, 0.06, 0.09, 0.12, 0.15]),
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function shanghaiDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getLearnedGongfaNames(playerOrLearned) {
  const learned = Array.isArray(playerOrLearned)
    ? playerOrLearned
    : playerOrLearned?.学习的功法;
  if (Array.isArray(learned)) {
    return learned
      .map(item => typeof item === 'string' ? item : item?.name)
      .filter(Boolean);
  }
  if (learned && typeof learned === 'object') return Object.keys(learned);
  return [];
}

export function hasLearnedGongfa(player, name) {
  return Boolean(name) && getLearnedGongfaNames(player).includes(name);
}

export function ensureGongfaProficiency(player) {
  if (!player || typeof player !== 'object') return {};
  if (!player.功法熟练度 || typeof player.功法熟练度 !== 'object' || Array.isArray(player.功法熟练度)) {
    player.功法熟练度 = {};
  }
  return player.功法熟练度;
}

export function ensureGongfaDailyGain(player) {
  if (!player || typeof player !== 'object') return { 日期: '', 收益: {} };
  if (!player.功法熟练度每日 || typeof player.功法熟练度每日 !== 'object' || Array.isArray(player.功法熟练度每日)) {
    player.功法熟练度每日 = { 日期: '', 收益: {} };
  }
  if (!player.功法熟练度每日.收益 || typeof player.功法熟练度每日.收益 !== 'object') {
    player.功法熟练度每日.收益 = {};
  }
  return player.功法熟练度每日;
}

export function getGongfaDailyGain(player, name, now = new Date()) {
  const daily = player?.功法熟练度每日;
  if (daily?.日期 !== shanghaiDateKey(now)) return 0;
  return Math.max(0, Math.floor(Number(daily?.收益?.[name]) || 0));
}

export function getGongfaProficiency(player, name) {
  return Math.floor(clamp(player?.功法熟练度?.[name], 0, GONGFA_PROFICIENCY_MAX));
}

export function getGongfaProficiencyProfile(player, name) {
  const exp = getGongfaProficiency(player, name);
  let index = 0;
  for (let i = GONGFA_PROFICIENCY_STAGES.length - 1; i >= 0; i--) {
    if (exp >= GONGFA_PROFICIENCY_STAGES[i].min) {
      index = i;
      break;
    }
  }
  const stage = GONGFA_PROFICIENCY_STAGES[index];
  const next = GONGFA_PROFICIENCY_STAGES[index + 1] || stage;
  return { ...stage, exp, index, nextExp: next.min };
}

export function getDouziMimicChance(player) {
  if (!hasLearnedGongfa(player, '斗字秘')) return 0;
  const progress = getGongfaProficiency(player, '斗字秘') / GONGFA_PROFICIENCY_MAX;
  return DOUZI_MIMIC_BASE_CHANCE
    + (DOUZI_MIMIC_MAX_CHANCE - DOUZI_MIMIC_BASE_CHANCE) * progress;
}

export function getVitalityRecoveryRate(player, name) {
  const rates = name === '者字秘'
    ? ZHEZI_HEAL_RATES
    : name === '不灭经'
      ? BUMIE_HEAL_RATES
      : null;
  if (!rates || !hasLearnedGongfa(player, name)) return 0;
  return rates[getGongfaProficiencyProfile(player, name).index] || 0;
}

export function getZheziReviveConfig(player) {
  if (!hasLearnedGongfa(player, '者字秘')) return { maxRevives: 0, recoveryRatios: [] };
  const mastered = getGongfaProficiencyProfile(player, '者字秘').index >= 5;
  return mastered
    ? { maxRevives: 2, recoveryRatios: [1, 0.55] }
    : { maxRevives: 1, recoveryRatios: [1] };
}

export function tryVitalityRecovery(player, skill, timing, random = Math.random, healingMultiplier = 1) {
  const name = skill?.熟练度归属 || skill?.name;
  const expectedTiming = name === '者字秘' ? '受击后' : name === '不灭经' ? '行动前' : '';
  if (!expectedTiming || timing !== expectedTiming || !hasLearnedGongfa(player, name)) {
    return { triggered: false, reason: 'unavailable' };
  }
  const maxHp = Math.max(0, Number(player?.血量上限) || 0);
  const currentHp = Math.max(0, Number(player?.当前血量) || 0);
  if (!maxHp || currentHp <= 0 || currentHp >= maxHp) return { triggered: false, reason: 'health' };
  const chance = getGongfaTriggerChance(player, skill);
  if (random() >= chance) return { triggered: false, reason: 'missed', chance };

  const rate = getVitalityRecoveryRate(player, name);
  const multiplier = clamp(healingMultiplier, 0, 1);
  const amount = Math.min(maxHp - currentHp, Math.trunc(maxHp * rate * multiplier));
  if (amount <= 0) return { triggered: false, reason: 'health', chance };
  player.当前血量 = currentHp + amount;
  recordGongfaCombatTrigger(player, name);
  return { triggered: true, name, rate, amount, chance };
}

export function tryLearnTianjiaoGongfa(player, targetGongfa, random = Math.random) {
  const chance = getDouziMimicChance(player);
  if (!chance) return { ok: false, reason: 'unlearned', chance };

  const learned = new Set(getLearnedGongfaNames(player));
  const learnable = [...new Set(
    (Array.isArray(targetGongfa) ? targetGongfa : [])
      .map(name => String(name || '').trim())
      .filter(name => name && !learned.has(name))
  )];
  if (!learnable.length) return { ok: false, reason: 'mastered', chance };
  if (random() >= chance) return { ok: false, reason: 'missed', chance };

  const roll = Math.max(0, Math.min(1 - Number.EPSILON, Number(random()) || 0));
  const name = learnable[Math.floor(roll * learnable.length)];
  player.学习的功法 = Array.isArray(player.学习的功法)
    ? player.学习的功法
    : getLearnedGongfaNames(player);
  player.学习的功法.push(name);
  ensureGongfaProficiency(player)[name] = 0;
  return { ok: true, name, chance };
}

export function getSkillProficiencyOwner(skill) {
  return String(skill?.熟练度归属 || skill?.name || '').trim();
}

export function getGongfaTriggerChance(player, skill, chance = skill?.pr, random = Math.random) {
  const base = clamp(chance, 0, 1);
  if (skill?.class !== '功法') return base;
  const owner = getSkillProficiencyOwner(skill);
  if (!hasLearnedGongfa(player, owner)) return base;
  const suppression = Math.min(1, Math.max(0, Number(player?._功法压制概率) || 0));
  if (suppression > 0 && random() < suppression) return 0;
  return clamp(base * getGongfaProficiencyProfile(player, owner).trigger, 0, 1);
}

export function getMijueTriggerChance(player, name, random = Math.random) {
  const learnedCount = getLearnedGongfaNames(player).filter(gongfa =>
    ['临', '兵', '斗', '者', '皆', '数', '组', '前', '行'].some(mijue => gongfa.includes(mijue))
  ).length;
  const base = Math.min(1, 0.01 + learnedCount * 0.1);
  return getGongfaTriggerChance(player, { name, class: '功法', pr: base }, base, random);
}

export function getYiqihuaTriggerChance(player, random = Math.random) {
  return getGongfaTriggerChance(
    player,
    { name: '一气化三清', class: '功法', pr: 0.9 },
    0.9,
    random
  );
}

export function getNumberSecretTriggerChance(player) {
  return hasLearnedGongfa(player, '数字秘') ? NUMBER_SECRET_TRIGGER_CHANCE : 0;
}

export function getNumberSecretConfig(player) {
  const combo = hasLearnedGongfa(player, '一气化三清');
  return combo
    ? { count: 3, ratio: 0.65, duration: 3, combo: true }
    : { count: 2, ratio: 0.55, duration: 2, combo: false };
}

export function scaleDaoBodyStats(body, ratio) {
  const scale = clamp(ratio, 0, 1);
  const integerFields = ['攻击', '防御', '血量上限', '当前血量', '速度', '元神', '元神上限', '神识'];
  const ratioFields = [
    '暴击率', '法球倍率', '吸血率', '闪避率', '穿透',
    '元神伤害加成', '元神伤害减免', '神通伤害加成', '神通伤害减免',
    '近战伤害加成', '近战伤害减免', '全伤害类型加成', '全类型减免',
    '治疗效果加成', '每回合恢复', '血上限加成', '减伤',
  ];
  for (const field of integerFields) {
    if (Number.isFinite(Number(body?.[field]))) body[field] = Math.trunc(body[field] * scale);
  }
  for (const field of ratioFields) {
    if (Number.isFinite(Number(body?.[field]))) body[field] *= scale;
  }
  if (Number.isFinite(Number(body?.暴击伤害))) {
    body.暴击伤害 = 1 + Math.max(0, body.暴击伤害 - 1) * scale;
  }
  return body;
}

export function getGongfaCombatMultiplier(player, skill) {
  if (skill?.class !== '功法') return 1;
  const owner = getSkillProficiencyOwner(skill);
  return hasLearnedGongfa(player, owner)
    ? getGongfaProficiencyProfile(player, owner).combat
    : 1;
}

export function getGongfaNumericMultiplier(player, skillOrName) {
  const owner = typeof skillOrName === 'string'
    ? skillOrName
    : getSkillProficiencyOwner(skillOrName);
  return hasLearnedGongfa(player, owner)
    ? getGongfaProficiencyProfile(player, owner).numeric
    : 1;
}

export function recordGongfaCombatTrigger(player, skillOrName) {
  const owner = typeof skillOrName === 'string'
    ? skillOrName
    : getSkillProficiencyOwner(skillOrName);
  if (!hasLearnedGongfa(player, owner)) return false;
  if (!Array.isArray(player._本场触发功法)) player._本场触发功法 = [];
  if (!player._本场触发功法.includes(owner)) player._本场触发功法.push(owner);
  return true;
}

export function addGongfaProficiency(player, name, amount, options = {}) {
  const gain = Math.max(0, Math.floor(Number(amount) || 0));
  if (!gain || !hasLearnedGongfa(player, name)) return 0;

  const date = options.dateKey || shanghaiDateKey(options.now);
  const dailyState = ensureGongfaDailyGain(player);
  if (dailyState.日期 !== date) {
    dailyState.日期 = date;
    dailyState.收益 = {};
  }
  const daily = dailyState.收益;
  const gainedToday = Math.max(0, Math.floor(Number(daily[name]) || 0));
  const allowed = Math.min(gain, Math.max(0, GONGFA_DAILY_GAIN_MAX - gainedToday));
  if (!allowed) return 0;

  const proficiency = ensureGongfaProficiency(player);
  const current = getGongfaProficiency(player, name);
  const actual = Math.min(allowed, GONGFA_PROFICIENCY_MAX - current);
  if (!actual) return 0;
  proficiency[name] = current + actual;
  daily[name] = gainedToday + actual;
  return actual;
}

export function allocateGongfaInsight(player, name, amount) {
  const requested = Math.max(0, Math.floor(Number(amount) || 0));
  if (!requested) return { ok: false, reason: 'amount' };
  if (!hasLearnedGongfa(player, name)) return { ok: false, reason: 'unlearned' };

  const balance = Math.max(0, Math.floor(Number(player?.功法感悟值) || 0));
  if (balance < requested) return { ok: false, reason: 'balance', balance };
  const current = getGongfaProficiency(player, name);
  const spent = Math.min(requested, GONGFA_PROFICIENCY_MAX - current);
  if (!spent) return { ok: false, reason: 'max', balance };

  ensureGongfaProficiency(player)[name] = current + spent;
  player.功法感悟值 = balance - spent;
  return {
    ok: true,
    spent,
    proficiency: current + spent,
    balance: player.功法感悟值,
  };
}

/**
 * 招式解析的硬性契约：只允许替换「效果数值 + 战斗文案」，
 * 绝不允许改动 name / class / cnt 这三个技能标识字段。
 * 战斗引擎按 name 反查归属（功法查 hasLearnedGongfa、灵根查 hasSupremeInnate），
 * 一旦 name 被招式名覆盖，该技能在所有战斗场景下都会判定失败、永不触发。
 */
export function resolveGongfaCombatSkill(player, skill, random = Math.random) {
  if (skill?.class === '灵根' && skill?.帝骑技能池) {
    const resolved = resolveDecadeCombatSkill(player, skill, random);
    if (resolved === skill) return skill;
    return { ...resolved, name: skill.name, class: skill.class, cnt: skill.cnt };
  }
  if (skill?.class !== '功法' || !Array.isArray(skill.招式) || !skill.招式.length) return skill;
  const proficiency = getGongfaProficiency(player, getSkillProficiencyOwner(skill));
  const moves = skill.招式.filter(move => proficiency >= Math.max(0, Number(move?.最低熟练度) || 0));
  if (!moves.length) return skill;
  const roll = Math.max(0, Math.min(1 - Number.EPSILON, Number(random()) || 0));
  const { name: moveName, class: _moveClass, cnt: _moveCnt, ...effect } = moves[Math.floor(roll * moves.length)];
  return { ...skill, ...effect, name: skill.name, class: skill.class, cnt: skill.cnt, 招式名: moveName };
}

export function awardRecordedCombatProficiency(player, amount = 1, options = {}) {
  const result = {};
  for (const name of new Set(player?._本场触发功法 || [])) {
    const gained = addGongfaProficiency(player, name, amount, options);
    if (gained > 0) result[name] = gained;
  }
  if (player && typeof player === 'object') delete player._本场触发功法;
  return result;
}

export function awardDungeonGongfaProficiency(player, amount = 2, options = {}) {
  const result = {};
  for (const name of Object.keys(DUNGEON_REDUCTIONS)) {
    const gained = addGongfaProficiency(player, name, amount, options);
    if (gained > 0) result[name] = gained;
  }
  return result;
}

export function awardWudaoGongfaProficiency(player, amount = 5, options = {}) {
  const result = {};
  for (const name of Object.keys(WUDAO_REDUCTIONS)) {
    const gained = addGongfaProficiency(player, name, amount, options);
    if (gained > 0) result[name] = gained;
  }
  return result;
}

function getBestConfiguredEffect(player, configurations) {
  let best = { name: '', rate: 0 };
  for (const [name, rates] of Object.entries(configurations)) {
    if (!hasLearnedGongfa(player, name)) continue;
    const profile = getGongfaProficiencyProfile(player, name);
    const rate = Number(rates[profile.index]) || 0;
    if (rate > best.rate) best = { name, rate };
  }
  return best;
}

export function getDungeonGongfaReduction(player) {
  return getBestConfiguredEffect(player, DUNGEON_REDUCTIONS);
}

export function getWudaoGongfaReduction(player) {
  return getBestConfiguredEffect(player, WUDAO_REDUCTIONS);
}

export function getJieziExhaustionRounds(player) {
  const index = getGongfaProficiencyProfile(player, '皆字秘').index;
  if (index >= 5) return 0;
  if (index >= 3) return 1;
  return 2;
}

export function getJieziDurationRounds(player) {
  const index = getGongfaProficiencyProfile(player, '皆字秘').index;
  if (index >= 5) return 4;
  if (index >= 4) return 3;
  if (index >= 3) return 2;
  return 1;
}

export function getLinzDurationRounds(realmLevel) {
  const level = Math.floor(clamp(realmLevel, 1, 9));
  if (level >= 9) return 3;
  if (level >= 7) return 2;
  return 1;
}

export function getYiqihuaConfig(player) {
  const index = getGongfaProficiencyProfile(player, '一气化三清').index;
  if (index >= 5) return { count: 2, ratio: 0.9, duration: -1 };
  if (index >= 4) return { count: 2, ratio: 0.7, duration: 3 };
  if (index >= 3) return { count: 2, ratio: 0.55, duration: 2 };
  return { count: 1, ratio: 0.45, duration: 2 };
}

export function rollLinzRealmLevel(player, random = Math.random) {
  if (getGongfaProficiencyProfile(player, '临字秘').index >= 5) return 9;
  const roll = Math.floor(clamp(random(), 0, 1 - Number.EPSILON) * 9) + 1;
  if (getGongfaProficiencyProfile(player, '临字秘').index >= 3) return Math.max(4, roll);
  return roll;
}

export function getReviveRecoveryRatio(player, skill) {
  const base = clamp(skill?.恢复比例 ?? 0.5, 0, 0.9);
  return Math.min(0.9, base * getGongfaNumericMultiplier(player, skill));
}

export function getDefenseSkillMultiplier(player, skill) {
  const base = Number(skill?.beilv);
  if (!Number.isFinite(base)) return 1;
  if (base < 0 || base > 1) return base;
  const reduction = 1 - base;
  return 1 - Math.min(0.95, reduction * getGongfaNumericMultiplier(player, skill));
}

export function formatGongfaProficiency(player, name) {
  const profile = getGongfaProficiencyProfile(player, name);
  const progress = profile.index >= GONGFA_PROFICIENCY_STAGES.length - 1
    ? '圆满'
    : `${profile.exp}/${profile.nextExp}`;
  return `${name}｜${profile.name}｜${progress}`;
}
