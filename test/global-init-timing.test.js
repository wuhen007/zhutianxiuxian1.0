import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

function read(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('诸天初始化使用指定的再入仙途、商店刷新和讨伐时间', () => {
  const globalInit = read('apps/AdminSuper/GlobalInit.js');
  const tuanben = read('apps/Battle/tuanben.js');
  const taskConfig = read('config/task/task.yaml');
  const xiuxianConfig = read('config/xiuxian/xiuxian.yaml');

  assert.match(globalInit, /set\.CD\.reborn = 24 \* 60;/);
  assert.match(xiuxianConfig, /^\s*reborn: 1440$/m);
  assert.match(taskConfig, /^shop: 0 0 12 \? \* 1,3,5,7$/m);
  assert.match(tuanben, /this\.CD_DURATION = 24 \* 3600 \* 1000;/);
  assert.match(tuanben, /'EX', this\.CD_DURATION \/ 1000/);
});
