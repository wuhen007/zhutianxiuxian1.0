import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const readJson = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const petCatalogs = [
  '../resources/data/item/仙宠列表.json',
  '../resources/data/item/常驻仙宠.json',
  '../resources/data/item/突破仙宠.json',
].map(readJson);
const materials = readJson('../resources/data/item/材料列表.json');
const rarityIsValid = item => Number.isInteger(item.稀有度) && item.稀有度 >= 1 && item.稀有度 <= 10;

test('仙宠三份目录均使用一致的1到10级稀有度', () => {
  const rarityByName = new Map();
  for (const pet of petCatalogs.flat()) {
    assert.ok(rarityIsValid(pet), `${pet.name}的稀有度应为1到10的整数`);
    if (rarityByName.has(pet.name)) {
      assert.equal(pet.稀有度, rarityByName.get(pet.name), `${pet.name}存在不同稀有度`);
    }
    rarityByName.set(pet.name, pet.稀有度);
  }

  assert.deepEqual(new Set(petCatalogs[0].map(item => item.稀有度)), new Set([1,2,3,4,5,6,7,8,9,10]));
  assert.deepEqual(
    ['赤瞳灵狐','初级冉遗鱼','金雏','高级冉遗鱼','冉遗鱼真身','小九九','小岁岁','神凰','青龙','不死神蚕'].map(name => rarityByName.get(name)),
    [1,2,3,4,5,6,7,8,9,10]
  );
});

test('所有普通材料均使用1到10级稀有度且同名一致', () => {
  const rarityByName = new Map();
  for (const item of materials) {
    assert.ok(rarityIsValid(item), `${item.name}的稀有度应为1到10的整数`);
    if (rarityByName.has(item.name)) {
      assert.equal(item.稀有度, rarityByName.get(item.name), `${item.name}存在不同稀有度`);
    }
    rarityByName.set(item.name, item.稀有度);
  }

  assert.deepEqual(new Set(materials.map(item => item.稀有度)), new Set([1,2,3,4,5,6,7,8,9,10]));
  assert.deepEqual(
    ['泥土','红宝石','北陆弓原胚','狻猊宝术残篇','世界石','羽化仙经残页','天外清风','旧神印章','仙泪绿金','雷帝宝术残篇'].map(name => rarityByName.get(name)),
    [1,2,3,4,5,6,7,8,9,10]
  );
});

test('玩家自创仙宠按加成映射到10级上限', () => {
  const source = fs.readFileSync(new URL('../apps/User/zhengdaotixi.js', import.meta.url), 'utf8');
  assert.match(source, /稀有度:\s*Math\.max\(1, Math\.min\(10, Math\.ceil\(bonus \/ 0\.015\)\)\)/);
});
