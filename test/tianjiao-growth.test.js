import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceSpecialTianjiaoEvolution,
  applyTianjiaoImprovement,
  attemptTianjiaoBreakthrough,
  buildTianjiaoBattleStats,
  canTianjiaoGrow,
  createTianjiaoTrace,
  getKnownTianjiaoTrace,
  getTianjiaoTraceReach,
  getTianjiaoBreakthroughChance,
  getTianjiaoImperialWeaponAllAttributeCap,
  getTianjiaoImperialWeaponWashLimit,
  getTianjiaoImprovementChance,
  getTianjiaoRealmName,
  improveTianjiao,
  isIndependentTianjiao,
  isTianjiaoHealing,
  isTianjiaoBreakthroughYear,
  isTianjiaoImprovementYear,
  recoverTianjiaoFromSetback,
  reconcileTianjiaoImperialWeapon,
  registerTianjiaoDefeat,
  resetTianjiaoToInitialTemplate,
  rollDungeonTianjiaoTrace,
  rollRealmEventTianjiaoTrace,
} from '../model/tianjiaoGrowth.js';

const context = {
  eraIndex: 0,
  cultivationLevels: [
    { level_id: 1, 基础攻击: 10, 基础防御: 10, 基础血量: 10, 基础暴击: 0.01 },
    { level_id: 64, 基础攻击: 100, 基础防御: 200, 基础血量: 300, 基础暴击: 0.2 },
  ],
  physiqueLevels: [
    { level_id: 1, 基础攻击: 5, 基础防御: 5, 基础血量: 5, 基础暴击: 0.01 },
    { level_id: 63, 基础攻击: 50, 基础防御: 60, 基础血量: 70, 基础暴击: 0.1 },
  ],
  secretLevels: [
    { level_id: 10, level: '大能', 基础攻击: 1000, 基础防御: 1000, 基础血量: 1000 },
    { level_id: 11, level: '斩道', 基础攻击: 2000, 基础防御: 2000, 基础血量: 2000 },
    { level_id: 15, level: '准帝', 基础攻击: 5000, 基础防御: 5000, 基础血量: 5000 },
    { level_id: 16, level: '大帝', 基础攻击: 8000, 基础防御: 8000, 基础血量: 8000 },
    { level_id: 17, level: '红尘仙', 基础攻击: 12000, 基础防御: 12000, 基础血量: 12000 },
  ],
  ancientLevels: [{ level_id: 1, level: '普通人', 基础攻击: 0, 基础防御: 0, 基础血量: 0 }],
  flowerLevels: [
    { level_id: 1, level: '普通人', 基础攻击: 0, 基础防御: 0, 基础血量: 0 },
    { level_id: 16, level: '混元境——大能', 基础攻击: 8000, 基础防御: 8000, 基础血量: 8000 },
    { level_id: 17, level: '大宇境/究极境', 基础攻击: 12000, 基础防御: 12000, 基础血量: 12000 },
  ],
  equipmentList: [
    { name: '烂铁匕首', type: '武器', atk: 500, def: 0, HP: 0, bao: 0.01 },
    { name: '破铜护具', type: '护具', atk: 0, def: 500, HP: 0, bao: 0.01 },
    { name: '廉价炮仗', type: '法宝', atk: 0, def: 0, HP: 500, bao: 0.01 },
  ],
  specialEquipmentList: [
    { name: '更好的法宝', class: '装备', type: '法宝', atk: 200, def: 200, HP: 200, bao: 0.1 },
  ],
  imperialWeaponList: [
    { name: '废铁', class: '装备', type: '帝兵', atk: 0, def: 0, HP: 0, bao: 0, 全属性: 0 },
  ],
  techniqueList: [{ name: '新功法', class: '功法' }],
  talentList: [
    { name: '大成·苍天霸体', type: '大成霸体', 法球倍率: 2, 攻击: 5, 防御: 3, 生命: 3 },
    { name: '魔胎仙体', type: '魔胎', 法球倍率: 8, 攻击: 5, 防御: 2, 生命: 3 },
    { name: '混沌体', type: '混沌体', 法球倍率: 1.45, 攻击: 5, 防御: 5, 生命: 5 },
  ],
};

function sequenceRandom(...values) {
  let index = 0;
  return () => values[index++] ?? 0;
}

test('天骄展示境界取秘境与仙古字段中的最高者', () => {
  const secretLevels = [{ level_id: 12, level: '仙台秘境——圣人' }];
  const ancientLevels = [{ level_id: 13, level: '斩我境' }];

  assert.equal(getTianjiaoRealmName(
    { 境界: '旧境界', mijinglevel_id: 12, xiangulevel_id: 1 },
    secretLevels,
    ancientLevels,
  ), '仙台秘境——圣人');
  assert.equal(getTianjiaoRealmName(
    { 境界: '旧境界', mijinglevel_id: 1, xiangulevel_id: 13 },
    secretLevels,
    ancientLevels,
  ), '斩我境');
  assert.equal(getTianjiaoRealmName(
    { 境界: '无妄真劫境', mijinglevel_id: 1, xiangulevel_id: 1 },
    secretLevels,
    ancientLevels,
  ), '无妄真劫境');
});

test('阳间天骄使用花粉路境界、属性与成长', () => {
  const tianjiao = {
    名号: '武疯子',
    位面: 7,
    境界: '混元境——大能',
    mijinglevel_id: 1,
    xiangulevel_id: 1,
    huafenlevel_id: 16,
  };

  assert.equal(isIndependentTianjiao(tianjiao), true);
  assert.equal(getTianjiaoRealmName(
    tianjiao,
    context.secretLevels,
    context.ancientLevels,
    context.flowerLevels,
  ), '混元境——大能');

  const stats = buildTianjiaoBattleStats(tianjiao, context);
  assert.equal(stats.攻击, 8650);
  assert.equal(stats.防御, 8760);
  assert.equal(stats.血量上限, 8870);

  const breakthrough = attemptTianjiaoBreakthrough(tianjiao, context, () => 0);
  assert.equal(breakthrough.field, 'huafenlevel_id');
  assert.equal(breakthrough.newRealm, '大宇境/究极境');
  assert.equal(tianjiao.huafenlevel_id, 17);
});

test('天骄每三千年尝试证道与自强', () => {
  assert.equal(isTianjiaoBreakthroughYear(0), false);
  assert.equal(isTianjiaoBreakthroughYear(2000), false);
  assert.equal(isTianjiaoBreakthroughYear(5000), false);
  assert.equal(isTianjiaoBreakthroughYear(3000), true);
  assert.equal(isTianjiaoBreakthroughYear(6000), true);
  assert.equal(isTianjiaoImprovementYear(0), false);
  assert.equal(isTianjiaoImprovementYear(1000), false);
  assert.equal(isTianjiaoImprovementYear(3000), true);

  const myth = getTianjiaoBreakthroughChance('mijinglevel_id', 9, 0);
  assert.ok(myth > getTianjiaoBreakthroughChance('mijinglevel_id', 9, 1));
  assert.ok(getTianjiaoBreakthroughChance('mijinglevel_id', 9, 1) > getTianjiaoBreakthroughChance('mijinglevel_id', 9, 2));
  assert.ok(getTianjiaoBreakthroughChance('mijinglevel_id', 9, 2) > getTianjiaoBreakthroughChance('mijinglevel_id', 9, 3));
  assert.ok(getTianjiaoBreakthroughChance('mijinglevel_id', 9, 3) > getTianjiaoBreakthroughChance('mijinglevel_id', 9, 4));

  assert.ok(myth > getTianjiaoBreakthroughChance('mijinglevel_id', 10, 0));
  assert.ok(getTianjiaoBreakthroughChance('mijinglevel_id', 10, 0) > getTianjiaoBreakthroughChance('mijinglevel_id', 11, 0));
  assert.ok(getTianjiaoBreakthroughChance('mijinglevel_id', 14, 0) > getTianjiaoBreakthroughChance('mijinglevel_id', 15, 0));
  assert.ok(getTianjiaoBreakthroughChance('mijinglevel_id', 15, 0) > getTianjiaoBreakthroughChance('mijinglevel_id', 16, 0));
  assert.ok(getTianjiaoBreakthroughChance('mijinglevel_id', 16, 3) < 0.001);
  assert.equal(getTianjiaoBreakthroughChance('mijinglevel_id', 16, 4), 0);
  assert.equal(getTianjiaoBreakthroughChance('xiangulevel_id', 15, 4), 0);

  const tianjiao = { 名号: '测试天骄', mijinglevel_id: 15, xiangulevel_id: 1 };
  const result = attemptTianjiaoBreakthrough(tianjiao, context, () => 0);
  assert.equal(result.newRealm, '大帝');
  assert.equal(tianjiao.mijinglevel_id, 16);
});

test('陨落转世和养伤期间暂停天骄成长', () => {
  assert.equal(canTianjiaoGrow({}, 3000), true);
  assert.equal(canTianjiaoGrow({ isAlive: true }, 3000), true);
  assert.equal(canTianjiaoGrow({ isAlive: false }, 3000), false);
  assert.equal(canTianjiaoGrow({
    isAlive: true,
    isHealing: true,
    养伤: { untilWorldYear: 4000 },
  }, 3000), false);
  assert.equal(canTianjiaoGrow({
    isAlive: true,
    isHealing: true,
    养伤: { untilWorldYear: 3000 },
  }, 3000), true);
});

test('位面天骄按满练气、满炼体和自身境界生成属性', () => {
  const stats = buildTianjiaoBattleStats({
    名号: '测试天骄',
    位面: 2,
    攻击: 999999999,
    防御: 999999999,
    血量上限: 999999999,
    mijinglevel_id: 10,
    xiangulevel_id: 1,
    暴击率: 0.5,
  }, context);

  assert.equal(stats.level_id, 64);
  assert.equal(stats.Physique_id, 63);
  assert.equal(stats.攻击, 1650);
  assert.equal(stats.防御, 1760);
  assert.equal(stats.血量上限, 1870);
  assert.equal(stats.装备.武器.name, '烂铁匕首');
  assert.equal(stats.装备.帝兵.name, '废铁');
});

test('每三千年自强保持高概率，单次最多完成四种行为', () => {
  assert.ok(getTianjiaoImprovementChance(0) > getTianjiaoImprovementChance(4));
  assert.ok(getTianjiaoImprovementChance(4) > 0.5);

  const tianjiao = {
    名号: '测试天骄',
    位面: 2,
    mijinglevel_id: 10,
    xiangulevel_id: 1,
    学习的功法: [],
  };
  const reports = improveTianjiao(tianjiao, context, () => 0.99);
  assert.equal(reports.length, 4);
  assert.equal(tianjiao.装备.法宝.name, '更好的法宝');
  assert.notEqual(tianjiao.装备.帝兵.name, '测试天骄·本命道兵');
  assert.equal(tianjiao.装备.帝兵.洗礼次数, 1);
  assert.ok(tianjiao.攻击加成 > 0);
  assert.deepEqual(tianjiao.学习的功法, ['新功法']);

  applyTianjiaoImprovement(tianjiao, 'equipment', context, () => 0);
  assert.ok(tianjiao.装备.武器.归一属性.百分比.atk > 0);
  assert.notEqual(tianjiao.装备.武器.name, '测试天骄祭炼的武器');
  const percentageName = tianjiao.装备.武器.name;
  const firstPercentage = tianjiao.装备.武器.归一属性.百分比.atk;
  applyTianjiaoImprovement(tianjiao, 'equipment', context, () => 0);
  assert.equal(tianjiao.装备.武器.name, percentageName);
  assert.equal(tianjiao.装备.武器.百分比洗礼次数, 2);
  assert.ok(tianjiao.装备.武器.归一属性.百分比.atk > firstPercentage);

  const imperialName = tianjiao.装备.帝兵.name;
  const imperialAttack = tianjiao.装备.帝兵.atk;
  const imperialAll = tianjiao.装备.帝兵.全属性;
  applyTianjiaoImprovement(tianjiao, 'imperialWeapon', context, () => 0);
  assert.equal(tianjiao.装备.帝兵.name, imperialName);
  assert.equal(tianjiao.装备.帝兵.洗礼次数, 2);
  assert.equal(tianjiao.装备.帝兵.品阶, '铭刻道与理');
  assert.equal(tianjiao.装备.帝兵.atk, imperialAttack * 2);
  assert.equal(tianjiao.装备.帝兵.全属性, imperialAll + 2);

  tianjiao.装备.武器.name = '测试天骄祭炼的武器';
  applyTianjiaoImprovement(tianjiao, 'equipment', context, () => 0);
  const cappedWeapon = applyTianjiaoImprovement(tianjiao, 'imperialWeapon', context, () => 0);
  assert.notEqual(tianjiao.装备.武器.name, '测试天骄祭炼的武器');
  assert.equal(cappedWeapon, null);
  assert.equal(tianjiao.装备.帝兵.洗礼次数, 2);
});

test('天骄帝兵按玩家同源规则限制境界、品阶与全属性', () => {
  const greatPower = { 名号: '大能天骄', mijinglevel_id: 10, xiangulevel_id: 1, 学习的功法: [] };
  assert.equal(getTianjiaoImperialWeaponWashLimit(greatPower), 2);
  assert.equal(getTianjiaoImperialWeaponAllAttributeCap(greatPower), 14.2);
  const playerTheory = new Map([[10, 14.2], [11, 22.2], [12, 32.2], [13, 47.2], [14, 62.2], [15, 89.2]]);
  for (const [level, expected] of playerTheory) {
    assert.equal(getTianjiaoImperialWeaponAllAttributeCap({ mijinglevel_id: level, 学习的功法: [] }), expected);
  }
  greatPower.学习的功法.push('兵字秘');
  assert.equal(getTianjiaoImperialWeaponAllAttributeCap(greatPower), 54.2);

  const quasiEmperor = { 名号: '准帝天骄', mijinglevel_id: 15, xiangulevel_id: 1, 学习的功法: ['兵字秘'] };
  assert.equal(getTianjiaoImperialWeaponWashLimit(quasiEmperor), 5);
  assert.equal(getTianjiaoImperialWeaponAllAttributeCap(quasiEmperor), 129.2);

  const ancientGod = { 名号: '天神天骄', mijinglevel_id: 1, xiangulevel_id: 11, 学习的功法: [] };
  for (let count = 0; count < 4; count++) {
    assert.ok(applyTianjiaoImprovement(ancientGod, 'imperialWeapon', context, () => 0));
  }
  assert.equal(ancientGod.装备.帝兵.洗礼次数, 4);
  assert.equal(ancientGod.装备.帝兵.品阶, '天神兵');
  assert.equal(applyTianjiaoImprovement(ancientGod, 'imperialWeapon', context, () => 0), null);

  const aboveSacrifice = { 名号: '祭道之上', mijinglevel_id: 23, xiangulevel_id: 1, 学习的功法: ['兵字秘'] };
  const uniqueDao = { 名号: '唯一道之上', mijinglevel_id: 24, xiangulevel_id: 1, 学习的功法: ['兵字秘'] };
  assert.equal(getTianjiaoImperialWeaponWashLimit(aboveSacrifice), 29);
  assert.equal(getTianjiaoImperialWeaponWashLimit(uniqueDao), 38);
  for (let count = 0; count < 38; count++) {
    assert.ok(applyTianjiaoImprovement(uniqueDao, 'imperialWeapon', context, () => 0));
  }
  assert.equal(uniqueDao.装备.帝兵.品阶, '唯一器（九阶）');
  assert.equal(applyTianjiaoImprovement(uniqueDao, 'imperialWeapon', context, () => 0), null);
});

test('天骄自强会把历史超限帝兵纠正到当前理论上限', () => {
  const tianjiao = {
    名号: '纠错天骄',
    mijinglevel_id: 10,
    xiangulevel_id: 1,
    学习的功法: [],
    装备: {
      帝兵: {
        name: '越界帝兵', author_name: '纠错天骄', 天骄本命: true,
        品阶: '唯一器（九阶）', 洗礼次数: 99, 全属性: 999,
      },
    },
  };

  const correction = reconcileTianjiaoImperialWeapon(tianjiao, context);
  assert.deepEqual(
    [correction.afterWash, correction.rank, correction.afterAll, correction.cap],
    [2, '铭刻道与理', 14.2, 14.2],
  );

  tianjiao.装备.帝兵.洗礼次数 = 99;
  tianjiao.装备.帝兵.品阶 = '唯一器（九阶）';
  tianjiao.装备.帝兵.全属性 = 999;
  const reports = improveTianjiao(tianjiao, context, () => 0);
  assert.match(reports[0], /帝兵自检纠正/);
  assert.equal(tianjiao.装备.帝兵.洗礼次数, 2);
  assert.equal(tianjiao.装备.帝兵.品阶, '铭刻道与理');
  assert.equal(tianjiao.装备.帝兵.全属性, 14.2);
});

test('副本和位面事件会刷新限时踪迹，禁入位面不会成为天骄位置', () => {
  const now = 1_000_000;
  const tianjiao = { 名号: '测试天骄', 位面: 2 };
  const player = { power_place: 2 };
  const dungeonTrace = rollDungeonTianjiaoTrace(player, [tianjiao], { chance: 1, now, random: () => 0 });
  assert.equal(dungeonTrace.plane, '遮天位面');
  assert.equal(getKnownTianjiaoTrace(player, tianjiao, now), dungeonTrace);
  assert.equal(getTianjiaoTraceReach(player, dungeonTrace).reason, 'coordinate');
  player.遮天位面坐标 = { ...dungeonTrace.coordinate };
  assert.equal(getTianjiaoTraceReach(player, dungeonTrace).ok, true);
  assert.equal(getKnownTianjiaoTrace(player, tianjiao, dungeonTrace.expiresAt), null);

  const publicTrace = rollRealmEventTianjiaoTrace([tianjiao], {
    plane: '九天十地',
    location: '神碑林',
    coordinate: { x: 380, y: 380 },
  }, { chance: 1, now, random: () => 0 });
  assert.equal(publicTrace.plane, '九天十地');
  assert.equal(tianjiao.公开踪迹, publicTrace);
  assert.equal(getKnownTianjiaoTrace({}, tianjiao, now), null);

  const forbidden = createTianjiaoTrace(
    { 名号: '迷路天骄', 位面: 5 },
    { destination: { plane: '永恒未知之地', coordinate: { x: 1, y: 1 } }, now, random: () => 0 },
  );
  assert.notEqual(forbidden.plane, '永恒未知之地');
  assert.notEqual(forbidden.plane, '时间长河');
  assert.notEqual(forbidden.plane, '仙域');
});

test('霸王境界满足后大成，华云飞吞噬五次和十次依次进化', () => {
  const overlord = {
    名号: '霸王浑战', mijinglevel_id: 14, xiangulevel_id: 1,
    灵根: { name: '小成·苍天霸体', type: '霸体', 法球倍率: 1.5 },
  };
  assert.equal(advanceSpecialTianjiaoEvolution(overlord, context, () => 0), null);
  overlord.mijinglevel_id = 15;
  assert.equal(advanceSpecialTianjiaoEvolution(overlord, context, () => 0).evolvedTo, '大成·苍天霸体');
  assert.equal(overlord.灵根.type, '大成霸体');

  const huayunfei = {
    名号: '华云飞', 境界: '大能', mijinglevel_id: 10, xiangulevel_id: 1,
    灵根: { name: '伪·魔胎仙体', type: '魔胎', 法球倍率: 2 },
  };
  assert.equal(advanceSpecialTianjiaoEvolution(huayunfei, context, () => 0.99), null);
  const first = advanceSpecialTianjiaoEvolution(
    huayunfei,
    context,
    sequenceRandom(0, 0.9, 0, 0),
  );
  assert.equal(first.targetType, '同境天骄');
  assert.equal(first.targetName, '大能天骄·姬玄');

  let fifth;
  for (let count = 0; count < 4; count++) fifth = advanceSpecialTianjiaoEvolution(huayunfei, context, () => 0);
  assert.equal(fifth.count, 5);
  assert.equal(fifth.evolvedTo, '魔胎仙体');
  assert.equal(huayunfei.灵根.name, '魔胎仙体');

  let tenth;
  for (let count = 0; count < 5; count++) tenth = advanceSpecialTianjiaoEvolution(huayunfei, context, () => 0);
  assert.equal(tenth.count, 10);
  assert.equal(tenth.evolvedTo, '混沌体');
  assert.equal(huayunfei.灵根.name, '混沌体');
  assert.equal(huayunfei.吞噬本源记录.length, 10);

  const evolvedStats = buildTianjiaoBattleStats(overlord, context);
  const plainStats = buildTianjiaoBattleStats({ ...overlord, 灵根: {} }, context);
  assert.ok(evolvedStats.攻击 > plainStats.攻击);
  assert.ok(evolvedStats.防御 > plainStats.防御);
  assert.ok(evolvedStats.血量上限 > plainStats.血量上限);
});

test('天骄连续败绩触发养伤，千年后伤愈且轮回归零', () => {
  const tianjiao = {
    名号: '测试天骄',
    位面: 2,
    境界: '大能',
    攻击: 1000,
    防御: 1000,
    血量上限: 1000,
    当前血量: 1000,
    mijinglevel_id: 10,
    xiangulevel_id: 1,
    攻击加成: 100,
    学习的功法: [],
  };
  const status = { currentHP: 80, isAlive: true };

  registerTianjiaoDefeat(tianjiao, status, 1000, () => 0.99);
  registerTianjiaoDefeat(tianjiao, status, 1000, () => 0.99);
  assert.equal(status.isHealing, undefined);

  const third = registerTianjiaoDefeat(tianjiao, status, 1000, () => 0.99);
  assert.equal(third.setback.type, '道心破碎');
  assert.equal(third.setback.startedAtWorldYear, 1000);
  assert.equal(third.setback.untilWorldYear, 2000);
  assert.ok(Number(tianjiao.攻击加成) < 100);
  assert.equal(isTianjiaoHealing(status, 1999), true);
  assert.equal(isTianjiaoHealing(status, 2000), false);
  assert.equal(recoverTianjiaoFromSetback(status, 1999), null);

  const recovered = recoverTianjiaoFromSetback(status, 2000);
  assert.equal(recovered.type, '道心破碎');
  assert.equal(recovered.currentHP, 100);
  assert.equal(status.isHealing, false);

  const reset = resetTianjiaoToInitialTemplate(tianjiao, context, () => 0);
  assert.equal(reset.life, 1);
  assert.equal(tianjiao.攻击, 1000);
  assert.equal(tianjiao.攻击加成, undefined);
  assert.equal(tianjiao.装备.帝兵.name, '废铁');
});
