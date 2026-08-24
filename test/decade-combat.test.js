import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DECADE_GOD_MASTER_MOVES,
  applyDecadeSkillEffects,
  resolveDecadeAuroraCurtain,
  resolveDecadeCombatSkill,
  resolveDecadeDodgeCounter,
  tickDecadeCombatState,
} from '../model/decadeCombat.js';
import { HEISEI_RIDERS } from '../model/endlessTreasure.js';
import { getCompanionAttackAction } from '../model/companionCombat.js';

function decade(name = '帝骑·神主', deck = ['空我', '甲斗', 'Kiva']) {
  return {
    名号: '门矢士',
    灵根: { name },
    攻击: 1000,
    防御: 600,
    当前血量: 5000,
    血量上限: 10000,
    诸天镜系统: {
      世界进度: { 假面骑士帝骑: { 出战卡组: deck } },
    },
  };
}

test('攻击技能表可正常加载三阶段帝骑技能入口', () => {
  const skills = JSON.parse(readFileSync(new URL('../resources/data/item/技能组/攻击技能.json', import.meta.url), 'utf8'));
  assert.deepEqual(skills.filter(skill => skill.帝骑技能池).map(skill => skill.name), ['帝骑', '帝骑·神主', '帝骑·终极神主']);
});

test('帝骑骑士助战使用骑士文案，只有圆环分身使用拉弓文案', () => {
  assert.equal(getCompanionAttackAction({ _帝骑分身: true, 分身: true }), '驾驭骑士之力');
  assert.equal(getCompanionAttackAction({ 分身: true, 名号: '圆环分身' }), '拉弓凝聚虹光');
  assert.equal(getCompanionAttackAction({ 分身: true, 名号: '数字秘分身' }), '发动协同攻击');
  assert.equal(getCompanionAttackAction({ 名号: '魂奴' }), '发动协同攻击');
});

test('帝骑技能池只从三张出战卡与无卡牌限制的世界技能中取招式', () => {
  const player = decade('帝骑·神主', ['甲斗', 'Kiva', '电王']);
  const skill = { name: '帝骑·神主', class: '灵根', 帝骑技能池: '终极形态召唤', beilv: 7 };
  const result = resolveDecadeCombatSkill(player, skill, () => 0);
  assert.equal(result.骑士卡, '甲斗');
  assert.equal(result.name, '帝骑·神主');
  assert.equal(result.招式名, '百虫剑·究极斩');

  const ultimate = resolveDecadeCombatSkill(
    decade('帝骑·终极神主', ['空我', '亚极陀', '龙骑']),
    { name: '帝骑·终极神主', class: '灵根', 帝骑技能池: '全骑士与世界破坏', beilv: 10 },
    () => 0.999,
  );
  assert.equal(ultimate.name, '帝骑·终极神主');
  assert.equal(ultimate.招式名, '世界破坏者·终幕');
  assert.equal(ultimate.首领最大生命伤害比例, 0.08);
});

test('九骑终极形态拥有十项独立大招且超越甲斗同时具备究极斩与究极炮', () => {
  assert.equal(DECADE_GOD_MASTER_MOVES.length, 10);
  assert.equal(new Set(DECADE_GOD_MASTER_MOVES.map(move => move.name)).size, 10);
  assert.deepEqual(
    DECADE_GOD_MASTER_MOVES.filter(move => move.骑士卡 === '甲斗').map(move => move.name),
    ['百虫剑·究极斩', '百虫剑·究极炮'],
  );
  const riders = new Map(HEISEI_RIDERS.map(rider => [rider.id, rider]));
  assert.equal(riders.get('kuuga').ultimate.shieldPct, 0.25);
  assert.equal(riders.get('kuuga').ultimate.chargeMultiplier, 1.5);
  assert.equal(riders.get('agito').ultimate.growthPct, 0.06);
  assert.equal(riders.get('blade').ultimate.antiHealRounds, 2);
  assert.equal(riders.get('kabuto').ultimate.alternate.label, '百虫剑·究极炮');
});

test('世界破坏者对首领追加8%最大生命伤害但受攻击十倍上限约束', () => {
  const attacker = decade('帝骑·终极神主');
  const defender = { 名号: '守关首领', 当前血量: 1_000_000, 血量上限: 1_000_000, 防御: 1000 };
  const result = applyDecadeSkillEffects(attacker, defender, {
    帝骑效果: 1,
    首领最大生命伤害比例: 0.08,
    首领伤害攻击上限: 10,
    禁疗回合: 2,
  }, { isBoss: true });
  assert.equal(result.bonusDamage, 10_000);
  assert.equal(defender.禁疗, 1);
  tickDecadeCombatState(defender, 1);
  tickDecadeCombatState(defender, 2);
  assert.equal(defender.禁疗, 0);
});

test('终极神主的极光帷幕每场仅抵消一次致命伤害并进行反击', () => {
  const defender = decade('帝骑·终极神主');
  const source = { 名号: '强敌', 当前血量: 20_000 };
  const first = resolveDecadeAuroraCurtain(defender, source, 6000);
  assert.equal(first.triggered, true);
  assert.equal(first.damage, 0);
  assert.equal(defender.护盾值, 2500);
  assert.equal(source.当前血量, 17_000);

  const second = resolveDecadeAuroraCurtain(defender, source, 6000);
  assert.equal(second.triggered, false);
  assert.equal(second.damage, 6000);
});

test('甲斗的高速反击只在闪避后消耗一次准备状态', () => {
  const defender = decade('帝骑·神主');
  const source = { 名号: '追击者', 当前血量: 5000 };
  applyDecadeSkillEffects(defender, source, {
    帝骑效果: 1,
    闪避加成: 0.12,
    反击比例: 0.4,
  });

  const first = resolveDecadeDodgeCounter(defender, source);
  assert.equal(first.triggered, true);
  assert.equal(first.counterDamage, 400);
  assert.equal(source.当前血量, 4600);
  assert.equal(defender._帝骑高速反击次数, 0);

  const second = resolveDecadeDodgeCounter(defender, source);
  assert.equal(second.triggered, false);
  assert.equal(source.当前血量, 4600);
});

test('空我先蓄势并在下一次招式释放蓄力重击', () => {
  const attacker = decade('帝骑·神主');
  const defender = { 名号: '试炼者', 当前血量: 5000, 防御: 500 };
  const first = { 帝骑效果: 1, beilv: 8, 蓄力重击: 1, 蓄力倍率: 1.5 };
  applyDecadeSkillEffects(attacker, defender, first);
  assert.equal(first.beilv, 8);
  assert.equal(attacker._帝骑空我已蓄力, true);

  const second = { ...first };
  applyDecadeSkillEffects(attacker, defender, second);
  assert.equal(second.beilv, 12);
  assert.equal(attacker._帝骑空我已蓄力, false);
});
