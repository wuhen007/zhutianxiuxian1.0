import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { WorldChatClient } from '../apps/worldChat/client.js';
import {
  TRADE_LIMITS,
  normalizeTradeAsset,
  parseTradeBundle,
  tradePolicyAllows,
  validateTradeOffer,
} from '../apps/worldChat/trade.js';
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

function config(url, serverId, clientSecret, peer) {
  return {
    enable: true,
    url,
    server_id: serverId,
    secret: clientSecret,
    name: `${serverId}位面`,
    joined_groups: [`group_${serverId}`],
    expose_group: false,
    trade_enabled: true,
    trade_allow_servers: [peer],
    realm_stats: { players: 12, max_mijing: 20, max_xiangu: 21, max_huafen: 22 },
    last_seen_seq: 0,
  };
}

test('跨服交易规则拦截禁售物品和超额数量', () => {
  assert.equal(normalizeTradeAsset({ kind: 'item', type: '道具', name: '帝兵', amount: 1 }), null);
  assert.equal(normalizeTradeAsset({ kind: 'item', type: '道具', name: '普通材料', amount: TRADE_LIMITS.maxItemAmount + 1 }), null);
  assert.equal(normalizeTradeAsset({ kind: 'currency', name: '灵石', amount: TRADE_LIMITS.maxLingshi + 1 }), null);
  assert.equal(tradePolicyAllows({ enabled: true, allow_servers: ['sv_b'] }, 'sv_b'), true);
  assert.equal(tradePolicyAllows({ enabled: true, allow_servers: ['sv_b'] }, 'sv_c'), false);
  assert.equal(tradePolicyAllows({ enabled: true, allow_servers: ['*'], deny_servers: ['sv_b'] }, 'sv_b'), false);
  assert.equal(validateTradeOffer(
    [{ kind: 'item', type: '道具', name: '普通材料', amount: 1 }],
    [{ kind: 'currency', name: '灵石', amount: 1000 }]
  ).ok, true);
  assert.deepEqual(parseTradeBundle('物品|道具|普通材料|1, 灵石|1000'), {
    ok: true,
    items: [
      { kind: 'item', type: '道具', name: '普通材料', amount: 1 },
      { kind: 'currency', name: '灵石', amount: 1000 },
    ],
  });
});

test('总机提供位面概况并完成双端跨服交易结算', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'worldchat-trade-'));
  const secretA = secret();
  const secretB = secret();
  const server = createWorldChatServer({
    baseDir: directory,
    logger: silentLogger,
    clients: {
      sv_a: { secret: secretA, name: '甲位面' },
      sv_b: { secret: secretB, name: '乙位面' },
    },
    config: { HOST: '127.0.0.1', PORT: 0, TRADE_TTL_MS: 60_000 },
  });
  const address = await server.start();
  const url = `ws://127.0.0.1:${address.port}`;
  const clientA = new WorldChatClient({ config: config(url, 'sv_a', secretA, 'sv_b'), persist: false });
  const clientB = new WorldChatClient({ config: config(url, 'sv_b', secretB, 'sv_a'), persist: false });
  const settleEvents = [];
  clientA.setTradeHandler((event) => {
    settleEvents.push(['a', event.type]);
    if (event.type === 'TRADE_SETTLE') {
      clientA.settleTrade(event.trade.code, event.role, event.member_tag, true);
    }
  });
  clientB.setTradeHandler((event) => {
    settleEvents.push(['b', event.type]);
    if (event.type === 'TRADE_SETTLE') {
      clientB.settleTrade(event.trade.code, event.role, event.member_tag, true);
    }
  });
  t.after(async () => {
    clientA.close();
    clientB.close();
    await server.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  clientA.connect();
  clientB.connect();
  await waitFor(() => clientA.authed && clientB.authed, '交易客户端未完成鉴权');

  const realms = await clientA.listRealms();
  assert.equal(realms.ok, true);
  assert.deepEqual(realms.realms.map((realm) => realm.server_id).sort(), ['sv_a', 'sv_b']);
  assert.equal(realms.realms.find((realm) => realm.server_id === 'sv_b').realm_stats.players, 12);

  const created = await clientA.createTrade({
    target_server_id: 'sv_b',
    seller_tag: 'a'.repeat(16),
    give: [{ kind: 'item', type: '道具', name: '普通材料', amount: 1 }],
    want: [{ kind: 'currency', name: '灵石', amount: 1000 }],
  });
  assert.equal(created.ok, true);
  const listed = await clientB.listTrades();
  assert.equal(listed.trades.length, 1);

  const accepted = await clientB.acceptTrade(created.trade.code, 'b'.repeat(16));
  assert.equal(accepted.ok, true);
  await waitFor(() => settleEvents.filter(([, type]) => type === 'TRADE_SETTLE').length === 2, '双方未收到结算事件');
  await waitFor(() => server.getTrades()[0]?.status === 'completed', '交易未完成');
  assert.equal(server.getTrades()[0].settlement.seller, true);
  assert.equal(server.getTrades()[0].settlement.buyer, true);
});

test('未获得双方服主许可时总机拒绝交易', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'worldchat-trade-policy-'));
  const secretA = secret();
  const secretB = secret();
  const server = createWorldChatServer({
    baseDir: directory,
    logger: silentLogger,
    clients: {
      sv_a: { secret: secretA },
      sv_b: { secret: secretB },
    },
    config: { HOST: '127.0.0.1', PORT: 0 },
  });
  const address = await server.start();
  const url = `ws://127.0.0.1:${address.port}`;
  const clientA = new WorldChatClient({ config: config(url, 'sv_a', secretA, 'sv_b'), persist: false });
  const clientB = new WorldChatClient({
    config: { ...config(url, 'sv_b', secretB, 'sv_a'), trade_allow_servers: [] },
    persist: false,
  });
  t.after(async () => {
    clientA.close();
    clientB.close();
    await server.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  clientA.connect();
  clientB.connect();
  await waitFor(() => clientA.authed && clientB.authed, '策略客户端未完成鉴权');
  const result = await clientA.createTrade({
    target_server_id: 'sv_b',
    seller_tag: 'a'.repeat(16),
    give: [{ kind: 'item', type: '道具', name: '普通材料', amount: 1 }],
    want: [{ kind: 'currency', name: '灵石', amount: 1000 }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'trade_not_allowed');
});
