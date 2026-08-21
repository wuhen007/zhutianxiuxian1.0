import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ensureCombatSkillLoadout,
  equipCombatSkill,
  filterEquippedCombatSkills,
  filterEquippedVitalitySkills,
  getCombatSkillOptions,
  resolveCombatSkillSelection,
} from '../model/combatSkillLoadout.js';
import { buildCombatSkillPanel } from '../model/combatSkillPanel.js';
import fs from 'node:fs';

const skill = name => ({ name, class: '功法' });
const pools = {
  attack: ['攻一', '攻二', '攻三', '攻四', '攻五', '攻六'].map(skill),
  defense: ['防一', '防二', '防三', '防四', '防五', '防六'].map(skill),
  healing: [skill('者字秘'), skill('不灭经')],
  revival: [skill('涅槃仙功'), skill('者字秘')],
};

test('老玩家首次读取时默认装配5攻5防1生机', () => {
  const player = { 学习的功法: [...pools.attack, ...pools.defense, ...pools.healing, ...pools.revival].map(item => item.name) };
  const loadout = ensureCombatSkillLoadout(player, pools);
  assert.equal(loadout.攻击.length, 5);
  assert.equal(loadout.防御.length, 5);
  assert.equal(loadout.生机, '者字秘');
});

test('恢复与复活功法共用一个生机槽', () => {
  const player = { 学习的功法: ['者字秘', '不灭经', '涅槃仙功'] };
  ensureCombatSkillLoadout(player, pools);
  const result = equipCombatSkill(player, '生机', '涅槃仙功', pools);
  assert.deepEqual(result, { ok: true, replaced: '者字秘' });
  assert.deepEqual(filterEquippedVitalitySkills(player, [...pools.healing, ...pools.revival]).filter(x => x.class === '功法').map(x => x.name), ['涅槃仙功']);
});

test('攻击和防御槽只让已装备的功法进入战斗，先天技能不受槽位影响', () => {
  const innate = { name: '先天神通', class: '灵根' };
  const player = {
    学习的功法: ['攻一', '攻二'],
    战斗技能配置: { 攻击: ['攻二'], 防御: [], 生机: '' },
  };
  const selected = filterEquippedCombatSkills(player, [skill('攻一'), skill('攻二'), innate], '攻击');
  assert.deepEqual(selected.map(item => item.name), ['攻二', '先天神通']);
});

test('配置技能支持分类内序号且与展示顺序一致', () => {
  const player = { 学习的功法: ['攻二', '攻一', '防二', '者字秘', '涅槃仙功'] };
  assert.deepEqual(getCombatSkillOptions(player, '攻击', pools), ['攻一', '攻二']);
  assert.deepEqual(resolveCombatSkillSelection(player, '攻击', '2', pools), {
    ok: true, name: '攻二', index: 2,
  });
  assert.deepEqual(resolveCombatSkillSelection(player, '生机', '2', pools), {
    ok: true, name: '涅槃仙功', index: 2,
  });
  assert.equal(resolveCombatSkillSelection(player, '防御', '9', pools).reason, 'index');
});

test('战斗技能面板给出实际概率、触发时机、倍率与熟练度', () => {
  const detailedPools = {
    attack: [{ name: '攻一', class: '功法', pr: 0.5, cnt: -1, beilv: 2, other: 0, 攻击类型: '神通' }],
    defense: [{ name: '防一', class: '功法', pr: 0.4, cnt: 0, beilv: 0.5, other: 0 }],
    healing: [{ name: '者字秘', class: '功法', 技能分类: '治疗', 触发时机: '受击后', pr: 0.25, cnt: -1 }],
    revival: [{ name: '者字秘', class: '功法', 复活技能: 1, 恢复比例: 1, pr: 1, cnt: -1 }],
  };
  const player = {
    名号: '测试修士',
    学习的功法: ['攻一', '防一', '者字秘'],
    功法熟练度: { 攻一: 750, 防一: 1000, 者字秘: 1000 },
    战斗技能配置: { 攻击: ['攻一'], 防御: ['防一'], 生机: '者字秘' },
  };
  const panel = buildCombatSkillPanel(player, detailedPools);
  const attack = panel.sections[0].items[0];
  const defense = panel.sections[1].items[0];
  const vitality = panel.sections[2].items[0];

  assert.equal(attack.triggers[0].chance, '56.00%');
  assert.equal(attack.triggers[0].multiplier, '技能 x2.00');
  assert.equal(attack.proficiency, 750);
  assert.equal(defense.triggers[0].when, '第1轮受击时');
  assert.equal(defense.triggers[0].effect, '承伤倍率x0.45');
  assert.equal(defense.triggers[0].multiplier, '承伤 x0.45');
  assert.equal(vitality.triggers[0].effect, '恢复35%最大生命');
  assert.match(vitality.triggers[1].effect, /每局复生2次/);
});

test('战斗技能面板展示无需装备的特殊秘法熟练度机制', () => {
  const player = {
    名号: '测试修士',
    学习的功法: ['一气化三清', '皆字秘', '临字秘'],
    功法熟练度: { 一气化三清: 500, 皆字秘: 750, 临字秘: 1000 },
    战斗技能配置: { 攻击: [], 防御: [], 生机: '' },
  };
  const special = buildCombatSkillPanel(player, {}).sections.find(section => section.key === 'special');

  assert.equal(special.summary, '3 门');
  assert.deepEqual(special.items.map(item => item.name), ['一气化三清', '皆字秘', '临字秘']);
  assert.match(special.items[0].triggers[0].effect, /2道道身.*55%.*2回合/);
  assert.match(special.items[1].triggers[0].effect, /持续3回合.*力竭1回合/);
  assert.match(special.items[2].triggers[0].effect, /必定神禁.*神禁3回合/);
  assert.ok(special.items.every(item => item.automatic));
});

test('战斗技能命令使用HTML并在大列表时启用分页截图', () => {
  const source = fs.readFileSync(
    new URL('../apps/User/GongfaProficiency.js', import.meta.url),
    'utf8'
  );
  assert.match(source, /get_combatSkillData/);
  assert.match(source, /itemCount > 24/);
  assert.match(source, /puppeteer\.screenshots\('combat_skill'/);
});
