import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import test from 'node:test';
import { worldChatClient } from '../apps/worldChat/client.js';
import {
  createWorldWebLink,
  registerWorldWebController,
} from '../model/endlessWebServer.js';

class MemoryRedis {
  data = new Map();
  async get(key) { return this.data.get(key) ?? null; }
  async set(key, value, options = {}) {
    if (options.NX && this.data.has(key)) return null;
    this.data.set(key, value);
    return 'OK';
  }
}

function prepare(t, controller) {
  const previousRedis = globalThis.redis;
  const redis = new MemoryRedis();
  globalThis.redis = redis;
  registerWorldWebController(controller);
  t.after(() => {
    globalThis.redis = previousRedis;
    registerWorldWebController(null);
  });
  const base = {
    kind: 'world',
    sessionId: 'world-session-a',
    identity: { userId: 'player-a', groupId: 'group-a', displayName: 'test player' },
  };
  return {
    redis,
    invoke: (operation, body = {}, overrides = {}) =>
      worldChatClient.webRelayHandler({ ...base, operation, body, ...overrides }),
  };
}

test('world links use relay tickets without starting a local HTTP server', async t => {
  const redisBefore = globalThis.redis;
  const original = {
    authed: worldChatClient.authed,
    ws: worldChatClient.ws,
    createWebTicket: worldChatClient.createWebTicket,
  };
  const portBefore = process.env.ENDLESS_WEB_PORT;
  const socket = http.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    Object.assign(worldChatClient, original);
    globalThis.redis = redisBefore;
    if (portBefore === undefined) delete process.env.ENDLESS_WEB_PORT;
    else process.env.ENDLESS_WEB_PORT = portBefore;
    registerWorldWebController(null);
    await new Promise(resolve => socket.close(resolve));
  });
  process.env.ENDLESS_WEB_PORT = String(socket.address().port);
  globalThis.redis = new MemoryRedis();
  worldChatClient.authed = true;
  worldChatClient.ws = { readyState: worldChatClient.WebSocket.OPEN };
  const identity = { userId: 'player-a', groupId: 'group-a' };
  worldChatClient.createWebTicket = async (kind, value) => {
    assert.equal(kind, 'world');
    assert.deepEqual(value, identity);
    return { ok: true, token: 'relay-world-ticket' };
  };
  assert.match(await createWorldWebLink({}, identity), /\/world\?t=relay-world-ticket$/);
  assert.equal(globalThis.redis.data.size, 0);
});

test('source world controller preserves ticket identity and caches each write receipt', async t => {
  const calls = [];
  const controller = {
    assertWorldWebSession(session) {
      assert.equal(session.userId, 'player-a');
      assert.equal(session.groupId, 'group-a');
    },
    async getWorldWebState(session) { return { viewer: { id: session.userId }, inventory: [] }; },
  };
  const methods = {
    message: 'sendWorldWebMessage',
    'trade.create': 'createWorldWebTrade',
    'trade.accept': 'acceptWorldWebTrade',
    'trade.cancel': 'cancelWorldWebTrade',
  };
  for (const [operation, method] of Object.entries(methods)) {
    controller[method] = async (session, body) => {
      calls.push({ operation, session, body });
      return { ok: true, message: operation };
    };
  }
  const { invoke } = prepare(t, controller);
  assert.equal((await invoke('state')).payload.state.viewer.id, 'player-a');
  for (const operation of Object.keys(methods)) {
    const body = { operationId: crypto.randomUUID(), userId: 'forged-user', groupId: 'forged-group', text: 'test' };
    const result = await invoke(operation, body);
    assert.equal(result.status, 200);
    assert.deepEqual(await invoke(operation, body), result);
    assert.equal(calls.at(-1).session.userId, 'player-a');
    assert.equal(calls.at(-1).session.groupId, 'group-a');
    assert.equal(calls.at(-1).session.token, 'relay:world-session-a');
    const mismatch = await invoke(operation, { ...body, text: 'changed' });
    assert.equal(mismatch.status, 409);
  }
  assert.equal(calls.length, 4);
  assert.equal((await invoke('trade.create', {})).status, 400);
  assert.equal((await invoke('remove-player', {})).status, 404);
  assert.equal((await invoke('state', {}, { identity: { userId: 'player-a' } })).status, 401);
});

test('concurrent identical world writes execute only once', async t => {
  let release;
  let started;
  let calls = 0;
  const waiting = new Promise(resolve => { started = resolve; });
  const { invoke } = prepare(t, {
    async createWorldWebTrade() {
      calls++;
      started();
      await new Promise(resolve => { release = resolve; });
      return { ok: true, code: 'TEST-ORDER' };
    },
  });
  const body = { operationId: crypto.randomUUID() };
  const pending = invoke('trade.create', body);
  await waiting;
  assert.equal((await invoke('trade.create', body)).status, 409);
  release();
  const receipt = await pending;
  assert.equal(receipt.status, 200);
  assert.deepEqual(await invoke('trade.create', body), receipt);
  assert.equal(calls, 1);
});

test('uncertain world writes retain a lock rather than executing again', async t => {
  let calls = 0;
  const { invoke } = prepare(t, {
    async acceptWorldWebTrade() {
      calls++;
      throw new Error('upstream response lost after a write');
    },
  });
  const body = { operationId: crypto.randomUUID(), code: 'TEST-ORDER' };
  assert.equal((await invoke('trade.accept', body)).status, 503);
  assert.equal((await invoke('trade.accept', body)).status, 409);
  assert.equal(calls, 1);
});

test('receipt storage failures never release an executed world write for retry', async t => {
  let calls = 0;
  const { invoke, redis } = prepare(t, {
    async cancelWorldWebTrade() { calls++; return { ok: true }; },
  });
  const set = redis.set.bind(redis);
  redis.set = async (key, value, options) => {
    if (!options.NX) throw new Error('receipt storage unavailable');
    return set(key, value, options);
  };
  const body = { operationId: crypto.randomUUID() };
  assert.equal((await invoke('trade.cancel', body)).status, 503);
  assert.equal((await invoke('trade.cancel', body)).status, 409);
  assert.equal(calls, 1);
});

test('source permission revocation is checked before cached receipts', async t => {
  let joined = true;
  let calls = 0;
  const { invoke } = prepare(t, {
    async assertWorldWebSession() {
      if (!joined) throw new Error('group left world chat');
    },
    async sendWorldWebMessage() { calls++; return { ok: true }; },
  });
  const body = { operationId: crypto.randomUUID() };
  assert.equal((await invoke('message', body)).status, 200);
  joined = false;
  await assert.rejects(invoke('message', body), /group left/);
  await assert.rejects(invoke('state'), /group left/);
  assert.equal(calls, 1);
});

test('world receipts are isolated per relay session and preserve domain failures', async t => {
  let calls = 0;
  const { invoke } = prepare(t, {
    async createWorldWebTrade() { calls++; return { ok: false, reason: 'trade_not_allowed' }; },
  });
  const body = { operationId: crypto.randomUUID() };
  const result = await invoke('trade.create', body);
  assert.equal(result.status, 400);
  assert.equal(result.payload.reason, 'trade_not_allowed');
  assert.deepEqual(await invoke('trade.create', body), result);
  assert.equal(calls, 1);
  assert.deepEqual(await invoke('trade.create', body, { sessionId: 'world-session-b' }), result);
  assert.equal(calls, 2);
});
