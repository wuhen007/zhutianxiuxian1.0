import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  findSectWarProduct,
  SECT_WAR_SHOP,
  SECT_WAR_TOKEN,
} from '../model/sectWarShop.js';

const readJson = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const props = readJson('../resources/data/item/道具列表.json');
const recipes = readJson('../resources/data/item/合成列表.json');
const furnaces = readJson('../resources/data/item/炼器炉.json');
const fires = readJson('../resources/data/item/炼器火.json');
const forgeSource = fs.readFileSync(
  new URL('../apps/duanzao/duanzao.js', import.meta.url),
  'utf8'
);

test('圣地战功商店提供永久火种、锻炉与时光令配方', () => {
  assert.equal(SECT_WAR_TOKEN, '圣地战功');
  assert.equal(new Set(SECT_WAR_SHOP.map(item => item.id)).size, SECT_WAR_SHOP.length);
  assert.equal(findSectWarProduct('道 火').price, 400);
  assert.equal(findSectWarProduct('混沌炉').price, 600);
  assert.equal(findSectWarProduct('9').name, '时光令配方');
  for (const product of SECT_WAR_SHOP) {
    assert.ok(
      props.some(item => item.name === product.name && item.class === product.itemClass),
      `${product.name}未登记到道具列表`
    );
    assert.equal(product.unique, true);
  }
});

test('锻炉与火种完全解耦且都有对应永久道具', () => {
  assert.ok(furnaces.every(furnace => !furnace.自带火));
  for (const furnace of furnaces.filter(item => item.name !== '凡铁炉')) {
    assert.ok(props.some(item => item.name === furnace.name && item.type === '炼器锻炉'));
  }
  for (const fire of fires.filter(item => item.name !== '凡火')) {
    assert.ok(props.some(item => item.name === fire.name && item.type === '炼器火种'));
  }
  assert.match(forgeSource, /炼制中不能更换锻炉/);
  assert.match(forgeSource, /炼制中不能更换炉火/);
});

test('时光令只能在参悟配方后用既有材料合成', () => {
  const recipe = recipes.find(item => item.name === '时光令');
  assert.equal(recipe.传承要求, '时光令配方');
  assert.deepEqual(recipe.materials, [
    { name: '光阴石', class: '道具', amount: 2 },
    { name: '世界石', class: '材料', amount: 1 },
    { name: '天外清风', class: '材料', amount: 1 },
    { name: '符纸', class: '道具', amount: 10 },
  ]);
  assert.match(forgeSource, /#参悟时光令配方/);
  assert.doesNotMatch(forgeSource, /xishu = 1\.1/);
});
