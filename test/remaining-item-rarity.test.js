import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => JSON.parse(fs.readFileSync(new URL(`../resources/data/item/${name}`, import.meta.url), 'utf8'));
const byName = (items, name) => items.find(item => item.name === name);
const assertRarity = (items, name) => {
  for (const item of items) {
    assert.ok(Number.isInteger(item.稀有度), `${name}/${item.name} 缺少整数稀有度`);
    assert.ok(item.稀有度 >= 1 && item.稀有度 <= 10, `${name}/${item.name} 稀有度越界`);
  }
};

test('剩余可持有物品主目录均使用1到10级稀有度', () => {
  for (const name of [
    '道具列表.json', '草药列表.json', '功法列表.json', '八品.json',
    '灵根列表.json', '隐藏灵根.json', '宝石.json', '炼器火.json',
    '炼器炉.json', '强化列表.json',
  ]) assertRarity(read(name), name);
});

test('道具、草药、功法和灵根的代表性成长阶梯递增', () => {
  const props = read('道具列表.json');
  assert.deepEqual(['普通道种', '稀有道种', '传说道种', '神话道种'].map(type => props.find(item => item.type === type).稀有度), [2, 4, 6, 8]);
  assert.deepEqual(['凡品秘境结算卡', '灵品秘境结算卡', '仙品秘境结算卡', '帝品秘境结算卡'].map(name => byName(props, name).稀有度), [3, 5, 7, 10]);
  assert.equal(byName(read('草药列表.json'), '万劫轮回莲').稀有度, 10);
  assert.ok(byName(read('功法列表.json'), '者字秘').稀有度 < byName(read('功法列表.json'), '【仙帝】他化自在法').稀有度);
  assert.deepEqual(['一转轮回体', '五转轮回体', '九转轮回体'].map(name => byName(read('灵根列表.json'), name).稀有度), [2, 6, 10]);
});

test('炉火成长序列和同名强化物保持一致', () => {
  assert.deepEqual(read('炼器火.json').map(item => item.稀有度), [1, 3, 5, 7, 9, 10]);
  assert.deepEqual(read('炼器炉.json').map(item => item.稀有度), [1, 3, 5, 7, 9, 10]);
  const props = new Map(read('道具列表.json').map(item => [item.name, item.稀有度]));
  for (const item of read('强化列表.json')) assert.equal(item.稀有度, props.get(item.name), item.name);
});
