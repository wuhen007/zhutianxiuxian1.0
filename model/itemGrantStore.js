/**
 * 道具发单/领取的账本（纯逻辑，不碰游戏存档，可直接跑 node --test）
 *
 * 机制：群主发单只生成待领单，玩家本人 `#领取` 时才真正入账。
 * 这样"谁发的、谁领的、隔了多久"全部留痕，卖单和代领都会留下痕迹。
 *
 * 存储：data_path/item_grant.json，整体原子写（tmp + rename）。
 * 哈希链：每条事件 sha256(上一条 hash + 本条内容)，用于事后核账。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** 每个群主每周可发单数 */
export const WEEKLY_QUOTA = 10;
/** 全服每日发放件数上限（熔断，防内鬼批量发） */
export const DAILY_POOL = 30;
/** 单子有效期（天） */
export const TTL_DAYS = 7;
/** 单次最多几件 */
export const MAX_QTY = 3;

const DAY = 86400;
const WEEK = 7 * DAY;

function dayStart(ts) {
  const d = new Date(ts);
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000);
}

/** 周一为一周起点 */
function weekStart(ts) {
  const d = new Date(ts);
  const offset = (d.getDay() + 6) % 7;
  return dayStart(ts) - offset * DAY;
}

function sha(prev, payload) {
  return crypto.createHash('sha256').update(prev + JSON.stringify(payload)).digest('hex');
}

export class GrantStore {
  constructor(file, opts = {}) {
    this.file = file;
    this.weeklyQuota = opts.weeklyQuota ?? WEEKLY_QUOTA;
    this.dailyPool = opts.dailyPool ?? DAILY_POOL;
    this.ttlDays = opts.ttlDays ?? TTL_DAYS;
    this.maxQty = opts.maxQty ?? MAX_QTY;
    this.state = null;
    this._chain = Promise.resolve();
  }

  // ---------- 存储 ----------

  _load() {
    if (this.state) return this.state;
    let raw = {};
    try {
      raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      raw = {};
    }
    this.state = {
      orders: raw.orders || {},
      events: raw.events || [],
      reports: raw.reports || [],
      tips: raw.tips || {},
    };
    return this.state;
  }

  _save() {
    const s = this._load();
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
    fs.renameSync(tmp, this.file);
  }

  /** 串行化：Yunzai 单线程，但 await 之间可能插入别的消息，这里排队 */
  _lock(fn) {
    const run = this._chain.then(fn, fn);
    this._chain = run.then(
      () => {},
      () => {}
    );
    return run;
  }

  // ---------- 发单 ----------

  /**
   * @param {{groupId:string,grantedBy:string,role:string,targetQQ:string,
   *          itemName:string,itemClass:string,itemPinji:number,qty:number,reason:string}} o
   */
  order(o) {
    return this._lock(() => {
      const s = this._load();
      const now = Math.floor(Date.now() / 1000);
      const qty = Math.min(Math.max(Number(o.qty) || 1, 1), this.maxQty);

      if (String(o.targetQQ) === String(o.grantedBy)) {
        return { ok: false, msg: '不能给自己发单。' };
      }

      const used = Object.values(s.orders).filter(
        x =>
          x.grantedBy === String(o.grantedBy) &&
          x.status !== 'revoked' &&
          x.createdAt >= weekStart(now)
      ).length;
      if (used >= this.weeklyQuota) {
        return { ok: false, msg: `本周发单额度已用完（${used}/${this.weeklyQuota}）。` };
      }

      const dup = Object.values(s.orders).find(
        x => x.targetQQ === String(o.targetQQ) && x.itemName === o.itemName && x.status === 'pending'
      );
      if (dup) {
        return { ok: false, msg: `对方还有一张「${o.itemName}」待领单（${dup.id}），等他领完再发。` };
      }

      const id = 'N-' + crypto.randomBytes(3).toString('hex').toUpperCase();
      const order = {
        id,
        groupId: String(o.groupId || ''),
        grantedBy: String(o.grantedBy),
        role: o.role || 'member',
        targetQQ: String(o.targetQQ),
        itemName: o.itemName,
        itemClass: o.itemClass,
        itemPinji: o.itemPinji ?? 0,
        qty,
        reason: String(o.reason || '未填写').slice(0, 60),
        status: 'pending',
        createdAt: now,
        expireAt: now + this.ttlDays * DAY,
        claimedAt: 0,
        latency: 0,
        revokedBy: '',
      };
      s.orders[id] = order;
      this._save();
      return { ok: true, order };
    });
  }

  pendingOf(qq) {
    const s = this._load();
    this._expire(s, Math.floor(Date.now() / 1000));
    return Object.values(s.orders)
      .filter(x => x.targetQQ === String(qq) && x.status === 'pending')
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  revoke(id, by, role) {
    return this._lock(() => {
      const s = this._load();
      const o = s.orders[id];
      if (!o) return { ok: false, msg: '单号不存在。' };
      if (o.status !== 'pending') return { ok: false, msg: `这张单已经是 ${o.status}，不能撤。` };
      const isAdmin = role === 'owner' || role === 'admin' || role === 'master';
      if (o.grantedBy !== String(by) && !isAdmin) return { ok: false, msg: '只能撤自己发的单。' };
      o.status = 'revoked';
      o.revokedBy = String(by);
      this._save();
      return { ok: true, msg: `已撤销 ${id}，额度已退回。` };
    });
  }

  // ---------- 领取 ----------

  /**
   * @param {string} qq
   * @param {(order:object, mint:string) => Promise<{ok:boolean,msg?:string}>} deliver
   */
  claim(qq, deliver) {
    return this._lock(async () => {
      const s = this._load();
      const now = Math.floor(Date.now() / 1000);
      this._expire(s, now);

      const list = Object.values(s.orders)
        .filter(x => x.targetQQ === String(qq) && x.status === 'pending')
        .sort((a, b) => a.createdAt - b.createdAt);
      if (!list.length) return { ok: false, msg: '当前没有待领取的道具。' };

      const out = [];
      let first = false;
      for (const o of list) {
        if (this._todayTotal(s, o.itemName) + o.qty > this.dailyPool) {
          out.push({ name: o.itemName, qty: o.qty, err: '今日该道具全服发放已达上限，明天再来。' });
          continue;
        }
        const tag = (o.groupId || '0').slice(-4).toUpperCase();
        const mint = `${tag}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        let r;
        try {
          r = await deliver(o, mint);
        } catch (err) {
          r = { ok: false, msg: `发放失败：${err.message}` };
        }
        if (!r.ok) {
          out.push({ name: o.itemName, qty: o.qty, err: r.msg });
          continue;
        }
        o.status = 'claimed';
        o.claimedAt = now;
        o.latency = now - o.createdAt;
        this._log(s, {
          orderId: o.id,
          itemName: o.itemName,
          qty: o.qty,
          mint,
          actor: 'player',
          grantedBy: o.grantedBy,
          claimedBy: o.targetQQ,
          groupId: o.groupId,
          action: 'grant',
        });
        if (!s.tips[o.targetQQ]) {
          s.tips[o.targetQQ] = 1;
          first = true;
        }
        out.push({ name: o.itemName, qty: o.qty, mint });
      }
      this._save();
      return { ok: true, list: out, first };
    });
  }

  // ---------- 举报 ----------

  report(qq, text) {
    return this._lock(() => {
      const s = this._load();
      const id = 'A-' + crypto.randomBytes(2).toString('hex').toUpperCase();
      s.reports.push({ id, qq: String(qq), text: String(text).slice(0, 500), ts: Math.floor(Date.now() / 1000), status: 'open' });
      this._save();
      return id;
    });
  }

  // ---------- 审计 ----------

  /** 群主侧对账：某群主发过的单 */
  issuedBy(qq, limit = 20) {
    const s = this._load();
    return Object.values(s.orders)
      .filter(x => x.grantedBy === String(qq))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  verifyChain() {
    const s = this._load();
    let prev = 'GENESIS';
    for (const ev of s.events) {
      const payload = {
        seq: ev.seq,
        ts: ev.ts,
        orderId: ev.orderId,
        itemName: ev.itemName,
        qty: ev.qty,
        mint: ev.mint,
        actor: ev.actor,
        grantedBy: ev.grantedBy,
        claimedBy: ev.claimedBy,
        groupId: ev.groupId,
        action: ev.action,
      };
      if (ev.prevHash !== prev || ev.hash !== sha(prev, payload)) return false;
      prev = ev.hash;
    }
    return true;
  }

  _todayTotal(s, itemName) {
    const from = dayStart(Math.floor(Date.now() / 1000));
    return s.events
      .filter(e => e.action === 'grant' && e.itemName === itemName && e.ts >= from)
      .reduce((n, e) => n + Number(e.qty || 0), 0);
  }

  _log(s, e) {
    const ts = Math.floor(Date.now() / 1000);
    const seq = s.events.length + 1;
    const prev = s.events.length ? s.events[s.events.length - 1].hash : 'GENESIS';
    const payload = {
      seq,
      ts,
      orderId: e.orderId,
      itemName: e.itemName,
      qty: e.qty,
      mint: e.mint,
      actor: e.actor,
      grantedBy: e.grantedBy,
      claimedBy: e.claimedBy,
      groupId: e.groupId,
      action: e.action,
    };
    s.events.push({ ...payload, prevHash: prev, hash: sha(prev, payload) });
  }

  _expire(s, now) {
    let changed = false;
    for (const o of Object.values(s.orders)) {
      if (o.status === 'pending' && o.expireAt <= now) {
        o.status = 'expired';
        changed = true;
      }
    }
    if (changed) this._save();
    return changed;
  }
}
