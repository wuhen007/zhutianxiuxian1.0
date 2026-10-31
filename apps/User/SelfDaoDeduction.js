import fs from 'node:fs';

import { config, data, plugin, verc } from '../../api/api.js';
import {
  Read_player,
  Write_player,
  __PATH,
  bigNumberTransform,
  channel,
  existplayer,
  zd_battle,
  Go, Read_equipment, Write_equipment, player_efficiency, invalidateBattleEquipmentCache,
} from '../../model/xiuxian.js';
import { damagePlanes, PLANE_DESTRUCTION_SOURCES } from '../../model/planeDestruction.js';
import {
  SELF_DAO_COSTS,
  SELF_DAO_DIVINE_EMBRYO_ATTEMPT,
  SELF_DAO_HALF_IMMORTAL_EMPEROR_ATTEMPT,
  SELF_DAO_PLANE_TARGETS,
  SELF_DAO_QUASI_EMPEROR_PEAK_ATTEMPT,
  SELF_DAO_RECOVERY_MS,
  SELF_DAO_REQUIRED_ATTEMPTS,
  SACRIFICE_DAO_REQUIRED_ATTEMPTS,
  completeCorpseEmperorRecovery,
  consumeSelfDaoDeduction,
  ensureSelfDaoDeduction,
  getSelfDaoDeductionGate,
  promoteSelfDaoToImmortalEmperor,
  setCultivationSystemRealms,
  startCorpseEmperorRecovery,
  canReproveImmortalEmperor, reproveImmortalEmperor,
} from '../../model/selfDaoDeduction.js';
import { buildTimeRiverAdversary, ensureTimeRiverSkills } from '../../model/timeRiverAdversary.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { FileRollbackTransaction } from '../SecretPlace/rebirthTransaction.js';
import path from 'node:path';
import { isShapeSpiritDestroyed } from '../../model/worldlineAuthority.js';
import { getActiveZhutianAvatarName } from '../../model/zhutianMirror.js';

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

function progressLine(attempt) {
  if (attempt === SELF_DAO_QUASI_EMPEROR_PEAK_ATTEMPT) {
    return '十层推演圆满，你已抵达准仙帝极巅，号绝顶道祖；战斗中获得30%神通与近战伤害减免。';
  }
  if (attempt === SELF_DAO_DIVINE_EMBRYO_ATTEMPT) {
    return '十五层推演圆满，己道神胎结出；此后每场战斗可额外满血复活一次，并解除控制。';
  }
  if (attempt < SELF_DAO_QUASI_EMPEROR_PEAK_ATTEMPT) {
    return `距离准仙帝极巅尚余${SELF_DAO_QUASI_EMPEROR_PEAK_ATTEMPT - attempt}层推演。`;
  }
  if (attempt < SELF_DAO_DIVINE_EMBRYO_ATTEMPT) {
    return `距离结出神胎尚余${SELF_DAO_DIVINE_EMBRYO_ATTEMPT - attempt}层推演。`;
  }
  return `距离半步仙帝尚余${SELF_DAO_HALF_IMMORTAL_EMPEROR_ATTEMPT - attempt}层推演；抵达后才会直面尸骸仙帝。`;
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
        { reg: '^#证道$', fnc: 'reproveEmperor' },
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

  async reproveEmperor(e) {
    if (!verc({ e })) return false;
    const id = await this.playerId(e);
    if (!await existplayer(id)) return false;
    return withPlayerMutationLock(id, async () => {
      const player = await Read_player(id);
      // 普通证道仍交回原指令；仅处理确有路尽经历且当前跌至准仙帝的玩家。
      if (!canReproveImmortalEmperor(player)) return false;
      if (getActiveZhutianAvatarName(player)) return e.reply('请先发送 #装载化身 本源，再重证路尽级仙帝。');
      if (!e.isGroup) return e.reply('请在群聊中发送 #证道 重证路尽级仙帝。');
      if (isShapeSpiritDestroyed(player) || player.修仙状态 === '身灭道消'
        || player.始祖永祭?.status === 'bubble' || !(Number(player.当前血量) > 0)) {
        return e.reply('请先恢复真身与气血，再重证路尽级仙帝。');
      }
      if (!await Go(e)) return true;
      const transaction = new FileRollbackTransaction();
      for (const directory of [__PATH.player_path, __PATH.equipment_path]) {
        transaction.capture(path.join(directory, `${id}.json`));
      }
      try {
        const result = reproveImmortalEmperor(player);
        if (!result.ok) return e.reply('当前尚未满足重证条件。');
        await Write_player(id, player, { trackDailyTask: false, event: e });
        await Write_equipment(id, await Read_equipment(id));
        await player_efficiency(id);
        const latest = await Read_player(id);
        const field = result.route === 'xiangu' ? 'xiangulevel_id' : result.route === 'huafen' ? 'huafenlevel_id' : 'mijinglevel_id';
        const restored = Number(latest[field]) >= (result.route === 'mijing' ? 21 : 22);
        transaction.commit();
        return e.reply(restored
          ? '【路尽重证】昔日仙帝道果再现，已重登路尽级仙帝；修为、血气已清空，其他资源保留。'
          : '【路尽重证】重证遭遇现世规则压制，当前境界已按实际结算；修为、血气已清空。');
      } catch (error) {
        try { transaction.rollback(); }
        finally { invalidateBattleEquipmentCache(id); }
        throw error;
      }
    });
  }

  gateMessage(gate) {
    if (gate.reason === 'sacrifice_completed') return '仙帝阶段十次己道推演已圆满，请使用 #祭道 检查并冲击祭道门槛。';
    if (gate.reason === 'sacrifice_own_way_cap') return '请先修满仙帝阶段自身之道：自身之道阶段7、修炼次数400，再继续十次祭道推演。';
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
          if (deduction.reason === 'sacrifice_deduced') {
            response = [
              `【祭道前路·己道推演${deduction.attempt}/${SACRIFICE_DAO_REQUIRED_ATTEMPTS}次】`,
              '本阶段独立计数，每次消耗准仙帝基础单次资粮的十倍。',
              costLine(deduction.costs),
              deduction.attempt === SACRIFICE_DAO_REQUIRED_ATTEMPTS
                ? '十次推演圆满，可发送 #祭道；仙帝击杀、道心与自身之道门槛仍需满足。'
                : `还需推演${SACRIFICE_DAO_REQUIRED_ATTEMPTS - deduction.attempt}次。`,
            ].join('\n');
            return;
          }
          if (deduction.attempt < SELF_DAO_REQUIRED_ATTEMPTS) {
            response = [
              `【推演己道·第${deduction.attempt}/${SELF_DAO_REQUIRED_ATTEMPTS}层】`,
              `${player.名号}斩去迷雾，将自身之道向尽头再推一步。`,
              costLine(deduction.costs),
              deduction.attempt === 5
                ? '五次推演圆满，一线前路显化。现在可为体系设立六个大境界：\n#设立体系境界 境界一/境界二/境界三/境界四/境界五/境界六'
                : progressLine(deduction.attempt),
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
          '【推演己道·第20/20层】',
          '己道再进一步，踏入半步仙帝并破解万法加持；终极古地的尸骸随之开始呼吸。',
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
      `${player.名号}己道推演二十层圆满，神胎大成并踏入半步仙帝，惊醒了终极古地的尸骸仙帝！`,
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
        // 遍历与读档之间存在竞态：轮回/删档会在这两步之间删掉存档，
        // 直接 Read_player 会抛 ENOENT，导致整轮任务中断并每分钟刷错误日志。
        if (!fs.existsSync(`${__PATH.player_path}/${file}`)) continue;
        let notification = null;
        try {
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
        } catch (error) {
          // 单个玩家失败不能拖垮整轮：ENOENT 属正常删除竞态，直接跳过
          if (error?.code !== 'ENOENT') console.error(`[身灭道消] 玩家${id}结算失败`, error?.message);
          continue;
        }
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
