import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BREATHING_TIME_REDUCTION,
  SHENGXU_DUNGEONS,
  getShengxuDungeon,
  getShengxuExploreDuration,
} from '../model/shengxuContent.js';

test('shengxu dungeons all carry explore duration increasing by chapter', () => {
  const byChapter = { '地球篇': 15, '星路篇': 30, '阳间篇': 60, '诡异篇': 120 };
  for (const dungeon of SHENGXU_DUNGEONS) {
    assert.equal(dungeon.duration, byChapter[dungeon.chapter], `${dungeon.name} 时长`);
  }
});

test('breathing method reduces explore duration', () => {
  const base = getShengxuDungeon('太行山');
  const none = getShengxuExploreDuration({ 学习的功法: [] }, base);
  assert.equal(none, 15);
  const xingyi = getShengxuExploreDuration({ 学习的功法: ['基础呼吸法', '形意呼吸法'] }, base);
  assert.equal(xingyi, 14); // 15 - 1
  const daoyin = getShengxuExploreDuration({ 学习的功法: ['道引呼吸法'] }, base);
  assert.equal(daoyin, 11); // 15 - 4
  const daoyinStar = getShengxuExploreDuration({ 学习的功法: ['道引呼吸法'] }, getShengxuDungeon('小阴间星路'));
  assert.equal(daoyinStar, 26); // 30 - 4
});

test('explore duration has a floor of 5 minutes', () => {
  const herb = getShengxuExploreDuration({ 学习的功法: ['盗引呼吸法'] }, getShengxuDungeon('太行山'));
  assert.equal(herb, 10); // 15 - 5
  const floor = getShengxuExploreDuration({ 学习的功法: ['盗引呼吸法'] }, { name: 'x', duration: 4 });
  assert.equal(floor, 5); // 下限 5 分钟
});

test('breathing reduction table covers six breathing methods', () => {
  assert.deepEqual(BREATHING_TIME_REDUCTION, {
    基础呼吸法: 0,
    形意呼吸法: 1,
    太极呼吸法: 2,
    大雷音呼吸法: 3,
    道引呼吸法: 4,
    盗引呼吸法: 5,
  });
});
