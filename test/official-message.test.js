import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOfficialMessage,
  replyOfficialMessage,
} from '../model/officialMessage.js';

test('buildOfficialMessage creates markdown and command buttons', () => {
  const message = buildOfficialMessage('# 每日奖励', [[
    { text: '领取', command: '#领取每日奖励' },
    { text: '查看', command: '#我的任务' },
  ]], 'qg_USER');

  assert.deepEqual(message[0], { type: 'markdown', data: '# 每日奖励' });
  assert.equal(message[1].type, 'button');
  assert.deepEqual(message[1].data[0][0], {
    text: '领取',
    callback: '#领取每日奖励',
    permission: 'qg_USER',
  });
});

test('buildOfficialMessage can keep an image before markdown and buttons', () => {
  const image = { type: 'image', file: 'preview.png' };
  const message = buildOfficialMessage(
    '## 出售确认',
    [[{ text: '确认', command: '1' }]],
    'qg_USER',
    [image],
  );

  assert.equal(message[0], image);
  assert.equal(message[1].type, 'markdown');
  assert.equal(message[2].type, 'button');
});

test('buildOfficialMessage keeps public buttons unrestricted', () => {
  const message = buildOfficialMessage(
    '# 团本招募',
    [[{ text: '加入', command: '#加入讨伐队伍 TEAM', permission: false }]],
    'qg_LEADER',
  );

  assert.equal(message[1].data[0][0].permission, false);
});

test('replyOfficialMessage keeps plain text on non-QQBot events', async () => {
  let sent;
  const e = {
    user_id: '10001',
    reply(message) {
      sent = message;
      return message;
    },
  };

  await replyOfficialMessage(e, {
    markdown: '# 每日奖励',
    text: '每日奖励',
    buttons: [[{ text: '领取', command: '#领取每日奖励' }]],
  });

  assert.equal(sent, '每日奖励');
});

test('replyOfficialMessage enables rich messages for the QQBot adapter', async () => {
  let sent;
  const e = {
    user_id: 'BOT:USER',
    bot: { adapter: { id: 'QQBot' } },
    reply(message) {
      sent = message;
      return message;
    },
  };

  await replyOfficialMessage(e, {
    markdown: '# 每日奖励',
    text: '每日奖励',
    buttons: [[{ text: '领取', command: '#领取每日奖励' }]],
  });

  assert.equal(sent[0].type, 'markdown');
  assert.equal(sent[1].data[0][0].callback, '#领取每日奖励');
  assert.equal(sent[1].data[0][0].permission, 'BOT:USER');
});
