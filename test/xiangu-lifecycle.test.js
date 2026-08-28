import assert from 'node:assert/strict';
import test from 'node:test';

import {
  XIANGU_STAGE,
  advanceXianguLifecycle,
  getXianguOpeningAttemptProbability,
  isXianguBloomCheckDue,
  isXianguPlayerRoundCurrent,
  getXianguWorldYear,
  scheduleXianguBloomCheck,
  setXianguOpeningProbability,
  shouldCheckXianguBloom,
  startXianguPreparation,
} from '../apps/tasks/xianguLifecycle.js';

test('仙古花蕾先现世准备，再在准备期结束后开放', () => {
  const world = { 仙古秘境: 0, 仙古秘境开启概率: 0 };

  const announced = startXianguPreparation(world, {
    worldYear: 48000,
    preparationYears: 1000,
  });
  assert.equal(announced.transition, 'preparing');
  assert.equal(world.仙古秘境, 0);
  assert.equal(world.仙古秘境阶段, XIANGU_STAGE.PREPARING);
  assert.equal(world.仙古秘境准备结束总年份, 49000);

  assert.equal(advanceXianguLifecycle(world, {
    worldYear: 48999,
    preparationYears: 1000,
  }).transition, null);
  assert.equal(world.仙古秘境, 0);

  const opened = advanceXianguLifecycle(world, {
    worldYear: 49000,
    preparationYears: 1000,
    openDurationYears: 10000,
  });
  assert.equal(opened.transition, 'opened');
  assert.equal(world.仙古秘境, 1);
  assert.equal(world.仙古秘境阶段, XIANGU_STAGE.OPEN);
  assert.equal(world.仙古秘境开启总年份, 49000);
  assert.equal(world.仙古秘境关闭总年份, 59000);
  assert.equal(world.仙古秘境下次判定总年份, 59000);
  assert.equal(world.仙古秘境会话ID, 'xiangu-49000');
});

test('仙古秘境按世界总年份关闭，不受时代与纪元重置影响', () => {
  const world = {
    仙古秘境: 1,
    仙古秘境阶段: XIANGU_STAGE.OPEN,
    仙古秘境开启总年份: 49000,
    仙古秘境关闭总年份: 59000,
    仙古秘境开启时间: 49000,
    仙古秘境会话ID: 'xiangu-49000',
  };

  assert.equal(advanceXianguLifecycle(world, { worldYear: 58999 }).transition, null);
  assert.equal(world.仙古秘境, 1);

  const closed = advanceXianguLifecycle(world, { worldYear: 59000 });
  assert.equal(closed.transition, 'closed');
  assert.equal(closed.clearManualRound, true);
  assert.equal(world.仙古秘境, 0);
  assert.equal(world.仙古秘境阶段, XIANGU_STAGE.CLOSED);
  assert.equal(world.仙古秘境会话ID, '');
  assert.equal(world.仙古秘境开启总年份, 0);
  assert.equal(world.仙古秘境下次判定总年份, 59000);
});

test('仙古秘境开启后以诸天纪年锁定一万年再判定', () => {
  const world = { 仙古秘境下次判定总年份: 59000 };
  assert.equal(isXianguBloomCheckDue(world, 57000, 58000), false);
  assert.equal(isXianguBloomCheckDue(world, 58000, 59000), true);

  scheduleXianguBloomCheck(world, 59000);
  assert.equal(world.仙古秘境下次判定总年份, 61000);
  assert.equal(isXianguBloomCheckDue(world, 59000, 60000), false);
});

test('跨时代与跨纪元仍以连续世界年份判断花蕾节点', () => {
  const eraEnd = getXianguWorldYear(4, 9000, 1);
  const nextEpoch = getXianguWorldYear(0, 0, 2);
  assert.equal(eraEnd, 49000);
  assert.equal(nextEpoch, 50000);
  assert.equal(shouldCheckXianguBloom(eraEnd, nextEpoch), true);
  assert.equal(shouldCheckXianguBloom(49999, 50000), true);
  assert.equal(shouldCheckXianguBloom(50000, 51000), false);
});

test('旧版手动开启没有生命周期字段时会安全迁移为当前轮次', () => {
  const world = { 仙古秘境: 1, 仙古秘境开启时间: 0, 仙古秘境会话ID: '' };
  const result = advanceXianguLifecycle(world, { worldYear: 52000 });

  assert.equal(result.transition, null);
  assert.equal(world.仙古秘境, 1);
  assert.equal(world.仙古秘境阶段, XIANGU_STAGE.OPEN);
  assert.equal(world.仙古秘境开启总年份, 52000);
  assert.equal(world.仙古秘境关闭总年份, 62000);
  assert.equal(world.仙古秘境会话ID, 'xiangu-52000');
});

test('关闭或跨轮玩家不能继续使用旧秘境动作，旧存档在当前轮可兼容', () => {
  const openWorld = {
    仙古秘境: 1,
    仙古秘境阶段: XIANGU_STAGE.OPEN,
    仙古秘境开启时间: 52000,
    仙古秘境会话ID: 'xiangu-52000',
  };
  assert.equal(
    isXianguPlayerRoundCurrent({ in_xiangu: true, xiangu_world_seed: 'xiangu-52000' }, openWorld),
    true,
  );
  assert.equal(
    isXianguPlayerRoundCurrent({ in_xiangu: true, xiangu_world_seed: '52000' }, openWorld),
    true,
  );
  assert.equal(
    isXianguPlayerRoundCurrent({ in_xiangu: true, xiangu_world_seed: 'xiangu-49000' }, openWorld),
    false,
  );
  assert.equal(
    isXianguPlayerRoundCurrent({ in_xiangu: true, xiangu_world_seed: 'xiangu-52000' }, {
      ...openWorld,
      仙古秘境: 0,
      仙古秘境阶段: XIANGU_STAGE.CLOSED,
    }),
    false,
  );
  assert.equal(
    isXianguPlayerRoundCurrent({ in_xiangu: true }, openWorld),
    true,
  );
  assert.equal(
    isXianguPlayerRoundCurrent({ in_xiangu: true, xiangu_world_seed: 'manual-open' }, openWorld),
    true,
  );
  assert.equal(
    isXianguPlayerRoundCurrent({ in_xiangu: true, xiangu_world_seed: 'legacy' }, openWorld),
    true,
  );
});

test('开启概率保留原有累加节奏并在成功后可重置', () => {
  const world = { 仙古秘境开启概率: 0 };
  assert.equal(getXianguOpeningAttemptProbability(world), 0.15);
  setXianguOpeningProbability(world, 0.15);
  assert.equal(getXianguOpeningAttemptProbability(world), 0.25);
  setXianguOpeningProbability(world, 9);
  assert.equal(getXianguOpeningAttemptProbability(world), 1);
});
