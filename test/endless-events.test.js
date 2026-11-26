import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buyEndlessMerchantItem,
  createEndlessRun,
  ensureEndlessStarMapState,
  getEndlessMerchantState,
  getEndlessLayerCurrencyReward,
  getMemberStats,
  resolveEndlessLayer,
} from '../model/endlessRealm.js';
import {
  ENDLESS_MERCHANT_GOODS,
  ENDLESS_NAMELESS_CALAMITIES,
  ENDLESS_STAR_ASSISTS,
  ENDLESS_STAR_GAMBITS,
  ENDLESS_STAR_NODE_TYPES,
  getEndlessStarEncounter,
  getEndlessStarOptions,
  getSelectedEndlessStarNode,
  selectEndlessStarRoute,
  suggestEndlessStarRoute,
} from '../model/endlessStarMap.js';
import { ENDLESS_TREASURES } from '../model/endlessTreasure.js';
import { serializeEndlessWebState } from '../model/endlessWebServer.js';

function player(name) {
  return {
    名号: name,
    level_id: 20,
    Physique_id: 20,
    mijinglevel_id: 1,
    xiangulevel_id: 1,
  };
}

function createRun(seed = 20260904, memberCount = 2) {
  return createEndlessRun({
    teamId: `events-${seed}`,
    groupId: 'endless-events-test',
    seed,
    players: Array.from({ length: memberCount }, (_, index) => ({
      id: String(10001 + index),
      player: player(String.fromCharCode(0x7532 + index)),
    })),
  });
}

function makeReady(run) {
  run.phase = 'ready';
  run.pendingChoices = {};
  return run;
}

function setCurrentNodeType(run, typeId, extra = {}) {
  const node = getEndlessStarOptions(run)[0];
  const type = ENDLESS_STAR_NODE_TYPES[typeId];
  Object.assign(node, {
    typeId,
    name: `测试位面·${type.name}`,
    shortName: type.shortName,
    symbol: type.symbol,
    kind: type.kind,
    risk: type.risk,
    stage: type.stage,
    description: type.description,
    rewardText: type.rewardText,
    gambit: structuredClone(ENDLESS_STAR_GAMBITS.find(item => item.id === 'steady')),
    ...extra,
  });
  delete node.calamity;
  delete node.decision;
  return node;
}

function almostEqual(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < 1e-10,
    `${message}: expected ${expected}, received ${actual}`
  );
}

function createMerchantRun(goodId, seed) {
  const run = makeReady(createRun(seed, 1));
  const source = ENDLESS_MERCHANT_GOODS.find(item => item.id === goodId);
  assert.ok(source, `missing merchant good ${goodId}`);
  const price = 37;
  const node = setCurrentNodeType(run, 'merchant', {
    merchant: {
      name: '测试界海商队',
      currency: '未封存劫境道痕',
      stock: [{ ...structuredClone(source), price, boughtBy: null }],
    },
  });
  run.unbanked.tokens = 1000;
  selectEndlessStarRoute(run, 1);
  return { run, node, member: run.members['10001'], price };
}

test('固定种子生成商队、强援与不可名状灾厄节点', () => {
  const seenTypes = new Map();
  const seenGambits = new Set();

  for (let seed = 1; seed <= 32; seed++) {
    const first = createRun(seed).starMap;
    const second = createRun(seed).starMap;
    assert.deepEqual(first, second);
    for (const node of first.rows.flatMap(row => row.nodes)) {
      if (!seenTypes.has(node.typeId)) seenTypes.set(node.typeId, node);
      if (node.gambit) seenGambits.add(node.gambit.id);
    }
  }

  for (const typeId of ['merchant', 'champion', 'nameless'])
    assert.ok(seenTypes.has(typeId), `fixed seeds did not generate ${typeId}`);
  assert.deepEqual(
    seenGambits,
    new Set(ENDLESS_STAR_GAMBITS.map(item => item.id))
  );

  const merchant = seenTypes.get('merchant');
  assert.equal(merchant.merchant.stock.length, 4);
  assert.equal(new Set(merchant.merchant.stock.map(item => item.id)).size, 4);
  assert.ok(merchant.merchant.stock.every(item => item.price > 0 && item.boughtBy === null));

  const champion = seenTypes.get('champion');
  assert.ok(ENDLESS_STAR_ASSISTS.some(item => item.id === champion.assist.id));
  assert.ok(champion.assist.rounds >= 2 && champion.assist.rounds <= 4);
});

test('旧版活动星图会原位升级并保留当前路线与劫印', () => {
  const run = makeReady(createRun(33117));
  const selected = selectEndlessStarRoute(run, 1);
  const lockedState = {
    typeId: selected.typeId,
    worldId: selected.worldId,
    name: selected.name,
    rewardText: selected.rewardText,
    nextNodeIds: selected.nextNodeIds,
    calamity: selected.calamity,
    sky: structuredClone(run.starMap.sky),
  };
  run.starMap.version = 2;
  run.starMap.seals = { slaughter: 2, cause: 1, boundary: 3, defiance: 0 };
  run.rngState = 0xdeadbeef;

  ensureEndlessStarMapState(run);

  assert.equal(run.starMap.version, 3);
  assert.equal(run.starMap.selectedNodeId, selected.id);
  assert.deepEqual(run.starMap.seals, { slaughter: 2, cause: 1, boundary: 3, defiance: 0 });
  const migrated = getSelectedEndlessStarNode(run);
  assert.deepEqual(
    {
      typeId: migrated.typeId,
      worldId: migrated.worldId,
      name: migrated.name,
      rewardText: migrated.rewardText,
      nextNodeIds: migrated.nextNodeIds,
      calamity: migrated.calamity,
      sky: run.starMap.sky,
    },
    lockedState
  );
  assert.ok(migrated.gambit);
  assert.ok(migrated.decision);
  assert.ok(Object.hasOwn(migrated, 'calamity'));
});

test('全队同议与逆议定轨会修正灾厄概率和实际奖励倍率', () => {
  const seed = 88021;
  const neutralFirst = makeReady(createRun(seed));
  const consensus = makeReady(createRun(seed));
  const neutralSecond = makeReady(createRun(seed));
  const defied = makeReady(createRun(seed));

  for (const run of [neutralFirst, consensus, neutralSecond, defied]) {
    run.starMap.sky = {
      id: 'test_sky', name: '测试天象', omen: '',
      enemyHpMultiplier: 1, enemyAttackMultiplier: 1,
      enemyDefenseMultiplier: 1, rewardMultiplier: 1,
    };
    for (const node of getEndlessStarOptions(run))
      node.gambit = structuredClone(ENDLESS_STAR_GAMBITS.find(item => item.id === 'steady'));
  }

  selectEndlessStarRoute(neutralFirst, 1);
  suggestEndlessStarRoute(consensus, '10001', 1);
  suggestEndlessStarRoute(consensus, '10002', 1);
  selectEndlessStarRoute(consensus, 1);

  selectEndlessStarRoute(neutralSecond, 2);
  suggestEndlessStarRoute(defied, '10001', 1);
  suggestEndlessStarRoute(defied, '10002', 1);
  selectEndlessStarRoute(defied, 2);

  const neutralFirstEncounter = getEndlessStarEncounter(neutralFirst);
  const consensusEncounter = getEndlessStarEncounter(consensus);
  const neutralSecondEncounter = getEndlessStarEncounter(neutralSecond);
  const defiedEncounter = getEndlessStarEncounter(defied);

  assert.equal(consensusEncounter.decision.id, 'consensus');
  assert.equal(consensusEncounter.decision.calamityChanceDelta, -0.08);
  almostEqual(
    consensusEncounter.rewardMultiplier,
    neutralFirstEncounter.rewardMultiplier * 1.08,
    'consensus reward multiplier'
  );

  assert.equal(defiedEncounter.decision.id, 'defy_vote');
  assert.equal(defiedEncounter.decision.calamityChanceDelta, 0.12);
  almostEqual(
    defiedEncounter.rewardMultiplier,
    neutralSecondEncounter.rewardMultiplier * 1.18,
    'defied reward multiplier'
  );
});

test('局内商人六类商品都会扣除共享道痕并写入关键状态', () => {
  const cases = [
    {
      id: 'ability_crystal',
      prepare({ member }) {
        member.abilities = { zhetian_fight_secret: 1 };
      },
      verify({ member }) {
        assert.equal(member.abilities.zhetian_fight_secret, 2);
      },
    },
    {
      id: 'triple_clone',
      prepare({ member }) {
        member.abilities = { perfect_free_transformation: 1 };
      },
      verify({ member }) {
        assert.equal(member.eventBuffs.freeTransformationOpeningCount, 3);
      },
    },
    {
      id: 'skill_replay',
      verify({ member }) {
        assert.equal(member.eventBuffs.skillReplayChance, 0.25);
      },
    },
    {
      id: 'healing_elixir',
      prepare(context) {
        context.maxHp = getMemberStats(context.run, context.member.id).maxHp;
        context.member.hp = Math.round(context.maxHp * 0.1);
        context.beforeHp = context.member.hp;
      },
      verify(context) {
        assert.equal(
          context.member.hp,
          Math.min(context.maxHp, context.beforeHp + Math.round(context.maxHp * 0.5))
        );
      },
    },
    {
      id: 'attack_elixir',
      prepare(context) {
        context.beforeAttack = getMemberStats(context.run, context.member.id).attack;
      },
      verify(context) {
        assert.equal(context.member.eventBuffs.attackPct, 0.18);
        assert.ok(getMemberStats(context.run, context.member.id).attack > context.beforeAttack);
      },
    },
    {
      id: 'treasure_temper',
      prepare({ member }) {
        member.treasureIds = [{ id: ENDLESS_TREASURES[0].id, level: 1 }];
      },
      verify({ member }) {
        assert.equal(member.treasureIds[0].level, 2);
      },
    },
  ];

  for (const [index, scenario] of cases.entries()) {
    const context = createMerchantRun(scenario.id, 91000 + index);
    scenario.prepare?.(context);
    assert.equal(getEndlessMerchantState(context.run).balance, 1000);
    if (index === 0) {
      const state = serializeEndlessWebState({}, {
        id: context.run.teamId,
        leader: context.member.id,
        members: [context.member.id],
        memberNames: { [context.member.id]: context.member.name },
      }, context.run, context.member.id);
      assert.equal(state.merchant.stock[0].index, 1);
      assert.equal(state.permissions.merchantPurchase, true);
    }

    const purchase = buyEndlessMerchantItem(context.run, context.member.id, 1);
    assert.equal(purchase.good.id, scenario.id);
    assert.equal(purchase.balance, 1000 - context.price);
    assert.equal(context.run.unbanked.tokens, 1000 - context.price);
    assert.equal(context.node.merchant.stock[0].boughtBy, context.member.id);
    scenario.verify(context);

    assert.throws(
      () => buyEndlessMerchantItem(context.run, context.member.id, 1),
      /已经被队友买走/
    );
    assert.equal(context.run.unbanked.tokens, 1000 - context.price);
  }

  const capped = createMerchantRun('skill_replay', 91999);
  capped.member.eventBuffs = { skillReplayChance: 0.5 };
  assert.throws(
    () => buyEndlessMerchantItem(capped.run, capped.member.id, 1),
    /已经达到上限/
  );
  assert.equal(capped.run.unbanked.tokens, 1000);
  assert.equal(capped.node.merchant.stock[0].boughtBy, null);

  const fullHealth = createMerchantRun('healing_elixir', 92000);
  fullHealth.member.hp = getMemberStats(fullHealth.run, fullHealth.member.id).maxHp;
  assert.throws(
    () => buyEndlessMerchantItem(fullHealth.run, fullHealth.member.id, 1),
    /生命已满/
  );
  assert.equal(fullHealth.run.unbanked.tokens, 1000);
  assert.equal(fullHealth.node.merchant.stock[0].boughtBy, null);
});

test('商队路线的小于一倍奖励会按面板倍率真实结算', () => {
  const run = makeReady(createRun(88201, 1));
  run.starMap.sky = {
    id: 'neutral_sky', name: '无相天', omen: '',
    enemyHpMultiplier: 1, enemyAttackMultiplier: 1,
    enemyDefenseMultiplier: 1, rewardMultiplier: 1,
  };
  setCurrentNodeType(run, 'merchant', {
    merchant: { name: '测试商队', currency: '未封存劫境道痕', stock: [] },
  });
  selectEndlessStarRoute(run, 1);
  run.rivalEncounterChance = 0;
  const member = run.members['10001'];
  Object.assign(member.base, { hp: 1e12, attack: 1e12, defense: 1e12 });
  member.hp = member.base.hp;
  member.maxHp = member.base.hp;

  const encounter = getEndlessStarEncounter(run);
  assert.equal(encounter.rewardMultiplier, 0.85);
  const result = resolveEndlessLayer(run);
  assert.equal(result.victory, true);
  assert.equal(
    result.layerReward.lingshi,
    Math.round(getEndlessLayerCurrencyReward(1).lingshi * encounter.rewardMultiplier)
  );
});

test('异界强援只在配置的持续回合内造成助战伤害', () => {
  const run = makeReady(createRun(73031, 1));
  const assist = structuredClone(ENDLESS_STAR_ASSISTS.find(item => item.rounds === 3));
  assert.ok(assist);
  setCurrentNodeType(run, 'champion', { assist });
  selectEndlessStarRoute(run, 1);
  run.rivalEncounterChance = 0;

  const member = run.members['10001'];
  Object.assign(member.base, {
    hp: 1e18,
    attack: 1,
    defense: 1e18,
    speed: 100,
  });
  member.hp = member.base.hp;
  member.maxHp = member.base.hp;

  const result = resolveEndlessLayer(run);
  const assistRounds = result.roundDetails.filter(round => round.assistDamage > 0);
  assert.equal(result.summary.assistHits, assist.rounds);
  assert.equal(assistRounds.length, assist.rounds);
  assert.deepEqual(assistRounds.map(round => round.round), [1, 2, 3]);
  assert.ok(result.roundDetails.slice(assist.rounds).every(round => round.assistDamage === 0));
  assert.ok(result.damageByMember._assist > 0);
  assert.equal(
    result.summary.totalDamage,
    Object.values(result.damageByMember).reduce((sum, damage) => sum + damage, 0)
  );
  assert.match(result.logs.join('\n'), new RegExp(assist.name));
});

test('不可名状节点锁定后必然显形灾厄并进入战斗与奖励结算', () => {
  const run = makeReady(createRun(61061, 1));
  run.layer = 60;
  run.highestClearedLayer = 60;
  ensureEndlessStarMapState(run, 61);
  setCurrentNodeType(run, 'nameless');
  selectEndlessStarRoute(run, 1);

  const selected = getSelectedEndlessStarNode(run, 61);
  const calamity = selected.calamity;
  const calamityDefinition = ENDLESS_NAMELESS_CALAMITIES.find(item => item.id === calamity.id);
  assert.ok(calamityDefinition);
  assert.equal(calamity.chance, 1);

  const encounter = getEndlessStarEncounter(run, 61);
  const type = ENDLESS_STAR_NODE_TYPES.nameless;
  almostEqual(
    encounter.enemyHpMultiplier,
    type.enemyHpMultiplier * run.starMap.sky.enemyHpMultiplier * (calamity.enemyHpMultiplier || 1),
    'nameless enemy hp multiplier'
  );
  almostEqual(
    encounter.enemyAttackMultiplier,
    type.enemyAttackMultiplier * run.starMap.sky.enemyAttackMultiplier * (calamity.enemyAttackMultiplier || 1),
    'nameless enemy attack multiplier'
  );
  almostEqual(
    encounter.rewardMultiplier,
    type.rewardMultiplier * run.starMap.sky.rewardMultiplier * calamity.rewardMultiplier,
    'nameless reward multiplier'
  );

  const member = run.members['10001'];
  member.abilities = { zhetian_fight_secret: 1 };
  Object.assign(member.base, {
    hp: 1e30,
    attack: 1e30,
    defense: 1e30,
    speed: 100,
  });
  member.hp = member.base.hp;
  member.maxHp = member.base.hp;
  run.rivalEncounterChance = 0;

  const result = resolveEndlessLayer(run);
  assert.equal(result.victory, true);
  assert.equal(result.layerReward.starRoute.calamity.id, calamity.id);
  assert.match(result.logs.join('\n'), new RegExp(calamity.name));
  assert.ok(result.layerReward.starRoute.rewardMultiplier > 1);
});
