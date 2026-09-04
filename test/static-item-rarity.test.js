import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const itemDir = path.join(root, 'resources/data/item');
const categories = new Set(['道具', '丹药', '草药', '功法', '材料', '食材', '仙宠', '装备', '盒子', '仙宠口粮', '宝石']);
const aliases = new Map([['武器', '装备'], ['护具', '装备'], ['法宝', '装备'], ['锻造', '材料'], ['炼器', '材料'], ['练气玄影', '道具'], ['纳戒玄影', '道具']]);
const excluded = new Set([path.join(itemDir, '正在拍卖.json'), path.join(itemDir, '小世界列表.json'), path.join(itemDir, '玩家自创帝经.json')]);
const roots = ['resources/data/Exchange', 'resources/data/Timelimit', 'resources/data/item', 'resources/data/occupation', 'resources/data/shop'].map(dir => path.join(root, dir));

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const target = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(target) : entry.name.endsWith('.json') ? [target] : [];
});
const visit = (value, file) => {
  if (Array.isArray(value)) return value.forEach(item => visit(item, file));
  if (!value || typeof value !== 'object') return;
  const category = aliases.get(value.class) || value.class;
  const lightweightReference = (Object.hasOwn(value, 'amount') || Object.hasOwn(value, '数量')) && !Object.hasOwn(value, 'type');
  if (typeof value.name === 'string' && categories.has(category) && !lightweightReference) {
    assert.ok(Number.isInteger(value.稀有度), `${file}/${value.name} 缺少稀有度`);
    assert.ok(value.稀有度 >= 1 && value.稀有度 <= 10, `${file}/${value.name} 稀有度越界`);
  }
  Object.values(value).forEach(nested => visit(nested, file));
};
const find = (value, name) => {
  if (Array.isArray(value)) {
    for (const item of value) { const result = find(item, name); if (result) return result; }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  if (value.name === name) return value;
  for (const nested of Object.values(value)) { const result = find(nested, name); if (result) return result; }
};
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

test('所有静态副本、商店、配方和限时目录中的物品均使用1到10级稀有度', () => {
  for (const file of roots.flatMap(walk).filter(file => !excluded.has(file))) visit(JSON.parse(fs.readFileSync(file, 'utf8')), path.relative(root, file));
});

test('静态嵌套物品继承对应主目录稀有度', () => {
  const props = new Map(read('resources/data/item/道具列表.json').map(item => [item.name, item.稀有度]));
  const manuals = new Map(read('resources/data/item/功法列表.json').map(item => [item.name, item.稀有度]));
  const pills = new Map(read('resources/data/item/丹药列表.json').map(item => [item.name, item.稀有度]));
  assert.equal(find(read('resources/data/item/盒子列表.json'), '神盾果').稀有度, props.get('神盾果'));
  assert.equal(find(read('resources/data/item/副本/界海列表.json'), '原始真解终极篇').稀有度, manuals.get('原始真解终极篇'));
  assert.equal(find(read('resources/data/item/商店/商品列表.json'), '还春丹').稀有度, pills.get('还春丹'));
});
