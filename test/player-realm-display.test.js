import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { getFlowerRealmDisplay, getXianguRealmDisplay } from '../model/playerRealmDisplay.js';

const xianguLevels = [
  { level_id: 6, level: '列阵境', 极境名称: '列阵极境·体刻万灵图' },
  { level_id: 7, level: '尊者境', 极境名称: '尊者极境·无暇道基' },
  { level_id: 8, level: '神火境', 极境名称: '神火极境·祭炼真我' },
  { level_id: 12, level: '虚道境' },
  { level_id: 13, level: '斩我境' },
];

test('仙古面板仅显示当前境界已达成的极境', () => {
  assert.equal(getXianguRealmDisplay({ xiangulevel_id: 7, 极境: ['6', '7'] }, xianguLevels), '尊者极境·无暇道基');
  assert.equal(getXianguRealmDisplay({ xiangulevel_id: 7, 极境: ['6'] }, xianguLevels), '尊者境');
  assert.equal(getXianguRealmDisplay({ xiangulevel_id: 8, xiangu_shenhuo: { 极境达成: true, 极境名称: '神火极境·世界树幼苗' } }, xianguLevels), '神火极境·世界树幼苗');
  assert.equal(getXianguRealmDisplay({ xiangulevel_id: 8, 极境: ['7'], xiangu_shenhuo: { 已点燃: true, 点燃方式: '自身修炼', 极境达成: false } }, xianguLevels), '神火境');
});

test('尊者普通冲关重建普通神火状态', () => {
  const source = fs.readFileSync(new URL('../apps/User/xiangujinshi.js', import.meta.url), 'utf8');
  const start = source.indexOf('async breakthroughShenhuoRealm');
  const end = source.indexOf('async breakthroughXianqiExtreme', start);
  const block = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(block, /player\.极境 = player\.极境\.filter\(levelId => levelId !== '8'\)/);
  assert.match(block, /player\.xiangu_xianqi = 0/);
  assert.match(block, /player\.xiangu_shenhuo = \{/);
  assert.match(block, /点燃方式: '自身修炼'/);
  assert.match(block, /极境达成: false/);
  assert.doesNotMatch(block, /if \(!player\.xiangu_shenhuo\)/);
});

test('仙古高阶独立极境按存档标记显示', () => {
  assert.equal(getXianguRealmDisplay({ xiangulevel_id: 12, xiangu_jiutian_shidi: true }, xianguLevels), '虚道极境·九天十地劫');
  assert.equal(getXianguRealmDisplay({ xiangulevel_id: 13, xiangu_zhanxian_zhadao: true }, xianguLevels), '斩我极境·斩仙铡刀劫');
});

test('花粉路境界显示区分大宇与究极分支', () => {
  const levels = [{ level_id: 16, level: '混元境——大能' }, { level_id: 17, level: '大宇境/究极境' }];
  assert.equal(getFlowerRealmDisplay({ huafenlevel_id: 16 }, levels), '混元境——大能');
  assert.equal(getFlowerRealmDisplay({ huafenlevel_id: 17, 花粉路分支: '大宇' }, levels), '大宇境');
  assert.equal(getFlowerRealmDisplay({ huafenlevel_id: 17, 花粉路分支: '究极' }, levels), '究极境');
});

test('主角色模板接入花粉路与统一仙古境界显示', () => {
  const template = fs.readFileSync(new URL('../resources/html/player/player.html', import.meta.url), 'utf8');
  assert.match(template, /仙古今世法：.*rank_xiangujinshi/);
  assert.match(template, /花粉进化路：.*rank_huafen/);
  assert.doesNotMatch(template, /player\.极境\.includes/);
});

test('列阵极境配置名称与突破体系一致', () => {
  const levels = JSON.parse(fs.readFileSync(new URL('../resources/data/Level/仙古今世法.json', import.meta.url), 'utf8'));
  assert.equal(levels.find(item => item.level_id === 6)?.极境名称, '列阵极境·体刻万灵图');
});
