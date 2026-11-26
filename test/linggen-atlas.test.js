import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLinggenAtlasData, parseLinggenAtlasCommand } from '../model/linggenAtlas.js';

const roots = [
  { id: 1, name: '金灵根', type: '真灵根', eff: 0.2, 法球倍率: 0.08, 攻击: 0.1 },
  { id: 1, name: '木灵根', type: '真灵根', eff: 0.2, 法球倍率: 0.08, 防御: 0.1 },
  { id: 2, name: '风灵根', type: '变异灵根', eff: 0.18, 法球倍率: 0.1 },
  { id: 3, name: '混沌体', type: '体质', 归类: '诸天万界', eff: 1, 法球倍率: 1, 攻击: 2 },
];

test('灵根图鉴命令默认分页并识别分类、模板', () => {
  assert.deepEqual(parseLinggenAtlasCommand('#灵根图鉴'), { page: 1, category: '', template: 'a' });
  assert.deepEqual(parseLinggenAtlasCommand('#灵根图鉴 第2页 模板3'), { page: 2, category: '', template: 'c' });
  assert.deepEqual(parseLinggenAtlasCommand('#灵根图鉴 分类:真灵根 模版2'), { page: 1, category: '真灵根', template: 'b' });
  assert.deepEqual(parseLinggenAtlasCommand('#灵根图鉴 2'), { page: 2, category: '', template: 'a' });
});

test('灵根图鉴按分类过滤、分页并标记当前灵根', () => {
  const page = buildLinggenAtlasData(roots, { 灵根: { id: 1, name: '木灵根', type: '真灵根' } }, { page: 1, category: '真灵根', pageSize: 1, template: 'b' });
  assert.equal(page.page, 1);
  assert.equal(page.totalPages, 2);
  assert.equal(page.visibleCount, 2);
  assert.equal(page.entries[0].name, '金灵根');
  assert.equal(page.entries[0].isCurrent, false);
  assert.equal(page.entries[0].攻击加成, '10%');
  assert.equal(page.entries[0].qualityClass, 'quality-green');
  assert.equal(page.entries[0].qualityLabel, '灵青');
  assert.equal(page.template, 'b');

  const second = buildLinggenAtlasData(roots, { 灵根: { id: 1, name: '木灵根' } }, { page: 2, category: '真灵根', pageSize: 1 });
  assert.equal(second.entries[0].name, '木灵根');
  assert.equal(second.entries[0].isCurrent, true);
});

test('综合倍率与全属性加成达到顶级时使用七彩品级', () => {
  const result = buildLinggenAtlasData([
    { name: '终极灵根', type: '至尊', eff: 30000, 法球倍率: 1000, 攻击: 5000, 防御: 5000, 生命: 5000, 生命本源: 15000 },
  ]);
  assert.equal(result.entries[0].qualityClass, 'quality-rainbow');
  assert.equal(result.entries[0].qualityLabel, '七彩');
});

test('灵根图鉴无匹配分类时返回空状态而不是越界', () => {
  const result = buildLinggenAtlasData(roots, {}, { category: '不存在', page: 99 });
  assert.equal(result.empty, true);
  assert.equal(result.page, 1);
  assert.equal(result.totalPages, 1);
  assert.match(result.emptyMessage, /不存在/);
});
