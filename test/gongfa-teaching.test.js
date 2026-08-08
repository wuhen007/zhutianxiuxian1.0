import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyTeachingResult,
  canTeachGongfa,
  getGongfaLevel,
  getTeachingCosts,
  getTeachingSuccessRate,
  reserveTeachingCosts,
} from '../model/gongfaTeaching.js';

test('圣人或天神境解锁功法传授', () => {
  assert.equal(canTeachGongfa({ mijinglevel_id: 12 }), true);
  assert.equal(canTeachGongfa({ xiangulevel_id: 11 }), true);
  assert.equal(canTeachGongfa({ mijinglevel_id: 11, xiangulevel_id: 10 }), false);
});

test('武学保持零级并按十万元神和一点潜力结算', () => {
  assert.equal(getGongfaLevel('武学'), 0);
  assert.equal(getGongfaLevel('限定功法'), 0);
  assert.equal(getGongfaLevel('精神法门'), 3);
  assert.deepEqual(getTeachingCosts(0), { potential: 1, spirit: 100000 });
});

test('高阶功法比低阶功法更难传授', () => {
  assert.equal(getTeachingSuccessRate(3, '平庸之资'), 1);
  assert.equal(getTeachingSuccessRate(4, '天纵之资'), 0.8);
  assert.equal(getTeachingSuccessRate(6, '绝世天骄'), 0.7);
  assert.equal(getTeachingSuccessRate(0, '生而愚痴'), 0.3);
});

test('元神不足不会预扣目标仙道潜力', () => {
  const state = { remainingPotential: 20, remainingSpirit: 100000 };
  const result = reserveTeachingCosts(state, 5);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'spirit');
  assert.equal(result.remainingPotential, 20);
  assert.equal(result.remainingSpirit, 100000);
});

test('批量结算在同一份目标存档中保留新功法和剩余潜力', () => {
  const target = { 学习的功法: ['旧法'], 仙道潜力: 10 };
  applyTeachingResult(target, ['新法一', '新法二'], 6);
  assert.deepEqual(target.学习的功法, ['旧法', '新法一', '新法二']);
  assert.equal(target.仙道潜力, 6);
});
