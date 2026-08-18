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
