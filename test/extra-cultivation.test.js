import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canCultivateExtraPath,
  ensureExtraCultivationState,
  getActiveExtraCultivationPaths,
  getExtraCultivationLevelProduct,
  getExtraCultivationLevelSum,
  selectExtraCultivationPath,
} from '../model/extraCultivation.js';

test('legacy player extra realms are normalized and inferred', () => {
  const player = { mijinglevel_id: 1, xianggulevel_id: 8 };
  ensureExtraCultivationState(player);
  assert.equal(player.xiangulevel_id, 8);
  assert.equal(player.huafenlevel_id, 1);
  assert.equal(player.额外体系, 'xiangu');
});

test('the three extra cultivation paths are mutually exclusive', () => {
  const player = { mijinglevel_id: 1, xiangulevel_id: 1, huafenlevel_id: 1 };
  assert.equal(selectExtraCultivationPath(player, 'huafen').ok, true);
  assert.equal(canCultivateExtraPath(player, 'huafen'), true);
  assert.equal(canCultivateExtraPath(player, 'mijing'), false);
  assert.equal(canCultivateExtraPath(player, 'xiangu'), false);
  player.huafenlevel_id = 8;
  assert.equal(getExtraCultivationLevelSum(player), 9);
});

test('内景地境界和式对三条路线保持相同收益口径', () => {
  assert.equal(getExtraCultivationLevelSum({ mijinglevel_id: 8 }), 9);
  assert.equal(getExtraCultivationLevelSum({ xiangulevel_id: 8 }), 9);
  assert.equal(getExtraCultivationLevelSum({ huafenlevel_id: 8 }), 9);
});

test('三条额外体系在同境界提供相同数值乘区', () => {
  assert.equal(getExtraCultivationLevelProduct({ mijinglevel_id: 8 }), 8);
  assert.equal(getExtraCultivationLevelProduct({ xiangulevel_id: 8 }), 8);
  assert.equal(getExtraCultivationLevelProduct({ huafenlevel_id: 8 }), 8);
});

test('conflicting legacy saves cannot progress another path', () => {
  const player = { mijinglevel_id: 3, xiangulevel_id: 4, huafenlevel_id: 1 };
  assert.deepEqual(getActiveExtraCultivationPaths(player).sort(), ['mijing', 'xiangu']);
  assert.equal(canCultivateExtraPath(player, 'mijing'), false);
  assert.equal(canCultivateExtraPath(player, 'huafen'), false);
});
