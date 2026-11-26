import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beginRiftExpedition,
  calculateRiftPayout,
  closeRifts,
  exploreRift,
  getActiveRifts,
  getDefaultRiftState,
  getRiftRefreshChance,
  openRiftManually,
  parseRiftExchangeName,
  RIFT_EXCHANGES,
  rollPeriodicRifts,
  updateFestivalSign,
  withdrawRift,
} from '../model/planeRiftFestival.js';

test('界源兑换兼容紧邻参数与QQBot词内空格', () => {
  assert.equal(parseRiftExchangeName('#界源兑换真我宝盒'), '真我宝盒');
  assert.equal(parseRiftExchangeName('#界源兑换 真我 宝盒'), '真我宝盒');
  assert.equal(parseRiftExchangeName('#界源兑换'), '');
});

test('无尽秘钥配方可用100界源兑换', () => {
  assert.deepEqual(RIFT_EXCHANGES.无尽秘钥配方, {
    cost: 100,
    name: '无尽秘钥配方',
    class: '道具',
    amount: 1,
  });
});

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

test('境界乘区：修为血气按 练气×炼体×秘境×仙古×花粉 放大', () => {
  const rift = { anchor: 0 };
  const base = calculateRiftPayout(rift, 2, { level: 1, physique: 1, xiangu: 1, mijing: 1 });
  const boosted = calculateRiftPayout(rift, 2, { level: 50, physique: 40, xiangu: 3, mijing: 2, huafen: 4 });
  // 锚定 0、secured 2 时 source=2；base 修为=2*500000*1=1,000,000
  assert.equal(base.source, 2);
  assert.equal(base.realmMult, 1);
  assert.equal(base.cultivation, 1_000_000);
  assert.equal(base.blood, 1_000_000);
  // boosted: realmMult = 50*40*3*2*4 = 48000
  assert.equal(boosted.realmMult, 48000);
  assert.equal(boosted.cultivation, 2 * 500000 * 48000);
  assert.equal(boosted.blood, 2 * 500000 * 48000);
});

test('花粉路与另外两路在同境界获得相同裂界乘区', () => {
  const rift = { anchor: 0 };
  const common = { level: 30, physique: 30 };
  const mijing = calculateRiftPayout(rift, 1, { ...common, mijing: 12 });
  const xiangu = calculateRiftPayout(rift, 1, { ...common, xiangu: 12 });
  const huafen = calculateRiftPayout(rift, 1, { ...common, huafen: 12 });
  assert.equal(mijing.realmMult, xiangu.realmMult);
  assert.equal(xiangu.realmMult, huafen.realmMult);
});

test('境界缺失时按 1 兜底，修为血气不退化为零', () => {
  const rift = { anchor: 50 };
  const payout = calculateRiftPayout(rift, 4); // 不传 realm
  assert.equal(payout.realmMult, 1);
  assert.ok(payout.cultivation > 0);
});

test('探索失败只保住已有界源胚的一半', () => {
  const state = getDefaultRiftState();
  const [rift] = rollPeriodicRifts(state, 2000, { random: () => 0, now: 100 }).opened;
  beginRiftExpedition(state, rift.id, '1', 100);
  const first = exploreRift(state, rift.id, '1', '寻宝', { random: () => 0.5, realmLevel: 16, now: 100 });
  assert.equal(first.success, true);
  const lootBefore = first.expedition.loot;
  const failed = exploreRift(state, rift.id, '1', '强攻', { random: () => 0.99, realmLevel: 16, now: 100 });
  assert.equal(failed.success, false);
  assert.equal(failed.secured, Math.floor(lootBefore / 2));
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

test('openRiftManually 拒绝非法位面', () => {
  const state = getDefaultRiftState();
  const r = openRiftManually(state, '冥界');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'plane');
  assert.deepEqual(r.planes, ['仙界', '太初星墟']);
});

test('openRiftManually 按序号或名称强制开启指定裂界', () => {
  const state = getDefaultRiftState();
  const byIndex = openRiftManually(state, '仙界', { pick: 2, random: () => 0.9 });
  assert.equal(byIndex.ok, true);
  assert.equal(byIndex.rift.name, '万象丹庭');
  assert.ok(byIndex.rift.manual);

  const byName = openRiftManually(state, '太初星墟', { pick: '太初矿心' });
  assert.equal(byName.ok, true);
  assert.equal(byName.rift.name, '太初矿心');

  const randomPick = openRiftManually(state, '仙界', { random: () => 0 });
  assert.equal(randomPick.rift.name, '斩岁仙府');
});

test('closeRifts 按位面与全部关闭，仅拨快过期不删记录', () => {
  const state = getDefaultRiftState();
  rollPeriodicRifts(state, 2000, { random: () => 0, now: 100 });
  assert.equal(getActiveRifts(state, 100).length, 2);
  const byPlane = closeRifts(state, { plane: '仙界', now: 100 });
  assert.equal(byPlane.closed.length, 1);
  assert.equal(getActiveRifts(state, 100).length, 1);
  const all = closeRifts(state, { all: true, now: 100 });
  assert.equal(all.closed.length, 1);
  assert.equal(getActiveRifts(state, 100).length, 0);
});
