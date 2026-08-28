import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CORPSE_EMPEROR_SKILL_LIBRARY,
  CORPSE_EMPEROR_SKILL_NAMES,
  TIME_RIVER_COUNTER_SKILLS,
  TIME_RIVER_SKILL_LIBRARY,
  TIME_RIVER_SPEED,
  applyTimeRiverSkillEffect,
  buildTimeRiverAdversary,
  collapsePastWorldlineArtifacts,
  ensureTimeRiverSkills,
  getTimeRiverCounterMessage,
  getTimeRiverEnemyNames,
  isTimeRiverCounteredSkill,
  prioritizeTimeRiverAttackSkills,
} from '../model/timeRiverAdversary.js';

const player = {
  攻击: 100,
  防御: 200,
  血量上限: 1000,
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

test('叶天帝与荒天帝按遭遇倍率生成全属性，速度固定为1100', () => {
  const ye = buildTimeRiverAdversary(player, template('叶天帝'), { random: () => 0 });
  const huang = buildTimeRiverAdversary(player, template('荒天帝'), { random: () => 0.999999 });

  assert.equal(ye._时间长河倍率, 5);
  assert.deepEqual([ye.攻击, ye.防御, ye.血量上限], [500, 1000, 5000]);
  assert.equal(huang._时间长河倍率, 12);
  assert.deepEqual([huang.攻击, huang.防御, huang.血量上限], [1200, 2400, 12000]);
  for (const enemy of [ye, huang]) {
    assert.equal(enemy.速度 + enemy.mijinglevel_id * 50, TIME_RIVER_SPEED.final);
    assert.equal(enemy.当前血量, enemy.血量上限);
  }
});

test('其他时间长河敌人为玩家1至3倍，尸骸仙帝固定三倍', () => {
  const weak = buildTimeRiverAdversary(player, template('狠人大帝'), { random: () => 0 });
  const strong = buildTimeRiverAdversary(player, template('无始大帝'), { random: () => 0.999999 });
  const corpse = buildTimeRiverAdversary(player, template('尸骸仙帝'), { random: () => 0 });

  assert.deepEqual([weak.攻击, weak.防御, weak.血量上限], [100, 200, 1000]);
  assert.deepEqual([strong.攻击, strong.防御, strong.血量上限], [300, 600, 3000]);
  assert.deepEqual([corpse.攻击, corpse.防御, corpse.血量上限], [300, 600, 3000]);
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
  const cang = buildTimeRiverAdversary(player, template('苍帝'));
  const hong = buildTimeRiverAdversary(player, template('鸿帝'));
  const yu = buildTimeRiverAdversary(player, template('羽帝'));
  assert.deepEqual(getTimeRiverEnemyNames(cang.名号, [hong, yu]), ['苍帝', '鸿帝', '羽帝']);
  assert.equal(cang._时间长河反制, true);
  for (const skill of TIME_RIVER_SKILL_LIBRARY) assert.ok(cang.学习的功法.includes(skill.name));
  assert.deepEqual(cang.学习的功法.filter(name => TIME_RIVER_COUNTER_SKILLS.includes(name)), []);
});

test('时间长河反制拦截九秘与灵根战力', () => {
  const huang = buildTimeRiverAdversary(player, template('荒天帝'));
  assert.equal(isTimeRiverCounteredSkill({ name: '皆字秘', class: '功法' }, huang), true);
  assert.equal(isTimeRiverCounteredSkill({ name: '任意先天神通', class: '灵根' }, huang), true);
  assert.match(getTimeRiverCounterMessage(huang, '一气化三清'), /他化自在/);
});

test('帝威卸甲削减属性并拆除无敌气魄', () => {
  const attacker = { 名号: '苍帝' };
  const defender = { 名号: '玩家', 攻击: 100, 防御: 200, 血量上限: 1000, 当前血量: 800, 无敌气魄: true };
  const messages = [];
  const skill = TIME_RIVER_SKILL_LIBRARY.find(item => item.name === '帝威卸甲');
  assert.equal(applyTimeRiverSkillEffect(attacker, defender, skill, messages), true);
  assert.deepEqual(
    [defender.攻击, defender.防御, defender.血量上限, defender.当前血量],
    [50, 100, 500, 400],
  );
  assert.equal(defender.无敌气魄, false);
  assert.equal(defender._时间长河无敌气魄已卸除, true);
  assert.match(messages.join('\n'), /削减50%/);
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
