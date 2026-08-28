import fs from 'fs';
import { plugin, config } from '../../api/api.js';
import {
  Add_najie_thing,
  Read_player,
  Write_player,
  getMonsterByLocation,
  zd_battle,
} from '../../model/xiuxian.js';
import { consumeBlackEmperorBattleFormation } from '../../model/blackEmperor.js';
import { awardDungeonGongfaProficiency } from '../../model/gongfaProficiency.js';
import { getInnateDungeonRewardMultiplier } from '../../model/innateTreasure.js';
import { getDungeonFortuneMultiplier } from '../../model/redDustFortune.js';
import {
  deductShangcangCost,
  getShangcangCostShortage,
  isShangcangAction,
  recordShangcangVictory,
  rollShangcangRewards,
  SHANGCANG_ADDICTION_ACTION,
} from '../../model/shangcangDungeon.js';
import { sendSecretPlaceNotification } from '../../model/secretPlaceNotification.js';
import { withSecretPlaceSettlementLock } from '../../model/secretPlaceAddiction.js';
import { runTaskOnce } from '../../utils/taskGuard.js';

function closeAction(action, now) {
  action.shutup = '1';
  action.working = '1';
  action.power_up = '1';
  action.Place_action = '1';
  action.Place_actionplus = '1';
  action.end_time = now;
}

function buildCombatant(source, id) {
  return {
    ...source,
    id: source.id || id,
    名号: source.名号 || source.name || '无名生灵',
    攻击: Math.max(1, Number(source.攻击) || 1),
    防御: Math.max(0, Number(source.防御) || 0),
    当前血量: Math.max(0, Number(source.当前血量 ?? source.血量上限) || 1),
    血量上限: Math.max(1, Number(source.血量上限 ?? source.当前血量) || 1),
    暴击率: Math.max(0, Number(source.暴击率) || 0),
    速度: Math.max(1, Number(source.速度) || 100),
    灵根: source.灵根 || { name: '凡体', type: '凡体', 法球倍率: 0 },
    法球倍率: Number(source.法球倍率 ?? source.灵根?.法球倍率) || 0,
    学习的功法: Array.isArray(source.学习的功法) ? source.学习的功法 : [],
  };
}

export class ShangcangTask extends plugin {
  constructor() {
    super({ name: 'ShangcangTask', dsc: '上苍之上副本结算', event: 'message', priority: 300, rule: [] });
    this.set = config.getConfig('task', 'task');
    this.task = {
      cron: this.set.action_task,
      name: 'ShangcangTask',
      fnc: () => runTaskOnce('ShangcangTask', () => this.settleAll()),
    };
  }

  async settleAll() {
    const directory = './plugins/zhutianxiuxian1.0/resources/data/xiuxian_player';
    for (const file of fs.readdirSync(directory).filter(name => name.endsWith('.json'))) {
      try {
        await this.settlePlayer(file.slice(0, -5));
      } catch (error) {
        console.error(`[上苍之上结算] 玩家${file}结算失败:`, error);
      }
    }
  }

  async settlePlayer(playerId, now = Date.now()) {
    return withSecretPlaceSettlementLock(playerId, () => this.settleLocked(String(playerId), now));
  }

  async settleLocked(playerId, now) {
    const key = `xiuxian:player:${playerId}:action`;
    const raw = await redis.get(key);
    if (!raw) return false;
    const action = JSON.parse(raw);
    if (!isShangcangAction(action) || action.is_jiesuan == 1) return false;
    const addiction = action.action === SHANGCANG_ADDICTION_ACTION;
    if (addiction ? action.Place_actionplus != '0' : action.Place_action != '0') return false;
    const dueAt = addiction ? Number(action.next_settle_time) : Number(action.end_time);
    if (!Number.isFinite(dueAt) || now < dueAt) return false;

    const player = await Read_player(playerId);
    const location = action.Place_address?.name || action.Place_address;
    const monster = getMonsterByLocation(action.Place_address);
    const challenger = buildCombatant(player, playerId);
    const enemy = buildCombatant({ ...monster, _忽略境界速度加成: true }, `上苍之上:${location}`);
    const formation = consumeBlackEmperorBattleFormation(player, challenger, enemy);
    const battle = await zd_battle(challenger, enemy);
    if (formation.message && Array.isArray(battle.msg)) battle.msg.unshift(formation.message);
    const resolved = battle.A_team?.[0] || challenger;
    player.当前血量 = Math.max(0, Math.min(Number(player.血量上限) || 1, Number(battle.A_hp) || 0));
    player.功法熟练度 = resolved.功法熟练度 || player.功法熟练度;
    player.功法熟练度每日 = resolved.功法熟练度每日 || player.功法熟练度每日;
    const proficiency = awardDungeonGongfaProficiency(player);
    const rewards = [];
    let era = null;

    if (battle.winner === 'A') {
      const multiplier = getDungeonFortuneMultiplier(player) * getInnateDungeonRewardMultiplier(player);
      rewards.push(...rollShangcangRewards(location, Math.random, multiplier));
      for (const reward of rewards) await Add_najie_thing(playerId, reward.name, reward.class, reward.count);
      player.副本通关次数 = Math.max(0, Number(player.副本通关次数) || 0) + 1;
      era = recordShangcangVictory(player);
    }

    action.settled_count = Math.max(0, Number(action.settled_count) || 0) + 1;
    let stopReason = '';
    if (addiction && action.settled_count < Number(action.total_count)) {
      const shortage = getShangcangCostShortage(player);
      if (shortage) {
        stopReason = `${shortage[0]}不足，沉迷自动停止`;
        closeAction(action, now);
      } else {
        deductShangcangCost(player);
        action.next_settle_time = Math.max(now, dueAt) + Number(action.interval);
        const remainingCount = Math.max(0, Number(action.total_count) - action.settled_count);
        action.remaining_time = remainingCount * Number(action.interval) / 60_000;
        action.end_time = action.next_settle_time + Math.max(0, remainingCount - 1) * Number(action.interval);
      }
    } else {
      closeAction(action, now);
    }

    await Write_player(playerId, player);
    await redis.set(key, JSON.stringify(action));
    await this.updateHistory(playerId, action, battle.winner, rewards, stopReason, now);

    const result = battle.winner === 'A' ? '胜利' : battle.winner === 'B' ? '战败' : '平局';
    const lines = [
      `【上苍之上·${location}】${result}`,
      rewards.length ? `获得：${rewards.map(item => `${item.name}×${item.count}`).join('、')}` : '本轮没有获得战利品',
      era?.gained ? `三胜积累：纪元积累+${era.gained}（当前${player.纪元积累}/100）` : '',
      Object.keys(proficiency).length ? `功法参悟：${Object.keys(proficiency).join('、')}` : '',
      addiction && !stopReason && action.Place_actionplus == '0'
        ? `沉迷进度：${action.settled_count}/${action.total_count}`
        : stopReason,
      ...(Array.isArray(battle.msg) ? battle.msg.slice(-5) : []),
    ].filter(Boolean);
    await sendSecretPlaceNotification(action, playerId, [segment.at(Number(playerId)), lines.join('\n')]);
    return true;
  }

  async updateHistory(playerId, action, winner, rewards, stopReason, now) {
    if (action.action !== SHANGCANG_ADDICTION_ACTION) return;
    const key = `xiuxian:player:${playerId}:addiction_history`;
    const raw = await redis.get(key);
    if (!raw) return;
    const history = JSON.parse(raw);
    history.settled_count = action.settled_count;
    history.death_count = (Number(history.death_count) || 0) + (winner === 'B' ? 1 : 0);
    history.victory_count = (Number(history.victory_count) || 0) + (winner === 'A' ? 1 : 0);
    for (const reward of rewards) {
      const existing = history.items_gained.find(item => item.name === reward.name && item.class === reward.class);
      if (existing) existing.count += reward.count;
      else history.items_gained.push({ name: reward.name, class: reward.class, count: reward.count });
    }
    if (action.Place_actionplus != '0') {
      history.status = stopReason ? 'stopped' : 'completed';
      history.stop_reason = stopReason;
      history.end_time = now;
    }
    await redis.set(key, JSON.stringify(history));
  }
}
