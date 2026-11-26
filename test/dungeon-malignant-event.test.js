import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  isDungeonMalignantEventImmune,
  shouldTriggerDungeonMalignantEvent,
} from '../model/dungeonMalignantEvent.js';

test('圣人、天神和映照诸天境免疫秘境恶性事件', () => {
  assert.equal(isDungeonMalignantEventImmune({ mijinglevel_id: 12 }), true);
  assert.equal(isDungeonMalignantEventImmune({ xiangulevel_id: 11 }), true);
  assert.equal(isDungeonMalignantEventImmune({ huafenlevel_id: 11 }), true);
});

test('未达到免疫境界时仍按原40%概率判定', () => {
  const player = { mijinglevel_id: 11, xiangulevel_id: 10, huafenlevel_id: 10 };
  assert.equal(shouldTriggerDungeonMalignantEvent(player, () => 0.39), true);
  assert.equal(shouldTriggerDungeonMalignantEvent(player, () => 0.4), false);
});

test('达到任一免疫境界后不会触发恶性事件', () => {
  assert.equal(
    shouldTriggerDungeonMalignantEvent({ huafenlevel_id: 11 }, () => 0),
    false,
  );
});

test('普通、沉迷和旧结算路径全部使用统一恶性事件判定', () => {
  const expectedCalls = new Map([
    ['apps/SecretPlace/SecretPlaceTask.js', 6],
    ['apps/SecretPlace/SecretPlaceplusTask.js', 6],
    ['apps/User/UserSellAll.js', 12],
  ]);

  for (const [file, expected] of expectedCalls) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const calls = source.match(/if \(shouldTriggerDungeonMalignantEvent\(player\)\)/g) || [];
    assert.equal(calls.length, expected, file);
  }
});
