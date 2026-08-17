// 世界频道客户端：单连接、请求匹配、实时收取与断线补拉。
import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CONFIG_PATH = path.join(MODULE_DIR, 'config.local.json');
const LEGACY_CONFIG_PATH = path.join(MODULE_DIR, 'config.json');
const DEV_SECRET = 'zhutian-worldchat-dev-secret-change-me';

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${crypto
    .randomBytes(4)
    .toString('hex')}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, file);
}

function readConfig(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeConfig(input = {}) {
  const cfg = { ...input };
  cfg.enable = cfg.enable !== false;
  cfg.url = cfg.url || 'ws://127.0.0.1:8080';
  cfg.query_default = Math.min(
    100,
    Math.max(1, Number(cfg.query_default) || 10)
  );
  cfg.expose_group = ['admin', 'public'].includes(cfg.expose_group)
    ? cfg.expose_group
    : false;
  cfg.joined_groups = [
    ...new Set(
      (cfg.joined_groups || [])
        .map(String)
        .filter((id) => /^[\w-]{1,64}$/.test(id))
    ),
  ];
  cfg.last_seen_seq = Math.max(0, Number(cfg.last_seen_seq) || 0);
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(String(cfg.server_id || ''))) {
    cfg.server_id = `sv_${crypto.randomBytes(8).toString('hex')}`;
  }
  if (
    typeof cfg.secret !== 'string' ||
    cfg.secret.length < 32 ||
    cfg.secret === DEV_SECRET
  ) {
    cfg.secret = crypto.randomBytes(32).toString('hex');
  }
  cfg.name = String(cfg.name || `区服-${cfg.server_id.slice(3, 9)}`)
    .trim()
    .slice(0, 30);
  return cfg;
}

export function loadConfig(configPath = DEFAULT_CONFIG_PATH) {
  const legacy =
    configPath === DEFAULT_CONFIG_PATH ? readConfig(LEGACY_CONFIG_PATH) : null;
  const cfg = normalizeConfig(readConfig(configPath) || legacy || {});
  atomicWriteJson(configPath, cfg);
  return cfg;
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

export class WorldChatClient {
  constructor(options = {}) {
    this.configPath = options.configPath || DEFAULT_CONFIG_PATH;
    this.cfg = options.config
      ? normalizeConfig(options.config)
      : loadConfig(this.configPath);
    this.persist = options.persist !== false;
    this.WebSocket = options.WebSocket || WebSocket;
    this.ws = null;
    this.connected = false;
    this.authed = false;
    this.lastError = null;
    this.reconnectDelay = 1000;
    this.maxDelay = 60_000;
    this.pingTimer = null;
    this.reconnectTimer = null;
    this.pending = new Map();
    this.seenMessageIds = new Set();
    this.messageHandler = null;
    this.backfillPromise = null;
    this.deliveryChain = Promise.resolve();
  }

  saveConfig() {
    if (this.persist) atomicWriteJson(this.configPath, this.cfg);
  }

  hmac(payload) {
    return crypto
      .createHmac('sha256', this.cfg.secret)
      .update(payload)
      .digest('hex');
  }

  userTag(userId) {
    return this.hmac(`USER\n${String(userId)}`).slice(0, 16);
  }

  setMessageHandler(handler) {
    this.messageHandler = typeof handler === 'function' ? handler : null;
  }

  connect() {
    if (!this.cfg.enable) return;
    if (
      this.ws &&
      (this.ws.readyState === this.WebSocket.OPEN ||
        this.ws.readyState === this.WebSocket.CONNECTING)
    ) {
      return;
    }

    let ws;
    try {
      ws = new this.WebSocket(this.cfg.url, { maxPayload: 16 * 1024 });
    } catch (error) {
      this.lastError = error.message;
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.on('open', () => {
      this.connected = true;
      const ts = Date.now();
      const nonce = crypto.randomBytes(16).toString('hex');
      ws.send(
        JSON.stringify({
          type: 'HELLO',
          server_id: this.cfg.server_id,
          name: this.cfg.name,
          ...this.presence(),
          ts,
          nonce,
          token: this.hmac(helloPayload(this.cfg.server_id, ts, nonce)),
        })
      );
    });
    ws.on('message', (raw) => this.onMessage(raw));
    ws.on('close', () => {
      this.connected = false;
      this.authed = false;
      this.stopPing();
      this.rejectPending('disconnected');
      this.scheduleReconnect();
    });
    ws.on('error', (error) => {
      this.lastError = error.message;
    });
  }

  presence() {
    const groups = this.groups();
    return {
      joined: groups.length > 0,
      groups: this.cfg.expose_group ? groups : [],
      expose_level: this.cfg.expose_group || undefined,
    };
  }

  onMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type === 'WELCOME') {
      if (!message.ok) {
        this.lastError = message.reason || 'auth_failed';
        return;
      }
      this.authed = true;
      this.lastError = null;
      this.serverLastSeq = Math.max(0, Number(message.last_seq) || 0);
      if (this.cfg.start_from_now) {
        this.cfg.last_seen_seq = this.serverLastSeq;
        delete this.cfg.start_from_now;
        this.saveConfig();
      }
      this.reconnectDelay = 1000;
      this.startPing();
      this.syncPresence();
      this.backfill().catch(() => {});
      return;
    }

    if (message.type === 'MESSAGE') {
      this.enqueueDelivery(message.message).catch(
        (error) => (this.lastError = error.message)
      );
      return;
    }

    if (message.type === 'SYNC_ACK' && this.cfg.start_from_now) {
      this.cfg.last_seen_seq = Math.max(0, Number(message.last_seq) || 0);
      delete this.cfg.start_from_now;
      this.saveConfig();
      return;
    }

    if (message.request_id) {
      const pending = this.pending.get(message.request_id);
      if (pending && pending.type === message.type) {
        clearTimeout(pending.timer);
        this.pending.delete(message.request_id);
        pending.resolve(message);
      }
    }
  }

  startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === this.WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'PING' }));
      }
    }, 25_000);
    this.pingTimer.unref?.();
  }

  stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  scheduleReconnect() {
    if (!this.cfg.enable || this.reconnectTimer) return;
    const delay = this.reconnectDelay + Math.floor(Math.random() * 250);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    this.reconnectTimer.unref?.();
    this.reconnectDelay = Math.min(this.maxDelay, this.reconnectDelay * 2);
  }

  rejectPending(reason) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.resolve({ ok: false, reason });
    }
    this.pending.clear();
  }

  request(type, responseType, body = {}, timeout = 5000) {
    return new Promise((resolve) => {
      if (!this.authed || this.ws?.readyState !== this.WebSocket.OPEN) {
        resolve({ ok: false, reason: 'disconnected' });
        return;
      }
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ ok: false, reason: 'timeout' });
      }, timeout);
      timer.unref?.();
      this.pending.set(requestId, { type: responseType, resolve, timer });
      this.ws.send(JSON.stringify({ type, request_id: requestId, ...body }));
    });
  }

  pub(text, sender = {}) {
    if (!this.authed || this.ws?.readyState !== this.WebSocket.OPEN) {
      return Promise.resolve({ ok: false, reason: 'disconnected' });
    }
    const requestId = crypto.randomUUID();
    const message = {
      type: 'PUB',
      request_id: requestId,
      ts: Date.now(),
      msg: String(text),
      sender_name: String(sender.name || '无名道友')
        .trim()
        .slice(0, 30),
      sender_tag: String(sender.tag || ''),
    };
    message.sig = this.hmac(publishPayload(this.cfg.server_id, message));
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ ok: false, reason: 'timeout' });
      }, 5000);
      timer.unref?.();
      this.pending.set(requestId, { type: 'PUB_ACK', resolve, timer });
      this.ws.send(JSON.stringify(message));
    });
  }

  async query(limit = this.cfg.query_default, afterSeq) {
    const body = {
      limit: Math.min(
        100,
        Math.max(1, Number(limit) || this.cfg.query_default)
      ),
    };
    if (Number.isSafeInteger(afterSeq) && afterSeq >= 0)
      body.after_seq = afterSeq;
    const result = await this.request('QUERY', 'QUERY_RESULT', body);
    return result.type === 'QUERY_RESULT' ? { ...result, ok: true } : result;
  }

  enqueueDelivery(message) {
    const delivery = this.deliveryChain.then(() => this.deliver(message));
    this.deliveryChain = delivery.catch(() => {});
    return delivery;
  }

  async deliver(message) {
    if (
      !message?.id ||
      !Number.isSafeInteger(message.seq) ||
      this.seenMessageIds.has(message.id)
    )
      return;
    if (this.messageHandler) await this.messageHandler(message);
    this.seenMessageIds.add(message.id);
    if (this.seenMessageIds.size > 2000) {
      this.seenMessageIds.delete(this.seenMessageIds.values().next().value);
    }
    if (message.seq > this.cfg.last_seen_seq) {
      this.cfg.last_seen_seq = message.seq;
      this.saveConfig();
    }
  }

  async backfill() {
    if (this.backfillPromise || !this.groups().length)
      return this.backfillPromise;
    this.backfillPromise = (async () => {
      let cursor = this.cfg.last_seen_seq;
      for (;;) {
        const result = await this.query(100, cursor);
        if (!result.ok || !Array.isArray(result.messages)) break;
        for (const message of result.messages) {
          await this.enqueueDelivery(message);
          cursor = Math.max(cursor, Number(message.seq) || 0);
        }
        if (result.messages.length < 100) break;
      }
    })().finally(() => (this.backfillPromise = null));
    return this.backfillPromise;
  }

  syncPresence() {
    if (this.authed && this.ws?.readyState === this.WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'SYNC', ...this.presence() }));
    }
  }

  groups() {
    return [...this.cfg.joined_groups];
  }

  isGroupJoined(groupId) {
    return this.cfg.joined_groups.includes(String(groupId));
  }

  joinGroup(groupId) {
    const id = String(groupId || '');
    if (!/^[\w-]{1,64}$/.test(id) || this.isGroupJoined(id)) return false;
    if (!this.cfg.joined_groups.length) this.cfg.start_from_now = true;
    this.cfg.joined_groups.push(id);
    this.saveConfig();
    this.syncPresence();
    return true;
  }

  leaveGroup(groupId) {
    const id = String(groupId || '');
    const before = this.cfg.joined_groups.length;
    this.cfg.joined_groups = this.cfg.joined_groups.filter(
      (group) => group !== id
    );
    if (this.cfg.joined_groups.length === before) return false;
    this.saveConfig();
    this.syncPresence();
    return true;
  }

  setName(name) {
    const value = String(name || '')
      .trim()
      .slice(0, 30);
    if (!value) return false;
    this.cfg.name = value;
    this.saveConfig();
    this.ws?.close();
    return true;
  }

  setExpose(level) {
    if (level !== false && level !== 'admin' && level !== 'public')
      return false;
    this.cfg.expose_group = level;
    this.saveConfig();
    this.syncPresence();
    return true;
  }

  status() {
    return {
      enable: this.cfg.enable,
      connected: this.connected,
      authed: this.authed,
      url: this.cfg.url,
      server_id: this.cfg.server_id,
      name: this.cfg.name,
      expose_group: this.cfg.expose_group,
      joined_groups: this.groups(),
      last_seen_seq: this.cfg.last_seen_seq,
      last_error: this.lastError,
    };
  }

  setEnable(value) {
    this.cfg.enable = Boolean(value);
    this.saveConfig();
    if (!this.cfg.enable) {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.ws?.close();
      this.ws = null;
      this.connected = false;
      this.authed = false;
      this.stopPing();
    } else {
      this.connect();
    }
  }

  close() {
    this.cfg.enable = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopPing();
    this.rejectPending('closed');
    this.ws?.terminate?.();
    this.ws = null;
    this.connected = false;
    this.authed = false;
  }
}

export const worldChatClient = new WorldChatClient();
