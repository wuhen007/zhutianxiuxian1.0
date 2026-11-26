import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateCreationEverything,
  formatCreationDuration,
  getCreationQuantityMultiplier,
} from '../model/createEverything.js';

test('造化耗时按仙帝、祭道和祭道之上比例计算', () => {
  assert.deepEqual(
    calculateCreationEverything(21, 7, 1),
    { rarity: 7, amount: 1, minutesPerRarity: 5, quantityMultiplier: 1, minutes: 35, durationMs: 2_100_000, causalDebt: 35 },
  );
  assert.equal(calculateCreationEverything(22, 7, 1).minutes, 21);
  assert.equal(calculateCreationEverything(22, 7, 1).causalDebt, 21);
  assert.equal(calculateCreationEverything(23, 7, 1).minutes, 7);
  assert.equal(calculateCreationEverything(23, 7, 1).causalDebt, 0);
});

test('造化数量在严格超过阈值后累计翻倍，超过1200再翻三倍', () => {
  const cases = [
    [10, 1], [11, 2], [100, 2], [101, 4], [300, 4], [301, 8],
    [500, 8], [501, 16], [700, 16], [701, 32], [999, 32],
    [1000, 64], [1200, 64], [1201, 192],
  ];
  for (const [amount, expected] of cases) {
    assert.equal(getCreationQuantityMultiplier(amount), expected, `数量${amount}的倍率错误`);
  }
});

test('造化时间文案支持跨日时长', () => {
  assert.equal(formatCreationDuration(35), '35分钟');
  assert.equal(formatCreationDuration(70), '1小时10分钟');
  assert.equal(formatCreationDuration(1500), '1天1小时');
});
