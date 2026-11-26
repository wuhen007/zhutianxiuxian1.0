import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBingziLegacy,
  declareOnlyWeapon,
  identifyBingziMountain,
  observeBingziDiagram,
  rankBingziLegacy,
  settleBingziLegacy,
  traceCaiClan,
  trackMoonPrincess,
} from '../model/bingziLegacy.js';

test('兵字秘试炼必须依次追查蔡族并取得九山线索', () => {
  const legacy = createBingziLegacy(100, () => 0.4);

  assert.equal(trackMoonPrincess(legacy, '1').reason, 'trace_required');
  assert.equal(traceCaiClan(legacy, '1', '叶凡', 110).ok, true);
  const tracked = trackMoonPrincess(legacy, '1');

  assert.equal(tracked.ok, true);
  assert.deepEqual(tracked.clue, {
    rangeStart: 4,
    rangeEnd: 6,
    parity: '偶数',
  });
});

test('辨认真山最多只有三次且错误判断会保留', () => {
  const legacy = createBingziLegacy(100, () => 0.4);
  traceCaiClan(legacy, '1', '修士甲', 110);
  trackMoonPrincess(legacy, '1');

  assert.equal(identifyBingziMountain(legacy, '1', 1).reason, 'wrong');
  assert.equal(identifyBingziMountain(legacy, '1', 2).reason, 'wrong');
  assert.equal(identifyBingziMountain(legacy, '1', 3).reason, 'wrong');
  assert.equal(identifyBingziMountain(legacy, '1', 4).reason, 'limit');
  assert.deepEqual(legacy.participants['1'].guesses, [1, 2, 3]);
});

test('完成以器证兵后按完成度、参悟分和时间稳定排名', () => {
  const legacy = createBingziLegacy(100, () => 0);

  for (const [qq, name, insight, weapon, completedAt] of [
    ['1', '修士甲', 20, { name: '本命帝兵', isEmperorWeapon: true }, 300],
    ['2', '修士乙', 10, { name: '青锋剑', isEmperorWeapon: false }, 200],
  ]) {
    traceCaiClan(legacy, qq, name, 110);
    trackMoonPrincess(legacy, qq);
    identifyBingziMountain(legacy, qq, 1);
    observeBingziDiagram(legacy, qq, insight);
    declareOnlyWeapon(legacy, qq, weapon, completedAt);
  }

  const rankings = rankBingziLegacy(legacy);
  assert.deepEqual(rankings.map(item => item.qq), ['1', '2']);
  assert.deepEqual(rankings.map(item => item.score), [120, 100]);

  const settled = settleBingziLegacy(legacy, 500);
  assert.equal(settled.alreadySettled, undefined);
  assert.equal(legacy.status, 'settled');
  assert.deepEqual(legacy.rankings.map(item => item.qq), ['1', '2']);
  assert.equal(settleBingziLegacy(legacy, 600).alreadySettled, true);
});
