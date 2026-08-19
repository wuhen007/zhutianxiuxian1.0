// 世界频道总机：每服独立鉴权、实时广播、断线补拉。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { CONFIG } from './config.js';
import {
  TRADE_LIMITS,
  cleanTradeLabel,
  publicTradeView,
  tradePolicyAllows,
  validateTradeOffer,
} from '../apps/worldChat/trade.js';

const SERVER_FILE = fileURLToPath(import.meta.url);
const SERVER_DIR = path.dirname(SERVER_FILE);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${crypto
    .randomBytes(4)
    .toString('hex')}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value), 'utf8');
  fs.renameSync(temp, file);
}

function normalizeClients(raw) {
  const result = new Map();
  for (const [serverId, value] of Object.entries(raw || {})) {
    const client = typeof value === 'string' ? { secret: value } : value;
    if (
      /^[A-Za-z0-9_-]{3,64}$/.test(serverId) &&
      client?.enabled !== false &&
      typeof client?.secret === 'string' &&
      client.secret.length >= 32
    ) {
      result.set(serverId, client);
    }
  }
  return result;
}

function hmac(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function safeHexEqual(left, right) {
  if (
    !/^[a-f0-9]{64}$/i.test(String(left)) ||
    !/^[a-f0-9]{64}$/i.test(String(right))
  ) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(left, 'hex'),
    Buffer.from(right, 'hex')
  );
}

function safeTokenEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return (
    leftBuffer.length > 0 &&
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function helloPayload(serverId, ts, nonce) {
  return JSON.stringify(['HELLO', serverId, Number(ts), String(nonce)]);
}

function publishPayload(serverId, message) {
  const payload = [
    'PUB',
    serverId,
    String(message.request_id),
    Number(message.ts),
    String(message.sender_name),
    String(message.sender_tag),
    String(message.msg),
  ];
  if (Object.hasOwn(message, 'images')) payload.push(JSON.stringify(message.images));
  return JSON.stringify(payload);
}

function cleanImageUrls(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).filter((item) => {
    try {
      const url = new URL(item);
      const host = url.hostname.toLowerCase();
      return url.protocol === 'https:'
        && host !== 'localhost'
        && !host.endsWith('.local')
        && !/^(?:127|10|0|169\.254|192\.168)\./.test(host)
        && !/^172\.(?:1[6-9]|2\d|3[01])\./.test(host);
    } catch {
      return false;
    }
  }))].slice(0, 3);
}

function cleanLabel(value, max = 30) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanGroups(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.map(String).filter((group) => /^[\w-]{1,64}$/.test(group))
    ),
  ].slice(0, 20);
}

function cleanServerIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).filter((id) => id === '*' || /^[A-Za-z0-9_-]{3,64}$/.test(id)))].slice(0, 200);
}

function cleanRealmStats(value) {
  const stats = value && typeof value === 'object' ? value : {};
  return {
    players: Math.max(0, Math.min(1_000_000, Math.trunc(Number(stats.players) || 0))),
    max_mijing: Math.max(0, Math.min(999, Math.trunc(Number(stats.max_mijing) || 0))),
    max_xiangu: Math.max(0, Math.min(999, Math.trunc(Number(stats.max_xiangu) || 0))),
    max_huafen: Math.max(0, Math.min(999, Math.trunc(Number(stats.max_huafen) || 0))),
    updated_at: Date.now(),
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    let failed = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        if (!failed)
          reject(
            Object.assign(new Error('payload_too_large'), { statusCode: 413 })
          );
        failed = true;
      } else if (!failed) {
        body += chunk;
      }
    });
    req.on('end', () => {
      if (failed) return;
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(Object.assign(new Error('invalid_json'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

export function createWorldChatServer(options = {}) {
  const cfg = { ...CONFIG, ...(options.config || {}) };
  const logger = options.logger || console;
  const baseDir = options.baseDir || process.cwd();
  const storageFile = path.resolve(baseDir, cfg.STORAGE_FILE);
  const raidsFile = path.resolve(baseDir, cfg.RAIDS_FILE);
  const tradesFile = path.resolve(baseDir, cfg.TRADES_FILE);
  const bannedFile = path.resolve(baseDir, cfg.BANNED_FILE);
  const clientsFile = path.resolve(baseDir, cfg.CLIENTS_FILE);
  const fixedClients = options.clients
    ? normalizeClients(options.clients)
    : null;

  let messages = readJson(storageFile, []);
  if (!Array.isArray(messages)) messages = [];
  messages = messages
    .filter(
      (message) =>
        message && Number.isSafeInteger(message.seq) && message.seq > 0
    )
    .slice(-cfg.MESSAGE_LIMIT);
  let nextSeq =
    messages.reduce((max, message) => Math.max(max, message.seq), 0) + 1;

  const raids = new Map(
    (Array.isArray(readJson(raidsFile, [])) ? readJson(raidsFile, []) : [])
      .filter((raid) => raid?.code && raid.expires_at > Date.now())
      .map((raid) => [raid.code, raid])
  );

  const trades = new Map(
    (Array.isArray(readJson(tradesFile, [])) ? readJson(tradesFile, []) : [])
      .filter((trade) => trade?.code && trade.expires_at > Date.now())
      .map((trade) => [trade.code, trade])
  );

  const bannedData = readJson(bannedFile, []);
  const banned = new Set(
    Array.isArray(bannedData) ? bannedData.map(String) : []
  );
  const online = new Map();
  const usedNonces = new Map();
  const publishWindows = new Map();
  const userLastPublish = new Map();
  const registrationWindows = new Map();
  let publishedRequests = new Map();

  function rebuildDedupe() {
    publishedRequests = new Map(
      messages
        .filter((message) => message.client_msg_id)
        .map((message) => [
          `${message.server_id}:${message.client_msg_id}`,
          message,
        ])
    );
  }
  rebuildDedupe();

  const loadClients = () =>
    fixedClients || normalizeClients(readJson(clientsFile, {}));

  function saveMessages() {
    messages = messages.slice(-cfg.MESSAGE_LIMIT);
    atomicWriteJson(storageFile, messages);
    if (publishedRequests.size > cfg.MESSAGE_LIMIT * 2) rebuildDedupe();
  }

  function saveRaids() {
    atomicWriteJson(raidsFile, [...raids.values()]);
  }

  function saveTrades() {
    atomicWriteJson(tradesFile, [...trades.values()]);
  }

  function raidForClient(raid) {
    return raid ? JSON.parse(JSON.stringify(raid)) : null;
  }

  function newTradeCode() {
    let code;
    do code = `T${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    while (trades.has(code));
    return code;
  }

  function tradePeerAllowed(left, right) {
    return Boolean(
      left &&
        right &&
        left.tradeEnabled &&
        right.tradeEnabled &&
        tradePolicyAllows(
          {
            enabled: left.tradeEnabled,
            allow_servers: left.tradeAllow,
            deny_servers: left.tradeDeny,
          },
          right.serverId
        ) &&
        tradePolicyAllows(
          {
            enabled: right.tradeEnabled,
            allow_servers: right.tradeAllow,
            deny_servers: right.tradeDeny,
          },
          left.serverId
        )
    );
  }

  function sendTradeEvent(serverId, type, trade, extra = {}) {
    const peer = online.get(serverId);
    if (peer) send(peer.ws, { type, trade: publicTradeView(trade), ...extra });
  }

  function cleanRaidAvatar(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    try {
      const json = JSON.stringify(value);
      return Buffer.byteLength(json) <= 12_000 ? JSON.parse(json) : null;
    } catch {
      return null;
    }
  }

  function newRaidCode() {
    let code;
    do code = crypto.randomBytes(4).toString('hex').toUpperCase();
    while (raids.has(code));
    return code;
  }

  function filterText(text) {
    let output = String(text);
    for (const word of cfg.SENSITIVE_WORDS) {
      if (!word) continue;
      try {
        output = output.replace(
          new RegExp(word, 'gi'),
          '*'.repeat(Math.max(1, String(word).length))
        );
      } catch {
        // Invalid administrator-provided patterns are ignored.
      }
    }
    return output;
  }

  function send(ws, body) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(body));
  }

  function syncPresence(connection, message) {
    connection.joined = Boolean(message.joined);
    connection.groups = cleanGroups(message.groups);
    connection.exposeLevel = ['admin', 'public'].includes(message.expose_level)
      ? message.expose_level
      : null;
    connection.tradeEnabled = message.trade_enabled === true;
    connection.tradeAllow = cleanServerIds(message.trade_allow_servers);
    connection.tradeDeny = cleanServerIds(message.trade_deny_servers);
    connection.realmStats = cleanRealmStats(message.realm_stats);
    connection.lastSeen = Date.now();
  }

  function adminAuthorized(req) {
    return (
      Boolean(cfg.ADMIN_TOKEN) &&
      req.headers['x-admin-token'] === cfg.ADMIN_TOKEN
    );
  }

  function registrationAllowed(req) {
    const forwarded = String(req.headers['x-forwarded-for'] || '')
      .split(',')[0]
      .trim();
    const key = forwarded || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const window = registrationWindows.get(key) || {
      startedAt: now,
      count: 0,
    };
    if (now - window.startedAt >= 60_000) {
      window.startedAt = now;
      window.count = 0;
    }
    if (window.count >= cfg.MAX_REGISTRATIONS_PER_MINUTE) return false;
    window.count += 1;
    registrationWindows.set(key, window);
    return true;
  }

  function buildAdminStatus() {
    const clients = loadClients();
    const ids = new Set([...clients.keys(), ...online.keys(), ...banned]);
    return {
      online: online.size,
      joined: [...online.values()].filter((connection) => connection.joined)
        .length,
      totalMessages: messages.length,
      trades: trades.size,
      lastSeq: nextSeq - 1,
      banned: [...banned],
      servers: [...ids].map((serverId) => {
        const connection = online.get(serverId);
        return {
          server_id: serverId,
          name: connection?.name || clients.get(serverId)?.name || serverId,
          online: Boolean(connection),
          joined: Boolean(connection?.joined),
          expose_level: connection?.exposeLevel || null,
          groups: connection?.groups || [],
          trade_enabled: Boolean(connection?.tradeEnabled),
          trade_allow_servers: connection?.tradeAllow || [],
          trade_deny_servers: connection?.tradeDeny || [],
          realm_stats: connection?.realmStats || null,
          banned: banned.has(serverId),
          lastSeen: connection?.lastSeen || null,
        };
      }),
    };
  }

  const httpServer = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;

    if (pathname === '/admin' && req.method === 'GET') {
      const file = path.resolve(SERVER_DIR, 'admin.html');
      if (!fs.existsSync(file))
        return sendJson(res, 404, { ok: false, reason: 'not_found' });
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(fs.readFileSync(file));
      return;
    }

    if (pathname === '/api/status' && req.method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        service: 'zhutian-worldchat',
        online: online.size,
        joined: [...online.values()].filter((connection) => connection.joined)
          .length,
        totalMessages: messages.length,
      });
      return;
    }

    if (pathname === '/api/register' && req.method === 'POST') {
      if (!cfg.ENROLLMENT_TOKEN)
        return sendJson(res, 503, {
          ok: false,
          reason: 'registration_disabled',
        });
      if (!registrationAllowed(req))
        return sendJson(res, 429, {
          ok: false,
          reason: 'registration_rate_limited',
        });
      let body;
      try {
        body = await readBody(req, cfg.MAX_PAYLOAD_BYTES);
      } catch (error) {
        if (!res.headersSent)
          sendJson(res, error.statusCode || 400, {
            ok: false,
            reason: error.message,
          });
        return;
      }
      if (!safeTokenEqual(body.enrollment_token, cfg.ENROLLMENT_TOKEN))
        return sendJson(res, 401, {
          ok: false,
          reason: 'enrollment_invalid',
        });
      const requestedName = cleanLabel(body.name);

      const clients = readJson(clientsFile, {});
      let serverId;
      do {
        serverId = `sv_${crypto.randomBytes(8).toString('hex')}`;
      } while (clients[serverId]);
      const name =
        requestedName && requestedName !== '区服-待登记'
          ? requestedName
          : `区服-${serverId.slice(3, 9)}`;
      const secret = crypto.randomBytes(32).toString('hex');
      clients[serverId] = { name, secret, enabled: true };
      try {
        atomicWriteJson(clientsFile, clients);
      } catch (error) {
        logger.error('[worldchat] client registration persistence failed', error);
        return sendJson(res, 500, { ok: false, reason: 'storage_error' });
      }
      logger.info(`[worldchat] REGISTER ${name} (${serverId})`);
      sendJson(res, 201, {
        ok: true,
        server_id: serverId,
        secret,
        name,
      });
      return;
    }

    if (pathname === '/api/admin/status' && req.method === 'GET') {
      if (!adminAuthorized(req))
        return sendJson(res, 401, { ok: false, reason: 'unauthorized' });
      sendJson(res, 200, buildAdminStatus());
      return;
    }

    if (
      (pathname === '/api/admin/ban' || pathname === '/api/admin/unban') &&
      req.method === 'POST'
    ) {
      if (!adminAuthorized(req))
        return sendJson(res, 401, { ok: false, reason: 'unauthorized' });
      let body;
      try {
        body = await readBody(req, cfg.MAX_PAYLOAD_BYTES);
      } catch (error) {
        if (!res.headersSent)
          sendJson(res, error.statusCode || 400, {
            ok: false,
            reason: error.message,
          });
        return;
      }
      const serverId = String(body.server_id || '').trim();
      if (!/^[A-Za-z0-9_-]{3,64}$/.test(serverId)) {
        return sendJson(res, 400, { ok: false, reason: 'invalid_server_id' });
      }
      try {
        if (pathname.endsWith('/ban')) {
          banned.add(serverId);
          atomicWriteJson(bannedFile, [...banned]);
          online.get(serverId)?.ws.close(1008, 'banned');
          logger.info(
            `[worldchat] BANNED ${serverId} reason=${cleanLabel(
              body.reason,
              100
            )}`
          );
        } else {
          banned.delete(serverId);
          atomicWriteJson(bannedFile, [...banned]);
          logger.info(`[worldchat] UNBANNED ${serverId}`);
        }
      } catch (error) {
        logger.error('[worldchat] banned list persistence failed', error);
        return sendJson(res, 500, { ok: false, reason: 'storage_error' });
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === '/' && req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        service: 'zhutian-worldchat',
        online: online.size,
      });
    }
    sendJson(res, 404, { ok: false, reason: 'not_found' });
  });

  const wss = new WebSocketServer({
    server: httpServer,
    maxPayload: cfg.MAX_PAYLOAD_BYTES,
  });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    let connection = null;
    ws.on('pong', () => (ws.isAlive = true));

    ws.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return send(ws, { type: 'ERR', reason: 'invalid_json' });
      }
      if (!message || typeof message !== 'object') return;

      if (message.type === 'HELLO') {
        if (connection) {
          send(ws, { type: 'WELCOME', ok: false, reason: 'already_authed' });
          return ws.close(1008, 'already_authed');
        }
        const serverId = String(message.server_id || '');
        const timestamp = Number(message.ts);
        const nonce = String(message.nonce || '');
        const now = Date.now();
        const client = loadClients().get(serverId);
        for (const [key, expiresAt] of usedNonces)
          if (expiresAt <= now) usedNonces.delete(key);
        const nonceKey = `${serverId}:${nonce}`;
        const expected = client
          ? hmac(client.secret, helloPayload(serverId, timestamp, nonce))
          : '';
        if (
          !client ||
          banned.has(serverId) ||
          !Number.isSafeInteger(timestamp) ||
          Math.abs(now - timestamp) > cfg.AUTH_WINDOW_MS ||
          !/^[a-f0-9]{32}$/i.test(nonce) ||
          usedNonces.has(nonceKey) ||
          !safeHexEqual(expected, message.token)
        ) {
          const reason = banned.has(serverId) ? 'banned' : 'auth_failed';
          send(ws, { type: 'WELCOME', ok: false, reason });
          return ws.close(1008, reason);
        }
        usedNonces.set(nonceKey, now + cfg.AUTH_WINDOW_MS);
        const previous = online.get(serverId);
        if (previous && previous.ws !== ws) previous.ws.close(1008, 'replaced');
        connection = {
          ws,
          serverId,
          secret: client.secret,
          name: cleanLabel(message.name) || cleanLabel(client.name) || serverId,
        };
        syncPresence(connection, message);
        online.set(serverId, connection);
        send(ws, {
          type: 'WELCOME',
          ok: true,
          server_id: serverId,
          online: online.size,
          total: messages.length,
          last_seq: nextSeq - 1,
        });
        logger.info(
          `[worldchat] HELLO ${connection.name} (${serverId}), online=${online.size}`
        );
        return;
      }

      if (!connection) return send(ws, { type: 'ERR', reason: 'not_authed' });
      connection.lastSeen = Date.now();

      if (message.type === 'PING')
        return send(ws, { type: 'PONG', ts: Date.now() });
      if (message.type === 'SYNC') {
        syncPresence(connection, message);
        return send(ws, { type: 'SYNC_ACK', ok: true, last_seq: nextSeq - 1 });
      }

      if (message.type === 'REALM_LIST') {
        const requestId = String(message.request_id || '');
        const realms = [...online.values()].map((peer) => ({
          server_id: peer.serverId,
          name: peer.name,
          online: true,
          joined: Boolean(peer.joined),
          trade_enabled: Boolean(peer.tradeEnabled),
          realm_stats: peer.realmStats || null,
        }));
        return send(ws, { type: 'REALM_LIST_RESULT', request_id: requestId, ok: true, realms });
      }

      if (message.type === 'TRADE_CREATE') {
        const requestId = String(message.request_id || '');
        const targetServerId = String(message.target_server_id || '');
        const target = online.get(targetServerId);
        const offer = validateTradeOffer(message.give, message.want);
        let reason = null;
        if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) reason = 'invalid_request_id';
        else if (!/^[A-Za-z0-9_-]{3,64}$/.test(targetServerId)) reason = 'invalid_target';
        else if (!connection.tradeEnabled) reason = 'trade_disabled';
        else if (!target) reason = 'target_offline';
        else if (!tradePeerAllowed(connection, target)) reason = 'trade_not_allowed';
        else if (!offer.ok) reason = offer.reason;
        else if ([...trades.values()].filter((trade) =>
          trade.status === 'open' &&
          (trade.seller_server_id === connection.serverId || trade.target_server_id === connection.serverId)
        ).length >= cfg.TRADE_MAX_ACTIVE_PER_SERVER) reason = 'too_many_trades';
        if (reason) return send(ws, { type: 'TRADE_CREATE_RESULT', request_id: requestId, ok: false, reason });

        const trade = {
          code: newTradeCode(),
          status: 'open',
          seller_server_id: connection.serverId,
          seller_name: connection.name,
          seller_tag: String(message.seller_tag || ''),
          target_server_id: target.serverId,
          target_name: target.name,
          give: offer.give,
          want: offer.want,
          created_at: Date.now(),
          expires_at: Date.now() + (cfg.TRADE_TTL_MS || TRADE_LIMITS.ttlMs),
          settlement: { seller: false, buyer: false },
        };
        if (!/^[a-f0-9]{12,32}$/i.test(trade.seller_tag)) {
          return send(ws, { type: 'TRADE_CREATE_RESULT', request_id: requestId, ok: false, reason: 'invalid_member_tag' });
        }
        trades.set(trade.code, trade);
        saveTrades();
        send(ws, { type: 'TRADE_CREATE_RESULT', request_id: requestId, ok: true, trade: publicTradeView(trade) });
        sendTradeEvent(target.serverId, 'TRADE_OFFER', trade);
        return;
      }

      if (message.type === 'TRADE_LIST') {
        const requestId = String(message.request_id || '');
        const result = [...trades.values()]
          .filter((trade) => trade.status === 'open' && trade.target_server_id === connection.serverId && trade.expires_at > Date.now())
          .map(publicTradeView);
        return send(ws, { type: 'TRADE_LIST_RESULT', request_id: requestId, ok: true, trades: result });
      }

      if (message.type === 'TRADE_GET') {
        const requestId = String(message.request_id || '');
        const code = String(message.code || '').toUpperCase();
        const trade = trades.get(code);
        const participant = trade && (
          trade.seller_server_id === connection.serverId ||
          trade.buyer_server_id === connection.serverId ||
          trade.target_server_id === connection.serverId
        );
        return send(ws, {
          type: 'TRADE_GET_RESULT',
          request_id: requestId,
          ok: Boolean(participant),
          reason: participant ? undefined : 'trade_not_found',
          trade: participant ? publicTradeView(trade) : null,
        });
      }

      if (message.type === 'TRADE_CANCEL') {
        const requestId = String(message.request_id || '');
        const trade = trades.get(String(message.code || '').toUpperCase());
        if (!trade || trade.seller_server_id !== connection.serverId || trade.status !== 'open') {
          return send(ws, { type: 'TRADE_CANCEL_RESULT', request_id: requestId, ok: false, reason: 'trade_not_found' });
        }
        trade.status = 'cancelled';
        trade.closed_at = Date.now();
        saveTrades();
        send(ws, { type: 'TRADE_CANCEL_RESULT', request_id: requestId, ok: true, trade: publicTradeView(trade) });
        sendTradeEvent(trade.target_server_id, 'TRADE_CANCELLED', trade);
        return;
      }

      if (message.type === 'TRADE_ACCEPT') {
        const requestId = String(message.request_id || '');
        const code = String(message.code || '').toUpperCase();
        const trade = trades.get(code);
        const buyerTag = String(message.buyer_tag || '');
        const seller = trade ? online.get(trade.seller_server_id) : null;
        let reason = null;
        if (!trade || trade.expires_at <= Date.now()) reason = 'trade_not_found';
        else if (trade.status !== 'open') reason = 'trade_closed';
        else if (trade.target_server_id !== connection.serverId) reason = 'wrong_target';
        else if (!seller || !tradePeerAllowed(connection, seller)) reason = 'trade_not_allowed';
        else if (!/^[a-f0-9]{12,32}$/i.test(buyerTag)) reason = 'invalid_member_tag';
        if (reason) return send(ws, { type: 'TRADE_ACCEPT_RESULT', request_id: requestId, ok: false, reason });

        trade.status = 'settling';
        trade.buyer_server_id = connection.serverId;
        trade.buyer_name = connection.name;
        trade.buyer_tag = buyerTag;
        trade.settlement = { seller: false, buyer: false };
        trade.accepted_at = Date.now();
        saveTrades();
        send(ws, { type: 'TRADE_ACCEPT_RESULT', request_id: requestId, ok: true, trade: publicTradeView(trade) });
        sendTradeEvent(trade.seller_server_id, 'TRADE_SETTLE', trade, {
          role: 'seller',
          member_tag: trade.seller_tag,
        });
        sendTradeEvent(trade.buyer_server_id, 'TRADE_SETTLE', trade, {
          role: 'buyer',
          member_tag: trade.buyer_tag,
        });
        return;
      }

      if (message.type === 'TRADE_SETTLE_ACK') {
        const requestId = String(message.request_id || '');
        const trade = trades.get(String(message.code || '').toUpperCase());
        const role = message.role === 'buyer' ? 'buyer' : message.role === 'seller' ? 'seller' : '';
        if (!role) {
          return send(ws, { type: 'TRADE_SETTLE_ACK_RESULT', request_id: requestId, ok: false, reason: 'invalid_role' });
        }
        const expectedServer = role === 'buyer' ? trade?.buyer_server_id : trade?.seller_server_id;
        const expectedTag = role === 'buyer' ? trade?.buyer_tag : trade?.seller_tag;
        if (!trade || trade.status !== 'settling' || expectedServer !== connection.serverId || expectedTag !== String(message.member_tag || '')) {
          return send(ws, { type: 'TRADE_SETTLE_ACK_RESULT', request_id: requestId, ok: false, reason: 'trade_not_found' });
        }
        if (message.ok !== true) {
          trade.status = 'failed';
          trade.failure_reason = cleanTradeLabel(message.reason, 120) || 'local_settlement_failed';
          saveTrades();
          sendTradeEvent(trade.seller_server_id, 'TRADE_ROLLBACK', trade);
          sendTradeEvent(trade.buyer_server_id, 'TRADE_ROLLBACK', trade);
          return send(ws, { type: 'TRADE_SETTLE_ACK_RESULT', request_id: requestId, ok: false, reason: trade.failure_reason });
        }
        trade.settlement[role] = true;
        if (trade.settlement.seller && trade.settlement.buyer) {
          trade.status = 'completed';
          trade.completed_at = Date.now();
          saveTrades();
          sendTradeEvent(trade.seller_server_id, 'TRADE_COMPLETED', trade);
          sendTradeEvent(trade.buyer_server_id, 'TRADE_COMPLETED', trade);
        } else {
          saveTrades();
        }
        return send(ws, { type: 'TRADE_SETTLE_ACK_RESULT', request_id: requestId, ok: true, status: trade.status });
      }

      if (message.type === 'RAID_OPEN') {
        const requestId = String(message.request_id || '');
        const teamId = cleanLabel(message.team_id, 80);
        const boss = cleanLabel(message.boss, 50);
        const localMembers = Math.max(1, Math.min(5, Math.trunc(Number(message.local_members) || 1)));
        if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestId) || !teamId || !boss) {
          return send(ws, { type: 'RAID_OPEN_RESULT', request_id: requestId, ok: false, reason: 'invalid_raid' });
        }
        let raid = [...raids.values()].find((item) =>
          item.host_server_id === connection.serverId
          && item.team_id === teamId
          && item.status === 'recruiting'
          && item.expires_at > Date.now()
        );
        if (!raid) {
          raid = {
            code: newRaidCode(),
            host_server_id: connection.serverId,
            host_name: connection.name,
            team_id: teamId,
            boss,
            local_members: localMembers,
            members: [],
            status: 'recruiting',
            created_at: Date.now(),
            expires_at: Date.now() + cfg.RAID_TTL_MS,
          };
          raids.set(raid.code, raid);
        } else {
          raid.local_members = localMembers;
          raid.boss = boss;
        }
        saveRaids();
        return send(ws, { type: 'RAID_OPEN_RESULT', request_id: requestId, ok: true, raid: raidForClient(raid) });
      }

      if (message.type === 'RAID_LIST') {
        const requestId = String(message.request_id || '');
        const result = [...raids.values()]
          .filter((raid) => raid.status === 'recruiting' && raid.expires_at > Date.now())
          .map(raidForClient);
        return send(ws, { type: 'RAID_LIST_RESULT', request_id: requestId, ok: true, raids: result });
      }

      if (message.type === 'RAID_GET') {
        const requestId = String(message.request_id || '');
        const raid = raids.get(String(message.code || '').toUpperCase());
        const active = Boolean(raid && raid.expires_at > Date.now());
        return send(ws, {
          type: 'RAID_GET_RESULT',
          request_id: requestId,
          ok: active,
          reason: active ? undefined : 'raid_not_found',
          raid: active ? raidForClient(raid) : null,
        });
      }

      if (message.type === 'RAID_JOIN') {
        const requestId = String(message.request_id || '');
        const code = String(message.code || '').toUpperCase();
        const memberTag = String(message.member_tag || '');
        const avatar = cleanRaidAvatar(message.avatar);
        const raid = raids.get(code);
        let reason = null;
        if (!raid || raid.expires_at <= Date.now()) reason = 'raid_not_found';
        else if (raid.status !== 'recruiting') reason = 'raid_closed';
        else if (raid.host_server_id === connection.serverId) reason = 'same_server';
        else if (!/^[a-f0-9]{12,32}$/i.test(memberTag) || !avatar) reason = 'invalid_avatar';
        else if (raid.local_members + raid.members.length >= 5) reason = 'raid_full';
        else if (raid.members.some((item) => item.server_id === connection.serverId && item.member_tag === memberTag)) reason = 'already_joined';
        else if ([...raids.values()].some((item) => item.status === 'recruiting' && item.members?.some((member) => member.server_id === connection.serverId && member.member_tag === memberTag))) reason = 'already_in_raid';
        if (reason) return send(ws, { type: 'RAID_JOIN_RESULT', request_id: requestId, ok: false, reason });
        raid.members.push({
          server_id: connection.serverId,
          server_name: connection.name,
          member_tag: memberTag,
          avatar,
          joined_at: Date.now(),
        });
        saveRaids();
        return send(ws, { type: 'RAID_JOIN_RESULT', request_id: requestId, ok: true, raid: raidForClient(raid) });
      }

      if (message.type === 'RAID_CLOSE') {
        const requestId = String(message.request_id || '');
        const raid = raids.get(String(message.code || '').toUpperCase());
        if (!raid || raid.host_server_id !== connection.serverId) {
          return send(ws, { type: 'RAID_CLOSE_RESULT', request_id: requestId, ok: false, reason: 'raid_not_found' });
        }
        raid.status = cleanLabel(message.status, 20) || 'closed';
        raid.closed_at = Date.now();
        saveRaids();
        return send(ws, { type: 'RAID_CLOSE_RESULT', request_id: requestId, ok: true });
      }

      if (message.type === 'PUB') {
        const requestId = String(message.request_id || '');
        const dedupeKey = `${connection.serverId}:${requestId}`;
        const previous = publishedRequests.get(dedupeKey);
        if (previous) {
          return send(ws, {
            type: 'PUB_ACK',
            request_id: requestId,
            ok: true,
            id: previous.id,
            seq: previous.seq,
            ts: previous.ts,
            duplicate: true,
          });
        }

        const timestamp = Number(message.ts);
        const text = String(message.msg || '');
        const images = cleanImageUrls(message.images || []);
        const senderName = cleanLabel(message.sender_name);
        const senderTag = String(message.sender_tag || '');
        const expected = hmac(
          connection.secret,
          publishPayload(connection.serverId, message)
        );
        let reason = null;
        if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestId))
          reason = 'invalid_request_id';
        else if (
          !Number.isSafeInteger(timestamp) ||
          Math.abs(Date.now() - timestamp) > cfg.AUTH_WINDOW_MS
        )
          reason = 'expired';
        else if (!safeHexEqual(expected, message.sig)) reason = 'bad_sig';
        else if (
          !senderName ||
          !/^[a-f0-9]{12,32}$/i.test(senderTag) ||
          (!text.trim() && !images.length) ||
          text.length > 500
        )
          reason = 'invalid_message';
        else if (!Array.isArray(message.images || []) || images.length !== (message.images || []).length)
          reason = 'invalid_images';
        if (reason)
          return send(ws, {
            type: 'PUB_ACK',
            request_id: requestId,
            ok: false,
            reason,
          });

        const now = Date.now();
        const window = publishWindows.get(connection.serverId) || {
          startedAt: now,
          count: 0,
        };
        if (now - window.startedAt >= 60_000)
          Object.assign(window, { startedAt: now, count: 0 });
        if (window.count >= cfg.MAX_PUB_PER_MINUTE) {
          return send(ws, {
            type: 'PUB_ACK',
            request_id: requestId,
            ok: false,
            reason: 'rate_limited',
          });
        }
        const userKey = `${connection.serverId}:${senderTag}`;
        if (now - (userLastPublish.get(userKey) || 0) < cfg.USER_COOLDOWN_MS) {
          return send(ws, {
            type: 'PUB_ACK',
            request_id: requestId,
            ok: false,
            reason: 'user_cooldown',
          });
        }
        window.count += 1;
        publishWindows.set(connection.serverId, window);
        userLastPublish.set(userKey, now);

        const entry = {
          id: crypto.randomUUID(),
          seq: nextSeq++,
          client_msg_id: requestId,
          server_id: connection.serverId,
          name: connection.name,
          sender_name: senderName,
          sender_tag: senderTag,
          msg: filterText(text.trim()),
          images,
          ts: now,
          groups: connection.exposeLevel ? connection.groups : [],
          expose_level: connection.exposeLevel,
        };
        messages.push(entry);
        try {
          saveMessages();
        } catch (error) {
          messages.pop();
          nextSeq -= 1;
          logger.error('[worldchat] message persistence failed', error);
          return send(ws, {
            type: 'PUB_ACK',
            request_id: requestId,
            ok: false,
            reason: 'storage_error',
          });
        }
        publishedRequests.set(dedupeKey, entry);
        send(ws, {
          type: 'PUB_ACK',
          request_id: requestId,
          ok: true,
          id: entry.id,
          seq: entry.seq,
          ts: entry.ts,
        });
        for (const peer of online.values()) {
          if (peer.joined) send(peer.ws, { type: 'MESSAGE', message: entry });
        }
        logger.info(
          `[worldchat] PUB #${entry.seq} ${connection.name}/${senderName}: ${entry.msg}`
        );
        return;
      }

      if (message.type === 'QUERY') {
        const requestId = String(message.request_id || '');
        if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) return;
        const limit = Math.min(
          Math.max(1, Number(message.limit) || cfg.QUERY_LIMIT_DEFAULT),
          cfg.QUERY_LIMIT_MAX
        );
        const afterSeq = Number(message.after_seq);
        const result =
          Number.isSafeInteger(afterSeq) && afterSeq >= 0
            ? messages.filter((item) => item.seq > afterSeq).slice(0, limit)
            : messages.slice(-limit).reverse();
        send(ws, {
          type: 'QUERY_RESULT',
          request_id: requestId,
          messages: result,
          total: messages.length,
          last_seq: nextSeq - 1,
        });
      }
    });

    ws.on('close', () => {
      if (connection && online.get(connection.serverId)?.ws === ws) {
        online.delete(connection.serverId);
        logger.info(
          `[worldchat] BYE ${connection.serverId}, online=${online.size}`
        );
      }
    });
    ws.on('error', () => {});
  });

  const heartbeat = setInterval(() => {
    const cutoff = Date.now() - 60_000;
    for (const [key, timestamp] of userLastPublish)
      if (timestamp < cutoff) userLastPublish.delete(key);
    for (const ws of wss.clients) {
      if (ws.isAlive === false) ws.terminate();
      else {
        ws.isAlive = false;
        ws.ping();
      }
    }
    let raidsChanged = false;
    for (const [code, raid] of raids) {
      if (raid.expires_at <= Date.now()) {
        raids.delete(code);
        raidsChanged = true;
      }
    }
    if (raidsChanged) saveRaids();
    let tradesChanged = false;
    for (const [code, trade] of trades) {
      if (trade.expires_at <= Date.now() && ['open', 'settling'].includes(trade.status)) {
        trade.status = 'expired';
        trade.failure_reason = 'trade_expired';
        tradesChanged = true;
        sendTradeEvent(trade.seller_server_id, 'TRADE_ROLLBACK', trade);
        if (trade.buyer_server_id) sendTradeEvent(trade.buyer_server_id, 'TRADE_ROLLBACK', trade);
      }
    }
    if (tradesChanged) saveTrades();
  }, 30_000);
  heartbeat.unref();

  async function start() {
    await new Promise((resolve, reject) => {
      const onError = (error) => reject(error);
      httpServer.once('error', onError);
      httpServer.listen(cfg.PORT, cfg.HOST, () => {
        httpServer.off('error', onError);
        resolve();
      });
    });
    const address = httpServer.address();
    logger.info(`[worldchat] server listening on ${cfg.HOST}:${address.port}`);
    return address;
  }

  async function stop() {
    clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    await new Promise((resolve) => httpServer.close(resolve));
  }

  return {
    httpServer,
    wss,
    start,
    stop,
    getMessages: () => [...messages],
    getRaids: () => [...raids.values()],
    getTrades: () => [...trades.values()],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === SERVER_FILE) {
  createWorldChatServer()
    .start()
    .catch((error) => {
      console.error('[worldchat] failed to start', error);
      process.exitCode = 1;
    });
}
