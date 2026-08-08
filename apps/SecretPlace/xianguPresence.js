const XIANGU_PRESENCE_PREFIX = 'xiuxian:xiangu:presence';
export const XIANGU_PRESENCE_TTL_SECONDS = 180;

function required(value, name) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${name}不能为空`);
  return normalized;
}

function encoded(value, name) {
  return encodeURIComponent(required(value, name));
}

function normalizePosition(position = {}) {
  const x = Math.trunc(Number(position.x));
  const y = Math.trunc(Number(position.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function instanceParts(snapshot = {}) {
  return {
    worldSeed: String(snapshot.worldSeed || 'legacy'),
    fragmentId: String(snapshot.fragmentId || ''),
    instanceId: String(snapshot.instanceId ?? ''),
  };
}

export function getXianguPresenceKey(playerId) {
  return `${XIANGU_PRESENCE_PREFIX}:player:${encoded(playerId, 'playerId')}`;
}

export function getXianguPresenceInstanceKey(snapshot) {
  const { worldSeed, fragmentId, instanceId } = instanceParts(snapshot);
  return [
    XIANGU_PRESENCE_PREFIX,
    'instance',
    encoded(worldSeed, 'worldSeed'),
    encoded(fragmentId, 'fragmentId'),
    encoded(instanceId || 'legacy', 'instanceId'),
  ].join(':');
}

export function getXianguPresenceSnapshot(player = {}, playerId, now = Date.now()) {
  const map = player?.xiangu_realm_map || {};
  const position = normalizePosition(map.playerPos || {
    x: player?.xiangu_pos_x,
    y: player?.xiangu_pos_y,
  });
  if (!player?.in_xiangu || !position || !map.fragmentId) return null;

  return {
    id: required(playerId, 'playerId'),
    worldSeed: String(player.xiangu_world_seed || player.xiangu_entry_time || 'legacy'),
    fragmentId: String(map.fragmentId),
    instanceId: String(map.instanceId ?? ''),
    x: position.x,
    y: position.y,
    updatedAt: Math.max(0, Math.trunc(Number(now) || Date.now())),
  };
}

function parseSnapshot(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    const position = normalizePosition(value);
    if (!value || !position || !String(value.id || '').trim() || !String(value.fragmentId || '').trim()) {
      return null;
    }
    return {
      id: String(value.id),
      worldSeed: String(value.worldSeed || 'legacy'),
      fragmentId: String(value.fragmentId),
      instanceId: String(value.instanceId ?? ''),
      x: position.x,
      y: position.y,
      updatedAt: Math.max(0, Math.trunc(Number(value.updatedAt) || 0)),
    };
  } catch {
    return null;
  }
}

export async function readXianguPresence(redisClient, playerId) {
  return parseSnapshot(await redisClient.get(getXianguPresenceKey(playerId)));
}

async function setExpiry(redisClient, key, seconds) {
  if (typeof redisClient.expire === 'function') {
    await redisClient.expire(key, seconds);
  }
}

export async function upsertXianguPresence(
  redisClient,
  snapshot,
  { ttlSeconds = XIANGU_PRESENCE_TTL_SECONDS } = {},
) {
  if (!snapshot) return null;
  const normalized = parseSnapshot(JSON.stringify(snapshot));
  if (!normalized) throw new TypeError('秘境坐标状态无效');

  const ttl = Math.max(30, Math.trunc(Number(ttlSeconds) || XIANGU_PRESENCE_TTL_SECONDS));
  const playerKey = getXianguPresenceKey(normalized.id);
  const previous = await readXianguPresence(redisClient, normalized.id);
  const instanceKey = getXianguPresenceInstanceKey(normalized);
  const operations = [
    redisClient.set(playerKey, JSON.stringify(normalized), { EX: ttl }),
    redisClient.sAdd(instanceKey, normalized.id),
    setExpiry(redisClient, instanceKey, ttl),
  ];
  if (previous) {
    const previousInstanceKey = getXianguPresenceInstanceKey(previous);
    if (previousInstanceKey !== instanceKey) operations.push(redisClient.sRem(previousInstanceKey, normalized.id));
  }
  await Promise.all(operations);
  return normalized;
}

export async function removeXianguPresence(redisClient, playerId) {
  const previous = await readXianguPresence(redisClient, playerId);
  const operations = [redisClient.del(getXianguPresenceKey(playerId))];
  if (previous) operations.push(redisClient.sRem(getXianguPresenceInstanceKey(previous), String(playerId)));
  await Promise.all(operations);
  return previous;
}

export async function getXianguInstancePresence(
  redisClient,
  snapshot,
  { excludeId, maxDistance } = {},
) {
  if (!snapshot) return [];
  const instanceKey = getXianguPresenceInstanceKey(snapshot);
  const ids = await redisClient.sMembers(instanceKey);
  const presences = await Promise.all(ids.map(id => readXianguPresence(redisClient, id)));
  const staleIds = [];
  const radius = Number.isFinite(Number(maxDistance)) ? Math.max(0, Number(maxDistance)) : null;
  const result = [];

  for (let index = 0; index < ids.length; index++) {
    const id = String(ids[index]);
    const presence = presences[index];
    if (!presence || getXianguPresenceInstanceKey(presence) !== instanceKey) {
      staleIds.push(id);
      continue;
    }
    if (excludeId !== undefined && String(excludeId) === id) continue;
    const distance = Math.abs(snapshot.x - presence.x) + Math.abs(snapshot.y - presence.y);
    if (radius !== null && distance > radius) continue;
    result.push(presence);
  }

  if (staleIds.length > 0) await Promise.all(staleIds.map(id => redisClient.sRem(instanceKey, id)));
  return result;
}
