import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeJsonAtomically } from '../utils/atomicJson.js';
import { compareAndDeleteRedisJson, compareAndExpireRedisKey } from '../utils/redisJsonCas.js';

export const STONE_JAR_OPPORTUNITY = '石罐本体';
export const FLOWER_ANCESTOR_SEED_OPPORTUNITY = '花粉路祖种';
export const STONE_JAR_CLUE_REQUIREMENT = 9;

const STATE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'resources',
  'data',
  'shengxu_unique_opportunity.json'
);
const NAJIE_DIR = path.join(path.dirname(STATE_FILE), 'xiuxian_najie');
const LOCK_TTL_SECONDS = 60;
const LOCK_TTL_MS = LOCK_TTL_SECONDS * 1000;
const LOCK_RENEW_INTERVAL_MS = Math.floor(LOCK_TTL_MS / 3);
const SETTLEMENT_RESULT_TTL_SECONDS = 7 * 24 * 60 * 60;
const STATE_LOCK_SCOPE = '__state_file__';

function readState(stateFile = STATE_FILE, fileSystem = fs, strict = false) {
  try {
    if (!fileSystem.existsSync(stateFile)) return defaultShengxuOpportunityState();
    const parsed = JSON.parse(fileSystem.readFileSync(stateFile, 'utf8'));
    const opportunities = parsed?.opportunities;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || (opportunities !== undefined && (!opportunities || typeof opportunities !== 'object' || Array.isArray(opportunities)))
      || Object.values(opportunities || {}).some(entry => (
        !entry || typeof entry !== 'object' || Array.isArray(entry) || !String(entry.ownerId || '')
      ))) {
      throw new TypeError('圣墟唯一机缘状态结构异常');
    }
    return { ...defaultShengxuOpportunityState(), ...parsed };
  } catch (error) {
    console.error('[圣墟唯一机缘] 读取状态失败:', error.message);
    if (strict) {
      const stateError = new Error('圣墟唯一机缘状态损坏');
      stateError.code = 'SHENGXU_OPPORTUNITY_STATE_CORRUPT';
      stateError.cause = error;
      throw stateError;
    }
    return defaultShengxuOpportunityState();
  }
}

function writeState(state, stateFile = STATE_FILE) {
  writeJsonAtomically(stateFile, state);
}

function opportunityLockKey(name) {
  return `xiuxian:shengxu:unique:lock:${encodeURIComponent(name)}`;
}

function ancestorSettlementKey(settlementId) {
  return `xiuxian:shengxu:ancestor-seed:settlement:${encodeURIComponent(String(settlementId))}`;
}

async function withOpportunityLock(name, callback, redisClient = globalThis.redis) {
  if (!redisClient?.set || !redisClient?.get || !redisClient?.eval) {
    throw new Error('圣墟唯一机缘缺少 Redis CAS 客户端');
  }
  const key = opportunityLockKey(name);
  const token = `${process.pid}:${Date.now()}:${Math.random()}`;
  const acquired = await redisClient.set(key, token, { NX: true, EX: LOCK_TTL_SECONDS });
  if (!acquired) {
    const error = new Error(`${name}归属正在结算`);
    error.code = 'SHENGXU_OPPORTUNITY_BUSY';
    throw error;
  }
  let lost = false;
  let renewing = false;
  const lockLostError = () => {
    const error = new Error(`${name}归属锁已失效`);
    error.code = 'SHENGXU_OPPORTUNITY_LOCK_LOST';
    return error;
  };
  const renew = async () => {
    if (lost || renewing) return;
    renewing = true;
    try {
      if (!await compareAndExpireRedisKey(redisClient, key, token, LOCK_TTL_MS)) lost = true;
    } catch (error) {
      lost = true;
      console.error(`[圣墟唯一机缘] 续租${name}归属锁失败:`, error.message);
    } finally {
      renewing = false;
    }
  };
  const timer = setInterval(() => void renew(), LOCK_RENEW_INTERVAL_MS);
  timer.unref?.();
  const lease = {
    async assertOwned() {
      if (lost || await redisClient.get(key) !== token) {
        lost = true;
        throw lockLostError();
      }
    },
  };
  try {
    await lease.assertOwned();
    return await callback(lease);
  } finally {
    clearInterval(timer);
    try {
      await compareAndDeleteRedisJson(redisClient, key, token);
    } catch (error) {
      console.error(`[圣墟唯一机缘] 释放${name}归属锁失败:`, error.message);
    }
  }
}

export function withShengxuOpportunityLock(name, callback, options = {}) {
  return withOpportunityLock(name, callback, options.redisClient);
}

function compareOwnerIds(left, right) {
  const a = String(left);
  const b = String(right);
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    const normalizedA = a.replace(/^0+(?=\d)/, '');
    const normalizedB = b.replace(/^0+(?=\d)/, '');
    if (normalizedA.length !== normalizedB.length) return normalizedA.length - normalizedB.length;
    if (normalizedA !== normalizedB) return normalizedA < normalizedB ? -1 : 1;
  }
  return a === b ? 0 : a < b ? -1 : 1;
}

export function selectStableShengxuOpportunityOwner(ownerIds = []) {
  return [...new Set(ownerIds.map(String).filter(Boolean))].sort(compareOwnerIds)[0] || '';
}

export function scanLegacyFlowerAncestorSeedOwners(options = {}) {
  const fileSystem = options.fileSystem || fs;
  const najieDir = options.najieDir || NAJIE_DIR;
  if (!fileSystem.existsSync(najieDir)) return [];
  const owners = [];
  for (const file of fileSystem.readdirSync(najieDir).filter(name => name.endsWith('.json')).sort()) {
    try {
      const najie = JSON.parse(fileSystem.readFileSync(path.join(najieDir, file), 'utf8'));
      const hasSeed = Array.isArray(najie?.道具)
        && najie.道具.some(item => item?.name === '花粉路祖种' && Number(item.数量) > 0);
      if (hasSeed) owners.push(file.slice(0, -5));
    } catch (error) {
      console.warn(`[圣墟唯一机缘] 跳过异常纳戒存档 ${file}:`, error.message);
    }
  }
  return owners.sort(compareOwnerIds);
}

export function defaultShengxuOpportunityState() {
  return { opportunities: {} };
}

export function readShengxuOpportunityState(options = {}) {
  return readState(options.stateFile, options.fileSystem, options.strict === true);
}

export function claimShengxuOpportunityState(state, name, ownerId, now = Date.now()) {
  state.opportunities ??= {};
  if (state.opportunities[name]) {
    return { ok: false, reason: 'owned', ...state.opportunities[name] };
  }
  state.opportunities[name] = { ownerId: String(ownerId), claimedAt: now };
  return { ok: true, name, ownerId: String(ownerId), claimedAt: now };
}

export function claimShengxuOpportunity(name, ownerId, now = Date.now()) {
  const state = readShengxuOpportunityState({ strict: true });
  const result = claimShengxuOpportunityState(state, name, ownerId, now);
  if (result.ok) writeState(state);
  return result;
}

export function getShengxuOpportunityOwner(name, options = {}) {
  return String(readShengxuOpportunityState(options).opportunities?.[name]?.ownerId || '');
}

export function isShengxuOpportunityOwner(name, ownerId, options = {}) {
  const owner = getShengxuOpportunityOwner(name, options);
  return Boolean(owner) && owner === String(ownerId);
}

function migrateFlowerAncestorSeedState(state, now, options) {
  if (state.opportunities?.[FLOWER_ANCESTOR_SEED_OPPORTUNITY]) return { migrated: false, owners: [] };
  const owners = scanLegacyFlowerAncestorSeedOwners(options);
  const ownerId = selectStableShengxuOpportunityOwner(owners);
  if (!ownerId) return { migrated: false, owners };
  state.opportunities ??= {};
  state.opportunities[FLOWER_ANCESTOR_SEED_OPPORTUNITY] = {
    ownerId,
    claimedAt: now,
    migratedFromLegacyInventory: true,
  };
  return { migrated: true, owners };
}

export async function ensureFlowerAncestorSeedOwner(options = {}) {
  const existing = getShengxuOpportunityOwner(FLOWER_ANCESTOR_SEED_OPPORTUNITY, options);
  if (existing) return existing;
  return withOpportunityLock(STATE_LOCK_SCOPE, async lease => {
    const state = readShengxuOpportunityState({ ...options, strict: true });
    const migration = migrateFlowerAncestorSeedState(state, options.now ?? Date.now(), options);
    if (migration.migrated) {
      await lease.assertOwned();
      writeState(state, options.stateFile);
    }
    return String(state.opportunities?.[FLOWER_ANCESTOR_SEED_OPPORTUNITY]?.ownerId || '');
  }, options.redisClient);
}

export async function isFlowerAncestorSeedOwner(ownerId, options = {}) {
  return (await ensureFlowerAncestorSeedOwner(options)) === String(ownerId);
}

export async function claimShengxuOpportunityAtomic(name, ownerId, options = {}) {
  const normalizedOwnerId = String(ownerId);
  const existing = getShengxuOpportunityOwner(name, options);
  if (existing) {
    const entry = readShengxuOpportunityState(options).opportunities?.[name] || {};
    return { ok: false, reason: 'owned', ...entry, ownerId: existing, ownedBySelf: existing === normalizedOwnerId };
  }
  return withOpportunityLock(STATE_LOCK_SCOPE, async lease => {
    const state = readShengxuOpportunityState({ ...options, strict: true });
    const migration = name === FLOWER_ANCESTOR_SEED_OPPORTUNITY
      ? migrateFlowerAncestorSeedState(state, options.now ?? Date.now(), options)
      : { migrated: false, owners: [] };
    const result = claimShengxuOpportunityState(state, name, normalizedOwnerId, options.now ?? Date.now());
    if (migration.migrated || result.ok) {
      await lease.assertOwned();
      writeState(state, options.stateFile);
    }
    return {
      ...result,
      ownerId: String(result.ownerId || ''),
      ownedBySelf: String(result.ownerId || '') === normalizedOwnerId,
      migrated: migration.migrated,
      legacyOwners: migration.owners,
    };
  }, options.redisClient);
}

export async function getShengxuAncestorSeedSettlementResult(settlementId, options = {}) {
  if (!settlementId) return null;
  const redisClient = options.redisClient || globalThis.redis;
  const value = await redisClient.get(ancestorSettlementKey(settlementId));
  return value === null || value === undefined ? null : value === '1';
}

export async function persistShengxuAncestorSeedSettlementResult(settlementId, rolled, options = {}) {
  if (!settlementId) throw new Error('祖种结算缺少 settlementId');
  const redisClient = options.redisClient || globalThis.redis;
  const key = ancestorSettlementKey(settlementId);
  const value = rolled ? '1' : '0';
  const stored = await redisClient.set(key, value, { NX: true, EX: SETTLEMENT_RESULT_TTL_SECONDS });
  if (stored) return rolled;
  const existing = await redisClient.get(key);
  if (existing === null || existing === undefined) {
    throw new Error(`祖种结算结果 ${settlementId} 持久化冲突`);
  }
  return existing === '1';
}
