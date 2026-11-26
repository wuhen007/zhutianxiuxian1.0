import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateCropGrowthState } from '../apps/Garden/smallWorldGrowth.js';

const seed = { requirements: { 灵气浓度: 1000 } };
const world = {
  attributes: {
    灵气浓度: 1000,
    时间流速: '1:1',
  },
};
const crop = {
  种植时间: '2026-01-01T00:00:00.000Z',
  当前阶段: 5,
};

test('展示阶段5在80%进度时仍未真正成熟', () => {
  const state = calculateCropGrowthState(
    crop,
    seed,
    world,
    new Date('2026-01-01T03:12:00.000Z')
  );

  assert.equal(state.isMature, false);
  assert.equal(state.remainingTime, 48 * 60);
});

test('展示阶段5在99%进度时仍会继续参与生长检查', () => {
  const state = calculateCropGrowthState(
    crop,
    seed,
    world,
    new Date('2026-01-01T03:57:36.000Z')
  );

  assert.equal(state.isMature, false);
  assert.ok(state.remainingTime > 0);
});

test('只有实际进度达到100%才判定成熟', () => {
  const state = calculateCropGrowthState(
    crop,
    seed,
    world,
    new Date('2026-01-01T04:00:00.000Z')
  );

  assert.equal(state.isMature, true);
  assert.equal(state.remainingTime, 0);
});

test('时间流速和催熟加成共同计入真实成熟度', () => {
  const acceleratedWorld = {
    attributes: {
      灵气浓度: 1000,
      时间流速: '1:2',
    },
  };
  const acceleratedCrop = { ...crop, 时间加成: 60 * 60 };
  const state = calculateCropGrowthState(
    acceleratedCrop,
    seed,
    acceleratedWorld,
    new Date('2026-01-01T01:30:00.000Z')
  );

  assert.equal(state.isMature, true);
  assert.equal(state.totalGrowthTime, 4 * 60 * 60);
});
