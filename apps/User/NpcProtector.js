import { plugin, verc } from '../../api/api.js';
import {
  Read_najie,
  Read_player,
  Write_player,
  channel,
  existplayer,
} from '../../model/xiuxian.js';
import {
  NPC_PROTECTORS,
  assignNpcProtector,
  clearProtector,
  eraseSupremeMark as erasePlayerSupremeMark,
  evaluateSupremeMarkErasure,
  formatCooldown,
  getNpcProtectorEligibility,
  getProtectorCooldown,
} from '../../model/npcProtector.js';

export class NpcProtector extends plugin {
  constructor() {
    super({
      name: 'NpcProtector',
      dsc: 'NPC护道人',
      event: 'message',
      priority: 600,
      rule: [
        { reg: '^#请(柳神|狠人|苏灵)护道$', fnc: 'inviteNpcProtector' },
        { reg: '^#我的护道人$', fnc: 'showProtector' },
        { reg: '^#解除护道$', fnc: 'dismissProtector' },
        { reg: '^#抹除至尊印记\\s*(.+)$', fnc: 'eraseSupremeMark' },
      ],
    });
  }

  async getPlayer(e) {
    if (!e.isGroup || !verc({ e })) return null;
    const qq = (await channel(e.user_id.toString().replace('qg_', ''))).toString();
    if (!await existplayer(qq)) return null;
    return { qq, player: await Read_player(qq) };
  }

  async inviteNpcProtector(e) {
    const context = await this.getPlayer(e);
    if (!context) return false;
    const { qq, player } = context;
    const requested = e.msg.includes('苏灵') ? '苏灵' : e.msg.includes('柳神') ? '柳神' : '狠人大帝';
    const current = player.护道人 && player.护道人 !== '无' ? player.护道人 : '';
    if (current === requested) {
      await e.reply(`「${requested}」已经是你的护道人，无需重复立约。`);
      return true;
    }
    if (current && current !== requested) {
      await e.reply(`你已有护道人「${current}」，需先使用#解除护道。`);
      return true;
    }

    const najie = await Read_najie(qq);
    const eligibility = getNpcProtectorEligibility(player, najie, requested);
    if (!eligibility.ok) {
      await e.reply([
        `【${requested}·护道之约】`,
        `邀请条件：${NPC_PROTECTORS[requested].requirement}`,
        `当前进度：${eligibility.progress}`,
        ...(eligibility.missing.length > 0 ? [`尚缺：${eligibility.missing.join('、')}`] : []),
      ].join('\n'));
      return true;
    }

    assignNpcProtector(player, requested);
    if (requested === '狠人大帝') {
      if (!Array.isArray(player.剧情人物)) player.剧情人物 = [];
      if (!player.剧情人物.some(character => character?.狠人大帝)) {
        player.剧情人物.push({
          狠人大帝: true,
          好感度: 480,
          关系: 5,
          事件记录: ['集齐狠人三部传承，获准护道'],
        });
      }
    }
    await Write_player(qq, player);
    await e.reply([
      `【护道之约·${requested}】`,
      requested === '苏灵'
        ? '苏灵将一道命轮印记留在你眉心：“若有必死之劫，我会替你删去那一种未来。”'
        : requested === '柳神'
          ? '柳神留下一枚嫩叶印记：“仙路凶险，危急之时，我自会出手。”'
          : '狠人大帝留下一道青铜面具烙印：“持吾传承者，不容旁人搜魂。”',
      '护道人遭遇截杀时会先行参战，出手后需休养24小时。',
    ].join('\n'));
    return true;
  }

  async showProtector(e) {
    const context = await this.getPlayer(e);
    if (!context) return false;
    const { player } = context;
    const name = player.护道人 || '无';
    if (name === '无') {
      await e.reply('你当前没有护道人。');
      return true;
    }
    const cooldown = getProtectorCooldown(player);
    await e.reply([
      '【我的护道人】',
      `护道人：${name}`,
      `类型：${NPC_PROTECTORS[name] ? '剧情NPC' : '玩家'}`,
      `状态：${cooldown.ready ? '可出手' : `休养中（${formatCooldown(cooldown.remaining)}）`}`,
      `累计出手：${Math.max(0, Math.floor(Number(player.护道人出手次数) || 0))}次`,
    ].join('\n'));
    return true;
  }

  async dismissProtector(e) {
    const context = await this.getPlayer(e);
    if (!context) return false;
    const { qq, player } = context;
    const previous = clearProtector(player);
    await Write_player(qq, player);
    await e.reply(previous === '无' ? '你当前没有护道人。' : `你已解除与「${previous}」的护道关系。`);
    return true;
  }

  async eraseSupremeMark(e) {
    const context = await this.getPlayer(e);
    if (!context) return false;
    const name = (e.msg.match(/^#抹除至尊印记\s*(.+)$/) || [])[1]?.trim();
    if (!name) {
      await e.reply([
        '【抹除至尊印记】',
        '请指定可抹除的护道人，例如：#抹除至尊印记 柳神',
        '可抹除者：盖九幽、莫晓羽、苏灵、武祖叶萧、柳神',
      ].join('\n'));
      return true;
    }
    const { qq, player } = context;
    const eligibility = evaluateSupremeMarkErasure(player, name);
    if (!eligibility.ok) {
      await e.reply([
        `【${name}·抹除印记】`,
        eligibility.reason === 'unknown' ? '此人不具备抹除禁区至尊印记的能力。' : '条件未达成：',
        ...(eligibility.missing || []),
      ].join('\n'));
      return true;
    }
    const before = Math.max(0, Math.floor(Number(player.禁区至尊注视) || 0));
    const result = erasePlayerSupremeMark(player, name);
    if (!result?.ok) return false;
    if (result.alreadyClean) {
      await e.reply(`【${name}·抹除印记】\n你身上并无禁区至尊注视印记，${name}淡然一笑：「小友此身清净，无需我多事。」`);
      return true;
    }
    await Write_player(qq, player);
    await e.reply([
      `【${name}·抹除印记】`,
      `${name}望向你眉心，大道法则流转。`,
      '那道冰冷的禁区至尊注视印记被彻底抹去。',
      `清除注视：${before} → 0`,
    ].join('\n'));
    return true;
  }
}
