export const GONGFA_PROFICIENCY_MAX = 1000;
export const GONGFA_DAILY_GAIN_MAX = 20;

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

export function getSkillProficiencyOwner(skill) {
  return String(skill?.熟练度归属 || skill?.name || '').trim();
}

export function getGongfaTriggerChance(player, skill, chance = skill?.pr) {
  const base = clamp(chance, 0, 1);
  if (skill?.class !== '功法') return base;
  const owner = getSkillProficiencyOwner(skill);
  if (!hasLearnedGongfa(player, owner)) return base;
  return clamp(base * getGongfaProficiencyProfile(player, owner).trigger, 0, 1);
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
