import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENDLESS_TREASURES,
  grantRandomEndlessTreasure,
  normalizePlayerTreasures,
  getTreasureStates,
  getTreasureEffects,
  getTreasureAntiHeal,
  getTreasureBattleEntries,
  getPlayerTreasureViews,
  ENDLESS_TREASURE_LEVEL_CAP,
  equipEndlessTreasure,
  getEndlessTreasureSlotCount,
  normalizeEndlessTreasureLoadout,
  unequipEndlessTreasure,
  unlockEndlessTreasureSlot,
  upgradeEndlessTreasure,
  getEndlessTreasureUpgradeCost,
} from '../model/endlessTreasure.js';
import {
  grantTitle,
  equipTitle,
  getTitleEffects,
  getTitleViews,
  normalizeTitles,
} from '../model/titleSystem.js';

test('至宝池包含18件', () => {
  assert.equal(ENDLESS_TREASURES.length, 18);
  const ids = new Set(ENDLESS_TREASURES.map((t) => t.id));
  assert.equal(ids.size, 18, 'id不可重复');
});

test('第25关随机解锁一件永久至宝', () => {
  const player = { id: '1' };
  const gained = grantRandomEndlessTreasure(player, () => 0);
  assert.ok(gained);
  assert.equal(gained.level, 1);
  assert.equal(gained.upgraded, false);
  const owned = normalizePlayerTreasures(player);
  assert.equal(owned.length, 1);
  assert.equal(owned[0].id, gained.treasure.id);
});

test('全部收集后重复解锁升级至宝', () => {
  const player = {
    id: '2',
    无尽至宝列表: ENDLESS_TREASURES.map((t) => ({
      id: t.id,
      name: t.name,
      level: 1,
    })),
  };
  const gained = grantRandomEndlessTreasure(player, () => 0.99);
  assert.ok(gained);
  assert.equal(gained.upgraded, true);
  assert.equal(gained.level, 2);
  const owned = normalizePlayerTreasures(player);
  assert.ok(owned.some((o) => o.level === 2));
});

test('至宝等级上限10级，满级不再升级', () => {
  const player = {
    id: '3',
    无尽至宝列表: ENDLESS_TREASURES.map((t) => ({
      id: t.id,
      name: t.name,
      level: ENDLESS_TREASURE_LEVEL_CAP,
    })),
  };
  const gained = grantRandomEndlessTreasure(player, () => 0.99);
  assert.equal(gained, null);
});

test('至宝消耗道痕升级，费用从1000起每级递增750', () => {
  const player = {
    劫境道痕: 20_000,
    无尽至宝列表: [
      { id: 'treasure_decade', name: 'K触屏·帝骑驱动器', level: 1 },
    ],
  };
  assert.equal(getEndlessTreasureUpgradeCost(1), 1000);
  assert.equal(getEndlessTreasureUpgradeCost(2), 1750);
  const first = upgradeEndlessTreasure(player, 'K触屏·帝骑驱动器');
  assert.equal(first.level, 2);
  assert.equal(first.cost, 1000);
  assert.equal(first.nextCost, 1750);
  assert.equal(player.劫境道痕, 19_000);
  const second = upgradeEndlessTreasure(player, '1');
  assert.equal(second.level, 3);
  assert.equal(second.cost, 1750);
  assert.equal(player.无尽至宝列表[0].level, 3);
  player.无尽至宝列表[0].level = ENDLESS_TREASURE_LEVEL_CAP;
  assert.throws(() => upgradeEndlessTreasure(player, '1'), /已经升至Lv\.10/);
});

test('K触屏：帝骑腰带1级未觉醒，3级觉醒神主形态', () => {
  const member = {
    id: 'p1',
    name: '测试者',
    treasureIds: [{ id: 'treasure_decade', level: 1 }],
    abilities: { anime_decade_driver: 1 },
    __worldAbilityCounts: {},
  };
  const effects1 = getTreasureEffects(member, {});
  // 削弱后：基础与未觉醒替代形态均按50%结算。
  assert.ok(effects1.attackPct >= 0.14 - 1e-9);
  assert.equal(getTreasureBattleEntries(member, {}).some(e => e.type === 'transformRider'), true);

  member.abilities.anime_decade_driver = 3;
  const states = getTreasureStates(member, {});
  assert.equal(states[0].awaken.active, true);
  assert.equal(states[0].awaken.formName, '神主形态·帝骑');
  const effects = getTreasureEffects(member, {});
  assert.equal(effects.attackPct >= 0.29, true);
  const entries = getTreasureBattleEntries(member, {});
  assert.ok(entries.some(e => e.type === 'summonRiders'));
  assert.ok(entries.some(e => e.type === 'execute'));
});

test('缘一：集齐日之呼吸与通透世界后觉醒日呼传人', () => {
  const member = {
    id: 'p1',
    name: '缘一',
    treasureIds: [{ id: 'treasure_yoriichi', level: 2 }],
    abilities: { treasure_demon_mark: 1, anime_sun_breath: 1 },
    __worldAbilityCounts: {},
  };
  assert.equal(getTreasureStates(member, {}).length > 0, true);
  member.abilities.anime_transparent_world = 1;
  const states = getTreasureStates(member, {});
  assert.equal(states[0].awaken.active, true);
  assert.equal(states[0].awaken.formName, '日呼传人');
  // 2级觉醒效果缩放：0.35 * 0.6
  const effects = getTreasureEffects(member, {});
  assert.ok(effects.attackPct >= 0.28);
  const entries = getTreasureBattleEntries(member, {});
  assert.ok(entries.some(e => e.type === 'multiHit' && e.burn?.antiHeal));
});

test('九尾：仙人模式→仙狐模式两段觉醒', () => {
  const base = {
    id: 'p1',
    name: '九尾',
    treasureIds: [{ id: 'treasure_ninetails', level: 1 }],
    abilities: { treasure_ninetails_chakra: 1 },
    __worldAbilityCounts: {},
  };
  // 只掌握螺旋丸 → 仙人模式
  base.abilities.anime_rasengan = 1;
  let states = getTreasureStates(base, {});
  assert.ok(Object.keys(states[0].stageEffect).length > 0);
  assert.equal(states[0].awaken.active, false);
  // 再掌握影分身 → 仙狐模式
  base.abilities.anime_shadow_clone = 1;
  states = getTreasureStates(base, {});
  assert.equal(states[0].awaken.active, true);
  assert.equal(states[0].awaken.formName, '仙狐模式');
});

test('魔法少女：按万象番界能力数觉醒', () => {
  const member = {
    id: 'p1',
    name: '魔法少女',
    treasureIds: [{ id: 'treasure_magical_girl', level: 1 }],
    abilities: { treasure_magic_contract: 1 },
    __worldAbilityCounts: { anime: 2 },
  };
  const states = getTreasureStates(member, {});
  assert.equal(states[0].awaken.active, true);
});

test('禁疗：日之灼烧生效时敌方治疗被压制', () => {
  const member = {
    id: 'p1',
    name: '缘一',
    treasureIds: [],
    abilities: {},
    treasureBurns: [{ label: '日之灼烧', pct: 0.025, rounds: 3, remaining: 2, antiHeal: true }],
  };
  const run = { members: { p1: member } };
  assert.equal(getTreasureAntiHeal(run), 1);
  member.treasureBurns[0].remaining = 0;
  assert.equal(getTreasureAntiHeal(run), 0);
});

test('称号：发放/佩戴/效果/视图', () => {
  const player = { 称号列表: [] };
  assert.equal(grantTitle(player, '无尽劫境天尊'), true);
  assert.equal(grantTitle(player, '无尽劫境天尊'), false, '重复发放不生效');
  assert.equal(equipTitle(player, '无尽劫境天尊'), true);
  const effects = getTitleEffects(player);
  assert.equal(effects.attrPct, 0.25);
  assert.equal(effects.tokenPct, 0.25);
  const view = getTitleViews(player);
  assert.equal(view.equipped, '无尽劫境天尊');
  assert.equal(view.list.length, 1);
  assert.equal(view.list[0].equipped, true);
  assert.equal(equipTitle(player, '不存在的称号'), false);
  assert.equal(normalizeTitles(player).length, 1);
});

test('至宝面板视图', () => {
  const player = {
    无尽至宝列表: [{ id: 'treasure_decade', name: 'K触屏·帝骑驱动器', level: 1 }],
  };
  const views = getPlayerTreasureViews(player);
  assert.equal(views.length, 1);
  assert.equal(views[0].name, 'K触屏·帝骑驱动器');
  assert.ok(views[0].desc.length > 0);
});

test('至宝槽按25层循环并递增消耗道痕', () => {
  const player = {
    无尽劫境最高层: 75,
    劫境道痕: 20_000,
    无尽至宝列表: ENDLESS_TREASURES.slice(0, 3).map(treasure => ({
      id: treasure.id,
      name: treasure.name,
      level: 1,
    })),
  };
  assert.equal(getEndlessTreasureSlotCount(player), 1);
  assert.equal(unlockEndlessTreasureSlot(player).cost, 5000);
  assert.equal(unlockEndlessTreasureSlot(player).cost, 5500);
  assert.equal(getEndlessTreasureSlotCount(player), 3);
  assert.equal(equipEndlessTreasure(player, player.无尽至宝列表[1].name).equipped.length, 2);
  unequipEndlessTreasure(player, player.无尽至宝列表[0].name);
  unequipEndlessTreasure(player, player.无尽至宝列表[1].name);
  assert.deepEqual(normalizeEndlessTreasureLoadout(player).equipped, []);
});
