import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createTreasureContest,
  createTreasureGuardian,
  getManifestedTreasureNames,
  getRevealedTreasureClues,
  joinTreasureContest,
  performTreasureTrial,
  placeTreasureDaoHeart,
  rankTreasureContest,
  registerTianjiTreasureEvent,
  settleTreasureContest,
} from '../model/innateTreasureContest.js';

test('显化中及结算待落盘的至宝都继续占用同名至宝', () => {
  const names = getManifestedTreasureNames([
    { type: 'treasureAppear', treasure: { name: '混沌珠' }, contest: { status: 'open' } },
    { type: 'treasureAppear', treasure: { name: '盘古幡' }, contest: { status: 'settled' } },
    { type: 'sectWar' },
  ]);
  assert.deepEqual([...names], ['混沌珠', '盘古幡']);
});

test('随机事件与天机购买共用至宝事件登记锁', () => {
  const source = fs.readFileSync(new URL('../apps/tasks/RealmEvents.js', import.meta.url), 'utf8');
  assert.equal(source.match(/withPlayerMutationLock\(REALM_EVENT_REGISTRATION_LOCK/g)?.length, 2);
});

test('守护灵按难度动态缩放且不继承玩家技能与至宝', () => {
  const player = {
    攻击: 1000,
    防御: 800,
    血量上限: 2000,
    学习的功法: ['帝经'],
    当前先天至宝: '太极图',
  };
  const normal = createTreasureGuardian(player, '普通', '盘古幡');
  const extreme = createTreasureGuardian(player, '绝境', '盘古幡');
  assert.equal(normal.攻击, 700);
  assert.equal(normal.防御, 560);
  assert.equal(normal.血量上限, 1500);
  assert.equal(extreme.攻击, 1200);
  assert.equal(extreme.防御, 919);
  assert.equal(extreme.血量上限, 2500);
  assert.deepEqual(extreme.学习的功法, []);
  assert.equal(extreme.当前先天至宝, '');
});

test('报名夺宝不会直接取得至宝，必须完成三种试炼并立道心', () => {
  const contest = createTreasureContest('太极图', 1000);
  assert.equal(joinTreasureContest(contest, '10001', '无涯道人', 1001).ok, true);
  assert.deepEqual(rankTreasureContest(contest, '太极图', 1000), []);

  assert.equal(performTreasureTrial(contest, '太极图', '10001', 'battle', {
    difficulty: '普通', healthRatio: 1, now: 1002,
  }, () => 0).ok, true);
  assert.equal(performTreasureTrial(contest, '太极图', '10001', 'insight', {
    choice: '衡', now: 1003,
  }).ok, true);
  assert.equal(placeTreasureDaoHeart(contest, '10001', '参悟大道', 1004).reason, 'trials_required');
  assert.equal(performTreasureTrial(contest, '太极图', '10001', 'support', {
    contribution: 10, resourceLabel: '200万源石', now: 1005,
  }).ok, true);
  assert.equal(placeTreasureDaoHeart(contest, '10001', '参悟大道', 1006).ok, true);

  const rankings = rankTreasureContest(contest, '太极图', 1000);
  assert.equal(rankings.length, 1);
  assert.equal(rankings[0].trialScore, 50);
  assert.equal(rankings[0].affinity, 20);
  assert.equal(rankings[0].contribution, 10);
});

test('每人只有三次天机行动，同类试炼不能重复', () => {
  const contest = createTreasureContest('盘古幡', 2000);
  joinTreasureContest(contest, '10002', '开天者', 2001);
  assert.equal(performTreasureTrial(contest, '盘古幡', '10002', 'battle', {
    difficulty: '绝境', healthRatio: 1,
  }, () => 0).ok, true);
  assert.equal(performTreasureTrial(contest, '盘古幡', '10002', 'battle', {
    difficulty: '普通', healthRatio: 1,
  }, () => 0).reason, 'duplicate_trial');
  performTreasureTrial(contest, '盘古幡', '10002', 'insight', { choice: '劈开' });
  performTreasureTrial(contest, '盘古幡', '10002', 'fate', {}, () => 0.9);
  assert.equal(performTreasureTrial(contest, '盘古幡', '10002', 'support', {
    contribution: 10,
  }).reason, 'limit');
});

test('封印线索随全服破解进度显露且结算结果固定', () => {
  const contest = createTreasureContest('山河社稷图', 3000);
  joinTreasureContest(contest, '10003', '山河客', 3001);
  performTreasureTrial(contest, '山河社稷图', '10003', 'insight', { choice: '共生' });
  performTreasureTrial(contest, '山河社稷图', '10003', 'support', { contribution: 8 });
  performTreasureTrial(contest, '山河社稷图', '10003', 'fate', {}, () => 0.9);
  placeTreasureDaoHeart(contest, '10003', '守护苍生', 3002);
  assert.equal(getRevealedTreasureClues('山河社稷图', 24).length, 0);
  assert.equal(getRevealedTreasureClues('山河社稷图', 25).length, 1);
  assert.equal(getRevealedTreasureClues('山河社稷图', 75).length, 2);

  const first = settleTreasureContest(contest, '山河社稷图', 3000, 4000);
  const second = settleTreasureContest(contest, '山河社稷图', 3000, 5000);
  assert.equal(first.winner.qq, '10003');
  assert.deepEqual(second.rankings, first.rankings);
  assert.equal(second.alreadySettled, true);
});

test('购买天机生成的至宝会登记为新的活跃位面事件', () => {
  const config = { eventHistory: [], activeEvents: [] };
  const result = registerTianjiTreasureEvent(config, [], {
    eventData: {
      type: 'treasureAppear',
      treasure: { name: '混沌珠' },
      plane: '遮天位面',
      coordinate: { x: 227, y: 116 },
    },
    message: '至宝出世',
  }, { qq: '10001', name: '问道者' });

  assert.equal(result.ok, true);
  assert.equal(result.eventData.source, 'tianji');
  assert.equal(result.eventData.awakenedBy.name, '问道者');
  assert.equal(config.activeEvents.length, 1);
  assert.equal(config.eventHistory[0].treasure.name, '混沌珠');
  assert.match(result.message, /令一件蛰伏于诸天的先天至宝显化/);
});

test('天机购买者在择主之争中凭信息差获得额外加分', () => {
  const config = { eventHistory: [], activeEvents: [] };
  const result = registerTianjiTreasureEvent(config, [], {
    eventData: {
      type: 'treasureAppear',
      treasure: { name: '混沌珠' },
      contest: createTreasureContest('混沌珠', 5000),
      plane: '遮天位面',
      coordinate: { x: 227, y: 116 },
    },
    message: '至宝出世',
  }, { qq: '10001', name: '问道者' });

  const contest = result.eventData.contest;
  assert.equal(contest.tianjiBuyer.qq, '10001');

  // 购买者与普通玩家执行完全相同的试炼
  joinTreasureContest(contest, '10001', '问道者', 5001);
  joinTreasureContest(contest, '10002', '路人甲', 5001);
  for (const qq of ['10001', '10002']) {
    performTreasureTrial(contest, '混沌珠', qq, 'battle', {
      difficulty: '普通', healthRatio: 1, now: 5002,
    }, () => 0);
    performTreasureTrial(contest, '混沌珠', qq, 'insight', { choice: '归一', now: 5003 });
    performTreasureTrial(contest, '混沌珠', qq, 'support', { contribution: 10, now: 5004 });
    placeTreasureDaoHeart(contest, qq, '逍遥天地', 5005);
  }

  const rankings = rankTreasureContest(contest, '混沌珠', 5000);
  const buyer = rankings.find(item => item.qq === '10001');
  const other = rankings.find(item => item.qq === '10002');
  assert.equal(buyer.tianjiBonus, 8);
  assert.equal(other.tianjiBonus, 0);
  // 相同试炼行动下，仅天机加分不同；运气按 QQ 哈希，两差值 = 8 + 运气差（最小仍为3，购买者必然领先）
  assert.equal(buyer.trialScore, other.trialScore);
  assert.equal(buyer.affinity, other.affinity);
  assert.equal(buyer.contribution, other.contribution);
  assert.equal(buyer.total - other.total, 8 + buyer.luck - other.luck);
  assert.ok(buyer.total > other.total);
  assert.equal(rankings[0].qq, '10001');
});
