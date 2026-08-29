import assert from 'node:assert/strict';
import test from 'node:test';
import {
  consumeCanglanWebTicket,
  createCanglanWebLink,
  createEndlessWebHttpServer,
  issueCanglanWebTicket,
  registerCanglanWebController,
} from '../model/endlessWebServer.js';
import { worldChatClient } from '../apps/worldChat/client.js';

class MemoryRedis {
  data = new Map();

  async set(key, value, options = {}) {
    if (options.NX && this.data.has(key)) return null;
    this.data.set(key, String(value));
    return 'OK';
  }

  async get(key) {
    return this.data.get(key) ?? null;
  }

  async getDel(key) {
    const value = await this.get(key);
    this.data.delete(key);
    return value;
  }

  async del(key) {
    return this.data.delete(key) ? 1 : 0;
  }

  async incr(key) {
    const value = Number(await this.get(key)) + 1;
    this.data.set(key, String(value));
    return value;
  }

  async expire() {
    return true;
  }
}

test('沧澜网页票据使用独立命名空间且只能兑换一次', async () => {
  const redis = new MemoryRedis();
  const config = { ticketTtlSeconds: 120 };
  const identity = { userId: '10001', runId: 'run-local-1' };
  const ticket = await issueCanglanWebTicket(redis, config, identity);

  assert.equal(
    [...redis.data.keys()].some(key => key.startsWith('Xiuxian:Canglan:Web:Ticket:')),
    true
  );
  assert.equal([...redis.data.keys()].some(key => key.startsWith('Xiuxian:Endless:Web:')), false);
  assert.deepEqual(await consumeCanglanWebTicket(redis, ticket), identity);
  assert.equal(await consumeCanglanWebTicket(redis, ticket), null);
});

test('沧澜网页在中继部署下由总机签发入口', async t => {
  const redis = new MemoryRedis();
  const previousRedis = globalThis.redis;
  const original = {
    authed: worldChatClient.authed,
    createWebTicket: worldChatClient.createWebTicket,
  };
  const tickets = [];
  globalThis.redis = redis;
  worldChatClient.authed = true;
  worldChatClient.createWebTicket = async (kind, identity) => {
    tickets.push({ kind, identity });
    return { ok: true, token: 'relay-canglan-ticket' };
  };
  t.after(() => {
    globalThis.redis = previousRedis;
    Object.assign(worldChatClient, original);
    registerCanglanWebController(null);
  });

  await assert.rejects(
    createCanglanWebLink({}, { userId: 10001 }),
    /缺少远征轮次/
  );
  const link = await createCanglanWebLink({}, { userId: 10001, runId: 'run-relay-1' });
  assert.equal(new URL(link).searchParams.get('ticket'), 'relay-canglan-ticket');
  assert.deepEqual(tickets, [{
    kind: 'canglan',
    identity: { userId: '10001', runId: 'run-relay-1' },
  }]);
  assert.equal(
    [...redis.data.keys()].some(key => key.startsWith('Xiuxian:Canglan:Web:Ticket:')),
    false
  );
});

test('沧澜网页会话可读取状态并幂等提交星图操作', async t => {
  const redis = new MemoryRedis();
  const state = {
    player: {
      name: '荒古修士',
      realm: '大帝',
      mind: 95,
      maxMind: 100,
      mindRemainder: 0,
      positionId: 'star-0',
    },
    nodes: [
      { id: 'star-0', q: 0, r: 0, name: '沧澜祖星', status: 'anchored' },
      { id: 'star-1', q: 1, r: 0, name: '青冥大星', status: 'observed' },
    ],
    pressure: 12,
  };
  const calls = [];
  let stateReads = 0;
  const canglanController = {
    async getWebState(identity) {
      calls.push(['state', identity]);
      stateReads += 1;
      if (stateReads > 1) throw new Error('state temporarily unavailable');
      return structuredClone(state);
    },
    async performWebAction(input) {
      calls.push(['action', input]);
      state.player.positionId = input.targetId;
      state.player.mind -= 1;
      return {
        ok: true,
        message: '已跃迁至青冥大星',
      };
    },
  };
  const config = {
    publicUrl: 'http://127.0.0.1',
    ticketTtlSeconds: 120,
    sessionTtlSeconds: 3600,
  };
  const server = createEndlessWebHttpServer({
    realm: null,
    redisClient: redis,
    config,
    canglanController,
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  config.publicUrl = base;

  for (const asset of ['/canglan', '/canglan/app.js', '/canglan/style.css']) {
    const response = await fetch(`${base}${asset}`);
    assert.equal(response.status, 200);
  }

  const unboundTicket = await issueCanglanWebTicket(redis, config, { userId: '10001' });
  const unboundLogin = await fetch(`${base}/api/canglan/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ ticket: unboundTicket }),
  });
  assert.equal(unboundLogin.status, 401);

  const ticket = await issueCanglanWebTicket(redis, config, {
    userId: '10001',
    runId: 'run-local-2',
  });
  const rejected = await fetch(`${base}/api/canglan/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://wrong-origin.example' },
    body: JSON.stringify({ ticket }),
  });
  assert.equal(rejected.status, 403);

  const login = await fetch(`${base}/api/canglan/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ ticket }),
  });
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /^canglan_session=/);
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.match(login.headers.get('set-cookie'), /SameSite=Strict/);
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const replayLogin = await fetch(`${base}/api/canglan/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ ticket }),
  });
  assert.equal(replayLogin.status, 401);

  const stateResponse = await fetch(`${base}/api/canglan/state`, {
    headers: { Cookie: cookie },
  });
  assert.equal(stateResponse.status, 200);
  assert.equal((await stateResponse.json()).state.player.positionId, 'star-0');
  assert.deepEqual(calls[0], ['state', { userId: '10001', runId: 'run-local-2' }]);

  const body = {
    action: 'move',
    targetId: 'star-1',
    operationId: 'canglan-operation-0001',
  };
  const sendAction = () => fetch(`${base}/api/canglan/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie },
    body: JSON.stringify(body),
  });
  const action = await sendAction();
  assert.equal(action.status, 200);
  const result = await action.json();
  assert.equal(result.message, '已跃迁至青冥大星');
  assert.equal(Object.hasOwn(result, 'state'), false);

  const replayAction = await sendAction();
  assert.equal(replayAction.status, 200);
  assert.deepEqual(await replayAction.json(), result);
  assert.equal(calls.filter(([kind]) => kind === 'action').length, 1);
  assert.deepEqual(calls.find(([kind]) => kind === 'action')[1], {
    userId: '10001',
    runId: 'run-local-2',
    action: 'move',
    targetId: 'star-1',
    operationId: 'canglan-operation-0001',
  });

  const noSession = await fetch(`${base}/api/canglan/state`);
  assert.equal(noSession.status, 401);
});

test('沧澜网页网关会话把状态与操作转发回签发区服', async t => {
  const redis = new MemoryRedis();
  const original = {
    authed: worldChatClient.authed,
    openWebSession: worldChatClient.openWebSession,
    webRequest: worldChatClient.webRequest,
  };
  const relayed = [];
  worldChatClient.authed = true;
  worldChatClient.openWebSession = async token => ({
    ok: token === 'canglan-relay-ticket',
    kind: 'canglan',
    session_id: 'relay-session-1',
  });
  worldChatClient.webRequest = async (sessionId, operation, body) => {
    relayed.push({ sessionId, operation, body });
    return {
      ok: true,
      result: operation === 'state'
        ? { status: 200, payload: { ok: true, state: { player: { positionId: 'star-0' } } } }
        : { status: 200, payload: { ok: true, message: '中继移动完成' } },
    };
  };
  t.after(() => Object.assign(worldChatClient, original));

  const config = {
    publicUrl: 'http://127.0.0.1',
    ticketTtlSeconds: 120,
    sessionTtlSeconds: 3600,
  };
  const server = createEndlessWebHttpServer({ realm: null, redisClient: redis, config });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  config.publicUrl = base;

  const login = await fetch(`${base}/api/canglan/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ ticket: 'canglan-relay-ticket' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const state = await fetch(`${base}/api/canglan/state`, { headers: { Cookie: cookie } });
  assert.equal(state.status, 200);
  assert.equal((await state.json()).state.player.positionId, 'star-0');

  const actionBody = {
    action: 'move',
    targetId: 'star-1',
    operationId: 'canglan-relay-operation-0002',
  };
  const action = await fetch(`${base}/api/canglan/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie },
    body: JSON.stringify(actionBody),
  });
  assert.equal(action.status, 200);
  assert.equal((await action.json()).message, '中继移动完成');
  assert.deepEqual(relayed, [
    { sessionId: 'relay-session-1', operation: 'state', body: {} },
    { sessionId: 'relay-session-1', operation: 'action', body: actionBody },
  ]);
});

test('沧澜网页回源处理器保留远征轮次并幂等调用当前区服 controller', async t => {
  const redis = new MemoryRedis();
  const previousRedis = globalThis.redis;
  const calls = [];
  globalThis.redis = redis;
  registerCanglanWebController({
    async getWebState(identity) {
      calls.push(['state', identity]);
      return { player: { positionId: 'star-0' } };
    },
    async performWebAction(input) {
      calls.push(['action', input]);
      return { ok: true, message: '回源移动完成' };
    },
  });
  t.after(() => {
    globalThis.redis = previousRedis;
    registerCanglanWebController(null);
  });

  const request = {
    kind: 'canglan',
    sessionId: 'relay-source-session-1',
    identity: { userId: '10001', runId: 'run-source-1', displayName: '荒古修士' },
  };
  const state = await worldChatClient.webRelayHandler({ ...request, operation: 'state', body: {} });
  assert.equal(state.payload.state.player.positionId, 'star-0');
  const actionBody = {
    action: 'move',
    targetId: 'star-1',
    operationId: 'canglan-source-operation-0001',
  };
  const first = await worldChatClient.webRelayHandler({
    ...request,
    operation: 'action',
    body: actionBody,
  });
  const replay = await worldChatClient.webRelayHandler({
    ...request,
    operation: 'action',
    body: actionBody,
  });
  assert.deepEqual(replay, first);
  assert.equal(calls.filter(([kind]) => kind === 'action').length, 1);
  assert.deepEqual(calls.find(([kind]) => kind === 'action')[1], {
    userId: '10001',
    runId: 'run-source-1',
    displayName: '荒古修士',
    ...actionBody,
  });
});
