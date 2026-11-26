import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const catalogs = [
  '../resources/data/item/丹药列表.json',
  '../resources/data/item/炼丹师丹药.json',
  '../resources/data/Timelimit/限定丹药.json',
].flatMap(file => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8')));

test('所有丹药均使用1到10级稀有度且同名丹药保持一致', () => {
  const rarityByName = new Map();
  for (const item of catalogs) {
    assert.ok(
      Number.isInteger(item.稀有度) && item.稀有度 >= 1 && item.稀有度 <= 10,
      `${item.name}的稀有度应为1到10的整数`
    );
    if (rarityByName.has(item.name)) {
      assert.equal(item.稀有度, rarityByName.get(item.name), `${item.name}存在不同稀有度`);
    }
    rarityByName.set(item.name, item.稀有度);
  }
});
