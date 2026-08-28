import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  AUTHORITY_COOLDOWNS,
  CONTESTABLE_INNATE_TREASURE_NAMES,
  INNATE_TREASURE_CATALOG,
  INNATE_TREASURE_NAMES,
  applyInnateTravelReduction,
  buildInnateTreasureTransfer,
  createInnateTreasure,
  createInnateTreasureProjection,
  getCooldownRemaining,
  getHabitatSlotBonus,
  getInnerWorldOpenChance,
  getInnerWorldYieldMultiplier,
  getPetAbilityBonus,
  getPetTreasureRules,
  getTimedActionMultiplier,
  hasReincarnationProtection,
  migrateLegacyInnateTreasureSlot,
  startAuthorityCooldown,
  transferInnateTreasureAuthorityState,
  tryPanguShatterTalisman,
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
  assert.match(commandSource, /un_lock === '解锁' && equipment\.至宝\.大道至宝本体/);
  assert.match(commandSource, /equipment\.至宝\.islockd = un_lock === '锁定' \? 1 : 0/);
});

test('不同权柄使用独立冷却', () => {
  const player = {};
  startAuthorityCooldown(player, '混沌复制', 1000);
  assert.equal(getCooldownRemaining(player, '混沌复制', 1000), 12 * 60 * 60 * 1000);
  assert.equal(getCooldownRemaining(player, '混沌变幻', 1000), 0);
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
