import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(
  new URL('../apps/User/UserSellAll.js', import.meta.url),
  'utf8'
);

test('任一修炼体系达到准仙帝后均不能一键服用修为丹或血气丹', () => {
  for (const method of ['all_xiuweidan', 'all_xueqidan']) {
    const start = source.indexOf(`async ${method}(`);
    assert.notEqual(start, -1, `未找到 ${method}`);
    assert.match(
      source.slice(start, start + 800),
      /if\s*\(\s*player\.mijinglevel_id\s*>\s*19\s*\|\|\s*player\.xiangulevel_id\s*>\s*19\s*\)/
    );
  }
});
