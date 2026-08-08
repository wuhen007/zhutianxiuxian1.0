const RELEASE_LOCK_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  end
  return 0
`;

const REFRESH_LOCK_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('expire', KEYS[1], ARGV[2])
  end
  return 0
`;

const MIGRATE_DROP_SCRIPT = `
  if redis.call('exists', KEYS[3]) == 0 then
    return { -1, '' }
  end

  local existing = redis.call('get', KEYS[1])
  if existing then
    redis.call('del', KEYS[3])
    redis.call('zrem', KEYS[4], KEYS[3])
    return { 0, existing }
  end

  redis.call('set', KEYS[1], ARGV[1], 'EX', ARGV[2])
  redis.call('zadd', KEYS[2], ARGV[3], KEYS[1])
  redis.call('del', KEYS[3])
  redis.call('zrem', KEYS[4], KEYS[3])
  return { 1, ARGV[1] }
`;

export async function acquireRedisLock(redisClient, key, token, ttlSeconds = 60) {
  return Boolean(await redisClient.set(key, token, {
    NX: true,
    EX: ttlSeconds,
  }));
}

export async function releaseRedisLock(redisClient, key, token) {
  return redisClient.eval(RELEASE_LOCK_SCRIPT, {
    keys: [key],
    arguments: [token],
  });
}

export async function refreshRedisLock(redisClient, key, token, ttlSeconds = 60) {
  return Boolean(await redisClient.eval(REFRESH_LOCK_SCRIPT, {
    keys: [key],
    arguments: [token, String(ttlSeconds)],
  }));
}

export async function migrateDropToBaodi(redisClient, {
  baodiKey,
  baodiIndexKey,
  dropKey,
  dropIndexKey,
  baodi,
  ttlSeconds,
}) {
  const encodedBaodi = JSON.stringify(baodi);
  const result = await redisClient.eval(MIGRATE_DROP_SCRIPT, {
    keys: [baodiKey, baodiIndexKey, dropKey, dropIndexKey],
    arguments: [
      encodedBaodi,
      String(ttlSeconds),
      String(baodi.createdAt),
    ],
  });

  const status = Number(result?.[0]);
  if (status === -1) return null;

  const storedBaodi = JSON.parse(result?.[1] || encodedBaodi);
  return {
    baodi: storedBaodi,
    created: status === 1,
  };
}

export async function commitClaimWithRollback({
  originalNajie,
  mergedNajie,
  writeNajie,
  commitBaodi,
}) {
  await writeNajie(mergedNajie);

  try {
    await commitBaodi();
  } catch (error) {
    try {
      await writeNajie(originalNajie);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        '仙遗宝地领取失败，且纳戒回滚未完整完成'
      );
    }
    throw error;
  }
}
