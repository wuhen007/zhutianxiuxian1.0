import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { buildUniqueItemRarityMap } from '../model/najieRaritySync.js';

test('纳戒字段修复只同步名称对应唯一的标准稀有度', () => {
  const rarities = buildUniqueItemRarityMap([
    [{ name: '极道丹', 稀有度: 10 }, { name: '普通丹', 稀有度: 2 }],
    [{ name: '极道丹', 稀有度: 10 }, { name: '冲突丹', 稀有度: 4 }],
    [{ name: '冲突丹', 稀有度: 7 }, { name: '自定义物品' }],
  ]);
  assert.equal(rarities.get('极道丹'), 10);
  assert.equal(rarities.get('普通丹'), 2);
  assert.equal(rarities.has('冲突丹'), false);
  assert.equal(rarities.has('自定义物品'), false);
});

test('全体纳戒字段修复接入标准稀有度同步', () => {
  const source = fs.readFileSync(
    new URL('../apps/AdminSuper/AdminSuper.js', import.meta.url),
    'utf8'
  );
  assert.match(source, /const nameRarityMap = this\._buildNajieRarityMap\(\)/);
  assert.match(source, /item\.稀有度 = standardRarity/);
  assert.match(source, /预计稀有度同步/);
});
