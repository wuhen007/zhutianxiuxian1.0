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

test('岁云五阶段旧档默认装备并觉醒，零普通槽也可自由卸下与重新装备', () => {
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
    assert.throws(() => equipEndlessTreasure(player, ID), /已经装配/);
    const removed = unequipEndlessTreasure(player, '岁云剑尊');
    assert.equal(removed.intrinsic, true);
    assert.deepEqual(removed.equipped, []);
    assert.equal(removed.slots, 0);
    assert.equal(player.岁云无尽至宝已卸下, true);
    assert.deepEqual(getEquippedEndlessTreasures(player), []);
    assert.equal(getPlayerTreasureViews(player)[0].equipped, false);
    assert.deepEqual(normalizePlayerTreasures(player), [record(1)]);
    assert.throws(() => unequipEndlessTreasure(player, ID), /尚未装配/);
    const equipped = equipEndlessTreasure(player, '1');
    assert.equal(equipped.intrinsic, true);
    assert.deepEqual(equipped.equipped, []);
    assert.equal(equipped.slots, 0);
    assert.notEqual(player.岁云无尽至宝已卸下, true);
    assert.deepEqual(getEquippedEndlessTreasures(player), [record(1)]);
    assert.equal(getPlayerTreasureViews(player)[0].equipped, true);
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

test('普通槽首次装配跳过专属记录，满槽时剑尊仍能独立卸下与装备', () => {
  const player = { ...root(), 无尽至宝列表: [record(1), { id: 'treasure_decade', level: 1 }] };
  const loadout = normalizeEndlessTreasureLoadout(player);
  assert.equal(loadout.slots, 1);
  assert.deepEqual(loadout.equipped, ['treasure_decade']);
  assert.deepEqual(getEquippedEndlessTreasures(player).map(item => item.id), [ID, 'treasure_decade']);
  const removed = unequipEndlessTreasure(player, ID);
  assert.equal(removed.intrinsic, true);
  assert.equal(removed.slots, 1);
  assert.deepEqual(removed.equipped, ['treasure_decade']);
  assert.deepEqual(getEquippedEndlessTreasures(player).map(item => item.id), ['treasure_decade']);
  const equipped = equipEndlessTreasure(player, ID);
  assert.equal(equipped.intrinsic, true);
  assert.equal(equipped.slots, 1);
  assert.deepEqual(equipped.equipped, ['treasure_decade']);
  assert.deepEqual(getEquippedEndlessTreasures(player).map(item => item.id), [ID, 'treasure_decade']);
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

test('主动卸下经升级、存档重读、失去与重新获得灵根后仍保留选择和等级', () => {
  let player = { ...root(), 劫境道痕: 100_000, 无尽至宝列表: [record(4)] };
  unequipEndlessTreasure(player, ID);
  assert.equal(upgradeEndlessTreasure(player, ID).level, 5);
  assert.deepEqual(normalizePlayerTreasures(player), [record(5)]);
  assert.deepEqual(getEquippedEndlessTreasures(player), []);
  player = JSON.parse(JSON.stringify(player));
  assert.equal(getPlayerTreasureViews(player)[0].equipped, false);
  player.灵根 = { name: '凡体' };
  assert.deepEqual(normalizePlayerTreasures(player), []);
  assert.deepEqual(getEquippedEndlessTreasures(player), []);
  assert.throws(() => equipEndlessTreasure(player, ID), /未找到/);
  player = JSON.parse(JSON.stringify(player));
  player.灵根 = { name: '岁云化身' };
  assert.deepEqual(normalizePlayerTreasures(player), [record(5)]);
  assert.deepEqual(getEquippedEndlessTreasures(player), []);
  assert.equal(getPlayerTreasureViews(player)[0].equipped, false);
  equipEndlessTreasure(player, ID);
  player = JSON.parse(JSON.stringify(player));
  assert.deepEqual(getEquippedEndlessTreasures(player), [record(5)]);
  assert.equal(getPlayerTreasureViews(player)[0].equipped, true);
});

test('真实入场仅携带已装配剑尊的能力、加成和战技，局外切换不改变当前局快照', () => {
  const player = root();
  const enter = () => createEndlessRun({
    teamId: 'suiyun-loadout', groupId: 'loadout-fixture', seed: 20261019,
    players: [{ id: 'holder', player }],
  });
  const equippedRun = enter();
  const equippedMember = equippedRun.members.holder;
  assert.equal(equippedMember.abilities.treasure_suiyun_sword, 1);
  assert.equal(getTreasureEffects(equippedMember, equippedRun).attackPct, 9);
  assert.deepEqual(getTreasureBattleEntries(equippedMember, equippedRun), [SUIYUN_ENDLESS_COMBAT]);
  unequipEndlessTreasure(player, ID);
  assert.equal(getSuiyunTreasureCombat(equippedMember, equippedRun), SUIYUN_ENDLESS_COMBAT);
  const removedRun = enter();
  const removedMember = removedRun.members.holder;
  assert.deepEqual(removedMember.treasureIds, []);
  assert.equal(removedMember.abilities.treasure_suiyun_sword, undefined);
  assert.deepEqual(getTreasureEffects(removedMember, removedRun), {});
  assert.deepEqual(getTreasureBattleEntries(removedMember, removedRun), []);
  assert.equal(getSuiyunTreasureCombat(removedMember, removedRun), null);
  equipEndlessTreasure(player, ID);
  assert.deepEqual(removedMember.treasureIds, []);
  assert.equal(getSuiyunTreasureCombat(removedMember, removedRun), null);
  const restoredRun = enter();
  const restoredMember = restoredRun.members.holder;
  assert.deepEqual(restoredMember.treasureIds, [{ id: ID, level: 1 }]);
  assert.equal(restoredMember.abilities.treasure_suiyun_sword, 1);
  assert.deepEqual(getTreasureEffects(restoredMember, restoredRun), getTreasureEffects(equippedMember, equippedRun));
  assert.equal(getSuiyunTreasureCombat(restoredMember, restoredRun), SUIYUN_ENDLESS_COMBAT);
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

test('跨服化身序列化与还原保留主动卸下状态，重新装备后再传输恢复生效', () => {
  const player = { ...root(), 无尽至宝列表: [record(7)] };
  const restoreAvatar = () => hydrateCrossRaidAvatar(
    JSON.parse(JSON.stringify(createCrossRaidAvatar(player))),
    { serverId: 'suiyun-remote', memberTag: 'loadout-holder' }
  );
  const enter = owner => createEndlessRun({
    teamId: 'suiyun-cross-loadout', groupId: 'cross-fixture', seed: 20261019,
    players: [{ id: owner.id, player: owner }],
  });
  unequipEndlessTreasure(player, ID);
  assert.equal(createCrossRaidAvatar(player).岁云无尽至宝已卸下, true);
  const removed = restoreAvatar();
  assert.equal(removed.岁云无尽至宝已卸下, true);
  assert.deepEqual(normalizePlayerTreasures(removed), [record(7)]);
  assert.deepEqual(getEquippedEndlessTreasures(removed), []);
  assert.equal(getPlayerTreasureViews(removed)[0].equipped, false);
  const removedRun = enter(removed);
  const removedMember = removedRun.members[removed.id];
  assert.deepEqual(removedMember.treasureIds, []);
  assert.equal(removedMember.abilities.treasure_suiyun_sword, undefined);
  assert.deepEqual(getTreasureEffects(removedMember, removedRun), {});
  assert.equal(getSuiyunTreasureCombat(removedMember, removedRun), null);
  equipEndlessTreasure(player, ID);
  const equipped = restoreAvatar();
  assert.notEqual(equipped.岁云无尽至宝已卸下, true);
  assert.deepEqual(getEquippedEndlessTreasures(equipped), [record(7)]);
  const equippedRun = enter(equipped);
  assert.equal(getSuiyunTreasureCombat(equippedRun.members[equipped.id], equippedRun), SUIYUN_ENDLESS_COMBAT);
});
