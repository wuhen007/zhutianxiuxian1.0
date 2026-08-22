import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { WorldChatClient } from '../apps/worldChat/client.js';
import {
  TRADE_LIMITS,
  creditTradeAssets,
  extractTradeRealmPrefix,
  normalizeTradeAsset,
  parseCompactTradeBundle,
  parseTradeBundle,
  resolveTradeRealm,
  tradeAssetClaimKey,
  tradePolicyAllows,
  validateTradeOffer,
} from '../apps/worldChat/trade.js';
import { createWorldChatServer } from '../worldchat-server/server.js';

const silentLogger = { info() {}, warn() {}, error() {} };
const secret = () => crypto.randomBytes(32).toString('hex');

test('重复结算为同一资产生成稳定且唯一的入账凭据', () => {
  const first = tradeAssetClaimKey('t88c4b403', 'buyer', 'credit', 0);
  assert.equal(first, 'worldtrade:T88C4B403:buyer:credit:0');
  assert.equal(tradeAssetClaimKey('T88C4B403', 'buyer', 'credit', 0), first);
  assert.notEqual(tradeAssetClaimKey('T88C4B403', 'buyer', 'credit', 1), first);
  assert.notEqual(tradeAssetClaimKey('T88C4B403', 'seller', 'credit', 0), first);
});

test('多个插件实例重复处理完成结算时资产只到账一次', async () => {
  const claims = new Set();
  let balance = 0;
  const adjust = async (_userId, _asset, delta, options) => {
    if (claims.has(options.idempotencyKey)) return 0;
    claims.add(options.idempotencyKey);
    balance += delta;
    return delta;
  };
  const entry = {
    user_id: '10001',
    role: 'buyer',
    credited: false,
    incoming: [{ kind: 'currency', name: '灵石', amount: 10_000 }],
  };

  await Promise.all([
    creditTradeAssets('T88C4B403', structuredClone(entry), adjust),
    creditTradeAssets('T88C4B403', structuredClone(entry), adjust),
    creditTradeAssets('T88C4B403', structuredClone(entry), adjust),
  ]);

  assert.equal(balance, 10_000);
  assert.equal(claims.size, 1);
});

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

test('跨服交易简写支持位面名称和星号数量', () => {
  const realms = [
    { server_id: 'sv_multi', name: '多元宇宙' },
    { server_id: 'sv_central', name: '中央大宇宙' },
  ];
  assert.equal(resolveTradeRealm(realms, 'sv_multi').realm.name, '多元宇宙');
  assert.equal(resolveTradeRealm(realms, '多元宇宙').realm.server_id, 'sv_multi');

  const target = extractTradeRealmPrefix(realms, '多元宇宙秘境之匙**1');
  assert.equal(target.ok, true);
  assert.equal(target.realm.server_id, 'sv_multi');
  assert.equal(target.rest, '秘境之匙**1');

  const resolveType = (name) => name === '秘境之匙' ? '道具' : '';
  assert.deepEqual(parseCompactTradeBundle('秘境之匙*1', resolveType), {
    ok: true,
    items: [{ kind: 'item', type: '道具', name: '秘境之匙', amount: 1 }],
  });
  assert.deepEqual(parseCompactTradeBundle('灵石×10000', resolveType), {
    ok: true,
    items: [{ kind: 'currency', name: '灵石', amount: 10000 }],
  });
});

test('重名位面要求改用唯一标识', () => {
  const result = resolveTradeRealm([
    { server_id: 'sv_a', name: '同名位面' },
    { server_id: 'sv_b', name: '同名位面' },
  ], '同名位面');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'realm_name_ambiguous');
  assert.equal(result.matches.length, 2);
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
  const completedRoles = [];
  clientA.setTradeHandler((event) => {
    settleEvents.push(['a', event.type]);
    if (event.type === 'TRADE_COMPLETED') completedRoles.push(event.role);
    if (event.type === 'TRADE_SETTLE') {
      clientA.settleTrade(event.trade.code, event.role, event.member_tag, true);
    }
  });
  clientB.setTradeHandler((event) => {
    settleEvents.push(['b', event.type]);
    if (event.type === 'TRADE_COMPLETED') completedRoles.push(event.role);
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
    seller_player_name: '卖家甲',
    seller_anonymous: false,
    give: [{ kind: 'item', type: '道具', name: '普通材料', amount: 1 }],
    want: [{ kind: 'currency', name: '灵石', amount: 1000 }],
  });
  assert.equal(created.ok, true);
  assert.equal(created.trade.seller_player_name, '卖家甲');
  assert.equal(created.trade.seller_anonymous, false);
  const listed = await clientB.listTrades();
  assert.equal(listed.trades.length, 1);

  const accepted = await clientB.acceptTrade(created.trade.code, 'b'.repeat(16), {
    displayName: '买家乙',
    anonymous: false,
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.trade.buyer_player_name, '买家乙');
  assert.equal(accepted.trade.buyer_anonymous, false);
  await waitFor(() => settleEvents.filter(([, type]) => type === 'TRADE_SETTLE').length === 2, '双方未收到结算事件');
  await waitFor(() => server.getTrades()[0]?.status === 'completed', '交易未完成');
  assert.equal(server.getTrades()[0].settlement.seller, true);
  assert.equal(server.getTrades()[0].settlement.buyer, true);
  await waitFor(() => completedRoles.length === 2, '双方未收到成交通知');
  assert.deepEqual(completedRoles.sort(), ['buyer', 'seller']);

  const anonymous = await clientA.createTrade({
    target_server_id: 'sv_b',
    seller_tag: 'a'.repeat(16),
    seller_player_name: '卖家隐身',
    seller_anonymous: true,
    give: [{ kind: 'item', type: '道具', name: '普通材料', amount: 1 }],
    want: [{ kind: 'currency', name: '灵石', amount: 1000 }],
  });
  assert.equal(anonymous.ok, true);
  assert.equal(anonymous.trade.seller_player_name, '');
  assert.equal(anonymous.trade.seller_anonymous, true);
  const anonymousAccepted = await clientB.acceptTrade(anonymous.trade.code, 'b'.repeat(16), {
    displayName: '买家隐身',
    anonymous: true,
  });
  assert.equal(anonymousAccepted.ok, true);
  assert.equal(anonymousAccepted.trade.buyer_player_name, '');
  assert.equal(anonymousAccepted.trade.buyer_anonymous, true);
  await waitFor(() => completedRoles.length === 4, '匿名交易未完成');
});

test('结算中的交易会在重连后重新下发', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'worldchat-trade-redelivery-'));
  const secretA = secret();
  const secretB = secret();
  const server = createWorldChatServer({
    baseDir: directory,
    logger: silentLogger,
    clients: {
      sv_a: { secret: secretA },
      sv_b: { secret: secretB },
    },
    config: { HOST: '127.0.0.1', PORT: 0, TRADE_TTL_MS: 60_000 },
  });
  const address = await server.start();
  const url = `ws://127.0.0.1:${address.port}`;
  const clientA = new WorldChatClient({ config: config(url, 'sv_a', secretA, 'sv_b'), persist: false });
  const clientB = new WorldChatClient({ config: config(url, 'sv_b', secretB, 'sv_a'), persist: false });
  let firstBuyerEvent = true;
  let buyerSettleEvents = 0;
  clientA.setTradeHandler((event) => {
    if (event.type === 'TRADE_SETTLE') clientA.settleTrade(event.trade.code, event.role, event.member_tag, true);
  });
  clientB.setTradeHandler((event) => {
    if (event.type !== 'TRADE_SETTLE') return;
    buyerSettleEvents += 1;
    if (!firstBuyerEvent) clientB.settleTrade(event.trade.code, event.role, event.member_tag, true);
    firstBuyerEvent = false;
  });
  t.after(async () => {
    clientA.close();
    clientB.close();
    await server.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  clientA.connect();
  clientB.connect();
  await waitFor(() => clientA.authed && clientB.authed, '重连测试客户端未就绪');
  const created = await clientA.createTrade({
    target_server_id: 'sv_b',
    seller_tag: 'a'.repeat(16),
    give: [{ kind: 'item', type: '道具', name: '普通材料', amount: 1 }],
    want: [{ kind: 'currency', name: '灵石', amount: 1000 }],
  });
  assert.equal(created.ok, true);
  const accepted = await clientB.acceptTrade(created.trade.code, 'b'.repeat(16));
  assert.equal(accepted.ok, true);
  await waitFor(() => buyerSettleEvents === 1, '买方未收到首次结算事件');
  await waitFor(() => server.getTrades()[0]?.status === 'settling', '交易未进入结算状态');
  clientB.ws?.terminate();
  await waitFor(() => clientB.authed, '买方重连失败', 6000);
  await waitFor(() => buyerSettleEvents >= 2, '重连后未重新下发结算事件', 6000);
  await waitFor(() => server.getTrades()[0]?.status === 'completed', '重连后交易未完成', 6000);
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
