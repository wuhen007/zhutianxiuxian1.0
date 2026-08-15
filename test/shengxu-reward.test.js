import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BREATHING_PAGE_REQUIRE,
  collectBreathingPage,
  ensureBreathingPages,
  getShengxuDungeon,
  resolveShengxuDungeonReward,
  synthesizeBreathingMethod,
} from '../model/shengxuContent.js';

test('dungeon reward includes resources scaling with level', () => {
  const reward = resolveShengxuDungeonReward(getShengxuDungeon('太行山'), () => 1);
  assert.equal(reward.medium, '普通进化花粉');
  assert.equal(reward.xiuwei, 5000000 * 2); // requiredLevel 2
  assert.equal(reward.xueqi, 5000000 * 2);
  assert.equal(reward.lingshi, 2000000 * 2);
  assert.equal(reward.herb, ''); // random=1 不触发
  assert.equal(reward.gongfa, ''); // random=1 不触发

  const high = resolveShengxuDungeonReward(getShengxuDungeon('魂河古地'), () => 0);
  assert.equal(high.xiuwei, 5000000 * 17);
  assert.equal(high.herb, '本源圣药'); // random=0 触发 10%
  assert.equal(high.gongfa, '盗引呼吸法'); // random=0 触发 3%
});

test('herb drops only on high-tier dungeons', () => {
  const earth = resolveShengxuDungeonReward(getShengxuDungeon('太行山'), () => 0);
  assert.equal(earth.herb, ''); // 地球篇无本源圣药
  const yang = resolveShengxuDungeonReward(getShengxuDungeon('阳间名山'), () => 0);
  assert.equal(yang.herb, '本源圣药'); // 阳间名山 5%
});

test('breathing pages collect per dungeon gongfa', () => {
  const player = { 学习的功法: ['基础呼吸法'], 进化积淀: 10 };
  const first = collectBreathingPage(player, '形意呼吸法');
  assert.equal(first.ok, true);
  assert.equal(first.learned, false);
  assert.equal(first.count, 1);
  assert.equal(player.呼吸法残页['形意呼吸法'], 1);

  const second = collectBreathingPage(player, '形意呼吸法');
  assert.equal(second.count, 2);
  assert.equal(player.进化积淀, 10); // 未学会时不折现
});

test('collecting page for learned breathing folds into accumulation', () => {
  const player = { 学习的功法: ['形意呼吸法'], 进化积淀: 10 };
  const result = collectBreathingPage(player, '形意呼吸法');
  assert.equal(result.learned, true);
  assert.equal(result.reward, 5);
  assert.equal(player.进化积淀, 15);
  assert.equal(player.呼吸法残页['形意呼吸法'], undefined);
});

test('synthesize requires five pages and grants the breathing method', () => {
  const player = { 学习的功法: ['基础呼吸法'], 呼吸法残页: { '太极呼吸法': 3 } };
  const short = synthesizeBreathingMethod(player, '太极呼吸法');
  assert.equal(short.ok, false);
  assert.equal(short.reason, 'insufficient');

  player.呼吸法残页['太极呼吸法'] = 5;
  const done = synthesizeBreathingMethod(player, '太极呼吸法');
  assert.equal(done.ok, true);
  assert.ok(player.学习的功法.includes('太极呼吸法'));
  assert.equal(player.呼吸法残页['太极呼吸法'], 0);
});

test('breathing pages state is ensured on fresh players', () => {
  const player = {};
  assert.deepEqual(ensureBreathingPages(player), {});
  assert.deepEqual(player.呼吸法残页, {});
  const player2 = { 呼吸法残页: null };
  ensureBreathingPages(player2);
  assert.deepEqual(player2.呼吸法残页, {});
});
