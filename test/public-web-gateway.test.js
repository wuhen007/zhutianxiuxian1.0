import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { WorldChatClient } from '../apps/worldChat/client.js';
import { startEndlessWebServer } from '../model/endlessWebServer.js';
import { createWorldChatServer } from '../worldchat-server/server.js';
import { startWebGateway } from '../web-gateway/gateway.js';

const logger = { info() {}, warn() {}, error() {} };

class MemoryRedis {
  data = new Map();
  isReady = true;
  async get(key) { return this.data.get(key) ?? null; }
  async getDel(key) {
    const result = await this.get(key);
    this.data.delete(key);
    return result;
  }
  async set(key, value, options = {}) {
    if (options.NX && this.data.has(key)) return null;
    this.data.set(key, value);
    return 'OK';
  }
  async del(key) { return Number(this.data.delete(key)); }
  async incr(key) {
    const value = Number(this.data.get(key) || 0) + 1;
    this.data.set(key, value);
    return value;
  }
  async expire() { return true; }
}

async function waitFor(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'timed out waiting for the local relay');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

test('relay-mode plugin startup needs neither local Redis nor an HTTP listener', async () => {
  const saved = globalThis.redis;
  delete globalThis.redis;
  try {
    assert.equal(await startEndlessWebServer({}), null);
  } finally {
    if (saved !== undefined) globalThis.redis = saved;
  }
});

test('public HTTP gateway serves two source bots without any local game controller', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'public-web-gateway-'));
  const identities = Object.fromEntries(['bot_a', 'bot_b', 'gateway'].map(id => [
    id, { name: id, secret: crypto.randomBytes(32).toString('hex') },
  ]));
  const relay = createWorldChatServer({
    baseDir: directory,
    clients: identities,
    logger,
    config: { HOST: '127.0.0.1', PORT: 0 },
  });
  const address = await relay.start();
  const clients = Object.fromEntries(Object.entries(identities).map(([id, identity]) => [
    id,
    new WorldChatClient({
      persist: false,
      config: {
        enable: false,
        web_relay_enabled: true,
        url: `ws://127.0.0.1:${address.port}`,
        server_id: id,
        secret: identity.secret,
        name: id,
      },
    }),
  ]));
  const calls = [];
  for (const id of ['bot_a', 'bot_b']) {
    clients[id].setWebRelayHandler(async request => {
      calls.push({ id, ...request });
      return {
        status: 200,
        payload: { ok: true, state: { bot: id, userId: request.identity.userId } },
      };
    });
    clients[id].connect();
  }
  const redisClient = new MemoryRedis();
  const config = {
    enabled: true,
    relayEnabled: true,
    host: '127.0.0.1',
    port: 0,
    publicUrl: 'http://127.0.0.1',
    sessionTtlSeconds: 7200,
  };
  const gateway = await startWebGateway({
    config, redisClient, relayClient: clients.gateway, logger,
  });
  config.publicUrl = `http://127.0.0.1:${gateway.server.address().port}`;
  t.after(async () => {
    await gateway.close();
    for (const client of Object.values(clients)) client.close();
    await relay.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await waitFor(() => Object.values(clients).every(client => client.authed));

  for (const asset of ['/endless', '/endless/app.js', '/endless/style.css', '/endless/realm.jpg', '/endless/number.ttf',
    '/world', '/world/app.js', '/world/style.css', '/world/lucide.min.js', '/world/number.ttf']) {
    const response = await fetch(`${config.publicUrl}${asset}`);
    assert.equal(response.status, 200, asset);
    assert.ok((await response.arrayBuffer()).byteLength > 0, asset);
  }
  assert.equal((await fetch(`${config.publicUrl}/readyz`)).status, 200);
  assert.equal((await fetch(`${config.publicUrl}/api/endless/state`)).status, 401);
  assert.equal((await fetch(`${config.publicUrl}/api/world/state`)).status, 401);

  async function openSession(client, kind, userId) {
    const ticket = await client.createWebTicket(kind, {
      userId, groupId: `${userId}_group`, teamId: `${userId}_team`, runId: `${userId}_run`,
    });
    assert.equal(ticket.ok, true);
    const response = await fetch(`${config.publicUrl}/api/${kind}/session`, {
      method: 'POST',
      headers: { origin: config.publicUrl, 'content-type': 'application/json' },
      body: JSON.stringify(kind === 'canglan' ? { ticket: ticket.token } : { token: ticket.token }),
    });
    assert.equal(response.status, 200);
    assert.equal((await clients.gateway.openWebSession(ticket.token)).reason, 'web_ticket_expired');
    return response.headers.get('set-cookie').split(';')[0];
  }

  for (const id of ['bot_a', 'bot_b']) {
    const cookie = await openSession(clients[id], 'endless', `${id}_user`);
    const state = await fetch(`${config.publicUrl}/api/endless/state`, { headers: { cookie } });
    assert.deepEqual((await state.json()).state, { bot: id, userId: `${id}_user` });
    const denied = await fetch(`${config.publicUrl}/api/endless/action`, {
      method: 'POST',
      headers: { cookie, origin: 'https://other.example', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'advance', operationId: crypto.randomUUID() }),
    });
    assert.equal(denied.status, 403);
    const action = await fetch(`${config.publicUrl}/api/endless/action`, {
      method: 'POST',
      headers: { cookie, origin: config.publicUrl, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'advance', operationId: crypto.randomUUID() }),
    });
    assert.equal(action.status, 200);
    assert.equal((await action.json()).state.bot, id);
  }
  for (const kind of ['canglan', 'survey']) {
    const cookie = await openSession(clients.bot_b, kind, `${kind}_user`);
    const response = await fetch(`${config.publicUrl}/api/${kind}/state`, { headers: { cookie } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).state.bot, 'bot_b');
  }
  assert.deepEqual(calls.map(call => call.id), ['bot_a', 'bot_a', 'bot_b', 'bot_b', 'bot_b', 'bot_b']);

  calls.length = 0;
  for (const id of ['bot_a', 'bot_b']) {
    const cookie = await openSession(clients[id], 'world', `${id}_viewer`);
    const state = await fetch(`${config.publicUrl}/api/world/state`, { headers: { cookie } });
    assert.equal(state.status, 200);
    assert.deepEqual((await state.json()).state, { bot: id, userId: `${id}_viewer` });
    assert.equal(calls.at(-1).kind, 'world');
    assert.equal(calls.at(-1).identity.groupId, `${id}_viewer_group`);
    assert.equal((await fetch(`${config.publicUrl}/api/endless/state`, { headers: { cookie } })).status, 401);

    for (const [route, operation] of [
      ['message', 'message'], ['trade', 'trade.create'],
      ['trade/accept', 'trade.accept'], ['trade/cancel', 'trade.cancel'],
    ]) {
      const body = { operationId: crypto.randomUUID(), text: 'test', code: 'TEST-ONLY', userId: 'forged-user' };
      const request = {
        method: 'POST',
        headers: { cookie, origin: config.publicUrl, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      };
      const response = await fetch(`${config.publicUrl}/api/world/${route}`, request);
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).state, { bot: id, userId: `${id}_viewer` });
      assert.equal(calls.at(-1).operation, operation);
      assert.equal(calls.at(-1).identity.userId, `${id}_viewer`);
      assert.deepEqual(calls.at(-1).body, body);
      const beforeDenied = calls.length;
      const denied = await fetch(`${config.publicUrl}/api/world/${route}`, {
        ...request, headers: { ...request.headers, origin: 'https://other.example' },
      });
      assert.equal(denied.status, 403);
      assert.equal(calls.length, beforeDenied);
    }
    const unknown = await fetch(`${config.publicUrl}/api/world/remove-player`, {
      method: 'POST', headers: { cookie, origin: config.publicUrl },
    });
    assert.equal(unknown.status, 404);
  }
  assert.deepEqual(calls.map(call => call.id), [
    ...Array(5).fill('bot_a'), ...Array(5).fill('bot_b'),
  ]);

  clients.gateway.authed = false;
  assert.equal((await fetch(`${config.publicUrl}/readyz`)).status, 503);
  assert.equal((await fetch(`${config.publicUrl}/healthz`)).status, 200);
  assert.equal((await fetch(`${config.publicUrl}/api/endless/state`)).status, 503);
  assert.equal((await fetch(`${config.publicUrl}/api/world/state`)).status, 503);
  clients.gateway.authed = true;
  redisClient.isReady = false;
  assert.equal((await fetch(`${config.publicUrl}/readyz`)).status, 503);
  assert.equal((await fetch(`${config.publicUrl}/api/endless/state`)).status, 503);
});
