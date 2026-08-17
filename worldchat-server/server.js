// 世界频道总机：每服独立鉴权、实时广播、断线补拉。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { CONFIG } from './config.js';

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

function helloPayload(serverId, ts, nonce) {
  return JSON.stringify(['HELLO', serverId, Number(ts), String(nonce)]);
}

function publishPayload(serverId, message) {
  return JSON.stringify([
    'PUB',
    serverId,
    String(message.request_id),
    Number(message.ts),
    String(message.sender_name),
    String(message.sender_tag),
    String(message.msg),
  ]);
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

  const bannedData = readJson(bannedFile, []);
  const banned = new Set(
    Array.isArray(bannedData) ? bannedData.map(String) : []
  );
  const online = new Map();
  const usedNonces = new Map();
  const publishWindows = new Map();
  const userLastPublish = new Map();
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
    connection.lastSeen = Date.now();
  }

  function adminAuthorized(req) {
    return (
      Boolean(cfg.ADMIN_TOKEN) &&
      req.headers['x-admin-token'] === cfg.ADMIN_TOKEN
    );
  }

  function buildAdminStatus() {
    const clients = loadClients();
    const ids = new Set([...clients.keys(), ...online.keys(), ...banned]);
    return {
      online: online.size,
      joined: [...online.values()].filter((connection) => connection.joined)
        .length,
      totalMessages: messages.length,
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
          !text.trim() ||
          text.length > 500
        )
          reason = 'invalid_message';
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

  return { httpServer, wss, start, stop, getMessages: () => [...messages] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === SERVER_FILE) {
  createWorldChatServer()
    .start()
    .catch((error) => {
      console.error('[worldchat] failed to start', error);
      process.exitCode = 1;
    });
}
