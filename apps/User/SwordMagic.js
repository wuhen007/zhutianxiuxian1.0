import { plugin, verc } from '../../api/api.js';
import { channel, existplayer, Read_player, Write_player } from '../../model/xiuxian.js';
import { isSwordMagicActive, runSwordMagicCommand } from '../../model/swordMagic.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { replyOfficialMessage } from '../../model/officialMessage.js';

export class SwordMagic extends plugin {
  constructor() {
    super({
      name: '剑与魔法', dsc: '艾瑟兰大陆：职业、天赋与计时冒险', event: 'message', priority: 440,
      rule: [{ reg: '^#(?:剑与魔法(?:\\s.*|帮助)?|抽取异界词条|抽取词条|抽取命格词条|我的练气|我|我的纳戒|纳戒|背包)$', fnc: 'handle' }],
    });
  }

  async handle(e) {
    if (!verc({ e })) return false;
    const direct = /^#剑与魔法(?:\s|帮助$|$)/.test(e.msg);
    if (/^#剑与魔法(?:\s+帮助|帮助)\s*$/.test(e.msg)) {
      const result = runSwordMagicCommand(null, '帮助');
      await replyOfficialMessage(e, {
        markdown: `# 剑与魔法 · 冒险手册\n\n${result.message.split('\n').map(line => line.startsWith('#') ? `- \`${line}\`` : line).join('\n\n')}`,
        text: result.message,
        buttons: [[
          { text: '世界观', command: '#剑与魔法 世界观' },
          { text: '我的状态', command: '#剑与魔法 状态' },
          { text: '地图', command: '#剑与魔法 地图' },
        ]],
      });
      return true;
    }
    const id = String(await channel(String(e.user_id).replace('qg_', '')));
    if (!await existplayer(id)) {
      if (!direct) return false;
      await e.reply('先发送 #踏入仙途，再选择 #降临 剑与魔法，成为艾瑟兰的异乡人。');
      return true;
    }
    try {
      const response = await withPlayerMutationLock(id, async () => {
        const player = await Read_player(id);
        if (!isSwordMagicActive(player)) return direct ? '这条路线从 #降临 剑与魔法 创建新角色；当前存档沿原路线继续。' : null;
        const command = /^#抽取(?:异界词条|词条|命格词条)$/.test(e.msg) ? '抽取词条'
          : /^#(?:我的纳戒|纳戒|背包)$/.test(e.msg) ? '背包'
            : /^#(?:我的练气|我)$/.test(e.msg) ? '状态' : e.msg.replace(/^#剑与魔法/, '').trim() || '状态';
        const requestId = e.message_id != null ? String(e.message_id)
          : e.seq != null && e.time != null ? `${e.group_id || 'private'}:${e.time}:${e.seq}` : '';
        const result = runSwordMagicCommand(player, command, { requestId });
        if (result.changed) await Write_player(id, player);
        return result.message;
      });
      if (response === null) return false;
      await e.reply(response);
      return true;
    } catch (error) {
      console.warn(`[剑与魔法] 玩家${id}：${error.message}`);
      await e.reply('本次操作未确认完成，请发送 #剑与魔法 状态 核对行动与物资，再重试。');
      return true;
    }
  }
}
