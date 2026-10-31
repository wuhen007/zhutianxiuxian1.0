/**
 * 官方群内身份（openid）↔ 修仙旧 QQ 号 的绑定表
 *
 * 为什么需要它：
 *   官方 Bot 的事件里只有 member_openid，没有 QQ 号；而修仙的存档主键是 QQ 号
 *   （resources/data/xiuxian_player/{QQ}.json，146 个字段都按这个 key 存）。
 *   这张表就是两者之间的桥，玩家自报一次、校验一次，之后就能按 QQ 号继承存档。
 *
 * 数据文件：resources/data/identity_map.json
 *   {
 *     "version": 1,
 *     "byOpenid": { "<openid>": { qq, name, groupId, at, updatedAt } },
 *     "byQQ":     { "<qq>": "<openid>" }
 *   }
 *
 * 一致性问题：byQQ 一律由 byOpenid 反推重建，避免两份数据对不上。
 */
import fs from 'node:fs';
import path from 'node:path';
import { __PATH } from './xiuxian.js';

const FILE = path.join(__PATH.data_path, 'identity_map.json');
const QQ_RE = /^\d{5,12}$/;

const emptyMap = () => ({ version: 1, byOpenid: {}, byQQ: {} });

/** 读文件并顺手修掉脏数据：qq 不合法的条目直接丢弃 */
function normalize(raw) {
  const out = emptyMap();
  if (!raw || typeof raw !== 'object') return out;
  for (const [openid, item] of Object.entries(raw.byOpenid || {})) {
    const key = String(openid || '').trim();
    const qq = String(item?.qq || '').trim();
    if (!key || !QQ_RE.test(qq)) continue;
    out.byOpenid[key] = {
      qq,
      name: String(item?.name || ''),
      groupId: String(item?.groupId || ''),
      at: String(item?.at || ''),
      updatedAt: String(item?.updatedAt || ''),
    };
    out.byQQ[qq] = key;
  }
  return out;
}

export function readMap() {
  try {
    return normalize(JSON.parse(fs.readFileSync(FILE, 'utf8')));
  } catch {
    return emptyMap();
  }
}

function writeMap(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  // 先写临时文件再改名：避免进程被杀时留下半截 JSON
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, FILE);
}

/** 按群内身份查绑定 */
export function getBinding(openid) {
  const key = String(openid || '').trim();
  if (!key) return null;
  return readMap().byOpenid[key] || null;
}

/** 按 QQ 号查已绑定的群内身份 */
export function getOpenidByQQ(qq) {
  const key = String(qq || '').trim();
  if (!key) return '';
  return readMap().byQQ[key] || '';
}

/**
 * 建立绑定。
 * 两条硬约束：一个 openid 只能绑一个 QQ；一个 QQ 只能被一个 openid 绑（防冒领）。
 */
export function bindAccount(openid, qq, extra = {}) {
  const oid = String(openid || '').trim();
  const target = String(qq || '').trim();
  if (!oid) return { ok: false, error: '缺少群内身份（openid）' };
  if (!QQ_RE.test(target)) return { ok: false, error: 'QQ 号格式不对' };

  const data = readMap();
  const holder = data.byQQ[target];
  if (holder && holder !== oid) {
    return { ok: false, error: 'QQ 已被其它群内身份绑定', holder };
  }

  const mine = data.byOpenid[oid];
  if (mine && mine.qq !== target) {
    return { ok: false, error: '你已绑定另一个 QQ', current: mine.qq };
  }

  const now = new Date().toISOString();
  data.byOpenid[oid] = {
    qq: target,
    name: String(extra.name || ''),
    groupId: String(extra.groupId || ''),
    at: mine?.at || now,
    updatedAt: now,
  };
  data.byQQ[target] = oid;
  writeMap(data);
  return { ok: true, qq: target };
}

/** 解绑：按群内身份 */
export function unbindByOpenid(openid) {
  const oid = String(openid || '').trim();
  const data = readMap();
  const mine = data.byOpenid[oid];
  if (!mine) return { ok: false, error: '没有绑定记录' };
  delete data.byOpenid[oid];
  delete data.byQQ[mine.qq];
  writeMap(data);
  return { ok: true, qq: mine.qq };
}

/** 解绑：按 QQ 号（主人用） */
export function unbindByQQ(qq) {
  const target = String(qq || '').trim();
  const data = readMap();
  const oid = data.byQQ[target];
  if (!oid) return { ok: false, error: '这个 QQ 号没有绑定记录' };
  delete data.byQQ[target];
  delete data.byOpenid[oid];
  writeMap(data);
  return { ok: true, openid: oid };
}

/** 已绑定人数（展示用） */
export function countBindings() {
  return Object.keys(readMap().byQQ).length;
}
