import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getLastQuietWindow,
  getQuietWindowAt,
  isNightQuiet,
} from '../model/nightQuiet.js';

const BASE = {
  enabled: true,
  startHour: 0,
  endHour: 8,
  timezoneOffset: 8,
  pauseWorldClock: true,
  pauseDimensionGuard: true,
  extendRifts: true,
  resumeGraceMinutes: 10,
};

/** 北京时间某天某时刻的时间戳 */
function at(day, hour, minute = 0) {
  const pad = value => String(value).padStart(2, '0');
  return new Date(`2026-11-${pad(day)}T${pad(hour)}:${pad(minute)}:00+08:00`).getTime();
}

test('夜间静默窗口：0 点含、8 点不含', () => {
  const cfg = { ...BASE };
  assert.equal(isNightQuiet(at(15, 0), cfg), true);
  assert.equal(isNightQuiet(at(15, 3), cfg), true);
  assert.equal(isNightQuiet(at(15, 7, 59), cfg), true);
  assert.equal(isNightQuiet(at(15, 8), cfg), false);
  assert.equal(isNightQuiet(at(15, 23, 59), cfg), false);
});

test('夜间静默窗口时间戳落在当天零点与八点', () => {
  const cfg = { ...BASE };
  const window = getQuietWindowAt(at(15, 3), cfg);
  assert.equal(window.start, at(15, 0));
  assert.equal(window.end, at(15, 8));
});

test('静默关闭时不产生窗口', () => {
  const cfg = { ...BASE, enabled: false };
  assert.equal(getQuietWindowAt(at(15, 3), cfg), null);
  assert.equal(isNightQuiet(at(15, 3), cfg), false);
  assert.equal(getLastQuietWindow(at(15, 12), cfg), null);
});

test('起止小时相同视为未配置，不会变成全天静默', () => {
  const cfg = { ...BASE, startHour: 8, endHour: 8, enabled: true };
  assert.equal(getQuietWindowAt(at(15, 3), cfg), null);
  assert.equal(getQuietWindowAt(at(15, 12), cfg), null);
  assert.equal(isNightQuiet(at(15, 3), cfg), false);
});

test('跨零点窗口（22:00-06:00）两侧都被覆盖', () => {
  const cfg = { ...BASE, startHour: 22, endHour: 6 };
  assert.equal(isNightQuiet(at(15, 23), cfg), true);
  assert.equal(isNightQuiet(at(15, 2), cfg), true);
  assert.equal(isNightQuiet(at(15, 6), cfg), false);
  assert.equal(isNightQuiet(at(15, 12), cfg), false);
  const window = getQuietWindowAt(at(16, 2), cfg);
  assert.equal(window.start, at(15, 22));
  assert.equal(window.end, at(16, 6));
});

test('上一个静默窗口只取「已经结束」的那一段', () => {
  const cfg = { ...BASE };
  // 静默进行中时，上一次结束的是前一天的 8 点
  assert.equal(getLastQuietWindow(at(15, 3), cfg).end, at(14, 8));
  // 刚过 8 点，返回当天的窗口，供裂界在恢复瞬间补时使用
  assert.equal(getLastQuietWindow(at(15, 8), cfg).end, at(15, 8));
  assert.equal(getLastQuietWindow(at(15, 23), cfg).end, at(15, 8));
});
