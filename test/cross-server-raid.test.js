import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { WorldChatClient } from '../apps/worldChat/client.js';
import {
  buildCrossRaidSnapshot,
  createCrossRaidAvatar,
  formatCrossRaidSnapshot,
  hydrateCrossRaidAvatar,
} from '../apps/worldChat/raid.js';
import { createWorldChatServer } from '../worldchat-server/server.js';

const silentLogger = { info() {}, warn() {}, error() {} };
const secret = () => crypto.randomBytes(32).toString('hex');
const endlessRealmSource = fs.readFileSync(new URL('../apps/EndlessRealm.js', import.meta.url), 'utf8');

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

  const snapshot = buildCrossRaidSnapshot(
    { memberNames: { one: '远行者' } },
    {
      layer: 3,
      phase: 'ready',
      lifeFire: 2,
      maxLifeFire: 2,
      members: { one: { id: 'one', name: '远行者', hp: 700, maxHp: 1000, alive: true } },
      pendingChoices: { one: ['ghost_step'] },
      lastBattle: { layer: 3, enemy: { name: '劫境鬼影' }, victory: true, rounds: 4, logs: ['命中'] },
    },
    {
      resolveAbility: () => ({ name: '鬼步', rarity: '稀有', description: '避开下一次攻击' }),
      starOptions: [{ name: '残月劫途', risk: '中危', description: '敌影增多' }],
      merchant: {
        name: '万宝楼·界海分号',
        balance: 88,
        stock: [
          { name: '破境战血', price: 65, description: '本局攻击提高18%', boughtBy: null },
          { name: '涅槃仙露', price: 45, boughtBy: 'two', buyerName: '同行者', result: '恢复500生命' },
        ],
      },
    }
  );
  const formatted = formatCrossRaidSnapshot({ code: '12345678', status: 'in_battle', local_members: 1, max_members: 4, members: [], snapshot }).join('\n');
  assert.match(formatted, /劫境鬼影/);
  assert.match(formatted, /鬼步/);
  assert.match(formatted, /残月劫途/);
  assert.match(formatted, /万宝楼·界海分号/);
  assert.match(formatted, /共享余额：88/);
  assert.match(formatted, /跨服劫境购买1\/2/);
  assert.match(formatted, /\[已售\] 涅槃仙露/);
});

test('跨服商人指令由宿主映射到局内购买并保存最新状态', () => {
  assert.match(endlessRealmSource, /crossEndlessMerchant\(e\)[\s\S]{0,120}sendCrossEndlessAction\(e, 'merchant'\)/);
  assert.match(endlessRealmSource, /message\.action === 'merchant'\)[\s\S]{0,120}buyEndlessMerchantItem\(run, memberId, message\.value\)/);
  assert.match(endlessRealmSource, /merchant: getEndlessMerchantState\(run\)/);
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
  const hostEvents = [];
  const guestEvents = [];
  host.setRaidHandler((message) => hostEvents.push(message));
  guest.setRaidHandler((message) => guestEvents.push(message));
  t.after(async () => {
    host.close();
    guest.close();
    await server.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  host.connect();
  guest.connect();
  await waitFor(() => host.authed && guest.authed, '区服未完成鉴权');

  const opened = await host.openRaid({ team_id: '讨伐一队', boss: '狠人大帝', local_members: 2, max_members: 4 });
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
  await waitFor(() => hostEvents.some((event) => event.type === 'RAID_MEMBER_JOINED'), '队长服未收到入队事件');

  assert.equal((await guest.joinRaid(opened.raid.code, { 名号: '乙服二号' }, 'd'.repeat(16))).ok, true);
  assert.equal((await guest.joinRaid(opened.raid.code, { 名号: '超员者' }, 'e'.repeat(16))).reason, 'raid_full');
  assert.equal((await host.openRaid({ team_id: '讨伐一队', boss: '狠人大帝', local_members: 3, max_members: 4 })).reason, 'raid_full');
  assert.equal((await guest.leaveRaid(opened.raid.code, 'd'.repeat(16))).ok, true);
  assert.equal((await guest.joinRaid(opened.raid.code, { 名号: '补位者' }, 'e'.repeat(16))).ok, true);

  const watcherTag = 'c'.repeat(16);
  assert.equal((await guest.watchRaid(opened.raid.code, watcherTag, '旁观者')).ok, true);

  const fetched = await host.getRaid(opened.raid.code);
  assert.equal(fetched.raid.members[0].avatar.名号, '乙修士');
  assert.equal((await host.closeRaid(opened.raid.code, 'in_battle')).ok, true);
  assert.equal((await guest.raidAction(opened.raid.code, watcherTag, 'choose', 1)).ok, false);
  assert.equal((await guest.raidAction(opened.raid.code, 'b'.repeat(16), 'choose', 1)).ok, true);
  await waitFor(() => hostEvents.some((event) => event.type === 'RAID_ACTION'), '队长服未收到远程抉择');
  assert.equal((await guest.raidAction(opened.raid.code, 'b'.repeat(16), 'merchant', 2)).ok, true);
  await waitFor(
    () => hostEvents.some((event) => event.type === 'RAID_ACTION' && event.action === 'merchant' && event.value === 2),
    '队长服未收到远程购买'
  );

  assert.equal((await guest.raidChat(opened.raid.code, 'b'.repeat(16), '乙修士', '诸位道友好')).ok, true);
  await waitFor(() => guestEvents.some((event) => event.type === 'RAID_CHAT'), '房间传音未广播');

  const snapshot = { layer: 1, phase: 'ready', lifeFire: 2, maxLifeFire: 2, members: [], pending: [], battle: null };
  assert.equal((await host.updateRaid(opened.raid.code, snapshot, 'in_battle')).ok, true);
  await waitFor(() => guestEvents.some((event) => event.type === 'RAID_STATE'), '观战端未收到战况');

  const settlement = [{ id: 'run:1:b', server_id: 'server_b', member_tag: 'b'.repeat(16), highestLayer: 1, reward: { lingshi: 10 } }];
  assert.equal((await host.settleRaid(opened.raid.code, settlement, 'settled')).ok, true);
  await waitFor(() => guestEvents.some((event) => event.type === 'RAID_SETTLEMENT'), '参与服未收到结算');
  assert.equal((await host.getRaid(opened.raid.code)).raid.settlements[0].id, 'run:1:b');
  const closedJoin = await guest.joinRaid(opened.raid.code, { 名号: '后来者' }, 'c'.repeat(16));
  assert.equal(closedJoin.reason, 'raid_closed');
  assert.equal(server.getRaids()[0].status, 'settled');
});
