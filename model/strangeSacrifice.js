import { getDaoHeartStage } from './daoHeart.js';
import {
  getRealmAuthorityLevel,
  getRealmAuthorityPath,
} from './realmAuthority.js';
import { destroyWorldline } from './worldlineAuthority.js';
import { tryEternalFateRewrite } from './innateTreasure.js';

export const STRANGE_SACRIFICE = Object.freeze({
  yearsPerEpoch: 50_000,
  smallIntervalEpochs: 8,
  emperorWarningYears: 2_000,
  bigDelayEpochs: 2,
  warningYears: 2_000,
  activeYears: 2_000,
  heavenSlashYears: 30_000,
  deathLockMs: 24 * 60 * 60 * 1000,
  immortalEmperorKillRequirement: 10,
  immortalEmperorEnemySpeed: 100 + 21 * 50,
});

export const STRANGE_SACRIFICE_PLANES = Object.freeze([
  '凡间',
  '仙界',
  '下界八域',
  '太初星墟',
  '遮天位面',
  '九天十地',
  '界海',
  '时间长河',
  '永恒未知之地',
  '仙域',
  '帝尊',
  '成仙路',
  '仙古秘境',
  '古地府',
  '轮回路',
]);

export const FIRST_SMALL_SACRIFICE_NPCS = Object.freeze([
  '荒天帝',
  '仙帝柳神',
  '火灵儿',
  '云曦',
  '石毅',
  '十冠王',
  '天角蚁',
  '曹雨生',
]);

export const FIRST_BIG_SACRIFICE_NPCS = Object.freeze([
  '荒天帝',
  '叶天帝',
  '狠人大帝',
  '无始残尸',
  '柳神虚影',
  '叶倾仙虚影',
]);

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(value, fallback = 0) {
  return Math.max(0, Math.trunc(number(value, fallback)));
}

function defaultState(worldYear = 0) {
  return {
    version: 1,
    phase: 'dormant',
    cycleStartedWorldYear: 0,
    firstImmortalEmperorWorldYear: null,
    smallDueWorldYear: null,
    bigDueWorldYear: null,
    activeEvent: null,
    heavenSlashUntilWorldYear: 0,
    smallCount: 0,
    bigCount: 0,
    warnedSmallDueWorldYear: null,
    warnedBigDueWorldYear: null,
    participants: {},
    successfulDefenders: 0,
    lastOutcome: null,
  };
}

export function ensureStrangeSacrificeState(value, worldYear = 0) {
  const base = defaultState(worldYear);
  const source =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const state = { ...base, ...source };
  state.smallCount = integer(state.smallCount);
  state.bigCount = integer(state.bigCount);
  state.cycleStartedWorldYear = integer(state.cycleStartedWorldYear, worldYear);
  state.heavenSlashUntilWorldYear = integer(state.heavenSlashUntilWorldYear);
  state.participants =
    state.participants && typeof state.participants === 'object'
      ? state.participants
      : {};
  return state;
}

function beginEvent(state, type, worldYear) {
  const firstRound =
    type === 'small' ? state.smallCount === 0 : state.bigCount === 0;
  if (type === 'small') state.smallCount++;
  else state.bigCount++;
  state.phase = `${type}_active`;
  state.activeEvent = {
    id: `${type}-${
      type === 'small' ? state.smallCount : state.bigCount
    }-${worldYear}`,
    type,
    firstRound,
    startedWorldYear: worldYear,
    endsWorldYear: worldYear + STRANGE_SACRIFICE.activeYears,
  };
  state.participants = {};
  state.successfulDefenders = 0;
  return { type: `${type}_started`, firstRound, event: state.activeEvent };
}

export function settleStrangeSacrifice(
  stateValue,
  type,
  worldYear,
  outcome = {},
) {
  const state = ensureStrangeSacrificeState(stateValue, worldYear);
  const firstRound = Boolean(state.activeEvent?.firstRound);
  const defended =
    number(outcome.successfulDefenders, state.successfulDefenders) > 0;
  state.lastOutcome = { type, firstRound, defended, worldYear };
  state.lastParticipants = state.participants;
  state.lastPlaneSnapshot = state.planeSnapshot || null;
  state.activeEvent = null;
  state.participants = {};
  delete state.planeSnapshot;
  state.successfulDefenders = 0;
  state.heavenSlashUntilWorldYear = Math.max(
    state.heavenSlashUntilWorldYear,
    worldYear + STRANGE_SACRIFICE.heavenSlashYears,
  );

  if (type === 'small') {
    state.phase = 'between_sacrifices';
    state.bigDueWorldYear =
      worldYear +
      STRANGE_SACRIFICE.bigDelayEpochs * STRANGE_SACRIFICE.yearsPerEpoch;
    state.smallDueWorldYear = null;
  } else {
    state.phase = 'dormant';
    state.cycleStartedWorldYear = worldYear;
    state.smallDueWorldYear =
      worldYear +
      STRANGE_SACRIFICE.smallIntervalEpochs * STRANGE_SACRIFICE.yearsPerEpoch;
    state.bigDueWorldYear = null;
  }
  return { state, event: { type: `${type}_ended`, firstRound, defended } };
}

export function forceStartStrangeSacrifice(stateValue, type, worldYear) {
  const state = ensureStrangeSacrificeState(stateValue, worldYear);
  return {
    state,
    event: beginEvent(
      state,
      type === 'big' ? 'big' : 'small',
      integer(worldYear),
    ),
  };
}

export function advanceStrangeSacrificeState(
  stateValue,
  { worldYear = 0, hasImmortalEmperor = false } = {},
) {
  const now = integer(worldYear);
  const state = ensureStrangeSacrificeState(stateValue, now);

  if (state.activeEvent && now >= integer(state.activeEvent.endsWorldYear)) {
    return settleStrangeSacrifice(state, state.activeEvent.type, now);
  }
  if (state.activeEvent) return { state, event: null };

  const awaitingBig = state.smallCount > state.bigCount;
  if (awaitingBig) {
    state.bigDueWorldYear ??=
      now + STRANGE_SACRIFICE.bigDelayEpochs * STRANGE_SACRIFICE.yearsPerEpoch;
    if (now >= state.bigDueWorldYear)
      return { state, event: beginEvent(state, 'big', now) };
    if (
      state.bigDueWorldYear - now <= STRANGE_SACRIFICE.warningYears &&
      state.warnedBigDueWorldYear !== state.bigDueWorldYear
    ) {
      state.warnedBigDueWorldYear = state.bigDueWorldYear;
      return {
        state,
        event: { type: 'big_warning', dueWorldYear: state.bigDueWorldYear },
      };
    }
    return { state, event: null };
  }

  const regularDue =
    state.cycleStartedWorldYear +
    STRANGE_SACRIFICE.smallIntervalEpochs * STRANGE_SACRIFICE.yearsPerEpoch;
  if (
    state.smallCount === 0 &&
    hasImmortalEmperor &&
    state.firstImmortalEmperorWorldYear === null
  ) {
    state.firstImmortalEmperorWorldYear = now;
  }
  const emperorDue =
    state.smallCount === 0 && state.firstImmortalEmperorWorldYear !== null
      ? state.firstImmortalEmperorWorldYear +
        STRANGE_SACRIFICE.emperorWarningYears
      : Number.POSITIVE_INFINITY;
  state.smallDueWorldYear = Math.min(regularDue, emperorDue);

  if (now >= state.smallDueWorldYear)
    return { state, event: beginEvent(state, 'small', now) };
  if (
    state.smallDueWorldYear - now <= STRANGE_SACRIFICE.warningYears &&
    state.warnedSmallDueWorldYear !== state.smallDueWorldYear
  ) {
    state.warnedSmallDueWorldYear = state.smallDueWorldYear;
    return {
      state,
      event: { type: 'small_warning', dueWorldYear: state.smallDueWorldYear },
    };
  }
  return { state, event: null };
}

export function getStrangeSacrificeEncounter(
  player,
  eventType,
  firstRound = false,
) {
  const authority = getRealmAuthorityLevel(player);
  if (eventType === 'small') {
    return authority >= 21
      ? {
          allowed: true,
          enemyType: 'immortal_emperor',
          enemyCount: 5,
          statScale: 3,
          firstRound,
        }
      : { allowed: false, reason: 'npc_front', authority, firstRound };
  }
  if (authority >= 22) {
    return {
      allowed: true,
      enemyType: 'ancestor',
      enemyCount: 10,
      statScale: 5,
      firstRound,
    };
  }
  if (authority >= 21) {
    return {
      allowed: true,
      enemyType: 'immortal_emperor',
      enemyCount: 10,
      statScale: 3,
      firstRound,
    };
  }
  if (authority >= 20) {
    return {
      allowed: true,
      enemyType: 'quasi_immortal_emperor',
      enemyCount: 10,
      statScale: 2,
      firstRound,
    };
  }
  return { allowed: false, reason: 'realm', authority, firstRound };
}

const ENEMY_NAMES = Object.freeze({
  ancestor: [
    '黑祖',
    '白祖',
    '灰祖',
    '金祖',
    '赤祖',
    '青祖',
    '蓝祖',
    '紫祖',
    '银祖',
    '幽祖',
  ],
  immortal_emperor: Array.from(
    { length: 30 },
    (_, index) => `厄土仙帝·${index + 1}`,
  ),
  quasi_immortal_emperor: Array.from(
    { length: 200 },
    (_, index) => `诡异道祖·${index + 1}`,
  ),
});

export function buildStrangeSacrificeEnemies(player, encounter) {
  if (!encounter?.allowed) return [];
  const maxHp = Math.max(1, number(player?.血量上限, player?.当前血量 || 1));
  const scale = Math.max(1, number(encounter.statScale, 1));
  const level =
    encounter.enemyType === 'ancestor'
      ? 22
      : encounter.enemyType === 'immortal_emperor'
      ? 21
      : 20;
  const names =
    ENEMY_NAMES[encounter.enemyType] || ENEMY_NAMES.immortal_emperor;
  return names.slice(0, encounter.enemyCount).map((name, index) => ({
    id: `strange-${encounter.enemyType}-${index + 1}`,
    名号: name,
    攻击: Math.max(1, Math.trunc(number(player?.攻击, 1) * scale)),
    防御: Math.max(1, Math.trunc(number(player?.防御, 1) * scale)),
    当前血量: Math.max(1, Math.trunc(maxHp * scale)),
    血量上限: Math.max(1, Math.trunc(maxHp * scale)),
    速度: STRANGE_SACRIFICE.immortalEmperorEnemySpeed,
    _忽略境界速度加成: true,
    mijinglevel_id: level,
    灵根: { name: '诡异本源', type: '诡异族群', 法球倍率: 3 },
    法球倍率: 3,
    暴击率: 0.35,
    学习的功法: ['祭天祭地祭英灵', '帝威卸甲', '祭灭万物'],
    boss: true,
    _时间长河身份: 'corpse-immortal-emperor',
    _仙帝级强者: level >= 21,
  }));
}

export function applyStrangeSacrificeVictory(player, encounter, killedCount) {
  const killed = Math.max(0, integer(killedCount));
  const emperorKills =
    encounter?.enemyType === 'quasi_immortal_emperor' ? 0 : killed;
  player.厄土仙帝击杀数 = integer(player.厄土仙帝击杀数) + emperorKills;
  player.仙帝道行精进 = integer(player.仙帝道行精进) + emperorKills;
  return { killed, emperorKills, totalEmperorKills: player.厄土仙帝击杀数 };
}

export function applyStrangeSacrificeDefeat(
  player,
  { now = Date.now(), random = Math.random, lineIds = [] } = {},
) {
  if (tryEternalFateRewrite(player, now)) {
    return { destroyed: [], count: 0, lockUntil: 0, rewritten: true };
  }
  const roll = Math.min(0.999999, Math.max(0, number(random(), 0)));
  const count = 3 + Math.floor(roll * 3);
  const destroyed = [];
  for (let index = 0; index < count; index++) {
    const lineId = String(lineIds[index] || `诡异祭礼-${now}-${index + 1}`);
    destroyWorldline(player, lineId, { now, source: '厄土仙帝围猎' });
    destroyed.push(lineId);
  }
  player.当前血量 = 0;
  player.修仙状态 = '身灭道消';
  player.道果状态 = '身灭道消·过去时间线崩灭';
  player.诡异祭礼身灭道消至 = now + STRANGE_SACRIFICE.deathLockMs;
  return { destroyed, count, lockUntil: player.诡异祭礼身灭道消至 };
}

export function getStrangeSacrificeInteractionLock(player, now = Date.now()) {
  const until = number(player?.诡异祭礼身灭道消至);
  return {
    active: until > now,
    until,
    remainingMs: Math.max(0, until - now),
  };
}

export function getSacrificePromotionGate(player) {
  const authority = getRealmAuthorityLevel(player);
  const kills = integer(player?.厄土仙帝击杀数);
  const daoHeart = getDaoHeartStage(player);
  const selfDaoStage = integer(player?.自身之道阶段);
  const selfDaoCultivation = integer(player?.修炼次数);
  const checks = {
    immortalEmperor: authority === 21,
    emperorKills: kills >= STRANGE_SACRIFICE.immortalEmperorKillRequirement,
    daoHeart: daoHeart.key === '圆满',
    selfDao: selfDaoStage >= 7 && selfDaoCultivation >= 400,
  };
  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    authority,
    kills,
    daoHeart,
    selfDaoStage,
    selfDaoCultivation,
  };
}

export function promotePlayerToSacrifice(player) {
  const route = player?.自创修炼体系?.route || getRealmAuthorityPath(player);
  if (route === 'xiangu')
    player.xiangulevel_id = Math.max(23, integer(player.xiangulevel_id));
  else if (route === 'huafen')
    player.huafenlevel_id = Math.max(23, integer(player.huafenlevel_id));
  else player.mijinglevel_id = Math.max(22, integer(player.mijinglevel_id));
  player.自身之道阶段 = Math.max(8, integer(player.自身之道阶段));
  player.修炼次数 = Math.max(401, integer(player.修炼次数));
  player.自身之道境界 = '祭道·大道成空';
  player.境界称号 = '祭道';
  return route;
}

export function applyHeavenWillSlashOnAdvancement(
  previous,
  next,
  state,
  worldYear,
) {
  const active = integer(state?.heavenSlashUntilWorldYear) > integer(worldYear);
  const crossed =
    getRealmAuthorityLevel(previous) < 17 && getRealmAuthorityLevel(next) >= 17;
  if (!active || !crossed) return { triggered: false };

  const realmDefaults = {
    mijinglevel_id: 1,
    xiangulevel_id: 1,
    huafenlevel_id: 1,
    自身之道阶段: 0,
    修炼次数: 0,
  };
  for (const [field, fallback] of Object.entries(realmDefaults)) {
    next[field] = previous?.[field] ?? fallback;
  }
  next.修为 = 0;
  next.血气 = 0;
  next.当前血量 = Math.min(1, Math.max(0, number(next.血量上限, 1)));
  next.道伤 = integer(next.道伤) + 3;
  next.道基状态 = '天意一刀·道基斩开';
  next.天意一刀斩道次数 = integer(next.天意一刀斩道次数) + 1;
  return { triggered: true, untilWorldYear: state.heavenSlashUntilWorldYear };
}
