import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FIELD_MAX_STAGE,
  FIELD_PAGE_REQUIRE,
  advanceFlowerField,
  calculateFlowerFieldBonus,
  collectFlowerFieldPage,
  ensureFlowerFieldState,
  getFlowerFieldProfile,
} from '../model/flowerPollenField.js';
import { handleFlowerPollenSkills } from '../model/flowerPollenSkill.js';
import { getShengxuDungeon } from '../model/shengxuContent.js';

test('field state initializes on fresh players', () => {
  const player = {};
  ensureFlowerFieldState(player);
  assert.equal(player.场域境界, 0);
  assert.equal(player.场域残图, 0);
  const profile = getFlowerFieldProfile(player);
  assert.equal(profile.stage, 0);
  assert.equal(profile.maxStage, 9);
});

test('collecting pages flags advancement at threshold', () => {
  const player = {};
  ensureFlowerFieldState(player);
  for (let i = 0; i < 4; i++) {
    const r = collectFlowerFieldPage(player);
    assert.equal(r.canAdvance, false);
  }
  const fifth = collectFlowerFieldPage(player);
  assert.equal(fifth.pages, 5);
  assert.equal(fifth.canAdvance, true);
});

test('advancing field consumes 5 pages per stage up to 9', () => {
  const player = { 场域境界: 0, 场域残图: 5 };
  const done = advanceFlowerField(player);
  assert.equal(done.ok, true);
  assert.equal(player.场域境界, 1);
  assert.equal(player.场域残图, 0);

  player.场域残图 = 2;
  assert.equal(advanceFlowerField(player).reason, 'insufficient');

  player.场域境界 = 9;
  player.场域残图 = 99;
  assert.equal(advanceFlowerField(player).reason, 'max');
});

test('field bonus scales with pollen realm base attributes', () => {
  const player = { 场域境界: 3 };
  const bonus = calculateFlowerFieldBonus(player, { 基础攻击: 1000, 基础防御: 2000, 基础血量: 3000 });
  assert.equal(bonus.攻击, 90); // 1000 × 9%
  assert.equal(bonus.防御, 180);
  assert.equal(bonus.血量, 270);
  assert.equal(bonus.rate, 0.09);
  const zero = calculateFlowerFieldBonus({}, { 基础攻击: 1000 });
  assert.equal(zero.攻击, 0);
});

test('field stage amplifies field-suppression skill', () => {
  const attacker = {
    名号: '楚风', 攻击: 1000, 当前血量: 5000, 血量上限: 5000,
    场域境界: 5, 学习的功法: ['场域法·镇'],
  };
  const defender = { 名号: '敌', 攻击: 10000, 当前血量: 99999 };
  const msg = [];
  handleFlowerPollenSkills(attacker, defender, msg, () => 0);
  // 场域法·镇 0.12 × (1 + 5*0.04) = 0.144
  const expected = Math.floor(10000 * 0.144);
  assert.equal(defender.攻击, 10000 - expected);
  assert.ok(msg.some(line => line.includes('场域5重天')));
});

test('dungeon field page flag only on mid-high tiers', () => {
  assert.equal(getShengxuDungeon('太行山').fieldPage, undefined);
  assert.equal(getShengxuDungeon('小阴间星路').fieldPage, true);
  assert.equal(getShengxuDungeon('阳间名山').fieldPage, true);
  assert.equal(getShengxuDungeon('魂河古地').fieldPage, true);
});
