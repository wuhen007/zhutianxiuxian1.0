import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENDLESS_SPECIAL_TREASURES,
  ENDLESS_TREASURES,
  HEISEI_RIDERS,
  grantRandomEndlessTreasure,
  grantRandomEndlessTierTreasure,
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
  detectFusions,
  getEndlessContent,
} from '../model/endlessRealm.js';
import { getEndlessDifficulty } from '../model/endlessDifficulty.js';
import {
  grantTitle,
  equipTitle,
  getTitleEffects,
  getTitleViews,
  normalizeTitles,
  recoverEarnedTitles,
} from '../model/titleSystem.js';

const NORMAL_ENDLESS_TREASURES = ENDLESS_TREASURES.filter(treasure => !treasure.dropTier);

test('普通至宝池保持19件，A3至A6特殊至宝共8件', () => {
  assert.equal(NORMAL_ENDLESS_TREASURES.length, 19);
  assert.equal(ENDLESS_SPECIAL_TREASURES.length, 8);
  assert.ok(NORMAL_ENDLESS_TREASURES.some(item => item.id === 'treasure_strongest_qi'));
  assert.deepEqual(
    ENDLESS_SPECIAL_TREASURES.map(treasure => treasure.id).sort(),
    [
      'treasure_body_seed',
      'treasure_five_elements',
      'treasure_great_sage',
      'treasure_hogyoku',
      'treasure_kryptonian',
      'treasure_spider_totem',
      'treasure_true_lord',
      'treasure_white_lantern',
    ].sort()
  );
  for (const tier of [3, 4, 5, 6]) {
    assert.equal(
      ENDLESS_SPECIAL_TREASURES.filter(treasure => treasure.dropTier === tier).length,
      2,
      `A${tier}应有两件特殊至宝`
    );
  }
  const ids = new Set(ENDLESS_TREASURES.map((t) => t.id));
  assert.equal(ids.size, ENDLESS_TREASURES.length, 'id不可重复');
});

test('A3至A6通关按25%、30%、35%、40%判定对应特殊至宝', () => {
  const sequence = (...values) => {
    let index = 0;
    return () => values[index++] ?? values.at(-1) ?? 0;
  };
  for (const [tier, chance] of [[3, 0.25], [4, 0.3], [5, 0.35], [6, 0.4]]) {
    assert.equal(getEndlessDifficulty(tier).specialTreasureChance, chance);

    const missed = { id: `miss-${tier}` };
    assert.equal(
      grantRandomEndlessTierTreasure(missed, tier, sequence(chance, 0)),
      null,
      `A${tier}概率未命中时不应发放`
    );
    assert.deepEqual(missed.无尽至宝列表 || [], []);

    const gained = grantRandomEndlessTierTreasure(
      { id: `hit-${tier}` },
      tier,
      sequence(chance - 0.001, 0)
    );
    assert.ok(gained);
    assert.equal(gained.treasure.dropTier, tier);
    assert.ok(ENDLESS_SPECIAL_TREASURES.some(treasure => treasure.id === gained.treasure.id));
  }

  for (const tier of [1, 2, 7, 9]) {
    const player = { id: `tier-${tier}` };
    assert.equal(grantRandomEndlessTierTreasure(player, tier, () => 0), null);
    assert.deepEqual(player.无尽至宝列表 || [], []);
  }
});

test('普通随机至宝不会混入A3至A6特殊池', () => {
  for (let index = 0; index < NORMAL_ENDLESS_TREASURES.length; index++) {
    const gained = grantRandomEndlessTreasure(
      { id: `normal-${index}` },
      () => (index + 0.5) / NORMAL_ENDLESS_TREASURES.length
    );
    assert.ok(gained);
    assert.equal(gained.treasure.dropTier, undefined);
  }
});

test('八件特殊至宝按能力、boon与融合条件逐项觉醒', () => {
  const byId = Object.fromEntries(ENDLESS_SPECIAL_TREASURES.map(treasure => [treasure.id, treasure]));
  const greatSageRequires = {
    myth_great_sage_art: 1,
    myth_seventy_two_transformations: 1,
    anime_fiery_eyes: 1,
  };
  const trueLordRequires = {
    art_eight_nine: 1,
    myth_heaven_eye: 1,
    myth_three_pointed_blade: 1,
  };
  const bodySeedRequires = {
    perfect_free_transformation: 1,
    perfect_supreme_bone: 1,
  };
  const spiderRequires = {
    multi_spider_gene: 1,
    multi_spider_sense: 1,
    multi_symbiote_suit: 1,
  };
  const kryptonianRequires = {
    multi_solar_core: 1,
    multi_man_of_steel: 1,
  };

  assert.deepEqual(byId.treasure_great_sage.awaken.requires, greatSageRequires);
  assert.deepEqual(byId.treasure_true_lord.awaken.requires, trueLordRequires);
  assert.deepEqual(byId.treasure_body_seed.awaken.requires, bodySeedRequires);
  assert.deepEqual(byId.treasure_body_seed.awaken.requiresFusions, ['fusion_desolate_sword']);
  assert.deepEqual(byId.treasure_five_elements.awaken.requires, { anime_emperor_armor: 3 });
  assert.deepEqual(byId.treasure_spider_totem.awaken.requires, spiderRequires);
  assert.deepEqual(byId.treasure_kryptonian.awaken.requires, kryptonianRequires);
  assert.deepEqual(byId.treasure_hogyoku.awaken.requires, { anime_hogyoku: 3 });
  assert.deepEqual(byId.treasure_white_lantern.awaken.requires, { multi_white_lantern: 3 });

  const stateFor = (treasureId, abilities, { blessings = [], fusions = [] } = {}) =>
    getTreasureStates({
      id: 'holder',
      treasureIds: [{ id: treasureId, level: 1 }],
      abilities: { ...abilities },
      blessings: [...blessings],
      fusions: [...fusions],
      __worldAbilityCounts: {},
    }, { fusions: [...fusions] })[0];

  for (const [treasureId, requirements] of [
    ['treasure_great_sage', greatSageRequires],
    ['treasure_true_lord', trueLordRequires],
    ['treasure_spider_totem', spiderRequires],
    ['treasure_kryptonian', kryptonianRequires],
  ]) {
    assert.equal(stateFor(treasureId, requirements).awaken.active, true);
    for (const missing of Object.keys(requirements)) {
      const incomplete = { ...requirements };
      delete incomplete[missing];
      assert.equal(
        stateFor(treasureId, incomplete).awaken.active,
        false,
        `${treasureId}缺少${missing}时不应觉醒`
      );
    }
  }

  const staffStage = byId.treasure_great_sage.stages.find(stage =>
    stage.requiresBoons?.includes('relic_ruyi_staff')
  );
  assert.ok(staffStage, '齐天大圣血脉应有金箍棒强化阶段');
  assert.deepEqual(stateFor('treasure_great_sage', greatSageRequires).stageEffect, {});
  assert.ok(Object.keys(stateFor('treasure_great_sage', greatSageRequires, {
    blessings: ['relic_ruyi_staff'],
  }).stageEffect).length > 0);

  assert.equal(stateFor('treasure_body_seed', bodySeedRequires).awaken.active, false);
  assert.equal(stateFor('treasure_body_seed', bodySeedRequires, {
    fusions: ['fusion_desolate_sword'],
  }).awaken.active, true);
  for (const missing of Object.keys(bodySeedRequires)) {
    const incomplete = { ...bodySeedRequires };
    delete incomplete[missing];
    assert.equal(stateFor('treasure_body_seed', incomplete, {
      fusions: ['fusion_desolate_sword'],
    }).awaken.active, false);
  }

  assert.equal(stateFor('treasure_five_elements', { anime_emperor_armor: 2 }).awaken.active, false);
  const emperor = stateFor('treasure_five_elements', { anime_emperor_armor: 3 });
  assert.equal(emperor.awaken.active, true);
  assert.equal(emperor.awaken.formName, '终极帝皇铠甲');

  for (const [treasureId, abilityId] of [
    ['treasure_hogyoku', 'anime_hogyoku'],
    ['treasure_white_lantern', 'multi_white_lantern'],
  ]) {
    assert.equal(stateFor(treasureId, { [abilityId]: 2 }).awaken.active, false);
    assert.equal(stateFor(treasureId, { [abilityId]: 3 }).awaken.active, true);
  }
});

test('平乱诀、仙劫剑诀与草字剑诀共同合成荒无剑诀', () => {
  const content = getEndlessContent();
  const fusion = content.fusions.find(item => item.id === 'fusion_desolate_sword');
  assert.ok(fusion);
  assert.deepEqual(
    [...fusion.requires].sort(),
    ['art_grass_sword', 'perfect_immortal_tribulation_sword', 'perfect_peace_sword'].sort()
  );

  const fusionRun = (overrides = {}) => ({
    members: {
      first: {
        abilities: { perfect_peace_sword: 1 },
        blessings: ['art_grass_sword'],
      },
      second: {
        abilities: { perfect_immortal_tribulation_sword: 1 },
        blessings: [],
      },
    },
    ...overrides,
  });
  assert.ok(detectFusions(fusionRun()).includes('fusion_desolate_sword'));

  const noGrass = fusionRun();
  noGrass.members.first.blessings = [];
  assert.equal(detectFusions(noGrass).includes('fusion_desolate_sword'), false);
  for (const missing of ['perfect_peace_sword', 'perfect_immortal_tribulation_sword']) {
    const incomplete = fusionRun();
    for (const member of Object.values(incomplete.members)) delete member.abilities[missing];
    assert.equal(detectFusions(incomplete).includes('fusion_desolate_sword'), false);
  }
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
    无尽至宝列表: NORMAL_ENDLESS_TREASURES.map((t) => ({
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
    无尽至宝列表: NORMAL_ENDLESS_TREASURES.map((t) => ({
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

test('最强之气：与修罗铠甲共同解锁神魔灭绝劈', () => {
  const member = {
    id: 'p1',
    name: '修罗召唤人',
    treasureIds: [{ id: 'treasure_strongest_qi', level: 1 }],
    abilities: { treasure_strongest_qi: 1 },
    __worldAbilityCounts: {},
  };
  assert.equal(getTreasureStates(member, {})[0].awaken.active, false);
  member.abilities.anime_shura_armor = 1;
  const state = getTreasureStates(member, {})[0];
  assert.equal(state.awaken.active, true);
  assert.equal(state.awaken.formName, '最强修罗·完整解放');
  const skill = getTreasureBattleEntries(member, {}).find(entry => entry.label === '神魔灭绝劈');
  assert.equal(skill.shieldMultiplier, 8);
  assert.equal(skill.clearEnemyBuffs, true);
});

test('K触屏旧十年终极技的理论DPS高于其他至宝主动技', () => {
  const riderDps = HEISEI_RIDERS.reduce((sum, rider) => {
    const ultimate = rider.ultimate;
    return sum + rider.attack * ultimate.damagePct * (ultimate.hits || 1) / 3;
  }, 0);
  const otherDps = NORMAL_ENDLESS_TREASURES
    .filter(treasure => treasure.id !== 'treasure_decade')
    .flatMap(treasure => treasure.awaken?.combat || [])
    .filter(entry => entry.damagePct)
    .map(entry => entry.damagePct * (entry.hits || 1) / (entry.every || 1));
  assert.ok(riderDps > Math.max(...otherDps));
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

test('支线称号世外逍遥客已注册并可发放佩戴', () => {
  const player = { 称号列表: [] };
  assert.equal(grantTitle(player, '世外逍遥客'), true);
  assert.equal(equipTitle(player, '世外逍遥客'), true);
  const view = getTitleViews(player);
  assert.equal(view.equippedTitle.name, '世外逍遥客');
  assert.equal(view.list[0].source, '支线任务·天地无拘');
  assert.deepEqual(getTitleEffects(player), { attrPct: 0, tokenPct: 0 });
});

test('问仙令与仙古玩法称号均已注册并可发放佩戴', () => {
  for (const titleId of ['问仙者', '神火境修士', '祭炼真我', '仙古第一']) {
    const player = { 称号列表: [] };
    assert.equal(grantTitle(player, titleId), true, `${titleId}应可发放`);
    assert.equal(equipTitle(player, titleId), true, `${titleId}应可佩戴`);
    assert.equal(getTitleViews(player).equippedTitle.name, titleId);
    assert.deepEqual(getTitleEffects(player), { attrPct: 0, tokenPct: 0 });
  }
});

test('旧存档按已完成里程碑补发称号且重复执行幂等', () => {
  const player = {
    支线任务完成记录: { 4: true },
    问仙令: { claimed: [60] },
    xiangu_shenhuo: { 已点燃: true, 点燃方式: '道种孕育' },
    xiangu_legacy: { crowns: 1 },
  };
  assert.deepEqual(recoverEarnedTitles(player), [
    '世外逍遥客',
    '问仙者',
    '神火境修士',
    '仙古第一',
  ]);
  assert.deepEqual(recoverEarnedTitles(player), []);

  const zhenwoPlayer = {
    xiangu_shenhuo: { 已点燃: true, 路线: '祭炼真我' },
  };
  assert.deepEqual(recoverEarnedTitles(zhenwoPlayer), ['祭炼真我']);
  assert.deepEqual(recoverEarnedTitles({ 问仙令: { claimed: {} } }), []);
});

test('至宝面板视图', () => {
  const player = {
    无尽至宝列表: [
      { id: 'treasure_decade', name: 'K触屏·帝骑驱动器', level: 1 },
      { id: 'treasure_great_sage', name: '齐天大圣血脉', level: 1 },
    ],
  };
  const views = getPlayerTreasureViews(player);
  assert.equal(views.length, 2);
  assert.equal(views[0].name, 'K触屏·帝骑驱动器');
  assert.ok(views[0].desc.length > 0);
  assert.equal(views[1].source, '无尽劫境·A3通关秘藏');
  assert.deepEqual(views[1].stageConditions, [{
    name: '定海神珍·斗战齐天',
    condition: '持有 「如意金箍棒」',
  }]);
});

test('至宝槽按25层循环并递增消耗道痕', () => {
  const player = {
    无尽劫境最高层: 75,
    劫境道痕: 20_000,
    无尽至宝列表: NORMAL_ENDLESS_TREASURES.slice(0, 3).map(treasure => ({
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
