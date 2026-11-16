import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../apps/AdminSuper/AdminSuper.js', import.meta.url), 'utf8');
const activeGroups = fs.readFileSync(new URL('../model/activeGroups.js', import.meta.url), 'utf8');

test('群内自助关闭推送：只在本群生效，校验群主/管理员，并记黑名单', () => {
  assert.match(source, /reg: '\^#关闭本群修仙推送\$'/);
  assert.match(source, /fnc: 'disableGroupPush'/);
  // 只认群内身份，不用全服管理员权限
  assert.match(source, /e\.member\?\.is_owner \|\| e\.member\?\.is_admin/);
  // 关掉后必须进黑名单，否则自动注册下一轮又加回来
  assert.match(source, /await blockGroup\(gid\)/);
  // 忽略大小写比对，官方群 openid 在配置里可能大小写不一致
  assert.match(source, /toLowerCase\(\) === gid\.toLowerCase\(\)/);
});

test('入名单提示指向群内自助指令，而不是让群主去找管理员', () => {
  assert.match(activeGroups, /#关闭本群修仙推送/);
  assert.doesNotMatch(activeGroups, /联系管理员发送「#删除全局推送/);
});
