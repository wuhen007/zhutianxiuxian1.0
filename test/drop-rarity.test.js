import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => JSON.parse(fs.readFileSync(new URL(`../resources/data/item/${file}`, import.meta.url), 'utf8'));
const assertRarity = (items, file) => {
  for (const item of items) {
    assert.ok(Number.isInteger(item.稀有度), `${file}/${item.name} 缺少稀有度`);
    assert.ok(item.稀有度 >= 1 && item.稀有度 <= 10, `${file}/${item.name} 稀有度越界`);
  }
};

test('掉落和活动奖励池均使用1到10级稀有度', () => {
  for (const file of ['常驻.json', '限定.json', '仙宠探索列表.json', '团本奖励列表.json', '每日抽奖列表.json', '黑暗动乱帝战奖励.json', '机缘列表.json', '兑换列表.json']) {
    assertRarity(read(file), file);
  }
});

test('奖励池同名物品沿用主目录稀有度', () => {
  const props = new Map(read('道具列表.json').map(item => [item.name, item.稀有度]));
  const pills = new Map([...read('丹药列表.json'), ...read('炼丹师丹药.json')].map(item => [item.name, item.稀有度]));
  const resident = read('常驻.json');
  assert.equal(resident.find(item => item.name === '神石')?.稀有度, props.get('神石'));
  assert.equal(resident.find(item => item.name === '一梦成帝')?.稀有度, pills.get('一梦成帝'));
  assert.equal(read('每日抽奖列表.json').find(item => item.name === '4级仙石')?.稀有度, props.get('4级仙石'));
});
