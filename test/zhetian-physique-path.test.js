import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  applyZhetianAwakening,
  getZhetianAwakeningStage,
  inspectZhetianAwakening,
} from '../model/zhetianPhysiquePath.js';

function player(root, realm = 7, skills = []) {
  return {
    灵根: { name: root, 生命本源: 0 },
    生命本源: 100,
    mijinglevel_id: realm,
    学习的功法: [...skills],
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

function dungeonHas(dungeons, name) {
  return dungeons.some(dungeon =>
    ['one', 'two', 'three', 'four'].some(key =>
      Array.isArray(dungeon[key]) && dungeon[key].some(item => item.name === name)
    )
  );
}

test('太阳和太阴共用神体类型时仍按灵根名称区分路线', () => {
  const sun = player('太阳之体', 7, ['太阳真经']);
  sun.灵根.type = '神体';
  assert.equal(getZhetianAwakeningStage(sun, '太阳').status, 'ready');
  assert.equal(getZhetianAwakeningStage(sun, '太阴').status, 'wrong-lineage');
});

test('太阳神体觉醒同时检查境界、帝经和扶桑神枝', () => {
  const sun = player('太阳之体', 6);
  const blocked = inspectZhetianAwakening(sun, '太阳');
  assert.deepEqual(blocked.missing, [
    '秘境体系需达到四极秘境',
    '需掌握《太阳真经》',
    '需要【扶桑神枝】×1，当前0',
  ]);

  sun.mijinglevel_id = 7;
  sun.学习的功法.push('太阳真经');
  assert.equal(inspectZhetianAwakening(sun, '太阳', { 扶桑神枝: 1 }).ok, true);
});

test('太阴神体先化解本源反噬，大成再要求仙台卷', () => {
  const lunar = player('太阴之体', 7, ['太阴真经']);
  assert.match(inspectZhetianAwakening(lunar, '太阴').missing[0], /地命果/);

  const first = inspectZhetianAwakening(lunar, '太阴', { 地命果: 1 });
  assert.equal(first.ok, true);
  applyZhetianAwakening(lunar, first, [
    { name: '太阴神体', type: '小成神体', 生命本源: 50 },
  ]);
  assert.equal(lunar.灵根.name, '太阴神体');
  assert.equal(lunar.生命本源, 150);

  lunar.mijinglevel_id = 15;
  lunar.学习的功法.push('太阴真经·仙台卷');
  assert.equal(inspectZhetianAwakening(lunar, '太阴').ok, true);
});

test('大成神王体要求斗字秘和姜家祖地传承', () => {
  const king = player('神王体');
  const first = inspectZhetianAwakening(king, '神王');
  assert.equal(first.ok, true);
  applyZhetianAwakening(king, first, [
    { name: '小成·神王体', type: '小成神王体', 生命本源: 50 },
  ]);

  king.mijinglevel_id = 15;
  let second = inspectZhetianAwakening(king, '神王');
  assert.deepEqual(second.missing, [
    '需掌握《斗字秘》',
    '需完成姜家祖地五日传承，获得完整《恒宇经》',
  ]);

  king.学习的功法.push('斗字秘');
  king.遮天帝经传承 = { 恒宇经: { completed: true, progress: 5 } };
  second = inspectZhetianAwakening(king, '神王');
  assert.equal(second.ok, true);
});

test('大成体质不会重复觉醒或重复消耗材料', () => {
  assert.equal(
    inspectZhetianAwakening(player('太阳圣皇体', 15), '太阳').status,
    'complete'
  );
});

test('进阶目标、必需资源与普通战斗技能均有数据来源', () => {
  const talents = readJson('../resources/data/item/灵根列表.json');
  const dungeons = readJson('../resources/data/item/副本/遮天宇宙列表.json');
  const items = readJson('../resources/data/item/道具列表.json');
  const attackSkills = readJson('../resources/data/item/技能组/攻击技能.json');
  const defenseSkills = readJson('../resources/data/item/技能组/防御技能.json');
  const rootSkills = readJson('../resources/data/item/技能组/灵根增幅技能.json');

  for (const name of [
    '太阳神体', '太阳圣皇体', '太阴神体', '太阴圣皇体',
    '小成·神王体', '大成·神王体',
  ]) {
    assert.ok(talents.some(talent => talent.name === name), `缺少目标灵根：${name}`);
  }
  for (const name of ['太阳真经', '太阳真经·仙台卷', '大日涅槃诀', '太阴真经', '太阴真经·仙台卷', '斗字秘']) {
    assert.ok(dungeonHas(dungeons, name), `缺少功法来源：${name}`);
  }
  assert.ok(items.some(item => item.name === '地命果' && item.class === '道具'));
  assert.ok(dungeonHas(dungeons, '地命果'));
  assert.ok(dungeonHas(dungeons, '扶桑神枝'));

  for (const name of ['太阳之体', '太阳神体', '太阳圣皇体']) {
    assert.ok(attackSkills.some(skill => skill.name === name && skill.class === '灵根'));
  }
  for (const name of ['太阴之体', '太阴神体', '太阴圣皇体']) {
    assert.ok(defenseSkills.some(skill => skill.name === name && skill.class === '灵根'));
  }
  for (const name of ['神王体', '小成·神王体', '大成·神王体']) {
    assert.ok(rootSkills.some(skill => skill.name === name && skill.class === '灵根'));
  }
});
