import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addXianguBagGrowth,
  addXianguBagItem,
  addXianguBagPotential,
  addXianguBagSeed,
  addXianguBagTechnique,
  calculateXianguSourceStoneReward,
  claimXianguBagItems,
  clearXianguBag,
  cloneXianguBag,
  createXianguBag,
  ensureXianguBag,
  formatXianguBag,
  getXianguBagLootUnits,
  getXianguBagSummary,
  takeXianguUniqueBagItem,
} from '../apps/SecretPlace/xianguBag.js';

test('仙古源石奖励固定为二百万乘仙古等级', () => {
  assert.equal(calculateXianguSourceStoneReward({ xiangulevel_id: 5 }), 10_000_000);
  assert.equal(calculateXianguSourceStoneReward({ xiangulevel_id: 7 }), 14_000_000);
  assert.equal(calculateXianguSourceStoneReward({ xiangulevel_id: 7 }, 3), 42_000_000);
  assert.equal(calculateXianguSourceStoneReward({ xiangulevel_id: 'bad' }), 2_000_000);
});

test('同一轮秘境物品只能结算进纳戒一次', () => {
  const najie = { 材料: [], 道具: [] };
  const bag = createXianguBag({
    items: [
      { name: '仙古源髓', type: '材料', quantity: 2 },
      { name: '残缺骨书', type: '道具', quantity: 1 },
    ],
  });

  assert.deepEqual(claimXianguBagItems(najie, bag, 'xiangu:run-1:items', 100), {
    claimed: true,
    itemCount: 3,
  });
  assert.deepEqual(claimXianguBagItems(najie, bag, 'xiangu:run-1:items', 200), {
    claimed: false,
    itemCount: 0,
  });
  assert.equal(najie.材料[0].数量, 2);
  assert.equal(najie.道具[0].数量, 1);
});

test('物品按名称和类型合并，并克隆来源数据', () => {
  const bag = createXianguBag();
  const source = { name: '仙古矿材', type: '材料', quantity: 2.9, meta: { age: 1 } };

  addXianguBagItem(bag, source);
  addXianguBagItem(bag, { 名称: '仙古矿材', 类型: '材料', 数量: '3' });
  addXianguBagItem(bag, { name: '仙古矿材', type: '道具', quantity: 4 });
  source.meta.age = 99;

  assert.deepEqual(bag.items, [
    { meta: { age: 1 }, name: '仙古矿材', type: '材料', quantity: 5 },
    { name: '仙古矿材', type: '道具', quantity: 4 },
  ]);
});

test('唯一物标记在合并时不会被普通同名条目冲掉', () => {
  const bag = createXianguBag();
  addXianguBagItem(bag, { name: '帝血', type: '绝世机缘', quantity: 1 });
  addXianguBagItem(bag, { name: '帝血', type: '绝世机缘', quantity: 1, unique: true });

  assert.equal(bag.items[0].quantity, 2);
  assert.equal(bag.items[0].unique, true);
});

test('非法数量归零，小数向下取整且累计不溢出安全整数', () => {
  const bag = createXianguBag({
    xiuwei: -1,
    xueqi: '12.9',
    sourceStone: Infinity,
    potential: 'bad',
    items: [
      { name: '负数', type: '道具', quantity: -2 },
      { name: '无穷', type: '道具', quantity: Infinity },
      { name: '空值', type: '道具', quantity: '' },
    ],
  });

  addXianguBagGrowth(bag, { xiuwei: '8.8', xueqi: true, sourceStone: 2_000_000.9 });
  addXianguBagPotential(bag, '9.7');
  addXianguBagItem(bag, '有效道具', 2.8);
  addXianguBagGrowth(bag, { xiuwei: Number.MAX_SAFE_INTEGER });

  assert.equal(bag.xiuwei, Number.MAX_SAFE_INTEGER);
  assert.equal(bag.xueqi, 12);
  assert.equal(bag.sourceStone, 2_000_000);
  assert.equal(bag.potential, 9);
  assert.deepEqual(bag.items, [{ name: '有效道具', type: '道具', quantity: 2 }]);
});

test('道种保留重复收获，功法按名称去重且全部隔离引用', () => {
  const bag = createXianguBag();
  const seed = { 名称: '世界树幼苗', 属性: { power: 10 } };
  const technique = { name: '真龙宝术', data: { level: 1 } };

  addXianguBagSeed(bag, seed);
  addXianguBagSeed(bag, seed);
  addXianguBagTechnique(bag, technique);
  addXianguBagTechnique(bag, { 名称: '真龙宝术' });
  seed.属性.power = 99;
  technique.data.level = 9;

  assert.equal(bag.seeds.length, 2);
  assert.equal(bag.seeds[0].属性.power, 10);
  assert.deepEqual(bag.techniques, [{ name: '真龙宝术', data: { level: 1 } }]);
});

test('汇总按物品数量、条目和非零收益类别计算战利品单位', () => {
  const bag = createXianguBag({
    xiuwei: 100,
    sourceStone: 4_000_000,
    items: [{ name: '古药', type: '丹药', quantity: 3 }],
    seeds: ['青月焰'],
    techniques: ['鲲鹏宝术'],
    potential: 50,
  });

  assert.equal(getXianguBagLootUnits(bag), 8);
  assert.deepEqual(getXianguBagSummary(bag), {
    xiuwei: 100,
    xueqi: 0,
    sourceStone: 4_000_000,
    items: [{ name: '古药', type: '丹药', quantity: 3 }],
    seeds: ['青月焰'],
    techniques: ['鲲鹏宝术'],
    potential: 50,
    itemCount: 3,
    seedCount: 1,
    techniqueCount: 1,
    lootUnits: 8,
  });
  assert.match(formatXianguBag(bag), /源石：4,000,000/);
  assert.match(formatXianguBag(bag), /战利品单位：8/);
});

test('克隆和清空不会污染背包来源或玩家永久字段', () => {
  const player = {
    修为: 1000,
    血气: 2000,
    源石: 3000,
    仙道潜力: 40,
    学习的功法: ['旧法'],
    xiangu_seeds: [{ 名称: '旧道种' }],
    纳戒: [{ name: '旧物' }],
  };
  const permanentSnapshot = structuredClone(player);
  const bag = ensureXianguBag(player);
  addXianguBagGrowth(bag, { xiuwei: 500, xueqi: 600, sourceStone: 700 });
  addXianguBagItem(bag, { name: '新物', type: '道具', quantity: 1 });

  const cloned = cloneXianguBag(bag);
  cloned.items[0].name = '被篡改';
  cloned.xiuwei = 0;
  assert.equal(bag.items[0].name, '新物');
  assert.equal(bag.xiuwei, 500);

  const cleared = clearXianguBag(player);
  assert.equal(cleared.sourceStone, 700);
  assert.equal(Object.hasOwn(player, 'xiangu_bag'), false);
  assert.deepEqual(player, permanentSnapshot);
});

test('唯一造化从战败者背包取出时保持数量守恒', () => {
  const bag = createXianguBag({
    items: [
      { name: '普通矿石', type: '材料', quantity: 2 },
      { name: '大罗剑胎', type: '武器', quantity: 2, unique: true, treasureKey: 'void:1,1' },
    ],
  });

  const first = takeXianguUniqueBagItem(bag);
  assert.deepEqual(first, {
    name: '大罗剑胎',
    type: '武器',
    quantity: 1,
    unique: true,
    treasureKey: 'void:1,1',
  });
  assert.equal(bag.items.find(item => item.name === '大罗剑胎').quantity, 1);

  assert.equal(takeXianguUniqueBagItem(bag).name, '大罗剑胎');
  assert.equal(bag.items.some(item => item.name === '大罗剑胎'), false);
  assert.equal(takeXianguUniqueBagItem(bag), null);
  assert.equal(bag.items.find(item => item.name === '普通矿石').quantity, 2);
});
