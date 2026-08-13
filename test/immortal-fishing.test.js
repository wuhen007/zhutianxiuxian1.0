import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  IMMORTAL_BAIT_NAMES,
  IMMORTAL_FISHING_EVENT_CHANCE,
  OTHER_SHORE_FRUIT_CHANCE,
  WISH_SCALE_EXCHANGE_NAMES,
  XIANWU_COORD_CHANCE,
  getImmortalFishingCooldown,
  getImmortalBaitConfig,
  getWishScaleExchangeConfig,
  parseImmortalBait,
  parseWishScaleExchange,
  rollImmortalBaitReward,
  rollPlaneFishingEvent,
  rollWishScaleAmount,
} from '../model/immortalFishing.js';

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
const forgingMaterials = readJson('../resources/data/item/锻造材料.json');

test('五种众生仙饵均有独立奖池、物品登记与合成配方', () => {
  assert.deepEqual(IMMORTAL_BAIT_NAMES, [
    '神藏仙饵',
    '矿髓沉饵',
    '百草香饵',
    '因果道饵',
    '轮回冥饵',
  ]);
  for (const baitName of IMMORTAL_BAIT_NAMES) {
    const config = getImmortalBaitConfig(baitName);
    assert.ok(config.rewards.length > 0);
    assert.equal(config.rewards.reduce((sum, reward) => sum + reward.weight, 0), 100);
    assert.ok(itemLists.some(item => item.name === baitName && item.type === '仙饵'));
    assert.ok(recipes.some(recipe => recipe.name === baitName));
    for (const reward of config.rewards) {
      assert.ok(
        itemLists.some(item => item.name === reward.name && item.class === reward.class),
        `${baitName}奖池中的${reward.name}未登记`
      );
    }
  }
  for (const [name, itemClass] of [
    ['仙武界坐标', '道具'],
    ['彼岸轮回果', '材料'],
  ]) {
    assert.ok(itemLists.some(item => item.name === name && item.class === itemClass));
  }
});

test('垂钓指令可解析仙饵且保留无饵模式', () => {
  assert.equal(parseImmortalBait('#垂钓众生'), null);
  assert.equal(parseImmortalBait('#垂钓众生 轮回冥饵'), '轮回冥饵');
});

test('仙武界坐标概率为2.5%且获得后永久退出奖池', () => {
  assert.equal(XIANWU_COORD_CHANCE, 0.025);
  assert.equal(
    rollImmortalBaitReward('轮回冥饵', {}, () => 0.024999).name,
    '仙武界坐标'
  );
  assert.notEqual(
    rollImmortalBaitReward(
      '轮回冥饵',
      { ownsXianwuCoordinate: true },
      () => 0.024999
    ).name,
    '仙武界坐标'
  );
});

test('彼岸轮回果在坐标区间之后保持0.1%独立区间', () => {
  assert.equal(OTHER_SHORE_FRUIT_CHANCE, 0.001);
  assert.equal(
    rollImmortalBaitReward('轮回冥饵', {}, () => 0.0255).name,
    '彼岸轮回果'
  );
  assert.equal(
    rollImmortalBaitReward(
      '轮回冥饵',
      { ownsXianwuCoordinate: true },
      () => 0.0005
    ).name,
    '彼岸轮回果'
  );
});

test('顶级材料配方数量符合设定', () => {
  const furnace = recipes.find(item => item.name === '造化仙炉');
  assert.deepEqual(furnace.materials, [
    { name: '罗天晶', class: '材料', amount: 5 },
    { name: '道衍晶', class: '材料', amount: 7 },
    { name: '造化仙晶', class: '材料', amount: 3 },
  ]);
  const touchScreen = recipes.find(item => item.name === '神主触屏');
  assert.deepEqual(touchScreen.materials, [
    { name: '神主触屏碎片', class: '道具', amount: 10 },
  ]);
});

test('愿鳞兑换档位、数量及绑定引潮灯符合设定', () => {
  assert.equal(parseWishScaleExchange('#愿鳞兑换'), null);
  assert.equal(parseWishScaleExchange('#愿鳞兑换 宇宙核心'), '宇宙核心');
  assert.deepEqual(WISH_SCALE_EXCHANGE_NAMES, [
    '众生仙钓', '百草香饵', '神藏仙饵', '矿髓沉饵', '因果道饵', '轮回冥饵',
    '宇宙核心', '界核', '鸿蒙道火', '三千弱水', '万界引潮灯',
  ]);
  assert.deepEqual(
    WISH_SCALE_EXCHANGE_NAMES.map(name => [name, getWishScaleExchangeConfig(name).cost]),
    [
      ['众生仙钓', 5], ['百草香饵', 30], ['神藏仙饵', 30],
      ['矿髓沉饵', 40], ['因果道饵', 50], ['轮回冥饵', 50],
      ['宇宙核心', 80], ['界核', 80], ['鸿蒙道火', 80],
      ['三千弱水', 80], ['万界引潮灯', 120],
    ]
  );
  for (const name of ['宇宙核心', '界核', '鸿蒙道火', '三千弱水']) {
    assert.ok(forgingMaterials.some(item => item.name === name && item.class === '材料'));
    assert.equal(getWishScaleExchangeConfig(name).reward.amount, 5);
  }
  const lamp = itemLists.find(item => item.name === '万界引潮灯');
  assert.equal(lamp.不可交易, 1);
});

test('引潮灯缩短冷却并把愿鳞产量从1至5提升为2至10', () => {
  assert.equal(getImmortalFishingCooldown(), 20 * 60 * 1000);
  assert.equal(getImmortalFishingCooldown({ hasTideLamp: true }), 10 * 60 * 1000);
  assert.equal(getImmortalFishingCooldown({ hasDaoArt: true }), 10 * 60 * 1000);
  assert.equal(
    getImmortalFishingCooldown({ hasTideLamp: true, hasDaoArt: true }),
    5 * 60 * 1000
  );
  assert.equal(rollWishScaleAmount(false, () => 0), 1);
  assert.equal(rollWishScaleAmount(false, () => 0.999999), 5);
  assert.equal(rollWishScaleAmount(true, () => 0), 2);
  assert.equal(rollWishScaleAmount(true, () => 0.999999), 10);
});

test('七个位面均有8%额外垂钓奇遇且不触发时返回空', () => {
  assert.equal(IMMORTAL_FISHING_EVENT_CHANCE, 0.08);
  assert.equal(rollPlaneFishingEvent('凡间', () => 0.08), null);
  for (const plane of ['凡间', '仙界', '遮天位面', '九天十地', '下界八域', '太初星墟', '仙域']) {
    const event = rollPlaneFishingEvent(plane, () => 0.079999);
    assert.ok(event?.id, `${plane}缺少垂钓奇遇`);
  }
  assert.equal(rollPlaneFishingEvent('遮天位面', () => 0).playerFlags.古地府秘辛, true);
});

test('渡劫天功由十张残页合成并登记为帝经', () => {
  const recipe = recipes.find(item => item.name === '渡劫天功');
  assert.deepEqual(recipe.materials, [
    { name: '渡劫天功残页', class: '材料', amount: 10 },
  ]);
  const skills = readJson('../resources/data/item/功法列表.json');
  assert.equal(skills.find(item => item.name === '渡劫天功').type, '帝经');
});
