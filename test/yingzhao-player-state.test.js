import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../apps/User/zhengdaotixi.js', import.meta.url), 'utf8');

test('仙帝映照后将不念不想写入玩家存档', () => {
  assert.match(source, /caster\.不念不想 = bunianState;\s*await Write_player\(casterQQ, caster\);/);
  assert.match(source, /状态: '不念不想'/);
  assert.match(source, /endTime: now \+ bunianMin \* 60 \* 1000/);
});
