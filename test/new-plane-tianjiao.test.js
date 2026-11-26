import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

function readItemData(file) {
  return JSON.parse(fs.readFileSync(new URL(`../resources/data/item/${file}`, import.meta.url), 'utf8'));
}

test('谪仙、六冠王宁川、伊轻舞与元古均已实装为可讨伐天骄', () => {
  const bosses = readItemData('位面boss列表.json');
  const attacks = readItemData('技能组/攻击技能.json');
  const defenses = readItemData('技能组/防御技能.json');
  const catalogues = {
    道具: readItemData('道具列表.json'),
    材料: readItemData('材料列表.json'),
    功法: readItemData('功法列表.json'),
    装备: [...readItemData('装备列表.json'), ...readItemData('特殊装备列表.json')],
    丹药: readItemData('炼丹师丹药.json'),
    盒子: readItemData('盒子列表.json'),
  };
  const expected = {
    谪仙: { plane: 2.5, realm: 11, skill: '谪仙曲·祭灵' },
    六冠王宁川: { plane: 2.5, realm: 11, skill: '麒麟宝术', defense: '天图镇世' },
    伊轻舞: { plane: 2, realm: 10, skill: '广寒封天' },
    元古: { plane: 2, realm: 11, skill: '元光转生轮' },
  };

  for (const [name, config] of Object.entries(expected)) {
    const matches = bosses.filter(item => item.名号 === name);
    assert.equal(matches.length, 1, `天骄应且仅应注册一次：${name}`);
    const boss = matches[0];
    assert.ok(boss, `缺少天骄：${name}`);
    assert.equal(boss.位面, config.plane);
    assert.equal(config.plane === 2.5 ? boss.xiangulevel_id : boss.mijinglevel_id, config.realm);
    assert.ok(boss.学习的功法.includes(config.skill));
    assert.ok(attacks.some(skill => skill.name === config.skill), `攻击技能未实装：${config.skill}`);
    if (config.defense) assert.ok(defenses.some(skill => skill.name === config.defense), `防御技能未实装：${config.defense}`);

    for (const drop of [...(boss.掉落物 || []), ...(boss.特殊掉落 || [])]) {
      if (drop.class === '遗珍') continue;
      assert.ok(catalogues[drop.class]?.some(item => item.name === drop.name), `缺少${drop.class}定义：${drop.name}`);
    }
  }

  const sacrifice = attacks.find(skill => skill.name === '谪仙曲·祭灵');
  assert.deepEqual(
    { growth: sacrifice.攻击成长, cap: sacrifice.攻击成长上限, cost: sacrifice.献祭生命 },
    { growth: 0.12, cap: 0.6, cost: 0.06 },
  );
  assert.equal(attacks.find(skill => skill.name === '广寒封天').禁疗, 0.8);

  const yiqingwu = bosses.find(item => item.名号 === '伊轻舞');
  assert.deepEqual(yiqingwu.掉落物.map(item => item.name), [
    '太阴一转十万年残卷',
    '太阴真经·仙台卷残页',
  ]);
  assert.deepEqual(yiqingwu.特殊掉落.map(item => item.name), ['八德宝轮', '太阴真经']);
  assert.equal(catalogues.装备.find(item => item.name === '八德宝轮')?.type, '法宝');

  const yuangu = bosses.find(item => item.名号 === '元古');
  assert.deepEqual(yuangu.掉落物.map(item => [item.name, item.class]), [
    ['元皇道剑残页', '材料'],
    ['元光转生轮残页', '材料'],
    ['大衍悟道丹', '丹药'],
    ['超越宝盒', '盒子'],
  ]);
  assert.deepEqual(yuangu.特殊掉落.map(item => item.name), ['元皇道剑', '元光转生轮']);

  const recipes = readItemData('合成列表.json');
  for (const [technique, page] of [
    ['太阴真经·仙台卷', '太阴真经·仙台卷残页'],
    ['元皇道剑', '元皇道剑残页'],
    ['元光转生轮', '元光转生轮残页'],
  ]) {
    assert.ok(catalogues.功法.some(item => item.name === technique), `缺少功法定义：${technique}`);
    assert.deepEqual(recipes.find(item => item.name === technique)?.materials, [
      { name: page, class: '材料', amount: 10 },
    ]);
  }
});
