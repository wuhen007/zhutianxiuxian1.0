import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ETERNAL_ITEM_CLAIM_KEYS,
  backfillXianguEternalClaims,
  collectHeldEternalItems,
} from '../model/xianguEternalBackfill.js';

function fakeRedis() {
  const store = new Map();
  return {
    store,
    async set(key, value, opts = {}) {
      if (opts.NX && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    },
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
  };
}

function makeDirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xiangu-backfill-'));
  const dirs = {
    player: path.join(root, 'player'),
    equipment: path.join(root, 'equipment'),
    najie: path.join(root, 'najie'),
  };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
  const write = (dir, id, data) =>
    fs.writeFileSync(path.join(dirs[dir], `${id}.json`), JSON.stringify(data));
  return { root, dirs, write };
}

test('映射表：物品名转认领记录 key', () => {
  assert.equal(ETERNAL_ITEM_CLAIM_KEYS['大罗剑胎'], '大罗剑胎');
  assert.equal(ETERNAL_ITEM_CLAIM_KEYS['玉石匣'], '玉石匣·仙王经文');
  assert.equal(ETERNAL_ITEM_CLAIM_KEYS['帝血'], '一滴帝血');
});

test('持有扫描覆盖装备三槽/纳戒/秘境背包', () => {
  const equipment = { 武器: { name: '大罗剑胎' }, 护具: {}, 法宝: {} };
  const najie = {
    装备: [{ name: '赤霄' }],
    道具: [{ name: '玉石匣' }, { name: '帝血' }],
  };
  const player = { xiangu_bag: { items: [{ name: '大罗剑胎' }] } };
  const held = collectHeldEternalItems({ player, equipment, najie });
  assert.deepEqual(
    [...held].sort(),
    ['一滴帝血', '大罗剑胎', '玉石匣·仙王经文'].sort(),
  );
});

test('持有扫描忽略无关物品与空数据', () => {
  const held = collectHeldEternalItems({
    player: {},
    equipment: { 武器: { name: '赤霄' } },
    najie: { 道具: [{ name: '悟道丹' }] },
  });
  assert.equal(held.size, 0);
  assert.equal(collectHeldEternalItems({}).size, 0);
});

test('补登：持有者写入认领记录，映射正确且幂等', async () => {
  const { dirs, write } = makeDirs();
  // 玩家 A：装备武器位大罗剑胎；玩家 B：纳戒道具玉石匣+帝血
  write('player', '10001', { 名号: '持剑者' });
  write('equipment', '10001', { 武器: { name: '大罗剑胎' }, 护具: {}, 法宝: {} });
  write('najie', '10001', {});
  write('player', '10002', { 名号: '藏宝人' });
  write('equipment', '10002', {});
  write('najie', '10002', { 道具: [{ name: '玉石匣' }, { name: '帝血' }] });
  // 玩家 C：无持有，不应被登记
  write('player', '10003', { 名号: '路人' });
  write('equipment', '10003', {});
  write('najie', '10003', { 道具: [{ name: '悟道丹' }] });

  const redisClient = fakeRedis();
  const stats = await backfillXianguEternalClaims({
    redisClient,
    playerDir: dirs.player,
    equipmentDir: dirs.equipment,
    najieDir: dirs.najie,
  });

  assert.equal(stats.scanned, 3);
  assert.equal(stats.holders, 2);
  assert.equal(stats.registered, 3);
  assert.equal(stats.skipped, 0);
  assert.equal(stats.failed, 0);
  assert.equal(stats.byName['大罗剑胎'], 1);
  assert.equal(stats.byName['玉石匣·仙王经文'], 1);
  assert.equal(stats.byName['一滴帝血'], 1);

  // 认领记录写入的 key 含 entityId 映射（key 段为 encodeURIComponent 编码）
  const enc = value => encodeURIComponent(value);
  const keys = [...redisClient.store.keys()];
  assert.ok(keys.some(key => key.includes(enc('大罗剑胎'))));
  assert.ok(keys.some(key => key.includes(enc('玉石匣·仙王经文'))));
  assert.ok(keys.some(key => key.includes(enc('一滴帝血'))));
  // 认领人 id/名号正确
  const record = redisClient.store.get(keys.find(key => key.includes(enc('大罗剑胎'))));
  const parsed = JSON.parse(record);
  assert.equal(parsed.claimantId, '10001');
  assert.equal(parsed.claimantName, '持剑者');

  // 再次执行：已有记录全部跳过，不重复登记
  const second = await backfillXianguEternalClaims({
    redisClient,
    playerDir: dirs.player,
    equipmentDir: dirs.equipment,
    najieDir: dirs.najie,
  });
  assert.equal(second.registered, 0);
  assert.equal(second.skipped, 3);
  assert.equal(redisClient.store.size, 3);
});

test('补登预览模式只统计不写入', async () => {
  const { dirs, write } = makeDirs();
  write('player', '20001', { 名号: '预览者' });
  write('equipment', '20001', { 武器: { name: '大罗剑胎' } });
  write('najie', '20001', {});

  const redisClient = fakeRedis();
  const stats = await backfillXianguEternalClaims({
    redisClient,
    playerDir: dirs.player,
    equipmentDir: dirs.equipment,
    najieDir: dirs.najie,
    dryRun: true,
  });
  assert.equal(stats.holders, 1);
  assert.equal(stats.registered, 0);
  assert.equal(redisClient.store.size, 0);
});
