import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  FISH_KING_RELIC_QUALITY_WEIGHTS,
  FISH_KING_RELIC_SETS,
  RELIC_QUALITIES,
  RELIC_SETS,
  addRelicToBag,
  applyRelicBattleOpening,
  applyRelicEffectsToPlayer,
  calculateRelicEffects,
  createEmptyRelicState,
  createFishKingRelic,
  createRelic,
  engraveRelic,
  expandRelicSlot,
  getActiveRelicResonances,
  normalizeRelicState,
  removeEngravedRelic,
  rollFishKingRelicQuality,
} from '../model/relicSystem.js';

function relic(id, setName, affixes = [{ name: '迅行', value: 0.02 }]) {
  return {
    id,
    name: `${setName}遗珍`,
    品质: '超脱',
    套装: setName,
    副词条: affixes,
    获得时间: 1,
  };
}

test('五档品质分别生成一至五条不重复副词条', () => {
  for (const [quality, config] of Object.entries(RELIC_QUALITIES)) {
    const result = createRelic({
      quality,
      setName: '荒古战血',
      random: () => 0.5,
      id: quality,
    });
    assert.equal(result.副词条.length, config.affixCount);
    assert.equal(new Set(result.副词条.map(item => item.name)).size, config.affixCount);
  }
});

test('鱼王遗珍品质概率、位面套装与仙域随机套装符合设定', () => {
  assert.equal(FISH_KING_RELIC_QUALITY_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0), 1);
  assert.ok(Object.values(FISH_KING_RELIC_SETS).every(setName => RELIC_SETS[setName]));
  assert.deepEqual([
    rollFishKingRelicQuality(() => 0),
    rollFishKingRelicQuality(() => 0.5),
    rollFishKingRelicQuality(() => 0.78),
    rollFishKingRelicQuality(() => 0.93),
    rollFishKingRelicQuality(() => 0.99),
  ], ['凡耀', '灵玄', '至圣', '大道', '超脱']);
  const mortal = createFishKingRelic({ plane: '凡间', random: () => 0, id: 'mortal' });
  assert.equal(mortal.套装, FISH_KING_RELIC_SETS.凡间);
  assert.equal(mortal.品质, '凡耀');
  const immortalDomain = createFishKingRelic({ plane: '仙域', random: () => 0, id: 'domain' });
  assert.ok(immortalDomain.套装);
  assert.equal(immortalDomain.副词条.length, 1);
});

test('旧装备存档会补齐三部位铭刻位且未拓展的第二槽不能使用', () => {
  let state = normalizeRelicState(undefined);
  assert.deepEqual(Object.keys(state.铭刻), ['武器', '护具', '法宝']);
  state = addRelicToBag(state, relic('a', '荒古战血'));
  assert.throws(() => engraveRelic(state, 1, '武器', 2), /尚未拓展/);

  state = expandRelicSlot(state, '武器');
  const engraved = engraveRelic(state, 1, '武器', 2);
  assert.equal(engraved.state.铭刻.武器[1].id, 'a');
  assert.equal(engraved.state.背包.length, 0);

  const removed = removeEngravedRelic(engraved.state, '武器', 2);
  assert.equal(removed.state.铭刻.武器[1], null);
  assert.equal(removed.state.背包[0].id, 'a');
});

test('替换已有铭刻时旧遗珍回到背包且不会复制', () => {
  let state = createEmptyRelicState();
  state = addRelicToBag(state, relic('old', '荒古战血'));
  state = engraveRelic(state, 1, '武器').state;
  state = addRelicToBag(state, relic('next', '万法天章'));
  const result = engraveRelic(state, 1, '武器');
  assert.equal(result.state.铭刻.武器[0].id, 'next');
  assert.deepEqual(result.state.背包.map(item => item.id), ['old']);
});

test('三件同套必须横跨武器护具法宝才激活且同套只共鸣一次', () => {
  const state = createEmptyRelicState();
  state.拓展 = { 武器: true, 护具: true, 法宝: true };
  state.铭刻.武器 = [relic('a1', '荒古战血'), relic('a2', '荒古战血')];
  state.铭刻.护具 = [relic('a3', '荒古战血'), null];
  assert.deepEqual(getActiveRelicResonances(state), []);
  state.铭刻.法宝 = [relic('a4', '荒古战血'), null];
  assert.deepEqual(getActiveRelicResonances(state), ['荒古战血']);
});

test('六个铭刻位可以同时组成两套不同共鸣', () => {
  const state = createEmptyRelicState();
  state.拓展 = { 武器: true, 护具: true, 法宝: true };
  for (const [index, part] of ['武器', '护具', '法宝'].entries()) {
    state.铭刻[part] = [
      relic(`a${index}`, '荒古战血'),
      relic(`b${index}`, '玄黄不灭'),
    ];
  }
  assert.deepEqual(getActiveRelicResonances(state), ['荒古战血', '玄黄不灭']);
  const summary = calculateRelicEffects(state);
  assert.equal(summary.resonances.length, 2);
  assert.ok(summary.effects.近战伤害加成 >= 0.12);
  assert.ok(summary.effects.开战护盾率 >= 0.15);
});

test('遗珍属性重复应用不会累加且速度、抗性与暴击正确撤旧加新', () => {
  const state = createEmptyRelicState();
  state.铭刻.武器[0] = relic('x', '虚空行者', [
    { name: '迅行', value: 0.04 },
    { name: '洞虚', value: 0.02 },
    { name: '破法', value: 0.03 },
  ]);
  state.铭刻.护具[0] = relic('y', '虚空行者', [{ name: '武极', value: 0.03 }]);
  state.铭刻.法宝[0] = relic('z', '虚空行者', [{ name: '万法', value: 0.03 }]);
  const player = { 速度: 100, 暴击率: 0.1, 暴击伤害: 1.5, 神通伤害减免: 0.05 };
  applyRelicEffectsToPlayer(player, state);
  const first = { ...player };
  applyRelicEffectsToPlayer(player, state);
  assert.equal(player.速度, first.速度);
  assert.equal(player.暴击率, first.暴击率);
  assert.equal(player.神通伤害减免, first.神通伤害减免);
  assert.equal(player.速度, 112, '迅行4%与虚空行者8%共计12%');
  assert.ok(Math.abs(player.暴击率 - 0.12) < 1e-9);
  assert.ok(Math.abs(player.神通伤害减免 - 0.08) < 1e-9);
});

test('开战护盾按生命上限生成且同一场战斗只应用一次', () => {
  const player = { 名号: '测试修士', 血量上限: 1000, 遗珍开战护盾率: 0.2, 护盾值: 50 };
  const first = applyRelicBattleOpening(player);
  const second = applyRelicBattleOpening(player);
  assert.equal(first.amount, 200);
  assert.equal(player.护盾值, 250);
  assert.equal(second.amount, 0);
});

test('界纹拓印已登记为不可交易的九级道具', () => {
  const items = JSON.parse(fs.readFileSync(
    new URL('../resources/data/item/道具列表.json', import.meta.url),
    'utf8',
  ));
  const item = items.find(entry => entry.name === '界纹拓印');
  assert.equal(item?.type, '遗珍拓展');
  assert.equal(item?.不可交易, true);
  assert.equal(item?.稀有度, 9);
});
