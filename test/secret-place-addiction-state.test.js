import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSecretPlaceAddictionAction,
  normalizeLegacySecretPlaceAddictionAction,
} from '../model/secretPlaceAddiction.js';

test('宗门沉迷秘境创建当前结算器需要的状态字段', () => {
  const action = createSecretPlaceAddictionAction({
    durationMinutes: 60,
    totalCount: 10,
    place: { name: '高级' },
    xf: 1,
    now: 1_000,
  });

  assert.equal(action.start_time, 1_000);
  assert.equal(action.total_time, 60);
  assert.equal(action.total_count, 10);
  assert.equal(action.settled_count, 0);
  assert.equal(action.interval, 6 * 60 * 1000);
  assert.equal(action.next_settle_time, 1_000 + 6 * 60 * 1000);
  assert.equal(action.Place_actionplus, '0');
});

test('旧版宗门沉迷状态可迁移并继续分次结算', () => {
  const legacy = {
    action: '历练',
    end_time: 3_601_000,
    time: 3_600_000,
    cishu: 10,
    Place_action: '1',
    Place_actionplus: '0',
    Place_address: { name: '高级' },
  };
  const action = normalizeLegacySecretPlaceAddictionAction(legacy);

  assert.equal(action.start_time, 1_000);
  assert.equal(action.total_time, 60);
  assert.equal(action.total_count, 10);
  assert.equal(action.settled_count, 0);
  assert.equal(action.interval, 6 * 60 * 1000);
  assert.equal(action.next_settle_time, 1_000 + 6 * 60 * 1000);
});
