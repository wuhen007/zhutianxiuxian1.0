import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  CHAOS_PROTECTED_RARITY,
  getChaosItemRarity,
  getChaosItemRestriction,
} from '../model/innateTreasure.js';

test('混沌复制与演化保护特殊物品和稀有度7以上物品', () => {
  assert.match(getChaosItemRestriction({ name: '圣法碎片', 稀有度: 1 }), /唯一性/);
  assert.match(getChaosItemRestriction({
    name: '本命帝兵', type: '帝兵', author_name: '10001', 稀有度: 1,
  }), /炼制帝兵/);
  assert.match(getChaosItemRestriction({
    name: '归一神剑', type: '武器', atk: 1000, 归一属性: { 百分比: { atk: 0.1 } }, 稀有度: 1,
  }), /百分比装备/);
  assert.match(getChaosItemRestriction({
    name: '旧式百分比剑', type: '武器', atk: 1.5, def: 0.2, HP: 0.1, 稀有度: 1,
  }), /百分比装备/);
  assert.equal(getChaosItemRestriction({
    name: '带攻击字段的普通道具', class: '道具', atk: 2, 稀有度: 1,
  }), '');
  assert.equal(getChaosItemRestriction({ name: '普通材料', type: '锻造', 稀有度: 6 }), '');
  assert.match(getChaosItemRestriction({ name: '仙材', 稀有度: CHAOS_PROTECTED_RARITY }), /保护线7/);
});

test('混沌稀有度兼容旧物品品阶字段', () => {
  assert.equal(getChaosItemRarity({ type: '神级' }), 6);
  assert.equal(getChaosItemRarity({ 品级: '仙级' }), 7);
  assert.match(getChaosItemRestriction({ name: '旧仙材', 品级: '仙级' }), /保护线7/);
});

test('旧纳戒缺少稀有度时以标准物品目录为准', () => {
  const oldInventoryItem = { name: '极道丹', class: '丹药', 数量: 1 };
  const catalogItem = { name: '极道丹', class: '丹药', 稀有度: 10 };
  assert.equal(getChaosItemRarity(oldInventoryItem, catalogItem), 10);
  assert.match(getChaosItemRestriction(oldInventoryItem, catalogItem), /稀有度为10/);
});

test('复制和演化共用保护校验，演化池不会产出受保护材料', () => {
  const source = fs.readFileSync(
    new URL('../apps/User/InnateTreasureAuthorities.js', import.meta.url),
    'utf8'
  );
  assert.equal(source.match(/getChaosItemRestriction\(found\.item, catalogItem \|\| null\)/g)?.length, 2);
  assert.match(source, /nativePool\('材料'\)\.filter\(item => !getChaosItemRestriction\(item\)\)/);
  // 复制与演化各持玩家级双锁（嵌套 lockId 出现 2 次 × 2 个入口）
  assert.ok((source.match(/withPlayerMutationLock\(lockId/g) || []).length >= 2);
  assert.equal(source.match(/await persistChaosState\(ctx\.qq, najie, ctx\.player\)/g)?.length, 2);
  assert.match(source, /transaction\.rollback\(\)/);
});
