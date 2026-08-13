import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createShengxuMonster,
  getShengxuDungeon,
  resolveShengxuDungeonReward,
} from '../model/shengxuContent.js';
import {
  STONE_JAR_OPPORTUNITY,
  claimShengxuOpportunityState,
  defaultShengxuOpportunityState,
} from '../model/shengxuOpportunity.js';

test('shengxu dungeons scale monsters from player attributes', () => {
  const dungeon = getShengxuDungeon('昆仑山');
  const monster = createShengxuMonster({ 攻击: 1000, 防御: 800, 血量上限: 5000 }, dungeon);
  assert.equal(monster.名号, '昆仑兽王');
  assert.equal(monster.攻击, 720);
  assert.equal(monster.当前血量, 3600);
});

test('dungeon inheritance drops use configured probability', () => {
  const dungeon = getShengxuDungeon('魂河古地');
  assert.equal(resolveShengxuDungeonReward(dungeon, () => 0).gongfa, '盗引呼吸法');
  assert.equal(resolveShengxuDungeonReward(dungeon, () => 1).gongfa, '');
});

test('a unique opportunity has only one global owner', () => {
  const state = defaultShengxuOpportunityState();
  assert.equal(claimShengxuOpportunityState(state, STONE_JAR_OPPORTUNITY, '10001', 1).ok, true);
  const second = claimShengxuOpportunityState(state, STONE_JAR_OPPORTUNITY, '10002', 2);
  assert.equal(second.ok, false);
  assert.equal(second.ownerId, '10001');
});
