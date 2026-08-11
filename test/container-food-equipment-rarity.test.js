import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const readJson = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const rarityIsValid = item => Number.isInteger(item.稀有度) && item.稀有度 >= 1 && item.稀有度 <= 10;
const boxes = readJson('../resources/data/item/盒子列表.json');
const feeds = [
  ...readJson('../resources/data/item/仙宠口粮列表.json'),
  ...readJson('../resources/data/item/高级仙宠口粮列表.json'),
];
const foods = readJson('../resources/data/item/食材列表.json');
const equipmentCatalogs = [
  readJson('../resources/data/item/装备列表.json'),
  readJson('../resources/data/item/特殊装备列表.json'),
  readJson('../resources/data/Timelimit/限定装备.json'),
  readJson('../resources/data/item/帝兵列表.json'),
  readJson('../resources/data/item/锻造武器.json'),
  readJson('../resources/data/item/锻造护具.json'),
  readJson('../resources/data/item/锻造宝物.json'),
  readJson('../resources/data/item/锻造杂类.json'),
];

test('盒子、仙宠口粮和食材均使用1到10级稀有度', () => {
  for (const item of [...boxes, ...feeds, ...foods]) {
    assert.ok(rarityIsValid(item), `${item.name}的稀有度应为1到10的整数`);
  }

  const boxRarity = new Map(boxes.map(item => [item.name, item.稀有度]));
  assert.deepEqual(
    ['食材盒','低阶仙宠盒子','泰拉魔盒','功法盒','中阶仙宠盒子','神迹之礼','元素武器盒','白泽恩赐','超越宝盒','邪神之盒'].map(name => boxRarity.get(name)),
    [1,2,3,4,5,6,7,8,9,10]
  );
  assert.deepEqual(feeds.map(item => item.稀有度), [1,2,3,4,5,6,7]);
});

test('所有静态装备目录均使用1到10级稀有度且同名一致', () => {
  const rarityByName = new Map();
  for (const item of equipmentCatalogs.flat()) {
    assert.ok(rarityIsValid(item), `${item.name}的稀有度应为1到10的整数`);
    if (rarityByName.has(item.name)) {
      assert.equal(item.稀有度, rarityByName.get(item.name), `${item.name}存在不同稀有度`);
    }
    rarityByName.set(item.name, item.稀有度);
  }

  assert.deepEqual(
    ['木剑','石剑','铁剑','金剑','钻石剑','打神石','【破碎】虚空镜','九幽魔琴','万灵天图','天顶剑'].map(name => rarityByName.get(name)),
    [1,2,3,4,5,6,7,8,9,10]
  );
});

test('锻造变体继承基础装备稀有度', () => {
  const base = new Map(equipmentCatalogs.slice(4, 7).flat().map(item => [item.name, item.稀有度]));
  const variants = equipmentCatalogs[7];
  for (const item of variants.filter(item => item.name.includes('·'))) {
    assert.equal(item.稀有度, base.get(item.name.split('·')[0]), `${item.name}未继承基础档位`);
  }
});

test('新锻造和赋名装备会保留1到10级稀有度', () => {
  const source = fs.readFileSync(new URL('../apps/duanzao/duanzao.js', import.meta.url), 'utf8');
  assert.match(source, /稀有度:\s*Math\.max\(1, Math\.min\(10, Number\(newwupin\[new1\]\.稀有度\) \|\| 1\)\)/);
  assert.match(source, /const namedRarity = Math\.max\(1, Math\.min\(10, Number\(item\.稀有度\) \|\| 2\)\)/);
});
