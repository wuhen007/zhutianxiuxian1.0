import { compareAndDeleteRedisJson } from '../utils/redisJsonCas.js';

export const DARK_SUPPRESSION_ACTION = '被镇压炼化元神';
export const DARK_SUPPRESSION_CREATING = 'creating';
export const DARK_SUPPRESSION_ACTIVE = 'active';
export const DARK_SUPPRESSION_CANCELLING = 'cancelling';
export const DARK_SUPPRESSION_CANCELLING_CREATION = 'cancelling_creation';

const beginDarkSuppressionScript = `
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], ARGV[2])
redis.call('SET', KEYS[3], ARGV[3])
redis.call('SET', KEYS[4], ARGV[4])
return 1
`;

const completeDarkSuppressionScript = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], ARGV[3])
return 1
`;

export function parseDarkSuppressionAction(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function hasDarkSuppressionPlayerState(player) {
  return Boolean(
    player?.道果状态 === '道崩·炼化中' ||
    (player && Object.hasOwn(player, '时间长河道崩'))
  );
}

export function hasDarkSuppressionState(player, state = {}) {
  return Boolean(
    state.marker ||
    state.endTime ||
    state.suppressionData ||
    parseDarkSuppressionAction(state.actionData)?.action === DARK_SUPPRESSION_ACTION ||
    hasDarkSuppressionPlayerState(player)
  );
}

export async function beginDarkSuppression(redis, playerId, details) {
  const id = String(playerId);
  const actionData = JSON.stringify({
    action: DARK_SUPPRESSION_ACTION,
    start_time: details.startedAt,
    end_time: details.endTime,
    group_id: details.groupId,
  });
  const suppressionData = JSON.stringify({
    group_id: details.groupId,
    original_level: details.originalLevel,
    recovery: {
      player_patch: details.recoveryPlayerPatch,
      equipment: details.recoveryEquipment || null,
    },
  });

  await redis.eval(beginDarkSuppressionScript, {
    keys: [
      `xiuxian:dark_suppression:${id}`,
      `xiuxian:player:${id}:suppression_end`,
      `xiuxian:player:${id}:suppression_data`,
      `xiuxian:player:${id}:action`,
    ],
    arguments: [DARK_SUPPRESSION_CREATING, String(details.endTime), suppressionData, actionData],
  });
}

export async function completeDarkSuppressionCreation(redis, playerId, details) {
  const id = String(playerId);
  const suppressionData = JSON.stringify({
    group_id: details.groupId,
    original_level: details.originalLevel,
  });
  const result = await redis.eval(completeDarkSuppressionScript, {
    keys: [
      `xiuxian:dark_suppression:${id}`,
      `xiuxian:player:${id}:suppression_data`,
    ],
    arguments: [DARK_SUPPRESSION_CREATING, DARK_SUPPRESSION_ACTIVE, suppressionData],
  });
  if (Number(result) !== 1) throw new Error('Dark suppression creation phase changed');
}

export async function markDarkSuppressionCancelling(redis, playerId) {
  await redis.set(
    `xiuxian:dark_suppression:${String(playerId)}`,
    DARK_SUPPRESSION_CANCELLING
  );
}

export async function markDarkSuppressionCreationCancelling(redis, playerId) {
  await redis.set(
    `xiuxian:dark_suppression:${String(playerId)}`,
    DARK_SUPPRESSION_CANCELLING_CREATION
  );
}

export function clearDarkSuppressionPlayerState(player) {
  let changed = false;
  if (player?.道果状态 === '道崩·炼化中') {
    delete player.道果状态;
    changed = true;
  }
  if (player && Object.hasOwn(player, '时间长河道崩')) {
    delete player.时间长河道崩;
    changed = true;
  }
  return changed;
}

export async function deleteDarkSuppressionAction(redis, key, initialValue = null) {
  let expected = initialValue;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!expected) expected = await redis.get(key);
    if (parseDarkSuppressionAction(expected)?.action !== DARK_SUPPRESSION_ACTION) return false;
    if (await compareAndDeleteRedisJson(redis, key, expected)) return true;
    expected = null;
  }
  const latest = await redis.get(key);
  if (parseDarkSuppressionAction(latest)?.action === DARK_SUPPRESSION_ACTION) {
    throw new Error('Dark suppression action changed during cleanup');
  }
  return false;
}
