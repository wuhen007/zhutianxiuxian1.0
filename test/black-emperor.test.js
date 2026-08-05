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
  rollBlackEmperorDungeonEncounter,
  selfEngraveFormation,
} from '../model/blackEmperor.js';

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
  assert.equal(success.chance, 0.65);
  assert.deepEqual(player.自刻PVE阵纹, [{ 名称: '无始杀阵', 剩余次数: 5 }]);
});
