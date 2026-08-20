import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomically } from '../utils/atomicJson.js';
import { compareAndSetRedisJson } from '../utils/redisJsonCas.js';

export const FORBIDDEN_EVENT_REDIS_KEY = 'xiuxian:global:forbidden-events';
export const FORBIDDEN_EVENT_STATE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'resources',
  'data',
  'forbidden_event_state.json',
);

export const FORBIDDEN_CLEANSING_REAL_TTL_MS = 24 * 60 * 60 * 1000;
export const DAO_SIGHTING_REAL_TTL_MS = 30 * 60 * 1000;
export const DAO_SIGHTING_WORLD_YEARS = 1000;
export const DAO_SIGHTING_CLAIM_CHANCE = 0.005;

const PURSUERS = Object.freeze([
  { name: '多元古尊·葬世者', title: '纪元主宰', threat: 1.35, law: '熄灭文明薪火' },
  { name: '无上道君·校正天', title: '无上强者', threat: 1.55, law: '截断违禁因果' },
  { name: '道天·无名', title: '超维强者', threat: 1.85, law: '抹除至宝真名' },
]);

const DAO_SIGHTINGS = Object.freeze([
  { name: '岁月天碑', title: '时间大道显化' },
  { name: '万因天书', title: '因果大道显化' },
  { name: '众生圣炉', title: '众生大道显化' },
  { name: '归墟道轮', title: '终末大道显化' },
  { name: '无界道门', title: '空间大道显化' },
]);

function defaultState() {
  return {
    version: 1,
    active: {
      cleansing: null,
      daoSighting: null,
    },
    history: [],
    lastAutoSpawnAt: 0,
  };
}

export function normalizeForbiddenEventState(value) {
  const state = value && typeof value === 'object' ? value : {};
  return {
    ...defaultState(),
    ...state,
    version: 1,
    active: {
      ...defaultState().active,
      ...(state.active || {}),
    },
    history: Array.isArray(state.history) ? state.history.slice(-100) : [],
  };
}

export function readForbiddenEventState() {
  try {
    if (!fs.existsSync(FORBIDDEN_EVENT_STATE_FILE)) return defaultState();
    return normalizeForbiddenEventState(JSON.parse(fs.readFileSync(FORBIDDEN_EVENT_STATE_FILE, 'utf8')));
  } catch (error) {
    console.error('[违禁品事件] 读取状态失败:', error.message);
    return defaultState();
  }
}

export function writeForbiddenEventState(state) {
  writeJsonAtomically(FORBIDDEN_EVENT_STATE_FILE, normalizeForbiddenEventState(state));
}

function getRedis() {
  const client = globalThis.redis;
  return client && typeof client.get === 'function' && typeof client.set === 'function'
    ? client
    : null;
}

/** Redis 作为跨服共享源，本地文件作为单服与启动时的回退源。 */
export async function readSharedForbiddenEventState() {
  const client = getRedis();
  if (client) {
    try {
      const raw = await client.get(FORBIDDEN_EVENT_REDIS_KEY);
      if (raw) return normalizeForbiddenEventState(JSON.parse(raw));
    } catch (error) {
      console.error('[违禁品事件] Redis读取失败，使用本地状态:', error.message);
    }
  }
  return readForbiddenEventState();
}

export async function writeSharedForbiddenEventState(state) {
  const normalized = normalizeForbiddenEventState(state);
  writeForbiddenEventState(normalized);
  const client = getRedis();
  if (client) {
    try {
      await client.set(FORBIDDEN_EVENT_REDIS_KEY, JSON.stringify(normalized));
    } catch (error) {
      console.error('[违禁品事件] Redis写入失败，已保留本地状态:', error.message);
    }
  }
  return normalized;
}

/**
 * 跨服大道至宝认主占位：Redis 可用时用 CAS 抢占唯一显化名额。
 * 这一步只登记尝试与认主结果，玩家物品发放由调用方随后完成。
 */
export async function reserveDaoSightingAttempt(
  eventId,
  ownerId,
  ownerName,
  random = Math.random,
) {
  const client = getRedis();
  const apply = state => {
    const event = state.active?.daoSighting;
    if (!event || event.id !== eventId || event.status !== 'active') {
      return { ok: false, reason: 'expired' };
    }
    event.seekers ||= {};
    if (event.seekers[String(ownerId)]) return { ok: false, reason: 'already-tried' };
    event.seekers[String(ownerId)] = { name: ownerName || String(ownerId), at: Date.now() };
    const claimed = Number(random()) < DAO_SIGHTING_CLAIM_CHANCE;
    if (claimed) {
      event.claimant = { qq: String(ownerId), name: ownerName || String(ownerId), at: Date.now() };
      event.status = 'claimed';
      state.active.daoSighting = null;
      state.history.push({ type: 'dao-sighting-claimed', eventId, ownerId: String(ownerId), at: Date.now() });
      state.history = state.history.slice(-100);
    }
    return { ok: true, claimed, state };
  };

  if (client && typeof client.eval === 'function') {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      let raw = await client.get(FORBIDDEN_EVENT_REDIS_KEY);
      if (!raw) {
        const local = normalizeForbiddenEventState(readForbiddenEventState());
        await client.set(FORBIDDEN_EVENT_REDIS_KEY, JSON.stringify(local), { NX: true });
        raw = await client.get(FORBIDDEN_EVENT_REDIS_KEY);
      }
      if (!raw) return { ok: false, reason: 'missing' };
      const state = normalizeForbiddenEventState(JSON.parse(raw));
      const result = apply(state);
      if (!result.ok) return result;
      const next = normalizeForbiddenEventState(result.state);
      if (await compareAndSetRedisJson(client, FORBIDDEN_EVENT_REDIS_KEY, raw, next)) {
        writeForbiddenEventState(next);
        return { ok: true, claimed: result.claimed };
      }
    }
    return { ok: false, reason: 'busy' };
  }

  const state = readForbiddenEventState();
  const result = apply(state);
  if (!result.ok) return result;
  await writeSharedForbiddenEventState(state);
  return { ok: true, claimed: result.claimed };
}

function eventId(prefix) {
  return `${prefix}-${Date.now()}-${Math.trunc(Math.random() * 1_000_000)}`;
}

export function createForbiddenCleansingEvent({
  treasureName,
  ownerId,
  ownerName = '无名持宝者',
  plane = '',
  coordinate = null,
  worldYear = 0,
  now = Date.now(),
  pursuer = null,
} = {}) {
  if (!treasureName || !ownerId) throw new Error('违禁品清算目标不完整');
  const selected = pursuer || PURSUERS[Math.floor(Math.random() * PURSUERS.length)];
  return {
    id: eventId('cleansing'),
    type: 'forbidden-cleansing',
    status: 'active',
    phase: '截杀降临',
    createdAt: now,
    expiresAt: now + FORBIDDEN_CLEANSING_REAL_TTL_MS,
    createdWorldYear: Number(worldYear) || 0,
    target: {
      treasureName,
      ownerId: String(ownerId),
      ownerName,
      plane,
      coordinate,
    },
    pursuer: { ...selected },
    participants: {},
    outcome: null,
  };
}

export function createDaoSightingEvent({
  location,
  worldYear = 0,
  now = Date.now(),
  treasure = null,
} = {}) {
  const selected = treasure || DAO_SIGHTINGS[Math.floor(Math.random() * DAO_SIGHTINGS.length)];
  if (!location?.plane || !location?.coordinate) throw new Error('大道至宝惊鸿坐标不完整');
  return {
    id: eventId('dao-sighting'),
    type: 'dao-treasure-sighting',
    status: 'active',
    createdAt: now,
    expiresAt: now + DAO_SIGHTING_REAL_TTL_MS,
    createdWorldYear: Number(worldYear) || 0,
    expiresWorldYear: (Number(worldYear) || 0) + DAO_SIGHTING_WORLD_YEARS,
    treasure: { ...selected },
    location: {
      plane: location.plane,
      name: location.location || '未知古地',
      coordinate: { ...location.coordinate },
    },
    seekers: {},
    claimant: null,
  };
}

export function getEventRemaining(event, worldYear = null, now = Date.now()) {
  if (!event) return { active: false, realMs: 0, worldYears: 0 };
  const realMs = Math.max(0, Number(event.expiresAt) - now);
  const worldYears = event.expiresWorldYear == null || worldYear == null
    ? null
    : Math.max(0, Number(event.expiresWorldYear) - Number(worldYear));
  return {
    active: event.status === 'active' && realMs > 0 && (worldYears == null || worldYears > 0),
    realMs,
    worldYears,
  };
}

export function resolveCleansingOutcome(random = Math.random) {
  const roll = Math.min(1 - Number.EPSILON, Math.max(0, Number(random()) || 0));
  if (roll < 0.5) return 'sealed';
  if (roll < 0.75) return 'fled';
  if (roll < 0.95) return 'shattered';
  return 'vanished';
}

export function getPursuerCatalog() {
  return PURSUERS.map(item => ({ ...item }));
}

export function getDaoSightingCatalog() {
  return DAO_SIGHTINGS.map(item => ({ ...item }));
}

export function formatRemainingMinutes(ms) {
  const minutes = Math.max(0, Math.ceil(Number(ms) / 60_000));
  if (minutes >= 60) return `${Math.floor(minutes / 60)}小时${minutes % 60}分`;
  return `${minutes}分钟`;
}
