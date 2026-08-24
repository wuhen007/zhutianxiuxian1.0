import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePetLuckyBonus,
  computePetStoredBonus,
  computeCorrectLucky,
} from '../model/petLuckyCalc.js';

test('万仙白泽（幸运/0.5/0.5/L1）加成 = 0.5，幸运 50%（修复前曾为 1.0=100%）', () => {
  const pet = { id: 2954, name: '万仙白泽', type: '幸运', 初始加成: 0.5, 每级增加: 0.5, 等级: 1 };
  assert.ok(Math.abs(computePetStoredBonus(pet) - 0.5) < 1e-9);
  const { bonus } = computePetLuckyBonus(pet);
  assert.ok(Math.abs(bonus - 0.5) < 1e-9);
  assert.ok(Math.abs(computeCorrectLucky({ addluckyNo: 0, 仙宠: pet }) - 0.5) < 1e-9);
});

test('2931 灵卵（幸运/0.002/0.002/L10）加成 = 0.02', () => {
  const pet = { id: 2931, type: '幸运', 初始加成: 0.002, 每级增加: 0.002, 等级: 10 };
  assert.ok(Math.abs(computePetStoredBonus(pet) - 0.02) < 1e-9);
  const { bonus } = computePetLuckyBonus(pet);
  assert.ok(Math.abs(bonus - 0.02) < 1e-9);
});

test('麒麟（幸运/0.25/0.25/L1）加成 = 0.25', () => {
  const pet = { id: 2954, name: '麒麟', type: '幸运', 初始加成: 0.25, 每级增加: 0.25, 等级: 1 };
  const { bonus } = computePetLuckyBonus(pet);
  assert.ok(Math.abs(bonus - 0.25) < 1e-9);
});

test('幸运型宠满级（0.004/0.004/L20）加成 = 0.08，与 初始+每级×(等级-1) 等价', () => {
  const pet = { id: 1001, type: '幸运', 初始加成: 0.004, 每级增加: 0.004, 等级: 20 };
  const { bonus } = computePetLuckyBonus(pet);
  assert.ok(Math.abs(bonus - 0.08) < 1e-9);
  assert.ok(Math.abs(bonus - (0.004 + 0.004 * 19)) < 1e-9);
});

test('福源丹 + 幸运宠加成 + 幸运继承 正确叠加', () => {
  const pet = {
    id: 1002, type: '幸运', 初始加成: 0.01, 每级增加: 0.01, 等级: 5,
    炼妖继承能力: { type: '幸运', 加成: 0.15 },
  };
  const player = { addluckyNo: 0.2, 仙宠: pet };
  // 0.2(福源丹) + 0.05(0.01×5) + 0.15(继承) = 0.4
  assert.ok(Math.abs(computeCorrectLucky(player) - 0.4) < 1e-9);
});

test('幸运宠继承非幸运能力：继承不计入，自身加成仍生效', () => {
  const pet = {
    id: 1003, type: '幸运', 初始加成: 0.01, 每级增加: 0.01, 等级: 5,
    炼妖继承能力: { type: '修炼', 加成: 0.15 },
  };
  // 0.2 + 0.05 = 0.25（修炼继承不生效）
  assert.ok(Math.abs(computeCorrectLucky({ addluckyNo: 0.2, 仙宠: pet }) - 0.25) < 1e-9);
});

test('非幸运型仙宠（战斗）即使带成长字段，加成也不计入幸运', () => {
  const pet = { id: 2901, type: '战斗', 初始加成: 0.004, 每级增加: 0.004, 等级: 10 };
  const { bonus } = computePetLuckyBonus(pet);
  assert.ok(Math.abs(bonus - 0) < 1e-9);
  assert.ok(Math.abs(computeCorrectLucky({ addluckyNo: 0.2, 仙宠: pet }) - 0.2) < 1e-9);
});

test('非幸运宠 + 幸运继承：继承加成仍计入（主宠类型不限）', () => {
  const pet = {
    id: 2901, type: '战斗', 初始加成: 0.004, 每级增加: 0.004, 等级: 10,
    炼妖继承能力: { type: '幸运', 加成: 0.15 },
  };
  // 0.2 + 0.15(继承) = 0.35（战斗宠自身加成不计入）
  assert.ok(Math.abs(computeCorrectLucky({ addluckyNo: 0.2, 仙宠: pet }) - 0.35) < 1e-9);
});

test('无成长加成字段的仙宠：幸运只含福源丹药力', () => {
  const pet = { id: 9999, type: '幸运' };
  assert.ok(Math.abs(computeCorrectLucky({ addluckyNo: 0.2, 仙宠: pet }) - 0.2) < 1e-9);
});

test('无 id 的仙宠（异常数据）视为无宠，幸运 = addluckyNo', () => {
  const player = { addluckyNo: 0.1, 仙宠: [] };
  assert.ok(Math.abs(computeCorrectLucky(player) - 0.1) < 1e-9);
});
