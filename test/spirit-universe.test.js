import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  SPIRIT_HEART_ENTRY_COST,
  SPIRIT_HEART_RECOVERY_MS,
  consumeSpiritHeart,
  consumeSpiritHeartEntry,
  createSpiritJourney,
  getSpiritChoice,
  getSpiritHeartCost,
  getSpiritHeartMax,
  getSpiritInsightRequirement,
  getSpiritLegacyChance,
  getSpiritRetentionRate,
  increaseSpiritHeartLimit,
  mergeSpiritItemsIntoNajie,
  normalizeSpiritJourney,
  refreshSpiritHeart,
  resolveSpiritChoice,
  resolveSpiritGuardianBattle,
  retainSpiritFindings,
  shouldTriggerSpiritLegacy,
  validateSpiritPlaces,
} from '../model/spiritUniverse.js';

const places = JSON.parse(fs.readFileSync(
  new URL('../resources/data/item/精神宇宙.json', import.meta.url),
  'utf8'
));

test('精神位面层数、行动成本和掉落配置完整', () => {
  assert.equal(validateSpiritPlaces(places).length, 0);
  assert.equal(places.length, 9);

  for (const place of places) {
    const drops = new Set(place.layers.flatMap(layer => layer.drops.map(drop => drop.name)));
    for (const best of place.Best || []) {
      assert.ok(drops.has(best.replace(/^\[|\]$/g, '')), `${place.name}的珍品${best}必须真实存在`);
    }
  }
});

test('新神游状态带有有限节点、悟痕和待处理事件', () => {
  const place = places[0];
  const state = createSpiritJourney(place, '10001', place.entry_cost, 1234);
  assert.equal(state.layer_actions, 0);
  assert.equal(state.layer_insight, 0);
  assert.equal(state.pending_event, null);
  assert.equal(state.start_time, 1234);

  const migrated = normalizeSpiritJourney({ place_name: place.name, findings: [] });
  assert.equal(migrated.layer_actions, 0);
  assert.equal(migrated.max_layer_reached, 1);
});

test('三种抉择仅消耗元神且费用递增', () => {
  const layer = places[0].layers[0];
  const choices = [1, 2, 3].map(number => getSpiritChoice(number, layer));
  assert.deepEqual(choices.map(choice => choice.cost), [75000, 150000, 180000]);
  assert.deepEqual(choices.map(choice => choice.stabilityLoss), [undefined, undefined, undefined]);
});

test('心神只在入场消耗并按半小时恢复，上限由元神境界与永久成长组成', () => {
  const player = { yuanshenlevel_id: 2 };
  assert.deepEqual(refreshSpiritHeart(player, 1000), { current: 36, max: 36, recovered: 0 });
  assert.equal(consumeSpiritHeartEntry(player, 1000).ok, true);
  assert.equal(player.心神, 36 - SPIRIT_HEART_ENTRY_COST);
  assert.equal(refreshSpiritHeart(player, 1000 + SPIRIT_HEART_RECOVERY_MS * 2).current, 28);
  assert.equal(increaseSpiritHeartLimit(player, 5), 5);
  assert.equal(getSpiritHeartMax(player), 41);
});

test('其他副本可复用指定数值的心神扣除', () => {
  const player = { yuanshenlevel_id: 20, 心神: 80, 心神恢复时间: 1000 };
  const result = consumeSpiritHeart(player, 50, 1000);
  assert.equal(result.ok, true);
  assert.equal(player.心神, 30);
  assert.equal(consumeSpiritHeart(player, 50, 1000).ok, false);
  assert.equal(player.心神, 30);
});

test('命格能减少或增加心神消耗，且最低仍消耗1点', () => {
  assert.equal(getSpiritHeartCost(50, { 心神消耗减少: 0.3 }), 35);
  assert.equal(getSpiritHeartCost(50, { 心神消耗增加: 0.25 }), 63);
  assert.equal(getSpiritHeartCost(1, { 心神消耗减少: 0.99 }), 1);

  const player = { yuanshenlevel_id: 20, 心神: 80, 心神恢复时间: 1000 };
  const result = consumeSpiritHeart(player, 50, 1000, { 心神消耗减少: 0.3 });
  assert.deepEqual({ ok: result.ok, cost: result.cost, current: result.current }, {
    ok: true,
    cost: 35,
    current: 45,
  });
});

test('镇守稳定获得悟痕，悟道上限收益只跟行动成本相关', () => {
  const layer = places[0].layers[0];
  const steady = resolveSpiritChoice({ choiceNumber: 1, layer, random: () => 0 });
  assert.equal(steady.insightGain, 1);
  assert.equal(steady.currentYuanshenDelta, 15000);

  const expand = resolveSpiritChoice({ choiceNumber: 3, layer, random: () => 0.6 });
  assert.equal(expand.outcome, 'insight_expand');
  assert.equal(expand.finding.amount, 37500);
});

test('搜魂类加成提高寻宝率且任意层掉落都可被选中', () => {
  const layer = places[1].layers[1];
  const withoutBonus = resolveSpiritChoice({ choiceNumber: 2, layer, random: () => 0.7 });
  assert.equal(withoutBonus.outcome, 'treasure_empty');

  const values = [0.7, 0];
  let index = 0;
  const withBonus = resolveSpiritChoice({
    choiceNumber: 2,
    layer,
    shenyouBonus: 0.15,
    random: () => values[index++],
  });
  assert.equal(withBonus.outcome, 'treasure_found');
  assert.ok(layer.drops.some(drop => drop.name === withBonus.finding.name));

  for (const place of places) {
    for (const currentLayer of place.layers) {
      const result = resolveSpiritChoice({ choiceNumber: 2, layer: currentLayer, random: () => 0 });
      assert.equal(result.outcome, 'treasure_found', `${place.name}/${currentLayer.name}应能产出配置掉落`);
    }
  }
});

test('花粉蜕变经式深度加成减少悟痕要求', () => {
  assert.equal(getSpiritInsightRequirement(0), 2);
  assert.equal(getSpiritInsightRequirement(1), 1);
  assert.equal(getSpiritInsightRequirement(99), 1);
});

test('特殊传承随深度提升概率并在第十次参悟保底', () => {
  assert.equal(getSpiritLegacyChance(1, 5), 0.03);
  assert.equal(getSpiritLegacyChance(5, 5), 0.14);
  assert.equal(shouldTriggerSpiritLegacy(8, 0.03, () => 0.9), false);
  assert.equal(shouldTriggerSpiritLegacy(9, 0.03, () => 0.9), true);
});

test('守关战使用神识、元神攻防加成和已学攻防功法', () => {
  const place = places[0];
  const layer = place.layers[0];
  const base = {
    元神: 2_000_000,
    元神上限: 2_000_000,
    神识: 200_000,
    学习的功法: [],
    元神伤害加成: 0,
    元神伤害减免: 0,
  };
  const normal = resolveSpiritGuardianBattle({ player: base, place, layer });
  const trained = resolveSpiritGuardianBattle({
    player: { ...base, 学习的功法: ['劫运神拳', '元神盾'] },
    place,
    layer,
  });
  assert.equal(normal.won, true);
  assert.equal(trained.won, true);
  assert.ok(trained.yuanshenLost < normal.yuanshenLost);
  assert.equal(trained.attackSkill, '劫运神拳');
  assert.equal(trained.defenseSkill, '元神盾');
});

test('主动归位全保留，强制归位随深度降低保留率', () => {
  assert.equal(getSpiritRetentionRate(5, false), 1);
  assert.equal(getSpiritRetentionRate(1, true), 0.8);
  assert.equal(getSpiritRetentionRate(5, true), 0.2);

  const findings = [{ name: '甲' }, { name: '乙' }, { name: '丙' }];
  const values = [0.1, 0.6, 0.2];
  let index = 0;
  const kept = retainSpiritFindings(findings, 0.5, () => values[index++]);
  assert.deepEqual(kept.map(item => item.name), ['甲', '丙']);
});

test('归位物品可以写入新分类并与已有堆叠合并', () => {
  const najie = { 丹药: [{ name: '五蕴仙果', 数量: 2 }] };
  const catalog = places.flatMap(place => place.layers.flatMap(layer => layer.drops));
  const findings = [
    { kind: 'item', name: '五蕴仙果', class: '丹药' },
    { kind: 'item', name: '观照经残页', class: '材料' },
  ];
  assert.equal(mergeSpiritItemsIntoNajie(najie, findings, catalog), 2);
  assert.equal(najie.丹药[0].数量, 3);
  assert.equal(najie.材料[0].name, '观照经残页');
  assert.equal(najie.材料[0].数量, 1);
});
