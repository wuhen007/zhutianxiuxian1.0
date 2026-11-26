import fs from 'fs';
import path from 'path';
import { plugin, verc, data, config } from '../../api/api.js';
import {
  Add_najie_thing,
  Read_equipment,
  Read_player,
  Write_equipment,
  Write_player,
  __PATH,
  channel,
  existplayer,
  foundthing,
  player_efficiency,
} from '../../model/xiuxian.js';
import {
  applyInitialMinggeEffectsRaw,
  createPlayerMingge,
  rollbackInitialMinggeEffects,
} from '../../model/mingge.js';
import { repairAllDestroyedPlanes } from '../Boss/WeimianDestruction.js';
import RealmEvents from '../tasks/RealmEvents.js';
import { runTaskOnce } from '../../utils/taskGuard.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { getActiveZhutianAvatarName } from '../../model/zhutianMirror.js';
import { getSuiyunStage } from '../../model/suiyun.js';
import {
  ascendSuperdimensionalStarRealm,
  canCreateWithSuperdimensionalPower,
  completeShengfaRefinement,
  getSuperdimensionalPower,
  getSuperdimensionalRewriteName,
  getSuperdimensionalRewriteTarget,
  hasShengfaPower,
  SHENGFA_REFINING,
  spendSuperdimensionalPower,
} from '../../model/shengfaFragment.js';

const APTITUDES = ['无化如是', '生而愚痴', '天弃之人', '先天不足', '平庸之资', '超凡资质', '天纵之资', '旷世奇才', '绝世天骄', '万古无双', '无演无尽'];
const ERAS = ['神话时代', '太古时代', '天命时代', '末法时代', '绝灵时代'];

async function withPlayerLocks(playerIds, task) {
  const ids = [...new Set(playerIds.map(String))].sort();
  const acquire = index => index >= ids.length
    ? task()
    : withPlayerMutationLock(ids[index], () => acquire(index + 1));
  return acquire(0);
}

export class Superdimensional extends plugin {
  constructor() {
    super({
      name: '圣法碎片与超维之力',
      dsc: '超脱至宝炼化及超维之力权柄',
      event: 'message',
      priority: 580,
      rule: [
        { reg: '^#超维之力$', fnc: 'showPower' },
        { reg: '^#超维造物\\s+.+$', fnc: 'createItem' },
        { reg: '^#超维修复位面$', fnc: 'repairPlanes' },
        { reg: '^#超维引发大事件$', fnc: 'triggerEvent' },
        { reg: '^#超维改写时代\\s+.+$', fnc: 'rewriteEra' },
        { reg: '^#超维改写命格\\s+.+$', fnc: 'rewriteFate' },
        { reg: '^#超维改写天资\\s+.+$', fnc: 'rewriteAptitude' },
        { reg: '^#超维改写灵根\\s+.+$', fnc: 'rewriteLinggen' },
      ],
    });
    this.task = {
      cron: '15 * * * * ?',
      name: '超脱至宝炼化结算',
      fnc: () => runTaskOnce('ShengfaRefinement', () => this.settleRefinements()),
    };
  }

  async qq(e) {
    return String(await channel(String(e.user_id).replace('qg_', '')));
  }

  async requireHolder(e) {
    if (!verc({ e })) return null;
    const qq = await this.qq(e);
    if (!await existplayer(qq)) return null;
    const player = await Read_player(qq);
    if (!hasShengfaPower(player)) {
      await e.reply('你尚未炼化圣法碎片，无法行使超维权柄。');
      return null;
    }
    return { qq, player };
  }

  async targetQQ(e, selfQQ) {
    return String(await channel(getSuperdimensionalRewriteTarget(e, selfQQ)));
  }

  async spendAndSave(qq, player) {
    if (!spendSuperdimensionalPower(player)) return false;
    await Write_player(qq, player);
    return true;
  }

  async showPower(e) {
    const holder = await this.requireHolder(e);
    if (!holder) return false;
    return e.reply([
      `【超维之力】${getSuperdimensionalPower(holder.player).toFixed(2)}点`,
      '超维星界每现实小时产出0.01点；行使一次权柄消耗5点。',
      '#超维造物 物品名（仅稀有度8以下，每次一件）',
      '#超维修复位面 / #超维引发大事件',
      '#超维改写时代 时代名',
      '#超维改写命格/天资/灵根 名称（可@他人，前后均可）',
    ].join('\n'));
  }

  async createItem(e) {
    const holder = await this.requireHolder(e);
    if (!holder) return false;
    const name = String(e.msg).replace(/^#超维造物\s+/, '').trim();
    const item = await foundthing(name);
    if (!canCreateWithSuperdimensionalPower(item)) return e.reply('只能变化确实存在且稀有度低于8的物品。');
    if (getSuperdimensionalPower(holder.player) < 5) return e.reply('超维之力不足5点。');

    return withPlayerMutationLock(holder.qq, async () => {
      const player = await Read_player(holder.qq);
      if (!spendSuperdimensionalPower(player)) return e.reply('超维之力不足5点。');
      await Add_najie_thing(holder.qq, item.name, item.class, 1);
      await Write_player(holder.qq, player);
      return e.reply(`超维之光重写物质定义，你获得【${item.name}】x1，消耗5点超维之力。`);
    });
  }

  async repairPlanes(e) {
    const holder = await this.requireHolder(e);
    if (!holder) return false;
    if (!await this.spendAndSave(holder.qq, holder.player)) return e.reply('超维之力不足5点。');
    const result = await repairAllDestroyedPlanes();
    return e.reply(`超维之光弥合诸天裂隙，已修复${result.repairedCount}个破碎位面，消耗5点超维之力。`);
  }

  async triggerEvent(e) {
    const holder = await this.requireHolder(e);
    if (!holder) return false;
    if (getSuperdimensionalPower(holder.player) < 5) return e.reply('超维之力不足5点。');
    const settings = config.getConfig('xiuxian', 'xiuxian') || {};
    const current = settings.Era?.current || { index: 0, years: 0, epoch: 1 };
    const result = await RealmEvents.triggerRandomEvent(current.index, current.years, current.epoch, {
      ignoreCooldown: true,
      triggerChance: 1,
      source: 'superdimensional',
      discoveredBy: { qq: holder.qq, name: holder.player.名号, dungeon: '超维权柄' },
    });
    if (!result) return e.reply('当前大事件已达上限，超维之力未消耗。');
    await this.spendAndSave(holder.qq, holder.player);
    await RealmEvents.broadcastEvent(result.message);
    return e.reply(`${result.message}\n\n消耗5点超维之力。`);
  }

  async rewriteEra(e) {
    const holder = await this.requireHolder(e);
    if (!holder) return false;
    const name = String(e.msg).replace(/^#超维改写时代\s+/, '').trim();
    const index = ERAS.indexOf(name);
    if (index < 0) return e.reply(`可改写时代：${ERAS.join('、')}`);
    if (!await this.spendAndSave(holder.qq, holder.player)) return e.reply('超维之力不足5点。');
    const settings = config.getConfig('xiuxian', 'xiuxian') || {};
    settings.Era ||= {};
    settings.Era.current ||= { epoch: 1, totalYears: 0 };
    settings.Era.current.index = index;
    settings.Era.current.years = 0;
    config.setConfig('xiuxian', 'xiuxian', settings);
    return e.reply(`超维之光覆写时代锚点，诸天进入【${name}】，消耗5点超维之力。`);
  }

  async rewriteTarget(e, kind) {
    const holder = await this.requireHolder(e);
    if (!holder) return false;
    const name = getSuperdimensionalRewriteName(e, kind);
    const targetQQ = await this.targetQQ(e, holder.qq);
    if (!await existplayer(targetQQ)) return e.reply('目标尚未踏入修仙界。');
    return withPlayerLocks([holder.qq, targetQQ], async () => {
      const caster = await Read_player(holder.qq);
      const target = targetQQ === holder.qq ? caster : await Read_player(targetQQ);

      if (kind === '灵根') {
        if (getSuiyunStage(target) || getSuiyunStage({ 灵根: { name } })) return e.reply('岁云系列灵根由唯一传承开启与晋升，普通改写保留当前岁云本源。');
        const avatarName = getActiveZhutianAvatarName(target);
        if (avatarName) {
          return e.reply(`目标当前正装载化身【${avatarName}】，请先让其发送 #装载化身 本源，再改写灵根。`);
        }
      }

      if (kind === '天资') {
        if (!APTITUDES.includes(name)) return e.reply(`未知天资：${name}`);
        target.天资等级 = name;
        target.天资评价 = `由超维之光改写为【${name}】`;
      } else if (kind === '灵根') {
        const root = data.talent_list.find(item => item.name === name);
        if (!root) return e.reply(`未知灵根：${name}`);
        if (root.唯一灵根 || root.不可随机获取) return e.reply('岁云一脉由唯一残念开启，并以 #岁云见证 晋升。');
        target.灵根 = { ...root };
        target.生命本源 = 100 + (Number(root.生命本源) || 0);
      } else {
        const fate = data.minggeList.find(item => item.name === name);
        if (!fate) return e.reply(`未知命格：${name}`);
        const oldId = typeof target.命格 === 'string' ? target.命格 : target.命格?.id;
        rollbackInitialMinggeEffects(target, data.minggeList.find(item => item.id === oldId)?.effects);
        target.命格 = createPlayerMingge(fate);
        target.命格.初始效果已应用 = true;
        applyInitialMinggeEffectsRaw(target, fate.effects);
      }

      if (!spendSuperdimensionalPower(caster)) return e.reply('超维之力不足5点。');
      await Write_player(targetQQ, target);
      if (targetQQ !== holder.qq) await Write_player(holder.qq, caster);
      if (kind === '灵根') {
        await Write_equipment(targetQQ, await Read_equipment(targetQQ));
        await player_efficiency(targetQQ);
      }
      return e.reply(`超维之光已将${target.名号 || '目标'}的${kind}改写为【${name}】，消耗5点超维之力。`);
    });
  }

  rewriteFate(e) { return this.rewriteTarget(e, '命格'); }
  rewriteAptitude(e) { return this.rewriteTarget(e, '天资'); }
  rewriteLinggen(e) { return this.rewriteTarget(e, '灵根'); }

  async settleRefinements() {
    const files = fs.readdirSync(__PATH.player_path).filter(file => file.endsWith('.json'));
    for (const file of files) {
      const qq = file.slice(0, -5);
      // 遍历与读档之间存在竞态：轮回/删档会删掉存档，Read_player 会抛 ENOENT。
      // 不拦住的话每 15 秒就会刷一次错误日志，还会中断整轮结算。
      if (!fs.existsSync(path.join(__PATH.player_path, file))) continue;
      try {
        await withPlayerMutationLock(qq, async () => {
          const player = await Read_player(qq);
          const completed = completeShengfaRefinement(player);
          if (!completed.ok) return;

          const world = data.xiaoshijie.find(item => String(item.player_qq) === String(qq));
          if (world) {
            ascendSuperdimensionalStarRealm(world);
            fs.writeFileSync(path.join(data.lib_path, '小世界列表.json'), JSON.stringify(data.xiaoshijie, null, 2));
          }
          await Write_player(qq, player);
          await Write_equipment(qq, await Read_equipment(qq));
          await player_efficiency(qq);
          const actionKey = `xiuxian:player:${qq}:action`;
          const actionRaw = await redis.get(actionKey);
          if (actionRaw && JSON.parse(actionRaw)?.action === SHENGFA_REFINING) await redis.del(actionKey);

          const message = [
            '【超脱至宝·炼化完成】',
            `${player.名号}明悟【星指维宇崩】【击宇碎维】【维宙星灭诀】！`,
            '大道至理、维度真理与万界音声如群臣朝贡般涌入识海。',
            '神魔修炼法与神慧体系解锁，灵根蜕变为【神慧者】，天资化作【无演无尽】。',
            world ? '小世界升华为【超维星界】。' : '待开辟小世界后，它将自动升华为【超维星界】。',
          ].join('\n');
          try {
            const groupId = player.圣法碎片?.群号;
            if (groupId) await Bot.pickGroup(groupId).sendMsg(message);
            else await Bot.pickUser(qq).sendMsg(message);
          } catch (error) {
            console.error(`[圣法碎片] 炼化完成通知失败 player=${qq}`, error?.message);
          }
        });
      } catch (error) {
        if (error?.code !== 'ENOENT') console.error(`[圣法碎片] 玩家${qq}炼化结算失败`, error?.message);
        continue;
      }
    }
    return true;
  }
}
