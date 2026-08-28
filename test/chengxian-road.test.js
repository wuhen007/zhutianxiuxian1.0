import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHENGXIAN_ROAD_LIFECYCLE,
  closeChengxianRoad,
  isChengxianRoadCheckDue,
  isChengxianRoadCloseDue,
  markChengxianRoadCheckFailed,
  markChengxianRoadOpened,
} from '../model/chengxianRoad.js';

test('成仙路首次按两千年节点判定，开启后锁定一万年', () => {
  const world = {
    成仙路: 0,
    成仙路开启总年份: 0,
    成仙路下次判定总年份: 0,
  };

  assert.equal(isChengxianRoadCheckDue(world, 0, 1000), false);
  assert.equal(isChengxianRoadCheckDue(world, 1000, 2000), true);

  markChengxianRoadOpened(world, 2000);
  assert.equal(world.成仙路, 1);
  assert.equal(
    world.成仙路下次判定总年份,
    2000 + CHENGXIAN_ROAD_LIFECYCLE.REOPEN_COOLDOWN_YEARS,
  );
  assert.equal(isChengxianRoadCheckDue(world, 2000, 10000), false);
});

test('成仙路开放千年后关闭，冷却年份保留到一万年届满', () => {
  const world = {};
  markChengxianRoadOpened(world, 2000);

  assert.equal(isChengxianRoadCloseDue(world, 2999), false);
  assert.equal(isChengxianRoadCloseDue(world, 3000), true);
  closeChengxianRoad(world);

  assert.equal(world.成仙路, 0);
  assert.equal(isChengxianRoadCheckDue(world, 11000, 11999), false);
  assert.equal(isChengxianRoadCheckDue(world, 11999, 12000), true);
});

test('成仙路开启判定失败后沿用两千年重试间隔', () => {
  const world = { 成仙路: 0 };
  markChengxianRoadCheckFailed(world, 2000);

  assert.equal(isChengxianRoadCheckDue(world, 2000, 3999), false);
  assert.equal(isChengxianRoadCheckDue(world, 3999, 4000), true);
});
