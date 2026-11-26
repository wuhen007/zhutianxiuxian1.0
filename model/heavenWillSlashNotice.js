import { formatHeavenWillSlashImpact } from './strangeSacrifice.js';
import { sendSecretPlaceNotification } from './secretPlaceNotification.js';

// 同一次操作中的装备重算、回血等短时写入合并提示；每次处罚仍由原规则独立结算。
const pending = new Map();

export function queueHeavenWillSlashNotice(playerId, record, levels, event) {
  const id = String(playerId);
  const previous = pending.get(id);
  if (previous) {
    previous.record = {
      ...record,
      before: previous.record.before,
      occurrences: previous.record.occurrences + 1,
    };
    if (event?.reply) previous.event = event;
    return;
  }
  const entry = {
    record: { ...record, occurrences: 1 },
    levels,
    event,
  };
  pending.set(id, entry);
  entry.timer = setTimeout(() => { void flushHeavenWillSlashNotice(id); }, 100);
  entry.timer.unref?.();
}

export async function flushHeavenWillSlashNotice(playerId, event) {
  const id = String(playerId);
  const entry = pending.get(id);
  if (!entry) return false;
  pending.delete(id);
  clearTimeout(entry.timer);
  try {
    const message = formatHeavenWillSlashImpact(entry.record, entry.levels);
    const replyEvent = event?.reply ? event : entry.event;
    if (replyEvent?.reply) {
      const result = await replyEvent.reply(message);
      if (result === false || result?.status === 'failed' || Number(result?.retcode)) {
        throw new Error('斩道提示消息发送失败');
      }
      return true;
    }
    return await sendSecretPlaceNotification({}, id, message);
  } catch (error) {
    // 提示已随玩家存档保存，可通过状态指令查询；消息故障不回滚存档、不重复处罚。
    console.warn(`[天意一刀] 玩家${id}提示发送失败，可使用#天意一刀状态查询：`, error);
    return false;
  }
}
