import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { getWishScaleExchangeConfig } from '../model/immortalFishing.js';
import {
  FLOWER_DAO_DAILY_LIMIT,
  ensureFlowerPollenState,
  getFlowerDaoGateState,
  recordFlowerDaoAttempt,
} from '../model/flowerPollenPath.js';

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

test('花粉路悟道同样支持大衍悟道丹续道', () => {
  const flowerSource = fs.readFileSync(
    new URL('../apps/User/FlowerPollenPath.js', import.meta.url),
    'utf8',
  );
  assert.match(flowerSource, /exist_najie_thing\(userId, '大衍悟道丹', '丹药'\)/);
  assert.match(flowerSource, /Add_najie_thing\(userId, '大衍悟道丹', '丹药', -1\)/);
  assert.match(flowerSource, /服大衍悟道丹·续道/);
  assert.match(flowerSource, /可服【大衍悟道丹】延续道途/);
});

test('花粉悟道满次数后未服丹拒绝、服丹后可再参一次', () => {
  const player = ensureFlowerPollenState({ huafenlevel_id: 9 });
  const dateKey = '2026-09-07';
  for (let i = 0; i < FLOWER_DAO_DAILY_LIMIT; i += 1) {
    assert.equal(recordFlowerDaoAttempt(player, 9, 10, dateKey).ok, true);
  }
  assert.equal(getFlowerDaoGateState(player, 9).path.daily.count, FLOWER_DAO_DAILY_LIMIT);
  assert.equal(recordFlowerDaoAttempt(player, 9, 10, dateKey).ok, false);
  assert.equal(recordFlowerDaoAttempt(player, 9, 10, dateKey, FLOWER_DAO_DAILY_LIMIT + 1).ok, true);
  assert.equal(getFlowerDaoGateState(player, 9).path.daily.count, FLOWER_DAO_DAILY_LIMIT + 1);
});
