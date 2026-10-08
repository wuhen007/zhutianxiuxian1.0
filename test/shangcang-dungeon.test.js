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

  const soulRiver = json('../resources/data/item/副本/上苍之上列表.json')
    .find(place => place.name === '魂河');
  const rolls = [0.8, 0, 0, 0, 0, 0, 0, 0];
  const rewards = rollShangcangRewards(soulRiver, () => rolls.shift() ?? 1);
  assert.equal(rewards[0].name, '魂河古晶');
  assert.equal(rewards[0].count, 3);
  assert.ok(rewards.some(item => item.name === '天帝拳残页'));

  const progressPlayer = { 纪元积累: 98 };
  recordShangcangVictory(progressPlayer);
  recordShangcangVictory(progressPlayer);
  const third = recordShangcangVictory(progressPlayer);
  assert.equal(third.gained, 2);
  assert.equal(third.cap, 100);
  assert.equal(progressPlayer.纪元积累, 100);
  assert.equal(progressPlayer.上苍之上纪元进度, 0);
  assert.equal(isShangcangAction({ action: SHANGCANG_NORMAL_ACTION }), true);
  assert.equal(isShangcangAction({ action: SHANGCANG_ADDICTION_ACTION }), true);
});

test('上苍四档奖励均由地点配置参与抽取', () => {
  const dungeons = json('../resources/data/item/副本/上苍之上列表.json');
  const expectedChances = {
    魂河: {
      one: { 天帝拳残页: 0.12 },
      two: { 诸世帝魂莲: 0.015 },
      three: { 魂河渡世灯: 0.006, 诸世无痕符: 0.003 },
      four: { 万劫轮回莲: 0.001 },
    },
    天帝葬坑: {
      one: { 葬天古经残页: 0.1 },
      two: { 天帝鼎: 0.003, 荒剑: 0.003, 雷池: 0.003 },
      three: { 葬帝玄甲: 0.006 },
      four: { 时光炉: 0.0012, 祭道甲胄: 0.0005, 女帝战戟: 0.0003 },
    },
  };
  for (const dungeon of dungeons) {
    const allDrops = ['one', 'two', 'three', 'four']
      .flatMap(tier => dungeon[tier] || []);
    assert.equal(allDrops.some(drop => drop.name === '花粉路祖种'), false, '祖种由圣墟唯一机缘发放，不回流上苍普通掉落池');
    assert.ok(dungeon.two.length > 0, `${dungeon.name}缺少中级奖励`);
    assert.ok(dungeon.three.length > 0, `${dungeon.name}缺少高级奖励`);
    assert.ok(dungeon.four.length > 0, `${dungeon.name}缺少最高奖励`);
    assert.equal(allDrops.filter(drop => drop.guaranteed).length, 1);
    assert.ok(allDrops.filter(drop => !drop.guaranteed)
      .every(drop => Number(drop.chance) > 0 && Number(drop.chance) <= 1));
    for (const tier of ['one', 'two', 'three', 'four']) {
      assert.deepEqual(
        Object.fromEntries(dungeon[tier].filter(drop => !drop.guaranteed)
          .map(drop => [drop.name, drop.chance])),
        expectedChances[dungeon.name][tier],
      );
    }

    const allHit = rollShangcangRewards(dungeon, () => 0);
    assert.deepEqual(
      new Set(allHit.map(drop => `${drop.class}:${drop.name}`)),
      new Set(allDrops.map(drop => `${drop.class}:${drop.name}`)),
    );
    assert.equal(rollShangcangRewards(dungeon, () => 0.999999).length, 1);
  }
});

test('上苍掉落兼容旧地点字符串调用', () => {
  assert.equal(rollShangcangRewards('魂河', () => 0.999999)[0]?.name, '魂河古晶');
  assert.equal(rollShangcangRewards('天帝葬坑', () => 0.999999)[0]?.name, '葬帝黑金');
});

test('上苍结算使用当前地点奖励表', () => {
  const source = fs.readFileSync(new URL('../apps/SecretPlace/ShangcangTask.js', import.meta.url), 'utf8');
  assert.match(source, /data\.shangcang_list\.find\(/);
  assert.match(source, /rollShangcangRewards\(rewardPlace,/);
});

test('上苍三胜奖励按己道阶段提升纪元积累上限', () => {
  const stages = [
    [{ 纪元积累: 198, 己道推演: { attempts: 10 } }, 200],
    [{ 纪元积累: 298, 己道推演: { attempts: 15 } }, 300],
    [{ 纪元积累: 498, 己道推演: { attempts: 20 } }, 500],
    [{ 纪元积累: 998, mijinglevel_id: 21 }, 1000],
  ];

  for (const [player, cap] of stages) {
    recordShangcangVictory(player);
    recordShangcangVictory(player);
    const result = recordShangcangVictory(player);
    assert.deepEqual(
      { gained: result.gained, cap: result.cap, accumulated: player.纪元积累 },
      { gained: 2, cap, accumulated: cap },
    );
  }
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
    for (const drop of [...dungeon.one, ...dungeon.two, ...dungeon.three, ...dungeon.four]) {
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
