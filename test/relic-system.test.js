import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  FISH_KING_RELIC_QUALITY_WEIGHTS,
  FISH_KING_RELIC_SETS,
  MAX_RELIC_BAG_SIZE,
  RELIC_FRAGMENT_RULES,
  RELIC_QUALITIES,
  RELIC_SETS,
  addRelicToBag,
  applyRelicBattleOpening,
  applyRelicEffectsToPlayer,
  calculateRelicEffects,
  createEmptyRelicState,
  createFishKingRelic,
  createRelic,
  dismantleRelics,
  engraveRelic,
  expandRelicSlot,
  getActiveRelicResonances,
  normalizeRelicState,
  removeEngravedRelic,
  rollFishKingRelicQuality,
  synthesizeRelics,
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

test('旧档补齐碎片，异常余额归零，正常余额与遗珍状态持久化往返保持一致', () => {
  assert.equal(createEmptyRelicState().碎片, 0);
  assert.equal(normalizeRelicState(undefined).碎片, 0);
  for (const value of [undefined, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, '异常']) {
    assert.equal(normalizeRelicState({ 碎片: value }).碎片, 0);
  }
  assert.equal(normalizeRelicState({ 碎片: '17' }).碎片, 17);
  assert.equal(normalizeRelicState({ 碎片: Number.MAX_SAFE_INTEGER }).碎片, Number.MAX_SAFE_INTEGER);
  let state = createEmptyRelicState();
  state.碎片 = 123;
  state = expandRelicSlot(state, '武器');
  state = addRelicToBag(state, relic('engraved', '荒古战血'));
  state = engraveRelic(state, 1, '武器', 2).state;
  state = addRelicToBag(state, relic('bag', '万法天章'));
  const equipment = JSON.parse(JSON.stringify({ 遗珍: state }));
  assert.deepEqual(normalizeRelicState(equipment.遗珍), state);
  assert.equal(removeEngravedRelic(state, '武器', 2).state.碎片, 123);
  assert.equal(engraveRelic(state, 1, '护具').state.碎片, 123);
});

test('五档品质分解与定向合成兑换准确，规则冻结且往返不产生套利', () => {
  assert.ok(Object.isFrozen(RELIC_FRAGMENT_RULES));
  assert.deepEqual(Object.values(RELIC_FRAGMENT_RULES).map(rule => [rule.salvage, rule.synthesis]), [
    [1, 10], [3, 30], [10, 100], [30, 300], [100, 1000],
  ]);
  for (const [quality, rule] of Object.entries(RELIC_FRAGMENT_RULES)) {
    assert.ok(Object.isFrozen(rule));
    const state = createEmptyRelicState();
    state.碎片 = rule.synthesis;
    const snapshot = structuredClone(state);
    const synthesized = synthesizeRelics(state, { quality, setName: '阴阳道图', random: () => 0 });
    assert.deepEqual(state, snapshot);
    assert.equal(synthesized.cost, rule.synthesis);
    assert.equal(synthesized.state.碎片, 0);
    assert.equal(synthesized.relics.length, 1);
    assert.equal(synthesized.relics[0].品质, quality);
    assert.equal(synthesized.relics[0].套装, '阴阳道图');
    assert.equal(synthesized.relics[0].副词条.length, RELIC_QUALITIES[quality].affixCount);
    const dismantled = dismantleRelics(synthesized.state, [synthesized.relics[0].id]);
    assert.equal(dismantled.fragments, rule.salvage);
    assert.equal(dismantled.state.碎片, rule.salvage);
    assert.equal(dismantled.state.背包.length, 0);
    assert.ok(dismantled.state.碎片 < state.碎片);
  }
});

test('按稳定 ID 批量分解只移除选择项，不改变源状态或已铭刻遗珍', () => {
  const state = createEmptyRelicState();
  state.背包 = ['a', 'b', 'c'].map(id => relic(id, '玄黄不灭'));
  state.铭刻.武器[0] = relic('engraved', '荒古战血');
  state.碎片 = 7;
  const snapshot = structuredClone(state);
  const result = dismantleRelics(state, ['c', 'a']);
  assert.deepEqual(result.relics.map(item => item.id), ['c', 'a']);
  assert.deepEqual(result.state.背包.map(item => item.id), ['b']);
  assert.deepEqual(result.state.铭刻, state.铭刻);
  assert.equal(result.fragments, 200);
  assert.equal(result.state.碎片, 207);
  assert.deepEqual(state, snapshot);
});

test('分解的空、重复、缺失、已铭刻选择整批失败，歧义 ID 也不会误分解', () => {
  const state = createEmptyRelicState();
  state.背包 = [relic('bag', '玄黄不灭')];
  state.铭刻.武器[0] = relic('engraved', '荒古战血');
  const snapshot = structuredClone(state);
  for (const ids of [undefined, [], 'bag', [1], [''], [' '], ['bag', 'bag'], ['bag', 'missing'], ['bag', 'engraved']]) {
    assert.throws(() => dismantleRelics(state, ids));
    assert.deepEqual(state, snapshot);
  }
  state.背包.push(relic('bag', '万法天章'));
  const duplicateSnapshot = structuredClone(state);
  assert.throws(() => dismantleRelics(state, ['bag']), /ID 重复/);
  assert.deepEqual(state, duplicateSnapshot);
  state.背包 = [relic('engraved', '玄黄不灭')];
  assert.throws(() => dismantleRelics(state, ['engraved']), /已铭刻/);
  state.铭刻.法宝[1] = relic('locked-slot', '玄黄不灭');
  assert.throws(() => dismantleRelics(state, ['locked-slot']), /已铭刻/);
});

test('分解碎片余额溢出时原子失败，安全整数上界仍可正常结算', () => {
  const state = createEmptyRelicState();
  state.背包 = [relic('bag', '荒古战血')];
  state.碎片 = Number.MAX_SAFE_INTEGER;
  const snapshot = structuredClone(state);
  assert.throws(() => dismantleRelics(state, ['bag']), /超出上限/);
  assert.deepEqual(state, snapshot);
  state.碎片 -= 100;
  assert.equal(dismantleRelics(state, ['bag']).state.碎片, Number.MAX_SAFE_INTEGER);
});

test('所有套装均支持指定品质批量合成，生成独立 ID 与完整副词条', () => {
  for (const setName of Object.keys(RELIC_SETS)) {
    const state = createEmptyRelicState();
    state.碎片 = 300;
    const result = synthesizeRelics(state, { setName, quality: '至圣', count: 3, random: () => 0.5 });
    assert.equal(result.cost, 300);
    assert.equal(result.state.碎片, 0);
    assert.equal(result.state.背包.length, 3);
    assert.equal(new Set(result.relics.map(item => item.id)).size, 3);
    assert.ok(result.relics.every(item => item.套装 === setName && item.品质 === '至圣' && item.副词条.length === 3));
    assert.equal(state.背包.length, 0);
    assert.equal(state.碎片, 300);
  }
});

test('合成品质套装及数量严格校验，拒绝原型属性且校验失败前不抽取遗珍', () => {
  const state = createEmptyRelicState();
  state.碎片 = 10000;
  const snapshot = structuredClone(state);
  let randomCalls = 0;
  const options = { setName: '荒古战血', quality: '凡耀', random: () => { randomCalls++; return 0; } };
  for (const count of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, 201, '1', null]) {
    assert.throws(() => synthesizeRelics(state, { ...options, count }), /合成数量/);
  }
  for (const quality of ['constructor', '__proto__', 'toString', '不存在', null, ['凡耀']]) {
    assert.throws(() => synthesizeRelics(state, { ...options, quality }), /未知遗珍品质/);
    assert.throws(() => createRelic({ ...options, quality }), /未知遗珍品质/);
  }
  for (const setName of ['constructor', '__proto__', 'toString', '不存在', null, ['荒古战血']]) {
    assert.throws(() => synthesizeRelics(state, { ...options, setName }), /未知遗珍套装/);
    assert.throws(() => createRelic({ ...options, setName }), /未知遗珍套装/);
  }
  assert.throws(() => synthesizeRelics(state));
  assert.throws(() => synthesizeRelics(state, { ...options, random: 0 }), /随机数/);
  assert.equal(randomCalls, 0);
  assert.deepEqual(state, snapshot);
  assert.equal(normalizeRelicState({ 背包: [
    { ...relic('a', '荒古战血'), 品质: 'constructor' },
    relic('b', '__proto__'),
  ] }).背包.length, 0);
});

test('余额不足或批量生成途中异常时不扣碎片、不部分添加遗珍', () => {
  const state = createEmptyRelicState();
  state.碎片 = 19;
  const snapshot = structuredClone(state);
  let randomCalls = 0;
  assert.throws(() => synthesizeRelics(state, {
    setName: '荒古战血', quality: '凡耀', count: 2,
    random: () => { randomCalls++; return 0; },
  }), /碎片不足/);
  assert.equal(randomCalls, 0);
  assert.deepEqual(state, snapshot);
  state.碎片 = 20;
  const fundedSnapshot = structuredClone(state);
  assert.throws(() => synthesizeRelics(state, {
    setName: '荒古战血', quality: '凡耀', count: 2,
    random: () => {
      if (++randomCalls === 3) throw new Error('随机源中断');
      return 0;
    },
  }), /随机源中断/);
  assert.deepEqual(state, fundedSnapshot);
});

test('满包可分解释放空位再合成，空位不足整批失败且最大批量为 200 件', () => {
  const state = createEmptyRelicState();
  state.背包 = Array.from({ length: MAX_RELIC_BAG_SIZE }, (_, index) => relic(`bag-${index}`, '玄黄不灭'));
  state.碎片 = 1000;
  const snapshot = structuredClone(state);
  const options = { setName: '荒古战血', quality: '凡耀', count: 2, random: () => 0 };
  assert.throws(() => synthesizeRelics(state, options), /空位不足/);
  assert.deepEqual(state, snapshot);
  const dismantled = dismantleRelics(state, ['bag-0', 'bag-199']);
  assert.equal(dismantled.state.背包.length, 198);
  const synthesized = synthesizeRelics(dismantled.state, options);
  assert.equal(synthesized.state.背包.length, MAX_RELIC_BAG_SIZE);
  assert.equal(synthesized.state.碎片, 1180);
  const empty = createEmptyRelicState();
  empty.碎片 = 2000;
  const maximum = synthesizeRelics(empty, { ...options, count: MAX_RELIC_BAG_SIZE });
  assert.equal(maximum.relics.length, MAX_RELIC_BAG_SIZE);
  assert.equal(maximum.state.碎片, 0);
});

test('已分解奖励台账兼容旧档，只保留两类来源 ID，去重且无固定截断', () => {
  assert.deepEqual(createEmptyRelicState().已分解奖励, []);
  assert.deepEqual(normalizeRelicState({}).已分解奖励, []);
  assert.deepEqual(normalizeRelicState({ 已分解奖励: 'foreign-relic:old' }).已分解奖励, []);
  const ids = Array.from({ length: 501 }, (_, index) => `fish-king-relic:old-${index}`);
  ids.push('foreign-relic:old');
  const state = normalizeRelicState({ 已分解奖励: [
    ...ids, ids[0], 'foreign-relic:old', '', null, 1, {}, 'ordinary-uuid', 'foreign-relic:', 'foreign-relic: ',
  ] });
  assert.deepEqual(state.已分解奖励, ids);
  assert.deepEqual(normalizeRelicState(JSON.parse(JSON.stringify(state))), state);
});

test('升级前到账奖励分解后原子记录，持久化重试发放不再生成遗珍或碎片', () => {
  const rewards = [
    relic('fish-king-relic:old:player:first', '荒古战血'),
    relic('foreign-relic:old-event', '玄黄不灭'),
  ];
  const oldState = { 背包: rewards, 碎片: 5 };
  const snapshot = structuredClone(oldState);
  const result = dismantleRelics(oldState, rewards.map(item => item.id));
  assert.deepEqual(oldState, snapshot);
  assert.equal(result.fragments, 200);
  assert.equal(result.state.碎片, 205);
  assert.deepEqual(result.state.已分解奖励, rewards.map(item => item.id));
  let persisted = normalizeRelicState(JSON.parse(JSON.stringify(result.state)));
  for (let retry = 0; retry < 3; retry++) {
    for (const reward of rewards) persisted = addRelicToBag(persisted, reward);
    assert.equal(persisted.背包.length, 0);
    assert.equal(persisted.碎片, 205);
    assert.deepEqual(persisted.已分解奖励, result.state.已分解奖励);
  }
  const failedState = { ...oldState, 碎片: Number.MAX_SAFE_INTEGER };
  const failedSnapshot = structuredClone(failedState);
  assert.throws(() => dismantleRelics(failedState, [rewards[0].id]), /超出上限/);
  assert.deepEqual(failedState, failedSnapshot);
});

test('已分解奖励重试优先于满包检查，普通 UUID 和合成遗珍不写奖励台账', () => {
  const reward = relic('fish-king-relic:old:player:first', '荒古战血');
  let state = dismantleRelics({ 背包: [reward] }, [reward.id]).state;
  state.背包 = Array.from({ length: MAX_RELIC_BAG_SIZE }, (_, index) => relic(`ordinary-${index}`, '玄黄不灭'));
  const fullSnapshot = structuredClone(state);
  assert.deepEqual(addRelicToBag(state, reward), state);
  assert.deepEqual(state, fullSnapshot);
  assert.throws(() => addRelicToBag(state, relic('foreign-relic:new', '玄黄不灭')), /已满/);
  state = dismantleRelics(state, ['ordinary-0', 'ordinary-1']).state;
  const synthesized = synthesizeRelics(state, { setName: '荒古战血', quality: '凡耀', random: () => 0 });
  state = dismantleRelics(synthesized.state, synthesized.relics.map(item => item.id)).state;
  assert.deepEqual(state.已分解奖励, [reward.id]);
  assert.deepEqual(normalizeRelicState(JSON.parse(JSON.stringify(state))).已分解奖励, [reward.id]);
});
