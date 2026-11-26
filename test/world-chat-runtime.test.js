import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractWorldImageUrls,
  readyWorldChatBot,
  sendWorldGroupMessage,
} from '../apps/worldChat/runtime.js';

test('世界发言提取图片消息段并限制为三张', () => {
  assert.deepEqual(extractWorldImageUrls([
    { type: 'text', text: '#世界 发言' },
    { type: 'image', url: 'https://example.com/1.jpg' },
    { type: 'image', file: 'https://example.com/2.jpg' },
    { type: 'image', url: 'https://example.com/1.jpg' },
    { type: 'image', url: 'https://example.com/3.jpg' },
    { type: 'image', url: 'https://example.com/4.jpg' },
  ]), [
    'https://example.com/1.jpg',
    'https://example.com/2.jpg',
    'https://example.com/3.jpg',
  ]);
});

test('世界频道等待机器人账号上线后再连接', () => {
  const bot = { uin: [], pickGroup() {} };
  assert.equal(readyWorldChatBot(bot), null);
  bot.uin.push('bot-1');
  assert.equal(readyWorldChatBot(bot), bot);
});

test('世界消息只向当前机器人真实存在的已加入群发送', async () => {
  let strictMode = false;
  let sent = '';
  const bot = {
    pickGroup(groupId, strict) {
      assert.equal(groupId, '10001');
      strictMode = strict;
      return { sendMsg: async (message) => (sent = message) };
    },
  };
  await sendWorldGroupMessage(bot, '10001', '跨服传音');
  assert.equal(strictMode, true);
  assert.equal(sent, '跨服传音');
});
