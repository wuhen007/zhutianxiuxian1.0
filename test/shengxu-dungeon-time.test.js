import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BREATHING_TIME_REDUCTION,
  SHENGXU_DUNGEONS,
  getShengxuDungeon,
  getShengxuExploreDuration,
} from '../model/shengxuContent.js';
import { createSuiyunRoot } from '../model/suiyun.js';
import { SUIYUN_BRANCH } from '../model/suiyunAuthority.js';

test('shengxu dungeons all carry explore duration increasing by chapter', () => {
  const byChapter = { '地球篇': 7, '星路篇': 10, '大阴间篇': 12, '阳间篇': 15, '诡异篇': 20 };
  for (const dungeon of SHENGXU_DUNGEONS) {
    assert.equal(dungeon.duration, byChapter[dungeon.chapter], `${dungeon.name} 时长`);
  }
});

test('breathing method reduces explore duration', () => {
  const base = getShengxuDungeon('太行山');
  const none = getShengxuExploreDuration({ 学习的功法: [] }, base);
  assert.equal(none, 7);
  const xingyi = getShengxuExploreDuration({ 学习的功法: ['基础呼吸法', '形意呼吸法'] }, base);
  assert.equal(xingyi, 6); // 7 - 1
  const daoyin = getShengxuExploreDuration({ 学习的功法: ['道引呼吸法'] }, base);
  assert.equal(daoyin, 5); // 7 - 4，触底下限 5
  const daoyinStar = getShengxuExploreDuration({ 学习的功法: ['道引呼吸法'] }, getShengxuDungeon('小阴间星路'));
  assert.equal(daoyinStar, 6); // 10 - 4
});

test('explore duration has a floor of 5 minutes', () => {
  const herb = getShengxuExploreDuration({ 学习的功法: ['盗引呼吸法'] }, getShengxuDungeon('太行山'));
  assert.equal(herb, 5); // 7 - 5，触底下限
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

test('圣墟叠加通用步法与道法加速，行字秘优先且随境界成长', () => {
  const dungeon = getShengxuDungeon('魂河古地');
  for (const [level, expected] of [[1, 18], [9, 17], [16, 16]]) {
    assert.equal(getShengxuExploreDuration({ 学习的功法: ['行字秘', '天璇步法'], mijinglevel_id: level }, dungeon), expected);
  }
  assert.equal(getShengxuExploreDuration({ 学习的功法: ['天璇步法'] }, dungeon), 19);
  const player = { 学习的功法: ['盗引呼吸法', '行字秘'], mijinglevel_id: 16, daofaxianshu: 2, daofaxianshu_endtime: 2000 };
  assert.equal(getShengxuExploreDuration(player, dungeon, [], 1000), 9);
  assert.equal(getShengxuExploreDuration(player, dungeon, [], 2000), 11);
});

test('圣墟命格减秒叠加功法火候和先天至宝倍率，天空权柄只扣一次', () => {
  const dungeon = getShengxuDungeon('魂河古地');
  const player = {
    学习的功法: ['盗引呼吸法', '行字秘', '鲲鹏宝术'], mijinglevel_id: 16,
    功法熟练度: { 行字秘: 1000, 鲲鹏宝术: 1000 },
    daofaxianshu: 2, daofaxianshu_endtime: 2000,
    命格: { id: 'fast' }, 附加命格: ['extra'], 当前先天至宝: '混沌钟',
  };
  const mingge = [{ id: 'fast', effects: { 秘境加速: 40 } }, { id: 'extra', effects: { 秘境加速: 20 } }];
  // (20 - 5呼吸法 - 4行字秘 - 2道法 - 1命格) × 0.9火候 × 0.7混沌钟。
  assert.ok(Math.abs(getShengxuExploreDuration(player, dungeon, mingge, 1000) - 5.04) < 1 / 60_000);
  assert.equal(getShengxuExploreDuration({ 当前先天至宝: '东皇钟' }, dungeon), 16);
  player.灵根 = createSuiyunRoot(5);
  player.当前大道至宝 = SUIYUN_BRANCH;
  player.天阙权柄 = { 解封: { 天空: { at: 0 } } };
  assert.ok(Math.abs(getShengxuExploreDuration(player, dungeon, mingge, 1000) - 4.04) < 1 / 60_000);
});

test('圣墟通用加速可突破呼吸法的五分钟基础下限，最终至少一秒', () => {
  const player = { 学习的功法: ['盗引呼吸法', '行字秘'], mijinglevel_id: 16, daofaxianshu: 2, daofaxianshu_endtime: 2000 };
  assert.equal(getShengxuExploreDuration(player, getShengxuDungeon('太行山'), [], 1000), 1 / 60);
  assert.equal(getShengxuExploreDuration({}, getShengxuDungeon('太行山')), 7);
});
