import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(
  new URL('../apps/meirrenwu/zhixianrenwu.js', import.meta.url),
  'utf8'
);
const wenXianSource = fs.readFileSync(
  new URL('../apps/WenXianLing/WenXianLing.js', import.meta.url),
  'utf8'
);
const xianguSource = fs.readFileSync(
  new URL('../apps/SecretPlace/xianguPlace.js', import.meta.url),
  'utf8'
);

test('支线永久称号通过统一称号系统发放', () => {
  const start = source.indexOf("case '永久称号':");
  const end = source.indexOf("case '功法':", start);
  const branch = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(branch, /getTitleById\(value\)/);
  assert.match(branch, /grantTitle\(player, value\)/);
  assert.doesNotMatch(branch, /称号列表\.push/);
});

test('问仙令称号通过统一称号系统发放', () => {
  const start = wenXianSource.indexOf("case '称号':");
  const end = wenXianSource.indexOf("case '永久宝物':", start);
  const branch = wenXianSource.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(branch, /getTitleById\(reward\.name\)/);
  assert.match(branch, /grantTitle\(player, reward\.name\)/);
  assert.doesNotMatch(branch, /称号列表\.push/);
});

test('仙古称号在对应成功结算中发放', () => {
  assert.match(xianguSource, /grantTitle\(player, '神火境修士'\)/);
  assert.match(xianguSource, /grantTitle\(player, '祭炼真我'\)/);
  assert.match(xianguSource, /grantTitle\(player, '仙古第一'\)/);
});
