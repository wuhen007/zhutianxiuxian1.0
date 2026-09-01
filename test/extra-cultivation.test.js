import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canStartRedDustPath,
  canCultivateExtraPath,
  ensureExtraCultivationState,
  getActiveExtraCultivationPaths,
  getExtraCultivationLevelProduct,
  getExtraCultivationLevelSum,
  getXianguCompanionMijingTarget,
  isCultivatingExtraPath,
  reforgeExtraCultivationState,
  selectExtraCultivationPath,
  syncXianguCompanionMijing,
} from '../model/extraCultivation.js';
import { getRealmAuthorityPath } from '../model/realmAuthority.js';

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

test('仙古上位境界只升不降地同步轮海至化龙秘境', () => {
  const player = {
    额外体系: 'xiangu',
    mijinglevel_id: 1,
    xiangulevel_id: 12,
    huafenlevel_id: 1,
  };

  ensureExtraCultivationState(player);
  assert.equal(player.mijinglevel_id, 5);
  assert.equal(isCultivatingExtraPath(player, 'xiangu'), true);
  for (const [xianguLevel, mijingLevel] of [[13, 6], [14, 7], [15, 8]]) {
    player.xiangulevel_id = xianguLevel;
    assert.equal(syncXianguCompanionMijing(player).targetLevelId, mijingLevel);
    assert.equal(player.mijinglevel_id, mijingLevel);
  }

  player.mijinglevel_id = 8;
  assert.equal(syncXianguCompanionMijing(player).changed, false);
  assert.equal(player.mijinglevel_id, 8);
  assert.deepEqual(getActiveExtraCultivationPaths(player), ['xiangu']);
  assert.equal(canCultivateExtraPath(player, 'xiangu'), true);
  assert.equal(canCultivateExtraPath(player, 'mijing'), false);

  player.mijinglevel_id = 18;
  assert.deepEqual(getActiveExtraCultivationPaths(player), ['mijing', 'xiangu']);
  assert.equal(canCultivateExtraPath(player, 'xiangu'), false);
});

test('仙古伴生人体秘境不会让悟道入口误判为遮天体系', () => {
  assert.equal(getRealmAuthorityPath({
    额外体系: 'xiangu',
    mijinglevel_id: 7,
    xiangulevel_id: 14,
    huafenlevel_id: 1,
  }), 'xiangu');
});

test('仙古至尊逆活每成功一世推进一个秘境并于第九世成就红尘仙', () => {
  const player = {
    额外体系: 'xiangu',
    mijinglevel_id: 8,
    xiangulevel_id: 15,
    huafenlevel_id: 1,
    nihuo_count: 1,
  };

  assert.equal(canStartRedDustPath(player), true);
  for (let completedLife = 1; completedLife <= 9; completedLife++) {
    player.nihuo_count = completedLife + 1;
    assert.equal(getXianguCompanionMijingTarget(player), 8 + completedLife);
    syncXianguCompanionMijing(player);
    assert.equal(player.mijinglevel_id, 8 + completedLife);
  }
  assert.equal(player.mijinglevel_id, 17);
  assert.equal(canStartRedDustPath({ mijinglevel_id: 16 }), true);
  assert.equal(canStartRedDustPath({ mijinglevel_id: 8, xiangulevel_id: 1 }), false);
  assert.equal(canStartRedDustPath({
    额外体系: 'mijing',
    mijinglevel_id: 8,
    xiangulevel_id: 15,
  }), false);
});

test('旧档仙古至尊会识别化龙伴生境界并恢复九世同步', () => {
  const player = {
    mijinglevel_id: 8,
    xiangulevel_id: 15,
    huafenlevel_id: 1,
    nihuo_count: 4,
  };
  ensureExtraCultivationState(player);
  assert.equal(player.额外体系, 'xiangu');
  assert.equal(player.mijinglevel_id, 11);
  assert.deepEqual(getActiveExtraCultivationPaths(player), ['xiangu']);
});

test('仙古回炉后按主境界重新派生伴生秘境', () => {
  const player = {
    额外体系: 'xiangu',
    mijinglevel_id: 11,
    xiangulevel_id: 15,
    huafenlevel_id: 1,
    nihuo_count: 4,
  };

  reforgeExtraCultivationState(player);
  assert.equal(player.xiangulevel_id, 14);
  assert.equal(player.mijinglevel_id, 7);
  assert.deepEqual(getActiveExtraCultivationPaths(player), ['xiangu']);
});

test('回炉重造让高于1级的额外体系各降一级并清除极境', () => {
  const player = {
    mijinglevel_id: 8,
    xiangulevel_id: 6,
    huafenlevel_id: 1,
    极境: ['2', '6'],
    花粉极境: ['本源觉醒'],
    花粉路分支: '宇究',
    花粉路前身分支: '究极',
    xiangu_shenhuo: { 极境达成: true, 极境名称: '神火极境·某道种' },
    xiangu_xianqi: { strands: 3, max: 3 },
    xiangu_xianqi_three_complete: true,
    xiangu_jiutian_shidi: true,
    xiangu_zhanxian_zhadao: true,
  };

  const result = reforgeExtraCultivationState(player);
  assert.equal(result.changed, true);
  assert.deepEqual(
    [player.mijinglevel_id, player.xiangulevel_id, player.huafenlevel_id],
    [7, 5, 1]
  );
  assert.deepEqual(player.极境, []);
  assert.deepEqual(player.花粉极境, []);
  assert.equal(player.花粉路分支, undefined);
  assert.equal(player.花粉路前身分支, undefined);
  assert.equal(player.xiangu_shenhuo, undefined);
  assert.equal(player.xiangu_xianqi, 0);
  assert.equal(player.xiangu_xianqi_detail, undefined);
  assert.equal(player.xiangu_xianqi_three_complete, undefined);
  assert.equal(player.xiangu_jiutian_shidi, undefined);
  assert.equal(player.xiangu_zhanxian_zhadao, undefined);
});

test('神火极境回炉至尊者后可重新冲关神火', () => {
  const player = {
    额外体系: 'xiangu',
    mijinglevel_id: 1,
    xiangulevel_id: 8,
    huafenlevel_id: 1,
    极境: ['2', '3', '4', '5', '6', '7', '8'],
    xiangu_shenhuo: {
      已点燃: true,
      点燃方式: '道种孕育',
      极境达成: true,
      极境名称: '神火极境·世界树幼苗',
      专属技能: '万火共鸣',
    },
    xiangu_xianqi: { strands: 3, max: 3 },
    xiangu_xianqi_detail: { list: [{ strand: 1 }], flags: {} },
    xiangu_xianqi_three_complete: true,
  };

  const result = reforgeExtraCultivationState(player);
  assert.equal(result.changed, true);
  assert.equal(player.xiangulevel_id, 7);
  assert.equal(player.xiangu_shenhuo, undefined);
  assert.deepEqual(player.极境, []);
  assert.equal(player.xiangu_xianqi_detail, undefined);
  assert.deepEqual(getActiveExtraCultivationPaths(player), ['xiangu']);
  assert.equal(canCultivateExtraPath(player, 'xiangu'), true);
});

test('旧回炉存档在读取归一化时清除尊者境残留神火', () => {
  const player = {
    额外体系: 'xiangu',
    mijinglevel_id: 1,
    xiangulevel_id: 7,
    huafenlevel_id: 1,
    xiangu_shenhuo: { 已点燃: true, 极境达成: true },
    xiangu_xianqi: { strands: 3, max: 3 },
    xiangu_xianqi_detail: { list: [{ strand: 1 }] },
    xiangu_xianqi_three_complete: true,
  };

  ensureExtraCultivationState(player);
  assert.equal(player.xiangu_shenhuo, undefined);
  assert.equal(player.xiangu_xianqi, 0);
  assert.equal(player.xiangu_xianqi_detail, undefined);
  assert.equal(player.xiangu_xianqi_three_complete, undefined);
  assert.equal(canCultivateExtraPath(player, 'xiangu'), true);
});
