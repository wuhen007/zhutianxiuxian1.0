import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  STONE_GARDENS,
  STONE_KING_CONFIG,
  calculateBlindReturn,
  createStoneKingState,
  createStoneMarketState,
  getLayeredPreview,
  getStoneWeekKey,
  inspectStone,
  resolveStoneCut,
  resolveStoneKing,
  useHeavenlyCheck,
} from '../apps/Game/stoneMarketRules.js';
import { SOURCE_STONE_FORMS } from '../apps/Game/sourceStoneForms.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function seededRandom(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

test('三座石园的盲选平均回报均控制在80%至85%', () => {
  for (const garden of STONE_GARDENS) {
    const ratio = calculateBlindReturn(garden.id);
    assert.ok(ratio >= 0.8 && ratio <= 0.85, `${garden.name}: ${ratio}`);
    const totalWeight = garden.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
    const jackpot = garden.outcomes.find(outcome => outcome.id === 'scripture_page');
    if (jackpot) {
      const jackpotContribution = jackpot.weight * jackpot.ratio / totalWeight / ratio;
      assert.ok(jackpotContribution <= 0.15);
    }
  }
});

test('每日三园各从扩充石池随机生成五块且不会包含镇园石王', () => {
  const state = createStoneMarketState({}, {
    now: new Date('2026-07-28T12:00:00+08:00'),
    random: seededRandom(7),
  });
  const formNames = new Set(SOURCE_STONE_FORMS.map(form => form.name));

  assert.equal(state.dateKey, '2026-07-28');
  assert.ok(formNames.size >= 18);
  assert.ok(!formNames.has('魔胎'));
  assert.ok(!formNames.has('九窍石人'));
  for (const garden of STONE_GARDENS) {
    const stones = state.gardens[garden.id].stones;
    assert.equal(stones.length, 5);
    assert.equal(new Set(stones.map(stone => stone.name)).size, 5);
    assert.ok(stones.every(stone => formNames.has(stone.name)));
    assert.ok(stones.every(stone => stone.surfaces.length === 2));
  }
});

test('每批只能勘验两块且源术职业获得更多信息', () => {
  const ordinaryState = createStoneMarketState({}, { random: seededRandom(11) });
  const first = inspectStone(ordinaryState, 'outer', 1, {}, { random: seededRandom(12) });
  assert.equal(first.lines.length, 1);
  inspectStone(ordinaryState, 'outer', 2, {}, { random: seededRandom(13) });
  assert.throws(
    () => inspectStone(ordinaryState, 'outer', 3, {}, { random: seededRandom(14) }),
    /两次勘石机会/
  );

  const masterState = createStoneMarketState({}, { random: seededRandom(21) });
  const master = inspectStone(
    masterState,
    'sky',
    1,
    { occupation: '源天师', occupation_level: 999 },
    { random: seededRandom(22) }
  );
  assert.equal(master.accuracy, 0.85);
  assert.ok(master.lines.some(line => line.startsWith('价值判断：')));
  assert.ok(master.lines.some(line => line.startsWith('地势判断：')));
  assert.ok(master.lines.some(line => line.startsWith('凶机判断：')));
});

test('连续五次空石只提高下一批线索清晰度', () => {
  const normalState = createStoneMarketState({}, { random: seededRandom(31) });
  const state = createStoneMarketState(
    { 源石坊连续空石: 5 },
    { random: seededRandom(31) }
  );
  const result = inspectStone(state, 'outer', 1, {}, { random: seededRandom(32) });
  assert.equal(result.accuracy, 0.65);
  assert.deepEqual(
    state.gardens.outer.stones.map(stone => stone.outcome.id),
    normalState.gardens.outer.stones.map(stone => stone.outcome.id)
  );
});

test('源天师每日只能辨伪一次且不会直接显示完整答案', () => {
  const state = createStoneMarketState({}, { random: seededRandom(41) });
  const player = { occupation: '源天师' };
  const message = useHeavenlyCheck(state, 'ground', 1, player);
  assert.doesNotMatch(message, /切石结果/);
  assert.throws(() => useHeavenlyCheck(state, 'ground', 2, player), /已经用过/);
  const ordinaryState = createStoneMarketState({}, { random: seededRandom(42) });
  assert.throws(() => useHeavenlyCheck(ordinaryState, 'ground', 1, {}), /只有源天师/);
});

test('一刀切会损伤脆弱仙珍，剥石可保全，封源可压制凶源', () => {
  const fragile = {
    price: 1000000,
    outcome: {
      id: 'herb_king', name: '八万年药王', fragile: true,
      item: { name: '八万年药王', class: '丹药', amount: 1 }, ratio: 2.5,
      anomaly: '药香冲起',
    },
  };
  const oneCut = resolveStoneCut(fragile, 'sky', 'one', { random: () => 0 });
  const layered = resolveStoneCut(fragile, 'sky', 'layered', { random: () => 0 });
  assert.equal(oneCut.damaged, true);
  assert.equal(oneCut.items.length, 0);
  assert.equal(layered.damaged, false);
  assert.equal(layered.items[0].name, '八万年药王');
  assert.equal(getLayeredPreview(fragile, 'sky').needsDecision, true);

  const danger = {
    price: 1000000,
    outcome: { id: 'ominous', name: '凶源', danger: true, ratio: 0, anomaly: '阴气喷涌' },
  };
  assert.equal(resolveStoneCut(danger, 'sky', 'one').damageRate, 0.25);
  const sealed = resolveStoneCut(danger, 'sky', 'sealed');
  assert.equal(sealed.damageRate, 0);
  assert.equal(sealed.suppressed, true);
  assert.ok(sealed.sourceValue > 0);
});

test('镇园石王按周轮换并在三人助切后一次结算', () => {
  const firstWeek = getStoneWeekKey(new Date('2026-07-27T12:00:00+08:00'));
  const nextWeek = getStoneWeekKey(new Date('2026-08-03T12:00:00+08:00'));
  assert.notEqual(firstWeek, nextWeek);

  const state = createStoneKingState({
    now: new Date('2026-07-28T12:00:00+08:00'),
    random: () => 0,
  });
  state.participants = Array.from({ length: STONE_KING_CONFIG.target }, (_, index) => ({
    qq: String(index + 1),
    name: `玩家${index + 1}`,
  }));
  const result = resolveStoneKing(state, { random: () => 0 });
  assert.equal(result.outcome.id, 'source');
  assert.equal(state.opened, true);
  assert.throws(() => resolveStoneKing(state), /开切条件/);
});

test('石坊奇珍全部存在于现有物品表并可进入纳戒体系', () => {
  const itemFiles = ['丹药列表.json', '材料列表.json'];
  const items = itemFiles.flatMap(file => JSON.parse(
    fs.readFileSync(path.join(rootDir, 'resources/data/item', file), 'utf8')
  ));
  const names = new Set(items.map(item => item.name));
  const expected = [
    '神源液', '上古神源液', '八万年药王', '仙泪绿金残块',
    '龙纹黑金残块', '神痕紫金残块', '不死神凰血', '羽化仙经残页',
  ];
  for (const name of expected) assert.ok(names.has(name), `缺少物品：${name}`);
});

test('源石坊完整帮助指令已经接入主菜单', () => {
  const gameSource = fs.readFileSync(path.join(rootDir, 'apps/Game/Games.js'), 'utf8');
  const helpSource = fs.readFileSync(
    path.join(rootDir, 'config/help/zhutianhelp.yaml'),
    'utf8'
  );

  assert.match(gameSource, /reg: '\^#源石坊帮助\$'/);
  assert.match(gameSource, /fnc: 'StoneMarketHelp'/);
  assert.match(gameSource, /#合成羽化仙经\*1/);
  assert.match(helpSource, /title: '#源石坊帮助'/);
});
