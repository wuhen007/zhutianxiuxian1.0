import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CORPSE_EMPEROR_SKILL_LIBRARY,
  CORPSE_EMPEROR_SKILL_NAMES,
  CANG_EMPEROR_ATTRIBUTE_RATE,
  CANG_EMPEROR_SPEED_SUPPRESSION,
  CANG_EMPEROR_SUPPRESSION_ACTIONS,
  DARK_TRIAD_DAMAGE_REDUCTION,
  DARK_TRIAD_OPENING_SHIELD_RATE,
  DARK_TRIAD_REVIVAL_LIMIT,
  TIME_RIVER_COUNTER_SKILLS,
  TIME_RIVER_SKILL_LIBRARY,
  TIME_RIVER_ATTRIBUTE_RANGE,
  TIME_RIVER_PHASE_DURATION_MS,
  TIME_RIVER_RESCUE_WINDOW_MS,
  applyCangEmperorOpeningSuppression,
  applyTimeRiverSacrificeBuff,
  applyTimeRiverSkillEffect,
  buildTimeRiverAdversary,
  collapsePastWorldlineArtifacts,
  ensureTimeRiverSkills,
  getTimeRiverCounterMessage,
  getTimeRiverEnemyNames,
  isTimeRiverCounteredSkill,
  prioritizeTimeRiverAttackSkills,
  getTimeRiverSacrificeRecovery,
  isDarkTriadEmperor,
  rollDarkTriadContinuation,
  rollTimeRiverAttributeMultiplier,
  rollTimeRiverEraReward,
  scaleTimeRiverAdversary,
  tickCangEmperorOpeningSuppression,
  tryDarkTriadRevival,
} from '../model/timeRiverAdversary.js';

const player = {
  攻击: 100,
  防御: 200,
  血量上限: 1000,
  速度: 100,
};

const template = name => ({
  name,
  attack: 1,
  defense: 1,
  hp: 1,
  criticalRate: 0.9,
  era: '测试纪元',
  special: [],
  灵根: { name: '测试灵根', 法球倍率: 1 },
});

test('全部时间长河敌人统一按玩家1.5至3倍全属性生成，且不暴露倍率', () => {
  const ye = buildTimeRiverAdversary(player, template('叶天帝'), { random: () => 0 });
  const huang = buildTimeRiverAdversary(player, template('荒天帝'), { random: () => 0.999999 });

  assert.deepEqual(TIME_RIVER_ATTRIBUTE_RANGE, [1.5, 3]);
  assert.equal(rollTimeRiverAttributeMultiplier(() => 0), 1.5);
  assert.equal(rollTimeRiverAttributeMultiplier(() => 0.999999), 3);
  assert.deepEqual([ye.攻击, ye.防御, ye.血量上限, ye.速度], [150, 300, 1500, 150]);
  assert.deepEqual([huang.攻击, huang.防御, huang.血量上限, huang.速度], [300, 600, 3000, 300]);
  assert.equal('_时间长河倍率' in ye, false);
  assert.equal('_时间长河倍率' in huang, false);
  assert.equal(ye.当前血量, ye.血量上限);
  assert.equal(huang.当前血量, huang.血量上限);
});

test('普通敌人与尸骸仙帝同样服从统一倍率', () => {
  const weak = buildTimeRiverAdversary(player, template('狠人大帝'), { random: () => 0 });
  const strong = buildTimeRiverAdversary(player, template('无始大帝'), { random: () => 0.999999 });
  const corpse = buildTimeRiverAdversary(player, template('尸骸仙帝'), { random: () => 0 });

  assert.deepEqual([weak.攻击, weak.防御, weak.血量上限], [150, 300, 1500]);
  assert.deepEqual([strong.攻击, strong.防御, strong.血量上限], [300, 600, 3000]);
  assert.deepEqual([corpse.攻击, corpse.防御, corpse.血量上限], [150, 300, 1500]);
  assert.equal(weak.速度, 150);
  assert.equal(corpse.速度, 150);
  assert.equal(corpse._时间长河反制, true);
  for (const skill of CORPSE_EMPEROR_SKILL_NAMES) assert.ok(corpse.学习的功法.includes(skill));
  const ultimate = CORPSE_EMPEROR_SKILL_LIBRARY.find(skill => skill.name === '终极帝剑斩杀');
  assert.equal(ultimate.beilv, 15);
  assert.equal(ultimate.不可复活, 1);
  assert.match(getTimeRiverCounterMessage(corpse, '行字秘'), /仙帝场域/);
});

test('尸骸仙帝的终极帝剑优先进入每回合技能判定', () => {
  const skills = [{ name: '真龙宝术' }, { name: '终极帝剑斩杀' }, { name: '平乱诀' }];
  const ordered = prioritizeTimeRiverAttackSkills(
    { _时间长河身份: 'corpse-immortal-emperor' },
    skills,
  );

  assert.equal(ordered[0].name, '终极帝剑斩杀');
  assert.deepEqual(skills.map(skill => skill.name), ['真龙宝术', '终极帝剑斩杀', '平乱诀']);
  assert.equal(prioritizeTimeRiverAttackSkills({}, skills), skills);
});

test('苍帝携带三招，并能组成苍鸿羽三帝阵容', () => {
  const cang = buildTimeRiverAdversary(player, template('苍帝'), { random: () => 0 });
  const hong = buildTimeRiverAdversary(player, template('鸿帝'), { random: () => 0 });
  const yu = buildTimeRiverAdversary(player, template('羽帝'), { random: () => 0 });
  assert.deepEqual(getTimeRiverEnemyNames(cang.名号, [hong, yu]), ['苍帝', '鸿帝', '羽帝']);
  assert.equal(cang._时间长河反制, true);
  assert.equal(cang.速度, 150);
  for (const skill of TIME_RIVER_SKILL_LIBRARY.filter(item => !item.name.startsWith('鸿帝死咒'))) {
    assert.ok(cang.学习的功法.includes(skill.name));
  }
  assert.ok(hong.学习的功法.includes('鸿帝死咒·泄帝势'));
  assert.equal(TIME_RIVER_SKILL_LIBRARY.find(skill => skill.name === '祭灭万物').不可复活, undefined);
  assert.deepEqual(cang.学习的功法.filter(name => TIME_RIVER_COUNTER_SKILLS.includes(name)), []);
});

test('时间长河反制拦截九秘与灵根战力', () => {
  const huang = buildTimeRiverAdversary(player, template('荒天帝'));
  assert.equal(isTimeRiverCounteredSkill({ name: '皆字秘', class: '功法' }, huang), true);
  assert.equal(isTimeRiverCounteredSkill({ name: '任意先天神通', class: '灵根' }, huang), true);
  assert.match(getTimeRiverCounterMessage(huang, '一气化三清'), /他化自在/);
});

test('所有时间长河对手均反制临字秘，普通对手不扩大到其他技能', () => {
  const ordinary = buildTimeRiverAdversary(player, template('狠人大帝'));
  assert.equal(ordinary._时间长河临字秘反制, true);
  assert.equal(isTimeRiverCounteredSkill({ name: '临字秘', class: '功法' }, ordinary), true);
  assert.equal(isTimeRiverCounteredSkill({ name: '行字秘', class: '功法' }, ordinary), false);
});

test('黑暗三帝具备开场防御与一次满血复生，复生保留控制状态', () => {
  const cang = buildTimeRiverAdversary(player, template('苍帝'), { random: () => 0 });
  assert.equal(cang.护盾值, Math.trunc(cang.血量上限 * DARK_TRIAD_OPENING_SHIELD_RATE));
  assert.equal(cang._持续减伤比例, DARK_TRIAD_DAMAGE_REDUCTION);
  assert.equal(cang._时间长河复活上限, DARK_TRIAD_REVIVAL_LIMIT);

  cang.当前血量 = 0;
  cang.dongjie = true;
  cang.不可复活 = true;
  cang.禁疗 = 1;
  cang._技能速度削弱回合 = 3;
  cang._临字秘压制比例 = 0.5;
  const revival = tryDarkTriadRevival(cang);
  assert.equal(revival.revived, true);
  assert.equal(cang.当前血量, cang.血量上限);
  assert.equal(cang.dongjie, true);
  assert.equal(cang.不可复活, true);
  assert.equal(cang.禁疗, 1);
  assert.equal(cang._技能速度削弱回合, 3);
  assert.equal(cang._临字秘压制比例, 0.5);
  assert.equal(cang._时间长河复活次数已用, 1);
  cang.当前血量 = 0;
  assert.equal(tryDarkTriadRevival(cang).revived, false);
});

test('苍帝开场压制暂降20%全属性与500速度，两次行动后复原', () => {
  const combatant = { 名号: '玩家', 攻击: 100, 防御: 200, 血量上限: 1000, 当前血量: 800, 速度: 2000 };
  const opening = applyCangEmperorOpeningSuppression(combatant);
  assert.equal(opening.applied, true);
  assert.deepEqual(
    [combatant.攻击, combatant.防御, combatant.血量上限, combatant.当前血量, combatant.速度],
    [80, 160, 800, 640, 2000 - CANG_EMPEROR_SPEED_SUPPRESSION],
  );
  assert.equal(CANG_EMPEROR_ATTRIBUTE_RATE, 0.8);
  for (let turn = 0; turn < CANG_EMPEROR_SUPPRESSION_ACTIONS; turn++) {
    assert.equal(tickCangEmperorOpeningSuppression(combatant).restored, false);
  }
  assert.equal(tickCangEmperorOpeningSuppression(combatant).restored, true);
  assert.deepEqual(
    [combatant.攻击, combatant.防御, combatant.血量上限, combatant.当前血量, combatant.速度],
    [100, 200, 1000, 800, 2000],
  );
});

test('结出神胎的准仙帝及更高境界免疫苍帝精气神消解', () => {
  const divineEmbryo = {
    名号: '神胎准仙帝', 攻击: 100, 防御: 200, 血量上限: 1000, 当前血量: 800, 速度: 2000,
    mijinglevel_id: 20, 己道推演: { divineEmbryo: '已结出' },
  };
  const emperor = { ...divineEmbryo, 名号: '路尽级仙帝', mijinglevel_id: 21, 己道推演: undefined };
  const quasiSnapshot = structuredClone(divineEmbryo);
  const emperorSnapshot = structuredClone(emperor);

  assert.equal(applyCangEmperorOpeningSuppression(divineEmbryo).immune, true);
  assert.equal(applyCangEmperorOpeningSuppression(emperor).immune, true);
  assert.deepEqual(divineEmbryo, quasiSnapshot);
  assert.deepEqual(emperor, emperorSnapshot);
});

test('鸿帝死咒削减属性并拆除无敌气魄', () => {
  const attacker = { 名号: '苍帝' };
  const defender = { 名号: '玩家', 攻击: 100, 防御: 200, 血量上限: 1000, 当前血量: 800, 无敌气魄: true };
  const messages = [];
  const skill = TIME_RIVER_SKILL_LIBRARY.find(item => item.name === '鸿帝死咒·泄帝势');
  assert.equal(applyTimeRiverSkillEffect(attacker, defender, skill, messages), true);
  assert.deepEqual(
    [defender.攻击, defender.防御, defender.血量上限, defender.当前血量],
    [50, 100, 500, 400],
  );
  assert.equal(defender.无敌气魄, false);
  assert.equal(defender._时间长河无敌气魄已卸除, true);
  assert.match(messages.join('\n'), /削减50%/);
});

test('时间长河阶段、奖励和三帝后续概率符合配置', () => {
  assert.equal(TIME_RIVER_PHASE_DURATION_MS, 15 * 60 * 1000);
  assert.equal(TIME_RIVER_RESCUE_WINDOW_MS, 10 * 60 * 1000);
  assert.equal(rollTimeRiverEraReward('victory', () => 0), 3);
  assert.equal(rollTimeRiverEraReward('victory', () => 0.999), 5);
  assert.equal(rollTimeRiverEraReward('defeat', () => 0), 1);
  assert.equal(rollTimeRiverEraReward('draw', () => 0.999), 2);
  assert.deepEqual(rollDarkTriadContinuation(() => 0.3), { summoned: false, imperialPill: false, reward: 0 });
  let rolls = [0.29, 0.49];
  assert.deepEqual(rollDarkTriadContinuation(() => rolls.shift()), { summoned: true, imperialPill: true, reward: 30 });
  rolls = [0.29, 0.5];
  assert.deepEqual(rollDarkTriadContinuation(() => rolls.shift()), { summoned: true, imperialPill: false, reward: 10 });
});

test('帝丹恢复七成全属性，献祭按三体系境界分四档并满血增幅', () => {
  const restored = scaleTimeRiverAdversary({ 攻击: 100, 防御: 200, 血量上限: 1000, 当前血量: 0, 速度: 300, 护盾值: 350 }, 0.7);
  assert.deepEqual(
    [restored.攻击, restored.防御, restored.血量上限, restored.当前血量, restored.速度, restored.护盾值],
    [70, 140, 700, 700, 210, 245],
  );
  assert.equal(getTimeRiverSacrificeRecovery({ mijinglevel_id: 16, xiangulevel_id: 15, huafenlevel_id: 16 }).eligible, false);
  assert.deepEqual(getTimeRiverSacrificeRecovery({ mijinglevel_id: 17 }), { eligible: true, path: 'mijing', ratio: 0.15, tier: '红尘仙' });
  assert.equal(getTimeRiverSacrificeRecovery({ xiangulevel_id: 17 }).ratio, 0.35);
  assert.equal(getTimeRiverSacrificeRecovery({ huafenlevel_id: 20 }).ratio, 0.5);
  assert.equal(getTimeRiverSacrificeRecovery({ mijinglevel_id: 17, xiangulevel_id: 20 }).path, 'xiangu');
  const rescued = applyTimeRiverSacrificeBuff({ ...player, 当前血量: 1, mijinglevel_id: 2 }, 0.35);
  assert.deepEqual(
    [rescued.攻击, rescued.防御, rescued.血量上限, rescued.当前血量, rescued.速度],
    [135, 270, 1350, 1350, 270],
  );
  assert.equal(rescued._忽略境界速度加成, true);
  assert.equal(isDarkTriadEmperor('羽帝'), true);
  assert.equal(isDarkTriadEmperor('尸骸仙帝'), false);
});

test('过去线抹除尊重至宝锁定，未锁定的帝兵可被打灭', () => {
  const locked = {
    至宝: { name: '锁定至宝', islockd: 1 },
    帝兵: { name: '待抹帝兵' },
  };
  const playerState = { 当前先天至宝: '锁定至宝' };
  const result = collapsePastWorldlineArtifacts(locked, playerState, { random: () => 0 });
  assert.equal(result.destroyed, true);
  assert.equal(result.name, '待抹帝兵');
  assert.equal(locked.至宝.name, '锁定至宝');
  assert.equal(locked.帝兵.name, '');

  const data = { jineng1: [] };
  assert.equal(ensureTimeRiverSkills(data), true);
  assert.equal(ensureTimeRiverSkills(data), false);
  assert.equal(data.jineng1.length, TIME_RIVER_SKILL_LIBRARY.length + CORPSE_EMPEROR_SKILL_LIBRARY.length);
  for (const name of CORPSE_EMPEROR_SKILL_NAMES) {
    assert.ok(data.jineng1.some(skill => skill.name === name), `${name}应注册到攻击技能池`);
  }
});
