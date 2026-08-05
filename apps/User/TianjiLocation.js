import { plugin, verc, data } from '../../api/api.js';
import fs from 'fs';
import path from 'path';
import {
  existplayer,
  Read_player,
  Write_player,
  channel,
} from '../../model/xiuxian.js';
import {
  createTianjiaoTrace,
  formatTianjiaoTrace,
  getKnownTianjiaoTrace,
} from '../../model/tianjiaoGrowth.js';
import {
  findTianjiaoByName,
  parseTianjiCommand,
} from '../../model/tianjiSearch.js';

const TIANJIAO_COSTS = Object.freeze({
  灵石: 3_000_000_000,
  源石: 30_000_000,
});

export class TianjiLocation extends plugin {
  constructor() {
    super({
      name: 'TianjiLocation',
      dsc: '天机寻踪',
      event: 'message',
      priority: 615,
      rule: [
        { reg: '^#打听天机\\s+[^\\s]+位置', fnc: 'searchTianjiao' },
      ],
    });
  }

  async searchTianjiao(e) {
    if (!e.isGroup) return e.reply('修仙游戏请在群聊中游玩');
    if (!verc({ e })) return false;

    const usrQQ = await channel(e.user_id.toString().replace('qg_', ''));
    if (!await existplayer(usrQQ)) return e.reply('玩家不存在，请先创建角色');

    const player = await Read_player(usrQQ);
    const request = parseTianjiCommand(e.msg);
    if (!request || request.type !== 'tianjiao' || !request.name) {
      return e.reply('用法：#打听天机 天骄名位置 [灵石/源石]');
    }

    const tianjiao = findTianjiaoByName(data.weimiantianjiao_list, request.name);
    if (!tianjiao) {
      return e.reply(`未找到名为「${request.name}」的天骄。可先查看 #天骄列表 确认名号。`);
    }

    const costType = /灵石/.test(e.msg) ? '灵石' : '源石';
    const cost = TIANJIAO_COSTS[costType];
    if (!cost) return e.reply('代价只能选择：灵石 或 源石。');

    if ((Number(player[costType]) || 0) < cost) {
      return e.reply([
        '【天机寻踪·代价不足】',
        `打听${tianjiao.名号}的位置需要 ${cost.toLocaleString('zh-CN')}${costType}。`,
        `你当前拥有 ${(Number(player[costType]) || 0).toLocaleString('zh-CN')}${costType}。`,
      ].join('\n'));
    }

    const known = getKnownTianjiaoTrace(player, tianjiao);
    if (known) {
      return e.reply([
        '【天机寻踪·踪迹未变】',
        `你已知晓${tianjiao.名号}的当前位置：${formatTianjiaoTrace(known)}`,
        `踪迹有效期至 ${new Date(Number(known.expiresAt)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
      ].join('\n'));
    }

    player[costType] -= cost;
    player.天骄踪迹 ||= {};
    player.天骄踪迹[tianjiao.名号] = createTianjiaoTrace(tianjiao, {
      source: '天机寻踪',
      now: Date.now(),
    });
    await Write_player(usrQQ, player);
    this.persistTianjiaoTrace(tianjiao);

    const trace = player.天骄踪迹[tianjiao.名号];
    return e.reply([
      '【天机寻踪·位置已明】',
      `你以 ${cost.toLocaleString('zh-CN')}${costType} 为代价，请动天机老人推演${tianjiao.名号}的踪迹。`,
      `当前位置：${formatTianjiaoTrace(trace)}`,
      '踪迹24小时内有效，抵达后可发送 #讨伐天骄 ' + tianjiao.名号,
      `剩余${costType}：${(Number(player[costType]) || 0).toLocaleString('zh-CN')}`,
    ].join('\n'));
  }

  persistTianjiaoTrace(tianjiao) {
    try {
      const listPath = path.join(data.filePathMap.lib, '位面boss列表.json');
      const list = JSON.parse(fs.readFileSync(listPath, 'utf8'));
      const index = list.findIndex(item => item.名号 === tianjiao.名号);
      if (index >= 0) {
        list[index] = { ...list[index], 公开踪迹: tianjiao.公开踪迹 };
        fs.writeFileSync(listPath, JSON.stringify(list, null, 2), 'utf8');
      }
    } catch (error) {
      console.error('[天机寻踪] 保存天骄踪迹失败:', error);
    }
  }


}
