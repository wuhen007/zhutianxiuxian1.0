import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addBlackEmperorBattleFormation,
  consumeBlackEmperorBattleFormation,
  consumeBlackEmperorTribulationFormation,
  getBlackEmperorData,
  getBlackEmperorRelation,
  getSelfEngraveChance,
  getUnlockedBlackEmperorFormations,
  parseBlackEmperorFormationRequest,
  pauseBlackEmperorBattleFormation,
  rollBlackEmperorDungeonEncounter,
  selectBlackEmperorBattleFormation,
  selfEngraveFormation,
} from '../model/blackEmperor.js';

test('刻阵指令兼容紧邻参数与QQBot词内空格', () => {
  assert.equal(parseBlackEmperorFormationRequest('无始 杀阵').formation.name, '无始杀阵');
  const travel = parseBlackEmperorFormationRequest('位面传送阵 遮天 位面');
  assert.equal(travel.formation.name, '位面传送阵');
  assert.equal(travel.target, '遮天位面');
});

test('黑皇可在任意副本首次出现并建立剧情人物关系', () => {
  const player = {};
  const result = rollBlackEmperorDungeonEncounter(player, {
    chance: 1,
    random: () => 0,
    plane: '仙域',
    dungeon: '殒仙岭',
  });
  assert.equal(result.firstMeeting, true);
  assert.equal(getBlackEmperorData(player).好感度, 5);
  assert.match(getBlackEmperorData(player).事件记录[0], /殒仙岭/);
});

test('重复偶遇会增加好感并解锁对应阵图', () => {
  const player = { 剧情人物: [{ 黑皇: 1, 好感度: 38, 关系: 1, 事件记录: [] }] };
  const result = rollBlackEmperorDungeonEncounter(player, { chance: 1, random: () => 0, favorGain: 4 });
  assert.equal(result.relationUp, true);
  assert.equal(getBlackEmperorRelation(42).name, '熟人');
  assert.deepEqual(getUnlockedBlackEmperorFormations(65).map(item => item.name), ['聚灵道阵', '欺天阵纹']);
});

test('无始杀阵连续5次PVE生效，每战攻击翻倍后逐次递减', () => {
  const player = { 剧情人物: [{ 黑皇: 1, 事件记录: [] }] };
  addBlackEmperorBattleFormation(player, '无始杀阵');
  assert.deepEqual(player.黑皇PVE阵纹, [{ 名称: '无始杀阵', 剩余次数: 5 }]);

  for (let round = 1; round <= 5; round++) {
    const attacker = { 攻击: 100, 暴击率: 0.1 };
    const result = consumeBlackEmperorBattleFormation(player, attacker, { 攻击: 1, 防御: 1 });
    assert.equal(result.consumed, true);
    assert.equal(attacker.攻击, 200);
    assert.equal(attacker.暴击率, 0.3);
    assert.equal(result.remaining, 5 - round);
  }
  assert.deepEqual(player.黑皇PVE阵纹, []);
  assert.equal(consumeBlackEmperorBattleFormation(player, { 攻击: 1 }, { 攻击: 1 }).consumed, false);
});

test('重复请黑皇刻同名战阵会合并次数并自动启用', () => {
  const player = {};
  addBlackEmperorBattleFormation(player, '无始杀阵');
  addBlackEmperorBattleFormation(player, '无始杀阵');
  assert.deepEqual(player.黑皇PVE阵纹, [{ 名称: '无始杀阵', 剩余次数: 10 }]);
  assert.equal(player.当前PVE阵法, '无始杀阵');
});

test('山河困龙阵一次性封印敌方一回合并削弱攻防', () => {
  const player = { 剧情人物: [{ 黑皇: 1, 事件记录: [] }] };
  addBlackEmperorBattleFormation(player, '山河困龙阵');
  const enemy = { 攻击: 100, 防御: 100, 暴击率: 0.2 };
  const result = consumeBlackEmperorBattleFormation(player, { 攻击: 50 }, enemy);
  assert.equal(result.consumed, true);
  assert.equal(result.seal, true);
  assert.equal(enemy._困龙封印, true);
  assert.equal(enemy.攻击, 85);
  assert.equal(enemy.防御, 55);
  assert.deepEqual(player.黑皇PVE阵纹, []);
});

test('欺天阵纹只在下次渡劫判定一次，成功率为25%', () => {
  const player = { 黑皇待用阵纹: '欺天阵纹' };
  assert.equal(consumeBlackEmperorBattleFormation(player, { 攻击: 1 }, { 攻击: 1 }).consumed, false);
  assert.equal(player.黑皇待用阵纹, '欺天阵纹');

  const success = consumeBlackEmperorTribulationFormation(player, { random: () => 0.24, successChance: 0.25 });
  assert.equal(success.success, true);
  assert.equal(success.damageMultiplier, 0.75);
  assert.equal(player.黑皇待用阵纹, undefined);
  assert.equal(consumeBlackEmperorTribulationFormation(player, { random: () => 0.99 }), success);

  const failed = consumeBlackEmperorTribulationFormation(
    { 黑皇待用阵纹: '欺天阵纹' },
    { random: () => 0.25, successChance: 0.25 }
  );
  assert.equal(failed.success, false);
  assert.equal(failed.damageMultiplier, 1);
});

test('阵法师自刻成功率随职业等级提升且消耗材料灵石', () => {
  assert.equal(getSelfEngraveChance(1), 0.27);
  assert.equal(getSelfEngraveChance(35), 0.95);

  const player = { 灵石: 100_000_000, occupation_level: 20, 自刻PVE阵纹: [] };
  const failed = selfEngraveFormation(player, '山河困龙阵', { materialCount: 1, random: () => 0.99 });
  assert.equal(failed.ok, false);
  assert.equal(player.灵石, 100_000_000);

  const success = selfEngraveFormation(player, '无始杀阵', { materialCount: 3, random: () => 0 });
  assert.equal(success.ok, true);
  assert.equal(success.chance, 0.7);
  assert.equal(player.自刻阵法连续失败, 0);
  assert.deepEqual(player.自刻PVE阵纹, [{ 名称: '无始杀阵', 剩余次数: 5 }]);
});

test('自刻连续失败每次增加5%成功率且最多额外20%', () => {
  assert.equal(getSelfEngraveChance(10, 0), 0.45);
  assert.equal(getSelfEngraveChance(10, 1), 0.5);
  assert.equal(getSelfEngraveChance(10, 99), 0.65);
});

test('可手动选择阵纹或停用阵匣，避免PVE误消耗', () => {
  const player = {
    自刻PVE阵纹: [{ 名称: '山河困龙阵', 剩余次数: 1 }],
    黑皇PVE阵纹: [{ 名称: '无始杀阵', 剩余次数: 2 }],
  };
  assert.equal(selectBlackEmperorBattleFormation(player, '无始杀阵').ok, true);
  const attacker = { 攻击: 100, 暴击率: 0 };
  assert.equal(consumeBlackEmperorBattleFormation(player, attacker, {}).name, '无始杀阵');
  assert.equal(attacker.攻击, 200);
  assert.equal(player.自刻PVE阵纹[0].剩余次数, 1);

  pauseBlackEmperorBattleFormation(player);
  assert.equal(consumeBlackEmperorBattleFormation(player, { 攻击: 100 }, {}).consumed, false);
  assert.equal(player.黑皇PVE阵纹[0].剩余次数, 1);
  assert.equal(selectBlackEmperorBattleFormation(player, '自动').ok, true);
  assert.equal(player.PVE阵法停用, undefined);
});

test('源石场接引山川龙脉可增强困龙阵与无始杀阵', () => {
  const terrain = { sourceField: { consumed: true } };
  const trappedPlayer = { 自刻PVE阵纹: [{ 名称: '山河困龙阵', 剩余次数: 1 }] };
  const enemy = { 攻击: 100, 防御: 100 };
  const trapped = consumeBlackEmperorBattleFormation(trappedPlayer, { 攻击: 1 }, enemy, terrain);
  assert.equal(trapped.terrainBoost, true);
  assert.equal(enemy.攻击, 75);
  assert.equal(enemy.防御, 45);

  const killingPlayer = { 黑皇PVE阵纹: [{ 名称: '无始杀阵', 剩余次数: 1 }] };
  const attacker = { 攻击: 100, 暴击率: 0.1 };
  consumeBlackEmperorBattleFormation(killingPlayer, attacker, {}, terrain);
  assert.equal(attacker.攻击, 220);
  assert.equal(attacker.暴击率, 0.35);
});
