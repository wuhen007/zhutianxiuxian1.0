import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addGongfaProficiency,
  awardDungeonGongfaProficiency,
  getDungeonGongfaReduction,
  getDefenseSkillMultiplier,
  getGongfaCombatMultiplier,
  getGongfaDailyGain,
  getGongfaNumericMultiplier,
  getGongfaProficiencyProfile,
  getGongfaTriggerChance,
  getJieziExhaustionRounds,
  getReviveRecoveryRatio,
  getWudaoGongfaReduction,
  rollLinzRealmLevel,
} from '../model/gongfaProficiency.js';

test('功法熟练度按六档计算概率与威能', () => {
  const player = {
    学习的功法: ['斗字秘'],
    功法熟练度: { 斗字秘: 750 },
  };
  const skill = { name: '斗字秘', class: '功法', pr: 0.5 };

  assert.equal(getGongfaProficiencyProfile(player, '斗字秘').name, '登峰造极');
  assert.equal(getGongfaTriggerChance(player, skill), 0.56);
  assert.equal(getGongfaCombatMultiplier(player, skill), 1.1);
});

test('每日每门功法最多增加20点', () => {
  const player = { 学习的功法: ['斗字秘'], 功法熟练度: { 斗字秘: 0 } };
  const options = { dateKey: '2026-08-10' };

  assert.equal(addGongfaProficiency(player, '斗字秘', 8, options), 8);
  assert.equal(addGongfaProficiency(player, '斗字秘', 20, options), 12);
  assert.equal(addGongfaProficiency(player, '斗字秘', 1, options), 0);
  assert.equal(player.功法熟练度.斗字秘, 20);
  assert.equal(getGongfaDailyGain(player, '斗字秘', new Date('2026-08-10T08:00:00+08:00')), 20);
  assert.equal(getGongfaDailyGain(player, '斗字秘', new Date('2026-08-11T08:00:00+08:00')), 0);
});

test('功法总熟练度封顶1000', () => {
  const player = { 学习的功法: ['斗字秘'], 功法熟练度: { 斗字秘: 995 } };
  assert.equal(addGongfaProficiency(player, '斗字秘', 20, { dateKey: '2026-08-10' }), 5);
  assert.equal(player.功法熟练度.斗字秘, 1000);
});

test('数值效果强化防御与复活，但复活恢复不超过九成', () => {
  const player = {
    学习的功法: ['玄武不灭功', '凰劫再生术'],
    功法熟练度: { 玄武不灭功: 1000, 凰劫再生术: 1000 },
  };

  assert.equal(getGongfaNumericMultiplier(player, '玄武不灭功'), 1.1);
  assert.ok(Math.abs(
    getDefenseSkillMultiplier(player, { name: '玄武不灭功', class: '功法', beilv: 0.5 }) - 0.45
  ) < Number.EPSILON);
  assert.equal(
    getReviveRecoveryRatio(player, { name: '凰劫再生术', class: '功法', 恢复比例: 0.85 }),
    0.9
  );
});

test('副本减时不叠加而取当前最高功法效果', () => {
  const player = {
    学习的功法: ['鲲鹏宝术', '行字秘'],
    功法熟练度: { 鲲鹏宝术: 500, 行字秘: 800 },
  };

  assert.deepEqual(getDungeonGongfaReduction(player), { name: '行字秘', rate: 0.07 });
  assert.deepEqual(awardDungeonGongfaProficiency(player, 2, { dateKey: '2026-08-10' }), {
    鲲鹏宝术: 2,
    行字秘: 2,
  });
});

test('浑源悟道减耗、皆字秘力竭和临字秘圆满特效随档位变化', () => {
  const player = {
    学习的功法: ['浑源法门·悟道', '皆字秘', '临字秘'],
    功法熟练度: {
      '浑源法门·悟道': 1000,
      皆字秘: 500,
      临字秘: 1000,
    },
  };

  assert.deepEqual(getWudaoGongfaReduction(player), { name: '浑源法门·悟道', rate: 0.15 });
  assert.equal(getJieziExhaustionRounds(player), 1);
  assert.equal(rollLinzRealmLevel(player, () => 0), 9);
});
