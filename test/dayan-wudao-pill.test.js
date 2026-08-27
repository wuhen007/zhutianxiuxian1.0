import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { getWishScaleExchangeConfig } from '../model/immortalFishing.js';

const readJson = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const recipes = readJson('../resources/data/occupation/炼丹配方.json');
const occupationLevels = readJson('../resources/data/occupation/experience.json');
const items = readJson('../resources/data/item/道具列表.json');
const occupationSource = fs.readFileSync(
  new URL('../apps/Occupation/Occupation.js', import.meta.url),
  'utf8',
);

test('大衍悟道丹仅限满级炼丹师在参悟配方后炼制', () => {
  const recipe = recipes.find(item => item.name === '大衍悟道丹');
  const currentMaxLevel = occupationLevels.find(item => item.experience > Number.MAX_SAFE_INTEGER).id;

  assert.equal(recipe.level_limit, currentMaxLevel);
  assert.equal(occupationLevels.find(item => item.id === currentMaxLevel).name, '白袍极品');
  assert.equal(recipe.传承要求, '大衍悟道丹配方');
  assert.deepEqual(recipe.materials, [
    { name: '悟道古茶叶', amount: 10 },
    { name: '万年凝血草', amount: 20 },
    { name: '万年太玄果', amount: 20 },
    { name: '万年天魂菊', amount: 20 },
    { name: '万年清心草', amount: 20 },
  ]);
});

test('大衍悟道丹配方可用200愿鳞兑换并永久参悟', () => {
  assert.deepEqual(getWishScaleExchangeConfig('大衍悟道丹配方'), {
    cost: 200,
    reward: { name: '大衍悟道丹配方', class: '道具', amount: 1 },
    unique: true,
    unlockFlag: '大衍悟道丹配方',
  });

  const item = items.find(entry => entry.name === '大衍悟道丹配方');
  assert.equal(item.type, '配方');
  assert.equal(item.不可交易, 1);
  assert.match(occupationSource, /\^#参悟大衍悟道丹配方\$/);
  assert.match(occupationSource, /player\[recipeName\] = true/);
});
