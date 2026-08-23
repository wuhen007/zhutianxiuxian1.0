import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');

test('help removes confirmed stale commands and documents current restore and formation commands', () => {
  const main = read('../config/help/help.yaml');
  const basic = read('../config/help/jichuhelp.yaml');
  const extension = read('../config/help/helpcopy.yaml');
  const worlds = read('../config/help/zhutianhelp.yaml');
  const admin = read('../config/help/set.yaml');
  const advanced = read('../config/help/help2.yaml');

  assert.doesNotMatch(worlds, /bug待修复|#清除现世污染/);
  assert.doesNotMatch(main, /不够完善/);
  assert.doesNotMatch(extension, /grop:/);
  assert.match(extension, /除你禁言 \/ 废除/);
  assert.match(basic, /#妖王状态/);
  assert.match(basic, /#妖王贡献榜/);
  assert.match(admin, /#回溯玩家练气\/纳戒存档@玩家 \[序号\]/);
  assert.match(advanced, /#自刻阵法.*#启用阵法.*#停用阵法/);
});
