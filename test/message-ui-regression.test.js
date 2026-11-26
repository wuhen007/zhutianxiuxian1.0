import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const userAction = fs.readFileSync(new URL('../apps/User/UserAction.js', import.meta.url), 'utf8');
const timeRiverTask = fs.readFileSync(new URL('../apps/SecretPlace/shijianchangheTask.js', import.meta.url), 'utf8');

test('纳戒图片不再附加分类按钮', () => {
  assert.doesNotMatch(userAction, /NAJIE_BUTTONS|replyImageWithButtons/);
});

test('时间长河结算：官方群走 markdown 真 @，协议号群仍是图片带 @ 段', () => {
  const resultSender = timeRiverTask.slice(timeRiverTask.indexOf('async sendResultMessage'));
  // 官方群的 group_id 是 32 位 openid，@ 段会被拆成独立一条，所以只发图片；
  // 真 @ 由 deliverReport 用 buildAt(openid) 拼进 markdown 正文
  assert.match(resultSender, /officialGroup \? content : \[segment\.at\(usr_qq\), content\]/);
  assert.doesNotMatch(resultSender, /const msgArray = \[\s*segment\.at/);
  assert.match(timeRiverTask, /buildAt\(action\.at_openid\)/);
});
