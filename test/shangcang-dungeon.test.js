import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  deductShangcangCost,
  getShangcangCostShortage,
  isShangcangAction,
  recordShangcangVictory,
  rollShangcangRewards,
  SHANGCANG_ADDICTION_ACTION,
  SHANGCANG_COST,
  SHANGCANG_NORMAL_ACTION,
} from '../model/shangcangDungeon.js';

function json(path) {
  return JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
}

test('上苍副本成本、掉落和纪元进度闭环', () => {
  const player = Object.fromEntries(Object.entries(SHANGCANG_COST).map(([field, amount]) => [field, amount]));
  assert.equal(getShangcangCostShortage(player), null);
  assert.equal(deductShangcangCost(player), true);
  assert.deepEqual(Object.values(player), Object.values(SHANGCANG_COST).map(() => 0));
  assert.equal(getShangcangCostShortage(player)?.[0], '灵石');

  const rolls = [0.8, 0, 0, 0, 0, 0, 0];
  const rewards = rollShangcangRewards('魂河', () => rolls.shift() ?? 1);
  assert.equal(rewards[0].name, '魂河古晶');
  assert.equal(rewards[0].count, 3);
  assert.ok(rewards.some(item => item.name === '天帝拳残页'));

  const progressPlayer = { 纪元积累: 98 };
  recordShangcangVictory(progressPlayer);
  recordShangcangVictory(progressPlayer);
  const third = recordShangcangVictory(progressPlayer);
  assert.equal(third.gained, 2);
  assert.equal(progressPlayer.纪元积累, 100);
  assert.equal(progressPlayer.上苍之上纪元进度, 0);
  assert.equal(isShangcangAction({ action: SHANGCANG_NORMAL_ACTION }), true);
  assert.equal(isShangcangAction({ action: SHANGCANG_ADDICTION_ACTION }), true);
});

test('魂河和天帝葬坑资源、功法与合成配置齐全', () => {
  const dungeons = json('../resources/data/item/副本/上苍之上列表.json');
  const materials = json('../resources/data/item/材料列表.json');
  const pills = json('../resources/data/item/丹药列表.json');
  const props = json('../resources/data/item/道具列表.json');
  const herbs = json('../resources/data/item/草药列表.json');
  const specialEquipment = json('../resources/data/item/特殊装备列表.json');
  const equipment = [
    ...json('../resources/data/item/装备列表.json'),
    ...json('../resources/data/item/帝兵列表.json'),
    ...specialEquipment,
  ];
  const techniques = json('../resources/data/item/功法列表.json');
  const attackSkills = json('../resources/data/item/技能组/攻击技能.json');
  const recipes = json('../resources/data/item/合成列表.json');
  assert.deepEqual(dungeons.map(item => item.name), ['魂河', '天帝葬坑']);
  for (const name of ['魂河古晶', '天帝拳残页', '葬帝黑金', '葬天古经残页']) assert.ok(materials.some(item => item.name === name));
  const strongestExistingTianyao = Math.max(
    ...pills.filter(item => item.type === '天药' && item.name !== '诸世帝魂莲').map(item => Number(item.yuanshen) || 0),
  );
  assert.ok(pills.some(item => item.name === '诸世帝魂莲' && item.yuanshen > strongestExistingTianyao));
  assert.ok(specialEquipment.some(item => item.name === '魂河渡世灯' && item.首次免控 === 1));
  assert.ok(specialEquipment.some(item => item.name === '葬帝玄甲' && item.低血护盾 === 0.2));
  const catalogs = { 材料: materials, 丹药: pills, 道具: props, 草药: herbs, 装备: equipment };
  for (const dungeon of dungeons) {
    for (const drop of [...dungeon.one, ...dungeon.two, ...dungeon.three]) {
      const stored = catalogs[drop.class]?.find(item => item.name === drop.name);
      assert.ok(stored, `${dungeon.name}掉落${drop.name}未录入${drop.class}主目录`);
      assert.equal(drop.稀有度, stored.稀有度, `${drop.name}的副本稀有度与主目录不一致`);
    }
  }
  for (const name of ['天帝拳', '葬天古经']) {
    assert.ok(techniques.some(item => item.name === name));
    assert.ok(recipes.some(item => item.name === name));
  }
  const tianDiFist = attackSkills.find(item => item.name === '天帝拳');
  assert.deepEqual(
    { chance: tianDiFist.pr, multiplier: tianDiFist.beilv, targets: tianDiFist.群攻, splash: tianDiFist.群攻比例, unblockable: tianDiFist.不可防御 },
    { chance: 0.25, multiplier: 12, targets: 3, splash: 0.6, unblockable: 1 },
  );
  const burialScripture = attackSkills.find(item => item.name === '葬天古经');
  assert.deepEqual(
    { chance: burialScripture.pr, multiplier: burialScripture.beilv, healCut: burialScripture.禁疗, slow: burialScripture.速度削弱, turns: burialScripture.禁疗回合 },
    { chance: 0.22, multiplier: 7, healCut: 0.4, slow: 0.15, turns: 2 },
  );
  assert.equal(recipes.find(item => item.name === '魂河渡世灯').costs.源石, 20000000000);
  assert.equal(recipes.find(item => item.name === '葬帝玄甲').costs.源石, 20000000000);
});
