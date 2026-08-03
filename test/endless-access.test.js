import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  ENDLESS_ENTRY_ITEM,
  ENDLESS_KEY_RECIPE_FLAG,
  ENDLESS_KEY_RECIPE_ITEM,
  ENDLESS_SPIRIT_HEART_COST,
  ENDLESS_SWEEP_ITEM,
  WENXIAN_ENDLESS_REWARDS,
  getWenXianEndlessRewards,
} from '../model/endlessAccess.js';

const props = JSON.parse(
  fs.readFileSync(
    new URL('../resources/data/item/道具列表.json', import.meta.url),
    'utf8'
  )
);
const recipes = JSON.parse(
  fs.readFileSync(
    new URL('../resources/data/item/合成列表.json', import.meta.url),
    'utf8'
  )
);

test('无尽准入资源与问仙令投放数量固定', () => {
  assert.equal(ENDLESS_SPIRIT_HEART_COST, 50);
  const rewards = Object.values(WENXIAN_ENDLESS_REWARDS).flat();
  const count = (name) => rewards
    .filter((reward) => reward.name === name)
    .reduce((sum, reward) => sum + reward.count, 0);
  assert.equal(count(ENDLESS_ENTRY_ITEM), 3);
  assert.equal(count(ENDLESS_SWEEP_ITEM), 3);
  assert.equal(count('定神丹'), 8);
  assert.equal(count('太虚养神丹'), 2);
  assert.equal(getWenXianEndlessRewards(20)[0].class, '道具');
});

test('扫荡券、秘钥配方与受传承限制的合成项完整', () => {
  assert.ok(props.some((item) => item.name === ENDLESS_SWEEP_ITEM));
  assert.ok(props.some((item) => item.name === ENDLESS_KEY_RECIPE_ITEM));
  const recipe = recipes.find((item) => item.name === ENDLESS_ENTRY_ITEM);
  assert.equal(recipe.传承要求, ENDLESS_KEY_RECIPE_FLAG);
  assert.deepEqual(recipe.materials, [
    { name: '世界石', class: '材料', amount: 3 },
    { name: '天外清风', class: '材料', amount: 8 },
    { name: '星图', class: '道具', amount: 1 },
    { name: '符纸', class: '道具', amount: 20 },
  ]);
});
