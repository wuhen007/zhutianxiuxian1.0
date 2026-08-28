import { getRealmAuthorityLevel } from './realmAuthority.js';
import {
  ALL_HEAVENS_LOCATIONS,
  getLocationName,
} from './weimianTravel.js';

export const ETERNAL_GUARD_INTERVAL_MS = 60 * 60 * 1000;
export const ETERNAL_GUARD_DURATION_MINUTES = 99999;
export const ETERNAL_GUARD_DURATION_MS = ETERNAL_GUARD_DURATION_MINUTES * 60 * 1000;

export const DIMENSION_THREAT_TYPES = Object.freeze({
  HIGHLAND_TERROR: 'highland-terror',
  DIMENSION_CALAMITY: 'dimension-calamity',
});

export const DIMENSION_CALAMITY_TARGETS = Object.freeze([
  ...ALL_HEAVENS_LOCATIONS,
  '上苍之上',
]);

function normalizeTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

function setNextAssaultAt(state, timestamp) {
  state.nextAssaultAt = timestamp || null;
  // 保留旧字段，供尚未重启的旧代码和存档兼容读取。
  state.nextCalamityAt = state.nextAssaultAt;
}

export function createDimensionGuardState() {
  return {
    version: 2,
    emperorEraStartedAt: 0,
    highlandDestroyed: false,
    lastTickAt: 0,
    lastGuardedAt: 0,
    nextAssaultAt: null,
    nextCalamityAt: null,
    assaultCount: 0,
    calamityCount: 0,
    defenseCount: 0,
    highlandTerrorCount: 0,
    dimensionCalamityCount: 0,
    lastAssaultAt: 0,
    lastCalamityAt: 0,
    lastThreatType: '',
    lastOutcome: 'dormant',
  };
}

export function ensureDimensionGuardState(value, now = Date.now()) {
  const source = value && typeof value === 'object' ? value : {};
  const state = {
    ...createDimensionGuardState(),
    ...source,
    version: 2,
    emperorEraStartedAt: normalizeTimestamp(source.emperorEraStartedAt),
    highlandDestroyed: Boolean(source.highlandDestroyed),
    assaultCount: Math.max(0, Math.floor(Number(source.assaultCount) || 0)),
    calamityCount: Math.max(0, Math.floor(Number(source.calamityCount) || 0)),
    defenseCount: Math.max(0, Math.floor(Number(source.defenseCount) || 0)),
    highlandTerrorCount: Math.max(0, Math.floor(Number(source.highlandTerrorCount) || 0)),
    dimensionCalamityCount: Math.max(0, Math.floor(Number(source.dimensionCalamityCount) || 0)),
    lastTickAt: normalizeTimestamp(source.lastTickAt),
    lastGuardedAt: normalizeTimestamp(source.lastGuardedAt),
    lastAssaultAt: normalizeTimestamp(source.lastAssaultAt),
    lastCalamityAt: normalizeTimestamp(source.lastCalamityAt),
  };

  const legacyNext = normalizeTimestamp(source.nextAssaultAt || source.nextCalamityAt);
  setNextAssaultAt(
    state,
    state.emperorEraStartedAt ? (legacyNext || now + ETERNAL_GUARD_INTERVAL_MS) : null,
  );
  return state;
}

export function isImmortalEmperorPlayer(player) {
  return getRealmAuthorityLevel(player) >= 21;
}

export function isGuardingEternal(player) {
  return isImmortalEmperorPlayer(player)
    && getLocationName(player?.power_place) === '永恒未知之地';
}

export function createEternalGuardAction(now = Date.now()) {
  return {
    action: '镇守永恒未知之地',
    start_time: now,
    end_time: now + ETERNAL_GUARD_DURATION_MS,
    time: ETERNAL_GUARD_DURATION_MS,
    eternal_guard: '1',
    plant: '1',
    shutup: '0',
    working: '1',
    Place_action: '1',
    Place_actionplus: '1',
    power_up: '1',
    mojie: '1',
    xijie: '1',
  };
}

export function isEternalGuardAction(action) {
  return action?.eternal_guard === '1' || action?.action === '镇守永恒未知之地';
}

export function applyEternalGuardStatus(player, now = Date.now()) {
  const action = createEternalGuardAction(now);
  player.修仙状态 = '镇守永恒未知之地';
  player.永恒镇守开始时间 ||= now;
  player.永恒镇守结束时间 = action.end_time;
  return action;
}

function selectThreatType(state) {
  if (state.highlandDestroyed) return DIMENSION_THREAT_TYPES.DIMENSION_CALAMITY;
  return state.assaultCount % 2 === 0
    ? DIMENSION_THREAT_TYPES.HIGHLAND_TERROR
    : DIMENSION_THREAT_TYPES.DIMENSION_CALAMITY;
}

export function advanceDimensionGuardState(value, {
  now = Date.now(),
  emperorAppeared = false,
  guarded = false,
  highlandDestroyed = false,
} = {}) {
  const state = ensureDimensionGuardState(value, now);
  state.lastTickAt = now;
  state.highlandDestroyed = Boolean(highlandDestroyed);

  if (!state.emperorEraStartedAt) {
    if (!emperorAppeared) {
      setNextAssaultAt(state, null);
      state.lastOutcome = 'dormant';
      return { state, event: null };
    }
    state.emperorEraStartedAt = now;
    setNextAssaultAt(state, now + ETERNAL_GUARD_INTERVAL_MS);
    state.lastOutcome = 'emperor-era-started';
    return {
      state,
      event: {
        type: 'emperor-era-started',
        occurredAt: now,
      },
    };
  }

  if (guarded) state.lastGuardedAt = now;
  if (now < state.nextAssaultAt) {
    state.lastOutcome = guarded ? 'guarding' : 'waiting';
    return { state, event: null };
  }

  const dueAt = state.nextAssaultAt;
  const threatType = selectThreatType(state);
  state.assaultCount += 1;
  state.lastAssaultAt = now;
  state.lastThreatType = threatType;
  if (threatType === DIMENSION_THREAT_TYPES.HIGHLAND_TERROR) state.highlandTerrorCount += 1;
  else state.dimensionCalamityCount += 1;
  setNextAssaultAt(state, now + ETERNAL_GUARD_INTERVAL_MS);

  if (guarded) {
    state.defenseCount += 1;
    state.lastOutcome = 'defended';
    return {
      state,
      event: {
        type: 'guard-defense',
        threatType,
        dueAt,
        occurredAt: now,
        count: state.defenseCount,
        targets: DIMENSION_CALAMITY_TARGETS,
      },
    };
  }

  state.calamityCount += 1;
  state.lastCalamityAt = now;
  state.lastOutcome = threatType;
  return {
    state,
    event: {
      type: threatType,
      threatType,
      dueAt,
      occurredAt: now,
      count: state.calamityCount,
      targets: DIMENSION_CALAMITY_TARGETS,
    },
  };
}
