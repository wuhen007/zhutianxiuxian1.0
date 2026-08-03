import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  XUTIAN_MASTER_INHERITANCE_CHANCE,
  XUTIAN_TREASURY_REWARDS,
  pickXutianTreasuryReward,
  validateXutianTreasuryRewards,
} from '../model/xutianTreasury.js';

const readJson = relative => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'));

test('虚天宝库权重完整且虚天之主传承为千分之一', () => {
  assert.equal(validateXutianTreasuryRewards(), true);
  assert.equal(XUTIAN_TREASURY_REWARDS.reduce((sum, reward) => sum + reward.weight, 0), 10000);
  assert.equal(XUTIAN_MASTER_INHERITANCE_CHANCE, 0.001);
  assert.equal(pickXutianTreasuryReward(() => 0).name, '定神丹');
  assert.equal(pickXutianTreasuryReward(() => 0.9999).name, '虚天之主传承');
});

test('宝库功法、心神丹药、潜力丹和传承均已登记', () => {
  const pills = readJson('../resources/data/item/丹药列表.json');
  const skills = readJson('../resources/data/item/功法列表.json');
  const items = readJson('../resources/data/item/道具列表.json');
  for (const name of ['定神丹', '太虚养神丹', '七窍养神丹', '太虚拓识丹', '虚天悟道丹']) {
    assert.ok(pills.some(item => item.name === name), `${name}未登记`);
  }
  for (const name of ['九灭重生经', '神灵斩劫经', '元神盾']) {
    assert.ok(skills.some(item => item.name === name), `${name}未登记`);
  }
  assert.ok(items.some(item => item.name === '虚天之主传承'));
});

test('劫光令与两种养神丹方均受虚天之主传承限制', () => {
  const recipes = readJson('../resources/data/occupation/炼丹配方.json');
  const crafting = readJson('../resources/data/item/合成列表.json');
  for (const name of ['定神丹', '太虚养神丹']) {
    assert.equal(recipes.find(recipe => recipe.name === name)?.传承要求, '虚天之主传承');
  }
  assert.equal(crafting.find(recipe => recipe.name === '劫光令')?.传承要求, '虚天之主传承');
});
