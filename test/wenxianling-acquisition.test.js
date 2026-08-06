import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WENXIAN_CLUE_COST,
  WENXIAN_DAILY_QUEST_EXP,
  WENXIAN_WEEKLY_TASK_EXP,
  activateWenXianLing,
  addWenXianExp,
  claimWenXianWeeklyTask,
  ensureWenXianState,
  ensureWenXianTaskState,
  grantWenXianClue,
  isWenXianTrialComplete,
  purchaseWenXianClue,
  recordWenXianTaskProgress,
  recordWenXianTrial,
  rollDailyDungeonWenXianClue,
} from '../model/wenxianling.js';
import { consumeSpiritHeart } from '../model/spiritUniverse.js';

const fixedLocation = {
  plane: '凡间',
  location: '血色禁地',
  coordinate: { x: 200, y: 30 },
};

test('空白问仙令保持锁定，已有等级或领取记录的旧玩家自动保留', () => {
  const blank = {};
  assert.equal(ensureWenXianState(blank).unlocked, false);

  const legacyLevel = { 问仙令: { exp: 1000, level: 1, claimed: [] } };
  assert.equal(ensureWenXianState(legacyLevel).unlocked, true);

  const legacyClaim = { 问仙令: { exp: 0, level: 0, claimed: [1] } };
  assert.equal(ensureWenXianState(legacyClaim).unlocked, true);
  assert.equal(legacyClaim.问仙令.level, 1);
  assert.equal(addWenXianExp(legacyClaim, 50).newLevel, 1);
});

test('重金求取问仙线索准确扣除30亿源石且已有内景地直接计入试炼', () => {
  const player = {
    mijinglevel_id: 5,
    xiangulevel_id: 0,
    源石: WENXIAN_CLUE_COST,
    内景地开辟: 1,
  };
  const result = purchaseWenXianClue(player, { location: fixedLocation, now: 1 });
  assert.equal(result.ok, true);
  assert.equal(player.源石, 0);
  assert.equal(player.问仙令.clue.source, '重金求取');
  assert.equal(player.问仙令.trial.innerWorldOpened, true);

  const poor = { xiangulevel_id: 5, 源石: WENXIAN_CLUE_COST - 1 };
  assert.equal(purchaseWenXianClue(poor, { location: fixedLocation }).reason, 'insufficient');
  assert.equal(poor.源石, WENXIAN_CLUE_COST - 1);
});

test('成功副本每日只抽一次问仙线索并在第30次保底', () => {
  const player = { mijinglevel_id: 5 };
  const miss = rollDailyDungeonWenXianClue(player, {
    dateKey: '2026-07-29',
    random: () => 0.9,
    location: fixedLocation,
  });
  assert.equal(miss.reason, 'miss');
  assert.equal(rollDailyDungeonWenXianClue(player, {
    dateKey: '2026-07-29',
    random: () => 0,
    location: fixedLocation,
  }).reason, 'daily-limit');

  player.问仙令.dungeonClueAttempts = 29;
  const pity = rollDailyDungeonWenXianClue(player, {
    dateKey: '2026-07-30',
    random: () => 0.9,
    location: fixedLocation,
  });
  assert.equal(pity.found, true);
  assert.equal(pity.pity, true);
  assert.equal(player.问仙令.clue.source, '副本保底');
});

test('寻缘签倍率将问仙残痕发现率从1%提升至2%', () => {
  const player = { mijinglevel_id: 5 };
  const result = rollDailyDungeonWenXianClue(player, {
    dateKey: '2026-07-31',
    chanceMultiplier: 2,
    random: () => 0.015,
    location: fixedLocation,
  });
  assert.equal(result.found, true);
});

test('四项问仙试炼完成后激活并转入最多1000点暂存道痕', () => {
  const player = { xiangulevel_id: 5 };
  assert.equal(grantWenXianClue(player, '测试', { location: fixedLocation, now: 1 }).ok, true);
  assert.equal(addWenXianExp(player, 1200).pendingExp, 1000);

  for (let day = 1; day <= 7; day++) {
    recordWenXianTrial(player, 'daily', { dateKey: `2026-08-0${day}` });
  }
  assert.equal(recordWenXianTrial(player, 'daily', { dateKey: '2026-08-07' }).changed, false);
  recordWenXianTrial(player, 'inner-world');
  recordWenXianTrial(player, 'tianjiao');
  recordWenXianTrial(player, 'explore');
  assert.equal(isWenXianTrialComplete(player), true);

  const result = activateWenXianLing(player, 2);
  assert.equal(result.ok, true);
  assert.equal(result.pendingExp, 1000);
  assert.equal(player.问仙令.unlocked, true);
  assert.equal(player.问仙令.pendingExp, 0);
  assert.equal(player.问仙令.exp, 1000);
  assert.equal(player.问仙令.level, 1);
});

test('问仙令每日任务逐项奖励200经验并在上海日期变化后重置', () => {
  const player = { 心神: 100, 问仙令: { unlocked: true } };
  const now = new Date('2026-08-06T02:00:00Z');

  consumeSpiritHeart(player, 10, now);
  consumeSpiritHeart(player, 20, now);
  assert.equal(player.问仙令.exp, WENXIAN_DAILY_QUEST_EXP);
  assert.equal(player.问仙令.tasks.daily.rewarded.spiritHeart, true);

  recordWenXianTaskProgress(player, 'tianjiao', 1, { now });
  recordWenXianTaskProgress(player, 'dungeon', 3, { now });
  assert.equal(player.问仙令.exp, WENXIAN_DAILY_QUEST_EXP * 3);
  recordWenXianTaskProgress(player, 'dungeon', 3, { now });
  assert.equal(player.问仙令.exp, WENXIAN_DAILY_QUEST_EXP * 3);

  const tomorrow = new Date('2026-08-07T02:00:00Z');
  recordWenXianTaskProgress(player, 'tianjiao', 1, { now: tomorrow });
  assert.equal(player.问仙令.exp, WENXIAN_DAILY_QUEST_EXP * 4);
  assert.equal(ensureWenXianTaskState(player, { now: tomorrow }).daily.progress.dungeon, 0);
});

test('每周五项任务达标后只可领取一次完整奖励', () => {
  const player = {
    level_id: 2,
    Physique_id: 3,
    mijinglevel_id: 4,
    xiangulevel_id: 5,
    问仙令: { unlocked: true },
  };
  const options = { dateKey: '2026-08-06', weekKey: '2026-08-03' };
  recordWenXianTaskProgress(player, 'dailyTask', 5, options);
  recordWenXianTaskProgress(player, 'tianjiao', 5, options);
  recordWenXianTaskProgress(player, 'stoneMarket', 5, options);
  recordWenXianTaskProgress(player, 'spiritHeart', 100, options);
  recordWenXianTaskProgress(player, 'dungeon', 20, options);

  const result = claimWenXianWeeklyTask(player, { ...options, random: () => 0 });
  assert.equal(result.ok, true);
  assert.equal(result.rewards.xiuwei, 1_602_000);
  assert.equal(result.rewards.xueqi, 3_602_000);
  assert.equal(result.rewards.lingshi, 90_000_000);
  assert.equal(result.rewards.yuanshi, 90_000_000);
  assert.equal(player.问仙令.exp, WENXIAN_DAILY_QUEST_EXP * 3 + WENXIAN_WEEKLY_TASK_EXP);
  assert.equal(claimWenXianWeeklyTask(player, options).reason, 'claimed');

  const nextWeek = ensureWenXianTaskState(player, {
    dateKey: '2026-08-10',
    weekKey: '2026-08-10',
  });
  assert.equal(nextWeek.weekly.claimed, false);
  assert.equal(nextWeek.weekly.progress.dailyTask, 0);
});
