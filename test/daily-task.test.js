import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DAILY_TASK_WENXIAN_EXP,
  findDailyTaskIndex,
  getDailyTaskPotentialReward,
  getDailyTaskDateKey,
  isDailyTaskComplete,
  wasDailyTaskAcceptedToday,
} from '../model/dailyTask.js';

test('每日任务按上海日期判断当天接取状态', () => {
  const beforeMidnightUtc = Date.parse('2026-07-28T15:59:59Z');
  const afterMidnightUtc = Date.parse('2026-07-28T16:00:01Z');

  assert.equal(getDailyTaskDateKey(beforeMidnightUtc), '2026-07-28');
  assert.equal(getDailyTaskDateKey(afterMidnightUtc), '2026-07-29');
  assert.equal(wasDailyTaskAcceptedToday(beforeMidnightUtc, afterMidnightUtc), false);
  assert.equal(wasDailyTaskAcceptedToday(afterMidnightUtc, afterMidnightUtc), true);
});

test('每日任务档案与完成状态能安全处理空数据', () => {
  const records = [{ player: '10001', wancheng1: 2, wancheng2: 2, wancheng3: 2 }];
  assert.equal(findDailyTaskIndex(records, 10001), 0);
  assert.equal(findDailyTaskIndex(records, 'missing'), -1);
  assert.equal(findDailyTaskIndex(null, '10001'), -1);
  assert.equal(isDailyTaskComplete(records[0]), true);
  assert.equal(isDailyTaskComplete(undefined), false);
});

test('每日任务潜力取两套体系较高等级的十倍', () => {
  assert.equal(getDailyTaskPotentialReward({ mijinglevel_id: 12, xiangulevel_id: 8 }), 120);
  assert.equal(getDailyTaskPotentialReward({ mijinglevel_id: 3, xiangulevel_id: 16 }), 160);
  assert.equal(getDailyTaskPotentialReward({}), 0);
  assert.equal(DAILY_TASK_WENXIAN_EXP, 50);
});
