import { plugin } from '../../api/api.js';
import { channel } from '../../model/xiuxian.js';
import { isTribulationLocked } from '../../model/tribulationLock.js';

export class TribulationGuard extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_TribulationGuard',
      dsc: '渡劫期间玩家操作保护',
      event: 'message',
      priority: 0,
      rule: [{ reg: '^(?:#.*|[123])$', fnc: 'guard' }],
    });
  }

  async guard(e) {
    const rawId = String(e.user_id || '').replace('qg_', '');
    if (!rawId) return false;
    const ids = new Set([rawId]);
    try {
      ids.add(String(await channel(rawId)));
    } catch (_) {
      // The raw id is still a valid fallback for legacy player files.
    }

    let lockedId = null;
    for (const id of ids) {
      if (await isTribulationLocked(id)) {
        lockedId = id;
        break;
      }
    }
    if (!lockedId) return false;

    if (e.msg === '#渡劫状态') {
      return e.reply('【渡劫中】当前玩家锁定中，请等待雷劫结算完成。');
    }

    return e.reply('【渡劫中】天道隔绝外物，当前不能进行其他操作，请等待渡劫结束。');
  }
}
