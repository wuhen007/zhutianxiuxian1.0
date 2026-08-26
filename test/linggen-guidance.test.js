import assert from 'node:assert/strict';
import test from 'node:test';
import {
  recordGuidedTalent,
  resolveGuidedTalent,
} from '../model/linggenGuidance.js';

test('引灵仙符统计同类型灵根，并支持序号或名称选择', () => {
  const candidates = [];
  const rolls = [
    ...Array(11).fill({ name: '太阳之体', type: '神体' }),
    ...Array(5).fill({ name: '太阴之体', type: '神体' }),
    ...Array(2).fill({ name: '万星体', type: '神体' }),
    { name: '荒古圣体', type: '圣体' },
  ];

  for (const talent of rolls) recordGuidedTalent(candidates, talent, '神体');
  assert.deepEqual(candidates.map(item => [item.talent.name, item.count]), [
    ['太阳之体', 11],
    ['太阴之体', 5],
    ['万星体', 2],
  ]);
  assert.equal(resolveGuidedTalent(candidates, '2').talent.name, '太阴之体');
  assert.equal(resolveGuidedTalent(candidates, '万星体').count, 2);
  assert.equal(resolveGuidedTalent(candidates, '9'), null);
});
