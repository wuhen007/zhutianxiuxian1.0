// 世界频道 · 云端中转客户端(留言板/拉取模型)
// 单例:整个 Yunzai 进程只维持一条到云端的总连接(对应一个"区服")。
// 依赖 ws(随 Yunzai 安装,无需额外安装)。
import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    cfg = {};
  }
  cfg.enable = cfg.enable !== false;
  cfg.url = cfg.url || 'ws://127.0.0.1:8080';
  cfg.secret = cfg.secret || 'zhutian-worldchat-dev-secret-change-me';
  cfg.query_default = Number(cfg.query_default) || 10;
  // 群号公开级别: false(不公开) | 'admin'(仅其他服管理员可见) | 'public'(对全员公开)
  // 默认不公开,需管理员显式两步确认开启。
  cfg.expose_group = cfg.expose_group || false;
  // 稳定的区服标识:首次运行自动生成并持久化到 config.json
  if (!cfg.server_id) {
    cfg.server_id = 'sv_' + crypto.randomBytes(6).toString('hex');
  }
  cfg.name = cfg.name || '区服-' + cfg.server_id.slice(3, 9);
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  } catch {
    /* 只读环境忽略 */
  }
  return cfg;
}

class WorldChatClient {
  constructor() {
    this.cfg = loadConfig();
    this.ws = null;
    this.connected = false;
    this.authed = false;
    this.reconnectDelay = 1000;
    this.maxDelay = 60000;
    this.pingTimer = null;
    this._reconnectTimer = null;
    this._queryCb = null; // 仅支持一个挂起的查询(本场景足够)
  }

  hmac(payload) {
    return crypto.createHmac('sha256', this.cfg.secret).update(payload).digest('hex');
  }

  connect() {
    if (!this.cfg.enable) return;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    let ws;
    try {
      ws = new WebSocket(this.cfg.url);
    } catch {
      this._scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.on('open', () => {
      this.connected = true;
      ws.send(
        JSON.stringify({
          type: 'HELLO',
          server_id: this.cfg.server_id,
          name: this.cfg.name,
          joined: true,
          token: this.hmac(String(this.cfg.server_id)),
          // 群号公开:仅当 expose_group 开启才上报本服群号
          groups: this.cfg.expose_group ? this.groups() : [],
          expose_level: this.cfg.expose_group || undefined
        })
      );
    });

    ws.on('message', (raw) => this._onMessage(raw));

    ws.on('close', () => {
      this.connected = false;
      this.authed = false;
      this._stopPing();
      this._scheduleReconnect();
    });

    ws.on('error', () => {
      /* error 后通常会触发 close */
    });
  }

  _onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === 'WELCOME' && msg.ok) {
      this.authed = true;
      this.reconnectDelay = 1000;
      this._startPing();
    } else if (msg.type === 'QUERY_RESULT' && this._queryCb) {
      const cb = this._queryCb;
      this._queryCb = null;
      cb(msg);
    }
  }

  _startPing() {
    this._stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'PING' }));
      }
    }, 30000);
  }

  _stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.maxDelay, this.reconnectDelay * 2);
  }

  // 上送一条留言,返回 { ok, reason? }
  pub(text) {
    return new Promise((resolve) => {
      if (!this.authed || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        resolve({ ok: false, reason: 'disconnected' });
        return;
      }
      const ts = Date.now();
      const sig = this.hmac(`${this.cfg.server_id}:${ts}:${text}`);
      let settled = false;
      const handler = (raw) => {
        if (settled) return;
        let m;
        try {
          m = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (m.type === 'PUB_ACK') {
          settled = true;
          clearTimeout(guard);
          this.ws.off('message', handler);
          resolve(m);
        }
      };
      const guard = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (this.ws) this.ws.off('message', handler);
        resolve({ ok: false, reason: 'timeout' });
      }, 5000);
      this.ws.on('message', handler);
      this.ws.send(JSON.stringify({ type: 'PUB', ts, msg: text, sig }));
    });
  }

  // 拉取最近 limit 条,返回 { ok, messages?, total?, reason? }
  query(limit) {
    return new Promise((resolve) => {
      if (!this.authed || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        resolve({ ok: false, reason: 'disconnected' });
        return;
      }
      this._queryCb = (m) => resolve({ ok: true, messages: m.messages, total: m.total });
      const guard = setTimeout(() => {
        this._queryCb = null;
        resolve({ ok: false, reason: 'timeout' });
      }, 5000);
      // 让 guard 在回调中清除
      const prev = this._queryCb;
      this._queryCb = (m) => {
        clearTimeout(guard);
        prev(m);
      };
      this.ws.send(JSON.stringify({ type: 'QUERY', limit: limit || this.cfg.query_default }));
    });
  }

  // 记录本实例服务的 QQ 群号(仅本地使用,绝不向云端上报)
  observeGroup(groupId) {
    if (!groupId) return;
    if (!this._groups) this._groups = new Set();
    this._groups.add(String(groupId));
  }

  groups() {
    return this._groups ? [...this._groups] : [];
  }

  // 修改本服昵称(会持久化并重新握手,使云端刷新展示名)
  setName(name) {
    name = String(name || '').trim().slice(0, 30);
    if (!name) return false;
    this.cfg.name = name;
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.cfg, null, 2));
    } catch {
      /* 只读环境忽略 */
    }
    // 重连以便云端刷新昵称
    try {
      if (this.ws) this.ws.close();
    } catch {
      /* ignore */
    }
    return true;
  }

  // 修改群号公开级别(false | 'admin' | 'public'),持久化并重新握手使云端刷新
  setExpose(level) {
    if (level !== false && level !== 'admin' && level !== 'public') return false;
    this.cfg.expose_group = level;
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.cfg, null, 2));
    } catch {
      /* 只读环境忽略 */
    }
    try {
      if (this.ws) this.ws.close();
    } catch {
      /* ignore */
    }
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
      expose_group: this.cfg.expose_group
    };
  }

  setEnable(v) {
    this.cfg.enable = !!v;
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.cfg, null, 2));
    } catch {
      /* ignore */
    }
    if (!this.cfg.enable) {
      try {
        if (this.ws) this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
      this.connected = false;
      this.authed = false;
      this._stopPing();
    } else {
      this.connect();
    }
  }
}

export const worldChatClient = new WorldChatClient();
export { WorldChatClient };
