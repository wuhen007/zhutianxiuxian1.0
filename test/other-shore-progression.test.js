import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OTHER_SHORE_DAO_TREASURE_MATERIALS,
  OTHER_SHORE_DAO_TREASURE_RECIPES,
  OTHER_SHORE_LAYERS,
  canAccessOtherShoreLayer,
  getOtherShoreDaoTreasureRecipe,
  previewOtherShoreDaoTreasureForge,
  serializeOtherShoreProgression,
  validateOtherShoreDaoTreasureRecipe,
  validateOtherShoreLayerAccess,
} from '../model/otherShoreProgression.js';

const materialBag = {
  真界源晶: 300,
  大道规则本源: 150,
  维度锚晶: 120,
  纪元道髓: 90,
  诸天母金: 60,
};

function treasures(count) {
  return Array.from({ length: count }, (_, index) => ({ id: `innate-${index + 1}`, name: `先天至宝${index + 1}` }));
}

test('彼岸三层目录与五种稳定材料保持可枚举且不可变', () => {
  assert.deepEqual(
    OTHER_SHORE_LAYERS.map((layer) => layer.id),
    ['canglan', 'true_world', 'qiankun'],
  );
  assert.equal(OTHER_SHORE_DAO_TREASURE_MATERIALS.length, 5);
  assert.equal(OTHER_SHORE_DAO_TREASURE_MATERIALS.find((item) => item.name === '真界源晶').baseQuantity, 300);
  assert.equal(OTHER_SHORE_DAO_TREASURE_MATERIALS.find((item) => item.name === '大道规则本源').baseQuantity, 150);
  assert.equal(Object.isFrozen(OTHER_SHORE_LAYERS), true);
  assert.equal(Object.isFrozen(OTHER_SHORE_DAO_TREASURE_RECIPES[0].materials), true);
});

test('真世界需要沧澜战役与裂界母锚，显式解锁可直接通过', () => {
  const blocked = validateOtherShoreLayerAccess('真世界');
  assert.equal(blocked.ok, false);
  assert.deepEqual(
    blocked.missing.map((item) => item.id),
    ['canglan-campaign', 'rift-mother-anchor'],
  );

  const opened = validateOtherShoreLayerAccess('true_world', {
    canglanCampaignClears: 1,
    anchoredKeyStars: ['裂界母锚'],
  });
  assert.equal(opened.ok, true);
  assert.equal(canAccessOtherShoreLayer('真世界', { trueWorldUnlocked: true }), true);
});

test('乾坤界同时检查真世界入口、仙帝境界与维度破壁', () => {
  const quasi = validateOtherShoreLayerAccess('乾坤界', {
    trueWorldUnlocked: true,
    realm: '准仙帝',
    dimensionBreak: true,
  });
  assert.equal(quasi.ok, false);
  assert.ok(quasi.missing.some((item) => item.id === 'immortal-emperor'));

  const opened = validateOtherShoreLayerAccess('qiankun', {
    trueWorldUnlocked: true,
    trueWorldExplorationComplete: true,
    realm: '仙帝',
    dimensionBreak: true,
  });
  assert.equal(opened.ok, true);

  const onlyOpened = validateOtherShoreLayerAccess('乾坤界', {
    trueWorldUnlocked: true,
    realm: '仙帝',
    dimensionBreak: true,
  });
  assert.equal(onlyOpened.ok, false);
  assert.ok(onlyOpened.missing.some((item) => item.id === 'true-world-exploration'));

  const pendingBreak = validateOtherShoreLayerAccess('乾坤界', {
    trueWorldUnlocked: true,
    trueWorldExplorationComplete: true,
    realm: '仙帝',
    dimensionBreak: { status: 'pending', completed: false },
  });
  assert.equal(pendingBreak.ok, false);
  assert.ok(pendingBreak.missing.some((item) => item.id === 'dimension-break'));

  const canglanOnly = validateOtherShoreLayerAccess('乾坤界', {
    canglanCampaignClears: 1,
    anchoredKeyStars: ['裂界母锚'],
    realm: '仙帝',
    dimensionBreak: true,
  });
  assert.equal(canglanOnly.ok, false);
  assert.ok(canglanOnly.missing.some((item) => item.id === 'true-world-exploration'));

  const nested = validateOtherShoreLayerAccess('真世界', {
    expedition: { campaigns: { '1,-1': { clearCount: 1 } } },
    world: { states: { '0,-4': { phase: 'anchored' } } },
  });
  assert.equal(nested.ok, true);
});

test('第一法消耗三件先天至宝，校验与预览不修改调用方输入', () => {
  const input = {
    currentLayer: '真世界',
    materials: { ...materialBag },
    innateTreasures: treasures(3),
    knownRecipes: ['三宝归墟法'],
  };
  const before = structuredClone(input);
  const result = validateOtherShoreDaoTreasureRecipe(1, input);
  assert.equal(result.ok, true);
  assert.equal(result.recipeId, 'three-innate-erasure');
  assert.equal(result.consumed.innateTreasures, 3);
  assert.equal(result.preserved.innateTreasures, 0);
  assert.equal(result.output.cooldownMultiplier, 0.5);
  assert.deepEqual(input, before);

  const preview = previewOtherShoreDaoTreasureForge('三宝归墟法', input);
  assert.equal(preview.preview.ready, true);
  assert.equal(preview.preview.consumes.innateTreasures, 3);
});

test('第三法保留五件至宝并要求道果与准仙帝境界', () => {
  const missing = validateOtherShoreDaoTreasureRecipe('第三法', {
    currentLayer: 'true_world',
    realm: '仙王巨头',
    materials: materialBag,
    innateTreasures: treasures(5),
    knownRecipes: ['第三法'],
  });
  assert.equal(missing.ok, false);
  assert.ok(missing.missing.some((item) => item.id === 'realm'));
  assert.ok(missing.missing.some((item) => item.id === 'dao-fruit'));

  const valid = validateOtherShoreDaoTreasureRecipe('dao-fruit-five-treasure', {
    currentLayer: 'true_world',
    realm: '准仙帝',
    materials: materialBag,
    innateTreasures: treasures(5),
    knownRecipes: ['dao-fruit-five-treasure'],
    daoFruit: true,
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.consumed.innateTreasures, 0);
  assert.equal(valid.preserved.innateTreasures, 5);
  assert.equal(valid.consumed.daoFruit, true);
  assert.equal(valid.preserved.daoFruit, 0);
});

test('第四法要求三十份准仙帝本源与三项自定义强化权柄', () => {
  const valid = validateOtherShoreDaoTreasureRecipe('还真编权法', {
    currentLayer: 'true_world',
    realm: '准仙帝',
    materials: materialBag,
    knownRecipes: ['还真编权法'],
    returnTruthPower: true,
    quasiImmortalEmperorSources: Array.from({ length: 30 }, (_, index) => `source-${index}`),
    customAuthorities: [{ name: '开天' }, { name: '镇界' }, { name: '斩因' }],
  });
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.output.customAuthorities, ['开天', '镇界', '斩因']);
  assert.equal(valid.output.customAuthorityEditing, true);
});

test('第二法保留扩展接口，序列化只输出稳定的公共契约', () => {
  assert.equal(getOtherShoreDaoTreasureRecipe('第二法').id, 'custom-ancient-method');
  const result = validateOtherShoreDaoTreasureRecipe('第二法', {
    currentLayer: 'true_world',
    materials: materialBag,
    specialMethodId: 'captain-defined-v2',
  });
  assert.equal(result.ok, true);
  assert.equal(result.preserved.innateTreasures, 0);

  const serialized = serializeOtherShoreProgression({ currentLayer: '真世界', forge: { status: 'idle' } });
  assert.equal(serialized.currentLayer, 'true_world');
  assert.deepEqual(serialized.unlockedLayers, ['canglan', 'true_world']);
  assert.equal(serialized.layers.find((layer) => layer.id === 'qiankun').unlocked, false);
  assert.equal(serialized.recipes.length, 4);
  assert.deepEqual(serialized.forge, { status: 'idle' });
});

test('没有取得炼制法时，即使材料齐备也只返回缺口预览', () => {
  const result = validateOtherShoreDaoTreasureRecipe('第一法', {
    currentLayer: 'true_world',
    materials: materialBag,
    innateTreasures: treasures(3),
  });
  assert.equal(result.ok, false);
  assert.ok(result.missing.some((item) => item.id === 'forge-method'));
});

test('第二法还需登记具体古法条目，只有配方名不足以开炉', () => {
  const result = validateOtherShoreDaoTreasureRecipe('第二法', {
    currentLayer: 'true_world',
    materials: materialBag,
    knownRecipes: ['第二法'],
  });
  assert.equal(result.ok, false);
  assert.ok(result.missing.some((item) => item.id === 'special-method'));
});

test('炼器境界复用彼岸移动规则，不用通用数字阈值提前放行', () => {
  for (const player of [{ xiangulevel_id: 20 }, { huafenlevel_id: 20 }]) {
    const result = validateOtherShoreDaoTreasureRecipe('第三法', {
      ...player,
      currentLayer: 'true_world',
      materials: materialBag,
      innateTreasures: treasures(5),
      knownRecipes: ['第三法'],
      daoFruit: true,
    });
    assert.equal(result.ok, false);
    assert.ok(result.missing.some((item) => item.id === 'realm'));
  }
});

test('网页推进契约只暴露当前玩家的铸造摘要', () => {
  const serialized = serializeOtherShoreProgression({
    playerId: 'alice',
    forge: {
      players: {
        alice: { status: 'forging', recipeId: 'three-innate-erasure', materials: { 真界源晶: 300 } },
        bob: { status: 'ready', recipeId: 'return-truth-edit', receipt: 'private-ticket' },
      },
    },
  });
  assert.deepEqual(serialized.forge, { status: 'forging', recipeId: 'three-innate-erasure' });
  assert.equal(JSON.stringify(serialized).includes('private-ticket'), false);
  assert.equal(JSON.stringify(serialized).includes('真界源晶'), true);
  assert.equal(Object.hasOwn(serialized.forge, 'materials'), false);
});
