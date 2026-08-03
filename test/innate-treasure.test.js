import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTHORITY_COOLDOWNS,
  CONTESTABLE_INNATE_TREASURE_NAMES,
  INNATE_TREASURE_CATALOG,
  INNATE_TREASURE_NAMES,
  applyInnateTravelReduction,
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
  startAuthorityCooldown,
} from '../model/innateTreasure.js';

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

test('先天至宝实体绑定唯一主人并使用帝兵槽', () => {
  const treasure = createInnateTreasure('混沌珠', '10001', 1234);
  assert.equal(treasure.type, '帝兵');
  assert.equal(treasure.品阶, '先天至宝');
  assert.equal(treasure.author_name, '10001');
  assert.equal(treasure.绑定者, '10001');
  assert.equal(treasure.认主时间, 1234);
});

test('择主榜第二三名获得有明确期限的七日投影', () => {
  const projection = createInnateTreasureProjection('太极图', '10002', 1000);
  assert.equal(projection.name, '太极图·七日投影');
  assert.equal(projection.先天至宝本体, '太极图');
  assert.equal(projection.绑定者, '10002');
  assert.equal(projection.先天投影截止, 1000 + 7 * 24 * 60 * 60 * 1000);
});

test('不同权柄使用独立冷却', () => {
  const player = {};
  startAuthorityCooldown(player, '混沌复制', 1000);
  assert.equal(getCooldownRemaining(player, '混沌复制', 1000), 12 * 60 * 60 * 1000);
  assert.equal(getCooldownRemaining(player, '混沌变幻', 1000), 0);
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
