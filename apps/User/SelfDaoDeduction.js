import fs from 'node:fs';

import { config, data, plugin } from '../../api/api.js';
import {
  Read_player,
  Write_player,
  __PATH,
  bigNumberTransform,
  channel,
  existplayer,
  zd_battle,
} from '../../model/xiuxian.js';
import { damagePlanes, PLANE_DESTRUCTION_SOURCES } from '../../model/planeDestruction.js';
import {
  SELF_DAO_COSTS,
  SELF_DAO_PLANE_TARGETS,
  SELF_DAO_RECOVERY_MS,
  completeCorpseEmperorRecovery,
  consumeSelfDaoDeduction,
  ensureSelfDaoDeduction,
  getSelfDaoDeductionGate,
  promoteSelfDaoToImmortalEmperor,
  setCultivationSystemRealms,
  startCorpseEmperorRecovery,
} from '../../model/selfDaoDeduction.js';
import { buildTimeRiverAdversary, ensureTimeRiverSkills } from '../../model/timeRiverAdversary.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';

const ACTION_NAME = '身灭道消·真血重聚';
const RESOURCE_NAMES = Object.freeze({
  era: '纪元积累', mind: '心神', spirit: '元神', potential: '仙道潜力',
  lifespan: '寿元', cultivation: '修为', blood: '血气',
});

function costLine(costs = SELF_DAO_COSTS) {
  return `本次消耗：纪元积累${costs.era}、心神${costs.mind}、元神${bigNumberTransform(costs.spirit)}、仙道潜力${costs.potential}、寿元${bigNumberTransform(costs.lifespan)}、修为与血气各${bigNumberTransform(costs.cultivation)}`;
}

function battleExcerpt(messages = []) {
  if (messages.length <= 24) return messages;
  return [...messages.slice(0, 14), `……中间省略${messages.length - 22}条战报……`, ...messages.slice(-8)];
}

function battlePlayer(player, id) {
  return {
    ...player,
    id,
    当前血量: Math.max(1, Number(player.当前血量) || 1),
    血量上限: Math.max(1, Number(player.血量上限) || Number(player.当前血量) || 1),
    灵根: player.灵根 || {},
    学习的功法: Array.isArray(player.学习的功法) ? [...player.学习的功法] : [],
    _时间长河反制目标: true,
    _时间长河反制来源: '尸骸仙帝',
    _时间长河至宝失效: true,
    _帝兵失效: true,
  };
}

export class SelfDaoDeduction extends plugin {
  constructor() {
    super({
      name: '己道推演与尸骸仙帝',
      dsc: '准仙帝推演己道并冲击路尽级仙帝',
      event: 'message',
      priority: 520,
      rule: [
        { reg: '^#推演己道$', fnc: 'deduceOwnDao' },
        { reg: '^#设立体系境界(?:\\s+.+)?$', fnc: 'nameSystemRealms' },
      ],
    });
    this.task = [{
      cron: '0 */1 * * * *',
      name: '身灭道消真血重聚',
      fnc: () => this.recoverCorpseEmperorChallengers(),
      log: false,
    }];
    this.recovering = false;
  }

  async playerId(e) {
    return String(await channel(String(e.user_id).replace('qg_', '')));
  }

  gateMessage(gate) {
    if (gate.reason === 'completed') return '你已踏尽此路，神胎圆满，道源唯一。';
    if (gate.reason === 'recovering') {
      const remaining = Math.max(0, Number(gate.state.recovery?.endAt) - Date.now());
      return `你仍处于身灭道消，散落诸世的真血尚需${Math.ceil(remaining / 60000)}分钟重聚。`;
    }
    if (gate.reason === 'realm') return '只有等效权柄达到准仙帝（20重天），才能推演己道尽头。';
    if (gate.reason === 'own_way') return '尚未开创自身之道，请先完成 #创造自身之道。';
    if (gate.reason === 'system') return '尚未合道开创修炼体系，请先完成 #合道 体系名。';
    if (gate.reason === 'own_way_cap') return '自身之道尚未达到准仙帝阶段上限：需自身之道阶段6、修炼次数300。';
    if (gate.reason === 'realms') return '你已明悟一线前路，请先发送：#设立体系境界 境界一/境界二/境界三/境界四/境界五/境界六';
    if (gate.reason === 'resources') {
      return ['【己道推演·资粮不足】', ...gate.missing.map(item => `${RESOURCE_NAMES[item.key]}：${bigNumberTransform(item.have)}/${bigNumberTransform(item.need)}`), costLine(gate.costs)].join('\n');
    }
    return '己道推演条件尚未满足。';
  }

  async nameSystemRealms(e) {
    const id = await this.playerId(e);
    if (!await existplayer(id)) return e.reply('玩家不存在，请先创建角色。');
    const raw = e.msg.replace(/^#设立体系境界\s*/, '').trim();
    const names = raw.split(/[\/|｜、，,\s]+/).filter(Boolean);
    let result;
    await withPlayerMutationLock(id, async () => {
      const player = await Read_player(id);
      result = setCultivationSystemRealms(player, names);
      if (result.ok) await Write_player(id, player, { trackDailyTask: false });
    });
    if (!result.ok) {
      const reason = result.reason === 'locked' ? '完成5次 #推演己道 后，才会明悟体系前路。'
        : result.reason === 'system' ? '尚未合道开创修炼体系。'
        : result.reason === 'count' ? '必须依次填写六个大境界，以“/”分隔。'
          : result.reason === 'duplicate' ? '六个大境界不可重名。' : '每个境界名须为1至8字，且不可包含#或换行。';
      return e.reply(`${reason}\n用法：#设立体系境界 境界一/境界二/境界三/境界四/境界五/境界六`);
    }
    return e.reply([
      `【${result.realms.join('·')}】`,
      '六境已写入自创修炼体系的道统雏形。',
      '前路既明，可继续发送 #推演己道。',
    ].join('\n'));
  }

  async deduceOwnDao(e) {
    const id = await this.playerId(e);
    if (!await existplayer(id)) return e.reply('玩家不存在，请先创建角色。');
    let response;
    try {
      await withPlayerMutationLock(id, async () => {
        const player = await Read_player(id);
        const gate = getSelfDaoDeductionGate(player);
        if (!gate.ok) {
          response = this.gateMessage(gate);
          return;
        }

        let deduction = null;
        if (gate.reason !== 'battle') {
          deduction = consumeSelfDaoDeduction(player);
          if (!deduction.ok) {
            response = this.gateMessage(deduction);
            return;
          }
          await Write_player(id, player, { trackDailyTask: false });
          if (deduction.attempt < 10) {
            response = [
              `【推演己道·第${deduction.attempt}/10次】`,
              `${player.名号}斩去迷雾，将自身之道向尽头再推一步。`,
              costLine(deduction.costs),
              deduction.attempt === 5
                ? '五次推演圆满，一线前路显化。现在可为体系设立六个大境界：\n#设立体系境界 境界一/境界二/境界三/境界四/境界五/境界六'
                : `距离结出神胎尚余${10 - deduction.attempt}次推演。`,
            ].join('\n');
            return;
          }
        }

        const state = ensureSelfDaoDeduction(player);
        let planeDamage = null;
        if (!state.terrorTriggered) {
          planeDamage = damagePlanes(data.filePathMap.weimianList, SELF_DAO_PLANE_TARGETS, {
            source: PLANE_DESTRUCTION_SOURCES.CORPSE_EMPEROR_BREATH,
            actor: player.名号,
          });
          state.terrorTriggered = true;
          state.terrorTriggeredAt = Date.now();
          await Write_player(id, player, { trackDailyTask: false });
        }
        const opening = planeDamage ? [
          '【推演己道·第10/10次】',
          '己道抵达尽头，神胎结出；终极古地的尸骸随之开始呼吸。',
          `诸天承受力：${bigNumberTransform(planeDamage.bearingBefore)} → ${bigNumberTransform(planeDamage.bearingAfter)}`,
          `受损位面：${planeDamage.damaged.join('、')}`,
          '尸骸仙帝自沉眠中睁眼，你必须直面诸天万古最大的恐怖。',
        ] : [
          '【神胎帝战·再临】',
          '本次不再扣除推演资源，也不会重复触发尸骸呼吸。',
        ];

        await redis.set(`xiuxian:player:${id}:game_action`, '0');
        await redis.set(`xiuxian:player:${id}:action`, JSON.stringify({
          action: '直面尸骸仙帝', start_time: Date.now(), end_time: Date.now() + 10 * 60 * 1000,
          group_id: e.isGroup ? e.group_id : null,
        }));
        await this.broadcastTerror(player, planeDamage);

        ensureTimeRiverSkills(data);
        const challenger = battlePlayer(player, id);
        const corpse = buildTimeRiverAdversary(challenger, {
          name: '尸骸仙帝', era: '终极古地', special: [],
          criticalRate: 0.35, 灵根: { name: '仙帝场域', 法球倍率: 3 },
        });
        const battle = await zd_battle(challenger, corpse, { timeRiverBattle: true, battleType: 'corpse_emperor' });
        const aHp = Number(battle.A_hp ?? battle.A_xue) || 0;
        const bHp = Number(battle.B_hp ?? battle.B_xue) || 0;
        const report = battleExcerpt(battle.msg || []);

        if (aHp > 0 && bHp <= 0) {
          player.当前血量 = Math.min(Number(player.血量上限) || aHp, aHp);
          promoteSelfDaoToImmortalEmperor(player);
          await Write_player(id, player, { trackDailyTask: false });
          await redis.set(`xiuxian:player:${id}:game_action`, '1');
          await redis.del(`xiuxian:player:${id}:action`);
          response = [...opening, '【终极古地·帝战落幕】', ...report, '尸骸仙帝被镇压，神胎破茧，道源唯一。你已踏入路尽级仙帝！'].join('\n');
          return;
        }

        if (aHp <= 0) {
          const recovery = startCorpseEmperorRecovery(player);
          if (recovery.rewritten) {
            await Write_player(id, player, { trackDailyTask: false });
            await redis.set(`xiuxian:player:${id}:game_action`, '1');
            await redis.del(`xiuxian:player:${id}:action`);
            response = [
              ...opening, '【终极帝剑·永恒改命】', ...report,
              '此战仍以败局落幕，永恒仙图却改写了身灭道消的既定命运；气血与元神保留一线，可再次发送 #推演己道 重开帝战。',
            ].join('\n');
            return;
          }
          recovery.groupId = e.isGroup ? e.group_id : null;
          await Write_player(id, player, { trackDailyTask: false });
          await redis.set(`xiuxian:player:${id}:action`, JSON.stringify({
            action: ACTION_NAME, start_time: recovery.startAt, end_time: recovery.endAt,
            group_id: recovery.groupId,
          }));
          response = [
            ...opening, '【终极帝剑·身灭道消】', ...report,
            '大罗剑胎将你的肉身与元神劈成两半，亿万血雨洒落无尽时空。',
            `此后${SELF_DAO_RECOVERY_MS / 60000}分钟内不可行动；时限结束，诸世真血将重聚真身，神胎圆满，化作仙帝。`,
          ].join('\n');
          return;
        }

        state.battlePending = true;
        await Write_player(id, player, { trackDailyTask: false });
        await redis.set(`xiuxian:player:${id}:game_action`, '1');
        await redis.del(`xiuxian:player:${id}:action`);
        response = [...opening, '【帝战未决】', ...report, '终极古地暂归沉寂。再次发送 #推演己道 可重开帝战，本次不再扣除资源。'].join('\n');
      });
    } catch (error) {
      try {
        const stored = await Read_player(id);
        const recovery = ensureSelfDaoDeduction(stored).recovery;
        if (recovery?.status === 'recovering' && Number(recovery.endAt) > Date.now()) {
          await redis.set(`xiuxian:player:${id}:game_action`, '0');
          await redis.set(`xiuxian:player:${id}:action`, JSON.stringify({
            action: ACTION_NAME, start_time: recovery.startAt, end_time: recovery.endAt,
            group_id: recovery.groupId || null,
          }));
        } else {
          await redis.set(`xiuxian:player:${id}:game_action`, '1');
          await redis.del(`xiuxian:player:${id}:action`);
        }
      } catch {
        // 原异常仍由下方日志保留。
      }
      console.error(`[己道推演] 玩家${id}处理失败`, error);
      response = `己道推演异常：${error.message}`;
    }
    return e.reply(response);
  }

  async broadcastTerror(player, damage) {
    if (!damage) return;
    const set = config.getConfig('xiuxian', 'xiuxian');
    const configured = Array.isArray(set?.Era?.notifyGroups) ? set.Era.notifyGroups : [];
    const fallback = configured.length ? [] : await redis.sMembers('xiuxian:AuctionofficialTask_GroupList');
    const groups = [...new Set([...configured, ...fallback])];
    const message = [
      '【终极古地·尸骸呼吸】',
      `${player.名号}己道推演十次圆满，神胎初结，惊醒了终极古地的尸骸仙帝！`,
      `一呼一吸间，大宇宙精气与诸天承受力被吞噬：${bigNumberTransform(damage.bearingBefore)} → ${bigNumberTransform(damage.bearingAfter)}`,
      `受损位面：${damage.damaged.join('、')}`,
      '诸天万古最大的恐怖已经睁眼。',
    ].join('\n');
    await Promise.allSettled(groups.map(groupId => Bot.pickGroup(groupId).sendMsg(message)));
  }

  async recoverCorpseEmperorChallengers() {
    if (this.recovering) return;
    this.recovering = true;
    try {
      const files = fs.readdirSync(__PATH.player_path).filter(file => file.endsWith('.json'));
      for (const file of files) {
        const id = file.slice(0, -5);
        let notification = null;
        await withPlayerMutationLock(id, async () => {
          const player = await Read_player(id);
          const recovery = ensureSelfDaoDeduction(player).recovery;
          if (recovery?.status !== 'recovering' || Number(recovery.endAt) > Date.now()) return;
          const result = completeCorpseEmperorRecovery(player);
          if (!result.ok) return;
          await Write_player(id, player, { trackDailyTask: false });
          await redis.set(`xiuxian:player:${id}:game_action`, '1');
          await redis.del(`xiuxian:player:${id}:action`);
          notification = { groupId: recovery.groupId, name: player.名号 };
        });
        if (!notification) continue;
        const msg = `【诸世真血·重聚归来】\n${notification.name}自无尽时空收拢所有真血，神胎圆满，凝聚真身，正式踏入路尽级仙帝！`;
        try {
          if (notification.groupId) await Bot.pickGroup(notification.groupId).sendMsg(msg);
          else await Bot.pickUser(id).sendMsg(msg);
        } catch (error) {
          console.error(`[身灭道消] 玩家${id}归来通知失败`, error?.message);
        }
      }
    } finally {
      this.recovering = false;
    }
  }
}
