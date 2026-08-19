import assert from 'node:assert/strict';
import test from 'node:test';

import { formatWorldChatMessage } from '../apps/worldChat/presentation.js';

test('跨服世界消息使用醒目的固定信封格式', () => {
  const output = formatWorldChatMessage({
    name: '区服-甲',
    sender_name: '道友甲',
    msg: '诸天见！',
    ts: '2026-08-19T10:00:00.000Z',
    expose_level: 'public',
    groups: ['10001'],
  });

  assert.match(output, /^【🌐 跨服世界发言】/);
  assert.match(output, /区服：区服-甲/);
  assert.match(output, /发言人：道友甲/);
  assert.match(output, /内容：诸天见！/);
  assert.match(output, /来源群：10001/);
  assert.equal(output.split('\n').at(-1), '━━━━━━━━━━━━━━━━━━━━');
});

test('只有图片时显示图片提示', () => {
  const output = formatWorldChatMessage({
    name: '区服-乙',
    sender_name: '画中仙',
    msg: '',
    ts: Date.now(),
    images: ['https://example.com/world.jpg'],
  });

  assert.match(output, /内容：（附带图片）/);
});
