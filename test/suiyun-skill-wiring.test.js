import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import template from 'art-template';
import YAML from 'yaml';
import { buildCombatSkillPanel } from '../model/combatSkillPanel.js';
import { ensureCombatSkillLoadout, getCombatSkillOptions } from '../model/combatSkillLoadout.js';
import { createSuiyunRoot, SUIYUN_STAGES } from '../model/suiyun.js';
import { SUIYUN_COMBAT } from '../model/suiyunCombat.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const names = ['霜剑入月', '岁云归一', '白云苍狗'];
const innateItems = panel => panel.sections.flatMap(section => section.items).filter(item => item.innate);

test('岁云五阶段自动展示三战技，不要求功法且不占技能槽', () => {
  for (let stage = 1; stage <= SUIYUN_STAGES.length; stage++) {
    const player = { 灵根: createSuiyunRoot(stage), 学习的功法: [] };
    const panel = buildCombatSkillPanel(player);
    const innate = innateItems(panel);
    assert.deepEqual(innate.map(item => item.name), names);
    assert.ok(innate.every(item => item.automatic && item.equipped));
    assert.equal(panel.totalEquipped, 0);
    assert.equal(panel.totalLimit, 11);
    assert.deepEqual(ensureCombatSkillLoadout(player), { 攻击: [], 防御: [], 生机: '' });
    assert.deepEqual(getCombatSkillOptions(player, '攻击'), []);
    assert.deepEqual(player.学习的功法, []);
  }
});

test('岁云战技不会因伪造学习记录或离开岁云灵根继续显示', () => {
  const player = { 灵根: createSuiyunRoot(1), 学习的功法: [...names], 岁云: { 已觉醒: true } };
  assert.equal(innateItems(buildCombatSkillPanel(player)).length, 3);
  player.灵根 = { name: '凡体', type: '体质' };
  assert.equal(innateItems(buildCombatSkillPanel(player)).length, 0);
});

test('灵根战技和已学特殊秘法并存，显示采用实际共享常量', () => {
  const player = { 灵根: createSuiyunRoot(5), 学习的功法: ['皆字秘'] };
  const panel = buildCombatSkillPanel(player);
  const special = panel.sections.find(section => section.key === 'special');
  assert.deepEqual(special.items.map(item => item.name), ['皆字秘', ...names]);
  const [attack, defense, revival] = innateItems(panel);
  assert.match(attack.triggers[0].effect, new RegExp(`最多${SUIYUN_COMBAT.targets}名.*每目标${SUIYUN_COMBAT.hits}击`));
  assert.match(attack.triggers[0].effect, /当前生命.*不降低生命上限/);
  assert.match(attack.triggers[0].effect, /速度降低20%/);
  assert.match(attack.triggers[0].multiplier, /25\.00/);
  assert.match(defense.triggers[0].effect, /减伤50%.*实际承伤的100%.*不连锁/);
  assert.match(revival.triggers[0].when, /最多3次/);
  assert.match(revival.triggers[0].effect, /1\.5.*3\.375/);
});

test('HTML实际渲染自带技能，无需秘籍或虚构熟练度，文字回退一致', () => {
  const panel = buildCombatSkillPanel({ 灵根: createSuiyunRoot(1), 学习的功法: [] });
  const html = template.render(read('resources/html/combat_skill/combat_skill.html'), { panel, pluResPath: '/fixture' });
  for (const name of names) assert.ok(html.includes(name));
  assert.equal((html.match(/无需学习或装备/g) || []).length, 3);
  assert.doesNotMatch(html, /当前熟练度|0 \/ 1000/);
  assert.match(read('apps/User/GongfaProficiency.js'), /item\.innate \? '灵根自带，无需学习或装备'/);
});

test('帮助与说明准确写明灵根自带三战技及未指定数值的默认规则', () => {
  const groups = YAML.parse(read('config/help/linggenhelp.yaml'));
  const help = groups.find(group => group.group.startsWith('岁云月华'));
  assert.ok(help);
  const entries = help.list.map(item => `${item.title} ${item.desc}`).join('\n');
  for (const name of names) assert.ok(entries.includes(name));
  assert.match(entries, /每敌9击/);
  assert.match(entries, /50%.*100%/);
  assert.match(entries, /3\.375/);
  const docs = read('docs/岁云灵根说明.md');
  assert.match(docs, /全部五阶段/);
  assert.match(docs, /最多81击/);
  assert.match(docs, /不降低生命上限/);
  assert.match(docs, /明示默认值/);
});

test('单挑、团队和旧团本各自接入三战技完整生命周期，而非仅导入共享模块', () => {
  const source = read('model/xiuxian.js');
  const boundaries = [
    'async function zd_battle_1v1(',
    'async function zd_battle_team(',
    'export async function tb_battle(',
    'async function calculateAttack(',
  ].map(marker => source.indexOf(marker));
  assert.ok(boundaries.every(index => index >= 0));
  for (let index = 0; index < 3; index++) {
    const engine = source.slice(boundaries[index], boundaries[index + 1]);
    for (const hook of ['resetSuiyunCombat', 'castSuiyunMoonSword', 'tickSuiyunFrost', 'consumeSuiyunControl', 'trySuiyunRevival']) {
      assert.ok(engine.includes(`${hook}(`), `战斗入口${index + 1}缺少${hook}`);
    }
  }
  const damage = source.slice(source.indexOf('function applySuiyunBattleDamage('), source.indexOf('const SKILL_DB'));
  assert.match(damage, /reduceSuiyunDamage\(defender, damage\)/);
  assert.match(damage, /reflectSuiyunDamage\(defender, attacker, lost\)/);
});

test('独立团本含玩家和首领双方的霜剑入口，归一按真实扣血反弹并及时复活', () => {
  const source = read('apps/Battle/tuanben.js');
  const start = source.indexOf('async tb_battle(');
  const end = source.indexOf('async checkPlayerStatus(', start);
  const engine = source.slice(start, end);
  assert.match(engine, /resetSuiyunCombat\(u\)/);
  assert.match(engine, /tickSuiyunFrost\(unit, cnt\)/);
  assert.match(engine, /consumeSuiyunControl\(activeUnit\)/);
  assert.match(engine, /castSuiyunMoonSword\(player, \[bossCopy\]/);
  assert.match(engine, /castSuiyunMoonSword\(bossCopy, playersData/);
  const damage = source.slice(source.indexOf('function applyRaidSuiyunDamage('), source.indexOf('export class tuanben'));
  assert.match(damage, /reduceSuiyunDamage\(defender, incoming\)/);
  assert.match(damage, /Math\.min\(before, damage\)/);
  assert.match(damage, /reflectSuiyunDamage\(defender, attacker, lost\)/);
  assert.match(damage, /reviveRaidSuiyun\(defender, messages\)/);
  const revival = source.slice(source.indexOf('async checkPlayerRevival('));
  assert.ok(revival.indexOf('trySuiyunRevival(player)') < revival.indexOf('!player.已复活'));
});
