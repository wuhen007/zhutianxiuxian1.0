import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(
  new URL('../model/xiuxian.js', import.meta.url),
  'utf8'
);

function loadExportedFunction(name) {
  const functionSource = source.match(
    new RegExp(`export function ${name}\\([\\s\\S]*?\\n\\}`, 'm')
  )?.[0];
  assert.ok(functionSource, `未找到 ${name}`);
  return Function(`${functionSource.replace('export ', '')}; return ${name};`)();
}

test('每个战斗单位独立累计自身行动次数', () => {
  const consumeBattleActionIndex = loadExportedFunction('consumeBattleActionIndex');
  const fast = {};
  const slow = {};

  assert.equal(consumeBattleActionIndex(fast), 0);
  assert.equal(consumeBattleActionIndex(fast), 1);
  assert.equal(consumeBattleActionIndex(slow), 0);
  assert.match(source, /cnt2 = consumeBattleActionIndex\(attacker\)/);
  assert.match(source, /const roundIndex = consumeBattleActionIndex\(readyUnit\)/);
  assert.doesNotMatch(source, /cnt2 = Math\.trunc\(cnt \/ 2\)/);
});

test('战斗属性增幅每场只应用一次且生命不会超过上限', () => {
  const applyBattleStatBoostOnce = loadExportedFunction('applyBattleStatBoostOnce');
  const unit = { 攻击: 100, 防御: 80, 当前血量: 90, 血量上限: 100 };

  assert.equal(applyBattleStatBoostOnce(unit, '_test', {
    attack: 1.5,
    defense: 1.5,
    health: 1.5,
  }), true);
  assert.deepEqual(unit, {
    攻击: 150,
    防御: 120,
    当前血量: 100,
    血量上限: 100,
    _test: true,
  });
  assert.equal(applyBattleStatBoostOnce(unit, '_test', { attack: 3 }), false);
  assert.equal(unit.攻击, 150);
});

test('战斗单位只有灵根内法球倍率时仍能造成法球伤害', () => {
  const normalizeBattleOrbMultiplier = loadExportedFunction('normalizeBattleOrbMultiplier');
  const unit = { 攻击: 1000, 灵根: { 法球倍率: 0.6 } };

  assert.equal(normalizeBattleOrbMultiplier(unit), 0.6);
  assert.equal(unit.法球倍率, 0.6);
  assert.equal(Math.trunc(unit.攻击 * unit.法球倍率), 600);
  assert.equal(normalizeBattleOrbMultiplier({ 灵根: {} }), 0);
  assert.match(source, /A_copy\.forEach\(normalizeBattleOrbMultiplier\)/);
  assert.match(source, /normalizeBattleOrbMultiplier\(A_player\)/);
  assert.match(source, /teamData\.forEach\(normalizeBattleOrbMultiplier\)/);
});

test('按当前生命比例回血会封顶最大生命', () => {
  const healBattleUnitByCurrentRatio = loadExportedFunction('healBattleUnitByCurrentRatio');
  const unit = { 当前血量: 80, 血量上限: 100 };

  assert.equal(healBattleUnitByCurrentRatio(unit, 0.4), 20);
  assert.equal(unit.当前血量, 100);
  assert.equal(healBattleUnitByCurrentRatio(unit, 0.4), 0);
});

test('复活兼容旧功法存档并覆盖开场与反击死亡', () => {
  assert.doesNotMatch(source, /学习的功法\.indexOf/);
  assert.match(source, /hasLearnedGongfa\(player, availableReviveSkills\[i\]/);
  assert.match(source, /applyInnateBattleOpening\(B_player, A_player\)[\s\S]{0,300}checkRevival\(player, 'main'\)/);
  assert.match(source, /attacker\.当前血量 <= 0[\s\S]{0,200}checkRevival\(attacker, context\)/);
});

test('单挑反伤只应用一次防御技能倍率', () => {
  const start = source.indexOf('if (skill.反弹伤害) {', source.indexOf('async function performAttack'));
  const end = source.indexOf('已触发技能 = true;', start);
  const block = source.slice(start, end);

  assert.ok(start > -1 && end > start);
  assert.equal(block.match(/getDefenseSkillMultiplier/g)?.length, 1);
});

test('致死攻击先记录零血伤害再输出复活过程', () => {
  const applyStart = source.indexOf('function applyDamage');
  const applyEnd = source.indexOf('function createCombatMessage', applyStart);
  const applyBlock = source.slice(applyStart, applyEnd);
  const attackStart = source.indexOf('const { actual_damage, fenshen_blocked } = applyDamage');
  const attackEnd = source.indexOf('const domainMessage = tickDaoTreasureDomain', attackStart);
  const attackBlock = source.slice(attackStart, attackEnd);

  assert.doesNotMatch(applyBlock, /checkRevival/);
  assert.ok(attackBlock.indexOf('msg.push(attack_msg)') < attackBlock.indexOf('checkRevival(defender'));
  assert.doesNotMatch(source, /actual_damage: 0, fenshen_blocked, revived: true/);
});
