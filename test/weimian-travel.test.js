import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  ALL_HEAVENS_LOCATIONS,
  COORDINATE_CLUE_COST,
  DIMENSION_GROUPS,
  EMPEROR_BOUNDARY_LOCATIONS,
  IMMORTAL_EMPEROR_TRAVEL_TIME_REDUCTION,
  PLACE_LOCATION_MAP,
  FORBIDDEN_SUPREME_ALL_ATTRIBUTE,
  FORBIDDEN_SUPREMES,
  applyForbiddenSupremePlunder,
  buildForbiddenSupreme,
  calcRealmReducePct,
  canImmortalEmperorFreeTravel,
  canUseSanShiTongGuanPassage,
  consumeTravelWind,
  ensureDefaultCoordinates,
  getCoordinateLocations,
  getBaseTravelThreshold,
  getBodyTravelQuote,
  getDimensionBarrierCount,
  getDimensionBarrierDescription,
  getDimensionBarrierTravelTime,
  getDimensionBreakingPower,
  getDimensionGroup,
  getDimensionLayer,
  getDimensionName,
  getDimensionTradeCompatibility,
  getKunpengReduction,
  getLocationId,
  getLocationName,
  getLocationThreshold,
  normalizeLocationList,
  getTokenTier,
  getTokenTravelTime,
  getUnknownCoordinates,
  hasCoordinate,
  hasEngravedCoordinate,
  isInstantAllHeavensTravel,
  isAllHeavensLocation,
  isSealedLocation,
  isTimeRiverLocation,
  purchaseCoordinateClue,
  recordUnfetteredJourney,
  registerForbiddenSupremeAttention,
  rememberCoordinate,
  rollDailyDungeonCoordinate,
  selectForbiddenSupreme,
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

test('高位面门槛采用三种额外体系中的当前体系', () => {
  assert.equal(getLocationThreshold({ mijinglevel_id: 20 }, '时间长河').ok, true);
  assert.equal(getLocationThreshold({ xiangulevel_id: 20 }, '时间长河').ok, true);
  assert.equal(getLocationThreshold({ mijinglevel_id: 19, xiangulevel_id: 19 }, '时间长河').ok, false);
  assert.equal(getLocationThreshold({ mijinglevel_id: 21 }, '永恒未知之地').ok, true);
  assert.equal(getLocationThreshold({ xiangulevel_id: 16 }, '仙域').ok, true);
  assert.equal(getLocationThreshold({ mijinglevel_id: 16 }, '太初星墟').ok, true);
  assert.equal(getLocationThreshold({ xiangulevel_id: 15 }, '太初星墟').ok, false);
  assert.equal(getLocationThreshold({ huafenlevel_id: 21 }, '时间长河').ok, true);
  assert.equal(getLocationThreshold({ huafenlevel_id: 22 }, '永恒未知之地').ok, true);
  assert.equal(getLocationThreshold({ huafenlevel_id: 17 }, '仙域').ok, false);
  assert.equal(getLocationThreshold({ huafenlevel_id: 18 }, '仙域').ok, true);
  assert.equal(getLocationThreshold({ huafenlevel_id: 15 }, '太初星墟').ok, true);
});

test('圣墟三级位面按花粉境界分档且准仙帝可跨越内部界壁', () => {
  assert.equal(PLACE_LOCATION_MAP.小阴间, 4);
  assert.equal(PLACE_LOCATION_MAP.大阴间, 5);
  assert.equal(PLACE_LOCATION_MAP.阳间, 7);
  assert.equal(PLACE_LOCATION_MAP.时间长河, 3.6);
  assert.equal(PLACE_LOCATION_MAP.永恒未知之地, 42);
  assert.equal(getLocationName(42), '永恒未知之地');
  assert.equal(getLocationName(6.5), '永恒未知之地');
  assert.equal(getLocationId(6.5), 42);
  const flowerPlayer = {
    额外体系: 'huafen', mijinglevel_id: 1, xiangulevel_id: 1, huafenlevel_id: 2,
  };
  assert.equal(getLocationThreshold(flowerPlayer, '小阴间').ok, true);
  assert.equal(hasCoordinate(flowerPlayer, '小阴间'), true);
  assert.equal(rememberCoordinate(flowerPlayer, '小阴间'), false);
  assert.equal(purchaseCoordinateClue({ 灵石: COORDINATE_CLUE_COST }, '小阴间').reason, 'invalid');
  assert.equal(getLocationThreshold({ mijinglevel_id: 20, xiangulevel_id: 1 }, '小阴间').ok, true);
  assert.equal(getLocationThreshold({ mijinglevel_id: 19, xiangulevel_id: 1 }, '小阴间').ok, false);
  assert.equal(getLocationThreshold({ 额外体系: 'huafen', huafenlevel_id: 1 }, '小阴间').ok, false);
  // 大阴间需神祇境(12)、阳间需神将境(13)——神将入阳间冲击神王
  assert.equal(getLocationThreshold({ 额外体系: 'huafen', huafenlevel_id: 12 }, '大阴间').ok, true);
  assert.equal(getLocationThreshold({ 额外体系: 'huafen', huafenlevel_id: 11 }, '大阴间').ok, false);
  assert.equal(getLocationThreshold({ 额外体系: 'huafen', huafenlevel_id: 14 }, '阳间').ok, true);
  assert.equal(getLocationThreshold({ 额外体系: 'huafen', huafenlevel_id: 13 }, '阳间').ok, true);
  assert.equal(getLocationThreshold({ 额外体系: 'huafen', huafenlevel_id: 12 }, '阳间').ok, false);
});

test('遮天位面支持三体系圣人等效权柄或五色祭坛通行', () => {
  assert.equal(getLocationThreshold({ mijinglevel_id: 12 }, '遮天位面').ok, true);
  assert.equal(getLocationThreshold({ xiangulevel_id: 11 }, '遮天位面').ok, true);
  assert.equal(getLocationThreshold({ 五色祭坛激活: 1 }, '遮天位面').ok, true);
  const flowerSaint = getLocationThreshold({ huafenlevel_id: 11 }, '遮天位面');
  assert.equal(flowerSaint.ok, true);
  assert.match(flowerSaint.checks[0].display, /等效权柄 12\/12/);
  assert.equal(getLocationThreshold({ xiangulevel_id: 10 }, '遮天位面').ok, false);
  assert.equal(getLocationThreshold({ huafenlevel_id: 10 }, '遮天位面').ok, false);
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

test('彼岸世界保留位面编号但不进入常规坐标与传送体系', () => {
  assert.equal(isSealedLocation('彼岸世界'), true);
  assert.equal(isSealedLocation(PLACE_LOCATION_MAP.彼岸世界), true);
  assert.equal(getCoordinateLocations().includes('彼岸世界'), false);
  assert.equal(getUnknownCoordinates({ mijinglevel_id: 25 }).includes('彼岸世界'), false);

  const player = { 灵石: COORDINATE_CLUE_COST, 记忆坐标: ['彼岸世界'] };
  assert.equal(hasCoordinate(player, '彼岸世界'), false);
  assert.equal(rememberCoordinate(player, '彼岸世界'), false);
  assert.equal(purchaseCoordinateClue(player, '彼岸世界').reason, 'invalid');
  assert.equal(player.灵石, COORDINATE_CLUE_COST);
  assert.equal(getLocationThreshold(player, '彼岸世界').code, 'sealed');
});

test('每日副本只会发现当前权柄可触及的高维坐标', () => {
  assert.equal(getUnknownCoordinates({ mijinglevel_id: 18 }).includes('厄土高原'), false);
  const emperorUnknown = getUnknownCoordinates({ mijinglevel_id: 21 });
  assert.equal(emperorUnknown.includes('永恒未知之地'), false);
  assert.equal(emperorUnknown.includes('厄土高原'), false);
  assert.equal(emperorUnknown.includes('时间长河'), false);
  assert.equal(emperorUnknown.includes('百维真界'), false);
  assert.equal(emperorUnknown.includes('原初宇宙海'), false);
  assert.equal(getUnknownCoordinates({ mijinglevel_id: 23 }).includes('原初宇宙海'), true);
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

test('准仙帝在诸天万界内部穿梭不再产生等待时间', () => {
  const player = { ...traveler, mijinglevel_id: 21 };
  const quote = getBodyTravelQuote(player, 0, 1);
  assert.ok(Math.abs(calcRealmReducePct(player) - 0.7) < 1e-12);
  assert.ok(Math.abs(quote.xiuweiCost - 3000000) < 1e-6);
  assert.ok(Math.abs(quote.qixueCost - 4500000) < 1e-6);
  assert.ok(Math.abs(quote.shouyuanCost - 3000) < 1e-6);
  assert.equal(quote.travelTime, 0);
  assert.equal(getTokenTravelTime(player, 0, 1, 'low'), 0);
  assert.equal(getTokenTravelTime(player, 0, 1, 'high'), 0);
  assert.equal(isInstantAllHeavensTravel({ mijinglevel_id: 20 }, 0, PLACE_LOCATION_MAP.异域), true);
  assert.equal(getTokenTier({ 位面传送次数: 2, 高级传送次数: 1 }), 'high');
});

test('位面图鉴按诸天、时间长河、上苍、永恒未知与更高维度分组', () => {
  assert.equal(ALL_HEAVENS_LOCATIONS.includes('时间长河'), false);
  assert.equal(isAllHeavensLocation(PLACE_LOCATION_MAP.时间长河), false);
  assert.equal(isTimeRiverLocation(PLACE_LOCATION_MAP.时间长河), true);
  assert.equal(getDimensionLayer('时间长河'), -1);
  assert.equal(getDimensionName('凡间'), '诸天万界');
  assert.equal(getDimensionName('时间长河'), '时间长河');
  assert.equal(getDimensionName('上苍之上'), '上苍之上');
  assert.equal(getDimensionName('永恒未知之地'), '永恒未知之地');
  assert.equal(getDimensionGroup('神维丝线海'), DIMENSION_GROUPS.higherDimensions);
  assert.match(getDimensionBarrierDescription('时间长河'), /时序界壁/);
  assert.match(getDimensionBarrierDescription('上苍之上'), /第一重空间壁垒/);
});

test('仙帝可在四大界壁区域之间自由穿梭，诸天和上苍之间无需等待', () => {
  const quasiEmperor = { ...traveler, mijinglevel_id: 20 };
  const immortalEmperor = { ...traveler, mijinglevel_id: 21 };
  const mortal = PLACE_LOCATION_MAP.凡间;
  const upper = PLACE_LOCATION_MAP.上苍之上;
  const eternal = PLACE_LOCATION_MAP.永恒未知之地;
  const timeRiver = PLACE_LOCATION_MAP.时间长河;

  assert.equal(canImmortalEmperorFreeTravel(quasiEmperor, mortal, upper), false);
  assert.equal(canImmortalEmperorFreeTravel(immortalEmperor, mortal, upper), true);
  const domains = ['永恒未知之地', '上苍之上', '厄土高原', '时间长河'];
  for (const from of domains) {
    for (const to of domains) {
      if (from === to) continue;
      assert.equal(
        canImmortalEmperorFreeTravel(immortalEmperor, PLACE_LOCATION_MAP[from], PLACE_LOCATION_MAP[to]),
        true,
        `${from} → ${to}`,
      );
    }
  }
  assert.equal(canImmortalEmperorFreeTravel(quasiEmperor, eternal, upper), false);
  assert.equal(canImmortalEmperorFreeTravel(immortalEmperor, mortal, timeRiver), true);
  for (const domain of domains) assert.equal(hasCoordinate(immortalEmperor, domain), true);
  assert.equal(isInstantAllHeavensTravel(immortalEmperor, mortal, upper), true);
  assert.equal(isInstantAllHeavensTravel(immortalEmperor, mortal, eternal), false);
  assert.equal(isInstantAllHeavensTravel(quasiEmperor, mortal, upper), false);
  assert.equal(getDimensionBarrierTravelTime(immortalEmperor, mortal, upper), 0);
  assert.equal(getBodyTravelQuote(immortalEmperor, '凡间', '上苍之上').travelTime, 0);
});

test('维度壁垒航程按位面数值差×15分钟/级×壁垒层数×境界减免计算；时间长河维持1小时/重专属规则', () => {
  const immortalEmperor = { ...traveler, mijinglevel_id: 21 };
  const quasiEmperor = { ...traveler, mijinglevel_id: 20 };
  const supreme = { ...traveler, mijinglevel_id: 25 };
  const mortal = PLACE_LOCATION_MAP.凡间;
  const eternal = PLACE_LOCATION_MAP.永恒未知之地;
  const timeRiver = PLACE_LOCATION_MAP.时间长河;

  assert.equal(getDimensionBarrierCount(mortal, eternal), 3);
  // 永恒未知之地：42 差 ×15×3 层×(1−0.7) = 567
  assert.equal(getDimensionBarrierTravelTime(immortalEmperor, mortal, eternal), 567);
  assert.equal(getBodyTravelQuote(immortalEmperor, '凡间', '永恒未知之地').travelTime, 567);
  assert.equal(getDimensionBarrierCount(mortal, timeRiver), 1);
  // 时间长河（独立时序域）专属规则：1 小时/重×权柄系数，准仙帝 0.75、仙帝 0.3、极境 0.2
  assert.equal(getDimensionBarrierTravelTime(immortalEmperor, mortal, timeRiver), 18);
  assert.equal(getBodyTravelQuote(immortalEmperor, '凡间', '时间长河').travelTime, 18);
  assert.equal(getBodyTravelQuote(quasiEmperor, '凡间', '时间长河').travelTime, 45);
  assert.equal(getBodyTravelQuote(supreme, '凡间', '时间长河').travelTime, 12);
});

test('登仙、遨游、穿梭与位面图鉴入口均接入共享维度规则', () => {
  const levelSource = fs.readFileSync(new URL('../apps/User/Level.js', import.meta.url), 'utf8');
  const riverSource = fs.readFileSync(new URL('../apps/SecretPlace/shijianchanghe.js', import.meta.url), 'utf8');
  const travelSource = fs.readFileSync(new URL('../apps/SecretPlace/SecretPlace.js', import.meta.url), 'utf8');
  const atlasSource = fs.readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
  const atlasTemplate = fs.readFileSync(new URL('../resources/html/weimian/weimian.html', import.meta.url), 'utf8');

  assert.match(levelSource, /isAllHeavensLocation\(player\.power_place/);
  assert.match(levelSource, /登仙必须在诸天万界维度内完成/);
  assert.match(riverSource, /isTimeRiverLocation\(player\.power_place\)/);
  assert.doesNotMatch(riverSource, /player\.power_place\s*=\s*PLACE_LOCATION_MAP\.时间长河/);
  assert.match(travelSource, /canImmortalEmperorFreeTravel/);
  assert.match(travelSource, /isInstantAllHeavensTravel/);
  assert.match(travelSource, /Go\(e, \{ allowEternalGuard: emperorFreeTravel \}\)/);
  assert.match(atlasSource, /isEternalGuardAction/);
  assert.match(travelSource, /本次需跨越\$\{travelQuote\.dimensionBarrierCount\}重界壁/);
  assert.match(atlasSource, /dimension_guide/);
  assert.match(atlasTemplate, /维度分层与壁垒/);
});

test('位面定位解析会把永恒未知之地旧编号规范到42并去重', () => {
  assert.deepEqual(EMPEROR_BOUNDARY_LOCATIONS, ['上苍之上', '永恒未知之地', '厄土高原', '时间长河']);
  assert.equal(getLocationName(' 42 '), '永恒未知之地');
  assert.equal(getLocationId('6.5'), 42);
  assert.deepEqual(
    normalizeLocationList([6.5, '永恒未知之地', ' 仙界 ', '仙界', null, '']),
    ['永恒未知之地', '仙界'],
  );
});

test('接引与送往使用统一境界权柄门槛', () => {
  const travelSource = fs.readFileSync(new URL('../apps/SecretPlace/SecretPlace.js', import.meta.url), 'utf8');
  assert.match(travelSource, /import \{ getRealmAuthorityLevel \} from '..\/\.\.\/model\/realmAuthority\.js'/);
  assert.equal((travelSource.match(/getRealmAuthorityLevel\(player\) < 18/g) || []).length, 2);
  assert.doesNotMatch(travelSource, /if \(player\.mijinglevel_id < 18\)/);
  assert.doesNotMatch(travelSource, /threshold\.code === 'eternal-land'/);
});

test('维度壁垒按仙帝、祭道之上与唯一道之上分层准入', () => {
  assert.equal(getDimensionLayer('上苍之上'), 1);
  assert.equal(getDimensionLayer('超维宇宙'), 2);
  assert.equal(getDimensionLayer('厄土高原'), 3);
  assert.equal(getDimensionLayer('永恒未知之地'), 3);
  assert.equal(getDimensionLayer('百维真界'), 4);
  assert.equal(getDimensionLayer('原初宇宙海'), 5);
  assert.equal(getDimensionLayer('神维丝线海'), 8);

  assert.equal(getDimensionBreakingPower({ mijinglevel_id: 20 }), 30);
  assert.equal(getDimensionBreakingPower({ mijinglevel_id: 21 }), 65);
  assert.equal(getDimensionBreakingPower({ mijinglevel_id: 25 }), 150);
  assert.equal(getLocationThreshold({ mijinglevel_id: 20 }, '超维宇宙').ok, true);
  assert.equal(getLocationThreshold({ mijinglevel_id: 20 }, '上苍之上').ok, false);

  const emperor = { mijinglevel_id: 21 };
  assert.equal(getLocationThreshold(emperor, '上苍之上').ok, true);
  assert.equal(getLocationThreshold(emperor, '永恒未知之地').ok, true);
  assert.equal(getLocationThreshold(emperor, '百维真界').ok, false);
  assert.equal(getLocationThreshold(emperor, '原初宇宙海').ok, false);
  assert.equal(getLocationThreshold({ mijinglevel_id: 23 }, '原初宇宙海').ok, true);
  assert.equal(getLocationThreshold({ xiangulevel_id: 24 }, '千维宙古界').ok, true);
  assert.equal(getLocationThreshold({ mijinglevel_id: 23 }, '万维梵宇界').ok, false);
  assert.equal(getLocationThreshold({ mijinglevel_id: 25 }, '神维丝线海').ok, true);
});

test('三世铜棺只为准仙帝开启上苍之上的单次通道', () => {
  assert.equal(canUseSanShiTongGuanPassage({ mijinglevel_id: 19 }, '上苍之上', 1), false);
  assert.equal(canUseSanShiTongGuanPassage({ mijinglevel_id: 20 }, '上苍之上', 0), false);
  assert.equal(canUseSanShiTongGuanPassage({ mijinglevel_id: 20 }, '上苍之上', 1), true);
  assert.equal(canUseSanShiTongGuanPassage({ xiangulevel_id: 21 }, '上苍之上', 1), true);
  assert.equal(canUseSanShiTongGuanPassage({ huafenlevel_id: 21 }, '厄土高原', 1), false);
  assert.equal(canUseSanShiTongGuanPassage({ mijinglevel_id: 21 }, '上苍之上', 1), false);
});

test('同层资产可流转，跨层赠送会被维度壁垒拦截', () => {
  const allHeavens = { power_place: PLACE_LOCATION_MAP.凡间 };
  const upper = { power_place: PLACE_LOCATION_MAP.上苍之上 };
  const highland = { power_place: PLACE_LOCATION_MAP.厄土高原 };
  const eternal = { power_place: PLACE_LOCATION_MAP.永恒未知之地 };
  assert.equal(getDimensionTradeCompatibility(allHeavens, upper).ok, false);
  assert.equal(getDimensionTradeCompatibility(highland, eternal).ok, true);
  assert.equal(getDimensionTradeCompatibility(upper, upper).ok, true);
});

test('更高维度壁垒按位面数值差×15分钟/级×壁垒层数×境界减免计算', () => {
  const emperor = { ...traveler, mijinglevel_id: 21 };
  const target = PLACE_LOCATION_MAP.百维真界;
  assert.equal(getDimensionBarrierCount(PLACE_LOCATION_MAP.凡间, target), 4);
  // 百维真界：60 差 ×15×4 层×(1−0.7) = 1080
  assert.equal(getDimensionBarrierTravelTime(emperor, PLACE_LOCATION_MAP.凡间, target), 1080);
  const quote = getBodyTravelQuote(emperor, PLACE_LOCATION_MAP.凡间, target);
  assert.equal(quote.dimensionBarrierCount, 4);
  assert.equal(quote.travelTime, 1080);
  assert.equal(isInstantAllHeavensTravel(emperor, PLACE_LOCATION_MAP.凡间, target), false);
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
  assert.equal(quote.travelTime, 0);
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

test('触及遮天位面十次后触发禁区至尊堵截', () => {
  const player = {};
  const task = { from_location: 0, to_location: 2 };
  const alwaysHit = { random: () => 0 };
  for (let i = 1; i <= 9; i++) {
    const result = registerForbiddenSupremeAttention(player, task, alwaysHit);
    assert.equal(result.intercept, false, `第 ${i} 次注视不应拦截`);
    assert.equal(player.禁区至尊注视, i);
  }
  const final = registerForbiddenSupremeAttention(player, task, alwaysHit);
  assert.equal(final.intercept, true, '第 10 次注视应触发堵截');
  assert.equal(player.禁区至尊注视, 10);

  const unrelated = registerForbiddenSupremeAttention(player, { from_location: 0, to_location: 1 }, alwaysHit);
  assert.equal(unrelated.relevant, false);
  assert.equal(player.禁区至尊注视, 10);
});

test('大帝境界无视禁区至尊注视', () => {
  const player = { mijinglevel_id: 16 };
  const task = { from_location: 0, to_location: 2 };
  const result = registerForbiddenSupremeAttention(player, task);
  assert.equal(result.relevant, true);
  assert.equal(result.exempt, true);
  assert.equal(result.exemptLevel, 'emperor');
  assert.equal(result.intercept, false);
  assert.equal(player.禁区至尊注视, undefined);
});

test('准帝九重天+圣体/霸体/圣体道胎/混沌体 受至尊忌惮', () => {
  const task = { from_location: 0, to_location: 2 };
  for (const physique of ['圣体', '霸体', '圣体道胎', '混沌体']) {
    const player = { mijinglevel_id: 15, 灵根: { type: physique } };
    const result = registerForbiddenSupremeAttention(player, task);
    assert.equal(result.exempt, true, `${physique} 应豁免`);
    assert.equal(result.exemptLevel, 'quasi-emperor');
    assert.equal(result.intercept, false);
  }
});

test('准帝九重天+非绝世体质 不豁免，按概率决定', () => {
  const task = { from_location: 0, to_location: 2 };
  const p1 = { mijinglevel_id: 15, 灵根: { type: '普通灵根' } };
  assert.equal(registerForbiddenSupremeAttention(p1, task, { random: () => 0.999 }).intercept, false);
  assert.equal(p1.禁区至尊注视, undefined);
  const p2 = { mijinglevel_id: 15, 灵根: { type: '普通灵根' } };
  registerForbiddenSupremeAttention(p2, task, { random: () => 0 });
  assert.equal(p2.禁区至尊注视, 1);
});

test('肉身穿梭概率高于低级/高级传送阵', () => {
  const taskBody = { from_location: 0, to_location: 2, used_token: false };
  const taskLow = { from_location: 0, to_location: 2, used_token: true, token_tier: 'low' };
  const taskHigh = { from_location: 0, to_location: 2, used_token: true, token_tier: 'high' };
  const pBody = {};
  registerForbiddenSupremeAttention(pBody, taskBody, { random: () => 0.49 });
  assert.equal(pBody.禁区至尊注视, 1);
  const pBodyMiss = {};
  assert.equal(registerForbiddenSupremeAttention(pBodyMiss, taskBody, { random: () => 0.6 }).intercept, false);
  assert.equal(pBodyMiss.禁区至尊注视, undefined);
  const pLow = {};
  registerForbiddenSupremeAttention(pLow, taskLow, { random: () => 0.2 });
  assert.equal(pLow.禁区至尊注视, 1);
  const pHigh = {};
  registerForbiddenSupremeAttention(pHigh, taskHigh, { random: () => 0.04 });
  assert.equal(pHigh.禁区至尊注视, 1);
  const pHighMiss = {};
  assert.equal(registerForbiddenSupremeAttention(pHighMiss, taskHigh, { random: () => 0.1 }).intercept, false);
  assert.equal(pHighMiss.禁区至尊注视, undefined);
});

test('禁区至尊按权重选择并使用最高练气炼体与大帝秘境', () => {
  assert.equal(selectForbiddenSupreme(() => 0).name, '石皇');
  assert.equal(selectForbiddenSupreme(() => 0.46).name, '光暗至尊');
  assert.equal(selectForbiddenSupreme(() => 0.81).name, '神墟之主');

  const supreme = selectForbiddenSupreme(() => 0);
  const boss = buildForbiddenSupreme(supreme, {
    cultivation: [
      { level_id: 1, 基础攻击: 1, 基础防御: 1, 基础血量: 1, 基础暴击: 0.1 },
      { level_id: 64, 基础攻击: 10, 基础防御: 10, 基础血量: 10, 基础暴击: 0.5 },
    ],
    physique: [{ level_id: 63, 基础攻击: 20, 基础防御: 20, 基础血量: 20, 基础暴击: 0.5 }],
    secret: [{ level_id: 16, 基础攻击: 30, 基础防御: 30, 基础血量: 30 }],
    ancient: [{ level_id: 1, 基础攻击: 40, 基础防御: 40, 基础血量: 40 }],
  });
  assert.equal(boss.level_id, 64);
  assert.equal(boss.Physique_id, 63);
  assert.equal(boss.mijinglevel_id, 16);
  assert.equal(boss.xiangulevel_id, 1);
  assert.equal(boss.速度 + boss.mijinglevel_id * 50 + boss.xiangulevel_id * 50, 950);
  assert.ok(boss.攻击 > FORBIDDEN_SUPREME_ALL_ATTRIBUTE);
  assert.ok(FORBIDDEN_SUPREMES.every(item =>
    item.root.攻击 >= 1.6 && item.root.防御 >= 2 && item.root.生命 >= 3));
});

test('至尊搜魂废除全部功法并只留下最低价值约两成物品', () => {
  const player = { 学习的功法: ['斗字秘', '行字秘'], 当前血量: 999, 元神: 1000 };
  const najie = {
    道具: [
      { name: '碎石', 数量: 10, 出售价: 1 },
      { name: '仙金', 数量: 10, 出售价: 1000, 稀有度: 4 },
    ],
    装备: [{ name: '帝甲', 数量: 5, 出售价: 500 }],
    食材: [{ name: '灵米', 数量: 99 }],
  };
  const loss = applyForbiddenSupremePlunder(player, najie);

  assert.deepEqual(player.学习的功法, []);
  assert.equal(player.当前血量, 1);
  assert.equal(player.元神, 100);
  assert.equal(loss.takenQuantity, 20);
  assert.equal(loss.remainingQuantity, 5);
  assert.deepEqual(najie.道具, [{ name: '碎石', 数量: 5, 出售价: 1 }]);
  assert.deepEqual(najie.装备, []);
  assert.equal(najie.食材[0].数量, 99);
});
