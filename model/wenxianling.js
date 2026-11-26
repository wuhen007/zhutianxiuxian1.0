import { createRealmEventLocation } from './realmEventLocation.js';
import {
  getExtraCultivationLevelProduct,
  getExtraCultivationLevelSum,
} from './extraCultivation.js';
import { getRealmAuthorityLevel } from './realmAuthority.js';
import {
  getCoordinateLocations,
  getShanghaiDateKey,
  hasCoordinate,
} from './weimianTravel.js';

export const WENXIAN_EXP_PER_LEVEL = 1000;
export const WENXIAN_MAX_LEVEL = 60;
export const WENXIAN_PENDING_EXP_CAP = 1000;
export const WENXIAN_REQUIRED_REALM_LEVEL = 5;
export const WENXIAN_CLUE_COST = 3_000_000_000;
export const WENXIAN_DUNGEON_CLUE_CHANCE = 0.01;
export const WENXIAN_DUNGEON_CLUE_PITY = 30;
export const WENXIAN_DAILY_TASK_TARGET = 7;
export const WENXIAN_DAILY_QUEST_EXP = 500;
export const WENXIAN_WEEKLY_TASK_EXP = 3000;
export const WENXIAN_DAILY_QUEST_GOALS = Object.freeze({
  spiritHeart: 30,
  tianjiao: 1,
  dungeon: 3,
});
export const WENXIAN_WEEKLY_TASK_GOALS = Object.freeze({
  dailyTask: 5,
  tianjiao: 5,
  stoneMarket: 5,
  spiritHeart: 100,
  dungeon: 20,
});

function toNonNegativeInteger(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export function getWenXianWeekKey(now = new Date()) {
  const date = new Date(`${getShanghaiDateKey(now)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function normalizeTaskProgress(progress, goals) {
  return Object.fromEntries(Object.entries(goals).map(([type, goal]) => [
    type,
    Math.min(goal, toNonNegativeInteger(progress?.[type])),
  ]));
}

export function ensureWenXianTaskState(player, options = {}) {
  const state = ensureWenXianState(player);
  if (!state) return null;

  const dateKey = options.dateKey || getShanghaiDateKey(options.now);
  const weekKey = options.weekKey || getWenXianWeekKey(options.now);
  const tasks = state.tasks && typeof state.tasks === 'object' ? state.tasks : {};

  const oldDaily = tasks.daily && tasks.daily.dateKey === dateKey ? tasks.daily : {};
  const oldWeekly = tasks.weekly && tasks.weekly.weekKey === weekKey ? tasks.weekly : {};
  tasks.daily = {
    dateKey,
    progress: normalizeTaskProgress(oldDaily.progress, WENXIAN_DAILY_QUEST_GOALS),
    rewarded: Object.fromEntries(Object.keys(WENXIAN_DAILY_QUEST_GOALS).map(type => [
      type,
      Boolean(oldDaily.rewarded?.[type]),
    ])),
  };
  tasks.weekly = {
    weekKey,
    progress: normalizeTaskProgress(oldWeekly.progress, WENXIAN_WEEKLY_TASK_GOALS),
    claimed: Boolean(oldWeekly.claimed),
  };
  state.tasks = tasks;
  return tasks;
}

export function isWenXianWeeklyTaskComplete(player, options = {}) {
  const weekly = ensureWenXianTaskState(player, options)?.weekly;
  return Boolean(weekly && Object.entries(WENXIAN_WEEKLY_TASK_GOALS)
    .every(([type, goal]) => weekly.progress[type] >= goal));
}

export function recordWenXianTaskProgress(player, type, amount = 1, options = {}) {
  const tasks = ensureWenXianTaskState(player, options);
  const gain = toNonNegativeInteger(amount);
  if (!tasks || gain <= 0) return { changed: false, reason: 'invalid' };

  let changed = false;
  let dailyCompleted = false;
  let expResult = null;
  const dailyGoal = WENXIAN_DAILY_QUEST_GOALS[type];
  if (dailyGoal) {
    const before = tasks.daily.progress[type];
    tasks.daily.progress[type] = Math.min(dailyGoal, before + gain);
    changed ||= tasks.daily.progress[type] !== before;
    if (tasks.daily.progress[type] >= dailyGoal && !tasks.daily.rewarded[type]) {
      tasks.daily.rewarded[type] = true;
      dailyCompleted = true;
      expResult = addWenXianExp(player, WENXIAN_DAILY_QUEST_EXP);
    }
  }

  const weeklyGoal = WENXIAN_WEEKLY_TASK_GOALS[type];
  if (weeklyGoal) {
    const before = tasks.weekly.progress[type];
    tasks.weekly.progress[type] = Math.min(weeklyGoal, before + gain);
    changed ||= tasks.weekly.progress[type] !== before;
  }

  return {
    changed,
    type,
    dailyCompleted,
    expResult,
    daily: tasks.daily,
    weekly: tasks.weekly,
    weeklyReady: isWenXianWeeklyTaskComplete(player, options),
  };
}

export function calculateWenXianWeeklyRewards(player, random = Math.random) {
  const level = toNonNegativeInteger(player?.level_id);
  const physique = toNonNegativeInteger(player?.Physique_id);
  const realmMultiplier = getExtraCultivationLevelProduct(player);
  const realmTotal = getExtraCultivationLevelSum(player);
  return {
    xiuwei: Math.floor(2000 + 10000 * level * level * realmMultiplier * (2 + random())),
    xueqi: Math.floor(2000 + 10000 * physique * physique * realmMultiplier * (2 + random())),
    lingshi: 10_000_000 * realmTotal,
    yuanshi: 10_000_000 * realmTotal,
    wenxianExp: WENXIAN_WEEKLY_TASK_EXP,
  };
}

export function claimWenXianWeeklyTask(player, options = {}) {
  const tasks = ensureWenXianTaskState(player, options);
  if (!tasks) return { ok: false, reason: 'invalid' };
  if (tasks.weekly.claimed) return { ok: false, reason: 'claimed', weekly: tasks.weekly };
  if (!isWenXianWeeklyTaskComplete(player, options)) {
    return { ok: false, reason: 'incomplete', weekly: tasks.weekly };
  }

  const rewards = calculateWenXianWeeklyRewards(player, options.random || Math.random);
  player.修为 = (Number(player.修为) || 0) + rewards.xiuwei;
  player.血气 = (Number(player.血气) || 0) + rewards.xueqi;
  player.灵石 = (Number(player.灵石) || 0) + rewards.lingshi;
  player.源石 = (Number(player.源石) || 0) + rewards.yuanshi;
  const expResult = addWenXianExp(player, rewards.wenxianExp);
  tasks.weekly.claimed = true;
  return { ok: true, rewards, expResult, weekly: tasks.weekly };
}

export function isWenXianEligible(player) {
  return getRealmAuthorityLevel(player) >= WENXIAN_REQUIRED_REALM_LEVEL;
}

export function ensureWenXianState(player) {
  if (!player || typeof player !== 'object') return null;

  const existing = player.问仙令 && typeof player.问仙令 === 'object'
    ? player.问仙令
    : {};
  const claimed = Array.isArray(existing.claimed)
    ? [...new Set(existing.claimed.map(Number).filter(level => level >= 1 && level <= WENXIAN_MAX_LEVEL))]
    : [];
  const legacyUnlocked = toNonNegativeInteger(existing.exp) > 0
    || toNonNegativeInteger(existing.level) > 0
    || claimed.length > 0;
  const trial = existing.trial && typeof existing.trial === 'object'
    ? existing.trial
    : {};
  const legacyLevel = Math.max(
    toNonNegativeInteger(existing.level),
    claimed.length ? Math.max(...claimed) : 0,
  );

  existing.exp = Math.min(
    WENXIAN_MAX_LEVEL * WENXIAN_EXP_PER_LEVEL,
    Math.max(toNonNegativeInteger(existing.exp), legacyLevel * WENXIAN_EXP_PER_LEVEL),
  );
  existing.level = Math.min(WENXIAN_MAX_LEVEL, Math.floor(existing.exp / WENXIAN_EXP_PER_LEVEL));
  existing.claimed = claimed;
  existing.unlocked = typeof existing.unlocked === 'boolean' ? existing.unlocked : legacyUnlocked;
  existing.pendingExp = Math.min(WENXIAN_PENDING_EXP_CAP, toNonNegativeInteger(existing.pendingExp));
  existing.clue = existing.clue && typeof existing.clue === 'object' ? existing.clue : null;
  existing.dungeonClueAttempts = Math.min(
    WENXIAN_DUNGEON_CLUE_PITY,
    toNonNegativeInteger(existing.dungeonClueAttempts),
  );
  existing.lastDungeonClueDate = typeof existing.lastDungeonClueDate === 'string'
    ? existing.lastDungeonClueDate
    : '';
  existing.trial = {
    dailyTasks: Math.min(WENXIAN_DAILY_TASK_TARGET, toNonNegativeInteger(trial.dailyTasks)),
    lastDailyTaskDate: typeof trial.lastDailyTaskDate === 'string' ? trial.lastDailyTaskDate : '',
    innerWorldOpened: Boolean(trial.innerWorldOpened),
    tianjiaoDefeated: Boolean(trial.tianjiaoDefeated),
    clueExplored: Boolean(trial.clueExplored),
  };

  player.问仙令 = existing;
  return existing;
}

export function createWenXianTrialLocation(player, random = Math.random) {
  const knownPlanes = ['凡间', ...getCoordinateLocations().filter(plane => hasCoordinate(player, plane))];
  const plane = knownPlanes[Math.floor(random() * knownPlanes.length)] || '凡间';
  return createRealmEventLocation({ plane, random });
}

export function isWenXianTrialComplete(player) {
  const state = ensureWenXianState(player);
  const trial = state?.trial;
  return Boolean(
    state?.clue
    && trial?.dailyTasks >= WENXIAN_DAILY_TASK_TARGET
    && trial?.innerWorldOpened
    && trial?.tianjiaoDefeated
    && trial?.clueExplored
  );
}

export function grantWenXianClue(player, source, options = {}) {
  if (!isWenXianEligible(player)) return { ok: false, reason: 'ineligible' };
  const state = ensureWenXianState(player);
  if (state.unlocked) return { ok: false, reason: 'unlocked' };
  if (state.clue) return { ok: false, reason: 'known', clue: state.clue };

  const destination = options.location || createWenXianTrialLocation(player, options.random);
  if (!destination) return { ok: false, reason: 'no-location' };

  state.clue = {
    source,
    acquiredAt: Number(options.now) || Date.now(),
    plane: destination.plane,
    location: destination.location,
    coordinate: destination.coordinate,
  };
  if (Number(player.内景地开辟) === 1) state.trial.innerWorldOpened = true;
  return { ok: true, clue: state.clue };
}

export function purchaseWenXianClue(player, options = {}) {
  const state = ensureWenXianState(player);
  if (!isWenXianEligible(player)) return { ok: false, reason: 'ineligible', cost: WENXIAN_CLUE_COST };
  if (state.unlocked) return { ok: false, reason: 'unlocked', cost: WENXIAN_CLUE_COST };
  if (state.clue) return { ok: false, reason: 'known', cost: WENXIAN_CLUE_COST };
  if ((Number(player.源石) || 0) < WENXIAN_CLUE_COST) {
    return { ok: false, reason: 'insufficient', cost: WENXIAN_CLUE_COST };
  }

  const result = grantWenXianClue(player, '重金求取', options);
  if (!result.ok) return { ...result, cost: WENXIAN_CLUE_COST };
  player.源石 = Number(player.源石) - WENXIAN_CLUE_COST;
  return { ...result, cost: WENXIAN_CLUE_COST };
}

export function rollDailyDungeonWenXianClue(player, options = {}) {
  if (!isWenXianEligible(player)) return { attempted: false, reason: 'ineligible' };
  const state = ensureWenXianState(player);
  if (state.unlocked) return { attempted: false, reason: 'unlocked' };
  if (state.clue) return { attempted: false, reason: 'known', clue: state.clue };

  const dateKey = options.dateKey || getShanghaiDateKey(options.now);
  if (state.lastDungeonClueDate === dateKey) return { attempted: false, reason: 'daily-limit' };

  state.lastDungeonClueDate = dateKey;
  state.dungeonClueAttempts = Math.min(
    WENXIAN_DUNGEON_CLUE_PITY,
    state.dungeonClueAttempts + 1,
  );
  const random = options.random || Math.random;
  const pity = state.dungeonClueAttempts >= WENXIAN_DUNGEON_CLUE_PITY;
  const chance = Math.min(1, Math.max(0,
    (options.chance ?? WENXIAN_DUNGEON_CLUE_CHANCE) * (options.chanceMultiplier ?? 1)
  ));
  const found = pity || random() < chance;
  if (!found) {
    return { attempted: true, reason: 'miss', attempts: state.dungeonClueAttempts };
  }

  const result = grantWenXianClue(player, pity ? '副本保底' : '副本残痕', {
    ...options,
    random,
  });
  return {
    attempted: true,
    reason: result.ok ? 'found' : result.reason,
    found: result.ok,
    pity,
    attempts: state.dungeonClueAttempts,
    clue: result.clue,
  };
}

export function recordWenXianTrial(player, type, options = {}) {
  const state = ensureWenXianState(player);
  if (!state?.clue || state.unlocked) return { changed: false, reason: 'inactive', ready: false };

  const trial = state.trial;
  let changed = false;
  if (type === 'daily') {
    const dateKey = options.dateKey || getShanghaiDateKey(options.now);
    if (trial.lastDailyTaskDate !== dateKey && trial.dailyTasks < WENXIAN_DAILY_TASK_TARGET) {
      trial.lastDailyTaskDate = dateKey;
      trial.dailyTasks++;
      changed = true;
    }
  } else if (type === 'inner-world' && !trial.innerWorldOpened) {
    trial.innerWorldOpened = true;
    changed = true;
  } else if (type === 'tianjiao' && !trial.tianjiaoDefeated) {
    trial.tianjiaoDefeated = true;
    changed = true;
  } else if (type === 'explore' && !trial.clueExplored) {
    trial.clueExplored = true;
    changed = true;
  }

  return { changed, trial, ready: isWenXianTrialComplete(player) };
}

export function addWenXianExp(player, amount) {
  const state = ensureWenXianState(player);
  const requested = toNonNegativeInteger(amount);
  if (!state || requested <= 0) return { ok: false, reason: 'invalid' };

  if (!state.unlocked) {
    const oldPending = state.pendingExp;
    state.pendingExp = Math.min(WENXIAN_PENDING_EXP_CAP, state.pendingExp + requested);
    return {
      ok: true,
      unlocked: false,
      banked: true,
      added: state.pendingExp - oldPending,
      pendingExp: state.pendingExp,
    };
  }

  const oldLevel = state.level;
  const oldExp = state.exp;
  state.exp = Math.min(WENXIAN_MAX_LEVEL * WENXIAN_EXP_PER_LEVEL, state.exp + requested);
  state.level = Math.min(WENXIAN_MAX_LEVEL, Math.floor(state.exp / WENXIAN_EXP_PER_LEVEL));
  const newClaimable = [];
  for (let level = oldLevel + 1; level <= state.level; level++) {
    if (!state.claimed.includes(level)) newClaimable.push(level);
  }
  return {
    ok: true,
    unlocked: true,
    banked: false,
    added: state.exp - oldExp,
    levelUp: state.level > oldLevel,
    oldLevel,
    newLevel: state.level,
    newClaimable,
  };
}

export function activateWenXianLing(player, now = Date.now()) {
  const state = ensureWenXianState(player);
  if (state.unlocked) return { ok: false, reason: 'unlocked' };
  if (!state.clue) return { ok: false, reason: 'no-clue' };
  if (!isWenXianTrialComplete(player)) return { ok: false, reason: 'incomplete', trial: state.trial };

  state.unlocked = true;
  state.activatedAt = Number(now) || Date.now();
  const pendingExp = state.pendingExp;
  state.pendingExp = 0;
  const expResult = pendingExp > 0
    ? addWenXianExp(player, pendingExp)
    : { levelUp: false, oldLevel: state.level, newLevel: state.level, newClaimable: [] };
  return { ok: true, pendingExp, ...expResult };
}
