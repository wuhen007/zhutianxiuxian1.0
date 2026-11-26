import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  FLOWER_ANCESTOR_SEED_OPPORTUNITY,
  STONE_JAR_OPPORTUNITY,
  claimShengxuOpportunityAtomic,
  ensureFlowerAncestorSeedOwner,
  getShengxuOpportunityOwner,
  isFlowerAncestorSeedOwner,
  persistShengxuAncestorSeedSettlementResult,
  scanLegacyFlowerAncestorSeedOwners,
  selectStableShengxuOpportunityOwner,
} from '../model/shengxuOpportunity.js';

class MemoryRedis {
  constructor() {
    this.values = new Map();
    this.nxWrites = 0;
    this.nxKeys = [];
    this.evalCalls = 0;
  }

  async get(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  async set(key, value, options = {}) {
    if (options.NX) {
      this.nxWrites++;
      this.nxKeys.push(key);
      if (this.values.has(key)) return null;
    }
    this.values.set(key, String(value));
    return 'OK';
  }

  async del(key) {
    return this.values.delete(key) ? 1 : 0;
  }

  async eval(_script, { keys, arguments: values }) {
    this.evalCalls++;
    if (this.values.get(keys[0]) !== values[0]) return 0;
    if (_script.includes('PEXPIRE')) return 1;
    return this.del(keys[0]);
  }
}

function makeStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shengxu-seed-'));
  const najieDir = path.join(root, 'najie');
  fs.mkdirSync(najieDir);
  return {
    root,
    najieDir,
    stateFile: path.join(root, 'opportunities.json'),
    redisClient: new MemoryRedis(),
  };
}

function writeNajie(directory, ownerId, amount = 1) {
  fs.writeFileSync(path.join(directory, `${ownerId}.json`), JSON.stringify({
    道具: [{ name: '花粉路祖种', 数量: amount }],
  }));
}

test('同一 settlementId 的祖种抽取只采用首次持久化结果', async () => {
  const redisClient = new MemoryRedis();
  assert.equal(await persistShengxuAncestorSeedSettlementResult('round:hit', true, { redisClient }), true);
  assert.equal(await persistShengxuAncestorSeedSettlementResult('round:hit', false, { redisClient }), true);
  assert.equal(await persistShengxuAncestorSeedSettlementResult('round:miss', false, { redisClient }), false);
  assert.equal(await persistShengxuAncestorSeedSettlementResult('round:miss', true, { redisClient }), false);
});

test('祖种新归属通过 Redis NX 锁串行确认', async t => {
  const store = makeStore();
  t.after(() => fs.rmSync(store.root, { recursive: true, force: true }));

  const first = await claimShengxuOpportunityAtomic(
    FLOWER_ANCESTOR_SEED_OPPORTUNITY,
    '20002',
    { ...store, now: 100 },
  );
  const second = await claimShengxuOpportunityAtomic(
    FLOWER_ANCESTOR_SEED_OPPORTUNITY,
    '10001',
    { ...store, now: 200 },
  );

  assert.equal(first.ok, true);
  assert.equal(first.ownedBySelf, true);
  assert.equal(second.ok, false);
  assert.equal(second.ownerId, '20002');
  assert.equal((await claimShengxuOpportunityAtomic(
    FLOWER_ANCESTOR_SEED_OPPORTUNITY,
    '20002',
    store,
  )).ownedBySelf, true);
  const stoneJar = await claimShengxuOpportunityAtomic(STONE_JAR_OPPORTUNITY, '30003', store);
  assert.equal(stoneJar.ok, true);
  assert.equal(getShengxuOpportunityOwner(FLOWER_ANCESTOR_SEED_OPPORTUNITY, store), '20002');
  assert.equal(getShengxuOpportunityOwner(STONE_JAR_OPPORTUNITY, store), '30003');
  assert.equal(new Set(store.redisClient.nxKeys).size, 1);
  assert.ok(store.redisClient.nxWrites >= 2);
  assert.ok(store.redisClient.evalCalls >= 1);
});

test('旧祖种库存按最小稳定账号迁移，其他库存原样保留但不具 owner 权限', async t => {
  const store = makeStore();
  t.after(() => fs.rmSync(store.root, { recursive: true, force: true }));
  writeNajie(store.najieDir, '20');
  writeNajie(store.najieDir, '3');
  writeNajie(store.najieDir, '100');

  assert.deepEqual(scanLegacyFlowerAncestorSeedOwners(store), ['3', '20', '100']);
  assert.equal(selectStableShengxuOpportunityOwner(['20', '100', '3']), '3');
  assert.equal(await ensureFlowerAncestorSeedOwner({ ...store, now: 300 }), '3');
  assert.equal(await isFlowerAncestorSeedOwner('3', store), true);
  assert.equal(await isFlowerAncestorSeedOwner('20', store), false);
  assert.equal(fs.existsSync(path.join(store.najieDir, '20.json')), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(store.najieDir, '20.json'), 'utf8')).道具[0].数量, 1);
});

test('机缘状态损坏时终止迁移和认主且保留原文件', async t => {
  const store = makeStore();
  t.after(() => fs.rmSync(store.root, { recursive: true, force: true }));
  fs.writeFileSync(store.stateFile, '{broken');

  await assert.rejects(
    claimShengxuOpportunityAtomic(FLOWER_ANCESTOR_SEED_OPPORTUNITY, '10001', store),
    error => error?.code === 'SHENGXU_OPPORTUNITY_STATE_CORRUPT',
  );
  await assert.rejects(
    ensureFlowerAncestorSeedOwner(store),
    error => error?.code === 'SHENGXU_OPPORTUNITY_STATE_CORRUPT',
  );
  assert.equal(fs.readFileSync(store.stateFile, 'utf8'), '{broken');
});

test('圣墟发放先确认库存再写 marker，提示只绑定真实新增', () => {
  const source = fs.readFileSync('apps/User/ShengxuContent.js', 'utf8');
  const start = source.indexOf('async function reconcileFlowerAncestorSeedAward');
  const end = source.indexOf('export class ShengxuContent', start);
  const award = source.slice(start, end);
  assert.ok(award.indexOf('const before') < award.indexOf('Add_najie_thing'));
  assert.ok(award.indexOf('Add_najie_thing') < award.indexOf('let after'));
  assert.ok(award.indexOf('let after') < award.indexOf('player.圣墟唯一机缘.花粉路祖种 = true'));
  assert.match(award, /if \(after <= 0\)[\s\S]+Add_najie_thing\(userId, '花粉路祖种', '道具', 1\)/);
  assert.match(award, /added: after > before/);
  assert.match(source, /ancestorSeedGranted = result\.added/);
  assert.match(source, /ancestorSeedRoll === null && battle\.winner !== 'A'[\s\S]+persistShengxuAncestorSeedSettlementResult\(settlementId, false\)/);
  assert.match(source, /rewardRollIndex === 4 && persistedAncestorSeedRoll !== null/);
  assert.match(source, /resolveShengxuSettlementReward\(dungeon, persistedAncestorSeedRoll\)/);
  assert.match(source, /persistShengxuAncestorSeedSettlementResult\([\s\S]+Boolean\(reward\.ancestorSeed\)/);
  assert.match(source, /圣墟副本最近结算\?\.\[settlementKey\] === settlementId[\s\S]+reconcileFlowerAncestorSeedAward/);
  assert.match(source, /claim = await claimShengxuOpportunityAtomic\(STONE_JAR_OPPORTUNITY/);
});

test('祖种收益与后台孕育统一使用 owner 校验', () => {
  const source = fs.readFileSync('apps/User/FlowerPollenPath.js', 'utf8');
  const levelSource = fs.readFileSync('apps/User/Level.js', 'utf8');
  assert.match(source, /async function hasOwnedFlowerAncestorSeed[\s\S]+isFlowerAncestorSeedOwner/);
  assert.match(source, /async settleAncestorForUser[\s\S]+ownerDenied: true/);
  assert.match(source, /async tickAncestorSeed[\s\S]+settlement\.ownerDenied/);
  assert.match(source, /async evolve[\s\S]+const ancestorSeed = await hasOwnedFlowerAncestorSeed/);
  assert.match(source, /async ancestorWudao[\s\S]+ancestorSettlement\.ownerDenied/);
  assert.match(source, /async breedAncestorFruit[\s\S]+ancestorSettlement\.ownerDenied/);
  assert.match(source, /async eatSuperFlowerFruit[\s\S]+ancestorSettlement\.ownerDenied/);
  assert.match(source, /async flowerDao[\s\S]+const ancestorSeed = await hasOwnedFlowerAncestorSeed/);
  assert.match(levelSource, /const hasFlowerAncestorSeed = daoRoute === 'huafen'[\s\S]+isFlowerAncestorSeedOwner\(usr_qq\)[\s\S]+exist_najie_thing\(usr_qq, '花粉路祖种'/);
});
