import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  AUTHORITY_COOLDOWNS,
  CONTESTABLE_INNATE_TREASURE_NAMES,
  ETERNAL_MAP_COMPONENTS,
  ETERNAL_MAP_GESTATION_WORLD_YEARS,
  ETERNAL_MAP_SYNTHESIS_COSTS,
  INNATE_TREASURE_CATALOG,
  INNATE_TREASURE_NAMES,
  applyDinghaiBattleOpening,
  applyInnateTravelReduction,
  applyNewTreasureDamageRules,
  buildInnateTreasureTransfer,
  createInnateTreasure,
  createInnateTreasureProjection,
  createEternalImmortalMap,
  createOtherShoreDaoTreasureRuntime,
  consumeAlchemyMultiplier,
  consumeEternalMapSynthesisMaterials,
  consumeDinghaiControlImmunity,
  getCausalDebtMultiplier,
  getCooldownRemaining,
  getEternalMapGestationStatus,
  getHabitatSlotBonus,
  getInnerWorldOpenChance,
  getInnerWorldYieldMultiplier,
  getCraftingTimedActionMultiplier,
  getInnateSpeedMultiplier,
  getPetAbilityBonus,
  getPetTreasureRules,
  getTimedActionMultiplier,
  getTribulationDamageMultiplier,
  hasEquippedInnateTreasure,
  hasReincarnationProtection,
  migrateLegacyInnateTreasureSlot,
  recordDinghaiShieldAbsorption,
  startAuthorityCooldown,
  temperMyriadTribulationSpirit,
  tickDinghaiEvolution,
  transferInnateTreasureAuthorityState,
  tryPanguShatterTalisman,
  tryEternalFateRewrite,
} from '../model/innateTreasure.js';
import { swapEquipmentState } from '../model/equipmentSwap.js';

test('至宝图鉴完整覆盖全部先天至宝及真实冷却', () => {
  assert.deepEqual(Object.keys(INNATE_TREASURE_CATALOG), [...INNATE_TREASURE_NAMES]);
  for (const entry of Object.values(INNATE_TREASURE_CATALOG)) {
    assert.ok(entry.title && entry.lore && entry.summary);
    assert.ok(Array.isArray(entry.passives));
    assert.ok(Array.isArray(entry.authorities));
    for (const authority of entry.authorities) {
      assert.match(authority.command, /^#/);
      if (authority.cooldownKey) assert.ok(AUTHORITY_COOLDOWNS[authority.cooldownKey] > 0);
    }
  }
});

test('虚天舟为传承专属至宝并固定缩短5至10分钟', () => {
  assert.ok(INNATE_TREASURE_NAMES.includes('虚天舟'));
  assert.ok(!CONTESTABLE_INNATE_TREASURE_NAMES.includes('虚天舟'));
  assert.deepEqual(applyInnateTravelReduction({ 当前先天至宝: '虚天舟' }, 20, () => 0), {
    travelTime: 15,
    reduction: 5,
  });
  assert.deepEqual(applyInnateTravelReduction({ 当前先天至宝: '虚天舟' }, 20, () => 0.999), {
    travelTime: 10,
    reduction: 10,
  });
  assert.deepEqual(applyInnateTravelReduction({}, 20, () => 0), { travelTime: 20, reduction: 0 });
});

test('虚天舟/逐日仙辇穿梭维度壁垒时增强：20% / 15%~25%并含1%瞬间穿梭', () => {
  // 虚天舟（维度壁垒）：固定减 20%
  assert.deepEqual(applyInnateTravelReduction({ 当前先天至宝: '虚天舟' }, 100, () => 0.5, { dimensionBarrier: true }), {
    travelTime: 80,
    reduction: 20,
  });
  // 逐日仙辇（维度壁垒）：随机减 15%~25%
  assert.deepEqual(applyInnateTravelReduction({ 当前先天至宝: '逐日仙辇' }, 100, () => 0.01, { dimensionBarrier: true }), {
    travelTime: 85,
    reduction: 15,
  });
  assert.deepEqual(applyInnateTravelReduction({ 当前先天至宝: '逐日仙辇' }, 100, () => 0.5, { dimensionBarrier: true }), {
    travelTime: 80,
    reduction: 20,
  });
  assert.deepEqual(applyInnateTravelReduction({ 当前先天至宝: '逐日仙辇' }, 100, () => 0.99, { dimensionBarrier: true }), {
    travelTime: 75,
    reduction: 25,
  });
  // 逐日仙辇（维度壁垒）：1% 极小概率瞬间穿梭
  assert.deepEqual(applyInnateTravelReduction({ 当前先天至宝: '逐日仙辇' }, 100, () => 0.005, { dimensionBarrier: true }), {
    travelTime: 0,
    reduction: 100,
    instant: true,
  });
  // 非维度壁垒行为保持不变
  assert.deepEqual(applyInnateTravelReduction({ 当前先天至宝: '逐日仙辇' }, 100, () => 0.5), {
    travelTime: 85,
    reduction: 15,
  });
  assert.deepEqual(applyInnateTravelReduction({ 当前先天至宝: '虚天舟' }, 20, () => 0), {
    travelTime: 15,
    reduction: 5,
  });
});

test('先天至宝实体绑定唯一主人并使用独立至宝槽', () => {
  const treasure = createInnateTreasure('混沌珠', '10001', 1234);
  assert.equal(treasure.type, '至宝');
  assert.equal(treasure.品阶, '先天至宝');
  assert.equal(treasure.author_name, '10001');
  assert.equal(treasure.绑定者, '10001');
  assert.equal(treasure.认主时间, 1234);
});

test('至宝归属移交会更换唯一主人并撤销旧掌控记录', () => {
  const state = {
    owners: { 混沌珠: { ownerId: '10001', claimedAt: 1 } },
    equipped: { 混沌珠: { ownerId: '10001', equippedAt: 2 } },
    decree: null,
    landscapeRealms: [],
  };
  const transfer = buildInnateTreasureTransfer(state, '混沌珠', '10001', '10002', 3000);
  assert.equal(transfer.ok, true);
  assert.equal(transfer.nextState.owners.混沌珠.ownerId, '10002');
  assert.equal(transfer.nextState.owners.混沌珠.previousOwnerId, '10001');
  assert.equal(transfer.nextState.owners.混沌珠.transferredAt, 3000);
  assert.equal(transfer.nextState.equipped.混沌珠, undefined);
  assert.equal(state.owners.混沌珠.ownerId, '10001');
  assert.equal(buildInnateTreasureTransfer(state, '混沌珠', '99999', '10002').reason, 'not-owner');

  const sourcePlayer = { 先天权柄: { 冷却: { 阴阳逆转: 9000 }, 太极模式: '阴', 阴阳逆转待用: true } };
  const targetPlayer = { 先天权柄: { 冷却: { 阴阳逆转: 5000 }, 太极模式: '阳' } };
  transferInnateTreasureAuthorityState(sourcePlayer, targetPlayer, '太极图');
  assert.equal(sourcePlayer.先天权柄.冷却.阴阳逆转, undefined);
  assert.equal(sourcePlayer.先天权柄.太极模式, undefined);
  assert.equal(targetPlayer.先天权柄.冷却.阴阳逆转, 9000);
  assert.equal(targetPlayer.先天权柄.太极模式, '阴');
  assert.equal(targetPlayer.先天权柄.阴阳逆转待用, true);
});

test('择主榜第二三名获得有明确期限的七日投影', () => {
  const projection = createInnateTreasureProjection('太极图', '10002', 1000);
  assert.equal(projection.type, '至宝');
  assert.equal(projection.name, '太极图·七日投影');
  assert.equal(projection.先天至宝本体, '太极图');
  assert.equal(projection.绑定者, '10002');
  assert.equal(projection.先天投影截止, 1000 + 7 * 24 * 60 * 60 * 1000);
});

test('旧帝兵栏中的先天至宝自动迁移且过期投影自动清除', () => {
  const treasure = createInnateTreasure('混沌珠', '10001', 1000);
  const migrated = migrateLegacyInnateTreasureSlot({ 帝兵: { ...treasure, type: '帝兵' } }, 2000);
  assert.equal(migrated.帝兵, null);
  assert.equal(migrated.至宝.name, '混沌珠');
  assert.equal(migrated.至宝.type, '至宝');

  const projection = createInnateTreasureProjection('太极图', '10001', 1000);
  const expired = migrateLegacyInnateTreasureSlot({ 帝兵: projection }, projection.先天投影截止);
  assert.equal(expired.帝兵, null);
  assert.equal(expired.至宝, null);
});

test('普通帝兵与独立先天至宝可以同时执掌', () => {
  const emperorWeapon = { name: '本命帝兵', type: '帝兵' };
  const treasure = createInnateTreasure('盘古幡', '10001', 1000);
  const equipment = migrateLegacyInnateTreasureSlot({
    帝兵: emperorWeapon,
    至宝: treasure,
  }, 2000);

  assert.equal(equipment.帝兵.name, '本命帝兵');
  assert.equal(equipment.至宝.name, '盘古幡');
  assert.equal(equipment.至宝.type, '至宝');
});

test('已锁定至宝更换后退回纳戒仍保持锁定', () => {
  const previous = { ...createInnateTreasure('盘古幡', '10001', 1000), islockd: 1 };
  const incoming = { ...createInnateTreasure('太极图', '10001', 1000), 数量: 1, islockd: 0 };
  const result = swapEquipmentState(
    { 装备: [incoming] },
    { 至宝: previous },
    incoming,
  );

  assert.equal(result.ok, true);
  assert.equal(result.equipment.至宝.name, '太极图');
  assert.equal(result.najie.装备.find(item => item.name === '盘古幡').islockd, 1);

  const commandSource = fs.readFileSync(new URL('../apps/User/UserSellAll.js', import.meta.url), 'utf8');
  assert.match(commandSource, /thing_name === '至宝'/);
  assert.match(commandSource, /un_lock === '解锁' && isItemPermanentlyNonTradeable\(equipment\.至宝\)/);
  assert.match(commandSource, /equipment\.至宝\.islockd = un_lock === '锁定' \? 1 : 0/);
});

test('不同权柄使用独立冷却', () => {
  const player = {};
  startAuthorityCooldown(player, '混沌复制', 1000);
  assert.equal(getCooldownRemaining(player, '混沌复制', 1000), 12 * 60 * 60 * 1000);
  assert.equal(getCooldownRemaining(player, '混沌变幻', 1000), 0);
});

test('彼岸大道至宝只继承所选开天主动权柄', () => {
  const runtime = createOtherShoreDaoTreasureRuntime({
    name: '彼岸开天器',
    大道至宝本体: true,
    cooldownMultiplier: 0.5,
    authorities: [{
      name: '开天',
      sourceTreasureId: 'pangu-banner',
      sourceTreasureName: '盘古幡',
      command: '#开天',
      cooldownKey: '开天',
    }],
  });
  const player = { 当前大道至宝: runtime.name, 彼岸大道至宝运行时: runtime };

  assert.equal(runtime.authorities[0].authorityKey, '开天');
  assert.equal(hasEquippedInnateTreasure(player, '盘古幡', '开天'), true);
  assert.equal(hasEquippedInnateTreasure(player, '盘古幡'), false);
  assert.equal(hasEquippedInnateTreasure(player, '诛仙四剑', '开天'), false);
});

test('第四法自定义别名归一到现有权柄与冷却键', () => {
  const runtime = createOtherShoreDaoTreasureRuntime({
    name: '还真开天器',
    大道至宝本体: true,
    authorities: [{
      name: '开天',
      sourceTreasureName: '盘古幡',
      command: '#开天',
      cooldownKey: '开天冷却',
      mode: 'return-truth-edited',
    }],
  });
  const player = { 当前大道至宝: runtime.name, 彼岸大道至宝运行时: runtime };

  assert.equal(runtime.authorities[0].cooldownKey, '开天');
  assert.equal(hasEquippedInnateTreasure(player, '盘古幡', '开天'), true);
});

test('彼岸大道至宝被动与主动严格隔离', () => {
  const runtime = createOtherShoreDaoTreasureRuntime({
    name: '彼岸护道器',
    大道至宝本体: true,
    冷却倍率: 0.5,
    authorities: [{
      name: INNATE_TREASURE_CATALOG.盘古幡.passives[0],
      sourceTreasureName: '盘古幡',
      passive: true,
    }],
  });
  const player = { 当前大道至宝: runtime.name, 彼岸大道至宝运行时: runtime };

  assert.equal(hasEquippedInnateTreasure(player, '盘古幡'), true);
  assert.equal(hasEquippedInnateTreasure(player, '盘古幡', '被动:1'), true);
  assert.equal(hasEquippedInnateTreasure(player, '盘古幡', '开天'), false);
});

test('彼岸大道至宝的主动权柄不会连带放出同源系统被动', () => {
  const runtime = createOtherShoreDaoTreasureRuntime({
    name: '彼岸万道器',
    大道至宝本体: true,
    authorities: [{ name: '万道开炉', sourceTreasureName: '万道神炉' }],
  });
  const player = { 当前大道至宝: runtime.name, 彼岸大道至宝运行时: runtime };

  assert.equal(hasEquippedInnateTreasure(player, '万道神炉', '万道开炉'), true);
  assert.equal(getCraftingTimedActionMultiplier(player), 1);
});

test('彼岸大道至宝的0.5冷却只作用于自身所含权柄', () => {
  const runtime = createOtherShoreDaoTreasureRuntime({
    name: '彼岸开天器',
    大道至宝本体: true,
    cooldownMultiplier: 0.5,
    authorities: [{ name: '开天', sourceTreasureName: '盘古幡' }],
  });
  const player = { 当前大道至宝: runtime.name, 彼岸大道至宝运行时: runtime };
  const now = 1000;

  startAuthorityCooldown(player, '开天', now);
  assert.equal(getCooldownRemaining(player, '开天', now), AUTHORITY_COOLDOWNS.开天 * 0.5);
  startAuthorityCooldown(player, '混沌复制', now);
  assert.equal(getCooldownRemaining(player, '混沌复制', now), AUTHORITY_COOLDOWNS.混沌复制);
});

test('装备重算会投影彼岸大道至宝权柄运行时', () => {
  const source = fs.readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
  assert.match(source, /createOtherShoreDaoTreasureRuntime\(equipment\.至宝\)/);
  assert.match(source, /player\.彼岸大道至宝运行时 = otherShoreDaoRuntime/);
});

test('盘古幡开天有30%概率打碎天骄本世护身法宝', () => {
  const status = {};
  assert.equal(tryPanguShatterTalisman(status, false, () => 0), false);
  assert.equal(tryPanguShatterTalisman(status, true, () => 0.3), false);
  assert.equal(tryPanguShatterTalisman(status, true, () => 0.299), true);
  assert.equal(status.护身法宝已碎, true);
  assert.equal(tryPanguShatterTalisman(status, true, () => 0), false);
});

test('炼妖壶将寻宝下限改为60分钟、上限24小时并翻倍奖励', () => {
  const rules = getPetTreasureRules({ 当前先天至宝: '炼妖壶' });
  assert.deepEqual(rules, {
    requiredMinutes: 60,
    maxMinutes: 1440,
    rewardMultiplier: 2,
  });
});

test('炼妖融合按能力类型叠加主宠与继承能力', () => {
  const pet = {
    type: '战斗',
    加成: 0.2,
    炼妖继承能力: { type: '修炼', 加成: 0.15 },
  };
  assert.equal(getPetAbilityBonus(pet, '战斗'), 0.2);
  assert.equal(getPetAbilityBonus(pet, '修炼'), 0.15);
  assert.equal(getPetAbilityBonus(pet, '幸运'), 0);
});

test('玄黄护道按失败率降低30%换算开启概率', () => {
  const player = {
    当前先天至宝: '天地玄黄玲珑塔',
    先天权柄: { 玄黄护道待用: true },
  };
  assert.ok(Math.abs(getInnerWorldOpenChance(0.4, player) - 0.58) < Number.EPSILON * 2);
  assert.equal(getInnerWorldOpenChance(0.4, { 当前先天至宝: '天地玄黄玲珑塔' }), 0.4);
});

test('崆峒印内景收益与山河图栖息位生效', () => {
  assert.equal(getInnerWorldYieldMultiplier({ 当前先天至宝: '崆峒印' }), 1.3);
  assert.equal(getHabitatSlotBonus({ 当前先天至宝: '山河社稷图' }), 2);
});

test('混沌钟与东皇钟使用各自的计时倍率', () => {
  assert.equal(getTimedActionMultiplier({ 当前先天至宝: '混沌钟' }), 0.7);
  assert.equal(getTimedActionMultiplier({ 当前先天至宝: '东皇钟' }), 0.8);
  assert.equal(getTimedActionMultiplier({}), 1);
});

test('六道轮回盘与临时庇护都能阻止寿元轮回', () => {
  assert.equal(hasReincarnationProtection({ 当前先天至宝: '六道轮回盘' }, 1000), true);
  assert.equal(hasReincarnationProtection({ 先天权柄: { 轮回庇护截止: 2000 } }, 1000), true);
  assert.equal(hasReincarnationProtection({ 先天权柄: { 轮回庇护截止: 500 } }, 1000), false);
});

test('混沌钟#截断岁月消费层覆盖分段结算行动并加锁', () => {
  const source = fs.readFileSync(
    new URL('../apps/User/InnateTreasureAuthorities.js', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('async cutTime(e)');
  const end = source.indexOf('async kongtongDecree(e)', start);
  const block = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  // 加锁互斥，避免与定时结算竞态
  assert.match(block, /withPlayerMutationLock\(ctx\.qq/);
  // 支持分段结算行动（宗门/福地秘境历练，无 end_time 字段）
  assert.match(block, /getSecretPlaceActionEndTime\(action\)/);
  assert.match(block, /accelerateSecretPlaceAction\(action, endTime - now, now\)/);
  // 常规行动仍走 end_time 截断
  assert.match(block, /action\.end_time = now/);
  // 轮回/关押/永寂仍被排除
  assert.match(block, /轮回\|关押\|永寂/);
});

test('永恒仙图固定大道至宝数值并继承九件组件权能', () => {
  assert.equal(ETERNAL_MAP_COMPONENTS.length, 9);
  const item = createEternalImmortalMap('10001', 1234);
  assert.equal(item.name, '永恒仙图');
  assert.equal(item.固定全属性, 1_000_000_000_000);
  assert.equal(item.全属性倍率加成, 300);
  assert.equal(item.不可交易, true);
  const player = { 当前大道至宝: '永恒仙图' };
  for (const name of ETERNAL_MAP_COMPONENTS) assert.equal(hasEquippedInnateTreasure(player, name), true);
  assert.equal(hasEquippedInnateTreasure(player, '盘古幡'), false);
});

test('永恒仙图合成材料完整校验后才统一扣除', () => {
  assert.deepEqual(ETERNAL_MAP_SYNTHESIS_COSTS, { 界核: 9, 宇宙核心: 1, 鸿蒙道火: 90 });
  const insufficient = { 材料: [{ name: '界核', 数量: 8 }] };
  const rejected = consumeEternalMapSynthesisMaterials(insufficient);
  assert.equal(rejected.ok, false);
  assert.equal(insufficient.材料[0].数量, 8);

  const najie = {
    材料: [
      { name: '界核', 数量: 5 },
      { name: '界核', 数量: 6 },
      { name: '宇宙核心', 数量: 1 },
      { name: '鸿蒙道火', 数量: 100 },
      { name: '万物源金', 数量: 3 },
    ],
  };
  assert.equal(consumeEternalMapSynthesisMaterials(najie).ok, true);
  assert.equal(najie.材料.filter(item => item.name === '界核').reduce((sum, item) => sum + item.数量, 0), 2);
  assert.equal(najie.材料.some(item => item.name === '宇宙核心'), false);
  assert.equal(najie.材料.find(item => item.name === '鸿蒙道火').数量, 10);
  assert.equal(najie.材料.find(item => item.name === '万物源金').数量, 3);
});

test('永恒仙图必须孕育9000世界年才可成形', () => {
  assert.equal(ETERNAL_MAP_GESTATION_WORLD_YEARS, 9000);
  const record = { status: 'gestating', readyAtWorldYear: 19000 };
  assert.deepEqual(getEternalMapGestationStatus(record, 10000), {
    phase: 'gestating',
    remainingWorldYears: 9000,
    readyAtWorldYear: 19000,
  });
  assert.equal(getEternalMapGestationStatus(record, 18999.5).remainingWorldYears, 1);
  assert.equal(getEternalMapGestationStatus(record, 19000).phase, 'ready');
  assert.equal(getEternalMapGestationStatus({ ownerId: '10001', createdAt: 1 }, 0).phase, 'formed');
});

test('逐日、神炉、神灯与天碑被动倍率按设计生效', () => {
  assert.deepEqual(applyInnateTravelReduction({ 当前先天至宝: '逐日仙辇' }, 100), { travelTime: 85, reduction: 15 });
  assert.equal(getInnateSpeedMultiplier({ 当前先天至宝: '逐日仙辇' }), 1.1);
  assert.equal(getCraftingTimedActionMultiplier({ 当前先天至宝: '万道神炉' }), 0.8);
  assert.equal(getCausalDebtMultiplier({ 当前先天至宝: '因果神灯' }), 0.75);
  assert.equal(getTribulationDamageMultiplier({ 当前先天至宝: '万劫天碑' }), 0.85);
});

test('万道开炉倍率只消费一次且过期时不生效', () => {
  const player = {
    当前先天至宝: '万道神炉',
    先天权柄: { 冷却: {}, 万道开炉待用: { multiplier: 3, expiresAt: 2000 } },
  };
  assert.equal(consumeAlchemyMultiplier(player, 1000), 3);
  assert.equal(consumeAlchemyMultiplier(player, 1000), 1);
  player.先天权柄.万道开炉待用 = { multiplier: 2, expiresAt: 999 };
  assert.equal(consumeAlchemyMultiplier(player, 1000), 1);
});

test('万劫淬神按当前上限增加10%且没有次数上限', () => {
  const player = { 元神: 0, 元神上限: 1000 };
  let expectedMax = 1000;
  for (let index = 0; index < 10; index++) {
    expectedMax += Math.max(1, Math.floor(expectedMax * 0.1));
    temperMyriadTribulationSpirit(player);
  }
  assert.equal(player.元神上限, expectedMax);
  assert.equal(player.元神, expectedMax);
  assert.equal(player.先天权柄.万劫淬神次数, 10);
  assert.match(INNATE_TREASURE_CATALOG.万劫天碑.authorities[0].effect, /10%.*次数不限/);
  assert.match(INNATE_TREASURE_CATALOG.因果神灯.authorities[0].effect, /40点因果债/);
  const authoritySource = fs.readFileSync(new URL('../apps/User/InnateTreasureAuthorities.js', import.meta.url), 'utf8');
  assert.match(authoritySource, /Math\.min\(40, Math\.max\(0, Number\(state\.causalDebt\)/);
});

test('太初首击对首领额外伤害封顶2%，无量首伤再执行减伤与封顶', () => {
  const attacker = { 名号: '持刃者', _太初仙刃首击倍率: 2.5 };
  const boss = { 名号: '首领', boss: true, 血量上限: 10_000, 当前血量: 10_000 };
  assert.equal(applyNewTreasureDamageRules(attacker, boss, 1000).damage, 1200);
  assert.equal(attacker._太初仙刃首击倍率, undefined);

  const defender = { 名号: '持尺者', _无量护身剩余: 3, _无量天尺首伤上限: 450 };
  assert.equal(applyNewTreasureDamageRules({}, defender, 1000).damage, 450);
  assert.equal(defender._无量护身剩余, 2);
  assert.equal(applyNewTreasureDamageRules({}, defender, 1000).damage, 800);
});

test('永恒改命保底气血元神并使用共享十日冷却', () => {
  const player = { 当前大道至宝: '永恒仙图', 当前血量: 0, 元神: 0, 修仙状态: '身灭道消' };
  assert.equal(tryEternalFateRewrite(player, 1000), true);
  assert.equal(player.当前血量, 1);
  assert.equal(player.元神, 1);
  assert.equal(player.修仙状态, '空闲');
  assert.equal(getCooldownRemaining(player, '永恒改命', 1000), 10 * 24 * 60 * 60 * 1000);
  assert.equal(tryEternalFateRewrite(player, 1001), false);
});

test('定海珠开场护盾与首次控制免疫按次数生效', () => {
  const holder = { 当前先天至宝: '定海珠', 血量上限: 1000, 当前血量: 1000, 护盾值: 50 };
  const passive = applyDinghaiBattleOpening(holder);
  assert.deepEqual(passive, { active: false, shield: 200, blockedOpeningControl: false });
  assert.equal(holder.护盾值, 250);
  assert.equal(consumeDinghaiControlImmunity(holder), true);
  assert.equal(consumeDinghaiControlImmunity(holder), false);

  const controlled = { 当前先天至宝: '定海珠', 血量上限: 1000, 当前血量: 1000, dongjie: true };
  assert.equal(applyDinghaiBattleOpening(controlled).blockedOpeningControl, true);
  assert.equal(controlled.dongjie, false);
  assert.equal(consumeDinghaiControlImmunity(controlled), false);
});

test('演化诸天在护盾破碎或三次行动时只反击一次', () => {
  const attacker = { 名号: '攻盾者', 当前血量: 10000, 血量上限: 10000 };
  const holder = { 当前先天至宝: '定海珠', 血量上限: 1000, 当前血量: 1000, 攻击: 100, 法球倍率: 2, _护盾值: 0 };
  assert.equal(applyDinghaiBattleOpening(holder, { active: true, shieldField: '_护盾值' }).shield, 500);
  holder._护盾值 -= 100;
  assert.equal(recordDinghaiShieldAbsorption(holder, attacker, 100).ended, false);
  assert.equal(tickDinghaiEvolution(holder).ended, false);
  assert.equal(tickDinghaiEvolution(holder).ended, false);
  const result = tickDinghaiEvolution(holder);
  assert.equal(result.damage, 80);
  assert.equal(attacker.当前血量, 9920);
  assert.equal(holder._护盾值, 0);
  assert.equal(tickDinghaiEvolution(holder).ended, false);
});

test('演化诸天反击同时受攻击法球上限与首领3%上限约束', () => {
  const boss = { 名号: '试炼首领', boss: true, 当前血量: 10000, 血量上限: 10000 };
  const holder = { 当前先天至宝: '定海珠', 血量上限: 1000, 当前血量: 1000, 攻击: 100, 法球倍率: 2, 护盾值: 0 };
  applyDinghaiBattleOpening(holder, { active: true });
  holder.护盾值 = 0;
  const result = recordDinghaiShieldAbsorption(holder, boss, 500);
  assert.equal(result.damage, 300);
  assert.equal(boss.当前血量, 9700);
  assert.equal(recordDinghaiShieldAbsorption(holder, boss, 500).damage, 0);
});
