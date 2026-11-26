import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildXianguSettlementReceiptId,
  confirmXianguSettlementReceipt,
  createXianguSettlementReceipt,
  deliverXianguSettlementReceipt,
  getXianguSettlementReceipt,
  getXianguSettlementReceiptKey,
  getXianguSettlementPlayerLockKey,
  hasXianguSettlementReceiptClaim,
  listXianguSettlementReceipts,
  recoverXianguSettlementReceipts,
} from '../apps/SecretPlace/xianguSettlement.js';
import { readXianguSharedDocument } from '../apps/SecretPlace/xianguSharedState.js';

function createRedis(values = new Map(), { failSet, onSet } = {}) {
  return {
    async set(key, value, options) {
      if (typeof failSet === 'function') failSet(key, value, options);
      if (typeof onSet === 'function') onSet(key, value, options);
      if (options?.NX && values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    },
    async get(key) {
      return values.get(key) ?? null;
    },
    async del(key) {
      return values.delete(key) ? 1 : 0;
    },
    async eval(_script, { keys = [], arguments: args = [] } = {}) {
      const key = keys[0];
      if (!key || values.get(key) !== args[0]) return 0;
      values.delete(key);
      return 1;
    },
  };
}

function receiptInput(overrides = {}) {
  return {
    worldSeed: 'era-2026',
    playerId: '10001',
    receiptId: 'xiangu:treasure:era-2026:core:dao-bone:10001',
    kind: 'unique-treasure',
    payload: { sourceStone: 7, item: 'dao-bone' },
    source: { type: 'treasure', entityId: 'dao-bone' },
    ...overrides,
  };
}

function createPlayerStore() {
  const values = new Map([['10001', { player_qq: '10001', sourceStone: 0 }]]);
  return {
    async load(playerId) {
      const value = values.get(String(playerId));
      return value ? structuredClone(value) : null;
    },
    async save(playerId, player) {
      values.set(String(playerId), structuredClone(player));
    },
    value(playerId = '10001') {
      return values.get(String(playerId));
    },
  };
}

test('settlement receipts are created once and retain the first immutable reward payload', async () => {
  const redis = createRedis();
  const firstInput = receiptInput();
  const secondInput = receiptInput({ payload: { sourceStone: 999 } });
  const [first, second] = await Promise.all([
    createXianguSettlementReceipt(redis, firstInput, { now: 100 }),
    createXianguSettlementReceipt(redis, secondInput, { now: 101 }),
  ]);

  assert.equal(Number(first.created) + Number(second.created), 1);
  const saved = await getXianguSettlementReceipt(redis, firstInput);
  assert.equal(saved.payload.sourceStone, 7);
  assert.equal(saved.state, 'pending');
  assert.deepEqual(
    (await listXianguSettlementReceipts(redis, firstInput)).map(receipt => receipt.receiptId),
    [firstInput.receiptId],
  );
});

test('legacy receipts normalize type-only records and flat reward payloads', async () => {
  const values = new Map();
  const redis = createRedis(values);
  const input = receiptInput({
    receiptId: 'xiangu:treasure-cell:era-2024:edge:legacy:10001',
  });
  const key = getXianguSettlementReceiptKey(input);
  const legacy = {
    worldSeed: input.worldSeed,
    playerId: input.playerId,
    receiptId: input.receiptId,
    type: 'treasure-cell',
    payload: { sourceStone: 7, xiuwei: 11 },
    state: 'pending',
    createdAt: 100,
    updatedAt: 100,
  };
  values.set(key, JSON.stringify(legacy));

  const normalized = await getXianguSettlementReceipt(redis, input);
  assert.equal(normalized.kind, 'treasure-cell');
  assert.equal(normalized.payload.bag.sourceStone, 7);
  assert.equal(normalized.payload.bag.xiuwei, 11);
});

test('receipt and index writes use a finite Redis TTL', async () => {
  const writes = [];
  const redis = createRedis(new Map(), { onSet: (key, _value, options) => writes.push({ key, options }) });
  const input = receiptInput();
  await createXianguSettlementReceipt(redis, input, { now: 100, ttlSeconds: 120 });

  const receiptWrite = writes.find(write => write.key === getXianguSettlementReceiptKey(input));
  assert.equal(receiptWrite.options.EX, 120);
  assert.equal(writes.some(write => write.options?.EX === 120), true);
});

test('a failed player write leaves a retryable receipt and does not pay before persistence', async () => {
  const redis = createRedis();
  const store = createPlayerStore();
  const input = receiptInput();
  await createXianguSettlementReceipt(redis, input, { now: 100 });

  const failed = await deliverXianguSettlementReceipt(redis, input, {
    loadPlayer: store.load,
    savePlayer: async () => {
      throw new Error('player storage is unavailable');
    },
    apply: (player, receipt) => {
      player.sourceStone += receipt.payload.sourceStone;
    },
  }, { now: 110 });

  assert.equal(failed.status, 'pending');
  assert.equal(store.value().sourceStone, 0);
  assert.equal((await getXianguSettlementReceipt(redis, input)).attempts, 1);

  const settled = await deliverXianguSettlementReceipt(redis, input, {
    loadPlayer: store.load,
    savePlayer: store.save,
    apply: (player, receipt) => {
      player.sourceStone += receipt.payload.sourceStone;
    },
  }, { now: 120 });

  assert.equal(settled.status, 'applied');
  assert.equal(store.value().sourceStone, 7);
  assert.equal(hasXianguSettlementReceiptClaim(store.value(), input.receiptId), true);
  assert.equal((await getXianguSettlementReceipt(redis, input)).state, 'applied');
});

test('a save that succeeds before Redis confirmation is recovered without duplicate payment', async () => {
  const input = receiptInput();
  const receiptKey = getXianguSettlementReceiptKey(input);
  let failConfirmation = true;
  const redis = createRedis(new Map(), {
    failSet(key, value, options) {
      if (key !== receiptKey || options?.NX || !failConfirmation) return;
      const record = JSON.parse(value);
      if (record.state === 'applied') {
        failConfirmation = false;
        throw new Error('redis confirmation failed');
      }
    },
  });
  const store = createPlayerStore();
  await createXianguSettlementReceipt(redis, input, { now: 100 });

  const interrupted = await deliverXianguSettlementReceipt(redis, input, {
    loadPlayer: store.load,
    savePlayer: store.save,
    apply: (player, receipt) => {
      player.sourceStone += receipt.payload.sourceStone;
    },
  }, { now: 110 });
  assert.equal(interrupted.status, 'pending');
  assert.equal(store.value().sourceStone, 7);

  const recovered = await deliverXianguSettlementReceipt(redis, input, {
    loadPlayer: store.load,
    savePlayer: store.save,
    apply: () => {
      throw new Error('a marked player must not be paid twice');
    },
  }, { now: 120 });
  assert.equal(recovered.status, 'recovered');
  assert.equal(store.value().sourceStone, 7);
  assert.equal((await getXianguSettlementReceipt(redis, input)).state, 'applied');
});

test('concurrent delivery attempts run the reward callback once', async () => {
  const redis = createRedis();
  const store = createPlayerStore();
  const input = receiptInput();
  await createXianguSettlementReceipt(redis, input, { now: 100 });
  let applyCount = 0;
  const handlers = {
    loadPlayer: store.load,
    savePlayer: store.save,
    async apply(player, receipt) {
      applyCount += 1;
      await new Promise(resolve => setTimeout(resolve, 5));
      player.sourceStone += receipt.payload.sourceStone;
    },
  };

  const results = await Promise.all([
    deliverXianguSettlementReceipt(redis, input, handlers, { now: 110 }),
    deliverXianguSettlementReceipt(redis, input, handlers, { now: 110 }),
  ]);

  assert.equal(applyCount, 1);
  assert.equal(store.value().sourceStone, 7);
  assert.deepEqual(results.map(result => result.status).sort(), ['already-applied', 'applied']);
});

test('different receipts for one player serialize load/apply/save and preserve both rewards', async () => {
  const redis = createRedis();
  const store = createPlayerStore();
  const first = receiptInput({
    receiptId: 'xiangu:treasure-cell:era-2026:edge:first:10001',
    kind: 'treasure-cell',
    payload: { sourceStone: 3 },
  });
  const second = receiptInput({
    receiptId: 'xiangu:npc-kill-loot:era-2026:edge:second:10001',
    kind: 'npc-kill-loot',
    payload: { sourceStone: 5 },
  });
  await createXianguSettlementReceipt(redis, first, { now: 100 });
  await createXianguSettlementReceipt(redis, second, { now: 101 });

  let activeApplies = 0;
  let maxActiveApplies = 0;
  const observedBeforeValues = [];
  const handlers = {
    loadPlayer: store.load,
    savePlayer: store.save,
    async apply(player, receipt) {
      activeApplies += 1;
      maxActiveApplies = Math.max(maxActiveApplies, activeApplies);
      observedBeforeValues.push(player.sourceStone);
      await new Promise(resolve => setTimeout(resolve, 15));
      player.sourceStone += receipt.payload.sourceStone;
      activeApplies -= 1;
    },
  };

  const results = await Promise.all([
    deliverXianguSettlementReceipt(redis, first, handlers, { now: 110 }),
    deliverXianguSettlementReceipt(redis, second, handlers, { now: 110 }),
  ]);

  assert.equal(maxActiveApplies, 1);
  assert.deepEqual(observedBeforeValues.sort((left, right) => left - right), [0, 3]);
  assert.equal(store.value().sourceStone, 8);
  assert.deepEqual(results.map(result => result.status).sort(), ['applied', 'applied']);
  assert.equal(await redis.get(getXianguSettlementPlayerLockKey(first.playerId)), null);
});

test('receipt confirmation waits behind another delivery for the same player', async () => {
  const redis = createRedis();
  const store = createPlayerStore();
  const deliveryInput = receiptInput({
    receiptId: 'xiangu:treasure-cell:era-2026:edge:delivery-before-confirm:10001',
    kind: 'treasure-cell',
    payload: { sourceStone: 3 },
  });
  const confirmInput = receiptInput({
    receiptId: 'xiangu:npc-kill-loot:era-2026:edge:confirm-after-delivery:10001',
    kind: 'npc-kill-loot',
    payload: { sourceStone: 5 },
  });
  await createXianguSettlementReceipt(redis, deliveryInput, { now: 100 });
  await createXianguSettlementReceipt(redis, confirmInput, { now: 101 });

  let releaseApply;
  let markApplyStarted;
  const applyStarted = new Promise(resolve => {
    markApplyStarted = resolve;
  });
  const applyGate = new Promise(resolve => {
    releaseApply = resolve;
  });
  const events = [];
  const delivery = deliverXianguSettlementReceipt(redis, deliveryInput, {
    loadPlayer: store.load,
    savePlayer: store.save,
    async apply(player, receipt) {
      events.push('apply-start');
      markApplyStarted();
      await applyGate;
      player.sourceStone += receipt.payload.sourceStone;
      events.push('apply-end');
    },
  }, { now: 110, attempts: 100, retryDelay: 1 });

  await applyStarted;
  const confirmation = confirmXianguSettlementReceipt(redis, confirmInput, {}, {
    now: 111,
    attempts: 100,
    retryDelay: 1,
  }).then(result => {
    events.push('confirm-done');
    return result;
  });

  try {
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.deepEqual(events, ['apply-start']);
  } finally {
    releaseApply();
  }

  const [deliveryResult, confirmationResult] = await Promise.all([delivery, confirmation]);
  assert.equal(deliveryResult.status, 'applied');
  assert.equal(confirmationResult.status, 'applied');
  assert.deepEqual(events, ['apply-start', 'apply-end', 'confirm-done']);
  assert.equal(store.value().sourceStone, 3);
});

test('claim hook rejects without applying payload and persists a terminal player marker', async () => {
  const redis = createRedis();
  const store = createPlayerStore();
  const input = receiptInput({
    receiptId: 'xiangu:treasure-cell:era-2026:edge:rejected:10001',
    kind: 'treasure-cell',
  });
  await createXianguSettlementReceipt(redis, input, { now: 100 });
  let applyCalled = false;
  let rejectionSeen = false;

  const result = await deliverXianguSettlementReceipt(redis, input, {
    loadPlayer: store.load,
    savePlayer: store.save,
    claim: async player => {
      assert.equal(player.sourceStone, 0);
      return { claimed: false, record: { claimantId: 'other-player' } };
    },
    onClaimRejected: (player, _receipt, claim) => {
      rejectionSeen = claim.record.claimantId === 'other-player';
      assert.equal(player.sourceStone, 0);
    },
    apply: () => {
      applyCalled = true;
    },
  }, { now: 110 });

  assert.equal(result.status, 'rejected');
  assert.equal(applyCalled, false);
  assert.equal(rejectionSeen, true);
  assert.equal(store.value().sourceStone, 0);
  assert.equal(hasXianguSettlementReceiptClaim(store.value(), input.receiptId), true);
  const receipt = await getXianguSettlementReceipt(redis, input);
  assert.equal(receipt.state, 'applied');
  assert.equal(receipt.result.claimRejected, true);
});

test('thrown claim hook leaves the receipt pending and does not apply or mark the player', async () => {
  const redis = createRedis();
  const store = createPlayerStore();
  const input = receiptInput({
    receiptId: 'xiangu:npc-ecology-loot:era-2026:edge:pending-claim:10001',
    kind: 'npc-ecology-loot',
  });
  await createXianguSettlementReceipt(redis, input, { now: 100 });
  let applyCalled = false;
  let saveCalled = 0;

  const result = await deliverXianguSettlementReceipt(redis, input, {
    loadPlayer: store.load,
    savePlayer: async (...args) => {
      saveCalled += 1;
      return store.save(...args);
    },
    claim: async () => {
      throw new Error('shared claim unavailable');
    },
    apply: () => {
      applyCalled = true;
    },
  }, { now: 110 });

  assert.equal(result.status, 'pending');
  assert.equal(applyCalled, false);
  assert.equal(saveCalled, 0);
  assert.equal(store.value().sourceStone, 0);
  assert.equal(hasXianguSettlementReceiptClaim(store.value(), input.receiptId), false);
  assert.equal((await getXianguSettlementReceipt(redis, input)).state, 'pending');
});

test('busy delivery returns the durable receipt for an idempotent retry', async () => {
  const values = new Map();
  const redis = createRedis(values);
  const input = receiptInput({
    receiptId: 'xiangu:treasure-cell:era-2026:core:busy:10001',
    kind: 'treasure-cell',
  });
  await createXianguSettlementReceipt(redis, input, { now: 100 });
  values.set(`${getXianguSettlementReceiptKey(input)}:lock`, 'other-worker');

  const result = await deliverXianguSettlementReceipt(redis, input, {
    loadPlayer: async () => ({ sourceStone: 0 }),
    savePlayer: async () => {},
    apply: () => {},
  }, { attempts: 1, retryDelay: 1, now: 110 });

  assert.equal(result.status, 'busy');
  assert.equal(result.receipt.receiptId, input.receiptId);
});

test('pending receipts can be recovered from the per-player receipt index', async () => {
  const redis = createRedis();
  const store = createPlayerStore();
  const first = receiptInput({ receiptId: 'xiangu:death:era-2026:canon:npc-a:10001', payload: { sourceStone: 3 } });
  const second = receiptInput({
    worldSeed: 'era-2025',
    receiptId: 'xiangu:death:era-2025:canon:npc-b:10001',
    payload: { sourceStone: 5 },
  });
  await createXianguSettlementReceipt(redis, first, { now: 100 });
  await createXianguSettlementReceipt(redis, second, { now: 101 });

  const results = await recoverXianguSettlementReceipts(redis, first, {
    loadPlayer: store.load,
    savePlayer: store.save,
    apply: (player, receipt) => {
      player.sourceStone += receipt.payload.sourceStone;
    },
  }, { now: 120 });

  assert.equal(results.length, 2);
  assert.deepEqual(results.map(result => result.status), ['applied', 'applied']);
  assert.equal(store.value().sourceStone, 8);
  assert.deepEqual(await listXianguSettlementReceipts(redis, first), []);
  assert.deepEqual(
    (await readXianguSharedDocument(redis, {
      worldSeed: first.worldSeed,
      fragmentId: 'settlement-index',
      entityId: first.playerId,
    })).receiptIds,
    [],
  );
  assert.deepEqual(
    (await readXianguSharedDocument(redis, {
      worldSeed: 'all-rounds',
      fragmentId: 'settlement-index',
      entityId: first.playerId,
    })).entries,
    [],
  );
});

test('claim receipt ids are stable per world, source, and recipient', () => {
  const scope = { worldSeed: 'era:2026', fragmentId: 'core/a', entityId: 'dao-bone' };
  assert.equal(
    buildXianguSettlementReceiptId('treasure', scope, '10001'),
    buildXianguSettlementReceiptId('treasure', scope, '10001'),
  );
  assert.notEqual(
    buildXianguSettlementReceiptId('treasure', scope, '10001'),
    buildXianguSettlementReceiptId('treasure', scope, '10002'),
  );
});

test('recovery can filter receipt kinds so evacuation payloads are not treated as bag drops', async () => {
  const redis = createRedis();
  const store = createPlayerStore();
  const bagReceipt = receiptInput({
    receiptId: 'xiangu:treasure-cell:era-2026:core:a:10001',
    kind: 'treasure-cell',
    payload: { sourceStone: 2 },
  });
  const evacuationReceipt = receiptInput({
    receiptId: 'xiangu:evacuation:era-2026:evacuation:run-a:10001',
    kind: 'evacuation',
    payload: { bag: { sourceStone: 99 }, settlement: { sourceStone: 99 } },
  });
  await createXianguSettlementReceipt(redis, bagReceipt);
  await createXianguSettlementReceipt(redis, evacuationReceipt);

  const results = await recoverXianguSettlementReceipts(redis, bagReceipt, {
    loadPlayer: store.load,
    savePlayer: store.save,
    apply: (player, receipt) => {
      player.sourceStone += receipt.payload.sourceStone || 0;
    },
  }, { kinds: ['treasure-cell'] });

  assert.equal(results.length, 1);
  assert.equal(store.value().sourceStone, 2);
  assert.equal((await getXianguSettlementReceipt(redis, evacuationReceipt)).state, 'pending');
});

test('a receipt remains deliverable when its recovery index is temporarily unavailable', async () => {
  const redis = createRedis(new Map(), {
    failSet(key) {
      if (key.includes(':document:')) throw new Error('shared index unavailable');
    },
  });
  const input = receiptInput({ receiptId: 'xiangu:treasure-cell:era-2026:core:index-failure:10001' });
  const created = await createXianguSettlementReceipt(redis, input);
  assert.equal(created.receipt.state, 'pending');
  assert.equal((await getXianguSettlementReceipt(redis, input)).payload.sourceStone, 7);
});

test('recovery can rebuild missing indexes from durable receipt keys', async () => {
  const values = new Map();
  const redis = createRedis(values, {
    failSet(key) {
      if (key.includes(':document:')) throw new Error('shared index unavailable');
    },
  });
  redis.keys = async pattern => [...values.keys()]
    .filter(key => key.startsWith('xiuxian:xiangu:settlement:era-2026:10001:'));
  const input = receiptInput({
    receiptId: 'xiangu:npc-kill-loot:era-2026:canon:npc-index-rebuild:10001',
    kind: 'npc-kill-loot',
  });
  const store = createPlayerStore();
  await createXianguSettlementReceipt(redis, input);

  const results = await recoverXianguSettlementReceipts(redis, input, {
    loadPlayer: store.load,
    savePlayer: store.save,
    apply: (player, receipt) => {
      player.sourceStone += receipt.payload.sourceStone;
    },
  }, { rebuildIndex: true, kinds: ['npc-kill-loot'] });

  assert.deepEqual(results.map(result => result.status), ['applied']);
  assert.equal(store.value().sourceStone, 7);
});
