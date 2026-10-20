import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { plugin, verc, data } from '../../api/api.js';
import {
  Read_player, Write_player, Read_najie, Write_najie, Add_najie_thing,
  channel, existplayer, __PATH, player_efficiency,
} from '../../model/xiuxian.js';
import {
  SUIYUN_BRANCH, SUIYUN_BRANCH_AUTHORITIES, hasSuiyunAuthority, hasSuiyunBranch,
  suiyunAuthorityRemaining, suiyunAuthorityState, startSuiyunAuthority, createSuiyunGenesisItem,
} from '../../model/suiyunAuthority.js';
import { getLifeSourceRepairMaximum } from '../../model/lifeSourceRepair.js';
import { INNATE_TREASURE_CATALOG, formatCooldown } from '../../model/innateTreasure.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { FileRollbackTransaction } from '../SecretPlace/rebirthTransaction.js';

async function withLocks(ids, task) {
  const keys = [...new Set(ids)].sort();
  const next = index => index === keys.length ? task() : withPlayerMutationLock(keys[index], () => next(index + 1));
  return next(0);
}
export class SuiyunAuthority extends plugin {
  constructor() {
    super({
      name: '天阙十三权柄', dsc: '无上天阙枝主动与被动', event: 'message', priority: 568,
      rule: [
        { reg: '^#(?:天阙权柄|无上天阙枝)$', fnc: 'panel' },
        { reg: '^#梦幻(?:\\s+.*)?$', fnc: 'dream' },
        { reg: '^#(?:断崖之剑|岁云降世)$', fnc: 'prepare' },
        { reg: '^#根源波动.*$', fnc: 'originPulse' },
        { reg: '^#祈愿渡劫.*$', fnc: 'wish' },
        { reg: '^#无极悟技(?:\\s+.*)?$', fnc: 'learn' },
        { reg: '^#创世(?:\\s+.*)?$', fnc: 'genesis' },
      ],
    });
  }
  async actor(e) {
    if (!verc({ e })) return '';
    const qq = String(await channel(String(e.user_id).replace('qg_', '')));
    return await existplayer(qq) ? qq : '';
  }
  async target(e, qq) {
    const raw = e.message?.find(item => item.type === 'at' && item.qq !== 'all')?.qq || e.at;
    return raw && raw !== 'all' ? String(await channel(String(raw).replace('qg_', ''))) : qq;
  }
  async run(e, key, task, { cooldown = true, target = false } = {}) {
    const qq = await this.actor(e);
    if (!qq) return false;
    const targetId = target ? await this.target(e, qq) : qq;
    if (!await existplayer(targetId)) return e.reply('目标尚未踏入仙途。');
    const message = await withLocks([qq, targetId], async () => {
      const player = await Read_player(qq);
      if (!hasSuiyunAuthority(player, key)) return `请先装备并执掌【${SUIYUN_BRANCH}】。`;
      const remaining = suiyunAuthorityRemaining(player, key);
      if (cooldown && remaining) return `【${key}】尚需${formatCooldown(remaining)}。`;
      const recipient = targetId === qq ? player : await Read_player(targetId);
      const transaction = new FileRollbackTransaction();
      for (const id of new Set([qq, targetId])) {
        transaction.capture(path.join(__PATH.player_path, `${id}.json`));
        transaction.capture(path.join(__PATH.najie_path, `${id}.json`));
      }
      try {
        const result = await task({ qq, player, targetId, recipient });
        if (!result?.ok) return result?.message || '权柄未显化，请核对输入。';
        if (cooldown) startSuiyunAuthority(player, key, key === '海洋' ? 48 : 24);
        // 借用本枝权柄也只结算一次，独立于其原有主动冷却。
        if (!hasSuiyunBranch(player) && player.岁云梦幻) player.岁云梦幻.used = true;
        await Write_player(qq, player);
        if (targetId !== qq) await Write_player(targetId, recipient);
        transaction.commit();
        return result.message;
      } catch (error) {
        transaction.rollback();
        throw error;
      }
    });
    return e.reply(message);
  }
  async panel(e) {
    const qq = await this.actor(e);
    if (!qq) return false;
    const player = await Read_player(qq);
    return e.reply([
      `【无上天阙枝】${hasSuiyunBranch(player) ? '已执掌' : '未装备'}`,
      ...SUIYUN_BRANCH_AUTHORITIES.map(([name, command, effect]) => `${name}｜${command}\n${effect}`),
    ].join('\n\n'));
  }
  prepare(e) {
    const key = e.msg === '#断崖之剑' ? '大地' : '岁云降世';
    return this.run(e, key, async ({ player }) => {
      const state = suiyunAuthorityState(player);
      const field = key === '大地' ? '断崖之剑待用' : '岁云降世待用';
      if (state[field]) return { message: '该权柄已预备，请先进行下一场战斗。' };
      state[field] = true;
      return { ok: true, message: key === '大地'
        ? '【断崖之剑】固拉多回应大地之声，下一场首击额外3倍威力。'
        : '【岁云降世】下一场前3回合攻防速度+50%，开战获得50%生命护盾，每回合降下9倍攻击月华剑雨。' };
    });
  }
  originPulse(e) {
    return this.run(e, '海洋', async ({ recipient }) => {
      const current = Number(recipient.仙道潜力 || 0);
      if (!Number.isFinite(current) || !Number.isFinite(current * 1.2)) return { message: '目标潜力数值超出当前结算范围。' };
      const gain = Math.round(current * .2 * 1000) / 1000;
      recipient.道伤 = 0;
      recipient.生命本源 = getLifeSourceRepairMaximum(recipient);
      recipient.仙道潜力 = current + gain;
      return { ok: true, message: `【根源波动】盖欧卡唤来本源潮汐，${recipient.名号 || '修士'}道伤消散、本源修复至${recipient.生命本源}，仙道潜力+${gain}（原有20%）。` };
    }, { target: true });
  }
  wish(e) {
    return this.run(e, '七夜的许愿星', async ({ player, recipient, qq }) => {
      if (Number(player.生命本源) <= 500) return { message: '祈愿需消耗500生命本源，并保留正数本源。' };
      if (Number(recipient.基拉祈祈愿?.remaining) > 0) return { message: '目标已有尚未使用的七夜祈愿。' };
      player.生命本源 -= 500;
      recipient.基拉祈祈愿 = { remaining: 1, from: qq, at: Date.now() };
      return { ok: true, message: `【七夜的许愿星】基拉祈回应了你的心愿：消耗500本源，${recipient.名号 || '目标'}下一场渡劫承伤减少50%。` };
    }, { target: true, cooldown: false });
  }
  learn(e) {
    return this.run(e, '无极', async ({ qq, player }) => {
      const name = String(e.msg).replace(/^#无极悟技\s*/, '').trim();
      const item = [...(data.gongfa_list || []), ...(data.timegongfa_list || []), ...(data.dijingList || [])].find(item => item.name === name);
      if (!item) return { message: '用法：#无极悟技 技能名；填写现有功法秘籍名称。' };
      if (player.学习的功法?.includes(name)) return { message: '这一项技能已经学会。' };
      const bag = await Read_najie(qq);
      const scroll = bag.功法?.find(entry => entry.name === name && Number(entry.数量) > 0);
      if (!scroll) return { message: `纳戒中需要一份【${name}】秘籍。` };
      scroll.数量--;
      player.学习的功法 ||= [];
      player.学习的功法.push(name);
      if (await Write_najie(qq, bag) === false) throw new Error('纳戒当前封锁');
      return { ok: true, message: `【无极】道之三龙共鸣，【${name}】已百分百学会；秘籍消耗1份。` };
    }, { cooldown: false }).then(async result => {
      const qq = await this.actor(e);
      if (qq) await player_efficiency(qq);
      return result;
    });
  }
  genesis(e) {
    return this.run(e, '创世', async ({ qq }) => {
      const match = String(e.msg).match(/^#创世\s+(防具|装备|武器|法宝)\s+(.+)$/);
      if (!match) return { message: '用法：#创世 防具/装备/法宝 新名称。' };
      const item = createSuiyunGenesisItem(match[1], match[2], qq);
      if (!item) return { message: '器名需为1～16字。' };
      const costs = match[1] === '防具' ? { 界核: 200 }
        : match[1] === '法宝' ? { 界核: 100, 宇宙核心: 100 } : { 宇宙核心: 200 };
      const bag = await Read_najie(qq);
      for (const [name, amount] of Object.entries(costs)) {
        if (Number(bag.材料?.find(entry => entry.name === name)?.数量 || 0) < amount) return { message: `创世需要${name}×${amount}。` };
      }
      for (const [name, amount] of Object.entries(costs)) bag.材料.find(entry => entry.name === name).数量 -= amount;
      if (await Write_najie(qq, bag) === false) throw new Error('纳戒当前封锁');
      await Add_najie_thing(qq, item, '装备', 1, 6, 1, { idempotencyKey: `suiyun-genesis:${randomUUID()}` });
      return { ok: true, message: `【创世】${item.name}已入纳戒，攻击、防御、生命各+50000%。` };
    }, { cooldown: false });
  }
  dream(e) {
    return this.run(e, '梦幻', async ({ player }) => {
      const input = String(e.msg).replace(/^#梦幻\s*/, '').trim();
      const [name, ...parts] = input.split(/\s+/);
      const requested = parts.join(' ');
      let treasureName = name, key = '', passive = false, command = '';
      const catalog = INNATE_TREASURE_CATALOG[name];
      if (catalog) {
        const ability = (catalog.authorities || []).find(item => item.cooldownKey === requested
          || item.command?.replace(/^#/, '').split(/\s/)[0] === requested);
        const passiveMatch = requested.match(/^被动[:：]?(\d+)$/);
        if (ability) { key = ability.cooldownKey || ability.command.replace(/^#/, '').split(/\s/)[0]; command = ability.command; }
        else if (passiveMatch && catalog.passives[Number(passiveMatch[1]) - 1]) { key = `被动:${Number(passiveMatch[1])}`; passive = true; }
      } else if (name === '大道至宝' && ['生死', '命运', '万法', '世界'].includes(requested)) {
        key = requested;
        command = { 生死: '#改写生死', 命运: '#改写命格 名称', 万法: '#推演终极功法 名称', 世界: '#开辟大道界 名称' }[key];
      } else if (name === '永恒仙图' && requested === '永恒改命') {
        key = '永恒改命'; command = '#永恒改命 记录编号';
      }
      if (!key) return { message: '用法：#梦幻 至宝名 权柄名，或 #梦幻 至宝名 被动1；大道至宝使用“生死/命运/万法/世界”。先天至宝权柄名称见 #至宝图鉴。' };
      if (player.岁云梦幻 && !player.岁云梦幻.used && player.岁云梦幻.expiresAt > Date.now()) return { message: '请先使用已经选定的梦幻权柄。' };
      player.岁云梦幻 = { treasureName, key, passive, command, used: false, token: randomUUID(), expiresAt: Date.now() + 86_400_000 };
      return { ok: true, message: `【梦幻】已借来【${treasureName}·${key}】的一次权柄，24小时内${passive ? '下一场战斗生效' : `发送 ${command || '对应原权柄指令'} 使用`}。` };
    });
  }
}
