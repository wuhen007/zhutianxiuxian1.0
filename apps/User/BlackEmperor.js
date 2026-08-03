import { plugin, verc } from '../../api/api.js';
import {
  Add_najie_thing,
  Add_职业经验,
  Read_player,
  Write_player,
  channel,
} from '../../model/xiuxian.js';
import {
  BLACK_EMPEROR_FORMATIONS,
  BLACK_EMPEROR_TEACHING_FAVOR,
  getBlackEmperorData,
  getBlackEmperorRelation,
} from '../../model/blackEmperor.js';
import { PLACE_LOCATION_MAP, SPECIAL_LOCATIONS, hasCoordinate } from '../../model/weimianTravel.js';

function shanghaiDateKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function parseFormationRequest(content) {
  const formation = BLACK_EMPEROR_FORMATIONS.find(item =>
    content === item.name || content.startsWith(`${item.name} `)
  );
  return {
    formation,
    target: formation ? content.slice(formation.name.length).trim() : '',
  };
}

export class BlackEmperor extends plugin {
  constructor() {
    super({
      name: 'BlackEmperor',
      dsc: '剧情人物黑皇与阵道传承',
      event: 'message',
      priority: 600,
      rule: [
        { reg: '^#黑皇(?:状态|关系)?$', fnc: 'blackEmperorStatus' },
        { reg: '^#黑皇(?:交流|请教阵道)$', fnc: 'blackEmperorInteraction' },
        { reg: '^#黑皇传授阵道$', fnc: 'learnFormationDao' },
        { reg: '^#黑皇阵法$', fnc: 'formationList' },
        { reg: '^#请黑皇刻阵\\s+.+$', fnc: 'engraveFormation' },
      ],
    });
  }

  async getEmperorContext(e) {
    if (!verc({ e })) return null;
    let userId = e.user_id.toString().replace('qg_', '');
    userId = await channel(userId);
    const player = await Read_player(userId);
    const character = getBlackEmperorData(player);
    if (!character) {
      await e.reply('你尚未遇见黑皇。通关任意位面的副本，都有概率撞见它。');
      return null;
    }
    return { userId, player, character };
  }

  async blackEmperorStatus(e) {
    const context = await this.getEmperorContext(e);
    if (!context) return true;
    const { player, character } = context;
    const favor = Number(character.好感度) || 0;
    const relation = getBlackEmperorRelation(favor);
    const learned = Boolean(player.黑皇阵道传承);
    const unlocked = BLACK_EMPEROR_FORMATIONS.filter(item => favor >= item.favor).map(item => item.name);
    const next = BLACK_EMPEROR_FORMATIONS.find(item => favor < item.favor);
    await e.reply([
      '【剧情人物·黑皇】',
      `关系：${relation.name}（${favor}好感度）`,
      `阵道传承：${learned ? '已获传承' : favor >= BLACK_EMPEROR_TEACHING_FAVOR ? '可发送 #黑皇传授阵道' : `尚需${BLACK_EMPEROR_TEACHING_FAVOR - favor}好感度`}`,
      `已解锁阵法：${unlocked.length ? unlocked.join('、') : '暂无'}`,
      `待用阵纹：${player.黑皇待用阵纹 || '无'}`,
      next ? `下一阵法：${next.name}（${next.favor}好感度）` : '全部阵法均已解锁',
    ].join('\n'));
    return true;
  }

  async blackEmperorInteraction(e) {
    const context = await this.getEmperorContext(e);
    if (!context) return true;
    const { userId, player, character } = context;
    const dateKey = shanghaiDateKey();
    if (character.交互日期 !== dateKey) {
      character.交互日期 = dateKey;
      character.今日交互 = 0;
    }
    if ((Number(character.今日交互) || 0) >= 3) {
      await e.reply('黑皇已经不耐烦地趴下了。今日交流次数已用完（3/3）。');
      return true;
    }

    const oldRelation = getBlackEmperorRelation(character.好感度);
    const favorGain = 5 + Math.floor(Math.random() * 5);
    character.好感度 = (Number(character.好感度) || 0) + favorGain;
    character.今日交互 = (Number(character.今日交互) || 0) + 1;
    const relation = getBlackEmperorRelation(character.好感度);
    character.关系 = relation.level;
    if (!Array.isArray(character.事件记录)) character.事件记录 = [];
    character.事件记录.push(`阵道交流，好感度+${favorGain}`);
    if (character.事件记录.length > 20) character.事件记录.shift();
    await Write_player(userId, player);

    const isAsking = e.msg.startsWith('#黑皇请教阵道');
    let exp = 0;
    if (isAsking && player.occupation === '阵法师') {
      exp = 250;
      await Add_职业经验(userId, exp);
    }
    await e.reply([
      isAsking
        ? '黑皇以爪尖划出数道繁复纹路，又在最关键的一笔前停下，逼你自己推演。'
        : '你陪黑皇研究了一处残阵。它嘴上嫌弃你的眼力，尾巴却颇为得意地摇了两下。',
      `好感度+${favorGain}（当前${character.好感度}，${relation.name}）`,
      exp ? `阵法师职业经验+${exp}` : null,
      relation.level > oldRelation.level ? `与黑皇的关系提升为「${relation.name}」！` : null,
      `今日交流：${character.今日交互}/3`,
    ].filter(Boolean).join('\n'));
    return true;
  }

  async learnFormationDao(e) {
    const context = await this.getEmperorContext(e);
    if (!context) return true;
    const { userId, player, character } = context;
    const favor = Number(character.好感度) || 0;
    if (favor < BLACK_EMPEROR_TEACHING_FAVOR) {
      await e.reply(`黑皇暂时不肯传你阵道，还需${BLACK_EMPEROR_TEACHING_FAVOR - favor}好感度。`);
      return true;
    }
    if (player.黑皇阵道传承) {
      await e.reply(player.occupation === '阵法师'
        ? '你已得黑皇阵道传承，发送 #黑皇阵法 查看可刻阵纹。'
        : '你已得阵道传承与转职凭证，可发送 #转职阵法师。');
      return true;
    }

    player.黑皇阵道传承 = true;
    character.事件记录 = Array.isArray(character.事件记录) ? character.事件记录 : [];
    character.事件记录.push('获授阵道基础传承');
    await Write_player(userId, player);
    if (player.occupation !== '阵法师') {
      await Add_najie_thing(userId, '阵法师转职凭证', '道具', 1);
    }
    await e.reply([
      '【黑皇传道·阵纹入门】',
      '黑皇将一角残阵烙入你的识海，繁复道纹层层展开。',
      player.occupation === '阵法师'
        ? '你已是阵法师，自此可向黑皇请教阵道。'
        : '获得「阵法师转职凭证」x1，可发送 #转职阵法师。',
      '发送 #黑皇阵法 查看阵图。',
    ].join('\n'));
    return true;
  }

  async formationList(e) {
    const context = await this.getEmperorContext(e);
    if (!context) return true;
    const favor = Number(context.character.好感度) || 0;
    const lines = BLACK_EMPEROR_FORMATIONS.map(item =>
      `${favor >= item.favor ? '已解锁' : `${item.favor}好感`}｜${item.name}｜${item.cost.toLocaleString()}灵石\n${item.description}`
    );
    await e.reply([
      '【黑皇阵图】',
      ...lines,
      '战斗阵：#请黑皇刻阵 阵法名',
      '传送阵：#请黑皇刻阵 位面传送阵 目标位面',
    ].join('\n'));
    return true;
  }

  async engraveFormation(e) {
    const context = await this.getEmperorContext(e);
    if (!context) return true;
    const { userId, player, character } = context;
    const content = e.msg.replace(/^#请黑皇刻阵\s+/, '').trim();
    const { formation, target } = parseFormationRequest(content);
    if (!formation) {
      await e.reply(`黑皇没听说过「${content}」。发送 #黑皇阵法 查看可用阵图。`);
      return true;
    }
    const name = formation.name;
    const favor = Number(character.好感度) || 0;
    if (favor < formation.favor) {
      await e.reply(`刻画「${name}」需要${formation.favor}好感度，当前${favor}。`);
      return true;
    }
    if (formation.type === 'training' && player.occupation !== '阵法师') {
      await e.reply('聚灵道阵需由阵法师亲自主持。请先获得传承并转职为阵法师。');
      return true;
    }
    if (formation.type === 'battle' && player.黑皇待用阵纹) {
      const useAt = player.黑皇待用阵纹 === '欺天阵纹' ? '下次渡劫' : '下次副本';
      await e.reply(`已有待用阵纹「${player.黑皇待用阵纹}」，请在${useAt}使用后再刻。`);
      return true;
    }
    if (formation.type.startsWith('travel')) {
      if (!target) {
        await e.reply(`请指定目标位面，例如：#请黑皇刻阵 ${name} 遮天位面`);
        return true;
      }
      if (!Object.hasOwn(PLACE_LOCATION_MAP, target)) {
        await e.reply(`不存在位面「${target}」。可选：${Object.keys(PLACE_LOCATION_MAP).join('、')}`);
        return true;
      }
      if (SPECIAL_LOCATIONS.includes(target)) {
        await e.reply(`「${target}」的时空法则无法被传送阵稳定锚定，只能凭修为横渡。`);
        return true;
      }
      if (!hasCoordinate(player, target)) {
        await e.reply(`你尚未记住「${target}」的位面坐标，黑皇也无法凭空锚定彼岸。`);
        return true;
      }
    }
    if ((Number(player.灵石) || 0) < formation.cost) {
      await e.reply(`黑皇开价${formation.cost.toLocaleString()}灵石，你的灵石不够。`);
      return true;
    }

    player.灵石 = Number(player.灵石) - formation.cost;
    if (formation.type === 'battle') player.黑皇待用阵纹 = formation.name;
    if (formation.type.startsWith('travel')) {
      if (!Array.isArray(player.传送阵坐标)) player.传送阵坐标 = [];
      if (!player.传送阵坐标.includes(target)) player.传送阵坐标.push(target);
    }
    if (formation.type === 'travel') player.位面传送次数 = (Number(player.位面传送次数) || 0) + formation.uses;
    if (formation.type === 'travel-high') player.高级传送次数 = (Number(player.高级传送次数) || 0) + formation.uses;
    character.事件记录 = Array.isArray(character.事件记录) ? character.事件记录 : [];
    character.事件记录.push(`请黑皇刻画${formation.name}`);
    if (character.事件记录.length > 20) character.事件记录.shift();
    await Write_player(userId, player);
    if (formation.type === 'training') await Add_职业经验(userId, 1000);

    const effect = name === '欺天阵纹'
      ? '阵纹已封存，将在下次渡劫首次落劫时尝试欺瞒天机。'
      : formation.type === 'battle'
      ? '阵纹已封存，将在下次副本战斗自动激活。'
      : formation.type === 'training'
        ? '聚灵阵运转，阵法师职业经验+1000。'
        : `${formation.name}次数+${formation.uses}，彼岸已锚定「${target}」。发送 #穿梭${target} 即可启程。`;
    await e.reply([
      `【黑皇刻阵·${formation.name}】`,
      `灵石-${formation.cost.toLocaleString()}`,
      effect,
    ].join('\n'));
    return true;
  }
}
