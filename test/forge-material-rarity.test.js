import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const readJson = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const forgeMaterials = readJson('../resources/data/item/锻造材料.json');
const materials = readJson('../resources/data/item/材料列表.json');

test('所有主锻造材料均使用1到10级稀有度', () => {
  for (const item of forgeMaterials) {
    assert.ok(
      Number.isInteger(item.稀有度) && item.稀有度 >= 1 && item.稀有度 <= 10,
      `${item.name}的稀有度应为1到10的整数`
    );
  }

  const rarity = new Map(forgeMaterials.map(item => [item.name, item.稀有度]));
  assert.deepEqual(
    ['庚金', '金色石胚', '玄铁', '金色妖石', '星银', '混沌石', '太阴真水', '太阳真火', '鸿蒙道火', '宇宙核心'].map(name => rarity.get(name)),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  );
});

test('帝兵锻材遵循10级上限', () => {
  const rarity = new Map(materials.map(item => [item.name, item.稀有度]));
  for (const name of ['仙泪绿金残块', '龙纹黑金残块', '神痕紫金残块']) {
    assert.equal(rarity.get(name), 7, `${name}应为7级`);
  }
  for (const name of ['大罗银精', '仙泪绿金', '凰血赤金', '龙纹黑金', '永恒蓝金', '神痕紫金', '道劫黄金', '羽化青金', '混沌石精']) {
    assert.equal(rarity.get(name), 9, `${name}应为9级`);
  }
  for (const name of ['九彩神金', '万物母气']) {
    assert.equal(rarity.get(name), 10, `${name}应为10级`);
  }
});
