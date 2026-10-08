import { plugin } from '../../api/api.js';
import {
  Write_equipment,
  Write_najie,
  Write_player,
  channel,
} from '../../model/xiuxian.js';
import {
  TRIBULATION_LOCK_BUSY,
  getTribulationLockStatus,
  withTribulationLock,
} from '../../model/tribulationLock.js';
import {
  getTribulationCheckpoint,
  recoverTribulationCheckpoint,
} from '../../model/tribulationCheckpoint.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { formatTribulationStatus } from '../../model/tribulationStatus.js';
import { wrapTribulationEvent } from '../../model/tribulationMessages.js';

let startupLogged = false;

export class TribulationGuard extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_TribulationGuard',
      dsc: '渡劫期间玩家操作保护',
      event: 'message',
      priority: 0,
      rule: [{ reg: '^(?:#.*|[123])$', fnc: 'guard' }],
    });
    if (!startupLogged) {
      globalThis.logger?.info?.('[渡劫保护] stuck-fix-v1 已加载：异步队列上下文修复，120秒续期租约，消息等待有界。');
      startupLogged = true;
    }
  }

  async guard(e) {
    const message = String(e.msg || '');
    // The selection completes a promise owned by the active tribulation flow.
    if (/^#复活选择\s*.+$/.test(message)) return false;

    const rawId = String(e.user_id || '').replace('qg_', '');
    if (!rawId) return false;
    e = wrapTribulationEvent(rawId, e);
    const reply = async (...args) => {
      await e.reply(...args);
      // A failed/timed-out notification must still consume a blocked command.
      return true;
    };
    const ids = new Set([rawId]);
    try {
      ids.add(String(await channel(rawId)));
    } catch (_) {
      // The raw id is still a valid fallback for legacy player files.
    }

    let inspectionUnavailable = false;
    for (const id of ids) {
      const lock = await getTribulationLockStatus(id);
      inspectionUnavailable ||= !lock.available;
      if (lock.locked) {
        return reply(formatTribulationStatus(lock, {
          detail: message === '#渡劫状态' || message === '#恢复渡劫',
        }));
      }

      let checkpoint;
      try {
        checkpoint = await getTribulationCheckpoint(id);
      } catch (error) {
        console.error(`Failed to inspect tribulation checkpoint for ${id}:`, error);
        if (error?.code === 'CHECKPOINT_CORRUPT') {
          return reply('【渡劫恢复失败】检查点数据异常，已阻止本次操作，请联系管理员处理。');
        }
        inspectionUnavailable = true;
        continue;
      }
      if (!checkpoint.exists) continue;

      let recovered;
      try {
        // Keep recovery in the same mutation queue as normal writes. The lease
        // is rechecked after waiting; an active operation is never force-unlocked.
        recovered = await withPlayerMutationLock(id, () => withTribulationLock(id, () => recoverTribulationCheckpoint(id, {
          restoreEquipment: equipment => Write_equipment(id, equipment),
          restoreNajie: najie => Write_najie(id, najie, { allowWorldlineUnlock: true }),
          restorePlayer: player => Write_player(id, player, { trackDailyTask: false }),
        }), { kind: '中断渡劫检查点恢复' }));
      } catch (error) {
        console.error(`Failed to recover tribulation checkpoint for ${id}:`, error);
        return reply('【渡劫恢复失败】未能恢复开劫前存档，已阻止本次操作，请稍后重试。');
      }
      if (recovered === TRIBULATION_LOCK_BUSY) {
        return reply('【渡劫中】另一运行实例正在结算或恢复本次渡劫，请稍后重试。');
      }
      if (recovered.recovered) {
        return reply('【渡劫中断已恢复】检测到机器人重启前未结算的渡劫，玩家、装备与纳戒已恢复到开劫前，请重新发送指令。');
      }
    }

    if (message === '#渡劫状态' || message === '#恢复渡劫') {
      return reply(inspectionUnavailable
        ? '【渡劫状态】Redis 暂时不可用，当前无法确认远端渡劫状态。'
        : '【渡劫状态】当前没有进行中的渡劫，也没有待恢复的检查点。');
    }
    return false;
  }
}
