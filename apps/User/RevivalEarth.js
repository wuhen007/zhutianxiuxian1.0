import { plugin, verc } from '../../api/api.js';
import {
  channel, existplayer, Read_player, Write_player, Read_equipment, Write_equipment,
} from '../../model/xiuxian.js';
import {
  formatRevivalStatus, isRevivalEarthActive, runRevivalCommand,
} from '../../model/revivalEarth.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';

export class RevivalEarth extends plugin {
  constructor() {
    super({
      name: '复活地球',
      dsc: '原著独立境界、塔监狱与死亡重修',
      event: 'message',
      priority: 450,
      rule: [
        { reg: '^#(?:复活地球(?:\\s.*)?|复活全人类|我的练气|我)$', fnc: 'handle' },
      ],
    });
  }

  async handle(e) {
    if (!verc({ e })) return false;
    const userId = String(await channel(String(e.user_id).replace('qg_', '')));
    if (!(await existplayer(userId))) {
      if (/^#(?:我的练气|我)$/.test(e.msg)) return false;
      await e.reply('请先 #踏入仙途 创建凡人角色，再选择复活地球开局。');
      return true;
    }
    const profileQuery = /^#(?:我的练气|我)$/.test(e.msg);
    try {
      const response = await withPlayerMutationLock(userId, async () => {
        let player = await Read_player(userId);
        if (profileQuery && !isRevivalEarthActive(player)) return null;
        const command = profileQuery || e.msg === '#复活全人类'
          ? '状态' : e.msg.replace(/^#复活地球/, '').trim() || '状态';
        // 原路线存在待结算行动时，先完成原结算再选开局，防止晚到的旧任务覆盖存档。
        if (/^入界(?:\s|$)/.test(command)
          && await redis.get(`xiuxian:player:${userId}:action`)) {
          return '原路线尚有行动记录，请先完成其结算，再选择复活地球。';
        }
        const requestId = e.message_id != null ? String(e.message_id)
          : e.seq != null && e.time != null ? `${e.group_id || 'private'}:${e.time}:${e.seq}` : '';
        const result = runRevivalCommand(player, command, { requestId });
        if (result.changed) await Write_player(userId, player);
        // 一次接引、可重试的派生属性重算；先保存接引结果，失败后由状态命令补齐。
        if (player.复活地球?.needsImmortalSync) {
          try {
            const equipment = await Read_equipment(userId);
            await Write_equipment(userId, equipment);
            player = await Read_player(userId);
            player.当前血量 = player.血量上限;
            player.复活地球.needsImmortalSync = false;
            player.复活地球.revision++;
            await Write_player(userId, player);
          } catch (error) {
            console.warn(`[复活地球] 仙界属性同步待重试 ${userId}: ${error.message}`);
            return '离界记录已保存，仙界属性同步待重试。请再次发送 #复活地球 状态。';
          }
        }
        return command === '状态' && result.ok
          ? formatRevivalStatus(player.复活地球) : result.message;
      });
      if (response === null) return false;
      await e.reply(response);
      return true;
    } catch (error) {
      console.warn(`[复活地球] 玩家 ${userId}: ${error.message}`);
      await e.reply('本次操作未确认完成，请发送 #复活地球 状态 核对记录后重试；已保存的行动将沿用原结算。');
      return true;
    }
  }
}
