import { getTribulationLockContext, touchTribulationProgress } from './tribulationLock.js';

export const TRIBULATION_REPLY_TIMEOUT_MS = 15_000;

// Message delivery is not part of the persistence transaction. Never abandon
// the battle or release its lock merely because the messaging promise is slow.
// On delivery failure, resume the original control flow; no game action is raced.
export function wrapTribulationEvent(playerId, event, { timeoutMs = TRIBULATION_REPLY_TIMEOUT_MS } = {}) {
  if (!event || typeof event.reply !== 'function') return event;
  const limit = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : TRIBULATION_REPLY_TIMEOUT_MS;
  let suppressed = false;
  const guardedReply = async (...args) => {
    const context = getTribulationLockContext(playerId);
    if (suppressed || context?.replySuppressed) return false;
    touchTribulationProgress(playerId, 'sending');
    const result = await new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), limit);
      Promise.resolve().then(() => Reflect.apply(event.reply, event, args))
        .then(value => finish({ ok: true, value }), () => finish({ ok: false, reason: 'rejected' }));
    });
    if (!result.ok) {
      suppressed = true;
      if (context) context.replySuppressed = true;
      touchTribulationProgress(playerId, 'delivery_skipped');
      console.warn(`[渡劫消息] ${result.reason}：停止等待本次播报，原渡劫继续结算；未释放运行锁。`);
      return false;
    }
    touchTribulationProgress(playerId, 'running');
    return result.value;
  };
  return new Proxy(event, {
    get(target, property) {
      return property === 'reply' ? guardedReply : Reflect.get(target, property, target);
    },
  });
}
