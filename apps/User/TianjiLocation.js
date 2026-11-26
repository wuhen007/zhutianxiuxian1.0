import { plugin, verc, data } from '../../api/api.js';
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
        { reg: '^#神识共享天骄位置\\s+[^\\s@]+', fnc: 'shareTianjiaoTrace' },
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

    const trace = player.天骄踪迹[tianjiao.名号];
    return e.reply([
      '【天机寻踪·位置已明】',
      `你以 ${cost.toLocaleString('zh-CN')}${costType} 为代价，请动天机老人推演${tianjiao.名号}的踪迹。`,
      `当前位置：${formatTianjiaoTrace(trace)}`,
      '踪迹24小时内有效，抵达后可发送 #讨伐天骄 ' + tianjiao.名号,
      `剩余${costType}：${(Number(player[costType]) || 0).toLocaleString('zh-CN')}`,
    ].join('\n'));
  }

  async shareTianjiaoTrace(e) {
    if (!e.isGroup) return e.reply('修仙游戏请在群聊中游玩');
    if (!verc({ e })) return false;

    const atTarget = e.message?.find(item => item.type === 'at');
    const name = e.msg.match(/^#神识共享天骄位置\s+([^\s@]+)/)?.[1];
    if (!atTarget || !name) return e.reply('用法：#神识共享天骄位置 天骄名 @玩家');

    const usrQQ = await channel(e.user_id.toString().replace('qg_', ''));
    const targetQQ = await channel(atTarget.qq.toString().replace('qg_', ''));
    if (usrQQ === targetQQ) return e.reply('无需向自己共享神识。');
    if (!await existplayer(usrQQ) || !await existplayer(targetQQ)) {
      return e.reply('共享双方都需要先创建角色。');
    }

    const tianjiao = findTianjiaoByName(data.weimiantianjiao_list, name);
    if (!tianjiao) return e.reply(`未找到名为「${name}」的天骄。`);

    const player = await Read_player(usrQQ);
    const trace = getKnownTianjiaoTrace(player, tianjiao);
    if (!trace) return e.reply(`你尚未知晓${tianjiao.名号}的有效踪迹。`);

    const target = await Read_player(targetQQ);
    target.天骄踪迹 ||= {};
    target.天骄踪迹[tianjiao.名号] = {
      ...trace,
      coordinate: { ...trace.coordinate },
      source: `神识共享·${player.名号 || usrQQ}`,
      sharedBy: usrQQ,
      sharedAt: Date.now(),
    };
    await Write_player(targetQQ, target);
    return e.reply(`你已将${tianjiao.名号}的踪迹以神识传给${target.名号 || targetQQ}。`);
  }

}
