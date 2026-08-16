import { plugin, verc } from '../../api/api.js';
import { Read_player, Write_player, channel } from '../../model/xiuxian.js';
import {
  RUTHLESS_PROTECTOR_FAVOR,
  RUTHLESS_TEACHINGS,
  addRuthlessFavor,
  getRuthlessData,
  getRuthlessRelation,
  teachRuthlessTechnique,
} from '../../model/ruthlessEmperor.js';

const INTERACTIONS = Object.freeze([
  '青铜仙殿寂静无声，狠人大帝让你观一朵仙葩生灭，从万化归一中体悟自己的道。',
  '她立于时间长河畔，与你谈起修行路上的失去。没有安慰，只有一句“向前走”。',
  '漫天飞仙光雨落下，她以一缕神念替你重演方才的战斗，指出那唯一的破局之机。',
  '狠人大帝没有开口，只将青铜鬼面放在石案上。你在沉默中读懂了某种跨越万古的等待。',
]);

function shanghaiDateKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export class RuthlessEmperor extends plugin {
  constructor() {
    super({
      name: 'RuthlessEmperor',
      dsc: '剧情人物狠人大帝与传承',
      event: 'message',
      priority: 600,
      rule: [
        { reg: '^#狠人(?:状态|关系|剧情)?$', fnc: 'status' },
        { reg: '^#狠人交流$', fnc: 'interact' },
        { reg: '^#狠人请教.*$', fnc: 'askForGuidance' },
      ],
    });
  }

  async getPlayerContext(e) {
    if (!verc({ e })) return null;
    let userId = e.user_id.toString().replace('qg_', '');
    userId = await channel(userId);
    const player = await Read_player(userId);
    const character = getRuthlessData(player);
    if (!character) {
      await e.reply('你尚未在时间长河中见到狠人大帝。那场宿命之会，只会降临在副本结算时屹立全服战力第一的人身上。');
      return null;
    }
    return { userId, player, character };
  }

  async status(e) {
    const context = await this.getPlayerContext(e);
    if (!context) return true;
    const { player, character } = context;
    const favor = Math.max(0, Number(character.好感度) || 0);
    const relation = getRuthlessRelation(favor);
    const learned = new Set(Array.isArray(player.学习的功法) ? player.学习的功法 : []);
    const available = RUTHLESS_TEACHINGS.filter(name => !learned.has(name));
    await e.reply([
      '【剧情人物·狠人大帝】',
      `关系：${relation.name}（${favor}好感度）`,
      `可请教：${available.length ? available.join('、') : '传承均已习得'}`,
      '万化仙诀：需先将万化圣诀熟练度修至1000（圆满）',
      `护道之约：${favor >= RUTHLESS_PROTECTOR_FAVOR ? '可发送#请狠人护道' : `还需${RUTHLESS_PROTECTOR_FAVOR - favor}好感度`}`,
      '互动：#狠人交流 / #狠人请教 功法名 / #请狠人护道',
    ].join('\n'));
    return true;
  }

  async interact(e) {
    const context = await this.getPlayerContext(e);
    if (!context) return true;
    const { userId, player, character } = context;
    const dateKey = shanghaiDateKey();
    if (character.交互日期 !== dateKey) {
      character.交互日期 = dateKey;
      character.今日交互 = 0;
    }
    if ((Number(character.今日交互) || 0) >= 3) {
      await e.reply('今日论道已满3次。狠人大帝让你先去红尘中印证自己的路。');
      return true;
    }

    const gain = 5 + Math.floor(Math.random() * 4);
    const oldRelation = getRuthlessRelation(character.好感度);
    const result = addRuthlessFavor(player, gain);
    character.今日交互 = (Number(character.今日交互) || 0) + 1;
    await Write_player(userId, player);
    const interaction = INTERACTIONS[Math.floor(Math.random() * INTERACTIONS.length)];
    await e.reply([
      interaction,
      `好感度+${gain}（当前${result.character.好感度}，${result.relation.name}）`,
      result.relation.level > oldRelation.level ? `关系提升为「${result.relation.name}」！` : null,
      `今日交流：${character.今日交互}/3`,
    ].filter(Boolean).join('\n'));
    return true;
  }

  async askForGuidance(e) {
    const context = await this.getPlayerContext(e);
    if (!context) return true;
    const { userId, player } = context;
    const requested = String(e.msg || '').replace(/^#狠人请教\s*/, '').trim();
    if (!requested) {
      await e.reply(`可请教：${RUTHLESS_TEACHINGS.join('、')}\n示例：#狠人请教 飞仙诀`);
      return true;
    }

    const result = teachRuthlessTechnique(player, requested);
    if (!result.ok) {
      const messages = {
        unknown: `狠人大帝并未应下这门传承。可请教：${RUTHLESS_TEACHINGS.join('、')}`,
        learned: `你已经学会「${result.name}」，无需重复请教。`,
        prerequisite: '欲修万化仙诀，需先学会万化圣诀。',
        proficiency: `狠人大帝轻轻摇头：“圣诀尚未圆满，何谈化圣为仙。”\n万化圣诀熟练度：${result.proficiency}/${result.required}`,
      };
      await e.reply(messages[result.reason] || '此刻无法接受狠人大帝指点。');
      return true;
    }

    await Write_player(userId, player);
    await e.reply(result.name === '万化仙诀'
      ? '万化圣诀运转至极，漫天道则在你掌中由圣化仙。狠人大帝一指点落，你已悟得进阶传承「万化仙诀」！'
      : `狠人大帝于飞仙光雨中演化大道，你已习得「${result.name}」！`);
    return true;
  }
}
