const compareAndSetScript = `
local current = redis.call('GET', KEYS[1])
if not current or current ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
return 1
`;

const compareAndDeleteScript = `
local current = redis.call('GET', KEYS[1])
if not current or current ~= ARGV[1] then return 0 end
return redis.call('DEL', KEYS[1])
`;

export async function compareAndSetRedisJson(redis, key, currentJson, nextValue) {
  const result = await redis.eval(compareAndSetScript, {
    keys: [key],
    arguments: [currentJson, JSON.stringify(nextValue)],
  });
  return Number(result) === 1;
}

export async function compareAndDeleteRedisJson(redis, key, currentJson) {
  const result = await redis.eval(compareAndDeleteScript, {
    keys: [key],
    arguments: [currentJson],
  });
  return Number(result) === 1;
}
