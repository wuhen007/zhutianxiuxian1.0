import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ENDLESS_SHOP,
  ENDLESS_TOKEN,
  FUSION_ITEM,
  findEndlessProduct,
  formatTreasureClue,
  mergeSetEquipment,
} from '../model/endlessShop.js';

const itemDir = fileURLToPath(new URL('../resources/data/item/', import.meta.url));
const shopData = JSON.parse(
  fs.readFileSync(
    fileURLToPath(new URL('../resources/data/无尽商店.json', import.meta.url)),
    'utf8'
  )
);

test('无尽商店商品可按编号和名称查找', () => {
  assert.equal(ENDLESS_TOKEN, '劫境道痕');
  assert.equal(ENDLESS_SHOP.length, shopData.products.length);
  assert.equal(
    new Set(ENDLESS_SHOP.map(item => item.id)).size,
    ENDLESS_SHOP.length
  );
  assert.equal(ENDLESS_SHOP[0].name, shopData.products[0].name);
  assert.equal(findEndlessProduct('1').name, '大衍悟道丹');
  assert.equal(findEndlessProduct(FUSION_ITEM).price, 8000);
  assert.equal(findEndlessProduct('造化本源').price, 3000);
});

test('无尽商店实体商品都存在于物品目录', () => {
  const catalogs = ['丹药列表.json', '炼丹师丹药.json', '道具列表.json', '盒子列表.json']
    .flatMap(file => JSON.parse(fs.readFileSync(`${itemDir}${file}`, 'utf8')));
  for (const product of ENDLESS_SHOP.filter(item => item.action === 'item')) {
    assert.ok(
      catalogs.some(item => item.name === product.name && item.class === product.itemClass),
      `${product.name}不存在于${product.itemClass}物品目录`
    );
  }
});

test('先天灵宝天机将新显化至宝的精确坐标交给购买者', () => {
  const now = 1_000_000;
  const manifested = {
    type: 'treasureAppear',
    treasure: { name: '混沌珠' },
    contest: { status: 'open', profile: { omen: '混沌气遮蔽星河。' } },
    plane: '遮天位面',
    location: '太初古矿',
    coordinate: { x: 227, y: 116 },
    expiresAt: now + 90 * 60000,
    timestamp: 2,
  };

  const clue = formatTreasureClue(manifested, now).join('\n');
  assert.match(clue, /天机锁定：混沌珠·万象之源/);
  assert.match(clue, /出世之地：遮天位面·太初古矿（坐标 227,116）/);
  assert.match(clue, /现世余时：1小时30分钟/);
  assert.match(clue, /#前往227,116/);
});

test('万象归一消耗材料并保留套装数值和百分比属性', () => {
  const equipment = {
    武器: { name: '灭仙剑', type: '武器', atk: 1000, def: 200, HP: 300, bao: 0.2 },
    护具: {},
    法宝: {},
  };
  const najie = {
    装备: [{ name: '诸天剑影', type: '武器', atk: 0.5, def: 0.2, HP: 1, bao: 0.1, 数量: 1 }],
    道具: [{ name: FUSION_ITEM, 数量: 1 }],
  };
  const result = mergeSetEquipment(equipment, najie, '武器', '诸天剑影');
  assert.equal(result.equipment.武器.name, '灭仙剑');
  assert.deepEqual(result.equipment.武器.归一属性.百分比, {
    atk: 0.5,
    def: 0.2,
    HP: 1,
  });
  assert.ok(Math.abs(result.equipment.武器.bao - 0.3) < 1e-12);
  assert.equal(result.najie.装备.length, 0);
  assert.equal(result.najie.道具.length, 0);
});
