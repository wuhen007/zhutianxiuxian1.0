import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DIMENSION_CALAMITY_TARGETS,
  DIMENSION_THREAT_TYPES,
  ETERNAL_GUARD_DURATION_MINUTES,
  ETERNAL_GUARD_DURATION_MS,
  ETERNAL_GUARD_INTERVAL_MS,
  advanceDimensionGuardState,
  applyEternalGuardStatus,
  createDimensionGuardState,
  createEternalGuardAction,
  isEternalGuardAction,
  isGuardingEternal,
} from '../model/dimensionGuard.js';
import { PLACE_LOCATION_MAP } from '../model/weimianTravel.js';

test('世间尚无仙帝时双灾厄保持沉寂', () => {
  const result = advanceDimensionGuardState(createDimensionGuardState(), {
    now: ETERNAL_GUARD_INTERVAL_MS * 10,
    emperorAppeared: false,
  });
  assert.equal(result.event, null);
  assert.equal(result.state.emperorEraStartedAt, 0);
  assert.equal(result.state.nextAssaultAt, null);
  assert.equal(result.state.lastOutcome, 'dormant');
});

test('首位仙帝出现后一小时开启来袭，厄土与维度灾厄轮流刷新', () => {
  const start = 1_000;
  const activated = advanceDimensionGuardState(createDimensionGuardState(), {
    now: start,
    emperorAppeared: true,
  });
  assert.equal(activated.event.type, 'emperor-era-started');
  assert.equal(activated.state.nextAssaultAt, start + ETERNAL_GUARD_INTERVAL_MS);

  const highland = advanceDimensionGuardState(activated.state, {
    now: start + ETERNAL_GUARD_INTERVAL_MS,
  });
  assert.equal(highland.event.type, DIMENSION_THREAT_TYPES.HIGHLAND_TERROR);
  assert.deepEqual(highland.event.targets, DIMENSION_CALAMITY_TARGETS);

  const dimension = advanceDimensionGuardState(highland.state, {
    now: start + ETERNAL_GUARD_INTERVAL_MS * 2,
  });
  assert.equal(dimension.event.type, DIMENSION_THREAT_TYPES.DIMENSION_CALAMITY);
  assert.equal(dimension.state.calamityCount, 2);
});

test('仙帝镇守时每小时结算为击退来袭而非位面覆灭', () => {
  const start = 2_000;
  const activated = advanceDimensionGuardState(createDimensionGuardState(), {
    now: start,
    emperorAppeared: true,
    guarded: true,
  });
  const defended = advanceDimensionGuardState(activated.state, {
    now: start + ETERNAL_GUARD_INTERVAL_MS,
    guarded: true,
  });
  assert.equal(defended.event.type, 'guard-defense');
  assert.equal(defended.event.threatType, DIMENSION_THREAT_TYPES.HIGHLAND_TERROR);
  assert.equal(defended.state.defenseCount, 1);
  assert.equal(defended.state.calamityCount, 0);
});

test('厄土覆灭后仅厄土大恐怖沉寂，维度灾厄仍会刷新', () => {
  const start = 3_000;
  const activated = advanceDimensionGuardState(createDimensionGuardState(), {
    now: start,
    emperorAppeared: true,
    highlandDestroyed: true,
  });
  const result = advanceDimensionGuardState(activated.state, {
    now: start + ETERNAL_GUARD_INTERVAL_MS,
    highlandDestroyed: true,
  });
  assert.equal(result.event.type, DIMENSION_THREAT_TYPES.DIMENSION_CALAMITY);
  assert.equal(result.state.highlandTerrorCount, 0);
  assert.equal(result.state.dimensionCalamityCount, 1);
});

test('仙帝真身位于永恒未知之地即承担99999分钟镇守状态', () => {
  const now = 10_000;
  const player = {
    mijinglevel_id: 21,
    power_place: PLACE_LOCATION_MAP.永恒未知之地,
  };
  const action = applyEternalGuardStatus(player, now);
  assert.equal(isGuardingEternal(player), true);
  assert.equal(isEternalGuardAction(action), true);
  assert.equal(ETERNAL_GUARD_DURATION_MINUTES, 99999);
  assert.equal(action.end_time - action.start_time, ETERNAL_GUARD_DURATION_MS);
  assert.equal(player.修仙状态, '镇守永恒未知之地');
  assert.equal(createEternalGuardAction(now).end_time, now + ETERNAL_GUARD_DURATION_MS);

  assert.equal(isGuardingEternal({
    mijinglevel_id: 21,
    power_place: PLACE_LOCATION_MAP.上苍之上,
  }), false);
  assert.equal(isGuardingEternal({
    mijinglevel_id: 20,
    power_place: PLACE_LOCATION_MAP.永恒未知之地,
  }), false);
});
