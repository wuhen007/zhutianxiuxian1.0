import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mergeNajieContents,
  prepareIndependentDropItem,
} from '../model/najieMerge.js';

function emptyNajie(extra = {}) {
  return {
    等级: 3,
    灵石上限: 50000,
    灵石: 0,
    源石: 0,
    装备: [],
    丹药: [],
    道具: [],
    功法: [],
    草药: [],
    材料: [],
    食材: [],
    盒子: [],
    仙宠: [],
    仙宠口粮: [],
    宝石: [],
    ...extra,
  };
}

test('遗落纳戒内容合并后保留领取者的纳戒等级与原有物品', () => {
  const current = emptyNajie({
    灵石: 1200,
    源石: 3,
    丹药: [{ name: '九阶玄元丹', 数量: 2, islockd: 1 }],
    道具: [{ name: '秘境之匙', 数量: 1 }],
  });
  const dropped = emptyNajie({
    等级: 1,
    灵石上限: 5000,
    灵石: 800,
    源石: 4,
    丹药: [{ name: '九阶玄元丹', 数量: 5, islockd: 0 }],
    材料: [{ name: '轮回印', 数量: 2 }],
  });

  const merged = mergeNajieContents(current, dropped);

  assert.equal(merged.等级, 3);
  assert.equal(merged.灵石上限, 50000);
  assert.equal(merged.灵石, 2000);
  assert.equal(merged.源石, 7);
  assert.equal(merged.丹药.length, 1);
  assert.equal(merged.丹药[0].数量, 7);
  assert.equal(merged.丹药[0].islockd, 1);
  assert.deepEqual(merged.道具, current.道具);
  assert.deepEqual(merged.材料, dropped.材料);
});

test('装备、仙宠和宝石保持独立实例', () => {
  const current = emptyNajie({
    装备: [{ name: '神塔', pinji: 1, atk: 100, 数量: 1 }],
    仙宠: [{ name: '真龙', 等级: 3, 数量: 1 }],
    宝石: [{ name: '攻击宝石', 等级: 1, 数量: 2 }],
  });
  const dropped = emptyNajie({
    装备: [{ name: '神塔', pinji: 1, atk: 999, 数量: 1 }],
    仙宠: [{ name: '真龙', 等级: 8, 数量: 1 }],
    宝石: [{ name: '攻击宝石', 等级: 5, 数量: 4 }],
  });

  const merged = mergeNajieContents(current, dropped);

  assert.equal(merged.装备.length, 2);
  assert.equal(merged.装备[0].atk, 100);
  assert.equal(merged.装备[1].atk, 999);
  assert.equal(merged.仙宠.length, 2);
  assert.equal(merged.宝石.length, 2);
});

test('合并过程不会修改原纳戒或遗落纳戒对象', () => {
  const current = emptyNajie({ 丹药: [{ name: '悟道丹', 数量: 2 }] });
  const dropped = emptyNajie({ 丹药: [{ name: '悟道丹', 数量: 3 }] });
  const currentSnapshot = structuredClone(current);
  const droppedSnapshot = structuredClone(dropped);

  mergeNajieContents(current, dropped);

  assert.deepEqual(current, currentSnapshot);
  assert.deepEqual(dropped, droppedSnapshot);
});

test('穿戴装备和仙宠转为遗物时统一补成单件未锁定物品', () => {
  const equipment = { name: '太古神剑', atk: 999, 数量: 7, islockd: 1 };
  const pet = { name: '真龙', 等级: 8 };

  assert.deepEqual(prepareIndependentDropItem(equipment, { 部位: '武器' }), {
    name: '太古神剑',
    atk: 999,
    部位: '武器',
    数量: 1,
    islockd: 0,
  });
  assert.deepEqual(prepareIndependentDropItem(pet), {
    name: '真龙',
    等级: 8,
    数量: 1,
    islockd: 0,
  });
});
