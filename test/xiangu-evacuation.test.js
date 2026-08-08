import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  buildXianguRunSummary,
  calculateEvacuationDuration,
  clearXianguSessionState,
  countNajieItems,
  createEvacuationState,
  createXianguRun,
  parseEvacuationState,
  validateEvacuationState,
} from '../apps/SecretPlace/xianguEvacuation.js';

function makeNajie(extra = {}) {
  return {
    等级: 4,
    灵石: 999999,
    源石: 100,
    装备: [],
    丹药: [],
    道具: [],
    材料: [],
    ...extra,
  };
}

test('撤离结算读取纳戒失败时保留秘境背包且禁止覆盖写入', () => {
  const source = fs.readFileSync(new URL('../apps/SecretPlace/xianguPlace.js', import.meta.url), 'utf8');
  assert.match(source, /readXianguNajie\(player_qq, \{ required: true \}\)/);
  assert.match(source, /if \(required\) \{[\s\S]*?秘境背包已保留，请稍后重试/);
});

function makePlayer(extra = {}) {
  return {
    in_xiangu: true,
    当前血量: 8000,
    xiangu_realm_map: {
      fragmentId: 'xiangu_core',
      playerPos: { x: 3, y: 4 },
    },
    xiangu_pos_x: 3,
    xiangu_pos_y: 4,
    xiangu_seeds: [],
    xiangu_kills: 0,
    xiangu_infamy: 0,
    ...extra,
  };
}

test('只统计纳戒数组中物品的正整数数量', () => {
  const najie = makeNajie({
    灵石: 123456789,
    元数据: { 数量: 999 },
    丹药: [
      { name: '悟道丹', 数量: 2 },
      { name: '残丹', 数量: 0 },
      { name: '坏丹', 数量: -3 },
      { name: '字符串数量', 数量: '4' },
      { name: '小数数量', 数量: 2.9 },
      { name: '无数量' },
    ],
    道具: [{ name: '秘境令', 数量: 1 }],
  });

  assert.equal(countNajieItems(najie), 9);
  assert.equal(countNajieItems(null), 0);
  assert.equal(countNajieItems([]), 0);
});

test('进入秘境时建立独立本局基线', () => {
  const player = makePlayer({
    xiangu_seeds: [{ 名称: '旧道种' }, { 名称: '另一枚旧道种' }],
    xiangu_kills: 7,
    xiangu_infamy: 23,
  });
  const najie = makeNajie({ 丹药: [{ 数量: 2 }], 材料: [{ 数量: 3 }] });
  const run = createXianguRun(player, najie, 1000, () => 0.5);

  assert.equal(run.runId, 'xiangu-rs-0zik0zk');
  assert.equal(run.startedAt, 1000);
  assert.equal(run.startNajieCount, 5);
  assert.equal(run.startSeedCount, 2);
  assert.equal(run.startKills, 7);
  assert.equal(run.startInfamy, 23);
  assert.deepEqual(run.获得道种, []);
  assert.equal(player.xiangu_run, run);
});

test('普通和紧急撤离采用各自基础时间及上限', () => {
  assert.equal(calculateEvacuationDuration(), 10);
  assert.equal(calculateEvacuationDuration({ lootUnits: 3 }), 16);
  assert.equal(calculateEvacuationDuration({ lootUnits: 999 }), 60);
  assert.equal(calculateEvacuationDuration({ mode: 'emergency' }), 30);
  assert.equal(calculateEvacuationDuration({ mode: 'emergency', lootUnits: 999 }), 90);
  assert.equal(calculateEvacuationDuration({
    lootUnits: 4,
    config: { normal: { baseSeconds: 5, perLootSeconds: 3, maxSeconds: 15 } },
  }), 15);
  assert.equal(calculateEvacuationDuration({
    lootUnits: 2,
    config: { 撤离配置: { 正常撤离: { 基础时间: 6, 每份战利品时间: 4, 最长时间: 20 } } },
  }), 14);
});

test('撤离状态完整记录读条锚点和本局战利品', () => {
  const player = makePlayer();
  const run = createXianguRun(player, makeNajie(), 1000, () => 0);
  const state = createEvacuationState({
    player,
    run,
    now: 2000,
    lootStats: { najieDelta: 2, seedCount: 1, uniqueFound: 1 },
  });

  assert.equal(state.version, 1);
  assert.equal(state.runId, run.runId);
  assert.equal(state.mode, 'normal');
  assert.equal(state.startedAt, 2000);
  assert.equal(state.durationSeconds, 18);
  assert.equal(state.readyAt, 20000);
  assert.equal(state.expiresAt, 140000);
  assert.equal(state.fragmentId, 'xiangu_core');
  assert.deepEqual(state.position, { x: 3, y: 4 });
  assert.equal(state.currentHp, 8000);
  assert.equal(state.lootUnits, 4);
  assert.equal(state.lootStats.uniqueFound, 1);

  assert.deepEqual(parseEvacuationState(JSON.stringify(state)), state);
  assert.equal(parseEvacuationState('pending'), null);
  assert.equal(parseEvacuationState('{broken json'), null);
});

test('撤离状态读取中文配置中的完成窗口', () => {
  const player = makePlayer();
  const run = createXianguRun(player, makeNajie(), 0, () => 0);
  const state = createEvacuationState({
    player,
    run,
    now: 1000,
    durationSeconds: 10,
    config: { 撤离配置: { 正常撤离: { 完成窗口: 45 } } },
  });

  assert.equal(state.readyAt, 11000);
  assert.equal(state.expiresAt, 56000);
});

test('普通撤离会校验读条、局次、核心位置、移动和受伤', () => {
  const player = makePlayer();
  const run = createXianguRun(player, makeNajie(), 0, () => 0);
  const state = createEvacuationState({ player, run, now: 1000, durationSeconds: 10 });

  assert.deepEqual(
    validateEvacuationState(state, { player, now: 9999 }),
    { ok: false, code: 'not_ready', remaining: 2, state },
  );
  assert.equal(validateEvacuationState(state, { player, now: 11000 }).code, 'ready');
  assert.equal(validateEvacuationState(state, { player, runId: '另一局', now: 11000 }).code, 'run_mismatch');
  assert.equal(validateEvacuationState(state, {
    player: { ...player, in_xiangu: false },
    now: 11000,
  }).code, 'not_in_xiangu');
  assert.equal(validateEvacuationState(state, {
    player,
    fragmentId: 'ancient_forest',
    position: { x: 3, y: 4 },
    now: 11000,
  }).code, 'not_in_core');
  assert.equal(validateEvacuationState(state, {
    player,
    position: { x: 4, y: 4 },
    now: 11000,
  }).code, 'moved');
  assert.equal(validateEvacuationState(state, {
    player,
    currentHp: 7999,
    now: 11000,
  }).code, 'damaged');
  assert.equal(validateEvacuationState(state, { player, now: state.expiresAt }).code, 'expired');
});

test('紧急撤离可在非核心区域启动，但读条期间仍不能移动', () => {
  const player = makePlayer({
    xiangu_realm_map: { fragmentId: 'ancient_forest', playerPos: { x: 1, y: 2 } },
    xiangu_pos_x: 1,
    xiangu_pos_y: 2,
  });
  const run = createXianguRun(player, makeNajie(), 0, () => 0);
  const state = createEvacuationState({
    player,
    run,
    mode: 'emergency',
    now: 1000,
    durationSeconds: 30,
  });

  assert.equal(validateEvacuationState(state, { player, now: 31000 }).code, 'ready');
  assert.equal(validateEvacuationState(state, {
    player,
    position: { x: 2, y: 2 },
    now: 31000,
  }).code, 'moved');
});

test('本局总结以进入时快照计算增量并保留有符号凶名变化', () => {
  const player = makePlayer({
    xiangu_entry_time: 60000,
    xiangu_seeds: [{ 名称: '旧道种甲' }, { 名称: '旧道种乙' }],
    xiangu_kills: 4,
    xiangu_infamy: 10,
  });
  createXianguRun(
    player,
    makeNajie({ 丹药: [{ 数量: 2 }], 材料: [{ 数量: 3 }] }),
    60000,
    () => 0,
  );
  player.xiangu_run.获得道种.push('世界树幼苗');
  player.xiangu_seeds.push({ 名称: '世界树幼苗' });
  player.xiangu_kills = 6;
  player.xiangu_infamy = 7;
  player.xiangu_gains = {
    daoyun: 12,
    unique_found: 2,
    仙古符骨: 1,
    debuff: '重伤',
  };

  const summary = buildXianguRunSummary(
    player,
    makeNajie({ 丹药: [{ 数量: 4 }], 材料: [{ 数量: 4 }] }),
    180500,
  );

  assert.equal(summary.durationMs, 120500);
  assert.equal(summary.durationSeconds, 120);
  assert.equal(summary.durationMinutes, 2);
  assert.equal(summary.najieDelta, 3);
  assert.equal(summary.seedCount, 1);
  assert.deepEqual(summary.seedNames, ['世界树幼苗']);
  assert.equal(summary.killDelta, 2);
  assert.equal(summary.infamyDelta, -3);
  assert.equal(summary.daoyun, 12);
  assert.equal(summary.uniqueFound, 2);
  assert.deepEqual(summary.gainNames, ['仙古符骨']);
  assert.equal(summary.lootUnits, 6);
});

test('启用秘境背包后总结以暂存收获计算，尚未写入纳戒也能撤离', () => {
  const player = makePlayer({
    xiangu_bag: {
      xiuwei: 1000,
      xueqi: 2000,
      sourceStone: 14_000_000,
      items: [{ name: '仙古矿材', type: '材料', quantity: 3 }],
      seeds: [{ 名称: '世界树幼苗' }],
      techniques: ['真龙宝术'],
      potential: 50,
    },
  });
  createXianguRun(player, makeNajie(), 1000, () => 0);

  const summary = buildXianguRunSummary(player, makeNajie(), 2000);

  assert.equal(summary.najieDelta, 3);
  assert.equal(summary.seedCount, 1);
  assert.deepEqual(summary.seedNames, ['世界树幼苗']);
  assert.equal(summary.xiuwei, 1000);
  assert.equal(summary.xueqi, 2000);
  assert.equal(summary.sourceStone, 14_000_000);
  assert.equal(summary.potential, 50);
  assert.equal(summary.techniqueCount, 1);
  assert.equal(summary.lootUnits, 9);
});

test('清理仅移除秘境会话字段并保存最后一局总结', () => {
  const summary = { runId: 'run-1', daoyun: 8, seedNames: ['世界树幼苗'] };
  const player = makePlayer({
    xiangu_entry_time: 1000,
    xiangu_location: '核心区域',
    xiangu_gains: { daoyun: 8 },
    xiangu_realm_history: { ancient_forest: {} },
    xiangu_run: { runId: 'run-1' },
    xiangu_soulsearch_target: { name: '临时残魂' },
    xiangu_teammate: 'npc-1',
    xiangu_teammate_name: '石昊',
    xiangu_teammate_data: { 当前血量: 100 },
    xiangu_teammate_betray_chance: 0.3,
    xiangu_last_npc_tick: 123,
    xiangu_npc_interactions: { npc_a: { count: 1 } },
    xiangu_bag: { sourceStone: 14_000_000 },
    xiangu_defeated_npc_ids: ['npc-1'],
    xiangu_world_seed: 'open-100',
    xiangu_last_team_time: 456,
    xiangu_seeds: [{ 名称: '世界树幼苗' }],
    xiangu_shenhuo: { 状态: '已点燃' },
    xiangu_xianqi: 1,
    xiangu_infamy: 88,
    xiangu_kills: 9,
    xiangu_faction_rep: { good: 20 },
    xiangu_npc_relations: { shihao: 80 },
  });

  clearXianguSessionState(player, summary);

  assert.equal(player.in_xiangu, false);
  assert.equal(player.xiangu_entry_time, 0);
  assert.equal(player.xiangu_location, '边缘区域');
  assert.deepEqual(player.xiangu_gains, {});
  for (const field of [
    'xiangu_realm_map',
    'xiangu_realm_history',
    'xiangu_pos_x',
    'xiangu_pos_y',
    'xiangu_run',
    'xiangu_soulsearch_target',
    'xiangu_teammate',
    'xiangu_teammate_name',
    'xiangu_teammate_data',
    'xiangu_teammate_betray_chance',
    'xiangu_last_npc_tick',
    'xiangu_npc_interactions',
    'xiangu_bag',
    'xiangu_defeated_npc_ids',
    'xiangu_world_seed',
  ]) {
    assert.equal(Object.hasOwn(player, field), false, `${field} 应被清理`);
  }

  assert.deepEqual(player.xiangu_seeds, [{ 名称: '世界树幼苗' }]);
  assert.deepEqual(player.xiangu_shenhuo, { 状态: '已点燃' });
  assert.equal(player.xiangu_xianqi, 1);
  assert.equal(player.xiangu_infamy, 88);
  assert.equal(player.xiangu_kills, 9);
  assert.deepEqual(player.xiangu_faction_rep, { good: 20 });
  assert.deepEqual(player.xiangu_npc_relations, { shihao: 80 });
  assert.equal(player.xiangu_last_team_time, 456);
  assert.deepEqual(player.xiangu_last_run, summary);
  assert.notEqual(player.xiangu_last_run, summary);
});

test('入口清理未传总结时保留上一局记录', () => {
  const lastRun = { runId: 'previous-run', endedAt: 123456 };
  const player = makePlayer({
    xiangu_run: { runId: 'stale-run' },
    xiangu_last_run: lastRun,
  });

  clearXianguSessionState(player);
  assert.equal(player.xiangu_last_run, lastRun);

  player.in_xiangu = true;
  player.xiangu_run = { runId: 'another-stale-run' };
  clearXianguSessionState(player, {});
  assert.equal(player.xiangu_last_run, lastRun);
});
