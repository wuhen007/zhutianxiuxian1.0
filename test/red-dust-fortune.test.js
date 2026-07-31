import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RED_DUST_FORTUNE_DURATION_MS,
  applyQuestionFortuneCost,
  createRedDustFortune,
  getActiveRedDustFortune,
  getDungeonFortuneMultiplier,
  getSeekingFortuneMultipliers,
} from '../model/redDustFortune.js';

test('红尘仙缘签持续24小时且过期后失效', () => {
  const now = 1_000_000;
  const player = { 红尘仙缘签: createRedDustFortune('问道签', 123, now) };
  assert.equal(player.红尘仙缘签.expiresAt, now + RED_DUST_FORTUNE_DURATION_MS);
  assert.equal(getActiveRedDustFortune(player, now + RED_DUST_FORTUNE_DURATION_MS - 1)?.type, 'question');
  assert.equal(getActiveRedDustFortune(player, now + RED_DUST_FORTUNE_DURATION_MS), null);
});

test('三种红尘仙缘签只影响各自消费层', () => {
  const now = 2_000_000;
  const question = { 红尘仙缘签: createRedDustFortune('question', 1, now) };
  const adventure = { 红尘仙缘签: createRedDustFortune('历练签', 1, now) };
  const seeking = { 红尘仙缘签: createRedDustFortune('寻缘签', 1, now) };

  assert.equal(applyQuestionFortuneCost(question, 101, now), 81);
  assert.equal(applyQuestionFortuneCost(adventure, 101, now), 101);
  assert.equal(getDungeonFortuneMultiplier(adventure, now), 2);
  assert.equal(getDungeonFortuneMultiplier(question, now), 1);
  assert.deepEqual(getSeekingFortuneMultipliers(seeking, now), {
    realmEvent: 5,
    coordinate: 2,
    wenxian: 2,
  });
});
