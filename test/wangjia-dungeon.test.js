import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { findItemSources } from '../model/itemSourceFinder.js';

const read = file => JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));

test('王家古地作为普通九天十地副本提供完整的平乱诀获取闭环', () => {
  const dungeons = read('resources/data/item/副本/九天十地.json');
  const materials = read('resources/data/item/材料列表.json');
  const recipes = read('resources/data/item/合成列表.json');
  const monsters = read('resources/data/item/怪物/王家古地怪物列表.json');
  const coordinates = read('resources/data/位面坐标.json');
  const dungeon = dungeons.find(item => item.name === '王家古地·平乱剑界');

  assert.ok(dungeon);
  assert.deepEqual(dungeon.one.map(item => item.name), ['神魂结晶', '天晶剑芒']);
  assert.deepEqual(dungeon.two.map(item => item.name), ['剑谷剑意碎片', '古剑残躯']);
  assert.deepEqual(dungeon.three.map(item => item.name), ['平乱诀残页']);
  assert.ok(materials.some(item => item.name === '平乱诀残页'));
  assert.deepEqual(
    recipes.find(item => item.name === '平乱诀')?.materials,
    [{ name: '平乱诀残页', class: '材料', amount: 10 }]
  );
  assert.ok(
    findItemSources({ jiutianshidi_list: dungeons }, '平乱诀残页')
      .includes('九天十地·王家古地·平乱剑界')
  );
  assert.deepEqual(monsters.map(item => item.名号), ['王家剑侍', '元神剑傀', '平乱剑灵']);
  assert.ok(
    coordinates['九天十地'].locations.some(item => item.name === '王家古地·平乱剑界')
  );
});
