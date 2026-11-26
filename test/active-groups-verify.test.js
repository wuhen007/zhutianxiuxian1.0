import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInviteText, isCatchAllHandler } from '../model/activeGroups.js';

test('兜底守卫 guard 不计入「在玩修仙」', () => {
  // guard 的规则是 ^#，所有井号指令都会先过它，拿它计数会把别的插件的指令算成修仙活跃
  assert.equal(isCatchAllHandler('[诡异祭礼身灭道消封锁(guard)]'), true);
  // 具体指令的守卫不算兜底，仍要计数
  assert.equal(isCatchAllHandler('[法宝锻造(guardForge)]'), false);
  assert.equal(isCatchAllHandler(''), false);
});

test('新群提示包含开启/关闭指令，并说明误判可忽略', () => {
  const text = buildInviteText(3);
  assert.match(text, /可能在玩修仙/);
  assert.match(text, /#开启本群修仙推送/);
  assert.match(text, /#关闭本群修仙推送/);
  assert.match(text, /忽略本条即可/);
  // 默认是关的，文案不能出现「已加入」这种既定事实
  assert.doesNotMatch(text, /已加入/);
});

test('提示文案里的门槛数字跟随配置', () => {
  assert.match(buildInviteText(5), /累计 5 次/);
  assert.match(buildInviteText(), /累计 3 次/); // 缺省按 3
});
