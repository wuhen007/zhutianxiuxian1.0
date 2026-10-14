import { fileURLToPath } from 'node:url';
import {
  claimSuiyunUnique, getSuiyunTimeline, readSuiyunUnique,
  releaseSuiyunUnique, withSuiyunUniqueClaim,
} from './suiyunRegistry.js';

export const MEMORY_REGISTRY_FILE = fileURLToPath(new URL('../resources/data/memory_unique', import.meta.url));
export const MEMORY_DATA_DROP_CHANCE = 0.0001;
const storage = options => ({ ...options, file: options?.file || MEMORY_REGISTRY_FILE });
const registryKind = kind => kind === 'data' ? 'remnant' : kind;

export function readMemoryUnique(kind, options) {
  return readSuiyunUnique(registryKind(kind), storage(options));
}

export function claimMemoryUnique(kind, ownerId, options) {
  return claimSuiyunUnique(registryKind(kind), ownerId, storage(options));
}

export function releaseMemoryUnique(kind, ownerId, options) {
  return releaseSuiyunUnique(registryKind(kind), ownerId, storage(options));
}

export async function rollAndGrantMemoryData(player, grant, { location, random = Math.random, ...options } = {}) {
  if (location !== '往世星海') return { ok: false, encountered: false };
  const ownerId = String(player?.id || player?.qq || '');
  if (!ownerId) return { ok: false, encountered: false };
  options.timeline ??= getSuiyunTimeline(player);
  const previous = readMemoryUnique('data', options);
  if (previous?.delivered || (previous && previous.ownerId !== ownerId)) return { ok: false, encountered: false };
  const roll = previous ? 0 : Number(random());
  if (!Number.isFinite(roll) || roll < 0 || roll >= MEMORY_DATA_DROP_CHANCE) return { ok: false, encountered: false };
  const result = await withSuiyunUniqueClaim('remnant', ownerId, () => grant({
    idempotencyKey: `memory:data:${options.timeline}:${ownerId}`,
  }), storage(options));
  return { ...result, encountered: result.ok };
}
