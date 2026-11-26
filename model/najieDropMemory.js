export const OWN_NAJIE_RECALL_CHANCE = 0.35;
export const DUNGEON_NAJIE_MEMORY_CHANCE = 0.03;

const MEMORY_FIELD = '遗落纳戒记忆';
const MAX_MEMORIES = 50;

function getMemoryKeys(player) {
  return Array.isArray(player?.[MEMORY_FIELD])
    ? player[MEMORY_FIELD].map(String).filter(Boolean)
    : [];
}

export function hasNajieDropMemory(player, dropKey) {
  return getMemoryKeys(player).includes(String(dropKey || ''));
}

export function rememberNajieDrop(player, dropKey) {
  const key = String(dropKey || '');
  if (!player || !key || hasNajieDropMemory(player, key)) return false;
  player[MEMORY_FIELD] = [...getMemoryKeys(player), key].slice(-MAX_MEMORIES);
  return true;
}

export function filterRememberedNajieDrops(drops, player) {
  return drops.filter(drop => hasNajieDropMemory(player, drop.key));
}

export function tryRecallOwnNajieDrop(player, dropKey, random = Math.random) {
  return random() < OWN_NAJIE_RECALL_CHANCE && rememberNajieDrop(player, dropKey);
}

export async function discoverNajieDropMemory(redisClient, player, options = {}) {
  const random = options.random || Math.random;
  const now = options.now || Date.now();
  if (random() >= DUNGEON_NAJIE_MEMORY_CHANCE) return null;

  try {
    const keys = await redisClient.zRange('xiuxian:najie_drop_index', 0, -1);
    const candidates = [];
    for (const key of keys) {
      if (hasNajieDropMemory(player, key)) continue;
      const raw = await redisClient.get(key);
      if (!raw) continue;
      try {
        const drop = JSON.parse(raw);
        if (!drop.beFound && now < Number(drop.expiredTime || 0)) {
          candidates.push({ ...drop, key });
        }
      } catch {}
    }
    if (candidates.length === 0) return null;

    const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
    const discovered = candidates[index];
    rememberNajieDrop(player, discovered.key);
    return discovered;
  } catch {
    return null;
  }
}

export function formatNajieMemoryDiscovery(drop) {
  const location = drop?.location || {};
  return `【遗物残忆】秘境深处的一缕执念触动识海，你记起了${drop?.player_name || '某位修士'}遗落的纳戒：${location.weimianName || '未知位面'}坐标(${location.x}, ${location.y})。`;
}
