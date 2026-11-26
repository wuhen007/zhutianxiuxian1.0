import test from 'node:test';
import assert from 'node:assert/strict';

import {
  XIANGU_CANON_GOALS,
  XIANGU_LEGACY_EVENTS,
  advanceXianguNpcGoal,
  awardXianguCrown,
  ensureXianguLegacy,
  ensureXianguNpcGoals,
  formatXianguLegacy,
  formatXianguNpcGoals,
  hasXianguCrownForRound,
  recordXianguLegacyResult,
} from '../apps/SecretPlace/xianguLegacy.js';

test('每轮初始化六名原著天骄目标，同轮保留进度而换轮重置', () => {
  const world = {};
  const first = ensureXianguNpcGoals(world, 'year-10000');
  assert.equal(Object.keys(first.goals).length, 6);

  first.goals.ningchuan.progress = 1;
  assert.equal(ensureXianguNpcGoals(world, 'year-10000').goals.ningchuan.progress, 1);
  assert.equal(ensureXianguNpcGoals(world, 'year-12000').goals.ningchuan.progress, 0);
});

test('NPC目标只接受对应角色、事件和物品，并在达标后停止累计', () => {
  const state = ensureXianguNpcGoals({}, 'round-a');
  const ignored = advanceXianguNpcGoal(state, {
    actorId: 'gujian_yun',
    type: XIANGU_LEGACY_EVENTS.ITEM_OBTAINED,
    itemName: '真凰翎羽',
  });
  assert.equal(ignored.updated, false);

  let completed;
  for (let index = 0; index < XIANGU_CANON_GOALS.gujian_yun.target; index++) {
    completed = advanceXianguNpcGoal(state, {
      actorId: '孤剑云',
      type: XIANGU_LEGACY_EVENTS.ITEM_OBTAINED,
      itemName: '剑谷剑意碎片',
      at: 1234,
    });
  }
  assert.equal(completed.completedNow, true);
  assert.equal(completed.goal.progress, 3);
  assert.equal(completed.goal.completedAt, 1234);

  const repeated = advanceXianguNpcGoal(state, {
    actorId: 'gujian_yun',
    type: XIANGU_LEGACY_EVENTS.ITEM_OBTAINED,
    itemName: '剑谷剑意碎片',
  });
  assert.equal(repeated.updated, false);
});

test('击杀与擂台胜绩可累计到任意玩家或NPC持久对象', () => {
  const player = { 名号: '荒' };
  recordXianguLegacyResult(player, { roundId: 'round-a', type: XIANGU_LEGACY_EVENTS.ARENA_WIN, amount: 2 });
  recordXianguLegacyResult(player, { roundId: 'round-a', type: XIANGU_LEGACY_EVENTS.PLAYER_KILL });
  recordXianguLegacyResult(player, { roundId: 'round-b', type: XIANGU_LEGACY_EVENTS.NPC_KILL, amount: 3 });

  assert.deepEqual(player.xiangu_legacy.totals, { arenaWins: 2, playerKills: 1, npcKills: 3 });
  assert.equal(player.xiangu_legacy.rounds.length, 2);
  assert.match(formatXianguLegacy(player, 'round-a'), /擂台2胜/);
});

test('同一轮最多增加一冠，跨轮继续累计', () => {
  const player = { 名号: '荒' };
  assert.equal(awardXianguCrown(player, { roundId: 'round-a', at: 100 }).awarded, true);
  assert.equal(awardXianguCrown(player, { roundId: 'round-a', at: 200 }).awarded, false);
  assert.equal(awardXianguCrown(player, { roundId: 'round-b', at: 300 }).title, '二冠王');
  assert.equal(player.xiangu_legacy.crowns, 2);
});

test('终极造化门槛只认本轮 crowned，不读取永久冠数或佩戴称号', () => {
  const player = { 名号: '荒', title: '仙古第一' };
  awardXianguCrown(player, { roundId: 'round-old', at: 100 });
  assert.equal(hasXianguCrownForRound(player, 'round-old'), true);
  assert.equal(hasXianguCrownForRound(player, 'round-new'), false);
  player.xiangu_legacy.crowns = 99;
  assert.equal(hasXianguCrownForRound(player, 'round-new'), false);
});

test('十冠王和宁川保留原著历史冠数，目标展示包含行动地点', () => {
  assert.equal(ensureXianguLegacy({ id: 'shiguanwang_tianzi' }).crowns, 10);
  assert.equal(ensureXianguLegacy({ name: '六冠王宁川' }).crowns, 6);

  const state = ensureXianguNpcGoals({}, 'last-open');
  const text = formatXianguNpcGoals(state);
  assert.match(text, /十冠王天子｜仙古擂台/);
  assert.match(text, new RegExp(XIANGU_CANON_GOALS.honghuang.objective));
});
