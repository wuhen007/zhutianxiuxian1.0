const migrateLegacyActionScript = `
local canonical = redis.call('GET', KEYS[1])
if canonical then
  for index = 2, #KEYS do redis.call('DEL', KEYS[index]) end
  return 0
end

local migrated = 0
for index = 2, #KEYS do
  local legacyKey = KEYS[index]
  local legacy = redis.call('GET', legacyKey)
  if legacy then
    local ttl = redis.call('PTTL', legacyKey)
    if migrated == 0 and ttl > 0 then
      redis.call('SET', KEYS[1], legacy, 'PX', ttl)
      migrated = 1
    elseif migrated == 0 and ttl == -1 then
      redis.call('SET', KEYS[1], legacy)
      migrated = 1
    end
    redis.call('DEL', legacyKey)
  end
end
return migrated
`;

function actionKey(playerId) {
  return `xiuxian:player:${playerId}:action`;
}

export async function migrateLegacyPlayerActionKey(redisClient, canonicalPlayerId, rawPlayerId) {
  const canonicalId = String(canonicalPlayerId);
  const canonicalKey = actionKey(canonicalId);
  const rawId = String(rawPlayerId);
  const legacyIds = [...new Set([rawId, rawId.replace('qg_', '')])]
    .filter(id => id && id !== canonicalId);
  if (legacyIds.length === 0) return { key: canonicalKey, migrated: false };
  const result = await redisClient.eval(migrateLegacyActionScript, {
    keys: [canonicalKey, ...legacyIds.map(actionKey)],
    arguments: [],
  });
  return { key: canonicalKey, migrated: Number(result) === 1 };
}
