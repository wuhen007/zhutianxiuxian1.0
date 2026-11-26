import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeOccupationCollection,
  saveOccupation,
  snapshotOccupation,
  takeOccupation,
} from '../model/occupationCollection.js';

test('旧版单副职数据会迁移为可无限扩展的职业列表', () => {
  const legacy = JSON.stringify({ 职业名: '炼丹师', 职业等级: 12, 职业经验: 345 });
  const occupations = normalizeOccupationCollection(legacy);
  assert.deepEqual(occupations, [{ 职业名: '炼丹师', 职业等级: 12, 职业经验: 345 }]);

  let expanded = occupations;
  for (let index = 1; index <= 50; index++) {
    expanded = saveOccupation(expanded, {
      职业名: `测试职业${index}`,
      职业等级: index,
      职业经验: index * 100,
    });
  }
  assert.equal(expanded.length, 51);
});

test('切换职业会取回各自等级并保存当前职业', () => {
  const stored = [
    { 职业名: '炼丹师', 职业等级: 12, 职业经验: 345 },
    { 职业名: '采药师', 职业等级: 20, 职业经验: 678 },
  ];
  const { occupation, remaining } = takeOccupation(stored, '采药师');
  const nextStored = saveOccupation(
    remaining,
    snapshotOccupation({ occupation: '炼器师', occupation_level: 8, occupation_exp: 120 })
  );

  assert.deepEqual(occupation, { 职业名: '采药师', 职业等级: 20, 职业经验: 678 });
  assert.deepEqual(nextStored.map(item => item.职业名), ['炼丹师', '炼器师']);
});
