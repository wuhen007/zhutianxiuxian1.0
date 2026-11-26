import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FACTION_ELITE_EXIT_COOLDOWN_MS,
  FACTION_EXIT_COOLDOWN_MS,
  applyFactionExit,
  formatFactionCooldown,
  getFactionDateKey,
  getFactionJoinBlock,
  hasClaimedFactionJoinReward,
  hasClaimedFactionPositionReward,
  recordFactionJoin,
  recordFactionPositionReward,
  wasFactionRewardClaimedToday,
} from '../model/factionSystem.js';

test('脱离势力会清空身份并按照职位设置冷却', () => {
  const elite = { 势力: '瑶池', 势力职位: '圣女' };
  const eliteResult = applyFactionExit(elite, 1_000_000);
  assert.equal(eliteResult.cooldownMs, FACTION_ELITE_EXIT_COOLDOWN_MS);
  assert.equal(elite.势力, '无');
  assert.equal(elite.势力职位, '');
  assert.equal(elite.势力脱离冷却至, 1_000_000 + FACTION_ELITE_EXIT_COOLDOWN_MS);

  const normal = { 势力: '摇光圣地', 势力职位: '记名弟子' };
  const normalResult = applyFactionExit(normal, 2_000_000);
  assert.equal(normalResult.cooldownMs, FACTION_EXIT_COOLDOWN_MS);
});

test('脱离冷却期间无法加入任何势力', () => {
  const player = { 势力: '无', 势力职位: '', 势力脱离冷却至: Date.now() + 60_000 };
  const block = getFactionJoinBlock(player, Date.now());
  assert.equal(block.ok, false);
  assert.equal(block.reason, 'cooldown');
  assert.match(formatFactionCooldown(block.remainingMs), /1分钟/);
});

test('入门奖励只在首次加入时记录，重入不会重复发放', () => {
  const player = { 势力: '无', 势力职位: '' };
  assert.equal(hasClaimedFactionJoinReward(player, '瑶池'), false);
  recordFactionJoin(player, '瑶池', '记名女弟子', 1_000, true);
  assert.equal(hasClaimedFactionJoinReward(player, '瑶池'), true);
});

test('晋升奖励按职位永久记录一次', () => {
  const player = { 势力: '摇光圣地', 势力职位: '外门弟子' };
  assert.equal(hasClaimedFactionPositionReward(player, '摇光圣地', '内门弟子'), false);
  recordFactionPositionReward(player, '摇光圣地', '内门弟子');
  assert.equal(hasClaimedFactionPositionReward(player, '摇光圣地', '内门弟子'), true);
});

test('旧玩家脱离时按当前职位锁定已越过的晋升奖励', () => {
  const player = { 势力: '瑶池', 势力职位: '真传女弟子' };
  applyFactionExit(player, 3_000_000);
  assert.equal(hasClaimedFactionPositionReward(player, '瑶池', '正式女弟子'), true);
  assert.equal(hasClaimedFactionPositionReward(player, '瑶池', '真传女弟子'), true);
  assert.equal(hasClaimedFactionPositionReward(player, '瑶池', '圣女'), false);
});

test('势力俸禄日期兼容完整日期与旧的日号标记', () => {
  const now = 1_700_000_000_000;
  const today = getFactionDateKey(now);
  assert.equal(wasFactionRewardClaimedToday(today, now), true);
  assert.equal(wasFactionRewardClaimedToday(String(today.slice(-2)), now), true);
  assert.equal(wasFactionRewardClaimedToday('1999-01-01', now), false);
});