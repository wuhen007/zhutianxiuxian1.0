import assert from 'node:assert/strict';
import test from 'node:test';

import {
  averageTopPlayers,
  createRiftGuardian,
  getCombatPower,
  getEliteAverage,
  getGuardianPower,
  getUnitSpeed,
  GUARD_FALLBACK_AVERAGE,
  judgeGuardBattle,
  RIFT_GUARDIAN_PROFILES,
  resolveGuardBattle,
} from '../model/riftGuardian.js';
import {
  beginRiftExpedition,
  exploreRift,
  getDefaultRiftState,
  rollPeriodicRifts,
} from '../model/planeRiftFestival.js';

function buildPlayers() {
  // 12 名玩家，攻击递增；战力前 10 = 攻击 3000..12000
  const players = [];
  for (let i = 1; i <= 12; i++) {
    players.push({
      攻击: 1000 * i,
      防御: 800,
      血量上限: 2000,
      暴击率: 0.3,
      暴击伤害: 1.5,
      mijinglevel_id: 2,
      xiangulevel_id: 3,
    });
  }
  return players;
}

const SAMPLE_AVERAGE = {
  攻击: 1000,
  防御: 1000,
  血量上限: 2000,
  暴击率: 0.2,
  暴击伤害: 1.5,
  mijinglevel_id: 2,
  xiangulevel_id: 3,
};

test('getCombatPower 与 GetPower 公式一致', () => {
  const unit = { 攻击: 1000, 防御: 500, 血量上限: 2000, 暴击率: 0.2 };
  assert.equal(getCombatPower(unit), 3120);
});

test('getUnitSpeed 为 100 + 秘境等级×50 + 仙古等级×50', () => {
  assert.equal(getUnitSpeed({ mijinglevel_id: 2, xiangulevel_id: 3 }), 350);
  assert.equal(getUnitSpeed({ 速度: 200, mijinglevel_id: 2, xiangulevel_id: 3 }), 450);
});

test('averageTopPlayers 取战力前 10 全属性均值', () => {
  const avg = averageTopPlayers(buildPlayers(), 10);
  assert.equal(avg.攻击, 7500);
  assert.equal(avg.防御, 800);
  assert.equal(avg.血量上限, 2000);
  assert.equal(avg.mijinglevel_id, 2);
  assert.equal(avg.xiangulevel_id, 3);
  assert.equal(avg.samples, 10);
});

test('averageTopPlayers 无有效玩家时回退兜底值', () => {
  const avg = averageTopPlayers([{ 攻击: 0, 血量上限: 0 }]);
  assert.equal(avg.攻击, GUARD_FALLBACK_AVERAGE.攻击);
  assert.equal(avg.samples, 0);
});

test('getEliteAverage 支持注入玩家，避免读盘', () => {
  const avg = getEliteAverage({ players: buildPlayers(), topN: 10 });
  assert.equal(avg.攻击, 7500);
  assert.equal(avg.samples, 10);
});

test('createRiftGuardian 第一层按系数生成战斗单位', () => {
  const g = createRiftGuardian(1, SAMPLE_AVERAGE);
  assert.equal(g.名号, '界隙·蚀骸卫');
  assert.equal(g.攻击, 700);
  assert.equal(g.防御, 800);
  assert.equal(g.血量上限, 1700);
  assert.equal(g.暴击率, 0.12);
  assert.equal(g.暴击伤害, 1.3);
  assert.equal(g.mijinglevel_id, 2);
  assert.equal(g.xiangulevel_id, 3);
  assert.equal(g.战力, 2643);
  assert.equal(g.实际速度, 350);
  assert.equal(g.灵根.name, '界隙蚀骸');
  assert.ok(g.学习的功法.includes('斗战金身'));
});

test('createRiftGuardian 层数越深战力越高，且越界层数被钳制', () => {
  const first = createRiftGuardian(1, SAMPLE_AVERAGE);
  const second = createRiftGuardian(2, SAMPLE_AVERAGE);
  const third = createRiftGuardian(3, SAMPLE_AVERAGE);
  assert.ok(second.战力 > first.战力);
  assert.ok(third.战力 > second.战力);
  assert.equal(createRiftGuardian(0, SAMPLE_AVERAGE).名号, RIFT_GUARDIAN_PROFILES[0].名号);
  assert.equal(createRiftGuardian(99, SAMPLE_AVERAGE).名号, RIFT_GUARDIAN_PROFILES[2].名号);
});

test('judgeGuardBattle 胜/险胜/败与收益缩放', () => {
  const g = createRiftGuardian(1, SAMPLE_AVERAGE);
  const raw = getGuardianPower(g);
  const rng = () => 0.5; // swing = 1

  const win = judgeGuardBattle(raw * 2, g, { random: rng });
  assert.equal(win.outcome, 'win');
  assert.equal(win.lootScale, 1.15);
  assert.equal(win.hpLoss, 0.03);
  assert.equal(win.contributionBonus, 2);

  const narrow = judgeGuardBattle(Math.round(raw * 0.9), g, { random: rng });
  assert.equal(narrow.outcome, 'narrow');
  assert.equal(narrow.lootScale, 0.7);
  assert.equal(narrow.hpLoss, 0.12);
  assert.equal(narrow.contributionBonus, 1);

  const lose = judgeGuardBattle(1, g, { random: rng });
  assert.equal(lose.outcome, 'lose');
  assert.equal(lose.lootScale, 0);
  assert.equal(lose.hpLoss, 0.25);
  assert.equal(lose.contributionBonus, 0);
});

test('judgeGuardBattle 守卫战力带 ±10% 临场波动', () => {
  const g = createRiftGuardian(1, SAMPLE_AVERAGE);
  const raw = getGuardianPower(g);
  const low = judgeGuardBattle(raw, g, { random: () => 0 });
  const high = judgeGuardBattle(raw, g, { random: () => 1 });
  assert.ok(low.guardPower < raw);
  assert.ok(high.guardPower > raw);
});

test('真实守卫战斗按剩余血量裁决并统计双方实际伤害', () => {
  const player = { 当前血量: 1000 };
  const guardian = { 当前血量: 2000, 血量上限: 2000 };

  const win = resolveGuardBattle(player, guardian, {
    winner: 'A', A_hp: 700, B_hp: 0, totalDamageTaken: 2300,
  });
  assert.equal(win.outcome, 'win');
  assert.equal(win.playerHp, 700);
  assert.equal(win.damageTaken, 300);
  assert.equal(win.damageDealt, 2300);

  const narrow = resolveGuardBattle(player, guardian, { winner: 'A', A_hp: 300, B_hp: 0 });
  assert.equal(narrow.outcome, 'narrow');
  assert.equal(narrow.lootScale, 0.7);

  const lose = resolveGuardBattle(player, guardian, { winner: 'B', A_hp: 0, B_hp: 800 });
  assert.equal(lose.outcome, 'lose');
  assert.equal(lose.playerHp, 1);
  assert.equal(lose.damageTaken, 1000);
  assert.equal(lose.damageDealt, 1200);
  assert.throws(
    () => resolveGuardBattle(player, guardian, { winner: 'A', A_hp: NaN, B_hp: 0 }),
    /无效血量/
  );
});

test('强攻路线优先使用真实战斗裁决，不再由战力覆盖胜负', () => {
  const state = getDefaultRiftState();
  const [rift] = rollPeriodicRifts(state, 2000, { random: () => 0, now: 100 }).opened;
  beginRiftExpedition(state, rift.id, 'real-battle', 100);
  const guardian = createRiftGuardian(1, SAMPLE_AVERAGE);
  const combatVerdict = resolveGuardBattle(
    { 当前血量: 1000 },
    guardian,
    { winner: 'A', A_hp: 900, B_hp: 0 }
  );

  const result = exploreRift(state, rift.id, 'real-battle', '强攻', {
    random: () => 0.5,
    realmLevel: 16,
    now: 100,
    guardian,
    combatPower: 0,
    combatVerdict,
  });
  assert.equal(result.success, true);
  assert.equal(result.disturbance.verdict.resolution, 'battle');
  assert.equal(result.disturbance.verdict.damageDealt, guardian.血量上限);
  assert.equal(result.hpLoss, 0);
});

test('强攻路线兼容旧版战力裁决调用', () => {
  const state = getDefaultRiftState();
  const [rift] = rollPeriodicRifts(state, 2000, { random: () => 0, now: 100 }).opened;
  beginRiftExpedition(state, rift.id, '1', 100);
  const guardian = createRiftGuardian(1, SAMPLE_AVERAGE);

  const win = exploreRift(state, rift.id, '1', '强攻', {
    random: () => 0.5,
    realmLevel: 16,
    now: 100,
    guardian,
    combatPower: 999999,
  });
  assert.equal(win.success, true);
  assert.equal(win.disturbance.type, '裂界守卫');
  assert.equal(win.disturbance.verdict.outcome, 'win');
  assert.equal(win.hpLoss, 0.03);
  assert.equal(win.gained, 9);

  // 第二层再战，可被轰出
  const lose = exploreRift(state, rift.id, '1', '强攻', {
    random: () => 0.5,
    realmLevel: 16,
    now: 100,
    guardian: createRiftGuardian(2, SAMPLE_AVERAGE),
    combatPower: 1,
  });
  assert.equal(lose.success, false);
  assert.equal(lose.disturbance.verdict.outcome, 'lose');
  assert.equal(lose.hpLoss, 0.25);
});
