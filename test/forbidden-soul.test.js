import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FORBIDDEN_PROTECTION_MS,
  addSoulBrandResentment,
  applyForbiddenBattleModifiers,
  applyForbiddenDisposition,
  breakSoulBrand,
  buildForbiddenCompanion,
  calculateSoulBreakChance,
  craftHumanPuppet,
  ensureForbiddenState,
  getAvailableDispositions,
  getForbiddenCultivationMultiplier,
  getForbiddenTargetEligibility,
  protectForbiddenTarget,
  refineStolenDaoFruit,
  repairHumanPuppet,
} from '../model/forbiddenSoul.js';

function player(id, extra = {}) {
  return {
    id,
    名号: id,
    魔道值: 1000,
    业力值: 0,
    灵根: { name: '九重魔功', type: '魔头' },
    mijinglevel_id: 15,
    xiangulevel_id: 1,
    yuanshenlevel_id: 6,
    攻击: 1000,
    防御: 800,
    血量上限: 2000,
    当前血量: 2000,
    元神上限: 1000,
    元神: 1000,
    道心值: 100,
    学习的功法: ['剑诀'],
    当前使用的功法: '剑诀',
    自身之道类型: '攻伐',
    自身之道名称: '杀伐剑道',
    ...extra,
  };
}

test('旧玩家邪道状态按需补齐并懒恢复真灵蛰伏', () => {
  const target = player('target', {
    当前血量: 0,
    元神: 0,
    邪道创伤: { 真灵蛰伏至: 999 },
  });
  ensureForbiddenState(target, 1000);
  assert.equal(target.邪道.version, 1);
  assert.equal(target.当前血量, 600);
  assert.equal(target.元神, 700);
  assert.equal(target.邪道创伤.真灵蛰伏至, 0);
});

test('镇魂使用统一境界权柄并保护低两个层级的目标', () => {
  const attacker = player('attacker', { mijinglevel_id: 15 });
  assert.equal(getForbiddenTargetEligibility(attacker, player('equal', { mijinglevel_id: 15 })).ok, true);
  assert.equal(getForbiddenTargetEligibility(attacker, player('one-lower', { mijinglevel_id: 14 })).ok, true);
  assert.equal(getForbiddenTargetEligibility(attacker, player('two-lower', { mijinglevel_id: 13 })).ok, false);

  const xiangu = player('xiangu', { mijinglevel_id: 1, xiangulevel_id: 14 });
  assert.equal(getForbiddenTargetEligibility(xiangu, player('target', { mijinglevel_id: 14 })).ok, true);

  const huafen = player('huafen', {
    mijinglevel_id: 1,
    xiangulevel_id: 1,
    huafenlevel_id: 10,
  });
  assert.equal(getForbiddenTargetEligibility(huafen, player('target', { mijinglevel_id: 10 })).ok, true);
});

test('三种处置按境界、元神与目标道果开放', () => {
  const target = player('target', { mijinglevel_id: 15 });
  assert.deepEqual(getAvailableDispositions(player('all'), target), ['烙印', '灭魂', '夺果']);
  assert.deepEqual(
    getAvailableDispositions(player('brand', { mijinglevel_id: 11, yuanshenlevel_id: 2 }), target),
    ['烙印']
  );
  delete target.自身之道名称;
  assert.deepEqual(getAvailableDispositions(player('no-fruit'), target), ['烙印', '灭魂']);
});

test('同一个结算ID不会重复增加业力或魔道值', () => {
  const attacker = player('attacker');
  const target = player('target');
  const options = { settlementId: 'settle-1', attackerId: 'attacker', targetId: 'target', now: 1000 };
  const first = applyForbiddenDisposition('烙印', attacker, target, options);
  const second = applyForbiddenDisposition('烙印', attacker, target, options);
  assert.equal(first.ok, true);
  assert.equal(second.idempotent, true);
  assert.equal(attacker.业力值, 40);
  assert.equal(attacker.魔道值, 1010);
  assert.equal(target.邪道创伤.魂印.masterId, 'attacker');
  assert.equal(target.邪道创伤.禁忌侵害保护至, 1000 + FORBIDDEN_PROTECTION_MS);
});

test('魂印连续三次失败必破，破印反噬印主元神', () => {
  const attacker = player('attacker');
  const target = player('target');
  applyForbiddenDisposition('烙印', attacker, target, {
    settlementId: 'brand', attackerId: 'attacker', targetId: 'target', now: 1000,
  });
  const brand = target.邪道创伤.魂印;
  assert.equal(calculateSoulBreakChance(target, brand), 0.35);
  assert.equal(addSoulBrandResentment(brand), false);
  assert.equal(addSoulBrandResentment(brand), false);
  assert.equal(addSoulBrandResentment(brand), true);
  assert.equal(breakSoulBrand(attacker, target, { targetId: 'target', now: 2000 }), true);
  assert.equal(attacker.元神, 800);
  assert.equal(attacker.邪道.魂奴, null);
  assert.equal(target.邪道创伤.魂印, null);
});

test('灭魂生成遗蜕，人傀固定三成且受主人三成五上限', () => {
  const attacker = player('attacker', { 攻击: 1000, 防御: 1000, 血量上限: 1000 });
  const target = player('target', { 攻击: 10_000, 防御: 10_000, 血量上限: 10_000 });
  const result = applyForbiddenDisposition('灭魂', attacker, target, {
    settlementId: 'destroy', attackerId: 'attacker', targetId: 'target', now: 1000,
  });
  assert.equal(result.ok, true);
  assert.equal(target.当前血量, 0);
  assert.equal(target.道心值, 90);

  assert.equal(craftHumanPuppet(attacker, 2000).ok, true);
  const companion = buildForbiddenCompanion(attacker, '人傀', 2000);
  assert.deepEqual([companion.攻击, companion.防御, companion.血量上限], [350, 350, 350]);
  attacker.邪道.人傀.durability = 80;
  assert.deepEqual(repairHumanPuppet(attacker, 40, 2000), { ok: true, before: 80, current: 100 });
});

test('夺果只有一个槽并以战斗副本方式提供3%加成', () => {
  const attacker = player('attacker');
  const target = player('target');
  applyForbiddenDisposition('夺果', attacker, target, {
    settlementId: 'fruit', attackerId: 'attacker', targetId: 'target', now: 1000,
  });
  assert.equal(refineStolenDaoFruit(attacker, 2000).ok, true);
  assert.equal(attacker.邪道.道果杂质, 15);

  const combatant = structuredClone(attacker);
  applyForbiddenBattleModifiers(combatant, 2000);
  assert.equal(combatant.攻击, 1030);
  assert.equal(combatant.防御, 824);
  assert.equal(combatant.血量上限, 2060);
  assert.equal(getForbiddenCultivationMultiplier(target, 2000), 0.9);

  applyForbiddenBattleModifiers(combatant, 2000);
  assert.equal(combatant.攻击, 1030);
});

test('共享禁忌保护同步旧天魔炼化保护字段', () => {
  const target = player('target');
  protectForbiddenTarget(target, 1000);
  assert.equal(target.邪道创伤.禁忌侵害保护至, 1000 + FORBIDDEN_PROTECTION_MS);
  assert.equal(target.天魔炼化保护至, 1000 + FORBIDDEN_PROTECTION_MS);
});
