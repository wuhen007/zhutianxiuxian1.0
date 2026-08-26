import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_CONFIG_PATH,
  DEFAULT_INSTALLATION_PATH,
  WorldChatClient,
  loadConfig,
} from '../apps/worldChat/client.js';
import { sendWorldGroupMessage } from '../apps/worldChat/runtime.js';
import { createWorldChatServer } from '../worldchat-server/server.js';

const silentLogger = { info() {}, warn() {}, error() {} };
const secret = () => crypto.randomBytes(32).toString('hex');

async function waitFor(predicate, message, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(message);
}

function clientConfig(url, serverId, clientSecret, groupId) {
  return {
    enable: true,
    url,
    server_id: serverId,
    secret: clientSecret,
    name: `区服-${serverId}`,
    query_default: 10,
    expose_group: false,
    joined_groups: [groupId],
    last_seen_seq: 0,
  };
}

test('默认身份配置存放在插件目录外的独立数据目录', () => {
  assert.equal(path.dirname(DEFAULT_CONFIG_PATH), path.dirname(DEFAULT_INSTALLATION_PATH));
  assert.equal(path.basename(path.dirname(DEFAULT_CONFIG_PATH)), 'zhutian-worldchat');
});

test('首次配置为每个安装生成独立且稳定的区服凭据', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'worldchat-config-'));
  try {
    const firstPath = path.join(directory, 'first.json');
    const secondPath = path.join(directory, 'second.json');
    const first = loadConfig(firstPath);
    const second = loadConfig(secondPath);
    const reloaded = loadConfig(firstPath);

    assert.notEqual(first.server_id, second.server_id);
    assert.notEqual(first.secret, second.secret);
    assert.equal(first.server_id, reloaded.server_id);
    assert.equal(first.secret, reloaded.secret);
    assert.match(first.secret, /^[a-f0-9]{64}$/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('复制到另一安装的运行凭据会自动换领独立身份', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'worldchat-copy-'));
  const enrollmentPath = path.join(directory, 'enrollment.local.json');
  const firstPath = path.join(directory, 'first.json');
  const secondPath = path.join(directory, 'second.json');
  const firstInstall = path.join(directory, 'first-install.id');
  const secondInstall = path.join(directory, 'second-install.id');
  const enrollmentToken = secret();
  const server = createWorldChatServer({
    baseDir: directory,
    logger: silentLogger,
    config: {
      HOST: '127.0.0.1',
      PORT: 0,
      ENROLLMENT_TOKEN: enrollmentToken,
      MAX_REGISTRATIONS_PER_MINUTE: 20,
    },
  });
  const address = await server.start();
  const url = `ws://127.0.0.1:${address.port}`;
  fs.writeFileSync(
    enrollmentPath,
    JSON.stringify({ url, enrollment_token: enrollmentToken })
  );

  const first = new WorldChatClient({
    configPath: firstPath,
    config: loadConfig(firstPath, enrollmentPath, firstInstall),
  });
  let second;
  t.after(async () => {
    first.close();
    second?.close();
    await server.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  first.connect();
  await waitFor(() => first.authed, '第一安装未完成自动登记');
  fs.copyFileSync(firstPath, secondPath);

  const copiedConfig = loadConfig(secondPath, enrollmentPath, secondInstall);
  assert.equal(copiedConfig.server_id, '');
  assert.equal(copiedConfig.secret, '');
  assert.notEqual(copiedConfig.installation_id, first.cfg.installation_id);
  second = new WorldChatClient({
    configPath: secondPath,
    config: copiedConfig,
  });
  second.connect();
  await waitFor(() => second.authed, '第二安装未换领独立身份');
  assert.notEqual(second.cfg.server_id, first.cfg.server_id);
  assert.notEqual(second.cfg.secret, first.cfg.secret);
  assert.equal(first.authed, true);
});

test('两个区服实时广播、并发请求匹配并在断线后补拉', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'worldchat-e2e-'));
  const secretA = secret();
  const secretB = secret();
  const adminToken = secret();
  const server = createWorldChatServer({
    baseDir: directory,
    logger: silentLogger,
    clients: {
      server_a: { name: '甲服', secret: secretA },
      server_b: { name: '乙服', secret: secretB },
    },
    config: {
      HOST: '127.0.0.1',
      PORT: 0,
      ADMIN_TOKEN: adminToken,
      USER_COOLDOWN_MS: 0,
      MAX_PUB_PER_MINUTE: 100,
    },
  });
  const address = await server.start();
  const url = `ws://127.0.0.1:${address.port}`;
  const clientA = new WorldChatClient({
    config: clientConfig(url, 'server_a', secretA, 'group_a'),
    persist: false,
  });
  const clientB = new WorldChatClient({
    config: clientConfig(url, 'server_b', secretB, 'group_b'),
    persist: false,
  });
  const receivedA = [];
  const receivedB = [];
  clientA.setMessageHandler((message) => receivedA.push(message));
  clientB.setMessageHandler((message) => receivedB.push(message));

  t.after(async () => {
    clientA.close();
    clientB.close();
    await server.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  clientA.connect();
  clientB.connect();
  await waitFor(() => clientA.authed && clientB.authed, '两个区服未完成鉴权');

  const [ackA, ackB] = await Promise.all([
    clientA.pub('甲服传音', { name: '甲修士', tag: 'a'.repeat(16) }, [
      'https://example.com/world.jpg',
    ]),
    clientB.pub('乙服传音', { name: '乙修士', tag: 'b'.repeat(16) }),
  ]);
  assert.equal(ackA.ok, true);
  assert.equal(ackB.ok, true);
  assert.notEqual(ackA.id, ackB.id);
  await waitFor(
    () => receivedA.length === 2 && receivedB.length === 2,
    '实时消息未同时广播到两个区服'
  );
  assert.deepEqual(receivedA.map((message) => message.msg).sort(), [
    '乙服传音',
    '甲服传音',
  ]);
  assert.deepEqual(
    receivedA.find((message) => message.msg === '甲服传音').images,
    ['https://example.com/world.jpg']
  );

  const [oneMessage, twoMessages] = await Promise.all([
    clientA.query(1),
    clientA.query(2),
  ]);
  assert.equal(oneMessage.messages.length, 1);
  assert.equal(twoMessages.messages.length, 2);

  const publicStatus = await fetch(
    `${url.replace('ws:', 'http:')}/api/status`
  ).then((response) => response.json());
  assert.equal(publicStatus.online, 2);
  assert.equal('servers' in publicStatus, false);
  assert.equal('banned' in publicStatus, false);

  const unauthorized = await fetch(
    `${url.replace('ws:', 'http:')}/api/admin/status`
  );
  assert.equal(unauthorized.status, 401);
  const adminStatus = await fetch(
    `${url.replace('ws:', 'http:')}/api/admin/status`,
    {
      headers: { 'X-Admin-Token': adminToken },
    }
  ).then((response) => response.json());
  assert.deepEqual(adminStatus.servers.map((item) => item.server_id).sort(), [
    'server_a',
    'server_b',
  ]);

  clientB.close();
  await waitFor(() => !clientB.connected, '乙服未断开');
  const missedAck = await clientA.pub('乙服离线消息', {
    name: '甲修士',
    tag: 'c'.repeat(16),
  });
  assert.equal(missedAck.ok, true);
  await waitFor(() => receivedA.length === 3, '在线区服未收到第三条消息');
  assert.equal(receivedB.length, 2);

  clientB.setEnable(true);
  await waitFor(() => clientB.authed, '乙服未重新连接');
  await waitFor(() => receivedB.length === 3, '乙服未补拉断线消息');
  assert.equal(
    receivedB.filter((message) => message.msg === '乙服离线消息').length,
    1
  );
  assert.deepEqual(
    server.getMessages().map((message) => message.seq),
    [1, 2, 3]
  );
});
test('独立凭据拒绝冒充且首次加入不会灌入旧消息', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'worldchat-join-'));
  const publisherSecret = secret();
  const subscriberSecret = secret();
  const server = createWorldChatServer({
    baseDir: directory,
    logger: silentLogger,
    clients: {
      publisher: { secret: publisherSecret },
      subscriber: { secret: subscriberSecret },
    },
    config: { HOST: '127.0.0.1', PORT: 0, USER_COOLDOWN_MS: 0 },
  });
  const address = await server.start();
  const url = `ws://127.0.0.1:${address.port}`;
  const publisher = new WorldChatClient({
    config: clientConfig(url, 'publisher', publisherSecret, 'group_p'),
    persist: false,
  });
  const subscriberConfig = clientConfig(
    url,
    'subscriber',
    subscriberSecret,
    'group_unused'
  );
  subscriberConfig.joined_groups = [];
  const subscriber = new WorldChatClient({
    config: subscriberConfig,
    persist: false,
  });
  const impostorConfig = clientConfig(url, 'publisher', secret(), 'group_x');
  const impostor = new WorldChatClient({
    config: impostorConfig,
    persist: false,
  });
  const received = [];
  subscriber.setMessageHandler((message) => received.push(message));

  t.after(async () => {
    publisher.close();
    subscriber.close();
    impostor.close();
    await server.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  publisher.connect();
  subscriber.connect();
  await waitFor(
    () => publisher.authed && subscriber.authed,
    '测试区服未完成鉴权'
  );
  impostor.connect();
  await waitFor(() => impostor.lastError === 'auth_failed', '错误凭据未被拒绝');
  assert.equal(publisher.authed, true);
  impostor.close();

  const oldAck = await publisher.pub('加入前旧消息', {
    name: '发布者',
    tag: 'd'.repeat(16),
  });
  assert.equal(oldAck.ok, true);
  await waitFor(() => server.getMessages().length === 1, '旧消息未写入总机');
  assert.equal(received.length, 0);

  assert.equal(subscriber.joinGroup('group_s'), true);
  await waitFor(
    () => !subscriber.cfg.start_from_now && subscriber.cfg.last_seen_seq === 1,
    '首次入群未从当前序号开始订阅'
  );
  assert.equal(received.length, 0);

  const newAck = await publisher.pub('加入后新消息', {
    name: '发布者',
    tag: 'e'.repeat(16),
  });
  assert.equal(newAck.ok, true);
  await waitFor(() => received.length === 1, '首次入群后未收到新消息');
  assert.equal(received[0].msg, '加入后新消息');
});

test('群适配器返回失败对象时使用事件回复通道', async () => {
  let fallbackCalls = 0;
  const bot = {
    pickGroup() {
      return { sendMsg: async () => ({ status: 'failed', message: '需要消息上下文' }) };
    },
  };
  const result = await sendWorldGroupMessage(
    bot,
    'group_a',
    '世界消息',
    async () => {
      fallbackCalls += 1;
      return { status: 'ok' };
    }
  );
  assert.equal(result.status, 'ok');
  assert.equal(fallbackCalls, 1);
});

test('实时投递失败会自动重试且不提前收取序号', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'worldchat-retry-'));
  const clientSecret = secret();
  const server = createWorldChatServer({
    baseDir: directory,
    logger: silentLogger,
    clients: { retry_client: { secret: clientSecret } },
    config: { HOST: '127.0.0.1', PORT: 0, USER_COOLDOWN_MS: 0 },
  });
  const address = await server.start();
  const client = new WorldChatClient({
    config: clientConfig(
      `ws://127.0.0.1:${address.port}`,
      'retry_client',
      clientSecret,
      'group_retry'
    ),
    persist: false,
    deliveryRetryBaseMs: 10,
  });
  let attempts = 0;
  const received = [];
  client.setMessageHandler((message) => {
    attempts += 1;
    if (attempts === 1) throw new Error('群发送失败');
    received.push(message);
  });
  t.after(async () => {
    client.close();
    await server.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  client.connect();
  await waitFor(() => client.authed, '重试客户端未完成鉴权');
  const ack = await client.pub('需要重试的消息', {
    name: '重试道友',
    tag: 'f'.repeat(16),
  });
  assert.equal(ack.ok, true);
  await waitFor(() => received.length === 1, '失败消息未自动重试');
  assert.equal(attempts, 2);
  assert.equal(client.cfg.last_seen_seq, 1);
});

test('世界消息投递参数使用保守默认值、硬上限和旧参数兼容', () => {
  const makeClient = (name, options = {}) =>
    new WorldChatClient({
      config: clientConfig(
        'ws://127.0.0.1:1',
        `delivery_${name}`,
        secret(),
        `group_${name}`
      ),
      persist: false,
      ...options,
    });
  const clients = [
    makeClient('defaults'),
    makeClient('capped', {
      deliveryQueueLimit: 10_000,
      deliveryMaxAttempts: 10_000,
      deliveryRetryBaseMs: 10_000_000,
      deliveryRetryMaxMs: 10_000_000,
    }),
    makeClient('zero', { deliveryMaxAttempts: 0 }),
    makeClient('legacy_zero', { deliveryMaxRetries: 0 }),
    makeClient('legacy_one', { deliveryMaxRetries: 1 }),
    makeClient('preferred', {
      deliveryMaxAttempts: 3,
      deliveryMaxRetries: 9,
    }),
  ];
  const [defaults, capped, zero, legacyZero, legacyOne, preferred] = clients;

  try {
    assert.equal(defaults.deliveryQueueLimit, 100);
    assert.equal(defaults.deliveryMaxAttempts, 5);
    assert.equal(defaults.deliveryRetryMaxMs, 30_000);
    assert.equal(capped.deliveryQueueLimit, 500);
    assert.equal(capped.deliveryMaxAttempts, 10);
    assert.equal(capped.deliveryRetryBaseMs, 60_000);
    assert.equal(capped.deliveryRetryMaxMs, 60_000);
    assert.equal(zero.deliveryMaxAttempts, 1);
    assert.equal(legacyZero.deliveryMaxAttempts, 1);
    assert.equal(legacyOne.deliveryMaxAttempts, 2);
    assert.equal(preferred.deliveryMaxAttempts, 3);
  } finally {
    for (const client of clients) client.close();
  }
});

test('永久失败的世界消息有限重试后释放并继续投递下一条', async () => {
  const client = new WorldChatClient({
    config: clientConfig(
      'ws://127.0.0.1:1',
      'bounded_retry',
      secret(),
      'group_retry'
    ),
    persist: false,
    deliveryMaxAttempts: 2,
    deliveryRetryBaseMs: 10,
  });
  const attempts = new Map();
  const delivered = [];
  const cleaned = [];
  client.setMessageHandler(async (message) => {
    attempts.set(message.id, (attempts.get(message.id) || 0) + 1);
    if (message.id === 'permanent_failure') throw new Error('永久失败');
    delivered.push(message.id);
  });
  client.setDeliveryFailureHandler((message) => cleaned.push(message.id));

  try {
    const results = await Promise.allSettled([
      client.enqueueDelivery({ id: 'permanent_failure', seq: 1 }),
      client.enqueueDelivery({ id: 'next_message', seq: 2 }),
    ]);

    assert.equal(results[0].status, 'rejected');
    assert.equal(results[1].status, 'fulfilled');
    assert.equal(attempts.get('permanent_failure'), 2);
    assert.deepEqual(delivered, ['next_message']);
    assert.deepEqual(cleaned, ['permanent_failure']);
    assert.equal(client.cfg.last_seen_seq, 2);
    assert.equal(client.pendingDeliveries.size, 0);
    assert.equal(client.deliveryQueue.length, 0);
  } finally {
    client.close();
  }
});

test('世界消息投递队列保留对象数量不超过配置上限', async () => {
  const client = new WorldChatClient({
    config: clientConfig(
      'ws://127.0.0.1:1',
      'bounded_queue',
      secret(),
      'group_queue'
    ),
    persist: false,
    deliveryQueueLimit: 2,
    deliveryMaxAttempts: 1,
  });
  let releaseFirst;
  let markStarted;
  const firstStarted = new Promise((resolve) => {
    markStarted = resolve;
  });
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  client.setMessageHandler(async (message) => {
    if (message.id !== 'first') return;
    markStarted();
    await firstGate;
  });

  try {
    const first = client.enqueueDelivery({ id: 'first', seq: 1 });
    await firstStarted;
    const second = client.enqueueDelivery({ id: 'second', seq: 2 });
    await assert.rejects(
      client.enqueueDelivery({ id: 'overflow', seq: 3 }),
      /delivery_queue_full/
    );
    assert.equal(client.pendingDeliveries.size, 2);
    assert.equal(client.deliveryQueue.length, 1);

    releaseFirst();
    await Promise.all([first, second]);
    assert.equal(client.pendingDeliveries.size, 0);
    assert.equal(client.deliveryQueue.length, 0);
  } finally {
    releaseFirst?.();
    client.close();
  }
});

test('实时消息队列满时关闭连接以等待重连补拉', async () => {
  const client = new WorldChatClient({
    config: clientConfig(
      'ws://127.0.0.1:1',
      'queue_reconnect',
      secret(),
      'group_reconnect'
    ),
    persist: false,
    deliveryQueueLimit: 1,
    deliveryMaxAttempts: 1,
  });
  let releaseActive;
  let markStarted;
  const activeStarted = new Promise((resolve) => {
    markStarted = resolve;
  });
  const activeGate = new Promise((resolve) => {
    releaseActive = resolve;
  });
  client.setMessageHandler(async () => {
    markStarted();
    await activeGate;
  });

  const active = client.enqueueDelivery({ id: 'active_live', seq: 1 });
  await activeStarted;
  let closeArgs = null;
  client.ws = {
    close(...args) {
      closeArgs = args;
    },
  };

  try {
    client.onMessage(
      JSON.stringify({
        type: 'MESSAGE',
        message: { id: 'overflow_live', seq: 2 },
      })
    );
    await waitFor(() => closeArgs, '队列满后连接未关闭');
    assert.deepEqual(closeArgs, [1013, 'delivery_queue_full']);
    assert.equal(client.pendingDeliveries.size, 1);
  } finally {
    releaseActive();
    await active;
    client.close();
  }
});

test('补拉消息最终失败时跳过该条并继续处理后续消息', async () => {
  const client = new WorldChatClient({
    config: clientConfig(
      'ws://127.0.0.1:1',
      'backfill_skip',
      secret(),
      'group_backfill'
    ),
    persist: false,
    deliveryMaxAttempts: 1,
  });
  const delivered = [];
  client.setMessageHandler((message) => {
    if (message.id === 'failed_backfill') throw new Error('永久失败');
    delivered.push(message.id);
  });
  client.query = async () => ({
    ok: true,
    messages: [
      { id: 'failed_backfill', seq: 1 },
      { id: 'following_backfill', seq: 2 },
    ],
  });

  try {
    await client.backfill();
    assert.deepEqual(delivered, ['following_backfill']);
    assert.equal(client.cfg.last_seen_seq, 2);
    assert.equal(client.pendingDeliveries.size, 0);
  } finally {
    client.close();
  }
});

test('关闭客户端会取消重试等待并释放未执行消息', async () => {
  const client = new WorldChatClient({
    config: clientConfig(
      'ws://127.0.0.1:1',
      'close_delivery',
      secret(),
      'group_close'
    ),
    persist: false,
    deliveryMaxAttempts: 10,
    deliveryRetryBaseMs: 60_000,
  });
  client.setMessageHandler(() => {
    throw new Error('等待重试');
  });

  const active = client.enqueueDelivery({ id: 'active', seq: 1 });
  const queued = client.enqueueDelivery({ id: 'queued', seq: 2 });
  const activeRejected = assert.rejects(active, /delivery_disabled/);
  const queuedRejected = assert.rejects(queued, /closed/);
  await waitFor(() => client.deliveryRetryWait, '投递重试等待未开始');

  client.close();
  await Promise.all([activeRejected, queuedRejected]);
  await waitFor(
    () => client.pendingDeliveries.size === 0 && !client.deliveryProcessing,
    '关闭后投递状态未释放'
  );
  assert.equal(client.deliveryQueue.length, 0);
  assert.equal(client.deliveryRetryWait, null);
});
