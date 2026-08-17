import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { WorldChatClient } from '../apps/worldChat/client.js';
import { createCrossRaidAvatar, hydrateCrossRaidAvatar } from '../apps/worldChat/raid.js';
import { createWorldChatServer } from '../worldchat-server/server.js';

const silentLogger = { info() {}, warn() {}, error() {} };
const secret = () => crypto.randomBytes(32).toString('hex');

async function waitFor(predicate, message) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(message);
}

function config(url, serverId, clientSecret, name = serverId) {
  return {
    enable: true,
    url,
    server_id: serverId,
    secret: clientSecret,
    name,
    joined_groups: ['group'],
    last_seen_seq: 0,
  };
}

test('跨服化身只携带战斗字段并恢复为匿名战斗单位', () => {
  const avatar = createCrossRaidAvatar({
    id: '123456',
    名号: '远行者',
    攻击: 100,
    防御: 80,
    当前血量: 1,
    血量上限: 500,
    灵石: 999999,
    纳戒: { 私密物品: true },
    灵根: { name: '混沌体', type: '特殊体质' },
    学习的功法: ['皆字秘'],
  });
  assert.equal(avatar.当前血量, 500);
  assert.equal('id' in avatar, false);
  assert.equal('灵石' in avatar, false);
  assert.equal('纳戒' in avatar, false);

  const hydrated = hydrateCrossRaidAvatar(avatar, {
    serverId: 'server_b',
    serverName: '乙服',
    memberTag: 'a'.repeat(16),
  });
  assert.match(hydrated.id, /^cross_server_b_/);
  assert.equal(hydrated._跨服化身, true);
  assert.match(hydrated.名号, /乙服·化身/);
});

test('世界总机完成跨服团本发布、化身加入与开战锁定', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'world-raid-'));
  const secretA = secret();
  const secretB = secret();
  const server = createWorldChatServer({
    baseDir: directory,
    logger: silentLogger,
    clients: {
      server_a: { name: '甲服', secret: secretA },
      server_b: { name: '乙服', secret: secretB },
    },
    config: { HOST: '127.0.0.1', PORT: 0 },
  });
  const address = await server.start();
  const url = `ws://127.0.0.1:${address.port}`;
  const host = new WorldChatClient({ config: config(url, 'server_a', secretA, '甲服'), persist: false });
  const guest = new WorldChatClient({ config: config(url, 'server_b', secretB, '乙服'), persist: false });
  t.after(async () => {
    host.close();
    guest.close();
    await server.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  host.connect();
  guest.connect();
  await waitFor(() => host.authed && guest.authed, '区服未完成鉴权');

  const opened = await host.openRaid({ team_id: '讨伐一队', boss: '狠人大帝', local_members: 2 });
  assert.equal(opened.ok, true);
  assert.match(opened.raid.code, /^[A-F0-9]{8}$/);

  const sameServer = await host.joinRaid(opened.raid.code, { 名号: '本服人' }, 'a'.repeat(16));
  assert.equal(sameServer.reason, 'same_server');

  const joined = await guest.joinRaid(
    opened.raid.code,
    createCrossRaidAvatar({ 名号: '乙修士', 攻击: 100, 防御: 100, 血量上限: 1000 }),
    'b'.repeat(16)
  );
  assert.equal(joined.ok, true);
  assert.equal(joined.raid.members.length, 1);
  assert.equal(joined.raid.members[0].server_name, '乙服');

  const fetched = await host.getRaid(opened.raid.code);
  assert.equal(fetched.raid.members[0].avatar.名号, '乙修士');
  assert.equal((await host.closeRaid(opened.raid.code, 'in_battle')).ok, true);
  const closedJoin = await guest.joinRaid(opened.raid.code, { 名号: '后来者' }, 'c'.repeat(16));
  assert.equal(closedJoin.reason, 'raid_closed');
  assert.equal(server.getRaids()[0].status, 'in_battle');
});
