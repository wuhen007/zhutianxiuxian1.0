// 普通秘境结算保留旧动作键作为历史，0=进行中，1=关闭。
// 这里只判定已明确结束的真身秘境动作，不按“时间过了”推测奖励已结算。
const STANDARD_SECRET_PLACE_ACTIONS = new Set([
  '探索界海', '秘境历练', '下界八域历练', '九天十地历练',
  '遮天位面历练', '禁地历练', '探索仙府', '镇守仙境',
]);
export const SECRET_PLACE_IDLE_FLAGS = Object.freeze([
  'shutup', 'working', 'Place_action', 'Place_actionplus',
  'power_up', 'mojie', 'xijie', 'plant', 'mine',
]);
const closed = value => value === 1 || value === '1';
function finiteNumber(value) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return NaN;
  return Number(value);
}

// 必须在与结算共用的锁内调用后续动作逻辑：结算可能先关闭标记再保存奖励。
export function isCompletedSecretPlaceAction(action, now = Date.now()) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) return false;
  if (!STANDARD_SECRET_PLACE_ACTIONS.has(action.action)) return false;
  if (action.isFashan || action.actor === 'fashan' || action.creation || action.eternal_guard) return false;
  if (!SECRET_PLACE_IDLE_FLAGS.every(flag => closed(action[flag]))) return false;
  const ended = finiteNumber(action.end_time);
  if (!Number.isFinite(ended) || ended < 0 || ended > now) return false;
  if ('total_count' in action || 'settled_count' in action) {
    const total = finiteNumber(action.total_count);
    const settled = finiteNumber(action.settled_count);
    if (!Number.isSafeInteger(total) || total < 1 ||
      !Number.isSafeInteger(settled) || settled < total) return false;
  }
  return true;
}

export function formatBlockingAction(action, now = Date.now()) {
  const name = typeof action?.action === 'string' ? action.action : '其他修仙行动';
  const ended = finiteNumber(action?.end_time);
  const timing = Number.isFinite(ended)
    ? ended > now
      ? `剩余约${Math.max(1, Math.ceil((ended - now) / 60000))}分钟，`
      : '已到结束时间，仍需完成结算，'
    : '';
  return `你当前正在进行【${name}】，${timing}结束并结算后才能造化万物。`;
}
