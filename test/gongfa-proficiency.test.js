import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addGongfaProficiency,
  awardDungeonGongfaProficiency,
  getDungeonGongfaReduction,
  getDefenseSkillMultiplier,
  getDouziMimicChance,
  getGongfaCombatMultiplier,
  getGongfaDailyGain,
  getGongfaNumericMultiplier,
  getGongfaProficiencyProfile,
  getGongfaTriggerChance,
  getJieziDurationRounds,
  getJieziExhaustionRounds,
  getLinzDurationRounds,
  getMijueTriggerChance,
  getReviveRecoveryRatio,
  getVitalityRecoveryRate,
  getWudaoGongfaReduction,
  getZheziReviveConfig,
  rollLinzRealmLevel,
  tryLearnTianjiaoGongfa,
  tryVitalityRecovery,
  getYiqihuaConfig,
  getYiqihuaTriggerChance,
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

test('斗字秘演化天骄功法的概率随熟练度从2%提升至10%', () => {
  const novice = { 学习的功法: ['斗字秘'], 功法熟练度: { 斗字秘: 0 } };
  const halfway = { 学习的功法: ['斗字秘'], 功法熟练度: { 斗字秘: 500 } };
  const mastered = { 学习的功法: ['斗字秘'], 功法熟练度: { 斗字秘: 1000 } };

  assert.equal(getDouziMimicChance({ 学习的功法: [] }), 0);
  assert.equal(getDouziMimicChance(novice), 0.02);
  assert.equal(getDouziMimicChance(halfway), 0.06);
  assert.equal(getDouziMimicChance(mastered), 0.1);
});

test('斗字秘只会学走尚未掌握的天骄功法且从零熟练度开始', () => {
  const player = {
    学习的功法: ['斗字秘', '已有功法'],
    功法熟练度: { 斗字秘: 1000, 已有功法: 200 },
  };
  const rolls = [0.01, 0.99];
  const result = tryLearnTianjiaoGongfa(
    player,
    ['已有功法', '新法一', '新法二', '新法二'],
    () => rolls.shift()
  );

  assert.deepEqual(result, { ok: true, name: '新法二', chance: 0.1 });
  assert.deepEqual(player.学习的功法, ['斗字秘', '已有功法', '新法二']);
  assert.equal(player.功法熟练度.新法二, 0);
});

test('者字秘与不灭经按熟练度档位恢复最大生命', () => {
  const learned = ['者字秘', '不灭经'];
  const expected = [
    [0, 0.1, 0.12],
    [250, 0.15, 0.2],
    [500, 0.2, 0.3],
    [750, 0.25, 0.4],
    [1000, 0.35, 0.55],
  ];
  for (const [exp, zhezi, bumie] of expected) {
    const player = { 学习的功法: learned, 功法熟练度: { 者字秘: exp, 不灭经: exp } };
    assert.equal(getVitalityRecoveryRate(player, '者字秘'), zhezi);
    assert.equal(getVitalityRecoveryRate(player, '不灭经'), bumie);
  }
});

test('不灭经只在行动前回血，者字秘只在受击未死后回血', () => {
  const bumie = { 学习的功法: ['不灭经'], 功法熟练度: { 不灭经: 1000 }, 血量上限: 1000, 当前血量: 100 };
  const zhezi = { 学习的功法: ['者字秘'], 功法熟练度: { 者字秘: 750 }, 血量上限: 1000, 当前血量: 100 };
  const bumieSkill = { name: '不灭经', class: '功法', pr: 0.25 };
  const zheziSkill = { name: '者字秘', class: '功法', pr: 0.25 };

  assert.equal(tryVitalityRecovery(bumie, bumieSkill, '受击后', () => 0).triggered, false);
  assert.equal(tryVitalityRecovery(bumie, bumieSkill, '行动前', () => 0).amount, 550);
  assert.equal(tryVitalityRecovery(zhezi, zheziSkill, '行动前', () => 0).triggered, false);
  assert.equal(tryVitalityRecovery(zhezi, zheziSkill, '受击后', () => 0).amount, 250);
});

test('圆满者字秘每局可复生两次且第二次恢复55%', () => {
  const novice = { 学习的功法: ['者字秘'], 功法熟练度: { 者字秘: 0 } };
  const mastered = { 学习的功法: ['者字秘'], 功法熟练度: { 者字秘: 1000 } };
  assert.deepEqual(getZheziReviveConfig(novice), { maxRevives: 1, recoveryRatios: [1] });
  assert.deepEqual(getZheziReviveConfig(mastered), { maxRevives: 2, recoveryRatios: [1, 0.55] });
});

test('斗字秘推演失败或已学尽时不会改动玩家功法', () => {
  const player = { 学习的功法: ['斗字秘', '已有功法'], 功法熟练度: { 斗字秘: 500 } };

  assert.equal(tryLearnTianjiaoGongfa(player, ['新法'], () => 0.5).reason, 'missed');
  assert.equal(tryLearnTianjiaoGongfa(player, ['已有功法'], () => 0).reason, 'mastered');
  assert.deepEqual(player.学习的功法, ['斗字秘', '已有功法']);
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
  assert.equal(getJieziDurationRounds({ ...player, 功法熟练度: { 皆字秘: 0 } }), 1);
  assert.equal(getJieziDurationRounds(player), 2);
  assert.equal(getJieziDurationRounds({ ...player, 功法熟练度: { 皆字秘: 750 } }), 3);
  assert.equal(getJieziDurationRounds({ ...player, 功法熟练度: { 皆字秘: 1000 } }), 4);
  assert.equal(getJieziExhaustionRounds(player), 1);
  assert.equal(getLinzDurationRounds(6), 1);
  assert.equal(getLinzDurationRounds(7), 2);
  assert.equal(getLinzDurationRounds(8), 2);
  assert.equal(getLinzDurationRounds(9), 3);
  assert.equal(rollLinzRealmLevel(player, () => 0), 9);
});

test('一气化三清按熟练度配置道身数量、全属性倍率和存续时间', () => {
  const player = { 学习的功法: ['一气化三清'] };
  assert.deepEqual(getYiqihuaConfig({ ...player, 功法熟练度: { 一气化三清: 0 } }), {
    count: 1, ratio: 0.45, duration: 2,
  });
  assert.deepEqual(getYiqihuaConfig({ ...player, 功法熟练度: { 一气化三清: 500 } }), {
    count: 2, ratio: 0.55, duration: 2,
  });
  assert.deepEqual(getYiqihuaConfig({ ...player, 功法熟练度: { 一气化三清: 750 } }), {
    count: 2, ratio: 0.7, duration: 3,
  });
  assert.deepEqual(getYiqihuaConfig({ ...player, 功法熟练度: { 一气化三清: 1000 } }), {
    count: 2, ratio: 0.9, duration: -1,
  });
});

test('特殊秘法触发概率纳入熟练度倍率', () => {
  const player = {
    学习的功法: ['一气化三清', '皆字秘', '临字秘'],
    功法熟练度: { 一气化三清: 500, 皆字秘: 500, 临字秘: 1000 },
  };

  assert.ok(Math.abs(getYiqihuaTriggerChance(player, () => 1) - 0.981) < Number.EPSILON);
  assert.ok(Math.abs(getMijueTriggerChance(player, '皆字秘', () => 1) - 0.2289) < Number.EPSILON);
  assert.ok(Math.abs(getMijueTriggerChance(player, '临字秘', () => 1) - 0.2415) < Number.EPSILON);
});
