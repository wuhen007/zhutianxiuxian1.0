import test from 'node:test';
import assert from 'node:assert/strict';
import { SUIYUN_STAGES } from '../model/suiyun.js';
import { getDailyEndlessCelestial } from '../model/endlessCelestial.js';
import { createEndlessRun } from '../model/endlessRealm.js';
import { createCrossRaidAvatar, hydrateCrossRaidAvatar } from '../apps/worldChat/raid.js';
import {
  ENDLESS_TREASURES,
  SUIYUN_ENDLESS_TREASURE_ID as ID,
  SUIYUN_ENDLESS_COMBAT,
  normalizePlayerTreasures,
  normalizeEndlessTreasureLoadout,
  getEquippedEndlessTreasures,
  getEndlessTreasureSlotCount,
  getPlayerTreasureViews,
  getTreasureStates,
  getTreasureEffects,
  getTreasureBattleEntries,
  getSuiyunTreasureCombat,
  equipEndlessTreasure,
  unequipEndlessTreasure,
  upgradeEndlessTreasure,
  grantRandomEndlessTreasure,
  grantRandomEndlessTierTreasure,
} from '../model/endlessTreasure.js';

const root = () => ({ 灵根: { name: '月华之体' } });
const record = level => ({ id: ID, name: '岁云剑尊', level });
const projection = player => ({ ...player, treasureIds: getEquippedEndlessTreasures(player), abilities: {} });

test('岁云五阶段灵根均自动拥有、自动觉醒，专属位不消耗普通槽', () => {
  for (const { name } of SUIYUN_STAGES) {
    const player = { 灵根: { name } };
    assert.deepEqual(normalizePlayerTreasures(player), [record(1)]);
    assert.deepEqual(normalizePlayerTreasures(player), [record(1)], '重复读取不重复授予');
    assert.equal(getEndlessTreasureSlotCount(player), 0);
    assert.deepEqual(normalizeEndlessTreasureLoadout(player).equipped, []);
    assert.deepEqual(getEquippedEndlessTreasures(player), [record(1)]);
    const member = projection(player);
    assert.equal(getTreasureStates(member, {})[0].awaken.active, true);
    assert.deepEqual(getTreasureBattleEntries(member, {}), [SUIYUN_ENDLESS_COMBAT]);
    assert.equal(getSuiyunTreasureCombat(member, {}), SUIYUN_ENDLESS_COMBAT);
    const [view] = getPlayerTreasureViews(player);
    assert.equal(view.boundRoot, 'suiyun');
    assert.equal(view.intrinsic, true);
    assert.equal(view.equipped, true);
    assert.match(view.awakenCondition, /开局自动觉醒/);
  }
});

test('非岁云、技能受赐、旧档伪造记录均无拥有、装配与战斗效果资格', () => {
  for (const player of [
    {},
    { 灵根: { name: '普通灵根' } },
    { 灵根: { name: '岁云剑尊赐福' } },
    { 岁云: { 已觉醒: true }, 月华传承: { 技能: ['霜剑入月', '岁云归一', '白云苍狗'] } },
  ]) {
    player.无尽至宝列表 = [record(10)];
    player.无尽至宝装配 = [ID];
    player.劫境道痕 = 100_000;
    assert.deepEqual(normalizePlayerTreasures(player), []);
    assert.deepEqual(getEquippedEndlessTreasures(player), []);
    assert.deepEqual(getPlayerTreasureViews(player), []);
    assert.equal(getEndlessTreasureSlotCount(player), 0);
    assert.throws(() => equipEndlessTreasure(player, ID), /未找到/);
    assert.throws(() => upgradeEndlessTreasure(player, ID), /未找到/);
    const forged = { ...player, treasureIds: [record(10)], abilities: { treasure_suiyun_sword: 10 } };
    assert.deepEqual(getTreasureStates(forged, {}), []);
    assert.deepEqual(getTreasureEffects(forged, {}), {});
    assert.deepEqual(getTreasureBattleEntries(forged, {}), []);
    assert.equal(getSuiyunTreasureCombat(forged, {}), null);
  }
});

test('普通槽首次装配跳过专属记录，满槽时仍保留剑尊生效', () => {
  const player = { ...root(), 无尽至宝列表: [record(1), { id: 'treasure_decade', level: 1 }] };
  const loadout = normalizeEndlessTreasureLoadout(player);
  assert.equal(loadout.slots, 1);
  assert.deepEqual(loadout.equipped, ['treasure_decade']);
  assert.deepEqual(getEquippedEndlessTreasures(player).map(item => item.id), [ID, 'treasure_decade']);
  assert.throws(() => equipEndlessTreasure(player, ID), /自动生效/);
  assert.throws(() => unequipEndlessTreasure(player, ID), /始终生效/);
  unequipEndlessTreasure(player, 'treasure_decade');
  assert.deepEqual(getEquippedEndlessTreasures(player), [record(1)]);
});

test('专属位旧装配记录不挤占普通槽，单独持有也不反推25层资格', () => {
  const player = { ...root(), 无尽至宝列表: [record(4)], 无尽至宝装配: [ID], 无尽至宝槽位: 3 };
  assert.equal(getEndlessTreasureSlotCount(player), 0);
  assert.deepEqual(normalizeEndlessTreasureLoadout(player).equipped, []);
  assert.deepEqual(getEquippedEndlessTreasures(player), [record(4)]);
});

test('剑尊沿用1000起、每级递增750的升级费用，等级上限10', () => {
  const player = { ...root(), 劫境道痕: 100_000 };
  for (let level = 1; level < 10; level++) {
    const result = upgradeEndlessTreasure(player, ID);
    assert.equal(result.cost, 1000 + (level - 1) * 750);
    assert.equal(result.level, level + 1);
  }
  assert.equal(normalizePlayerTreasures(player)[0].level, 10);
  assert.throws(() => upgradeEndlessTreasure(player, ID), /已经升至Lv\.10/);
});

test('失去灵根停用但保留等级，其他至宝升级及普通与特殊掉落不丢记录', () => {
  const player = { ...root(), 劫境道痕: 100_000, 无尽至宝列表: [record(8), { id: 'treasure_decade', level: 1 }] };
  delete player.灵根;
  assert.equal(normalizePlayerTreasures(player).some(item => item.id === ID), false);
  upgradeEndlessTreasure(player, 'treasure_decade');
  grantRandomEndlessTreasure(player, () => 0);
  grantRandomEndlessTierTreasure(player, 3, () => 0);
  assert.equal(player.无尽至宝列表.find(item => item.id === ID).level, 8);
  player.灵根 = { name: '岁云化身' };
  assert.equal(normalizePlayerTreasures(player).find(item => item.id === ID).level, 8);
  assert.equal(getEquippedEndlessTreasures(player).find(item => item.id === ID).level, 8);
});

test('剑尊不进入普通掉落与集齐后的升级抽签，也不进入特殊秘藏', () => {
  const regular = ENDLESS_TREASURES.filter(item => !item.dropTier && !item.boundRoot);
  for (let index = 0; index < regular.length; index++) {
    const player = root();
    assert.notEqual(grantRandomEndlessTreasure(player, () => (index + 0.5) / regular.length).treasure.id, ID);
  }
  const player = {
    ...root(),
    无尽至宝列表: regular.map(item => ({ id: item.id, level: 10 })),
  };
  assert.equal(grantRandomEndlessTreasure(player, () => 0.999), null);
  assert.equal(normalizePlayerTreasures(player).find(item => item.id === ID).level, 1);
  player.无尽至宝列表.find(item => item.id === regular[0].id).level = 1;
  assert.equal(grantRandomEndlessTreasure(player, () => 0.999).treasure.id, regular[0].id);
  for (let tier = 3; tier <= 10; tier++) {
    assert.notEqual(grantRandomEndlessTierTreasure(root(), tier, () => 0).treasure.id, ID);
  }
});

test('霜月领域抵御黯星封宝，但每次状态计算仍复核当前投影灵根', () => {
  const member = projection(root());
  const run = { celestialPhenomenon: { disabledTreasureIds: [ID, 'treasure_decade'] } };
  member.treasureIds.push({ id: 'treasure_decade', level: 10 });
  assert.equal(getTreasureStates(member, run).length, 1);
  assert.equal(getSuiyunTreasureCombat(member, run), SUIYUN_ENDLESS_COMBAT);
  member.灵根 = { name: '普通灵根' };
  assert.deepEqual(getTreasureStates(member, run), []);
  assert.equal(getSuiyunTreasureCombat(member, run), null);
});

test('剑尊Lv1攻血防均超过其他至宝Lv10完整基础与觉醒增益', () => {
  const effects = getTreasureEffects(projection(root()), {});
  assert.equal(effects.attackPct, 9);
  assert.equal(effects.hpPct, 6);
  assert.equal(effects.defensePct, 6);
  for (const treasure of ENDLESS_TREASURES.filter(item => item.id !== ID)) {
    for (const stat of ['attackPct', 'hpPct', 'defensePct']) {
      const maxEffect = ((treasure.baseEffect?.[stat] || 0) +
        (treasure.awaken?.effect?.[stat] || 0) +
        (treasure.stages || []).reduce((sum, stage) => sum + (stage.effect?.[stat] || 0), 0)) * 1.85;
      assert.ok(effects[stat] > maxEffect, `${treasure.name}的${stat}应低于岁云剑尊`);
    }
  }
  const maxed = projection({ ...root(), 无尽至宝列表: [record(10)] });
  assert.ok(Math.abs(getTreasureEffects(maxed, {}).attackPct - 33.3) < 1e-9);
});

test('剑尊战技参数包含15连斩、真实无视防御、全额吸血与第8斩因果裁决', () => {
  assert.deepEqual(SUIYUN_ENDLESS_COMBAT, {
    type: 'suiyunSword', label: '岁云剑尊·霜月裁天', damagePct: 24,
    comboChance: 0.85, continuationChance: 0.9, maxHits: 15,
    overlimitChance: 0.55, overlimitRounds: 3, overlimitMultiplier: 2.5,
    futureSightChance: 0.65, reflectMultiplier: 2,
    causalAfterHits: 7, causalExecuteChance: 0.35,
    lifestealPct: 1, trueDefenseIgnore: true,
  });
});

test('全年365天天象中的黯星始终封禁两件不同旧至宝，不抽取灵根专属', () => {
  const originalTreasures = ENDLESS_TREASURES.filter(treasure => !treasure.intrinsic);
  const originalIds = new Set(originalTreasures.map(treasure => treasure.id));
  assert.equal(originalIds.size, 29);
  const start = Date.UTC(2026, 0, 1, 4);
  let sealedDays = 0;
  for (let day = 0; day < 365; day++) {
    const celestial = getDailyEndlessCelestial(new Date(start + day * 86_400_000));
    if (celestial.id !== 'sealed_treasures') continue;
    sealedDays++;
    assert.equal(celestial.disabledTreasureIds.length, 2, celestial.dateKey);
    assert.equal(new Set(celestial.disabledTreasureIds).size, 2, celestial.dateKey);
    assert.equal(celestial.disabledTreasureNames.length, 2, celestial.dateKey);
    for (const treasureId of celestial.disabledTreasureIds) {
      assert.ok(originalIds.has(treasureId), `${celestial.dateKey}只能封禁原有至宝`);
      assert.notEqual(treasureId, ID);
    }
  }
  assert.ok(sealedDays > 0, '扫描必须覆盖实际黯星日期');
});

test('真实跨服化身序列化与还原后，五阶段灵根及专属等级带入劫境，普通灵根伪造记录失效', () => {
  for (const [index, stage] of SUIYUN_STAGES.entries()) {
    const level = index + 6;
    const ownerSource = { id: 'original-owner', 灵根: { name: stage.name }, 无尽至宝列表: [record(level)] };
    const forgedSource = { id: 'ordinary-owner', 灵根: { name: '凡体' }, 无尽至宝列表: [record(10)], 无尽至宝装配: [ID] };
    const restoreAvatar = (source, memberTag) => hydrateCrossRaidAvatar(
      JSON.parse(JSON.stringify(createCrossRaidAvatar(source))),
      { serverId: 'suiyun-remote', serverName: '岁云远服', memberTag }
    );
    const owner = restoreAvatar(ownerSource, `holder-${index}`);
    const forged = restoreAvatar(forgedSource, `ordinary-${index}`);
    assert.equal(owner._跨服化身, true);
    assert.deepEqual(owner.灵根, ownerSource.灵根);
    assert.equal(owner.无尽至宝列表.find(treasure => treasure.id === ID).level, level);
    assert.equal(forged.无尽至宝列表.find(treasure => treasure.id === ID).level, 10);
    const run = createEndlessRun({
      teamId: `suiyun-cross-${index}`, groupId: 'cross-fixture', seed: 20261018,
      players: [{ id: owner.id, player: owner }, { id: forged.id, player: forged }],
    });
    const member = run.members[owner.id];
    assert.deepEqual(member.灵根, { name: stage.name });
    assert.equal(member.treasureIds.find(treasure => treasure.id === ID).level, level);
    assert.equal(getSuiyunTreasureCombat(member, run), SUIYUN_ENDLESS_COMBAT);
    assert.ok(Math.abs(getTreasureEffects(member, run).attackPct - 18 * (0.5 + (level - 1) * 0.15)) < 1e-9);
    const ordinary = run.members[forged.id];
    assert.deepEqual(ordinary.灵根, { name: '凡体' });
    assert.equal(ordinary.treasureIds.some(treasure => treasure.id === ID), false);
    assert.equal(ordinary.abilities.treasure_suiyun_sword, undefined);
    assert.equal(getSuiyunTreasureCombat(ordinary, run), null);
    assert.deepEqual(getTreasureEffects(ordinary, run), {});
  }
});
