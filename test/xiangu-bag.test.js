import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  convertXianguEvacuationItems,
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

test('旧秘境奖励会按新目录名称和分类归一后结算', () => {
  const bag = createXianguBag({
    items: [
      { name: '柳神法残篇', type: '功法', quantity: 1 },
      { name: '补天术残篇', type: '功法', quantity: 1 },
      { name: '真龙宝术', type: '材料', quantity: 1 },
      { name: '六道轮回天功', type: '材料', quantity: 1 },
      { name: '真龙精血', type: '材料', quantity: 1 },
      { name: '龙鳞', type: '材料', quantity: 1 },
      { name: '雷池液', type: '材料', quantity: 1 },
      { name: '仙古遗种蛋', type: '宠物', quantity: 1 },
    ],
  });
  const najie = { 材料: [], 功法: [], 丹药: [], 道具: [] };

  claimXianguBagItems(najie, bag, 'xiangu:migration-test');

  assert.deepEqual(najie.材料.map(item => item.name).sort(), ['柳神法残篇', '补天术残篇']);
  assert.deepEqual(najie.功法.map(item => item.name).sort(), ['六道轮回天功', '真龙宝术']);
  assert.deepEqual(najie.丹药.map(item => item.name), ['真龙精血']);
  assert.deepEqual(najie.道具.map(item => item.name).sort(), ['仙古遗种蛋', '真龙龙鳞', '雷池液']);
});

test('撤离时残兵熔成庚金玄土，基础战利品按每件一百万兑换双货币', () => {
  const result = convertXianguEvacuationItems([
    { name: '残破战戟', type: '材料', quantity: 2 },
    { name: '仙古符骨', type: '材料', quantity: 1 },
    { name: '普通道种碎片', type: '材料', quantity: 3 },
    { name: '远古符纸', type: '材料', quantity: 2 },
    { name: '真凰精血', type: '材料', quantity: 1 },
  ]);

  assert.equal(result.refinedCount, 3);
  assert.equal(result.currencyItemCount, 5);
  assert.equal(result.sourceStone, 5_000_000);
  assert.equal(result.lingshi, 5_000_000);
  assert.deepEqual(result.items, [
    {
      name: '庚金玄土',
      type: '材料',
      quantity: 3,
      desc: '以仙古战场残兵碎片熔炼出的庚金玄土，可用于锻造与祭炼。',
    },
    { class: '丹药', name: '真凰精血', type: '丹药', quantity: 1 },
  ]);
});

test('大罗剑胎按装备武器落入纳戒并保留完整属性', () => {
  const bag = createXianguBag({
    items: [{ name: '大罗剑胎', type: '绝世机缘', quantity: 1, unique: true }],
  });
  const najie = { 材料: [], 装备: [] };

  claimXianguBagItems(najie, bag, 'xiangu:daluo-test');

  assert.equal(najie.装备.length, 1);
  assert.equal(najie.装备[0].type, '武器');
  assert.equal(najie.装备[0].atk, 3_000_000_000);
  assert.equal(najie.装备[0].def, 3_000_000_000);
  assert.equal(najie.装备[0].HP, 3_000_000_000);
  assert.equal(najie.装备[0].bao, 0.2);
  assert.equal(najie.装备[0].至尊体全属性倍率, 15);
  assert.equal(najie.装备[0].其他灵根全属性倍率, 7.5);
});

test('原著天骄掉落均已进入可消费的全局物品目录', () => {
  const load = name => JSON.parse(fs.readFileSync(
    new URL(`../resources/data/item/${name}`, import.meta.url),
    'utf8',
  ));
  const materials = new Map(load('材料列表.json').map(item => [item.name, item]));
  const pills = new Map(load('丹药列表.json').map(item => [item.name, item]));
  const props = new Map(load('道具列表.json').map(item => [item.name, item]));
  const equipment = new Map(load('装备列表.json').map(item => [item.name, item]));

  for (const name of [
    '庚金玄土', '天子印碎片', '天角蚁宝术残卷', '凶巢阵纹碎片',
    '轮回印记', '六道轮回残卷', '神魂结晶', '剑谷剑意碎片',
    '天晶剑芒', '古剑残躯', '仙殿秘术残页', '人仙印碎片',
  ]) {
    assert.equal(materials.get(name)?.class, '材料', `${name}应进入材料目录`);
  }
  for (const name of ['真龙精血', '真凰精血', '不死鸟精血', '涅槃精血']) {
    assert.equal(pills.get(name)?.class, '丹药', `${name}应进入丹药目录`);
    assert.ok(Number(pills.get(name)?.exp) > 0 && Number(pills.get(name)?.xueqi) > 0);
  }
  for (const name of ['帝血', '玉石匣', '世界树残叶', '真凰翎羽', '凤凰泪']) {
    assert.equal(props.get(name)?.class, '道具', `${name}应进入道具目录`);
  }
  assert.equal(equipment.get('大罗剑胎')?.type, '武器');
  assert.equal(equipment.get('大罗剑胎')?.atk, 3_000_000_000);
  assert.equal(equipment.get('大罗剑胎')?.bao, 0.2);
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
  assert.equal(first.name, '大罗剑胎');
  assert.equal(first.type, '武器');
  assert.equal(first.class, '装备');
  assert.equal(first.quantity, 1);
  assert.equal(first.unique, true);
  assert.equal(first.treasureKey, 'void:1,1');
  assert.equal(first.atk, 3_000_000_000);
  assert.equal(first.def, 3_000_000_000);
  assert.equal(first.HP, 3_000_000_000);
  assert.equal(bag.items.find(item => item.name === '大罗剑胎').quantity, 1);

  assert.equal(takeXianguUniqueBagItem(bag).name, '大罗剑胎');
  assert.equal(bag.items.some(item => item.name === '大罗剑胎'), false);
  assert.equal(takeXianguUniqueBagItem(bag), null);
  assert.equal(bag.items.find(item => item.name === '普通矿石').quantity, 2);
});
