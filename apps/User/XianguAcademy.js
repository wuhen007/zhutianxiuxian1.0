import { plugin, verc, data } from '../../api/api.js';
import {
  Read_player,
  Write_player,
  channel,
  existplayer,
} from '../../model/xiuxian.js';
import { getDailyTaskDateKey } from '../../model/dailyTask.js';
import {
  XIANGU_ACADEMY_NAME,
  applyAcademyPromotion,
  createAcademyRecord,
  getAcademyAdmission,
  getAcademyNextRank,
  getAcademyPromotion,
  getAcademyRank,
  getAcademySalary,
  selectAcademyBranch,
} from '../../model/xianguAcademy.js';

function salaryClaimKey(usrQq, now = Date.now()) {
  return `xiuxian:player:${usrQq}:xiangu_academy_salary:${getDailyTaskDateKey(
    now
  )}`;
}

function formatAcademyName(record) {
  return record?.分院
    ? `${record.学院}·${record.分院}`
    : record?.学院 || XIANGU_ACADEMY_NAME;
}

export class XianguAcademy extends plugin {
  constructor() {
    super({
      name: 'XianguAcademy',
      dsc: '仙古今世法学院系统',
      event: 'message',
      priority: 600,
      rule: [
        { reg: '^#天神书院$', fnc: 'showAcademy' },
        { reg: '^#申请入院$', fnc: 'applyAcademy' },
        { reg: '^#我的院籍$', fnc: 'showMyAcademy' },
        { reg: '^#院籍晋升$', fnc: 'promoteAcademy' },
        { reg: '^#选择(仙院|圣院)$', fnc: 'chooseBranch' },
        { reg: '^#领取(?:天神书院|书院)俸禄$', fnc: 'claimSalary' },
      ],
    });
  }

  async resolveContext(e) {
    if (!e || !verc({ e })) return null;
    const usrQq = (
      await channel(e.user_id.toString().replace('qg_', ''))
    ).toString();
    if (!(await existplayer(usrQq))) return null;
    return { usrQq, player: await Read_player(usrQq) };
  }

  async showAcademy(e) {
    const context = await this.resolveContext(e);
    if (!context) return false;
    const { player } = context;
    const record = player.仙古院籍;
    const lines = [
      '【天神书院】',
      '九天十地汇聚英才之地，尊者境修士可申请入院。',
      '',
      record?.学院
        ? `你的身份：${formatAcademyName(record)}${record.身份}`
        : '你的状态：尚未入院',
      '#申请入院',
      '#我的院籍',
      '#院籍晋升',
      '#选择仙院 / #选择圣院',
      '#领取书院俸禄',
    ];
    return e.reply(lines.join('\n'));
  }

  async applyAcademy(e) {
    const context = await this.resolveContext(e);
    if (!context) return false;
    const admission = getAcademyAdmission(context.player);
    if (!admission.ok) return e.reply(admission.message);

    context.player.仙古院籍 = createAcademyRecord();
    await Write_player(context.usrQq, context.player);
    return e.reply(
      [
        '【天神书院·入院】',
        '书院山门开启，大长老法相自九天之上投来目光。',
        `院籍：${XIANGU_ACADEMY_NAME}`,
        '身份：外院弟子',
        '可使用 #选择仙院 或 #选择圣院确定后续修行方向。',
      ].join('\n')
    );
  }

  async showMyAcademy(e) {
    const context = await this.resolveContext(e);
    if (!context) return false;
    const record = context.player.仙古院籍;
    if (!record?.学院)
      return e.reply('你尚无院籍，可在九天十地使用 #申请入院。');

    const rank = getAcademyRank(record);
    const next = getAcademyNextRank(record);
    const realm =
      data.xiangujinshi_list.find(
        (item) =>
          Number(item.level_id) === Number(context.player.xiangulevel_id)
      )?.level || '未知';
    const claimed = Boolean(await redis.get(salaryClaimKey(context.usrQq)));
    return e.reply(
      [
        '【我的院籍】',
        `学院：${record.学院}`,
        `分院：${record.分院 || '尚未选择'}`,
        `身份：${record.身份}`,
        `当前境界：${realm}`,
        `每日俸禄：${(rank?.salary || 0).toLocaleString()}源石`,
        `今日俸禄：${claimed ? '已领取' : '可领取'}`,
        next
          ? `下一身份：${next.name}（${
              next.realmName
            }、${next.cost.toLocaleString()}源石）`
          : '下一身份：已达最高院籍',
      ].join('\n')
    );
  }

  async promoteAcademy(e) {
    const context = await this.resolveContext(e);
    if (!context) return false;
    const record = context.player.仙古院籍;
    if (!record?.学院) return e.reply('你尚未加入天神书院。');

    const promotion = getAcademyPromotion(record, context.player);
    if (!promotion.ok) return e.reply(promotion.message);

    context.player.源石 =
      (Number(context.player.源石) || 0) - promotion.next.cost;
    applyAcademyPromotion(record, promotion.next);
    await Write_player(context.usrQq, context.player);
    return e.reply(
      [
        '【院籍晋升】',
        `你由${promotion.current.name}晋升为${promotion.next.name}。`,
        `消耗：${promotion.next.cost.toLocaleString()}源石`,
        `每日俸禄提升至：${promotion.next.salary.toLocaleString()}源石`,
      ].join('\n')
    );
  }

  async chooseBranch(e) {
    const context = await this.resolveContext(e);
    if (!context) return false;
    const record = context.player.仙古院籍;
    if (!record?.学院) return e.reply('请先使用 #申请入院 加入天神书院。');

    const branch = e.msg.includes('仙院') ? '仙院' : '圣院';
    const result = selectAcademyBranch(record, branch);
    if (!result.ok) return e.reply(result.message);
    await Write_player(context.usrQq, context.player);
    return e.reply(
      [
        `【${branch}·择院】`,
        `你已选择${branch}作为后续修行方向。`,
        branch === '仙院'
          ? '仙院重仙古法，未来可衔接道种与仙气修炼。'
          : '圣院重今世法，未来可衔接极境与以身为种。',
        '当前选择不可重复更改。',
      ].join('\n')
    );
  }

  async claimSalary(e) {
    const context = await this.resolveContext(e);
    if (!context) return false;
    const record = context.player.仙古院籍;
    if (!record?.学院) return e.reply('你尚无天神书院院籍，无法领取俸禄。');

    const salary = getAcademySalary(record);
    if (!salary) return e.reply('院籍身份异常，暂时无法领取俸禄。');
    const key = salaryClaimKey(context.usrQq);
    const reserved = await redis.set(key, record.身份, {
      NX: true,
      EX: 2 * 24 * 60 * 60,
    });
    if (!reserved) return e.reply('今日书院俸禄已经领取，请明日再来。');

    try {
      context.player.源石 = (Number(context.player.源石) || 0) + salary;
      await Write_player(context.usrQq, context.player);
    } catch (error) {
      await redis.del(key);
      throw error;
    }

    return e.reply(
      [
        '【书院俸禄】',
        `院籍：${formatAcademyName(record)}${record.身份}`,
        `领取：${salary.toLocaleString()}源石`,
        `当前源石：${context.player.源石.toLocaleString()}`,
      ].join('\n')
    );
  }
}
