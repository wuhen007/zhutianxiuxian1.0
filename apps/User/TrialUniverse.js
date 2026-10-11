import { plugin, puppeteer, verc } from '../../api/api.js';
import { AppName } from '../../app.config.js';
import { channel, existplayer, Read_player, Write_player } from '../../model/xiuxian.js';
import {
  formatTrialStatus, isTrialUniverseActive, runTrialCommand, TRIAL_HELP,
} from '../../model/trialUniverse.js';
import { getTrialHelpData } from '../../model/trialUniverseHelp.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';

export class TrialUniverse extends plugin {
  constructor() {
    super({
      name: '试炼宇宙',
      dsc: '诸界死亡试炼、任务结算与无境成神',
      event: 'message',
      priority: 450,
      rule: [{ reg: '^#(?:试炼宇宙(?:\\s.*|帮助.*)?|我的练气|我)$', fnc: 'handle' }],
    });
  }

  async handle(e) {
    if (/^#试炼宇宙\s*帮助/.test(e.msg)) {
      const help = e.msg.match(/^#试炼宇宙\s*帮助(?:\s+([123]))?\s*$/);
      if (!help) {
        await e.reply('用法：#试炼宇宙 帮助 [1/2/3]，或 #试炼宇宙帮助 [1/2/3]。');
        return true;
      }
      return this.help(e, Number(help[1] || 1));
    }
    if (!verc({ e })) return false;
    const profileQuery = /^#(?:我的练气|我)$/.test(e.msg);
    const userId = String(await channel(String(e.user_id).replace('qg_', '')));
    if (!(await existplayer(userId))) {
      if (profileQuery) return false;
      await e.reply('请先发送 #踏入仙途，再发送 #降临 试炼宇宙 选择降临地。');
      return true;
    }
    try {
      const response = await withPlayerMutationLock(userId, async () => {
        const player = await Read_player(userId);
        if (profileQuery && !isTrialUniverseActive(player)) return null;
        const command = profileQuery ? '状态' : e.msg.replace(/^#试炼宇宙/, '').trim() || '状态';
        // 旧路线行动必须先结算，避免迟到任务覆盖新降临记录。
        if (/^入界(?:\s|$)/.test(command)
          && await redis.get(`xiuxian:player:${userId}:action`)) {
          return '原路线尚有行动记录，请先完成其结算，再选择试炼宇宙。';
        }
        const requestId = e.message_id != null ? String(e.message_id)
          : e.seq != null && e.time != null ? `${e.group_id || 'private'}:${e.time}:${e.seq}` : '';
        const result = runTrialCommand(player, command, { requestId });
        if (result.changed) await Write_player(userId, player);
        return command === '状态' && result.ok
          ? formatTrialStatus(player.试炼宇宙) : result.message;
      });
      if (response === null) return false;
      await e.reply(response);
      return true;
    } catch (error) {
      console.warn(`[试炼宇宙] 玩家 ${userId}: ${error.message}`);
      await e.reply('本次操作未确认完成，请发送 #试炼宇宙 状态 核对记录后重试；已保存的行动将沿用原结算。');
      return true;
    }
  }

  async help(e, themeIndex = 1) {
    let image;
    try {
      const data = getTrialHelpData(themeIndex);
      const name = `trial_help_${data.theme.id}`;
      image = await puppeteer.screenshot(name, {
        ...data,
        saveId: name,
        tplFile: `./plugins/${AppName}/resources/html/trial-help/${data.theme.id}.html`,
        pluResPath: `${process.cwd().replace(/\\/g, '/')}/plugins/${AppName}/resources/`,
      });
    } catch (error) {
      console.warn(`[试炼宇宙] 帮助图片渲染失败：${error.message}`);
    }
    await e.reply(image || `帮助图片暂未生成，先查看文字说明：\n${TRIAL_HELP}`);
    return true;
  }
}
