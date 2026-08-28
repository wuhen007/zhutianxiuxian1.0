import { getRealmAuthorityLevel } from './realmAuthority.js';
import {
  ALL_HEAVENS_LOCATIONS,
  getLocationName,
} from './weimianTravel.js';

export const ETERNAL_GUARD_INTERVAL_MS = 60 * 60 * 1000;
export const DIMENSION_CALAMITY_TARGETS = Object.freeze([
  ...ALL_HEAVENS_LOCATIONS,
  '上苍之上',
]);

export function createDimensionGuardState(now = Date.now()) {
  return {
    version: 1,
    highlandDestroyed: false,
    lastTickAt: 0,
    lastGuardedAt: 0,
    nextCalamityAt: now + ETERNAL_GUARD_INTERVAL_MS,
    calamityCount: 0,
    lastCalamityAt: 0,
    lastOutcome: 'waiting',
  };
}

export function ensureDimensionGuardState(value, now = Date.now()) {
  const source = value && typeof value === 'object' ? value : {};
  const state = {
    ...createDimensionGuardState(now),
    ...source,
    version: 1,
    highlandDestroyed: Boolean(source.highlandDestroyed),
    calamityCount: Math.max(0, Math.floor(Number(source.calamityCount) || 0)),
    lastTickAt: Math.max(0, Number(source.lastTickAt) || 0),
    lastGuardedAt: Math.max(0, Number(source.lastGuardedAt) || 0),
    lastCalamityAt: Math.max(0, Number(source.lastCalamityAt) || 0),
  };
  const next = Number(source.nextCalamityAt);
  state.nextCalamityAt = state.highlandDestroyed
    ? null
    : Number.isFinite(next) && next > 0
      ? next
      : now + ETERNAL_GUARD_INTERVAL_MS;
  return state;
}

export function isImmortalEmperorPlayer(player) {
  return getRealmAuthorityLevel(player) >= 21;
}

export function isGuardingEternal(player) {
  return isImmortalEmperorPlayer(player)
    && getLocationName(player?.power_place) === '永恒未知之地';
}

export function advanceDimensionGuardState(value, {
  now = Date.now(),
  guarded = false,
  highlandDestroyed = false,
} = {}) {
  const state = ensureDimensionGuardState(value, now);
  state.lastTickAt = now;
  state.highlandDestroyed = Boolean(highlandDestroyed || state.highlandDestroyed);

  if (state.highlandDestroyed) {
    state.nextCalamityAt = null;
    state.lastOutcome = 'highland-destroyed';
    return { state, event: null };
  }

  if (guarded) {
    state.lastGuardedAt = now;
    state.nextCalamityAt = now + ETERNAL_GUARD_INTERVAL_MS;
    state.lastOutcome = 'guarded';
    return { state, event: null };
  }

  if (now < state.nextCalamityAt) {
    state.lastOutcome = 'waiting';
    return { state, event: null };
  }

  const dueAt = state.nextCalamityAt;
  state.calamityCount += 1;
  state.lastCalamityAt = now;
  state.nextCalamityAt = now + ETERNAL_GUARD_INTERVAL_MS;
  state.lastOutcome = 'calamity';
  return {
    state,
    event: {
      type: 'dimension-calamity',
      dueAt,
      occurredAt: now,
      count: state.calamityCount,
      targets: DIMENSION_CALAMITY_TARGETS,
    },
  };
}

