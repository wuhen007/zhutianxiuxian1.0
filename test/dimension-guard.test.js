import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DIMENSION_CALAMITY_TARGETS,
  ETERNAL_GUARD_INTERVAL_MS,
  advanceDimensionGuardState,
  createDimensionGuardState,
  isGuardingEternal,
} from '../model/dimensionGuard.js';
import { PLACE_LOCATION_MAP } from '../model/weimianTravel.js';

test('永恒镇守每小时续期，失守到期后触发一次维度灾厄', () => {
  const start = 1_000;
  const first = createDimensionGuardState(start);
  const waiting = advanceDimensionGuardState(first, {
    now: start + ETERNAL_GUARD_INTERVAL_MS - 1,
  });
  assert.equal(waiting.event, null);

  const calamity = advanceDimensionGuardState(waiting.state, {
    now: start + ETERNAL_GUARD_INTERVAL_MS,
  });
  assert.equal(calamity.event.type, 'dimension-calamity');
  assert.equal(calamity.state.calamityCount, 1);
  assert.ok(calamity.event.targets.includes('上苍之上'));
  assert.deepEqual(calamity.event.targets, DIMENSION_CALAMITY_TARGETS);

  const guarded = advanceDimensionGuardState(calamity.state, {
    now: start + ETERNAL_GUARD_INTERVAL_MS + 1,
    guarded: true,
  });
  assert.equal(guarded.event, null);
  assert.equal(guarded.state.lastOutcome, 'guarded');
  assert.equal(
    guarded.state.nextCalamityAt,
    start + ETERNAL_GUARD_INTERVAL_MS + 1 + ETERNAL_GUARD_INTERVAL_MS,
  );
});

test('厄土高原覆灭后不再倒计时，仙帝真身在永恒未知之地即算镇守', () => {
  const state = advanceDimensionGuardState(createDimensionGuardState(0), {
    now: ETERNAL_GUARD_INTERVAL_MS * 2,
    highlandDestroyed: true,
  });
  assert.equal(state.event, null);
  assert.equal(state.state.nextCalamityAt, null);

  assert.equal(isGuardingEternal({
    mijinglevel_id: 21,
    power_place: PLACE_LOCATION_MAP.永恒未知之地,
  }), true);
  assert.equal(isGuardingEternal({
    mijinglevel_id: 21,
    power_place: PLACE_LOCATION_MAP.上苍之上,
  }), false);
  assert.equal(isGuardingEternal({
    mijinglevel_id: 20,
    power_place: PLACE_LOCATION_MAP.永恒未知之地,
  }), false);
});

