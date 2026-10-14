import { getSuiyunEffects } from '../../model/suiyun.js';
import { getMemoryEffects, recordMemoryDungeon } from '../../model/memoryPath.js';
import { isItemPermanentlyNonTradeable } from '../../model/equipmentTransfer.js';
import fs from 'fs';
import { plugin, config, data } from '../../api/api.js';
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
  SHANGCANG_COST,
} from '../../model/shangcangDungeon.js';
import { sendSecretPlaceNotification } from '../../model/secretPlaceNotification.js';
import { withSecretPlaceSettlementLock } from '../../model/secretPlaceAddiction.js';
import { getFashanActionKey, getFashanHistoryKey } from '../../model/fashanProxy.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { runTaskOnce } from '../../utils/taskGuard.js';
import { getLocationId } from '../../model/weimianTravel.js';

const FASHAN_TASK_RETENTION_SECONDS = 24 * 60 * 60;

function getFashanTaskRedisOptions(action) {
  const active = action?.Place_actionplus == '0' || action?.Place_action == '0';
  return active ? null : { EX: FASHAN_TASK_RETENTION_SECONDS };
}

function writeFashanTask(key, value) {
  const options = getFashanTaskRedisOptions(value);
  return options
    ? redis.set(key, JSON.stringify(value), options)
    : redis.set(key, JSON.stringify(value));
}

function closeAction(action, now) {
  action.shutup = '1';
  action.working = '1';
  action.power_up = '1';
  action.Place_action = '1';
  action.Place_actionplus = '1';
  action.end_time = now;
}

function buildCombatant(source, id) {
  const currentHp = Number(source.当前血量 ?? source.血量上限);
  return {
    ...source,
    id: source.id || id,
    名号: source.名号 || source.name || '无名生灵',
    攻击: Math.max(1, Number(source.攻击) || 1),
    防御: Math.max(0, Number(source.防御) || 0),
    当前血量: Math.max(0, Number.isFinite(currentHp) ? currentHp : 1),
    血量上限: Math.max(1, Number(source.血量上限 ?? source.当前血量) || 1),
    暴击率: Math.max(0, Number(source.暴击率) || 0),
    速度: Math.max(1, Number(source.速度) || 100),
    灵根: source.灵根 || { name: '凡体', type: '凡体', 法球倍率: 0 },
    法球倍率: Number(source.法球倍率 ?? source.灵根?.法球倍率) || 0,
    学习的功法: Array.isArray(source.学习的功法) ? source.学习的功法 : [],
  };
}

const SHANGCANG_DELTA_FIELDS = new Set([
  ...Object.keys(SHANGCANG_COST),
  '副本通关次数',
  '纪元积累',
]);

export function mergeShangcangSettlementPlayer(latest, baseline, settled, actor = 'body') {
  const merged = { ...(latest || {}) };
  const keys = new Set([
    ...Object.keys(baseline || {}),
    ...Object.keys(settled || {}),
  ]);
  for (const key of keys) {
    if (actor === 'fashan' && key === '当前血量') continue;
    if (JSON.stringify(baseline?.[key]) === JSON.stringify(settled?.[key])) continue;
    if (key === '_shangcangSettlements') {
      merged[key] = { ...(latest?.[key] || {}), ...(settled?.[key] || {}) };
      const receiptIds = Object.keys(merged[key]);
      for (const staleId of receiptIds.slice(0, Math.max(0, receiptIds.length - 20))) delete merged[key][staleId];
      continue;
    }
    const before = Number(baseline?.[key]);
    const after = Number(settled?.[key]);
    const current = Number(latest?.[key]);
    if (SHANGCANG_DELTA_FIELDS.has(key)
      && Number.isFinite(before) && Number.isFinite(after) && Number.isFinite(current)) {
      merged[key] = current + after - before;
    } else if (Object.hasOwn(settled || {}, key)) {
      merged[key] = structuredClone(settled[key]);
    } else {
      delete merged[key];
    }
  }
  if (actor === 'fashan' && Object.hasOwn(latest || {}, '当前血量')) merged.当前血量 = latest.当前血量;
  return merged;
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
      const playerId = file.slice(0, -5);
      for (const actor of ['body', 'fashan']) {
        try {
          await this.settlePlayer(playerId, Date.now(), actor);
        } catch (error) {
          console.error(`[上苍之上结算] 玩家${file}的${actor === 'fashan' ? '法身' : '本体'}结算失败:`, error);
        }
      }
    }
  }

  async settlePlayer(playerId, now = Date.now(), actor = 'body') {
    return withSecretPlaceSettlementLock(
      playerId,
      () => actor === 'fashan'
        ? withPlayerMutationLock(playerId, () => this.settleLocked(String(playerId), now, actor))
        : this.settleLocked(String(playerId), now, actor),
    );
  }

  async settleLocked(playerId, now, actor = 'body') {
    const isFashan = actor === 'fashan';
    const key = isFashan ? getFashanActionKey(playerId) : `xiuxian:player:${playerId}:action`;
    const raw = await redis.get(key);
    if (!raw) return false;
    let action;
    try {
      action = JSON.parse(raw);
    } catch {
      if (isFashan) {
        if (String(await redis.get(key)) !== String(raw)) return false;
        await redis.del(key);
        await redis.expire(getFashanHistoryKey(playerId), FASHAN_TASK_RETENTION_SECONDS);
        const player = await Read_player(playerId);
        if (player.法身状态 === '行动中') {
          player.法身状态 = '空闲中';
          player.法身行动 = '无行动';
          await Write_player(playerId, player);
        }
      }
      return false;
    }
    if (!isShangcangAction(action)) return false;
    if (isFashan !== Boolean(action.isFashan)) return false;
    const ownsAction = async value => {
      if (!isFashan) return true;
      const latestRaw = await redis.get(key);
      if (!latestRaw) return false;
      try {
        const latest = JSON.parse(latestRaw);
        const latestTaskId = latest?.taskId;
        const valueTaskId = value?.taskId;
        if (latestTaskId && valueTaskId) return latestTaskId === valueTaskId;
        if (latestTaskId || valueTaskId) {
          if (latestTaskId || !valueTaskId) return false;
          if (Number(latest.start_time) !== Number(value?.start_time)) return false;
          const latestLocation = latest.Place_address?.name ?? latest.Place_address;
          const valueLocation = value?.Place_address?.name ?? value?.Place_address;
          return (latestLocation == null && valueLocation == null)
            || (latestLocation != null && valueLocation != null
              && String(latestLocation) === String(valueLocation));
        }
        if (Number(latest.start_time) !== Number(value?.start_time)) return false;
        const latestLocation = latest.Place_address?.name ?? latest.Place_address;
        const valueLocation = value?.Place_address?.name ?? value?.Place_address;
        return (latestLocation == null && valueLocation == null)
          || (latestLocation != null && valueLocation != null
            && String(latestLocation) === String(valueLocation));
      } catch {
        return false;
      }
    };
    const writeAction = async value => {
      if (!isFashan) return redis.set(key, JSON.stringify(value));
      if (!await ownsAction(value)) return false;
      return writeFashanTask(key, value);
    };
    if (action.is_jiesuan == 1) {
      if (isFashan) {
        if (!await ownsAction(action)) return false;
        await redis.expire(key, FASHAN_TASK_RETENTION_SECONDS);
        await redis.expire(getFashanHistoryKey(playerId), FASHAN_TASK_RETENTION_SECONDS);
      }
      return false;
    }
    const addiction = action.action === SHANGCANG_ADDICTION_ACTION;
    if (addiction ? action.Place_actionplus != '0' : action.Place_action != '0') {
      if (isFashan) {
        if (!await ownsAction(action)) return false;
        await redis.expire(key, FASHAN_TASK_RETENTION_SECONDS);
        await redis.expire(getFashanHistoryKey(playerId), FASHAN_TASK_RETENTION_SECONDS);
        const player = await Read_player(playerId);
        if (player.法身状态 === '行动中') {
          player.法身状态 = '空闲中';
          player.法身行动 = '无行动';
          await Write_player(playerId, player);
        }
      }
      return false;
    }
    const dueAt = addiction ? Number(action.next_settle_time) : Number(action.end_time);
    if (!Number.isFinite(dueAt) || now < dueAt) return false;

    const player = await Read_player(playerId);
    const location = action.Place_address?.name || action.Place_address;
    const round = Math.max(0, Number(action.settled_count) || 0) + 1;
    action.taskId ||= `${actor}:${playerId}:${Number(action.start_time) || 0}:${location}`;
    if (isFashan) {
      const normalizedActorPlane = getLocationId(action.actorPlane ?? action.法身位置);
      if (Number.isFinite(normalizedActorPlane)) {
        action.actorPlane = normalizedActorPlane;
        action.法身位置 = normalizedActorPlane;
      }
    }
    if (isFashan && !await ownsAction(action)) return false;
    const settlementId = `shangcang:${actor}:${action.taskId}:round:${round}`;
    const legacySettlementId = `shangcang:${action.taskId}:round:${round}`;
    if (!player._shangcangSettlements || typeof player._shangcangSettlements !== 'object'
      || Array.isArray(player._shangcangSettlements)) {
      player._shangcangSettlements = {};
    }
    const legacyReplay = String(action.taskId).startsWith(`${actor}:`)
      ? player._shangcangSettlements[legacySettlementId] || player._shangcangSettlement
      : null;
    if ([settlementId, legacySettlementId].includes(legacyReplay?.id)
      && !player._shangcangSettlements[settlementId]) {
      player._shangcangSettlements[settlementId] = { ...legacyReplay, id: settlementId };
    }
    const replay = player._shangcangSettlements[settlementId];
    if (replay?.id === settlementId && replay.action) {
      Object.assign(action, replay.action);
      await this.updateHistory(
        playerId,
        action,
        replay.winner,
        replay.rewards || [],
        replay.stopReason || '',
        now,
        actor,
        settlementId,
      );
      await writeAction(action);
      return true;
    }

    const playerBaseline = structuredClone(player);
    const bodyHp = playerBaseline.当前血量;
    if (isFashan) {
      const actorPlane = getLocationId(action.actorPlane ?? action.法身位置);
      const currentFashanPlane = getLocationId(player.法身位置);
      if (!Number.isFinite(actorPlane) || currentFashanPlane !== actorPlane) {
        if (!await ownsAction(action)) return false;
        closeAction(action, now);
        if (!await writeAction(action)) return false;
        player.法身状态 = '空闲中';
        player.法身行动 = '无行动';
        await Write_player(playerId, player);
        await this.updateHistory(playerId, action, '', [], '法身已离开上苍之上', now, actor);
        return false;
      }
      const savedFashanHp = Number(player.法身当前血量 ?? action.fashanCurrentHp);
      const maxHp = Math.max(1, Number(player.血量上限) || 1);
      player.当前血量 = Number.isFinite(savedFashanHp)
        ? Math.min(maxHp, Math.max(0, savedFashanHp))
        : maxHp;
    }
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

    if (isFashan && !await ownsAction(action)) return false;

    if (battle.winner === 'A') {
      const multiplier = getDungeonFortuneMultiplier(player) * getInnateDungeonRewardMultiplier(player)
        * getSuiyunEffects(player).lootMultiplier * getMemoryEffects(player).lootMultiplier;
      const rewardPlace = data.shangcang_list.find(place => place.name === location) || action.Place_address;
      rewards.push(...rollShangcangRewards(rewardPlace, Math.random, multiplier));
      for (const tier of getMemoryEffects(player).guaranteedDrops) {
        const pool = (rewardPlace?.[tier] || []).filter(item => !isItemPermanentlyNonTradeable(item));
        if (!pool.length || rewards.some(reward => pool.some(item => item.name === reward.name))) continue;
        const seed = [...`${settlementId}:${tier}`].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
        const item = pool[seed % pool.length];
        if (!rewards.some(reward => reward.name === item.name)) {
          rewards.push({ name: item.name, class: item.class, count: getMemoryEffects(player).lootMultiplier });
        }
      }
      for (const [index, reward] of rewards.entries()) {
        await Add_najie_thing(
          playerId,
          reward.name,
          reward.class,
          reward.count,
          undefined,
          1,
          { idempotencyKey: `${settlementId}:reward:${index}` },
        );
      }
      player.副本通关次数 = Math.max(0, Number(player.副本通关次数) || 0) + 1;
      era = recordShangcangVictory(player);
    }

    action.settled_count = Math.max(0, Number(action.settled_count) || 0) + 1;
    if (addiction) recordMemoryDungeon(player, { token: settlementId });
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

    if (isFashan) {
      action.fashanCurrentHp = player.当前血量;
      player.法身当前血量 = action.fashanCurrentHp;
      player.当前血量 = bodyHp;
      if (action.Place_actionplus != '0' && action.Place_action != '0') {
        player.法身状态 = '空闲中';
        player.法身行动 = '无行动';
      }
    }

    player._shangcangSettlements[settlementId] = {
      id: settlementId,
      winner: battle.winner,
      rewards: rewards.map(reward => ({ ...reward })),
      stopReason,
      action: {
        taskId: action.taskId,
        settled_count: action.settled_count,
        next_settle_time: action.next_settle_time,
        remaining_time: action.remaining_time,
        end_time: action.end_time,
        shutup: action.shutup,
        working: action.working,
        power_up: action.power_up,
        Place_action: action.Place_action,
        Place_actionplus: action.Place_actionplus,
        fashanCurrentHp: action.fashanCurrentHp,
      },
    };
    player._shangcangSettlement = player._shangcangSettlements[settlementId];
    const settlementIds = Object.keys(player._shangcangSettlements);
    for (const staleId of settlementIds.slice(0, Math.max(0, settlementIds.length - 20))) {
      delete player._shangcangSettlements[staleId];
    }
    if (isFashan && !await ownsAction(action)) return false;
    const latestPlayer = await Read_player(playerId);
    const mergedPlayer = mergeShangcangSettlementPlayer(latestPlayer, playerBaseline, player, actor);
    await Write_player(playerId, mergedPlayer);
    await this.updateHistory(playerId, action, battle.winner, rewards, stopReason, now, actor, settlementId);
    await writeAction(action);

    const result = battle.winner === 'A' ? '胜利' : battle.winner === 'B' ? '战败' : '平局';
    const lines = [
      `【上苍之上·${location}】${result}`,
      rewards.length ? `获得：${rewards.map(item => `${item.name}×${item.count}`).join('、')}` : '本轮没有获得战利品',
      era?.gained ? `三胜积累：纪元积累+${era.gained}（当前${player.纪元积累}/${era.cap}）` : '',
      Object.keys(proficiency).length ? `功法参悟：${Object.keys(proficiency).join('、')}` : '',
      addiction && !stopReason && action.Place_actionplus == '0'
        ? `沉迷进度：${action.settled_count}/${action.total_count}`
        : stopReason,
      ...(Array.isArray(battle.msg) ? battle.msg.slice(-5) : []),
    ].filter(Boolean);
    await sendSecretPlaceNotification(action, playerId, [segment.at(Number(playerId)), lines.join('\n')]);
    return true;
  }

  async updateHistory(playerId, action, winner, rewards, stopReason, now, actor = 'body', settlementId = '') {
    if (action.action !== SHANGCANG_ADDICTION_ACTION && actor !== 'fashan') return;
    const key = actor === 'fashan'
      ? getFashanHistoryKey(playerId)
      : `xiuxian:player:${playerId}:addiction_history`;
    const raw = await redis.get(key);
    if (!raw) return;
    const history = JSON.parse(raw);
    if (action.taskId) {
      if (history.taskId && history.taskId !== action.taskId) return;
      if (!history.taskId) {
        const location = action.Place_address?.name || action.Place_address;
        if (Number(history.start_time) !== Number(action.start_time)
          || (history.location && location && history.location !== location)) return;
        history.taskId = action.taskId;
      }
    }
    history.settlementIds = Array.isArray(history.settlementIds) ? history.settlementIds : [];
    if (settlementId && history.settlementIds.includes(settlementId)) return;
    history.settled_count = action.settled_count;
    history.death_count = (Number(history.death_count) || 0) + (winner === 'B' ? 1 : 0);
    history.victory_count = (Number(history.victory_count) || 0) + (winner === 'A' ? 1 : 0);
    history.items_gained = Array.isArray(history.items_gained) ? history.items_gained : [];
    for (const reward of rewards) {
      const existing = history.items_gained.find(item => item.name === reward.name && item.class === reward.class);
      if (existing) existing.count += reward.count;
      else history.items_gained.push({ name: reward.name, class: reward.class, count: reward.count });
    }
    if (action.Place_actionplus != '0' && action.Place_action != '0') {
      history.status = stopReason ? 'stopped' : 'completed';
      history.stop_reason = stopReason;
      history.end_time = now;
    }
    if (settlementId) history.settlementIds.push(settlementId);
    if (actor === 'fashan') {
      const options = getFashanTaskRedisOptions(action);
      if (options) await redis.set(key, JSON.stringify(history), options);
      else await redis.set(key, JSON.stringify(history));
    } else {
      await redis.set(key, JSON.stringify(history));
    }
  }
}
