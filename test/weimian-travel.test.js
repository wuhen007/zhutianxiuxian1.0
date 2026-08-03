import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COORDINATE_CLUE_COST,
  calcRealmReducePct,
  consumeTravelWind,
  ensureDefaultCoordinates,
  getBaseTravelThreshold,
  getBodyTravelQuote,
  getKunpengReduction,
  getLocationThreshold,
  getTokenTier,
  getTokenTravelTime,
  getUnknownCoordinates,
  hasCoordinate,
  hasEngravedCoordinate,
  purchaseCoordinateClue,
  recordUnfetteredJourney,
  rememberCoordinate,
  rollDailyDungeonCoordinate,
} from '../model/weimianTravel.js';

const traveler = {
  level_id: 42,
  Physique_id: 42,
  mijinglevel_id: 0,
  xiangulevel_id: 0,
};

test('基础穿梭门槛读取存档中的 Physique_id', () => {
  assert.equal(getBaseTravelThreshold(traveler).ok, true);
  assert.equal(getBaseTravelThreshold({ ...traveler, Physique_id: 41 }).ok, false);
  assert.equal(getBaseTravelThreshold({ ...traveler, Physique_id: undefined, physiquelevel_id: 99 }).ok, false);
});

test('高位面门槛采用秘境或仙古任一体系', () => {
  assert.equal(getLocationThreshold({ mijinglevel_id: 20 }, '时间长河').ok, true);
  assert.equal(getLocationThreshold({ xiangulevel_id: 20 }, '时间长河').ok, true);
  assert.equal(getLocationThreshold({ mijinglevel_id: 19, xiangulevel_id: 19 }, '时间长河').ok, false);
  assert.equal(getLocationThreshold({ mijinglevel_id: 21 }, '永恒未知之地').ok, true);
  assert.equal(getLocationThreshold({ xiangulevel_id: 16 }, '仙域').ok, true);
  assert.equal(getLocationThreshold({ mijinglevel_id: 16 }, '太初星墟').ok, true);
  assert.equal(getLocationThreshold({ xiangulevel_id: 15 }, '太初星墟').ok, false);
});

test('遮天位面支持境界或五色祭坛三种通行方式', () => {
  assert.equal(getLocationThreshold({ mijinglevel_id: 12 }, '遮天位面').ok, true);
  assert.equal(getLocationThreshold({ xiangulevel_id: 11 }, '遮天位面').ok, true);
  assert.equal(getLocationThreshold({ 五色祭坛激活: 1 }, '遮天位面').ok, true);
  assert.equal(getLocationThreshold({ mijinglevel_id: 11, xiangulevel_id: 10 }, '遮天位面').ok, false);
});

test('坐标与传送阵状态按实际存档数组判断', () => {
  const player = { 记忆坐标: ['仙界'], 传送阵坐标: ['仙界'] };
  assert.equal(hasCoordinate({}, '凡间'), true);
  assert.equal(hasCoordinate(player, '仙界'), true);
  assert.equal(hasCoordinate(player, '界海'), false);
  assert.equal(hasCoordinate({ 五色祭坛激活: 1 }, '遮天位面'), true);
  assert.equal(hasEngravedCoordinate(player, '仙界'), true);
  assert.equal(hasEngravedCoordinate(player, '凡间'), false);
});

test('新旧存档都会显式拥有凡间坐标记忆', () => {
  const legacyPlayer = { 记忆坐标: [] };
  assert.equal(ensureDefaultCoordinates(legacyPlayer), true);
  assert.deepEqual(legacyPlayer.记忆坐标, ['凡间']);
  assert.equal(ensureDefaultCoordinates(legacyPlayer), false);
});

test('坐标记忆只解锁一次，重金求购会校验并扣除灵石', () => {
  const player = { 灵石: COORDINATE_CLUE_COST, 记忆坐标: [] };
  assert.equal(rememberCoordinate(player, '仙界'), true);
  assert.equal(rememberCoordinate(player, '仙界'), false);
  assert.equal(getUnknownCoordinates(player).includes('仙界'), false);
  assert.equal(purchaseCoordinateClue(player, '仙界').reason, 'known');
  assert.equal(purchaseCoordinateClue({ 灵石: 1 }, '界海').reason, 'insufficient');

  const buyer = { 灵石: COORDINATE_CLUE_COST, 记忆坐标: [] };
  assert.equal(purchaseCoordinateClue(buyer, '界海').ok, true);
  assert.equal(buyer.灵石, 0);
  assert.equal(hasCoordinate(buyer, '界海'), true);
});

test('成功副本每日只抽取一次坐标记忆', () => {
  const player = { 记忆坐标: [] };
  const first = rollDailyDungeonCoordinate(player, {
    dateKey: '2026-07-29', chance: 1, random: () => 0,
  });
  assert.equal(first.location, '仙界');
  assert.equal(hasCoordinate(player, '仙界'), true);

  const second = rollDailyDungeonCoordinate(player, {
    dateKey: '2026-07-29', chance: 1, random: () => 0,
  });
  assert.equal(second.reason, 'daily-limit');
  assert.equal(player.记忆坐标.length, 1);
});

test('寻缘签倍率将副本坐标发现率从10%提升至20%', () => {
  const player = { 记忆坐标: [] };
  const result = rollDailyDungeonCoordinate(player, {
    dateKey: '2026-07-30',
    chanceMultiplier: 2,
    random: () => 0.15,
  });
  assert.equal(result.reason, 'found');
});

test('费用、耗时和传送阵优先级与穿梭逻辑一致', () => {
  const player = { ...traveler, mijinglevel_id: 21 };
  const quote = getBodyTravelQuote(player, 0, 1);
  assert.ok(Math.abs(calcRealmReducePct(player) - 0.7) < 1e-12);
  assert.ok(Math.abs(quote.xiuweiCost - 3000000) < 1e-6);
  assert.ok(Math.abs(quote.qixueCost - 4500000) < 1e-6);
  assert.ok(Math.abs(quote.shouyuanCost - 3000) < 1e-6);
  assert.ok(Math.abs(quote.travelTime - 5) < 1e-12);
  assert.ok(Math.abs(getTokenTravelTime(player, 0, 1, 'low') - 4) < 1e-12);
  assert.equal(getTokenTravelTime(player, 0, 1, 'high'), 1);
  assert.equal(getTokenTier({ 位面传送次数: 2, 高级传送次数: 1 }), 'high');
});

test('鲲鹏宝术按玩家两套体系动态减少穿梭时间', () => {
  assert.equal(getKunpengReduction({ 学习的功法: [] }), 0);
  assert.equal(getKunpengReduction({ 学习的功法: ['鲲鹏宝术'] }), 3);
  assert.equal(getKunpengReduction({ 学习的功法: ['鲲鹏宝术'], mijinglevel_id: 15 }), 4);
  assert.equal(getKunpengReduction({ 学习的功法: ['鲲鹏宝术'], xiangulevel_id: 16 }), 5);

  const quote = getBodyTravelQuote({
    ...traveler,
    mijinglevel_id: 21,
    学习的功法: ['鲲鹏宝术'],
  }, 0, 1);
  assert.equal(quote.kunpengReduction, 5);
  assert.equal(quote.travelTime, 1);
});

test('天外清风缩短下一次穿梭且最低保留一分钟', () => {
  const player = { 天外清风加速次数: 2 };
  assert.deepEqual(consumeTravelWind(player, 12), {
    consumed: true,
    travelTime: 7,
    reduction: 5,
    remainingUses: 1,
  });
  assert.deepEqual(consumeTravelWind(player, 4), {
    consumed: true,
    travelTime: 1,
    reduction: 3,
    remainingUses: 0,
  });

  const shortTrip = { 天外清风加速次数: 1 };
  assert.equal(consumeTravelWind(shortTrip, 1).consumed, false);
  assert.equal(shortTrip.天外清风加速次数, 1);
});

test('天地无拘任务只记录有效的跨位面抵达', () => {
  assert.equal(recordUnfetteredJourney({}), 0);

  const player = {
    支线任务: [4],
    支线任务进度: { 4: { 阶段: 1, 横渡位面: 0 } },
  };
  assert.equal(recordUnfetteredJourney(player), 1);
  assert.equal(recordUnfetteredJourney(player), 2);
  assert.equal(recordUnfetteredJourney(player), 3);
  assert.equal(recordUnfetteredJourney(player), 3);

  player.支线任务进度[4].阶段 = 2;
  assert.equal(recordUnfetteredJourney(player), 0);
});
