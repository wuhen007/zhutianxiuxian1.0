import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('扣除旧装备时保留缺失品阶并检查实际命中项', () => {
  const source = fs.readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
  const start = source.indexOf('export async function Add_najie_thing');
  const end = source.indexOf("} else if (thing_class == '仙宠')", start);
  const equipmentBranch = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(
    equipmentBranch,
    /if \(x > 0 && \(pinji === undefined \|\| pinji === null\)\)/,
  );
  assert.match(equipmentBranch, /if \(!target\) throw new Error\(/);
  assert.doesNotMatch(equipmentBranch, /x < 0[\s\S]*pinji = Math\.trunc/);
});
