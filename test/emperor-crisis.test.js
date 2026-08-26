import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  applyEmperorDefeatPenalty,
  applyEmperorWorldTripodOpening,
  awakenEmperorCrisis,
  buildEmperorSleepAction,
  confrontEmperorCrisis,
  EMPEROR_CRISIS_GRACE_YEARS,
  EMPEROR_DEFEAT_SLEEP_MS,
  getEmperorChallengeMode,
  getEmperorSleepRemainingMs,
  isImmortalImperialWeapon,
  resolveEmperorCrisis,
} from '../model/emperorCrisis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('帝尊首次出现固定一万年死线，重复感知不会刷新', () => {
  const first = awakenEmperorCrisis(null, 12_345);
  assert.equal(first.awakened, true);
  assert.equal(first.state.deadline, 12_345 + EMPEROR_CRISIS_GRACE_YEARS);
  const repeated = awakenEmperorCrisis(first.state, 20_000);
  assert.equal(repeated.awakened, false);
  assert.equal(repeated.state.deadline, first.state.deadline);
  assert.equal(resolveEmperorCrisis(first.state, first.state.deadline - 1).refined, false);
  assert.equal(resolveEmperorCrisis(first.state, first.state.deadline).refined, true);
});

test('真正迎战会把炼界死线延后一万年', () => {
  const crisis = awakenEmperorCrisis(null, 1_000).state;
  const confrontation = confrontEmperorCrisis(crisis, 5_000);
  assert.equal(confrontation.confronted, true);
  assert.equal(confrontation.state.lastConfrontedAt, 5_000);
  assert.equal(confrontation.state.deadline, 15_000);
  assert.equal(confrontation.state.confrontations, 1);
});

test('帝尊炼界后转为夺回战，败亡后才结束挑战', () => {
  const active = awakenEmperorCrisis(null, 1_000).state;
  const refined = resolveEmperorCrisis(active, active.deadline).state;
  assert.equal(getEmperorChallengeMode(active), 'confront');
  assert.equal(getEmperorChallengeMode(refined), 'reclaim');
  assert.equal(getEmperorChallengeMode({ status: 'defeated' }), null);
});

test('世界鼎强化帝尊并压制未达仙器的帝兵持有者', () => {
  const boss = { 名号: '帝尊', 攻击: 100, 防御: 80, 当前血量: 1_000, 血量上限: 1_000, 速度: 200 };
  const players = [
    { 名号: '极道修士', _帝兵品阶: '极道帝兵', 攻击: 100, 防御: 80, 当前血量: 1_000, 血量上限: 1_000, 速度: 200 },
    { 名号: '仙器修士', _帝兵品阶: '仙器', 攻击: 100, 防御: 80, 当前血量: 1_000, 血量上限: 1_000, 速度: 200 },
  ];
  const result = applyEmperorWorldTripodOpening(boss, players);
  assert.deepEqual(result.suppressed, ['极道修士']);
  assert.equal(boss.攻击, 150);
  assert.equal(boss.速度, 300);
  assert.equal(players[0].攻击, 50);
  assert.equal(players[0].速度, 100);
  assert.equal(players[1].攻击, 100);
  assert.equal(players[1].速度, 200);
  assert.equal(isImmortalImperialWeapon('祭道器'), true);
});

test('帝尊战败惩罚结算五点道伤、三项枯竭与两小时沉眠', () => {
  const now = 1_000_000;
  const player = { 道伤: 2, 生命本源: 101, 元神: 81, 寿元: 9999, 压制寿元: 20_001 };
  applyEmperorDefeatPenalty(player, now);
  assert.deepEqual(player, {
    道伤: 7,
    生命本源: 50,
    元神: 40,
    寿元: 9999,
    压制寿元: 10_000,
    帝尊虚弱沉眠至: now + EMPEROR_DEFEAT_SLEEP_MS,
  });
  assert.equal(getEmperorSleepRemainingMs(player, now), EMPEROR_DEFEAT_SLEEP_MS);
  assert.equal(buildEmperorSleepAction(now).end_time, now + EMPEROR_DEFEAT_SLEEP_MS);

  const ordinary = { 道伤: 0, 生命本源: 100, 元神: 100, 寿元: 101 };
  applyEmperorDefeatPenalty(ordinary, now);
  assert.equal(ordinary.寿元, 50);
});

test('帝尊团本接入大帝门槛、对峙续期和败北持久化', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'apps', 'Battle', 'tuanben.js'), 'utf8');
  assert.match(source, /getRealmAuthorityLevel\(player\) < 16/);
  assert.match(source, /delayEmperorRefinement\(\)/);
  assert.match(source, /applyEmperorDefeatPenalty/);
  assert.match(source, /applyEmperorWorldTripodOpening/);
  assert.match(source, /_帝兵品阶 = equipment\?\.帝兵\?\.品阶/);

  const eraSource = fs.readFileSync(path.join(__dirname, '..', 'apps', 'tasks', 'EraChangeTask.js'), 'utf8');
  assert.match(eraSource, /processEmperorRefinement\(currentWorldYear\)/);
  assert.match(eraSource, /PLANE_DESTRUCTION_SOURCES\.EMPEROR_REFINEMENT/);
  assert.match(eraSource, /repairPlane\(filePath, '遮天位面'\)/);
  assert.match(eraSource, /recoveryBattle: true/);
  assert.doesNotMatch(eraSource, /redis\.expire\(redisKeys\.emperorAwareness/);
});
