import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnnouncePresentation, splitAnnounceDetail } from '../model/announcePresentation.js';

test('公告只取本期内容并按标签归档', () => {
  const updates = [
    { tag: '新玩法', title: '甲', points: ['a'] },
    { tag: '新玩法', title: '乙', points: ['b'] },
    { tag: '调整', title: '丙', points: ['c'] },
    { tag: '修复', title: '丁', points: ['d', 'e'] },
    { tag: '旧闻', title: '不应出现', points: [] },
  ];
  const result = buildAnnouncePresentation(updates, 4);

  assert.equal(result.count, 4);
  assert.deepEqual(result.groups.map(group => group.label), ['新玩法', '调整', '修复']);
  assert.deepEqual(result.groups.flatMap(group => group.modules.map(module => module.no)), ['01', '02', '03', '04']);
  assert.deepEqual(result.stats.map(stat => stat.value), [2, 1, 2]);
  assert.equal(result.groups[0].modules[0].points[0].segments[0].text, 'a');
});

test('长提交说明按模块标记拆开', () => {
  assert.deepEqual(splitAnnounceDetail('【玩法】新增内容；【修复】结算正常；'), [
    { title: '玩法', text: '新增内容' },
    { title: '修复', text: '结算正常' },
  ]);
});
