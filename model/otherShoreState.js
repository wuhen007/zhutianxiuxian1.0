export const CANG_LAN_WORLD_STATE_KEY = 'xiuxian:other-shore:canglan:v1:world';

const LOCK_KEY = `${CANG_LAN_WORLD_STATE_KEY}:lock`;
const LOCK_TTL_SECONDS = 30;
const RELEASE_LOCK_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;
const COMMIT_DOCUMENT_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  redis.call('set', KEYS[2], ARGV[2])
  return 1
end
return 0
`;

function parseDocument(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function releaseLock(redisClient, token) {
  try {
    if (typeof redisClient.eval === 'function') {
      await redisClient.eval(RELEASE_LOCK_SCRIPT, {
        keys: [LOCK_KEY],
        arguments: [token],
      });
      return;
    }
    if (await redisClient.get(LOCK_KEY) === token) await redisClient.del(LOCK_KEY);
  } catch {
  }
}

async function commitDocument(redisClient, token, document) {
  const encoded = JSON.stringify(document);
  if (typeof redisClient.eval === 'function') {
    const committed = await redisClient.eval(COMMIT_DOCUMENT_SCRIPT, {
      keys: [LOCK_KEY, CANG_LAN_WORLD_STATE_KEY],
      arguments: [token, encoded],
    });
    if (Number(committed) === 1) return;
  } else if (await redisClient.get(LOCK_KEY) === token) {
    await redisClient.set(CANG_LAN_WORLD_STATE_KEY, encoded);
    return;
  }
  throw new Error('沧澜星图写入租约已经失效，请重新尝试');
}

export async function readOtherShoreWorldState(redisClient) {
  if (!redisClient) throw new TypeError('Redis 尚未就绪');
  return parseDocument(await redisClient.get(CANG_LAN_WORLD_STATE_KEY));
}

export async function updateOtherShoreWorldState(
  redisClient,
  createDocument,
  updater,
  options = {},
) {
  if (!redisClient) throw new TypeError('Redis 尚未就绪');
  if (typeof createDocument !== 'function') throw new TypeError('createDocument 必须是函数');
  if (typeof updater !== 'function') throw new TypeError('updater 必须是函数');

  const attempts = Math.max(1, Math.trunc(Number(options.attempts) || 50));
  const retryDelay = Math.max(1, Math.trunc(Number(options.retryDelay) || 10));
  const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const acquired = await redisClient.set(LOCK_KEY, token, {
      NX: true,
      EX: LOCK_TTL_SECONDS,
    });
    if (!acquired) {
      await wait(retryDelay);
      continue;
    }

    try {
      const document = parseDocument(await redisClient.get(CANG_LAN_WORLD_STATE_KEY))
        || createDocument();
      const value = await updater(document);
      await commitDocument(redisClient, token, document);
      return { document, value };
    } finally {
      await releaseLock(redisClient, token);
    }
  }

  throw new Error('沧澜星图正在被诸多神念同时改写，请稍后再试');
}

export async function ensureOtherShoreWorldState(redisClient, createDocument) {
  const existing = await readOtherShoreWorldState(redisClient);
  if (existing) return existing;
  const result = await updateOtherShoreWorldState(redisClient, createDocument, () => null);
  return result.document;
}

export async function deliverOtherShorePlayerMutation(
  redisClient,
  createDocument,
  mutationKey,
  deliver,
) {
  if (typeof deliver !== 'function') throw new TypeError('deliver 必须是函数');
  const key = String(mutationKey || '');
  if (!key) throw new TypeError('mutationKey 不能为空');
  const world = await ensureOtherShoreWorldState(redisClient, createDocument);
  const pending = world.pendingPlayerMutations?.[key];
  if (!pending) return null;

  await deliver(structuredClone(pending));
  await updateOtherShoreWorldState(redisClient, createDocument, document => {
    if (document.pendingPlayerMutations?.[key]?.id !== pending.id) return;
    const remaining = { ...document.pendingPlayerMutations };
    delete remaining[key];
    if (Object.keys(remaining).length) document.pendingPlayerMutations = remaining;
    else delete document.pendingPlayerMutations;
  });
  return pending;
}

export async function deliverOtherShorePlayerMutations(
  redisClient,
  createDocument,
  predicate,
  deliver,
) {
  if (typeof predicate !== 'function') throw new TypeError('predicate 必须是函数');
  const world = await ensureOtherShoreWorldState(redisClient, createDocument);
  const entries = Object.entries(world.pendingPlayerMutations || {})
    .filter(([key, pending]) => predicate(key, pending))
    .sort((left, right) => Number(left[1]?.createdAt || 0) - Number(right[1]?.createdAt || 0));
  const delivered = [];
  for (const [key] of entries) {
    const pending = await deliverOtherShorePlayerMutation(
      redisClient,
      createDocument,
      key,
      deliver,
    );
    if (pending) delivered.push({ key, ...pending });
  }
  return delivered;
}
