import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const userAction = fs.readFileSync(new URL('../apps/User/UserAction.js', import.meta.url), 'utf8');
const timeRiverTask = fs.readFileSync(new URL('../apps/SecretPlace/shijianchangheTask.js', import.meta.url), 'utf8');

test('纳戒图片不再附加分类按钮', () => {
  assert.doesNotMatch(userAction, /NAJIE_BUTTONS|replyImageWithButtons/);
});

test('时间长河结算艾特位于图片消息之外', () => {
  const resultSender = timeRiverTask.slice(timeRiverTask.indexOf('async sendResultMessage'));
  assert.match(resultSender, /sendMsg\(\[segment\.at\(usr_qq\), content\]\)/);
  assert.doesNotMatch(resultSender, /const msgArray = \[\s*segment\.at/);
});
