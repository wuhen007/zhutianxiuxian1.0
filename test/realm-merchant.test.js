import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  BLACK_MARKET_MAX_PRICE,
  WHITE_BEARD_MAX_PRICE,
  WHITE_BEARD_MIN_POWER,
  WHITE_BEARD_MIN_PRICE,
  calculateWhiteBeardPrice,
  createBlackMarketStock,
  createWhiteBeardStock,
} from '../model/realmMerchant.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readItems(file) {
  return JSON.parse(fs.readFileSync(path.join(root, 'resources/data/item', file), 'utf8'));
}

function seededRandom(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

test('白须仙翁每次至少出售武器、护具和法宝各一件', () => {
  const materials = readItems('锻造材料.json');
  const materialMap = new Map(materials.map(item => [item.name, item]));
  for (let seed = 1; seed <= 100; seed++) {
    const stock = createWhiteBeardStock({
      weaponTemplates: readItems('锻造武器.json'),
      armorTemplates: readItems('锻造护具.json'),
      treasureTemplates: readItems('锻造宝物.json'),
      materials,
      random: seededRandom(seed),
      serial: 123456789,
    });

    assert.ok(stock.length >= 3 && stock.length <= 5);
    assert.deepEqual(new Set(stock.slice(0, 3).map(item => item.type)), new Set(['武器', '护具', '法宝']));
    assert.equal(new Set(stock.map(item => item.suffix)).size, stock.length);
    for (const item of stock) {
      assert.ok(item.power >= WHITE_BEARD_MIN_POWER);
      assert.ok(item.price >= WHITE_BEARD_MIN_PRICE && item.price <= WHITE_BEARD_MAX_PRICE);
      assert.ok(item.recipe.length > 0);
      assert.match(item.equipment.name, /\d+$/);
      assert.equal(item.equipment.来源, '白须仙翁');

      const elementTotals = Object.fromEntries(['金', '木', '土', '水', '火'].map(element => [element, 0]));
      for (const entry of item.recipe) {
        const material = materialMap.get(entry.name);
        for (const element of Object.keys(elementTotals)) {
          elementTotals[element] += (Number(material[element]) || 0) * entry.count;
        }
      }
      const activeCount = Object.values(elementTotals).filter(Boolean).length;
      if (item.suffix === '终极至宝') assert.equal(activeCount, 0);
      else if (item.suffix === '五行杂灵') assert.equal(activeCount, 5);
      else if (item.suffix === '四圣显化') assert.equal(activeCount, 4);
      else if (item.suffix === '三灵共堂') assert.equal(activeCount, 3);
      else if (item.suffix.startsWith('纯')) assert.equal(activeCount, 1);
      else {
        assert.equal(activeCount, 2);
        const main = item.suffix[1];
        assert.equal(elementTotals[main], Math.max(...Object.values(elementTotals)));
      }
    }
  }
});

test('白须仙翁定价始终低于一万亿源石', () => {
  assert.equal(calculateWhiteBeardPrice(450, 0, 1), 112_350_000_000);
  assert.equal(calculateWhiteBeardPrice(1_000_000, 1e15, 2), WHITE_BEARD_MAX_PRICE);
  assert.ok(WHITE_BEARD_MAX_PRICE < 1_000_000_000_000);
});

test('黑衣神秘人出售五至七件现有物品且绝不出现天命轮回丹', () => {
  const pills = readItems('丹药列表.json');
  const props = readItems('道具列表.json');
  for (let seed = 1; seed <= 100; seed++) {
    const stock = createBlackMarketStock({ pills, props, random: seededRandom(seed) });
    assert.ok(stock.length >= 5 && stock.length <= 7);
    assert.equal(new Set(stock.map(item => item.displayName)).size, stock.length);
    assert.ok(stock.filter(item => item.category === '丹药神药').length >= 2);
    assert.ok(stock.some(item => item.category === '诸天奇物'));
    assert.ok(stock.every(item => item.price > 0 && item.price <= BLACK_MARKET_MAX_PRICE));
    assert.ok(stock.every(item => ['丹药', '道具', '材料'].includes(item.item.class)));
    assert.ok(stock.every(item => item.displayName !== '天命轮回丹'));
  }
});
