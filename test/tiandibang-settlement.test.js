import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  getTiandibangSettlementKey,
  getTiandibangWeekKey,
  getTiandibangWinners,
} from '../model/tiandibang.js';

const tiandibangSource = fs.readFileSync(
  new URL('../apps/Tiandibang/Tiandibang.js', import.meta.url),
  'utf8'
);

test('天地榜每周任务直接注册奖励结算函数', () => {
  assert.match(
    tiandibangSource,
    /this\.task\s*=\s*\[\{[\s\S]{0,200}fnc:\s*\(\)\s*=>\s*this\.resetChallengeAndReward\(\)/
  );
  assert.doesNotMatch(tiandibangSource, /this\.task2\s*=/);
});

test('天地榜按自然周生成稳定结算键', () => {
  assert.equal(getTiandibangWeekKey(new Date(2026, 7, 2, 23, 59)), '2026-07-27');
  assert.equal(getTiandibangWeekKey(new Date(2026, 7, 3, 0, 0)), '2026-08-03');
  assert.equal(getTiandibangSettlementKey(new Date(2026, 7, 3, 0, 0)), '2026-07-27');
  assert.equal(getTiandibangSettlementKey(new Date(2026, 7, 4, 12, 0)), '2026-07-27');
});

test('天地榜只奖励正积分玩家并按积分排序', () => {
  const winners = getTiandibangWinners([
    { qq: 'zero', 积分: 0 },
    { qq: 'second', 积分: 20 },
    { qq: 'fourth', 积分: 5 },
    { qq: 'first', 积分: 30 },
    { qq: 'third', 积分: 10 },
  ]);
  assert.deepEqual(winners.map(player => player.qq), ['first', 'second', 'third']);
});
