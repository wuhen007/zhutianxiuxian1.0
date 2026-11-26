import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GrantStore } from '../model/itemGrantStore.js';

function mk(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grant-'));
  return new GrantStore(path.join(dir, 'g.json'), opts);
}

const okDeliver = async () => ({ ok: true });

function orderOf(s, over = {}) {
  return s.order({
    groupId: '10001',
    grantedBy: 'owner',
    role: 'owner',
    targetQQ: 'player',
    itemName: '返命丹',
    itemClass: '丹药',
    itemPinji: 0,
    qty: 1,
    reason: '卡关',
    ...over,
  });
}

test('发单后领取才入账，首次弹完整提示', async () => {
  const s = mk();
  const r = await orderOf(s);
  assert.equal(r.ok, true);
  assert.equal(s.pendingOf('player').length, 1);

  const c = await s.claim('player', okDeliver);
  assert.equal(c.ok, true);
  assert.equal(c.first, true);
  assert.equal(c.list[0].mint.length > 0, true);
  assert.equal(s.pendingOf('player').length, 0);

  const again = await s.claim('player', okDeliver);
  assert.equal(again.ok, false);

  const c2 = await s.claim('player', okDeliver);
  assert.equal(c2.ok, false);
});

test('不能给自己发单；额度用完拦住；同道具不重复待领', async () => {
  const s = mk({ weeklyQuota: 2 });
  assert.equal((await orderOf(s, { targetQQ: 'owner' })).ok, false);
  assert.equal((await orderOf(s)).ok, true);
  assert.equal((await orderOf(s, { itemName: '洗髓丹' })).ok, true);
  assert.match((await orderOf(s, { itemName: '回血丹' })).msg, /额度已用完/);
});

test('同一个人同一道具只能有一张待领单', async () => {
  const s = mk({ weeklyQuota: 9 });
  assert.equal((await orderOf(s)).ok, true);
  const dup = await orderOf(s, { grantedBy: 'owner2' });
  assert.equal(dup.ok, false);
  assert.match(dup.msg, /待领单/);
});

test('发放失败时单子留在待领，不会被吞', async () => {
  const s = mk();
  await orderOf(s);
  const bad = await s.claim('player', async () => ({ ok: false, msg: '背包满了' }));
  assert.equal(bad.ok, true);
  assert.equal(bad.list[0].err, '背包满了');
  assert.equal(s.pendingOf('player').length, 1);
});

test('永久失败（唯一机缘类）自动撤单，不再卡住玩家', async () => {
  const s = mk();
  await orderOf(s);
  const bad = await s.claim('player', async () => ({ ok: false, msg: '不能发放', permanent: true }));
  assert.equal(bad.list[0].err, '不能发放');
  // 单子已撤，玩家下次 #领取 不会再撞同一堵墙
  assert.equal(s.pendingOf('player').length, 0);
});

test('撤销：别人撤不了，本人可以，撤了就不能领', async () => {
  const s = mk();
  const { order } = await orderOf(s);
  assert.equal((await s.revoke(order.id, 'other', 'member')).ok, false);
  assert.equal((await s.revoke(order.id, 'owner', 'owner')).ok, true);
  assert.equal(s.pendingOf('player').length, 0);
  assert.equal((await s.claim('player', okDeliver)).ok, false);
});

test('超过 7 天自动过期', async () => {
  const s = mk();
  const { order } = await orderOf(s);
  s.state.orders[order.id].expireAt = 1;
  s._save();
  assert.equal(s.pendingOf('player').length, 0);
  assert.equal(s.state.orders[order.id].status, 'expired');
});

test('全服日池熔断', async () => {
  const s = mk({ dailyPool: 1, weeklyQuota: 9 });
  await orderOf(s);
  await s.claim('player', okDeliver);
  await orderOf(s, { targetQQ: 'p2' });
  const c = await s.claim('p2', okDeliver);
  assert.match(c.list[0].err, /上限/);
});

test('哈希链完整，改一条就断', async () => {
  const s = mk();
  await orderOf(s);
  await s.claim('player', okDeliver);
  assert.equal(s.verifyChain(), true);

  s.state.events[0].qty = 99;
  s._save();
  assert.equal(s.verifyChain(), false);
});
