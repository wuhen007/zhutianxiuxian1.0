import { plugin, verc } from '../../api/api.js';
import { Read_player, Write_player, channel } from '../../model/xiuxian.js';
import {
  SU_LING_DEEP_FAVOR,
  SU_LING_PROTECTOR_FAVOR,
  SU_LING_TEACHING_TOTAL,
  SU_LING_ULTIMATE,
  advanceSuLingTeaching,
  getSuLingData,
  getSuLingRelation,
  getSuLingStoryBeat,
  isFateDivineBody,
} from '../../model/suLing.js';

const TEACHINGS = Object.freeze([
  '苏灵令你观一滴水的万种去向：命运不是一条路，而是所有可能同时存在。',
  '她教你分辨“因”与“果”的重量，不以强弱论先后，只看哪一道念头真正落入现实。',
  '命运轮盘转过一格，你学会看见缠在自身道果上的灾厄之线。',
  '苏灵让你亲手剪断一段虚假的吉兆：能识破好运，才有资格驾驭好运。',
  '她将一道劫气引入你体内，又命你把它沿因果原路送回。',
  '你尝试拨动对手的命数，第一次夺来原本不属于自己的道则加护。',
  '苏灵封住你的修为，只准你凭命线躲过必中的一击。你终于看见“必然”中的裂隙。',
  '她以命运轮盘压下万千未来，你在其中找到唯一不会败亡的结果。',
  '苏灵令你同时承受福祸两种命数。你悟到增益与灾劫本就是可以易主的筹码。',
  '轮盘停止转动，你将自身败亡之果删去，又斩断敌人未来两次出手的可能。命运终章由此完整。',
]);

function shanghaiDateKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export class SuLing extends plugin {
  constructor() {
    super({
      name: 'SuLing',
      dsc: '剧情人物苏灵与命运神道体传承',
      event: 'message',
      priority: 600,
      rule: [
        { reg: '^#苏灵(?:状态|关系|剧情)?$', fnc: 'status' },
        { reg: '^#苏灵交流$', fnc: 'interact' },
        { reg: '^#苏灵请教$', fnc: 'askForGuidance' },
      ],
    });
  }

  async getPlayerContext(e) {
    if (!verc({ e })) return null;
    let userId = e.user_id.toString().replace('qg_', '');
    userId = await channel(userId);
    const player = await Read_player(userId);
    const character = getSuLingData(player);
    if (!character) {
      await e.reply('你尚未遇见苏灵。进行任意秘境探索时，每次移动结算都有概率与她的命线相交。');
      return null;
    }
    return { userId, player, character };
  }

  async status(e) {
    const context = await this.getPlayerContext(e);
    if (!context) return true;
    const { player, character } = context;
    const favor = Math.max(0, Number(character.好感度) || 0);
    const relation = getSuLingRelation(favor);
    const teaching = Math.max(0, Number(character.指点次数) || 0);
    const next = favor < 60 ? 60 : favor < 180 ? 180 : favor < 240 ? 240 : favor < 480 ? 480 : null;
    await e.reply([
      '【剧情人物·苏灵】',
      `关系：${relation.name}（${favor}好感度）`,
      `命运神道体：${isFateDivineBody(player) ? '同源' : '不符，无法接受终极指点'}`,
      `大道指点：${teaching}/${SU_LING_TEACHING_TOTAL}`,
      `终极奥秘：${player.命运终章已领悟 ? `已领悟「${SU_LING_ULTIMATE}」` : favor >= SU_LING_DEEP_FAVOR ? '可发送 #苏灵请教（每日一次）' : `需达到${SU_LING_DEEP_FAVOR}好感度`}`,
      `护道之约：${favor >= SU_LING_PROTECTOR_FAVOR ? '可发送 #请苏灵护道' : `需达到${SU_LING_PROTECTOR_FAVOR}好感度`}`,
      next ? `下一幕剧情：${next}好感度` : '五幕剧情均已解锁',
      '互动：#苏灵交流 / #苏灵请教 / #请苏灵护道 / #抹除至尊印记 苏灵',
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
      await e.reply('今日的命线已经看得足够多了。苏灵让你先去亲历自己的选择（3/3）。');
      return true;
    }

    const oldFavor = Math.max(0, Number(character.好感度) || 0);
    const oldRelation = getSuLingRelation(oldFavor);
    const gain = 5 + Math.floor(Math.random() * 4);
    character.好感度 = oldFavor + gain;
    character.今日交互 = (Number(character.今日交互) || 0) + 1;
    const relation = getSuLingRelation(character.好感度);
    const storyBeat = getSuLingStoryBeat(oldFavor, character.好感度);
    character.关系 = relation.level;
    if (!Array.isArray(character.事件记录)) character.事件记录 = [];
    character.事件记录.push(`命运轮盘前论道，好感度+${gain}`);
    if (storyBeat) character.事件记录.push(storyBeat.replace(/^【[^】]+】/, ''));
    if (character.事件记录.length > 30) character.事件记录.splice(0, character.事件记录.length - 30);
    await Write_player(userId, player);

    await e.reply([
      '苏灵拨动轮盘，让你从一段微小选择中看见数十种未来。她没有替你决定，只问你愿意承担哪一种结果。',
      storyBeat || null,
      `好感度+${gain}（当前${character.好感度}，${relation.name}）`,
      relation.level > oldRelation.level ? `关系提升为「${relation.name}」！` : null,
      `今日交流：${character.今日交互}/3`,
    ].filter(Boolean).join('\n'));
    return true;
  }

  async askForGuidance(e) {
    const context = await this.getPlayerContext(e);
    if (!context) return true;
    const { userId, player } = context;
    const result = advanceSuLingTeaching(player, shanghaiDateKey());
    if (!result.ok) {
      const messages = {
        favor: `你与苏灵的关系尚未达到「命途相知」，还需${result.missing}好感度。`,
        physique: '苏灵看过你的道基后轻轻摇头：此法只可传给命运神道体，否则福祸倒悬，反受其害。',
        daily: `今日已经接受过指点（${result.count}/${SU_LING_TEACHING_TOTAL}），待明日命轮转过一周再来。`,
        learned: `你已掌握「${SU_LING_ULTIMATE}」，无需重复参悟。`,
      };
      await e.reply(messages[result.reason] || '此刻无法接受苏灵指点。');
      return true;
    }

    await Write_player(userId, player);
    await e.reply(result.learned
      ? [
          `【第${result.count}次指点·终极奥秘】`,
          TEACHINGS[result.count - 1],
          `你已领悟「${SU_LING_ULTIMATE}」！`,
          '战斗中：行动时将自身现有负面转给敌人，并夺取敌人现有增益；每场一次免疫致命伤害，同时删除对手接下来两次行动。',
        ].join('\n')
      : [
          `【苏灵指点·${result.count}/${SU_LING_TEACHING_TOTAL}】`,
          TEACHINGS[result.count - 1],
          `距离完整领悟还需${SU_LING_TEACHING_TOTAL - result.count}次指点。`,
        ].join('\n'));
    return true;
  }
}
