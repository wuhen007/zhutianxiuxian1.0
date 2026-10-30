import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import { writeJsonAtomically } from '../utils/atomicJson.js';
import { SUIYUN_DROP_CHANCE } from './suiyun.js';

export const SUIYUN_REGISTRY_FILE = fileURLToPath(new URL('../resources/data/suiyun_unique', import.meta.url));

export function getSuiyunTimeline(player) {
  return String(player?.时间线ID || player?.世界线ID || 'main');
}

export function getSuiyunClaimFile(kind, { timeline = 'main', file = SUIYUN_REGISTRY_FILE } = {}) {
  if (!['remnant', 'root', 'treasure'].includes(kind)) throw new TypeError('未知岁云唯一记录类型');
  const scope = kind === 'treasure' ? 'all-worldlines' : String(timeline);
  const hash = createHash('sha256').update(scope).digest('hex').slice(0, 24);
  return `${file}.${kind}.${hash}.json`;
}

export function readSuiyunUnique(kind, options = {}) {
  const file = getSuiyunClaimFile(kind, options);
  try {
    const claim = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!claim?.ownerId) throw new Error(`岁云唯一记录缺少归属：${file}`);
    return claim;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    // 损坏记录保持占用，交由维护者核对，避免读取失败时重新发放唯一物品。
    throw error;
  }
}

export function claimSuiyunUnique(kind, playerId, options = {}) {
  const ownerId = String(playerId || '').trim();
  if (!ownerId) throw new TypeError('岁云唯一记录需要玩家ID');
  const file = getSuiyunClaimFile(kind, options);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const claim = { kind, ownerId, timeline: kind === 'treasure' ? '*' : String(options.timeline || 'main'), at: options.now ?? Date.now(), delivered: false };
  try {
    // 独占创建使多个进程竞争同一归属时也只有一个赢家。
    fs.writeFileSync(file, JSON.stringify(claim), { encoding: 'utf8', flag: 'wx' });
    return { ok: true, ownerId, alreadyOwned: false, claim };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = readSuiyunUnique(kind, options);
    return { ok: existing.ownerId === ownerId, ownerId: existing.ownerId, alreadyOwned: true, claim: existing };
  }
}

export function releaseSuiyunUnique(kind, playerId, options = {}) {
  const claim = readSuiyunUnique(kind, options);
  if (!claim || claim.ownerId !== String(playerId) || claim.delivered) return false;
  fs.unlinkSync(getSuiyunClaimFile(kind, options));
  return true;
}

export async function withSuiyunUniqueClaim(kind, playerId, grant, options = {}) {
  const file = getSuiyunClaimFile(kind, options);
  return withPlayerMutationLock(`suiyun-unique:${file}`, async () => {
    const result = claimSuiyunUnique(kind, playerId, options);
    if (!result.ok) return result;
    if (result.claim.delivered) return { ...result, ok: false, alreadyOwned: true };
    const idempotencyKey = `suiyun:${kind}:${result.claim.timeline}:${result.ownerId}`;
    // ponytail: delivery uses the existing inventory idempotency key; crashes retain a
    // pending claim for this owner, never release an uncertain partially-written grant.
    const granted = await grant({ idempotencyKey });
    if (granted === false) return { ...result, ok: false, pending: true };
    const current = readSuiyunUnique(kind, options);
    if (current?.ownerId !== String(playerId)) throw new Error('岁云唯一归属在发放中发生变化');
    writeJsonAtomically(file, { ...current, delivered: true });
    return { ...result, ok: true, alreadyOwned: false };
  });
}

export async function rollAndGrantSuiyunRemnant(player, grant, { location, random = Math.random, ...options } = {}) {
  if (location !== '往世星海') return { ok: false, encountered: false };
  const playerId = String(player?.id || player?.qq || '');
  if (!playerId) return { ok: false, encountered: false };
  options.timeline ??= getSuiyunTimeline(player);
  const existing = readSuiyunUnique('remnant', options);
  if (existing?.delivered || (existing && existing.ownerId !== playerId)) return { ok: false, encountered: false, alreadyOwned: true };
  // 发放中断的同一归属可重试，无需再次命中十万分之一概率。
  const roll = existing ? 0 : Number(random());
  if (!Number.isFinite(roll) || roll < 0 || roll >= SUIYUN_DROP_CHANCE) return { ok: false, encountered: false };
  const result = await withSuiyunUniqueClaim('remnant', playerId, grant, options);
  return { ...result, encountered: result.ok };
}
