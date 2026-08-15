// 修仙插件·世界聊天频道 - 云端中转服务器(留言板/拉取模型)
// 协议(WebSocket, JSON):
//   client -> server:
//     { type:'HELLO', server_id, name, joined, groups?, expose_level?, token }
//                                                    // groups: 本服群号数组(仅当 expose_level 设置时才有意义)
//                                                    // expose_level: 'admin'|'public'|不填
//                                                    // 握手鉴权, token=HMAC(server_id)
//     { type:'PUB',   ts, msg, sig }                 // 上送留言, sig=HMAC(server_id:ts:msg)
//     { type:'QUERY', limit }                        // 拉取最近 N 条
//     { type:'PING' }
//   server -> client:
//     { type:'WELCOME', ok, server_id, online, total, reason? }
//     { type:'PUB_ACK', ok, id, ts, reason? }
//     { type:'QUERY_RESULT', messages, total }
//     { type:'PONG', ts }
// HTTP:
//   GET  /api/status            返回在线区服与消息统计(含 expose_level/groups/banned)
//   GET  /admin                 管理面板(网页,需 ?token=管理员令牌)
//   POST /api/ban   {token,server_id,reason}   封禁某服(握手即拒+断开)
//   POST /api/unban {token,server_id}          解封

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { CONFIG } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 独立运行(非 Yunzai 上下文),用 console 充当 logger
const logger = console;

// ---------- 存储 ----------
const STORAGE = path.resolve(process.cwd(), CONFIG.STORAGE_FILE);
let messages = [];
function loadMessages() {
  try {
    if (fs.existsSync(STORAGE)) {
      messages = JSON.parse(fs.readFileSync(STORAGE, 'utf8'));
    }
  } catch {
    messages = [];
  }
}
function saveMessages() {
  if (messages.length > 1000) messages = messages.slice(-1000);
  fs.writeFileSync(STORAGE, JSON.stringify(messages));
}
loadMessages();

// ---------- 封禁名单 ----------
const BANNED_FILE = path.resolve(process.cwd(), CONFIG.BANNED_FILE);
let banned = new Set();
function loadBanned() {
  try {
    if (fs.existsSync(BANNED_FILE)) {
      const arr = JSON.parse(fs.readFileSync(BANNED_FILE, 'utf8'));
      if (Array.isArray(arr)) banned = new Set(arr);
    }
  } catch {
    banned = new Set();
  }
}
function saveBanned() {
  fs.writeFileSync(BANNED_FILE, JSON.stringify([...banned]));
}
loadBanned();

// ---------- 在线区服表 ----------
// server_id -> { ws, joined, name, groups, expose_level, lastSeen }
const online = new Map();

// ---------- 敏感词过滤 ----------
function filterText(text) {
  let out = String(text);
  for (const w of CONFIG.SENSITIVE_WORDS) {
    if (!w) continue;
    try {
      const re = new RegExp(w, 'gi');
      out = out.replace(re, '*'.repeat(Math.max(1, String(w).length)));
    } catch {
      /* 非法正则跳过 */
    }
  }
  return out;
}

// ---------- HMAC ----------
function hmac(payload) {
  return crypto.createHmac('sha256', CONFIG.SECRET).update(payload).digest('hex');
}

// ---------- 限流 ----------
const pubCounts = new Map(); // server_id -> { count, ts }

// ---------- HTTP 请求体读取 ----------
function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => {
      try {
        resolve(d ? JSON.parse(d) : {});
      } catch {
        resolve({});
      }
    });
  });
}

// ---------- 管理员令牌提取(优先级: query > header > body) ----------
function getAdminToken(req, body) {
  const u = new URL(req.url, 'http://localhost');
  const q = u.searchParams.get('token');
  if (q) return q;
  const h = req.headers['x-admin-token'];
  if (h) return h;
  if (body && body.token) return body.token;
  return null;
}

// ---------- HTTP ----------
const httpServer = http.createServer(async (req, res) => {
  const pathname = req.url.split('?')[0];

  // 管理面板
  if (pathname === '/admin' && req.method === 'GET') {
    const fp = path.resolve(__dirname, 'admin.html');
    if (fs.existsSync(fp)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(fp));
    } else {
      res.writeHead(404);
      res.end('admin.html not found');
    }
    return;
  }

  // 封禁 / 解封(需管理员令牌)
  if ((pathname === '/api/ban' || pathname === '/api/unban') && req.method === 'POST') {
    const body = await readBody(req);
    const token = getAdminToken(req, body);
    if (token !== CONFIG.ADMIN_TOKEN) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, reason: 'unauthorized' }));
      return;
    }
    const sid = String(body.server_id || '').trim();
    if (!sid) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, reason: 'missing server_id' }));
      return;
    }
    if (pathname === '/api/ban') {
      banned.add(sid);
      saveBanned();
      const conn = online.get(sid);
      if (conn && conn.ws) {
        try {
          conn.ws.close();
        } catch {
          /* ignore */
        }
        online.delete(sid);
      }
      logger.info(`[worldchat] BANNED ${sid} reason=${body.reason || ''}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, banned: [...banned] }));
    } else {
      banned.delete(sid);
      saveBanned();
      logger.info(`[worldchat] UNBANNED ${sid}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, banned: [...banned] }));
    }
    return;
  }

  // 状态查询
  if (pathname === '/api/status' && req.method === 'GET') {
    const joined = [...online.values()].filter((s) => s.joined).length;
    const body = {
      online: online.size,
      joined,
      totalMessages: messages.length,
      banned: [...banned],
      servers: [...online.entries()].map(([id, s]) => ({
        server_id: id,
        name: s.name,
        joined: s.joined,
        expose_level: s.expose_level || null,
        groups: s.groups || [],
        banned: banned.has(id),
        lastSeen: s.lastSeen
      }))
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body, null, 2));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, service: 'zhutian-worldchat', online: online.size }));
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server: httpServer });

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

wss.on('connection', (ws) => {
  let authed = false;
  let serverId = null;
  let name = null;
  let joined = false;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // 握手鉴权
    if (msg.type === 'HELLO') {
      const token = hmac(String(msg.server_id || ''));
      if (msg.token !== token) {
        send(ws, { type: 'WELCOME', ok: false, reason: 'auth_failed' });
        ws.close();
        return;
      }
      const sid = String(msg.server_id);
      if (banned.has(sid)) {
        send(ws, { type: 'WELCOME', ok: false, reason: 'banned' });
        ws.close();
        logger.info(`[worldchat] HELLO rejected(banned) ${sid}`);
        return;
      }
      authed = true;
      serverId = sid;
      name = String(msg.name || sid).slice(0, 30);
      joined = !!msg.joined;
      const groups = Array.isArray(msg.groups)
        ? msg.groups.map((g) => String(g)).slice(0, 10)
        : [];
      const expose =
        msg.expose_level === 'admin' || msg.expose_level === 'public'
          ? msg.expose_level
          : null;
      online.set(sid, { ws, joined, name, groups, expose_level: expose, lastSeen: Date.now() });
      send(ws, {
        type: 'WELCOME',
        ok: true,
        server_id: sid,
        online: online.size,
        total: messages.length
      });
      logger.info(
        `[worldchat] HELLO from ${name} (${sid}), expose=${expose || 'off'}, online=${online.size}`
      );
      return;
    }

    if (!authed) {
      send(ws, { type: 'ERR', reason: 'not_authed' });
      return;
    }

    if (msg.type === 'PING') {
      send(ws, { type: 'PONG', ts: Date.now() });
      return;
    }

    if (msg.type === 'PUB') {
      // 限流
      const now = Date.now();
      const rec = pubCounts.get(serverId) || { count: 0, ts: now };
      if (now - rec.ts > 1000) {
        rec.count = 0;
        rec.ts = now;
      }
      rec.count++;
      pubCounts.set(serverId, rec);
      if (rec.count > CONFIG.MAX_PUB_PER_SEC) {
        send(ws, { type: 'PUB_ACK', ok: false, reason: 'rate_limited' });
        return;
      }
      // 签名校验
      const payload = `${serverId}:${msg.ts}:${msg.msg}`;
      if (hmac(payload) !== msg.sig) {
        send(ws, { type: 'PUB_ACK', ok: false, reason: 'bad_sig' });
        return;
      }
      const clean = filterText(String(msg.msg || '').slice(0, 500));
      if (!clean.trim()) {
        send(ws, { type: 'PUB_ACK', ok: false, reason: 'empty' });
        return;
      }
      const conn = online.get(serverId);
      const entry = {
        id: crypto.randomUUID(),
        server_id: serverId,
        name,
        msg: clean,
        ts: Date.now(),
        groups: conn ? conn.groups : [],
        expose_level: conn ? conn.expose_level : null
      };
      messages.push(entry);
      saveMessages();
      send(ws, { type: 'PUB_ACK', ok: true, id: entry.id, ts: entry.ts });
      logger.info(`[worldchat] PUB ${name}: ${clean}`);
      return;
    }

    if (msg.type === 'QUERY') {
      const limit = Math.min(
        Math.max(1, Number(msg.limit) || CONFIG.QUERY_LIMIT_DEFAULT),
        CONFIG.QUERY_LIMIT_MAX
      );
      const recent = messages.slice(-limit).reverse();
      send(ws, { type: 'QUERY_RESULT', messages: recent, total: messages.length });
      return;
    }
  });

  ws.on('close', () => {
    if (serverId) {
      online.delete(serverId);
      logger.info(`[worldchat] BYE ${serverId}, online=${online.size}`);
    }
  });
  ws.on('error', () => {});
});

const PORT = CONFIG.PORT;
httpServer.listen(PORT, () => {
  logger.info(`[worldchat] server listening on :${PORT}`);
  console.log(`[worldchat] server listening on :${PORT}`);
});
