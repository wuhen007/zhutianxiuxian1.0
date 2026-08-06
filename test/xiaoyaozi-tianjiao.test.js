import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

function readItemData(file) {
  return JSON.parse(fs.readFileSync(new URL(`../resources/data/item/${file}`, import.meta.url), 'utf8'));
}

test('仙界天骄逍遥子的设定、掉落与传承完整可用', () => {
  const bosses = readItemData('位面boss列表.json');
  const pills = readItemData('丹药列表.json');
  const materials = readItemData('材料列表.json');
  const props = readItemData('道具列表.json');
  const equipment = readItemData('特殊装备列表.json');
  const techniques = readItemData('功法列表.json');
  const recipes = readItemData('合成列表.json');

  const xiaoyaozi = bosses.find(item => item.名号 === '逍遥子');
  assert.equal(xiaoyaozi?.位面, 1);
  assert.equal(xiaoyaozi?.境界, '金仙境');
  assert.equal(xiaoyaozi?.身份, '无门无派，独行诸天');
  assert.equal(xiaoyaozi?.灵根?.name, '鲲鹏道胎');
  assert.equal(xiaoyaozi?.首次闪避, true);
  assert.deepEqual(
    xiaoyaozi?.专属技能?.map(item => item.name),
    ['扶摇九万里', '天地一蜉蝣', '梦蝶忘我', '鲲鹏裂天击', '我自逍遥'],
  );
  assert.equal(xiaoyaozi?.学习的功法?.includes('如梦令'), false);

  assert.deepEqual(
    xiaoyaozi?.掉落物?.map(item => [item.name, item.class, item.概率]),
    [
      ['逍遥仙袍', '装备', 0.08],
      ['扶摇羽', '材料', 0.35],
      ['鲲鹏道图', '功法', 0.10],
      ['梦蝶仙酿', '丹药', 0.30],
      ['天外清风', '材料', 0.20],
    ],
  );
  assert.deepEqual(
    xiaoyaozi?.特殊掉落?.map(item => [item.name, item.class, item.概率]),
    [['无拘仙印', '道具', 0.03]],
  );

  const wine = pills.find(item => item.name === '梦蝶仙酿');
  assert.equal(wine?.type, '神药');
  assert.equal(wine?.exp, 880000000);
  assert.equal(wine?.xueqi, 880000000);

  assert.ok(materials.some(item => item.name === '扶摇羽'));
  assert.ok(materials.some(item => item.name === '天外清风'));
  assert.equal(equipment.find(item => item.name === '逍遥仙袍')?.首次免控, 1);
  assert.deepEqual(
    techniques.find(item => item.name === '鲲鹏道图')?.属性加成,
    { 闪避率: 0.05, 暴击率: 0.05 },
  );
  assert.ok(techniques.some(item => item.name === '逍遥游'));
  assert.ok(props.some(item => item.name === '无拘仙印'));
  assert.ok(props.some(item => item.name === '星图'));

  const array = recipes.find(item => item.name === '大位面传送阵');
  assert.deepEqual(array?.materials, [
    { name: '位面传送阵', class: '道具', amount: 1 },
    { name: '扶摇羽', class: '材料', amount: 12 },
    { name: '天外清风', class: '材料', amount: 5 },
    { name: '星图', class: '道具', amount: 3 },
  ]);
});
