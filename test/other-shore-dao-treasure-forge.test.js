import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OTHER_SHORE_DAO_TREASURE_FORGE_DURATION_MS,
  claimOtherShoreDaoTreasureForge,
  ensureOtherShoreDaoTreasureForgeState,
  serializeOtherShoreDaoTreasureForge,
  startOtherShoreDaoTreasureForge,
} from '../model/otherShoreDaoTreasureForge.js';

const materialBag = {
  真界源晶: 300,
  大道规则本源: 150,
  维度锚晶: 120,
  纪元道髓: 90,
  诸天母金: 60,
};

const makeTreasures = (count) => Array.from({ length: count }, (_, index) => ({
  id: `innate-${index + 1}`,
  name: `先天至宝${index + 1}`,
}));

const makeAuthorities = (count) => Array.from({ length: count }, (_, index) => ({
  name: `权柄${index + 1}`,
  sourceTreasureId: `innate-${index + 1}`,
}));

const base = (playerId, recipeId, now = 1_000) => ({
  playerId,
  playerName: `修士${playerId}`,
  recipeId,
  currentLayer: 'true_world',
  materials: { ...materialBag },
  knownRecipes: [recipeId],
  operationId: `${playerId}:${recipeId}:start`,
  now,
});

test('ensure 将每玩家炼制状态挂入既有 progression.forge', () => {
  const world = {};
  const first = ensureOtherShoreDaoTreasureForgeState(world);
  const second = ensureOtherShoreDaoTreasureForgeState(world);
  assert.equal(first, second);
  assert.equal(world.progression.forge, first);
  assert.deepEqual(first.players, {});
  assert.deepEqual(first.receipts, {});
});

test('第一法冻结五种材料与三件至宝消耗，并融合三宝全部强化权柄', () => {
  const world = {};
  const input = {
    ...base('one', '第一法'),
    selectedInnateTreasures: makeTreasures(3),
    selectedAuthorities: makeAuthorities(3),
  };
  const before = structuredClone(input);
  const started = startOtherShoreDaoTreasureForge(world, input);
  assert.deepEqual(input, before);
  assert.deepEqual(started.consumption.materials, {
    'true-world-source-crystal': 300,
    'dao-rule-origin': 150,
    'dimension-anchor-crystal': 30,
    'era-dao-marrow': 20,
    'all-heavens-mother-metal': 10,
  });
  assert.equal(started.consumption.innateTreasureCount, 3);
  assert.deepEqual(started.output.authorities.map((entry) => entry.name), ['权柄1', '权柄2', '权柄3']);
  assert.equal(started.output.cooldownMultiplier, 0.5);
  assert.equal(started.readyAt, input.now + OTHER_SHORE_DAO_TREASURE_FORGE_DURATION_MS);
  assert.deepEqual(startOtherShoreDaoTreasureForge(world, input), started);
  assert.throws(
    () => startOtherShoreDaoTreasureForge(world, { ...input, operationId: 'one:new-start' }),
    (error) => error.code === 'forge-active',
  );
});

test('第一法融合三件至宝的全部主动和被动权柄，并校验每件都有能力', () => {
  const treasures = [
    {
      id: 'innate-1',
      name: '至宝一',
      authorities: [
        { name: '开天', command: '#开天', cooldownKey: '开天冷却', effect: '斩界', passive: false },
        { name: '镇压', effect: '镇压万法', passive: true },
      ],
    },
    {
      id: 'innate-2',
      name: '至宝二',
      authorities: [{ name: '逆乱', command: '#逆乱', cooldownKey: '逆乱冷却' }],
      passives: [{ name: '不朽', effect: '道躯不朽' }],
    },
    {
      id: 'innate-3',
      name: '至宝三',
      authorities: [
        { name: '斩因', command: '#斩因', cooldownKey: '斩因冷却' },
        { name: '断果', command: '#断果', cooldownKey: '断果冷却' },
      ],
    },
  ];
  const result = startOtherShoreDaoTreasureForge({}, {
    ...base('all-authorities', '第一法'),
    selectedInnateTreasures: treasures,
  });
  assert.deepEqual(
    result.output.authorities.map((entry) => entry.name),
    ['开天', '镇压', '逆乱', '不朽', '斩因', '断果'],
  );
  assert.equal(result.output.authorities.find((entry) => entry.name === '镇压').passive, true);
  assert.equal(result.output.authorities.find((entry) => entry.name === '不朽').passive, true);
  assert.equal(result.output.authorities.find((entry) => entry.name === '开天').command, '#开天');
  assert.equal(result.output.authorities.find((entry) => entry.name === '开天').cooldownKey, '开天冷却');
  assert.ok(result.output.authorities.every((entry) => entry.enhanced && entry.mode === 'fused'));

  assert.throws(
    () => startOtherShoreDaoTreasureForge({}, {
      ...base('empty-authority', '第一法'),
      selectedInnateTreasures: treasures.map((entry, index) => index === 1 ? { ...entry, authorities: [], passives: [] } : entry),
    }),
    (error) => error.code === 'authorities-missing',
  );
});

test('开炉 operationId 在通用回执淘汰后仍按玩家永久幂等', () => {
  const world = {};
  const input = {
    ...base('permanent', '第一法'),
    selectedInnateTreasures: makeTreasures(3),
    selectedAuthorities: makeAuthorities(3),
  };
  const started = startOtherShoreDaoTreasureForge(world, input);
  const state = ensureOtherShoreDaoTreasureForgeState(world);
  const originalForge = structuredClone(state.players.permanent);
  delete state.receipts[input.operationId];
  for (let index = 0; index < 300; index += 1) {
    state.receipts[`transient:${index}`] = {
      action: 'claim',
      playerId: `other-${index}`,
      targetId: `forge-${index}`,
      result: { claimed: true },
      at: index,
    };
  }

  ensureOtherShoreDaoTreasureForgeState(world);
  assert.ok(state.receipts[input.operationId]);
  assert.deepEqual(startOtherShoreDaoTreasureForge(world, input), started);
  assert.deepEqual(state.players.permanent, originalForge);
  assert.throws(
    () => startOtherShoreDaoTreasureForge(world, { ...input, recipeId: '第三法' }),
    (error) => error.code === 'operation-conflict',
  );
});

test('start 可直接读取玩家上下文中的层级、材料和彼岸炼制法', () => {
  const result = startOtherShoreDaoTreasureForge({}, {
    playerContext: {
      id: 'context-player',
      名号: '上下文修士',
      other_shore: { layer: 'true_world' },
      彼岸炼器材料: materialBag,
      彼岸大道至宝炼制法: ['第一法'],
    },
    recipeId: '第一法',
    selectedInnateTreasures: makeTreasures(3),
    selectedAuthorities: '开天,镇界,斩因',
    operationId: 'context:start',
    now: 2_000,
  });
  assert.equal(result.playerId, 'context-player');
  assert.deepEqual(result.output.authorities.map((entry) => entry.name), ['开天', '镇界', '斩因']);
});

test('第二法缺少古法正文时保持锁定', () => {
  assert.throws(
    () => startOtherShoreDaoTreasureForge({}, {
      ...base('two', '第二法'),
      specialMethodId: 'placeholder-method',
    }),
    (error) => error.code === 'method-unavailable',
  );
});

test('第一法拒绝多选至宝或重复借用同一件至宝的权柄', () => {
  assert.throws(
    () => startOtherShoreDaoTreasureForge({}, {
      ...base('extra', '第一法'),
      selectedInnateTreasures: makeTreasures(4),
      selectedAuthorities: makeAuthorities(4),
    }),
    (error) => error.code === 'treasure-selection-invalid',
  );
  assert.throws(
    () => startOtherShoreDaoTreasureForge({}, {
      ...base('source', '第一法'),
      selectedInnateTreasures: makeTreasures(3),
      selectedAuthorities: ['开天', '破界', '斩道'].map((name) => ({
        name,
        sourceTreasureId: 'innate-1',
      })),
    }),
    (error) => error.code === 'authorities-missing',
  );
});

test('第三法消耗道果并保留五件至宝，随机强化权柄保持确定', () => {
  const options = {
    ...base('three', '第三法'),
    realm: '准仙帝',
    daoFruit: true,
    selectedInnateTreasures: makeTreasures(5),
    selectedAuthorities: makeAuthorities(5),
  };
  const first = startOtherShoreDaoTreasureForge({}, options);
  const second = startOtherShoreDaoTreasureForge({}, options);
  assert.equal(first.consumption.daoFruit, true);
  assert.equal(first.consumption.innateTreasureCount, 0);
  assert.equal(first.output.innateTreasuresPreserved, true);
  assert.equal(first.output.preservedInnateTreasures.length, 5);
  assert.equal(first.output.authorities.length, 1);
  assert.equal(first.output.authorities[0].mode, 'random-enhanced');
  assert.deepEqual(first.output, second.output);
});

test('第四法消耗三十准仙帝本源并固化三项自定义强化权柄', () => {
  const customAuthorities = [
    { name: '开天', sourceTreasureName: '盘古幡', command: '#开天', cooldownKey: '开天冷却', effect: '撕裂诸界' },
    { name: '镇界', sourceTreasureName: '混沌钟', command: '#镇界', cooldownKey: '镇界冷却', effect: '定住时空' },
    { name: '斩因', sourceTreasureName: '因果刀', command: '#斩因', cooldownKey: '斩因冷却', effect: '斩断因果', passive: true },
  ];
  const result = startOtherShoreDaoTreasureForge({}, {
    ...base('four', '第四法'),
    realm: '准仙帝',
    returnTruthPower: true,
    quasiImmortalEmperorSources: 30,
    customAuthorities,
  });
  assert.equal(result.consumption.quasiImmortalEmperorSources, 30);
  assert.deepEqual(result.output.authorities.map((entry) => entry.name), ['开天', '镇界', '斩因']);
  assert.ok(result.output.authorities.every((entry) => entry.enhanced && entry.mode === 'return-truth-edited'));
  assert.equal(result.output.authorities[0].sourceTreasureName, '盘古幡');
  assert.equal(result.output.authorities[0].command, '#开天');
  assert.equal(result.output.authorities[0].cooldownKey, '开天冷却');
  assert.equal(result.output.authorities[0].effect, '撕裂诸界');
  assert.equal(result.output.authorities[2].passive, true);
  assert.deepEqual(result.consumption.materials, {
    'true-world-source-crystal': 300,
    'dao-rule-origin': 150,
    'dimension-anchor-crystal': 120,
    'era-dao-marrow': 90,
    'all-heavens-mother-metal': 60,
  });
});

test('领取只在 readyAt 后生成确定性至宝，重复领取不产生新实体', () => {
  const world = {};
  const started = startOtherShoreDaoTreasureForge(world, {
    ...base('claim', '第一法', 5_000),
    selectedInnateTreasures: makeTreasures(3),
    selectedAuthorities: makeAuthorities(3),
  });
  assert.throws(
    () => claimOtherShoreDaoTreasureForge(world, {
      playerId: 'claim',
      forgeId: started.forgeId,
      operationId: 'claim:early',
      now: started.readyAt - 1,
    }),
    (error) => error.code === 'forge-not-ready' && error.details.remainingMs === 1,
  );
  const options = {
    playerId: 'claim',
    forgeId: started.forgeId,
    operationId: 'claim:ready',
    now: started.readyAt,
  };
  const claimed = claimOtherShoreDaoTreasureForge(world, options);
  assert.equal(claimed.claimed, true);
  assert.equal(claimed.treasure.品阶, '大道至宝');
  assert.equal(claimed.treasure.authorities.length, 3);
  assert.equal(claimed.treasure.completedAt, started.readyAt);
  assert.deepEqual(claimOtherShoreDaoTreasureForge(world, options), claimed);
  const duplicate = claimOtherShoreDaoTreasureForge(world, {
    ...options,
    operationId: 'claim:second-receipt',
    now: started.readyAt + 10_000,
  });
  assert.equal(duplicate.claimed, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.treasure.id, claimed.treasure.id);
});

test('序列化只暴露指定玩家，并按时间派生 ready 状态', () => {
  const world = {};
  const alice = startOtherShoreDaoTreasureForge(world, {
    ...base('alice', '第一法'),
    selectedInnateTreasures: makeTreasures(3),
    selectedAuthorities: makeAuthorities(3),
  });
  startOtherShoreDaoTreasureForge(world, {
    ...base('bob', '第四法'),
    realm: '准仙帝',
    returnTruthPower: true,
    quasiImmortalEmperorSources: 30,
    customAuthorities: ['生死', '命运', '世界'],
  });
  const view = serializeOtherShoreDaoTreasureForge(world, {
    viewerId: 'alice',
    now: alice.readyAt,
  });
  assert.equal(view.forge.status, 'ready');
  assert.equal(view.forge.canClaim, true);
  assert.equal(view.forge.progress, 100);
  assert.equal(JSON.stringify(view).includes('bob'), false);
  assert.equal(Object.hasOwn(view, 'receipts'), false);
});
