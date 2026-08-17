import { plugin, verc, data } from '../../api/api.js';
import { channel } from '../../model/xiuxian.js';
import { withAssociationMutationLock } from '../../utils/playerMutationLock.js';
import {
  DISCIPLE_MANAGE_POSITIONS,
  DISCIPLE_SPECIALTIES,
  assignDisciple,
  ensureSectDisciples,
  formatDisciple,
  getDiscipleCapacity,
  getRecruitCost,
  parseAssignDiscipleCommand,
  parseTrainDiscipleCommand,
  recruitDisciple,
  settleSectOperations,
  trainDisciple,
} from '../../model/sectDisciples.js';

const ROLE_HELP = '宗主、副宗主或长老';

export class SectDisciples extends plugin {
  constructor() {
    super({
      name: 'SectDisciples',
      dsc: '宗门弟子与运营模块',
      event: 'message',
      priority: 601,
      rule: [
        { reg: '^#宗门弟子招募$', fnc: 'recruit' },
        { reg: '^#宗门弟子名册$', fnc: 'list' },
        { reg: '^#培养宗门弟子\\s*\\d+$', fnc: 'train' },
        { reg: '^#任命宗门弟子\\s*\\d+\\s*(采药|炼丹|炼器|阵法|护山|外务)$', fnc: 'assign' },
        { reg: '^#宗门运营$', fnc: 'operate' },
      ],
    });
  }

  async context(e, manage = false) {
    if (!verc({ e })) return null;
    const usrQq = await channel(String(e.user_id).replace('qg_', ''));
    if (!data.existData('player', usrQq)) return null;
    const player = await data.getData('player', usrQq);
    if (!player?.宗门?.宗门名称) {
      await e.reply('你尚未加入宗门。');
      return null;
    }
    const association = await data.getAssociation(player.宗门.宗门名称);
    if (!association || association === 'error') {
      await e.reply('宗门档案不存在，请先发送 #同步信息。');
      return null;
    }
    ensureSectDisciples(association);
    if (manage && !DISCIPLE_MANAGE_POSITIONS.has(player.宗门.职位)) {
      await e.reply(`只有${ROLE_HELP}可以管理宗门弟子。`);
      return null;
    }
    return { usrQq, player, association };
  }

  async save(context) {
    await data.setAssociation(context.association.宗门名称, context.association);
  }

  async mutate(e, action) {
    const context = await this.context(e, true);
    if (!context) return false;
    const associationName = context.association.宗门名称;
    return withAssociationMutationLock(associationName, async () => {
      const association = data.getAssociation(associationName);
      if (!association || association === 'error') {
        await e.reply('宗门档案不存在，请先发送 #同步信息。');
        return false;
      }
      ensureSectDisciples(association);
      return action({ ...context, association });
    });
  }

  async recruit(e) {
    return this.mutate(e, async context => {
      const { association } = context;
      const cost = getRecruitCost(association);
      if (Number(association.灵石池) < cost) {
        return e.reply(`宗门灵石池不足，招募一名弟子需要${cost}灵石。`);
      }
      const result = recruitDisciple(association, { talentList: data.talent_list || [] });
      if (!result.ok) return e.reply(result.message);
      association.灵石池 -= cost;
      await this.save(context);
      return e.reply([
        `招募成功：${formatDisciple(result.disciple)}`,
        `消耗宗门灵石${cost}，当前弟子${association.宗门弟子.length}/${getDiscipleCapacity(association)}人。`,
      ].join('\n'));
    });
  }

  async list(e) {
    const context = await this.context(e);
    if (!context) return false;
    const { association } = context;
    if (!association.宗门弟子.length) return e.reply('宗门弟子名册为空，发送 #宗门弟子招募 招收第一名弟子。');
    return e.reply([
      `【${association.宗门名称}·弟子名册】${association.宗门弟子.length}/${getDiscipleCapacity(association)}`,
      ...association.宗门弟子.map(formatDisciple),
      `仓库：药材${association.宗门仓库.药材}、丹药${association.宗门仓库.丹药}、法器${association.宗门仓库.法器}｜声望${association.宗门声望}`,
    ].join('\n'));
  }

  async train(e) {
    const id = parseTrainDiscipleCommand(e.msg);
    if (!id) return false;
    return this.mutate(e, async context => {
      const result = trainDisciple(context.association, id);
      if (!result.ok) return e.reply(result.message);
      await this.save(context);
      return e.reply(`培养成功：${formatDisciple(result.disciple)}，消耗宗门灵石${result.cost}。`);
    });
  }

  async assign(e) {
    const command = parseAssignDiscipleCommand(e.msg);
    if (!command || !DISCIPLE_SPECIALTIES.includes(command.specialty)) return false;
    return this.mutate(e, async context => {
      const result = assignDisciple(context.association, command.id, command.specialty);
      if (!result.ok) return e.reply(result.message);
      await this.save(context);
      return e.reply(`任命成功：${formatDisciple(result.disciple)}。发送 #宗门运营 查看每日结算。`);
    });
  }

  async operate(e) {
    return this.mutate(e, async context => {
      const result = settleSectOperations(context.association);
      await this.save(context);
      const warehouse = context.association.宗门仓库;
      if (!result.days) {
        return e.reply(`【宗门运营】${result.message}\n当前灵石池：${context.association.灵石池}，声望：${context.association.宗门声望}`);
      }
      if (!result.ok) {
        return e.reply(`【宗门运营】${result.message}\n请先捐献灵石或减少任职弟子。`);
      }
      return e.reply([
        `【宗门运营结算】${result.days}天`,
        `维护消耗：${result.upkeep}灵石`,
        `产出：灵石${result.produced.灵石}、药材${result.produced.药材}、丹药${result.produced.丹药}、法器${result.produced.法器}`,
        `仓库累计：药材${warehouse.药材}、丹药${warehouse.丹药}、法器${warehouse.法器}｜声望${context.association.宗门声望}`,
      ].join('\n'));
    });
  }
}
