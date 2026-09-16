import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { worldChatClient } from '../apps/worldChat/client.js';
import { createEndlessWebHttpServer, registerWorldWebController } from '../model/endlessWebServer.js';

class MemoryRedis {
  data = new Map();
  isReady = true;
  async get(key) { return this.data.get(key) ?? null; }
  async getDel(key) {
    const value = await this.get(key);
    this.data.delete(key);
    return value;
  }
  async set(key, value, options = {}) {
    if (options.NX && this.data.has(key)) return null;
    this.data.set(key, value);
    return 'OK';
  }
  async incr(key) {
    const value = Number(this.data.get(key) || 0) + 1;
    this.data.set(key, value);
    return value;
  }
  async expire() { return true; }
}

async function fixture(t) {
  const previous = globalThis.redis;
  globalThis.redis = new MemoryRedis();
  const received = [];
  const writes = [];
  const controller = {
    assertWorldWebSession(session) { assert.equal(session.userId, 'qa-user'); },
  };
  for (const method of ['sendWorldWebMessage', 'createWorldWebTrade', 'acceptWorldWebTrade', 'cancelWorldWebTrade']) {
    controller[method] = async (session, body) => {
      writes.push({ method, session, body });
      return { ok: true, sequence: writes.length };
    };
  }
  registerWorldWebController(controller);
  const relayClient = {
    authed: true,
    async openWebSession(token) {
      return { ok: true, kind: 'world', session_id: token };
    },
    async webRequest(sessionId, operation, body) {
      received.push({ sessionId, operation, body });
      return {
        ok: true,
        result: await worldChatClient.webRelayHandler({
          kind: 'world', sessionId, operation, body,
          identity: { userId: 'qa-user', groupId: 'qa-group' },
        }),
      };
    },
  };
  const config = { publicUrl: 'http://127.0.0.1', sessionTtlSeconds: 7200 };
  const server = createEndlessWebHttpServer({
    realm: null, config, redisClient: new MemoryRedis(), relayClient, gatewayMode: true,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  config.publicUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    globalThis.redis = previous;
    registerWorldWebController(null);
  });
  async function login(token = 'test-session-a') {
    const response = await fetch(`${config.publicUrl}/api/world/session`, {
      method: 'POST',
      headers: { origin: config.publicUrl, 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  }
  async function post(cookie, route, body, origin = config.publicUrl) {
    return fetch(`${config.publicUrl}/api/world/${route}`, {
      method: 'POST',
      headers: { origin, cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return { base: config.publicUrl, received, writes, login, post };
}

test('world HTML uses a content-fingerprinted script and never caches the entry document', async t => {
  const { base } = await fixture(t);
  const page = await fetch(`${base}/world`);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  const html = await page.text();
  const source = fs.readFileSync(new URL('../resources/web/world/app.js', import.meta.url));
  const hash = crypto.createHash('sha256').update(source).digest('hex').slice(0, 20);
  assert.ok(html.includes(`src="/world/app.${hash}.js"`));
  assert.equal(html.includes('/world/app.js?v=20260820'), false);
  const script = await fetch(`${base}/world/app.${hash}.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get('cache-control'), /immutable/);
  assert.equal(await script.text(), source.toString('utf8'));
  const oldPath = await fetch(`${base}/world/app.js?v=20260820`);
  assert.equal(oldPath.headers.get('cache-control'), 'no-store');
  assert.equal(await oldPath.text(), source.toString('utf8'));
  assert.equal((await fetch(`${base}/world/app.00000000000000000000.js`)).status, 404);
});

test('cached old world pages without operation IDs can write, and replays execute only once', async t => {
  const { login, post, writes, received } = await fixture(t);
  const cookie = await login();
  for (const [route, body] of [
    ['message', { text: 'test message' }],
    ['trade', { targetServerId: 'qa_other', give: [], want: [] }],
    ['trade/accept', { code: 'QA-ONLY' }],
    ['trade/cancel', { code: 'QA-ONLY' }],
  ]) {
    const first = await post(cookie, route, body);
    assert.equal(first.status, 200);
    const receipt = await first.json();
    const operationId = received.at(-1).body.operationId;
    assert.match(operationId, /^[A-Za-z0-9-]{16,64}$/);
    const replay = await post(cookie, route, body);
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), receipt);
    assert.equal(received.at(-1).body.operationId, operationId);
  }
  assert.equal(writes.length, 4);
});

test('legacy IDs are isolated by session, operation and body while explicit IDs remain unchanged', async t => {
  const { login, post, writes, received } = await fixture(t);
  const firstCookie = await login('first-world-session');
  const secondCookie = await login('second-world-session');
  await post(firstCookie, 'message', { text: 'first' });
  await post(firstCookie, 'message', { text: 'second' });
  await post(secondCookie, 'message', { text: 'first' });
  await post(firstCookie, 'trade/accept', { code: 'TEST' });
  await post(firstCookie, 'trade/cancel', { code: 'TEST' });
  assert.equal(new Set(received.map(item => item.body.operationId)).size, 5);
  const operationId = crypto.randomUUID();
  await post(firstCookie, 'message', { text: 'first', operationId });
  assert.equal(received.at(-1).body.operationId, operationId);
  assert.equal(writes.length, 6);
  const bad = await post(firstCookie, 'message', { text: 'first', operationId: 'invalid' });
  assert.equal(bad.status, 400);
  assert.equal(writes.length, 6);
});

test('legacy compatibility keeps source and login checks intact', async t => {
  const { login, post, writes, received } = await fixture(t);
  const cookie = await login();
  assert.equal((await post(cookie, 'message', { text: 'test' }, 'https://other.example')).status, 403);
  assert.equal((await post('', 'message', { text: 'test' })).status, 401);
  assert.equal(received.length, 0);
  assert.equal(writes.length, 0);
});
