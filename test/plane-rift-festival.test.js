import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beginRiftExpedition,
  calculateRiftPayout,
  exploreRift,
  getDefaultRiftState,
  getRiftRefreshChance,
  rollPeriodicRifts,
  updateFestivalSign,
  withdrawRift,
} from '../model/planeRiftFestival.js';

test('裂界只在每两千世界年判定一次，两个位面独立刷新', () => {
  const state = getDefaultRiftState();
  assert.equal(rollPeriodicRifts(state, 1000, { random: () => 0 }).checked, false);
  const result = rollPeriodicRifts(state, 2000, { random: () => 0, now: 100 });
  assert.equal(result.opened.length, 2);
  assert.deepEqual(result.opened.map(item => item.plane), ['仙界', '太初星墟']);
  assert.equal(rollPeriodicRifts(state, 2000, { random: () => 0, now: 100 }).checked, false);
});

test('未刷新会累积保底概率且不超过八成', () => {
  const state = getDefaultRiftState();
  rollPeriodicRifts(state, 2000, { random: () => 0.99, now: 100 });
  assert.equal(getRiftRefreshChance(state, '仙界'), 0.5);
  state.pity.仙界 = 99;
  assert.equal(getRiftRefreshChance(state, '仙界'), 0.8);
});

test('签到支持连续、断签与同日幂等', () => {
  const player = {};
  assert.equal(updateFestivalSign(player, '2026-08-01', '2026-07-31').sign.streak, 1);
  assert.equal(updateFestivalSign(player, '2026-08-01', '2026-07-31').reason, 'already');
  assert.equal(updateFestivalSign(player, '2026-08-02', '2026-08-01').sign.streak, 2);
  assert.equal(updateFestivalSign(player, '2026-08-04', '2026-08-03').sign.streak, 1);
  assert.equal(player.巡界签到.total, 3);
});

test('探索三层可全额带出，主动撤离保留当前战利品', () => {
  const state = getDefaultRiftState();
  const [rift] = rollPeriodicRifts(state, 2000, { random: () => 0, now: 100 }).opened;
  assert.equal(beginRiftExpedition(state, rift.id, '1', 100).ok, true);
  for (let i = 0; i < 3; i++) {
    const result = exploreRift(state, rift.id, '1', '强攻', { random: () => 0, realmLevel: 16, now: 100 });
    assert.equal(result.success, true);
  }
  assert.equal(rift.expeditions['1'].status, 'cleared');
  assert.equal(rift.expeditions['1'].secured, 33);
  assert.ok(calculateRiftPayout(rift, 33).source > 33);

  assert.equal(beginRiftExpedition(state, rift.id, '2', 100).ok, true);
  exploreRift(state, rift.id, '2', '稳阵', { random: () => 0, realmLevel: 16, now: 100 });
  assert.equal(withdrawRift(state, rift.id, '2', 100).secured, 3);
});

test('探索失败只保住已有界源胚的一半', () => {
  const state = getDefaultRiftState();
  const [rift] = rollPeriodicRifts(state, 2000, { random: () => 0, now: 100 }).opened;
  beginRiftExpedition(state, rift.id, '1', 100);
  exploreRift(state, rift.id, '1', '寻宝', { random: () => 0, realmLevel: 16, now: 100 });
  const failed = exploreRift(state, rift.id, '1', '强攻', { random: () => 0.99, realmLevel: 16, now: 100 });
  assert.equal(failed.success, false);
  assert.equal(failed.secured, 2);
});

test('裂界过期后不能继续探索，但仍可被动撤离结算', () => {
  const state = getDefaultRiftState();
  const [rift] = rollPeriodicRifts(state, 2000, { random: () => 0, now: 100 }).opened;
  beginRiftExpedition(state, rift.id, '1', 100);
  rift.expeditions['1'].loot = 8;
  assert.equal(exploreRift(state, rift.id, '1', '稳阵', { random: () => 0, now: rift.expiresAt }).reason, 'expired');
  assert.equal(withdrawRift(state, rift.id, '1', rift.expiresAt).secured, 8);
  assert.equal(rift.expeditions['1'].status, 'expired');
});

test('新一轮刷新保留尚未结算的旧探索且不阻塞同位面新副本', () => {
  const state = getDefaultRiftState();
  const opened = rollPeriodicRifts(state, 2000, { random: () => 0, now: 100 }).opened;
  beginRiftExpedition(state, opened[0].id, '1', 100);
  const later = opened[0].expiresAt + 1;
  const next = rollPeriodicRifts(state, 4000, { random: () => 0, now: later });
  assert.equal(next.opened.length, 2);
  assert.ok(state.activeRifts.some(rift => rift.id === opened[0].id));
  assert.ok(state.activeRifts.some(rift => rift.id === '4000-仙界'));
});
