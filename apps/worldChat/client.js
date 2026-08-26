// 世界频道客户端：单连接、请求匹配、实时收取与断线补拉。
import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(
  MODULE_DIR,
  '../../../..',
  'data',
  'zhutian-worldchat'
);
export const DEFAULT_CONFIG_PATH =
  process.env.WORLDCHAT_CONFIG_PATH ||
  path.join(DATA_DIR, 'config.local.json');
export const DEFAULT_ENROLLMENT_PATH = path.join(
  MODULE_DIR,
  'enrollment.local.json'
);
export const DEFAULT_INSTALLATION_PATH =
  process.env.WORLDCHAT_INSTALLATION_PATH ||
  path.join(DATA_DIR, 'installation.id');
const LEGACY_LOCAL_CONFIG_PATH = path.join(MODULE_DIR, 'config.local.json');
const LEGACY_CONFIG_PATH = path.join(MODULE_DIR, 'config.json');
const DEV_SECRET = 'zhutian-worldchat-dev-secret-change-me';
const DEFAULT_WORLDCHAT_URL = 'wss://worldchat.ameng2027.xyz';
const DEFAULT_DELIVERY_QUEUE_LIMIT = 100;
const DEFAULT_DELIVERY_MAX_ATTEMPTS = 5;
const DEFAULT_DELIVERY_RETRY_MAX_MS = 30_000;
const MAX_DELIVERY_QUEUE_LIMIT = 500;
const MAX_DELIVERY_ATTEMPTS = 10;
const MAX_DELIVERY_RETRY_MS = 60_000;

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

function loadInstallationId(file) {
  if (!file) return '';
  try {
    const value = fs.readFileSync(file, 'utf8').trim();
    if (/^[a-f0-9]{32}$/i.test(value)) return value;
  } catch {}
  const value = crypto.randomBytes(16).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${crypto
    .randomBytes(4)
    .toString('hex')}.tmp`;
  fs.writeFileSync(temp, `${value}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, file);
  return value;
}

function hasUsableIdentity(config = {}) {
  return (
    /^[A-Za-z0-9_-]{3,64}$/.test(String(config.server_id || '')) &&
    /^[a-f0-9]{64}$/i.test(String(config.secret || ''))
  );
}

function normalizeConfig(input = {}) {
  const cfg = { ...input };
  cfg.enable = cfg.enable !== false;
  cfg.url = cfg.url || DEFAULT_WORLDCHAT_URL;
  cfg.enrollment_token = String(cfg.enrollment_token || '');
  cfg.auto_register =
    cfg.auto_register === true || Boolean(cfg.enrollment_token);
  cfg.query_default = Math.min(
    100,
    Math.max(1, Number(cfg.query_default) || 10)
  );
  cfg.expose_group = ['admin', 'public'].includes(cfg.expose_group)
    ? cfg.expose_group
    : false;
  cfg.trade_enabled = cfg.trade_enabled === true;
  cfg.trade_allow_servers = [
    ...new Set(
      (cfg.trade_allow_servers || [])
        .map(String)
        .filter((id) => id === '*' || /^[A-Za-z0-9_-]{3,64}$/.test(id))
    ),
  ].slice(0, 200);
  cfg.trade_deny_servers = [
    ...new Set(
      (cfg.trade_deny_servers || [])
        .map(String)
        .filter((id) => /^[A-Za-z0-9_-]{3,64}$/.test(id))
    ),
  ].slice(0, 200);
  cfg.realm_stats = cfg.realm_stats && typeof cfg.realm_stats === 'object'
    ? {
        players: Math.max(0, Math.trunc(Number(cfg.realm_stats.players) || 0)),
        max_mijing: Math.max(0, Math.trunc(Number(cfg.realm_stats.max_mijing) || 0)),
        max_xiangu: Math.max(0, Math.trunc(Number(cfg.realm_stats.max_xiangu) || 0)),
        max_huafen: Math.max(0, Math.trunc(Number(cfg.realm_stats.max_huafen) || 0)),
      }
    : { players: 0, max_mijing: 0, max_xiangu: 0, max_huafen: 0 };
  cfg.joined_groups = [
    ...new Set(
      (cfg.joined_groups || [])
        .map(String)
        .filter((id) => /^[\w-]{1,64}$/.test(id))
    ),
  ];
  cfg.last_seen_seq = Math.max(0, Number(cfg.last_seen_seq) || 0);
  const hasServerId = /^[A-Za-z0-9_-]{3,64}$/.test(
    String(cfg.server_id || '')
  );
  const hasSecret =
    typeof cfg.secret === 'string' &&
    cfg.secret.length >= 32 &&
    cfg.secret !== DEV_SECRET;
  if (cfg.auto_register && (!hasServerId || !hasSecret)) {
    cfg.server_id = '';
    cfg.secret = '';
  } else {
    if (!hasServerId) {
      cfg.server_id = `sv_${crypto.randomBytes(8).toString('hex')}`;
    }
    if (!hasSecret) cfg.secret = crypto.randomBytes(32).toString('hex');
  }
  cfg.name = String(cfg.name || `区服-${cfg.server_id.slice(3, 9) || '待登记'}`)
    .trim()
    .slice(0, 30);
  return cfg;
}

export function loadConfig(
  configPath = DEFAULT_CONFIG_PATH,
  enrollmentPath =
    configPath === DEFAULT_CONFIG_PATH ? DEFAULT_ENROLLMENT_PATH : null,
  installationPath =
    configPath === DEFAULT_CONFIG_PATH ? DEFAULT_INSTALLATION_PATH : null
) {
  const current = readConfig(configPath);
  let migratedPath = '';
  let legacy = null;
  if (!current && configPath === DEFAULT_CONFIG_PATH) {
    migratedPath = [LEGACY_LOCAL_CONFIG_PATH, LEGACY_CONFIG_PATH].find(
      (file) => readConfig(file)
    ) || '';
    legacy = migratedPath ? readConfig(migratedPath) : null;
  }
  const source = { ...(current || legacy || {}) };
  const installationId = loadInstallationId(installationPath);
  const trustedIdentity =
    hasUsableIdentity(source) &&
    source.identity_verified === true &&
    (!installationId || source.installation_id === installationId);
  if (!trustedIdentity && installationId) {
    source.server_id = '';
    source.secret = '';
    source.identity_verified = false;
    source.installation_id = installationId;
  }
  const enrollment = trustedIdentity || !enrollmentPath
    ? null
    : readConfig(enrollmentPath);
  const externalToken = String(
    process.env.WORLDCHAT_ENROLLMENT_TOKEN ||
      enrollment?.enrollment_token ||
      ''
  );
  const cfg = normalizeConfig({
    ...source,
    enrollment_token: source.enrollment_token || externalToken,
    url: source.url || enrollment?.url,
  });
  const persisted = { ...cfg };
  if (!source.enrollment_token) delete persisted.enrollment_token;
  atomicWriteJson(configPath, persisted);
  if (migratedPath) {
    try {
      fs.rmSync(migratedPath);
    } catch {}
  }
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
    JSON.stringify(message.images || []),
  ]);
}

function normalizeImageUrls(value) {
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
    this.tradeHandler = null;
    this.raidHandler = null;
    this.backfillPromise = null;
    this.deliveryFailureHandler = null;
    this.deliveryQueue = [];
    this.pendingDeliveries = new Map();
    this.deliveryProcessing = false;
    this.deliveryRetryWait = null;
    this.deliveryQueueLimit = Math.min(
      MAX_DELIVERY_QUEUE_LIMIT,
      Math.max(
        1,
        Math.trunc(Number(options.deliveryQueueLimit)) ||
          DEFAULT_DELIVERY_QUEUE_LIMIT
      )
    );
    let configuredAttempts = DEFAULT_DELIVERY_MAX_ATTEMPTS;
    if (options.deliveryMaxAttempts !== undefined) {
      configuredAttempts = Number(options.deliveryMaxAttempts);
    } else if (options.deliveryMaxRetries !== undefined) {
      const retries = Number(options.deliveryMaxRetries);
      configuredAttempts = Number.isNaN(retries)
        ? DEFAULT_DELIVERY_MAX_ATTEMPTS
        : Math.max(0, Math.trunc(retries)) + 1;
    }
    if (Number.isNaN(configuredAttempts)) {
      configuredAttempts = DEFAULT_DELIVERY_MAX_ATTEMPTS;
    }
    this.deliveryMaxAttempts = Math.min(
      MAX_DELIVERY_ATTEMPTS,
      Math.max(1, Math.trunc(configuredAttempts))
    );
    this.deliveryRetryBaseMs = Math.min(
      MAX_DELIVERY_RETRY_MS,
      Math.max(10, Number(options.deliveryRetryBaseMs) || 1_000)
    );
    this.deliveryRetryMaxMs = Math.min(
      MAX_DELIVERY_RETRY_MS,
      Math.max(
        this.deliveryRetryBaseMs,
        Number(options.deliveryRetryMaxMs) || DEFAULT_DELIVERY_RETRY_MAX_MS
      )
    );
    this.identityPromise = null;
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

  setDeliveryFailureHandler(handler) {
    this.deliveryFailureHandler =
      typeof handler === 'function' ? handler : null;
  }

  setTradeHandler(handler) {
    this.tradeHandler = typeof handler === 'function' ? handler : null;
  }

  setRaidHandler(handler) {
    this.raidHandler = typeof handler === 'function' ? handler : null;
  }

  hasIdentity() {
    return hasUsableIdentity(this.cfg);
  }

  registrationUrl() {
    const url = new URL(this.cfg.url);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = '/api/register';
    url.search = '';
    url.hash = '';
    return url;
  }

  async registerIdentity() {
    if (this.hasIdentity()) return true;
    if (!this.cfg.auto_register || !this.cfg.enrollment_token) {
      throw new Error('enrollment_required');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    timer.unref?.();
    let response;
    try {
      response = await fetch(this.registrationUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: this.cfg.name,
          enrollment_token: this.cfg.enrollment_token,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok || !body?.ok) {
      throw new Error(body?.reason || `register_http_${response.status}`);
    }
    if (
      !/^[A-Za-z0-9_-]{3,64}$/.test(String(body.server_id || '')) ||
      !/^[a-f0-9]{64}$/i.test(String(body.secret || ''))
    ) {
      throw new Error('invalid_registration_response');
    }
    this.cfg.server_id = body.server_id;
    this.cfg.secret = body.secret;
    this.cfg.name = String(body.name || this.cfg.name).slice(0, 30);
    this.cfg.identity_verified = true;
    delete this.cfg.enrollment_token;
    this.saveConfig();
    return true;
  }

  connect() {
    if (!this.cfg.enable) return;
    if (!this.hasIdentity()) {
      if (this.identityPromise) return;
      this.identityPromise = this.registerIdentity()
        .catch((error) => {
          this.lastError = error.message;
          this.scheduleReconnect();
        })
        .finally(() => {
          this.identityPromise = null;
          if (this.cfg.enable && this.hasIdentity()) this.connect();
        });
      return;
    }
    if (
      this.ws &&
      (this.ws.readyState === this.WebSocket.OPEN ||
        this.ws.readyState === this.WebSocket.CONNECTING)
    ) {
      return;
    }

    let ws;
    try {
      ws = new this.WebSocket(this.cfg.url, { maxPayload: 256 * 1024 });
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
    ws.on('close', (code, reason) => {
      const closeReason = reason?.toString?.().trim();
      if (closeReason) this.lastError = closeReason;
      else if (code !== 1000) this.lastError = `connection_closed_${code}`;
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
      trade_enabled: this.cfg.trade_enabled,
      trade_allow_servers: this.cfg.trade_allow_servers,
      trade_deny_servers: this.cfg.trade_deny_servers,
      realm_stats: this.cfg.realm_stats,
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
        if (
          this.lastError === 'auth_failed' &&
          this.cfg.auto_register &&
          this.cfg.enrollment_token
        ) {
          this.cfg.server_id = '';
          this.cfg.secret = '';
          this.ws?.close();
        }
        return;
      }
      this.authed = true;
      this.lastError = null;
      if (this.cfg.enrollment_token) {
        this.cfg.identity_verified = true;
        delete this.cfg.enrollment_token;
        this.saveConfig();
      }
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
      this.enqueueDelivery(message.message).catch((error) => {
        this.lastError = error.message;
        if (error.message === 'delivery_queue_full') {
          this.ws?.close(1013, 'delivery_queue_full');
        }
      });
      return;
    }

    if (['TRADE_OFFER', 'TRADE_CANCELLED', 'TRADE_SETTLE', 'TRADE_ROLLBACK', 'TRADE_COMPLETED'].includes(message.type)) {
      this.tradeHandler?.({ type: message.type, ...message });
      return;
    }

    if (['RAID_MEMBER_JOINED', 'RAID_MEMBER_LEFT', 'RAID_ACTION', 'RAID_CHAT', 'RAID_STATE', 'RAID_SETTLEMENT', 'RAID_CLOSED'].includes(message.type)) {
      this.raidHandler?.({ type: message.type, ...message });
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

  pub(text, sender = {}, images = []) {
    if (!this.authed || this.ws?.readyState !== this.WebSocket.OPEN) {
      return Promise.resolve({ ok: false, reason: 'disconnected' });
    }
    const requestId = crypto.randomUUID();
    const message = {
      type: 'PUB',
      request_id: requestId,
      ts: Date.now(),
      msg: String(text),
      images: normalizeImageUrls(images),
      sender_name: String(sender.name || '无名道友')
        .trim()
        .slice(0, 60),
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

  listRealms() {
    return this.request('REALM_LIST', 'REALM_LIST_RESULT');
  }

  createTrade(body) {
    return this.request('TRADE_CREATE', 'TRADE_CREATE_RESULT', body);
  }

  listTrades() {
    return this.request('TRADE_LIST', 'TRADE_LIST_RESULT');
  }

  getTrade(code) {
    return this.request('TRADE_GET', 'TRADE_GET_RESULT', { code });
  }

  cancelTrade(code) {
    return this.request('TRADE_CANCEL', 'TRADE_CANCEL_RESULT', { code });
  }

  acceptTrade(code, buyerTag, options = {}) {
    return this.request('TRADE_ACCEPT', 'TRADE_ACCEPT_RESULT', {
      code,
      buyer_tag: buyerTag,
      buyer_player_name: String(options.displayName || '').slice(0, 30),
      buyer_anonymous: options.anonymous === true,
    });
  }

  settleTrade(code, role, memberTag, ok, reason = '') {
    return this.request('TRADE_SETTLE_ACK', 'TRADE_SETTLE_ACK_RESULT', {
      code,
      role,
      member_tag: memberTag,
      ok: Boolean(ok),
      reason,
    });
  }

  openRaid(body) {
    return this.request('RAID_OPEN', 'RAID_OPEN_RESULT', body);
  }

  listRaids() {
    return this.request('RAID_LIST', 'RAID_LIST_RESULT');
  }

  getRaid(code) {
    return this.request('RAID_GET', 'RAID_GET_RESULT', { code });
  }

  joinRaid(code, avatar, memberTag) {
    return this.request('RAID_JOIN', 'RAID_JOIN_RESULT', {
      code,
      avatar,
      member_tag: memberTag,
    });
  }

  leaveRaid(code, memberTag) {
    return this.request('RAID_LEAVE', 'RAID_LEAVE_RESULT', {
      code,
      member_tag: memberTag,
    });
  }

  watchRaid(code, watcherTag, name) {
    return this.request('RAID_WATCH', 'RAID_WATCH_RESULT', {
      code,
      watcher_tag: watcherTag,
      name,
    });
  }

  unwatchRaid(code, watcherTag) {
    return this.request('RAID_UNWATCH', 'RAID_UNWATCH_RESULT', {
      code,
      watcher_tag: watcherTag,
    });
  }

  raidAction(code, memberTag, action, value) {
    return this.request('RAID_ACTION', 'RAID_ACTION_RESULT', {
      code,
      member_tag: memberTag,
      action,
      value,
    });
  }

  raidChat(code, memberTag, name, text) {
    return this.request('RAID_CHAT', 'RAID_CHAT_RESULT', {
      code,
      member_tag: memberTag,
      name,
      text,
    });
  }

  updateRaid(code, snapshot, status) {
    return this.request('RAID_UPDATE', 'RAID_UPDATE_RESULT', {
      code,
      snapshot,
      status,
    });
  }

  settleRaid(code, settlements, status = 'settled') {
    return this.request('RAID_SETTLE', 'RAID_SETTLE_RESULT', {
      code,
      settlements,
      status,
    });
  }

  closeRaid(code, status = 'closed') {
    return this.request('RAID_CLOSE', 'RAID_CLOSE_RESULT', { code, status });
  }

  enqueueDelivery(message) {
    if (
      !message?.id ||
      !Number.isSafeInteger(message.seq) ||
      this.seenMessageIds.has(message.id)
    ) {
      return Promise.resolve();
    }
    const pending = this.pendingDeliveries.get(message.id);
    if (pending) return pending;
    if (this.pendingDeliveries.size >= this.deliveryQueueLimit) {
      return Promise.reject(new Error('delivery_queue_full'));
    }

    let resolveDelivery;
    let rejectDelivery;
    const delivery = new Promise((resolve, reject) => {
      resolveDelivery = resolve;
      rejectDelivery = reject;
    });
    this.pendingDeliveries.set(message.id, delivery);
    this.deliveryQueue.push({
      message,
      resolve: resolveDelivery,
      reject: rejectDelivery,
    });
    this.processDeliveryQueue();
    return delivery;
  }

  processDeliveryQueue() {
    if (this.deliveryProcessing) return;
    this.deliveryProcessing = true;
    void (async () => {
      while (this.deliveryQueue.length) {
        const delivery = this.deliveryQueue.shift();
        const { message } = delivery;
        try {
          await this.deliverWithRetry(message);
          delivery.resolve();
        } catch (error) {
          await this.finalizeFailedDelivery(message, error);
          delivery.reject(error);
        } finally {
          this.pendingDeliveries.delete(message.id);
        }
      }
    })().finally(() => {
      this.deliveryProcessing = false;
      if (this.deliveryQueue.length) this.processDeliveryQueue();
    });
  }

  async deliverWithRetry(message) {
    let delay = this.deliveryRetryBaseMs;
    for (let attempt = 1; attempt <= this.deliveryMaxAttempts; attempt += 1) {
      if (!this.cfg.enable) throw new Error('delivery_disabled');
      try {
        await this.deliver(message);
        if (this.lastError?.startsWith('delivery_failed:')) {
          this.lastError = null;
        }
        return;
      } catch (error) {
        this.lastError = `delivery_failed:${error.message}`;
        if (!this.cfg.enable || attempt >= this.deliveryMaxAttempts) {
          throw error;
        }
        await this.waitForDeliveryRetry(delay);
        delay = Math.min(this.deliveryRetryMaxMs, delay * 2);
      }
    }
  }

  waitForDeliveryRetry(delay) {
    return new Promise((resolve) => {
      const finish = () => {
        if (this.deliveryRetryWait?.timer === timer) {
          this.deliveryRetryWait = null;
        }
        resolve();
      };
      const timer = setTimeout(finish, delay);
      timer.unref?.();
      this.deliveryRetryWait = { timer, finish };
    });
  }

  cancelDeliveryRetry() {
    const wait = this.deliveryRetryWait;
    if (!wait) return;
    clearTimeout(wait.timer);
    this.deliveryRetryWait = null;
    wait.finish();
  }

  clearDeliveryQueue(reason = 'delivery_queue_cleared') {
    const error = reason instanceof Error ? reason : new Error(reason);
    for (const delivery of this.deliveryQueue.splice(0)) {
      this.pendingDeliveries.delete(delivery.message.id);
      delivery.reject(error);
    }
  }

  async finalizeFailedDelivery(message, error) {
    try {
      await this.deliveryFailureHandler?.(message, error);
    } catch (handlerError) {
      globalThis.logger?.warn?.(
        `[worldchat] 投递失败清理异常: ${handlerError.message}`
      );
    }
    if (error?.message === 'delivery_disabled') return;
    try {
      this.rememberDeliveredMessage(message);
    } catch (stateError) {
      globalThis.logger?.warn?.(
        `[worldchat] 投递失败状态保存异常: ${stateError.message}`
      );
    }
  }

  rememberDeliveredMessage(message) {
    if (!message?.id || !Number.isSafeInteger(message.seq)) return;
    this.seenMessageIds.add(message.id);
    if (this.seenMessageIds.size > 2000) {
      this.seenMessageIds.delete(this.seenMessageIds.values().next().value);
    }
    if (message.seq > this.cfg.last_seen_seq) {
      this.cfg.last_seen_seq = message.seq;
      this.saveConfig();
    }
  }

  async deliver(message) {
    if (
      !message?.id ||
      !Number.isSafeInteger(message.seq) ||
      this.seenMessageIds.has(message.id)
    )
      return;
    if (this.messageHandler) await this.messageHandler(message);
    this.rememberDeliveredMessage(message);
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
          try {
            await this.enqueueDelivery(message);
          } catch (error) {
            if (
              error?.message === 'delivery_queue_full' ||
              error?.message === 'delivery_disabled'
            ) {
              throw error;
            }
          }
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
      auto_register: this.cfg.auto_register,
      registered: this.hasIdentity(),
      expose_group: this.cfg.expose_group,
      joined_groups: this.groups(),
      last_seen_seq: this.cfg.last_seen_seq,
      last_error: this.lastError,
      trade_enabled: this.cfg.trade_enabled,
      trade_allow_servers: [...this.cfg.trade_allow_servers],
      trade_deny_servers: [...this.cfg.trade_deny_servers],
      realm_stats: { ...this.cfg.realm_stats },
    };
  }

  setTradeEnabled(value) {
    this.cfg.trade_enabled = Boolean(value);
    this.saveConfig();
    this.syncPresence();
  }

  setTradeAllowServers(value) {
    this.cfg.trade_allow_servers = [
      ...new Set(
        (Array.isArray(value) ? value : [])
          .map(String)
          .filter((id) => id === '*' || /^[A-Za-z0-9_-]{3,64}$/.test(id))
      ),
    ].slice(0, 200);
    this.saveConfig();
    this.syncPresence();
  }

  setTradeDenyServers(value) {
    this.cfg.trade_deny_servers = [
      ...new Set(
        (Array.isArray(value) ? value : [])
          .map(String)
          .filter((id) => /^[A-Za-z0-9_-]{3,64}$/.test(id))
      ),
    ].slice(0, 200);
    this.saveConfig();
    this.syncPresence();
  }

  setRealmStats(value) {
    this.cfg.realm_stats = {
      players: Math.max(0, Math.trunc(Number(value?.players) || 0)),
      max_mijing: Math.max(0, Math.trunc(Number(value?.max_mijing) || 0)),
      max_xiangu: Math.max(0, Math.trunc(Number(value?.max_xiangu) || 0)),
      max_huafen: Math.max(0, Math.trunc(Number(value?.max_huafen) || 0)),
    };
    this.saveConfig();
    this.syncPresence();
  }

  setEnable(value) {
    this.cfg.enable = Boolean(value);
    this.saveConfig();
    if (!this.cfg.enable) {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.cancelDeliveryRetry();
      this.clearDeliveryQueue('delivery_disabled');
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
    this.cancelDeliveryRetry();
    this.clearDeliveryQueue('closed');
    this.ws?.terminate?.();
    this.ws = null;
    this.connected = false;
    this.authed = false;
  }
}

export const worldChatClient = new WorldChatClient();
