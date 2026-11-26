import { plugin, puppeteer, Show, verc } from '../../api/api.js';
import { channel, existplayer, Read_player, Write_player } from '../../model/xiuxian.js';
import { isSwordMagicActive, runSwordMagicCommand } from '../../model/swordMagic.js';
import { buildSwordMagicPanel } from '../../model/swordMagicPanel.js';
import { deliverMemorial } from '../../model/swordMagicMemorial.js';
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
    const command = /^#抽取(?:异界词条|词条|命格词条)$/.test(e.msg) ? '抽取词条'
      : /^#(?:我的纳戒|纳戒|背包)$/.test(e.msg) ? '背包'
        : /^#(?:我的练气|我)$/.test(e.msg) ? '状态' : e.msg.replace(/^#剑与魔法/, '').trim() || '状态';
    try {
      const response = await withPlayerMutationLock(id, async () => {
        const player = await Read_player(id);
        if (!isSwordMagicActive(player)) {
          if (!player.剑与魔法) return direct ? '这条路线从 #降临 剑与魔法 创建新角色；当前存档沿原路线继续。' : null;
          // 已飞升：只有 #剑与魔法 前缀指令进入档案查询，别名指令交还主线路线。
          if (!direct) return null;
        }
        const requestId = e.message_id != null ? String(e.message_id)
          : e.seq != null && e.time != null ? `${e.group_id || 'private'}:${e.time}:${e.seq}` : '';
        const result = runSwordMagicCommand(player, command, { requestId });
        if (result.changed) await Write_player(id, player);
        return { message: result.message, player };
      });
      if (response === null) return false;
      const gift = await deliverMemorial(id, response.player);
      // 状态/结算：先试图像面板（HTML 模板），渲染不可用时无缝回退纯文本。
      if (command === '状态' || command === '结算') {
        const image = await this.#statusPanel(e, id, response.player);
        if (image) {
          await e.reply(image);
          if (gift) await e.reply(gift);
          return true;
        }
      }
      let reply = response.message;
      if (gift) reply += `\n${gift}`;
      await e.reply(reply);
      return true;
    } catch (error) {
      console.warn(`[剑与魔法] 玩家${id}：${error.message}`);
      await e.reply('本次操作未确认完成，请发送 #剑与魔法 状态 核对行动与物资，再重试。');
      return true;
    }
  }

  /** 状态面板：飞升后的封存档案仍走纯文本；渲染失败一律回退文本，不吞掉玩家查询。 */
  async #statusPanel(e, id, player) {
    const state = player?.剑与魔法;
    if (!state || state.status === 'ascended') return null;
    try {
      const panel = buildSwordMagicPanel(state, { now: Date.now() });
      const safeId = String(id).replace(/[^0-9A-Za-z_-]/g, '') || 'player';
      const renderData = await new Show(e).get_swordMagicPanelData({
        panel,
        saveId: `sword_magic_${safeId}_${state.revision ?? 0}`,
        imgType: 'jpeg',
        quality: 92,
      });
      const image = await puppeteer.screenshot('sword_magic', renderData);
      if (image) return image;
      console.warn(`[剑与魔法] 玩家${id} 状态面板渲染为空，回退文字`);
    } catch (error) {
      console.warn(`[剑与魔法] 玩家${id} 状态面板渲染失败，回退文字：${error.message}`);
    }
    return null;
  }
}
