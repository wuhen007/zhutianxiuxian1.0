import fs from 'node:fs';
import { plugin } from '../../api/api.js';
import { __PATH, Read_player, Write_player } from '../../model/xiuxian.js';
import { runSwordMagicCommand } from '../../model/swordMagic.js';
import { deliverMemorial } from '../../model/swordMagicMemorial.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { runTaskOnce } from '../../utils/taskGuard.js';

export class SwordMagicTask extends plugin {
  constructor() {
    super({ name: 'SwordMagicTask', dsc: '剑与魔法持续行动结算', event: 'message', rule: [] });
    this.task = [{ cron: '*/30 * * * * *', name: 'SwordMagicTask',
      fnc: () => runTaskOnce('SwordMagicTask', () => this.settleActions()) }];
  }

  async settleActions() {
    const now = Date.now();
    for (const file of fs.readdirSync(__PATH.player_path)) {
      if (!file.endsWith('.json')) continue;
      const id = file.slice(0, -5);
      try {
        // 仅到期行动或待发信物进入锁和正式读取，减少现有角色的无效属性重算。
        const snapshot = JSON.parse(fs.readFileSync(`${__PATH.player_path}/${file}`, 'utf8'));
        const state = snapshot.剑与魔法;
        if (!state) continue;
        const giftPending = Boolean(state.memorial);
        const actionDue = Boolean(state.action) && state.action.endAt <= now;
        if (!giftPending && !actionDue) continue;
        await withPlayerMutationLock(id, async () => {
          const player = await Read_player(id);
          if (!player?.剑与魔法) return;
          if (player.剑与魔法.action && player.剑与魔法.action.endAt <= now) {
            const result = runSwordMagicCommand(player, '状态', { now });
            if (result.changed) await Write_player(id, player);
          }
          // 进程中断导致的未发信物在这里补发；纳戒回执保证不重复。
          if (player.剑与魔法.memorial) await deliverMemorial(id, player);
        });
      } catch (error) {
        console.warn(`[剑与魔法结算] 玩家${id}：${error.message}`);
      }
    }
  }
}
