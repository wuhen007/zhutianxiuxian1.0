import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  applyUltimateNirvanaDefense,
  clearCombatNegativeEffects,
  getKunpengSpeedDamageMultiplier,
  getNiluanComboChance,
  resolveGongfaCombatSkill,
  resolveHuangwuLethalGuard,
  resolveHuangwuSwordIntent,
} from '../model/gongfaProficiency.js';

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const attacks = readJson('../resources/data/item/技能组/攻击技能.json');
const defenses = readJson('../resources/data/item/技能组/防御技能.json');

test('行动条阈值统一为5000，行字秘速度为固定点数', () => {
  const source = readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /ACTION_BAR_MAX = 3000/);
  assert.match(source, /export const ACTION_BAR_MAX = 5000/);
  assert.deepEqual(
    ['行字秘', '行字秘·极尽'].map(name => {
      const skill = attacks.find(item => item.name === name);
      return [skill.速度加成, skill.速度加成类型];
    }),
    [[150, '固定'], [500, '固定']]
  );
});

test('鲲鹏速度增伤与逆乱八式连击按总速度结算', () => {
  const kunpeng = attacks.find(item => item.name === '鲲鹏宝术');
  assert.equal(getKunpengSpeedDamageMultiplier(kunpeng, 1500), 1.5);
  assert.equal(getNiluanComboChance(50), 0.03);
  assert.equal(getNiluanComboChance(1500), 0.9);

  const niluan = attacks.find(item => item.name === '逆乱八式');
  const player = { 学习的功法: ['逆乱八式'], 功法熟练度: { 逆乱八式: 1000 } };
  const resolved = resolveGongfaCombatSkill(player, niluan, () => 0, { speed: 2000 });
  assert.equal(resolved.逆乱连击数, 8);
  assert.equal(resolved.beilv, niluan.招式.reduce((sum, move) => sum + move.beilv, 0));
});

test('真龙净化与终极涅槃叠层达到配置上限', () => {
  const unit = {
    dongjie: true,
    禁疗: 1,
    _技能禁疗回合: 2,
    _技能速度削弱回合: 2,
    _fumianhuihe: 3,
  };
  clearCombatNegativeEffects(unit);
  assert.equal(unit.dongjie, false);
  assert.equal(unit.禁疗, 0);
  assert.equal(unit._fumianhuihe, 0);

  const nirvana = defenses.find(item => item.name === '终极涅槃·至尊');
  assert.deepEqual(applyUltimateNirvanaDefense(unit, nirvana), { actionBoost: 200, reduction: 0.2 });
  applyUltimateNirvanaDefense(unit, nirvana);
  assert.deepEqual(applyUltimateNirvanaDefense(unit, nirvana), { actionBoost: 200, reduction: 0.6 });
  assert.deepEqual(applyUltimateNirvanaDefense(unit, nirvana), { actionBoost: 0, reduction: 0.6 });
  assert.equal(defenses.find(item => item.name === '真龙宝术').清除负面, 1);
});

test('六道拳意与荒无剑诀数据、濒死反斩和两回合剑意齐全', () => {
  assert.equal(attacks.find(item => item.name === '六道轮回拳').六道轮回拳意, 1);
  const huangwu = attacks.find(item => item.name === '荒无剑诀');
  assert.equal(huangwu.beilv, 10);
  assert.equal(huangwu.不可防御, 1);

  const defender = { 学习的功法: ['荒无剑诀'], 当前血量: 100, _speed: 500 };
  const attacker = { 攻击: 1000, 防御: 100, 血量上限: 1000, 当前血量: 1000, 速度: 500, _speed: 500 };
  assert.deepEqual(resolveHuangwuLethalGuard(defender, attacker, 100, () => 0), { triggered: true, hits: 3 });
  assert.equal(defender._荒无剑意回合, 2);
  assert.equal(attacker.dongjie, true);
  assert.equal(attacker._荒无剑气回合, 1);
  assert.equal(attacker.禁疗, 1);

  const intent = resolveHuangwuSwordIntent(defender, attacker, () => 0);
  assert.equal(intent.pierced, true);
  assert.equal(intent.remaining, 1);
  assert.equal(attacker.攻击, 900);
  assert.equal(defender._荒无看破攻击, true);
});
