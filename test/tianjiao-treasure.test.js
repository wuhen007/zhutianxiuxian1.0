import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TREASURE_DAO_HEARTS,
  createTreasureContest,
  injectTianjiaoContestants,
  isTianjiaoContestant,
  rankTreasureContest,
  settleTreasureContest,
} from '../model/innateTreasureContest.js';
import {
  clearTianjiaoTreasure,
  mountTianjiaoTreasure,
  rollTianjiaoTreasureRecovery,
} from '../model/tianjiaoTreasure.js';

const SAMPLE_TIANJIAO = [
  { 名号: '华云飞', 位面: 2, mijinglevel_id: 12, xiangulevel_id: 1 },
  { 名号: '霸王浑战', 位面: 2.5, mijinglevel_id: 15, xiangulevel_id: 1 },
  { 名号: '猪咪岁岁', 位面: 1, mijinglevel_id: 8, xiangulevel_id: 1 }, // 非独立天骄，不应参与
];

test('注入天骄 AI 竞争者：档案完整且仅限独立天骄', () => {
  const contest = createTreasureContest('混沌珠', 1000);
  const entrants = injectTianjiaoContestants(contest, '混沌珠', SAMPLE_TIANJIAO, { random: () => 0.5 });
  assert.ok(entrants.length >= 1 && entrants.length <= 3);
  for (const entrant of entrants) {
    assert.equal(entrant.isTianjiao, true);
    assert.ok(String(entrant.qq).startsWith('tianjiao:'));
    assert.equal(Object.keys(entrant.trials).length, 3, '天骄应完成三次试炼');
    assert.ok(entrant.trialScore >= 40 && entrant.trialScore <= 60, `trialScore 应在 [40,60]，实际 ${entrant.trialScore}`);
    assert.ok(TREASURE_DAO_HEARTS.includes(entrant.daoHeart));
    assert.ok(Number(entrant.contribution) >= 1);
  }
  const names = entrants.map(e => e.name);
  assert.ok(!names.includes('猪咪岁岁'), '非独立天骄（位面1）不应参与择主之争');
});

test('天骄注入不推进破封进度（sealProgress 由玩家驱动）', () => {
  const contest = createTreasureContest('盘古幡', 1000);
  injectTianjiaoContestants(contest, '盘古幡', SAMPLE_TIANJIAO, { random: () => 0.5 });
  assert.equal(contest.sealProgress, 0);
});

test('天骄竞争者进入排名，且无人竞争时可夺冠', () => {
  const contest = createTreasureContest('诛仙四剑', 1000);
  const entrants = injectTianjiaoContestants(contest, '诛仙四剑', SAMPLE_TIANJIAO, { random: () => 0.3 });
  assert.ok(entrants.length > 0);
  const rankings = rankTreasureContest(contest, '诛仙四剑', 'event-1');
  assert.ok(rankings.length >= entrants.length, '排名应包含全部天骄');
  const settlement = settleTreasureContest(contest, '诛仙四剑', 'event-1', 2000);
  assert.equal(settlement.ok, true);
  assert.ok(settlement.winner, '无人竞争时天骄应夺冠');
  assert.ok(isTianjiaoContestant(settlement.winner.qq));
  assert.ok(entrants.map(e => e.name).includes(settlement.winner.name), '胜者应为参与竞争的天骄');
});

test('玩家低分时天骄可压倒夺冠', () => {
  const contest = createTreasureContest('混沌珠', 1000);
  injectTianjiaoContestants(contest, '混沌珠', SAMPLE_TIANJIAO, { random: () => 0.5 });
  contest.participants['12345'] = {
    qq: '12345',
    name: '弱鸡修士',
    joinedAt: 900,
    trials: {
      battle: { tag: '力', score: 4 },
      insight: { tag: '悟', score: 9 },
      support: { tag: '德', score: 18 },
    },
    trialScore: 31,
    contribution: 1,
    daoHeart: '逍遥天地',
  };
  const settlement = settleTreasureContest(contest, '混沌珠', 'event-2', 2000);
  assert.ok(settlement.winner, '应有胜者');
  assert.ok(isTianjiaoContestant(settlement.winner.qq), '天骄应凭实力压倒低分玩家');
});

test('mountTianjiaoTreasure 挂载至宝并记录夺宝凭证', () => {
  const tianjiao = { 名号: '华云飞', 轮回世数: 2 };
  const result = mountTianjiaoTreasure(tianjiao, '混沌珠', 5000);
  assert.ok(result);
  assert.equal(tianjiao.当前先天至宝, '混沌珠');
  assert.equal(tianjiao.天骄夺宝.至宝名, '混沌珠');
  assert.equal(tianjiao.天骄夺宝.轮回世数, 2);
  assert.equal(mountTianjiaoTreasure(tianjiao, '不存在的至宝'), null, '非法至宝名应拒绝');
});

test('clearTianjiaoTreasure 清理持宝状态', () => {
  const tianjiao = { 名号: '华云飞', 当前先天至宝: '混沌珠', 天骄夺宝: { 至宝名: '混沌珠' } };
  assert.equal(clearTianjiaoTreasure(tianjiao), true);
  assert.equal(tianjiao.当前先天至宝, undefined);
  assert.equal(tianjiao.天骄夺宝, undefined);
  assert.equal(clearTianjiaoTreasure(tianjiao), false, '无持宝状态时应返回 false');
});

test('rollTianjiaoTreasureRecovery：未持宝拒绝 / 概率夺回 / 失败保留', () => {
  const tianjiao = { 名号: '霸王浑战', 当前先天至宝: '盘古幡', 天骄夺宝: { 至宝名: '盘古幡' } };
  const miss = rollTianjiaoTreasureRecovery({ 名号: '逍遥子' }, () => 0, 0.8);
  assert.equal(miss.ok, false);
  assert.equal(miss.reason, 'no_claim');

  const hit = rollTianjiaoTreasureRecovery(tianjiao, () => 0.1, 0.8);
  assert.equal(hit.ok, true);
  assert.equal(hit.recovered, true);
  assert.equal(hit.treasureName, '盘古幡');
  assert.equal(tianjiao.当前先天至宝, undefined, '夺回成功应清空天骄持宝');

  const tianjiao2 = { 名号: '十冠王天子', 当前先天至宝: '东皇钟', 天骄夺宝: { 至宝名: '东皇钟' } };
  const fail = rollTianjiaoTreasureRecovery(tianjiao2, () => 0.99, 0.8);
  assert.equal(fail.ok, true);
  assert.equal(fail.recovered, false);
  assert.equal(tianjiao2.当前先天至宝, '东皇钟', '夺回失败应保留天骄持宝，待转世释放');
});
