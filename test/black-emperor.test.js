import assert from 'node:assert/strict';
import test from 'node:test';

import {
  consumeBlackEmperorBattleFormation,
  consumeBlackEmperorTribulationFormation,
  getBlackEmperorData,
  getBlackEmperorRelation,
  getUnlockedBlackEmperorFormations,
  rollBlackEmperorDungeonEncounter,
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

test('无始杀阵只强化一次副本战斗并在激活后消耗', () => {
  const player = { 黑皇待用阵纹: '无始杀阵', 剧情人物: [{ 黑皇: 1, 事件记录: [] }] };
  const attacker = { 攻击: 100, 暴击率: 0.1 };
  const defender = { 攻击: 80, 防御: 60, 暴击率: 0.1 };
  const result = consumeBlackEmperorBattleFormation(player, attacker, defender);
  assert.equal(result.consumed, true);
  assert.equal(attacker.攻击, 200);
  assert.equal(attacker.暴击率, 0.3);
  assert.equal(player.黑皇待用阵纹, undefined);
  assert.equal(consumeBlackEmperorBattleFormation(player, attacker, defender).consumed, false);
});

test('欺天阵纹只在下次渡劫判定一次，成功率为25%', () => {
  const attacker = { 攻击: 100, 暴击率: 0.1 };
  const hiddenEnemy = { 攻击: 100, 防御: 100, 暴击率: 0.2 };
  const player = { 黑皇待用阵纹: '欺天阵纹' };
  assert.equal(consumeBlackEmperorBattleFormation(player, attacker, hiddenEnemy).consumed, false);
  assert.equal(player.黑皇待用阵纹, '欺天阵纹');

  const success = consumeBlackEmperorTribulationFormation(player, { random: () => 0.24 });
  assert.equal(success.success, true);
  assert.equal(success.damageMultiplier, 0.75);
  assert.equal(player.黑皇待用阵纹, undefined);
  assert.doesNotMatch(JSON.stringify(player), /_欺天阵纹渡劫/);
  assert.equal(consumeBlackEmperorTribulationFormation(player, { random: () => 0.99 }), success);

  const failed = consumeBlackEmperorTribulationFormation(
    { 黑皇待用阵纹: '欺天阵纹' },
    { random: () => 0.25 }
  );
  assert.equal(failed.success, false);
  assert.equal(failed.damageMultiplier, 1);
});

test('山河困龙阵仍在副本中削弱敌人', () => {
  const attacker = { 攻击: 100, 暴击率: 0.1 };
  const trappedEnemy = { 攻击: 100, 防御: 100, 暴击率: 0.2 };
  consumeBlackEmperorBattleFormation({ 黑皇待用阵纹: '山河困龙阵' }, attacker, trappedEnemy);
  assert.equal(trappedEnemy.攻击, 85);
  assert.equal(trappedEnemy.防御, 55);
});
