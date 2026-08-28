import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applySecretPlaceNotificationContext,
  getSecretPlaceSummaryNotificationRoute,
  sendSecretPlaceNotification,
} from '../model/secretPlaceNotification.js';

test('QQBot伪群私聊保存为指定机器人的私聊路由', () => {
  const action = { group_id: 'old-group' };
  applySecretPlaceNotificationContext(action, {
    self_id: 'qqbot-2',
    user_id: '652992908',
    group_id: '652992908',
    isGroup: true,
    qqbot_private_as_group: true,
    qqbot_reply_type: 'private',
  }, '652992908');

  assert.equal(action.notify_bot_id, 'qqbot-2');
  assert.equal(action.notify_type, 'private');
  assert.equal(action.notify_target, '652992908');
  assert.equal('group_id' in action, false);
});

test('真实群聊保存群路由并保留兼容group_id', () => {
  const action = {};
  applySecretPlaceNotificationContext(action, {
    self_id: '10001',
    group_id: '20002',
    user_id: '30003',
    isGroup: true,
  }, '30003');

  assert.deepEqual(action, {
    notify_bot_id: '10001',
    notify_type: 'group',
    notify_target: '20002',
    group_id: '20002',
  });
});

test('秘境通知使用动作记录的机器人和会话类型', async () => {
  const sent = [];
  const botRoot = {
    qqbot: {
      pickUser(id) {
        return { sendMsg: async message => sent.push({ type: 'private', id, message }) };
      },
      pickGroup(id) {
        return { sendMsg: async message => sent.push({ type: 'group', id, message }) };
      },
    },
  };

  const result = await sendSecretPlaceNotification({
    notify_bot_id: 'qqbot',
    notify_type: 'private',
    notify_target: '652992908',
  }, '652992908', '结算完成', { botRoot });

  assert.equal(result, true);
  assert.deepEqual(sent, [{ type: 'private', id: '652992908', message: '结算完成' }]);
});

test('通知发送失败被记录并返回false，不向奖励流程抛错', async () => {
  const errors = [];
  const botRoot = {
    pickUser() {
      return {
        async sendMsg() {
          throw new Error('client not online');
        },
      };
    },
  };

  const result = await sendSecretPlaceNotification({}, '652992908', '结算完成', {
    botRoot,
    logger: { error: message => errors.push(message) },
  });

  assert.equal(result, false);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /奖励结算继续: client not online/);
});

test('任意非零retcode都按发送失败隔离', async () => {
  const errors = [];
  const botRoot = {
    pickUser() {
      return {
        async sendMsg() {
          return { retcode: -1, message: 'client not online' };
        },
      };
    },
  };

  const result = await sendSecretPlaceNotification({}, '652992908', '结算完成', {
    botRoot,
    logger: { error: message => errors.push(message) },
  });

  assert.equal(result, false);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /奖励结算继续: client not online/);
});

test('旧QQBot伪群动作在群发送失败后回退同号私聊', async () => {
  const attempts = [];
  const botRoot = {
    pickGroup(id) {
      return {
        async sendMsg() {
          attempts.push(`group:${id}`);
          throw new Error('client not online');
        },
      };
    },
    pickUser(id) {
      return {
        async sendMsg() {
          attempts.push(`private:${id}`);
        },
      };
    },
  };

  const result = await sendSecretPlaceNotification(
    { group_id: '3391549127' },
    '3391549127',
    '结算完成',
    { botRoot },
  );

  assert.equal(result, true);
  assert.deepEqual(attempts, ['group:3391549127', 'private:3391549127']);
});

test('旧沉迷汇总记录保留legacy路由并可回退同号私聊', async () => {
  const route = getSecretPlaceSummaryNotificationRoute({
    qq: '3391549127',
    qq_group: '3391549127',
    msg: '本轮结算',
  });

  assert.deepEqual(route.action, { group_id: '3391549127' });

  const attempts = [];
  const result = await sendSecretPlaceNotification(route.action, route.playerId, '本轮结算', {
    botRoot: {
      pickGroup(id) {
        return {
          async sendMsg() {
            attempts.push(`group:${id}`);
            throw new Error('client not online');
          },
        };
      },
      pickUser(id) {
        return {
          async sendMsg() {
            attempts.push(`private:${id}`);
          },
        };
      },
    },
  });

  assert.equal(result, true);
  assert.deepEqual(attempts, ['group:3391549127', 'private:3391549127']);
});
