import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  getActorPlane,
  getFashanActionKey,
  getFashanHistoryKey,
  getFashanTravelKey,
  isFashanActionPending,
  isFashanReady,
  requireActorAtPlane,
} from '../model/fashanProxy.js';

test('法身 Redis keys keep the shared player namespace', () => {
  assert.equal(getFashanActionKey(10001), 'xiuxian:player:10001:action:fashan');
  assert.equal(getFashanHistoryKey(10001), 'xiuxian:player:10001:addiction_history:fashan');
  assert.equal(getFashanTravelKey(10001), 'xiuxian:travel_task:10001:fashan');
});

test('readiness requires a formed body and accepts any non-running status', () => {
  assert.equal(isFashanReady({ 法身: 1, 法身状态: '空闲中' }), true);
  assert.equal(isFashanReady({ 法身: '1' }), true);
  assert.equal(isFashanReady({ 法身: 1, 法身状态: '行动中' }), false);
  assert.equal(isFashanReady({ 法身: 0, 法身状态: '空闲中' }), false);
});

test('pending action remains occupied until settlement closes its state flags', () => {
  assert.equal(isFashanActionPending({ Place_action: '0', end_time: 1 }, 2), true);
  assert.equal(isFashanActionPending({ Place_actionplus: '0', end_time: 1 }, 2), true);
  assert.equal(isFashanActionPending({ time_river: '0', end_time: 1 }, 2), true);
  assert.equal(isFashanActionPending({ shengxuTaskId: 'task', end_time: 1 }, 2), true);
  assert.equal(isFashanActionPending({ Place_action: '1', Place_actionplus: '1', end_time: 3 }, 2), true);
  assert.equal(isFashanActionPending({ Place_action: '1', Place_actionplus: '1', end_time: 1 }, 2), false);
});

test('actor plane reads the body or fashan location field', () => {
  const player = { power_place: '遮天位面', 法身位置: 6.5 };
  assert.equal(getActorPlane(player), 2);
  assert.equal(getActorPlane(player, 'body'), 2);
  assert.equal(getActorPlane(player, 'fashan'), 42);
});

test('plane guard reports a stable result for matches, mismatches, and missing data', () => {
  const player = { power_place: 2, 法身位置: 5 };
  assert.deepEqual(requireActorAtPlane(player, 2), {
    ok: true,
    expected: 2,
    actual: 2,
    reason: null,
  });
  assert.deepEqual(requireActorAtPlane(player, 4), {
    ok: false,
    expected: 4,
    actual: 2,
    reason: 'plane-mismatch',
  });
  assert.deepEqual(requireActorAtPlane({ ...player, 法身位置: '永恒未知之地' }, 6.5, 'fashan'), {
    ok: true,
    expected: 42,
    actual: 42,
    reason: null,
  });
  assert.deepEqual(requireActorAtPlane({}, 2, 'fashan'), {
    ok: false,
    expected: 2,
    actual: NaN,
    reason: 'missing-plane',
  });
});

test('settlement paths use shared location normalization for actor planes', () => {
  const sources = [
    '../apps/SecretPlace/ShangcangTask.js',
    '../apps/SecretPlace/SecretPlaceTask.js',
    '../apps/User/ShengxuContent.js',
  ].map(file => fs.readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
  assert.match(sources, /getLocationId\(action\.actorPlane \?\? action\.法身位置\)/);
  assert.match(sources, /getLocationId\(\s*parsedAction\.actorPlane\s*\?\?\s*parsedAction\.法身位置/);
  assert.match(sources, /getLocationId\(player\.法身位置\)/);
  assert.doesNotMatch(sources, /Number\(player\.法身位置\)/);
});
