import assert from 'node:assert/strict';
import test from 'node:test';

import {
  XIANGU_HEAVY_INJURY_MS,
  applyXianguHeavyInjury,
  buildXianguArenaRewardPlan,
  buildXianguBattleSides,
  buildXianguCombatant,
  getXianguExploreEfficiency,
  recordXianguArenaWin,
  resolveXianguLeaderWinner,
} from '../apps/SecretPlace/xianguCombat.js';

test('仙古战斗单位保留完整状态并规范战斗字段', () => {
  const shenhuo = { 已点燃: true, 专属技能: '万火共鸣' };
  const source = {
    id: 'old-id',
    名号: '石昊',
    攻击: 123456,
    防御: 654321,
    当前血量: 800,
    血量上限: 1000,
    速度: 777,
    灵根: { name: '至尊骨', 法球倍率: 0.35 },
    学习的功法: { 鲲鹏宝术: {}, 草字剑诀: {} },
    xiangu_xianqi: 3,
    xiangu_shenhuo: shenhuo,
    道途: { stages: { kingDao: 1 } },
    当前先天至宝: '盘古幡',
    先天权柄: { 盘古开天待用: true },
  };

  const combatant = buildXianguCombatant(source, 'player-1');

  assert.equal(combatant.id, 'player-1');
  assert.equal(combatant.攻击, source.攻击, '不应重复叠加装备面板');
  assert.equal(combatant.防御, source.防御, '不应重复叠加装备面板');
  assert.equal(combatant.法球倍率, 0.35);
  assert.deepEqual(combatant.学习的功法, ['鲲鹏宝术', '草字剑诀']);
  assert.equal(combatant.xiangu_xianqi, 3);
  assert.equal(combatant.xiangu_shenhuo, shenhuo);
  assert.deepEqual(combatant.道途, source.道途);
  assert.equal(combatant.当前先天至宝, '盘古幡');
  assert.deepEqual(combatant.先天权柄, source.先天权柄);
});

function teammateOwner() {
  return {
    id: 'player-1',
    名号: '玩家',
    攻击: 100,
    防御: 50,
    当前血量: 500,
    血量上限: 500,
    xiangu_teammate: 'npc-1',
    xiangu_teammate_name: '十冠王',
    xiangu_teammate_data: {
      名号: '十冠王',
      攻击: 80,
      防御: 40,
      当前血量: 300,
      血量上限: 300,
      学习的功法: ['世界树宝术'],
    },
    xiangu_teammate_betray_chance: 0.3,
  };
}

const enemy = {
  名号: '仙古遗种',
  攻击: 60,
  防御: 30,
  当前血量: 400,
  血量上限: 400,
};

test('NPC队友正常助战且只消费一次', () => {
  const player = teammateOwner();
  const first = buildXianguBattleSides(player, enemy, {
    attackerId: player.id,
    random: () => 0.9,
  });

  assert.ok(Array.isArray(first.A));
  assert.deepEqual(first.A.map(unit => unit.名号), ['玩家', '十冠王']);
  assert.equal(Array.isArray(first.B), false);
  assert.match(first.messages.join('\n'), /并肩而战/);
  assert.equal(player.xiangu_teammate, null);
  assert.equal(player.xiangu_teammate_data, null);
  assert.equal(player.xiangu_teammate_betray_chance, 0);

  const second = buildXianguBattleSides(player, enemy, {
    attackerId: player.id,
    random: () => 0.9,
  });
  assert.equal(Array.isArray(second.A), false);
  assert.deepEqual(second.messages, []);
});

test('心术不正的NPC队友会倒戈加入敌方', () => {
  const player = teammateOwner();
  const sides = buildXianguBattleSides(player, enemy, {
    attackerId: player.id,
    random: () => 0,
  });

  assert.equal(Array.isArray(sides.A), false);
  assert.ok(Array.isArray(sides.B));
  assert.deepEqual(sides.B.map(unit => unit.名号), ['仙古遗种', '十冠王']);
  assert.match(sides.messages.join('\n'), /临阵倒戈/);
  assert.equal(player.xiangu_teammate, null);
  assert.equal(player.xiangu_teammate_data, null);
});

test('重伤令探索效率降低一半并在三十分钟后到期', () => {
  const now = 1_000_000;
  const player = {};
  const debuff = applyXianguHeavyInjury(player, now);

  assert.equal(debuff.exploreEfficiency, 0.5);
  assert.equal(debuff.expiresAt, now + XIANGU_HEAVY_INJURY_MS);
  assert.equal(getXianguExploreEfficiency(player, now), 0.5);
  assert.equal(
    getXianguExploreEfficiency(player, now + XIANGU_HEAVY_INJURY_MS - 1),
    0.5,
  );
  assert.equal(getXianguExploreEfficiency(player, now + XIANGU_HEAVY_INJURY_MS), 1);
  assert.equal(player.xiangu_gains.debuff, undefined);
});

test('单挑沿用战斗胜方，团队仅在胜方队长存活时认定胜利', () => {
  assert.equal(resolveXianguLeaderWinner({ winner: 'A', A_hp: 10, B_hp: 0 }), 'A');
  assert.equal(resolveXianguLeaderWinner({ winner: 'B', A_hp: 0, B_hp: 10 }), 'B');
  assert.equal(resolveXianguLeaderWinner({ winner: 'draw', A_hp: 10, B_hp: 10 }), 'draw');

  assert.equal(resolveXianguLeaderWinner({
    winner: 'A',
    A_team: [{ 名号: '进攻队长', 当前血量: 1 }, { 名号: '队友', 当前血量: 100 }],
    B_team: [{ 名号: '防守队长', 当前血量: 0 }],
  }), 'A');
  assert.equal(resolveXianguLeaderWinner({
    winner: 'A',
    A_team: [{ 名号: '进攻队长', 当前血量: 0 }, { 名号: '队友', 当前血量: 100 }],
    B_team: [{ 名号: '防守队长', 当前血量: 0 }],
  }), 'draw');
  assert.equal(resolveXianguLeaderWinner({
    winner: 'B',
    A_team: [{ 名号: '进攻队长', 当前血量: 0 }],
    B_team: [{ 名号: '防守队长', 当前血量: '1' }, { 名号: '队友', 当前血量: 100 }],
  }), 'B');
  assert.equal(resolveXianguLeaderWinner({
    winner: 'B',
    A_team: [{ 名号: '进攻队长', 当前血量: 0 }],
    B_team: [{ 名号: '防守队长', 当前血量: 0 }, { 名号: '队友', 当前血量: 100 }],
  }), 'draw');
});

test('擂台双方均报名才计分且同一对手不可重复刷胜场', () => {
  const participants = [
    { qq: '1001', name: '甲', wins: 0 },
    { qq: '1002', name: '乙', wins: 0 },
  ];

  assert.equal(recordXianguArenaWin(participants, 1001, 1003), false);
  assert.equal(participants[0].wins, 0);

  assert.equal(recordXianguArenaWin(participants, 1001, 1002), true);
  assert.equal(participants[0].wins, 1);
  assert.deepEqual(participants[0].defeatedOpponents, [1002]);

  assert.equal(recordXianguArenaWin(participants, '1001', '1002'), false);
  assert.equal(participants[0].wins, 1);

  assert.equal(recordXianguArenaWin(participants, '1002', '1001'), true);
  assert.equal(participants[1].wins, 1);
});

test('擂台奖励按当前名次覆盖冠军、前三和参与奖且不修改参赛数组', () => {
  const participants = [
    { qq: '1001', name: '甲', wins: 4 },
    { qq: '1002', name: '乙', wins: 3 },
    { qq: '1003', name: '丙', wins: 2 },
    { qq: '1004', name: '丁', wins: 1 },
  ];
  const original = structuredClone(participants);
  const rewards = {
    winner: { daoyun: 500 },
    top3: { daoyun: 200 },
    runner: { daoyun: 50 },
  };

  const plan = buildXianguArenaRewardPlan(participants, rewards);

  assert.deepEqual(plan.map(item => item.daoyun), [500, 200, 200, 50]);
  assert.deepEqual(participants, original);
  assert.notEqual(plan, participants);
  assert.notEqual(plan[0], participants[0]);
});
