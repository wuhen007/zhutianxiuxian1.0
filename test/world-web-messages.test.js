import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const script = fs.readFileSync(new URL('../resources/web/world/app.js', import.meta.url), 'utf8');
const formatTime = vm.runInNewContext(`${script.slice(0, script.indexOf('function formatAssets'))}\nformatTime;`);

test('世界消息日期使用点分隔，时分补零，兼容毫秒时间戳和 ISO 字符串', () => {
  const timestamp = '2026-08-21T02:21:00.000Z';
  assert.equal(formatTime(timestamp, true), '2026.8.21 10:21');
  assert.equal(formatTime(Date.parse(timestamp), true), '2026.8.21 10:21');
  assert.equal(formatTime('2026-01-02T01:05:00Z', true), '2026.1.2 09:05');
  assert.equal(formatTime(timestamp), '10:21');
});

test('世界消息按北京时间处理跨日、跨年和闰日，午夜显示 00 点', () => {
  assert.equal(formatTime('2026-08-20T15:59:00Z', true), '2026.8.20 23:59');
  assert.equal(formatTime('2026-08-20T16:00:00Z', true), '2026.8.21 00:00');
  assert.equal(formatTime('2026-12-31T16:01:00Z', true), '2027.1.1 00:01');
  assert.equal(formatTime('2024-02-28T16:01:00Z', true), '2024.2.29 00:01');
});

test('缺失或无效时间不伪造历史日期', () => {
  for (const value of [undefined, null, '', 'invalid', NaN]) {
    assert.equal(formatTime(value, true), '时间未记录');
    assert.equal(formatTime(value), '--:--');
  }
  assert.equal(formatTime(0, true), '1970.1.1 08:00');
});
