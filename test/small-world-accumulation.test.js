import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_WORLD_ACCUMULATION_HOURS,
  calculateElapsedEventChance,
  calculateWorldAccumulation,
} from '../apps/Garden/smallWorldAccumulation.js';

test('离线积累按96个现实小时封顶后再应用时间流速', () => {
  const accumulation = calculateWorldAccumulation(120, 8);

  assert.equal(MAX_WORLD_ACCUMULATION_HOURS, 96);
  assert.equal(accumulation.realHours, 96);
  assert.equal(accumulation.effectiveHours, 768);
});

test('未达到上限时完整保留现实离线时间', () => {
  const accumulation = calculateWorldAccumulation(12.5, 4);

  assert.equal(accumulation.realHours, 12.5);
  assert.equal(accumulation.effectiveHours, 50);
});

test('野兽事件保持每24现实小时8%的累计概率', () => {
  const fullPeriodChance = calculateElapsedEventChance(24);
  const halfPeriodChance = calculateElapsedEventChance(12);
  const twoHalfPeriods = 1 - Math.pow(1 - halfPeriodChance, 2);

  assert.ok(Math.abs(fullPeriodChance - 0.08) < 1e-12);
  assert.ok(Math.abs(twoHalfPeriods - fullPeriodChance) < 1e-12);
  assert.equal(calculateElapsedEventChance(0), 0);
});
