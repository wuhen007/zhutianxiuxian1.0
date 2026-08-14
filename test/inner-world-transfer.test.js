import test from 'node:test';
import assert from 'node:assert/strict';
import {
  moveNamedItemStacks,
  requiresInnerWorldNaming,
} from '../model/innerWorldTransfer.js';

test('内景地存取同名多品级装备保持数量和实例属性守恒', () => {
  const najie = [
    { name: '试炼剑', type: '武器', pinji: 1, atk: 2, 数量: 2 },
    { name: '试炼剑', type: '武器', pinji: 5, atk: 3, 数量: 3 },
  ];
  const innerWorld = [];

  assert.equal(moveNamedItemStacks(najie, innerWorld, {
    name: '试炼剑', quantity: Infinity, toInnerWorld: true, now: 1,
  }).moved, 5);
  assert.equal(najie.length, 0);
  assert.deepEqual(innerWorld.map(item => [item.pinji, item.atk, item.数量]), [[1, 2, 2], [5, 3, 3]]);

  assert.equal(moveNamedItemStacks(innerWorld, najie, {
    name: '试炼剑', quantity: Infinity,
  }).moved, 5);
  assert.equal(innerWorld.length, 0);
  assert.deepEqual(najie.map(item => [item.pinji, item.atk, item.数量]), [[1, 2, 2], [5, 3, 3]]);
});

test('只有当前玩家自己炼制且未赋名的百分比装备会被拦截', () => {
  const crafted = { type: '武器', atk: 2, author_name: '10001' };
  assert.equal(requiresInnerWorldNaming(crafted, '10001'), true);
  assert.equal(requiresInnerWorldNaming({ ...crafted, owner_name: '10001' }, '10001'), false);
  assert.equal(requiresInnerWorldNaming({ type: '武器', atk: 2 }, '10001'), false);
  assert.equal(requiresInnerWorldNaming({ ...crafted, author_name: '副本天骄' }, '10001'), false);
});

test('同名自炼和副本百分比装备并存时只存入副本掉落', () => {
  const najie = [
    { name: '无名剑', type: '武器', atk: 2, author_name: '10001', 数量: 1 },
    { name: '无名剑', type: '武器', atk: 2, 掉落来源: '副本', 数量: 1 },
  ];
  const innerWorld = [];

  const result = moveNamedItemStacks(najie, innerWorld, {
    name: '无名剑',
    quantity: Infinity,
    toInnerWorld: true,
    filter: item => !requiresInnerWorldNaming(item, '10001'),
  });

  assert.equal(result.moved, 1);
  assert.equal(najie[0].author_name, '10001');
  assert.equal(innerWorld[0].掉落来源, '副本');
});
