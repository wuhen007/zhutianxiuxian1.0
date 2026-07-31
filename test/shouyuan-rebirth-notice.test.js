import assert from 'node:assert/strict';
import test from 'node:test';

import { buildShouyuanRebirthNotice } from '../apps/User/shouyuanRebirthNotice.js';

test('寿元耗尽通知说明弥留阶段、救援等待和玩家QQ', () => {
  const notice = buildShouyuanRebirthNotice('叶凡', '123456', 5 * 60 * 1000);

  assert.match(notice, /弥留之际/);
  assert.match(notice, /QQ：123456/);
  assert.match(notice, /救援窗口：5分钟/);
  assert.match(notice, /#轮回救人 @目标/);
  assert.match(notice, /执掌者裁定/);
});
