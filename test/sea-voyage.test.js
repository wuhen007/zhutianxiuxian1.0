import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  SEA_ATLAS,
  SEA_BOAT_NAMES,
  SEA_BOAT_TIERS,
  SEA_EVENT_CHANCE,
  SEA_EVENT_IDS,
  SEA_EVENTS,
  SEA_FIRST_BOAT_MATERIALS,
  SEA_ROUTE_NAMES,
  SEA_ROUTES,
  SEA_VOYAGE_COST,
  getBoatTier,
  getBoatTierIndex,
  getSeaEventById,
  getSeaEventChoice,
  getSeaRoute,
  isSeaRouteTideBoosted,
  rollSeaEvent,
  rollSeaSighting,
  rollSeaVoyageBaseReward,
} from '../model/seaVoyage.js';
import {
  FISHING_PLANE_NAMES,
} from '../model/immortalFishing.js';
import {
  consumeSeaVoyageSets,
  getPendingSeaVoyageRewards,
  getSeaRouteAtlas,
  getSeaRouteAtlasSetRewardBundle,
  markSeaVoyageRewardsClaimed,
  recordSeaSighting,
} from '../model/seaVoyageProgress.js';

const readJson = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const itemLists = [
  readJson('../resources/data/item/丹药列表.json'),
  readJson('../resources/data/item/材料列表.json'),
  readJson('../resources/data/item/草药列表.json'),
  readJson('../resources/data/item/道具列表.json'),
  readJson('../resources/data/item/食材列表.json'),
  readJson('../resources/data/item/盒子列表.json'),
].flat();
const recipes = readJson('../resources/data/item/合成列表.json');
const sequence = values => () => values.shift();

test('三阶舟：倍率递增、耗时递减、升级链闭环', () => {
  assert.deepEqual(SEA_BOAT_NAMES, ['一叶轻舟', '界河灵舟', '诸天仙舟']);
  for (let index = 0; index < SEA_BOAT_TIERS.length; index++) {
    const tier = SEA_BOAT_TIERS[index];
    assert.equal(getBoatTier(tier.name), tier);
    assert.equal(getBoatTierIndex(tier.name), index);
    assert.ok(tier.multiplier >= 1);
    if (index > 0) assert.ok(tier.multiplier > SEA_BOAT_TIERS[index - 1].multiplier);
    assert.ok(tier.voyageMinutes > 0);
    if (index < SEA_BOAT_TIERS.length - 1) {
      assert.equal(tier.upgrade.name, SEA_BOAT_TIERS[index + 1].name);
      assert.ok(tier.upgrade.materials.length > 0);
    } else {
      assert.equal(tier.upgrade, null);
    }
  }
  // 舟均为绑定道具并登记
  for (const name of SEA_BOAT_NAMES) {
    const item = itemLists.find(entry => entry.name === name && entry.class === '道具');
    assert.ok(item, `${name}未登记`);
    assert.equal(item.不可交易, 1, `${name}应为绑定道具`);
    assert.ok(recipes.some(recipe => recipe.name === name), `${name}缺合成配方`);
  }
  // 首舟配方与升级配方与数据层一致
  assert.deepEqual(
    recipes.find(recipe => recipe.name === '一叶轻舟').materials,
    SEA_FIRST_BOAT_MATERIALS
  );
  assert.deepEqual(
    recipes.find(recipe => recipe.name === '界河灵舟').materials,
    getBoatTier('一叶轻舟').upgrade.materials
  );
  assert.deepEqual(
    recipes.find(recipe => recipe.name === '诸天仙舟').materials,
    getBoatTier('界河灵舟').upgrade.materials
  );
});

test('三条航线覆盖全部垂钓位面，见闻3条/航线含传说', () => {
  assert.deepEqual(SEA_ROUTE_NAMES, ['凡间河', '遮天渊', '界海']);
  const covered = SEA_ROUTES.flatMap(route => route.planes);
  assert.equal(new Set(covered).size, FISHING_PLANE_NAMES.length, '航线位面不可重复');
  for (const plane of FISHING_PLANE_NAMES) {
    assert.ok(covered.includes(plane), `${plane}未覆盖`);
  }
  for (const route of SEA_ROUTES) {
    assert.ok(route.bait, `${route.name}缺兑换特产`);
    const entries = SEA_ATLAS[route.name];
    assert.equal(entries.length, 3, `${route.name}应有3条见闻`);
    assert.equal(entries.filter(entry => entry.kind === 'common').length, 2);
    assert.equal(entries.filter(entry => entry.kind === 'legend').length, 1);
  }
});

test('三个海域事件均为三选一，选项字段合法', () => {
  assert.equal(SEA_EVENTS.length, 3);
  assert.equal(new Set(SEA_EVENT_IDS).size, 3);
  for (const event of SEA_EVENTS) {
    assert.equal(event.choices.length, 3);
    for (const choice of event.choices) {
      assert.ok(choice.label);
      assert.ok(choice.message);
      if (choice.items) assert.ok(choice.items.length > 0);
      if (choice.sighting) assert.ok(['common', 'legend'].includes(choice.sighting));
      if (choice.gamble) {
        assert.ok(choice.gamble.win && choice.gamble.lose);
      }
    }
    assert.equal(getSeaEventById(event.id), event);
    assert.ok(getSeaEventChoice(event.id, 1));
    assert.ok(getSeaEventChoice(event.id, 3));
    assert.equal(getSeaEventChoice(event.id, 4), null);
  }
});

test('出海基础收益：愿鳞随舟阶与潮汐递增，材料按权重', () => {
  // 轻舟：愿鳞 2~5（第3次随机 0.2 不触发见闻）
  assert.equal(rollSeaVoyageBaseReward('凡间河', { boatMultiplier: 1, random: sequence([0, 0, 0.2]) }).wishScales, 2);
  assert.equal(rollSeaVoyageBaseReward('凡间河', { boatMultiplier: 1, random: sequence([0.999, 0, 0.2]) }).wishScales, 5);
  // 仙舟：2~5 × 2 = 4~10
  assert.equal(rollSeaVoyageBaseReward('界海', { boatMultiplier: 2, random: sequence([0.999, 0, 0.2]) }).wishScales, 10);
  // 旺潮：轻舟 2~5 × 1.5 = 3~7
  assert.equal(rollSeaVoyageBaseReward('凡间河', { boatMultiplier: 1, tideBoosted: true, random: sequence([0.999, 0, 0.2]) }).wishScales, 7);
  // 无材料：roll=0.2（cursor 20 < 40 权重）
  assert.deepEqual(
    rollSeaVoyageBaseReward('凡间河', { boatMultiplier: 1, random: sequence([0, 0.2, 0.2]) }).materials,
    []
  );
  // 群星之沙：roll=0.5（cursor 50 落 40~65 区间）
  assert.deepEqual(
    rollSeaVoyageBaseReward('凡间河', { boatMultiplier: 1, random: sequence([0, 0.5, 0.2]) }).materials,
    [{ name: '群星之沙', class: '道具', amount: 1 }]
  );
  // 见闻：第3次随机 0.05 < 0.15 → 触发，wantLegend=1 → 普通 → 渔火渡口
  const withSighting = rollSeaVoyageBaseReward('凡间河', { boatMultiplier: 1, random: sequence([0, 0, 0.05, 1, 0]) });
  assert.equal(withSighting.sighting, '渔火渡口');
  // 见闻不触发：0.2 >= 0.15
  assert.equal(rollSeaVoyageBaseReward('凡间河', { boatMultiplier: 1, random: sequence([0, 0, 0.2]) }).sighting, null);
});

test('见闻 roll 分普通与传说，旺潮传说概率提升', () => {
  const rollCommon = rollSeaSighting('凡间河', { tideBoosted: false, random: sequence([1, 0]) });
  const commonEntries = SEA_ATLAS.凡间河.filter(entry => entry.kind === 'common');
  assert.ok(commonEntries.some(entry => entry.name === rollCommon));
  const rollLegend = rollSeaSighting('凡间河', { tideBoosted: true, random: sequence([0, 0]) });
  assert.equal(rollLegend, '龙门浮影');
});

test('海域事件 60% 触发', () => {
  assert.equal(SEA_EVENT_CHANCE, 0.6);
  assert.equal(rollSeaEvent(() => 0.6), null);
  assert.ok(SEA_EVENT_IDS.includes(rollSeaEvent(() => 0.599).id));
});

test('旺潮位面航线判定', () => {
  const tide = { active: true, planes: ['凡间', '太初星墟'] };
  assert.equal(isSeaRouteTideBoosted('凡间河', tide), true);
  assert.equal(isSeaRouteTideBoosted('界海', tide), true);
  assert.equal(isSeaRouteTideBoosted('遮天渊', tide), false);
  assert.equal(isSeaRouteTideBoosted('凡间河', { active: false, planes: [] }), false);
});

test('见闻记录、首次发现奖励与集齐套装兑换闭环', () => {
  const player = {};
  for (const entry of SEA_ATLAS.凡间河) {
    recordSeaSighting(player, '凡间河', entry.name);
  }
  const atlas = getSeaRouteAtlas(player, '凡间河');
  assert.equal(atlas.collected, 3);
  assert.equal(atlas.total, 3);

  const pending = getPendingSeaVoyageRewards(player);
  // 3 条首次发现（各1愿鳞）+ 1 套集齐（3项：5仙钓+10愿鳞+2饵料）
  assert.equal(pending.filter(reward => reward.key.startsWith('discovery:')).length, 3);
  const setRewards = pending.filter(reward => reward.key.startsWith('set:凡间河:'));
  assert.equal(setRewards.length, 3);
  assert.deepEqual(
    setRewards.map(reward => [reward.name, reward.amount]).sort(),
    getSeaRouteAtlasSetRewardBundle('凡间河').map(reward => [reward.name, reward.amount]).sort()
  );
  assert.equal(setRewards.filter(reward => reward.consume).length, 1, '每套仅首个奖励项标记消耗');
  assert.ok(setRewards.every(reward => reward.consume === undefined
    || (reward.consume.route === '凡间河' && reward.consume.amount === 1)));

  // 领取：发现奖励标记、套装消耗见闻各1
  markSeaVoyageRewardsClaimed(player, pending);
  consumeSeaVoyageSets(player, pending);
  assert.equal(getSeaRouteAtlas(player, '凡间河').collected, 0);
  assert.equal(player.海域见闻套装兑换.凡间河, 1);
  assert.equal(getPendingSeaVoyageRewards(player).length, 0, '见闻耗尽后无可领奖励');
});

test('出海消耗为1仙钓+10愿鳞', () => {
  assert.equal(SEA_VOYAGE_COST.fishingRod.name, '众生仙钓');
  assert.equal(SEA_VOYAGE_COST.fishingRod.amount, 1);
  assert.equal(SEA_VOYAGE_COST.wishScales.name, '众生愿鳞');
  assert.equal(SEA_VOYAGE_COST.wishScales.amount, 10);
});
