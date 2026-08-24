import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { getFlowerPollenSkill } from '../model/flowerPollenSkill.js';
import { createTianjiaoTrace } from '../model/tianjiaoGrowth.js';
import { rollTianjiaoDropAmount } from '../model/tianjiaoHostility.js';

function readItemData(file) {
  return JSON.parse(fs.readFileSync(new URL(`../resources/data/item/${file}`, import.meta.url), 'utf8'));
}

test('阳间天骄武疯子可讨伐且全部掉落均有物品定义', () => {
  const bosses = readItemData('位面boss列表.json');
  const props = readItemData('道具列表.json');
  const materials = readItemData('材料列表.json');
  const pills = readItemData('丹药列表.json');
  const techniques = readItemData('功法列表.json');
  const recipes = readItemData('合成列表.json');
  const fires = readItemData('炼器火.json');
  const revivals = readItemData('技能组/复活技能.json');
  const wufengzi = bosses.find(item => item.名号 === '武疯子');

  assert.equal(wufengzi?.位面, 7);
  assert.equal(wufengzi?.huafenlevel_id, 16);
  assert.equal(wufengzi?.境界, '混元境——大能');
  assert.equal(wufengzi?.灵根?.name, '疯魔武胎');
  assert.ok(wufengzi?.学习的功法?.includes('时间妙术'));
  assert.ok(wufengzi?.学习的功法?.includes('一身化七圣'));
  for (const name of wufengzi?.学习的功法 || []) {
    assert.ok(getFlowerPollenSkill(name), `战斗引擎缺少花粉路技能：${name}`);
  }
  const trace = createTianjiaoTrace(wufengzi, { now: 1_000_000, random: () => 0 });
  assert.equal(trace?.plane, '阳间');
  assert.ok(Number.isFinite(trace?.coordinate?.x));
  assert.ok(Number.isFinite(trace?.coordinate?.y));
  const catalogues = { 道具: props, 材料: materials, 丹药: pills, 功法: techniques };
  for (const drop of [...(wufengzi?.掉落物 || []), ...(wufengzi?.特殊掉落 || [])]) {
    if (drop.class === '遗珍') continue;
    assert.ok(catalogues[drop.class]?.some(item => item.name === drop.name), `缺少${drop.class}定义：${drop.name}`);
  }
  assert.deepEqual(wufengzi.掉落物.find(item => item.name === '时光轮碎片'), {
    name: '时光轮碎片', class: '材料', 数量: 1, 最大数量: 3, 概率: 0.35, 稀有度: 9,
  });
  assert.deepEqual(wufengzi.特殊掉落.map(item => item.name), ['时间妙术', '随机遗珍']);
  assert.ok(techniques.some(item => item.name === '时间妙术'));
  assert.ok(techniques.some(item => item.name === '七死身'));
  assert.ok(revivals.some(item => item.name === '七死身' && item.复活技能 === 1));
  assert.ok(fires.some(item => item.name === '大空火种' && item.缩短比例 === 0.72));
  assert.ok(recipes.some(item => item.name === '时间妙术' && item.materials?.[0]?.name === '时间妙术残页'));
  assert.ok(recipes.some(item => item.name === '七死身' && item.materials?.[0]?.name === '七死身残页'));
});

test('武疯子区间掉落可命中上下界并正确应用奖励倍率', () => {
  const drop = { 数量: 1, 最大数量: 3 };
  assert.equal(rollTianjiaoDropAmount(drop, 1, () => 0), 1);
  assert.equal(rollTianjiaoDropAmount(drop, 1, () => 0.999999), 3);
  assert.equal(rollTianjiaoDropAmount(drop, 2, () => 0.999999), 6);
});
