import fs from 'node:fs';
import path from 'node:path';

import { config, data, plugin, verc } from '../../api/api.js';
import {
  Read_player,
  Write_player,
  __PATH,
  channel,
  existplayer,
} from '../../model/xiuxian.js';
import {
  markPlanesDestroyed,
  PLANE_DESTRUCTION_SOURCES,
  getPlaneDestructionInfo,
  buildPlaneDestroyedMessage,
} from '../../model/planeDestruction.js';
import {
  DIMENSION_THREAT_TYPES,
  ETERNAL_GUARD_DURATION_MINUTES,
  ETERNAL_GUARD_INTERVAL_MS,
  ETERNAL_GUARD_ERA_REWARD,
  advanceDimensionGuardState,
  applyEternalGuardStatus,
  createDimensionGuardState,
  isEternalGuardAction,
  isGuardingEternal,
  isImmortalEmperorPlayer,
} from '../../model/dimensionGuard.js';
import { writeJsonAtomically } from '../../utils/atomicJson.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { runTaskOnce } from '../../utils/taskGuard.js';
import { getFashanActionKey, isFashanActionPending } from '../../model/fashanProxy.js';
import { getLocationName } from '../../model/weimianTravel.js';
import { addCappedEraAccumulation } from '../../model/selfDaoDeduction.js';

const STATE_FILE = path.join(__PATH.data_path, 'dimension_guard_state.json');
const PLANE_FILE = data.filePathMap.weimianList;

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return createDimensionGuardState();
  }
}

function saveState(state) {
  writeJsonAtomically(STATE_FILE, state);
}

function readPlayerFiles() {
  try {
    return fs.readdirSync(__PATH.player_path).filter((file) => file.endsWith('.json'));
  } catch {
    return [];
  }
}

function highlandDestroyed() {
  try {
    const plane = JSON.parse(fs.readFileSync(PLANE_FILE, 'utf8'));
    return plane.厄土高原 === 0;
  } catch {
    return false;
  }
}

function readAction(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function isActiveTravelAction(action, now) {
  return action?.action === '位面传送' && Number(action.end_time) > now;
}

async function findImmortalEmperors() {
  const emperors = [];
  for (const file of readPlayerFiles()) {
    const id = file.replace(/\.json$/, '');
    try {
      const player = await Read_player(id);
      if (isImmortalEmperorPlayer(player)) {
        emperors.push({ id, name: player.名号 || id, player });
      }
    } catch {}
  }
  return emperors;
}

async function syncEternalGuardActions(emperors, now) {
  const guardians = [];
  for (const emperor of emperors) {
    await withPlayerMutationLock(emperor.id, async () => {
      const player = await Read_player(emperor.id);
      for (const actor of ['body', 'fashan']) {
        const proxy = actor === 'fashan';
        const actionKey = proxy ? getFashanActionKey(emperor.id) : `xiuxian:player:${emperor.id}:action`;
        const currentAction = readAction(await redis.get(actionKey));
        const guarding = isGuardingEternal(player, actor);
        const stateField = proxy ? '法身行动' : '修仙状态';
        if (!guarding) {
          if (isEternalGuardAction(currentAction)) await redis.del(actionKey);
          if (player[stateField] === '镇守永恒未知之地') {
            if (proxy) {
              player.法身永恒镇守 = false;
              player.法身状态 = '空闲中';
              player.法身行动 = '无行动';
            } else {
              player.修仙状态 = '空闲';
              delete player.永恒镇守结束时间;
            }
            await Write_player(emperor.id, player);
          }
          continue;
        }
        // 穿梭尚未结算，以及法身已有独立任务时，都不接管对应行动。
        if (isActiveTravelAction(currentAction, now)) continue;
        if (proxy && (Number(player.法身恢复时间) > now
          || (!isEternalGuardAction(currentAction) && isFashanActionPending(currentAction, now)))) continue;
        if (!proxy && !isEternalGuardAction(currentAction) && Number(currentAction?.end_time) > now) continue;
        let action = currentAction;
        if (!isEternalGuardAction(action)
          || Number(action.end_time) <= now + ETERNAL_GUARD_INTERVAL_MS
          || player[stateField] !== '镇守永恒未知之地') {
          action = applyEternalGuardStatus(player, now, actor);
          await Write_player(emperor.id, player);
          await redis.set(actionKey, JSON.stringify(action));
        }
        guardians.push({
          id: emperor.id,
          name: `${player.名号 || emperor.id}（${proxy ? '法身' : '真身'}）`,
          actor,
          guardEndAt: Number(action.end_time) || 0,
        });
      }
    });
  }
  return guardians;
}

function formatTime(timestamp) {
  if (!timestamp) return '尚未排定';
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function threatName(type) {
  return type === DIMENSION_THREAT_TYPES.HIGHLAND_TERROR ? '厄土大恐怖' : '维度灾厄';
}

function destructionSource(type) {
  return type === DIMENSION_THREAT_TYPES.HIGHLAND_TERROR
    ? PLANE_DESTRUCTION_SOURCES.HIGHLAND_TERROR
    : PLANE_DESTRUCTION_SOURCES.DIMENSION_CALAMITY;
}

export class DimensionGuard extends plugin {
  constructor() {
    super({
      name: '永恒未知之地维度镇守',
      dsc: '仙帝镇守永恒未知之地，迎战厄土大恐怖与维度灾厄',
      event: 'message',
      priority: 579,
      rule: [
        { reg: '^#永恒镇守状态$', fnc: 'showStatus' },
        { reg: '^#维度镇守状态$', fnc: 'showStatus' },
        { reg: '^#(?:法身)?镇守永恒未知之地$', fnc: 'startGuard' },
        { reg: '^#(?:结束(?:法身)?镇守|法身结束镇守)永恒未知之地$', fnc: 'stopGuard' },
      ],
    });
    this.task = {
      cron: '0 */1 * * * *',
      name: '永恒镇守与维度灾厄巡查',
      fnc: () => this.tick(),
      log: false,
    };
    this.ticking = false;
  }

  async startGuard(e) {
    if (!verc({ e })) return false;
    const id = String(await channel(String(e.user_id).replace('qg_', '')));
    if (!await existplayer(id)) return e.reply('请先创建修仙角色。');
    const proxy = e.msg.includes('法身');
    const actor = proxy ? 'fashan' : 'body';
    return withPlayerMutationLock(id, async () => {
      const player = await Read_player(id);
      if (!isImmortalEmperorPlayer(player)) return e.reply('永恒镇守需要仙帝及以上权柄。');
      if (proxy && Number(player.法身) !== 1) return e.reply('请先凝聚法身。');
      if (getLocationName(proxy ? player.法身位置 : player.power_place) !== '永恒未知之地') {
        return e.reply(`请先发送 #${proxy ? '法身穿梭 ' : '穿梭'}永恒未知之地，让${proxy ? '法身' : '真身'}抵达镇守位面。`);
      }
      if (getPlaneDestructionInfo(PLANE_FILE, '永恒未知之地').destroyed) {
        return e.reply(buildPlaneDestroyedMessage(PLANE_FILE, '永恒未知之地'));
      }
      if (proxy && Number(player.法身恢复时间) > Date.now()) return e.reply('法身正在恢复，请待恢复后镇守。');
      const key = proxy ? getFashanActionKey(id) : `xiuxian:player:${id}:action`;
      const raw = await redis.get(key);
      const active = readAction(raw);
      if (raw && !active) return e.reply('行动记录异常，请先检查记录。');
      if (isEternalGuardAction(active) && isGuardingEternal(player, actor)) return e.reply('当前已在镇守，无需重复开始。');
      if (!isEternalGuardAction(active)
        && (proxy ? isFashanActionPending(active) || player.法身状态 === '行动中' : Number(active?.end_time) > Date.now())) {
        return e.reply(`请先结束${proxy ? '法身' : '真身'}当前行动，再开始镇守。`);
      }
      const action = applyEternalGuardStatus(player, Date.now(), actor);
      await Write_player(id, player);
      await redis.set(key, JSON.stringify(action));
      return e.reply(`【永恒镇守】${proxy ? '法身' : '真身'}已接管防线；每次成功抵御维度灾厄获得${ETERNAL_GUARD_ERA_REWARD}点纪元积累（受当前上限约束，同一玩家每轮一次）。可发送 #结束${proxy ? '法身' : ''}镇守永恒未知之地 撤下镇守。`);
    });
  }

  async stopGuard(e) {
    if (!verc({ e })) return false;
    const id = String(await channel(String(e.user_id).replace('qg_', '')));
    if (!await existplayer(id)) return e.reply('请先创建修仙角色。');
    const proxy = e.msg.includes('法身');
    return withPlayerMutationLock(id, async () => {
      const player = await Read_player(id);
      const key = proxy ? getFashanActionKey(id) : `xiuxian:player:${id}:action`;
      const action = readAction(await redis.get(key));
      if (proxy) {
        player.法身永恒镇守 = false;
        if (isEternalGuardAction(action) || player.法身行动 === '镇守永恒未知之地') {
          player.法身状态 = '空闲中';
          player.法身行动 = '无行动';
        }
      } else {
        player.永恒镇守已结束 = true;
        if (player.修仙状态 === '镇守永恒未知之地') player.修仙状态 = '空闲';
        delete player.永恒镇守结束时间;
      }
      await Write_player(id, player);
      if (isEternalGuardAction(action)) await redis.del(key);
      return e.reply(`【结束镇守】${proxy ? '法身' : '真身'}已退出永恒镇守，位置保持不变，巡查不会自动重新接管。再次镇守请发送 #${proxy ? '法身' : ''}镇守永恒未知之地。`);
    });
  }

  async settleGuardRewards(state) {
    const pending = state.pendingGuardReward;
    if (!pending) return [];
    const messages = [];
    for (const id of pending.playerIds) {
      if (!await existplayer(id)) continue;
      await withPlayerMutationLock(id, async () => {
        const player = await Read_player(id);
        if (Number(player.永恒镇守奖励时间) >= pending.dueAt) return;
        const reward = addCappedEraAccumulation(player, ETERNAL_GUARD_ERA_REWARD);
        player.永恒镇守奖励时间 = pending.dueAt;
        await Write_player(id, player);
        messages.push(`${player.名号 || id}：纪元积累+${reward.gained}（${reward.after}/${reward.cap}）`);
      });
    }
    delete state.pendingGuardReward;
    saveState(state);
    return messages;
  }

  async broadcast(message) {
    const set = config.getConfig('xiuxian', 'xiuxian');
    const configured = Array.isArray(set?.Era?.notifyGroups) ? set.Era.notifyGroups : [];
    const fallback = configured.length
      ? []
      : await redis.sMembers('xiuxian:AuctionofficialTask_GroupList');
    for (const groupId of new Set([...configured, ...fallback])) {
      try {
        await Bot.pickGroup(groupId).sendMsg(message);
      } catch (error) {
        logger.warn(`[维度镇守] 群${groupId}广播失败：${error.message}`);
      }
    }
  }

  async tick() {
    return runTaskOnce('DimensionGuard', () => this.tickOnce());
  }

  async tickOnce() {
    if (this.ticking) return false;
    this.ticking = true;
    try {
      const now = Date.now();
      const state = readState();
      await this.settleGuardRewards(state);
      const emperors = await findImmortalEmperors();
      const guardians = await syncEternalGuardActions(emperors, now);
      const result = advanceDimensionGuardState(state, {
        now,
        emperorAppeared: emperors.length > 0,
        guarded: guardians.length > 0,
        highlandDestroyed: highlandDestroyed(),
      });
      if (result.event?.type === 'guard-defense'
        && result.event.threatType === DIMENSION_THREAT_TYPES.DIMENSION_CALAMITY) {
        result.state.pendingGuardReward = {
          dueAt: result.event.dueAt,
          playerIds: [...new Set(guardians.map(item => item.id))],
        };
      }
      saveState(result.state);
      const rewards = await this.settleGuardRewards(result.state);

      if (!result.event) return false;
      if (result.event.type === 'emperor-era-started') {
        await this.broadcast([
          '【仙帝纪元·高维灾厄苏醒】',
          '世间第一缕路尽级帝光照破古史，沉寂于维度之外的存在同时睁开了眼。',
          '从此，厄土大恐怖与维度灾厄每小时进入一次来袭判定。',
          `当前镇守仙帝：${guardians.map((item) => item.name).join('、') || '无'}`,
        ].join('\n'));
        return true;
      }

      const incomingThreat = threatName(result.event.threatType);
      if (result.event.type === 'guard-defense') {
        await this.broadcast([
          `【永恒大战·${incomingThreat}来袭】`,
          `${guardians.map((item) => item.name).join('、')}镇守永恒未知之地，与高维来敌征战。`,
          '帝光横断万古，本轮来袭已被挡在上苍之外，诸天万界得以延续。',
          ...rewards,
          `累计击退：${result.state.defenseCount}次｜下轮来袭：${formatTime(result.state.nextAssaultAt)}`,
        ].join('\n'));
        return true;
      }

      const destroyed = markPlanesDestroyed(PLANE_FILE, result.event.targets, {
        source: destructionSource(result.event.threatType),
        actor: incomingThreat,
      });
      await this.broadcast([
        `【维度灾厄·永恒失守】`,
        `仙帝纪元已经开启，永恒未知之地却无人镇守，${incomingThreat}越过了最后防线。`,
        '大恐怖席卷而下，上苍之上与诸天万界的现世锚点被逐一打灭。',
        `本次覆灭位面：${destroyed.join('、') || '暂无可写入位面'}`,
        '仙帝真身或法身开始镇守后，可阻止下一轮灾厄；已毁位面需以映照权能重塑。',
      ].join('\n'));
      return true;
    } finally {
      this.ticking = false;
    }
  }

  async showStatus(e) {
    await this.tick();
    const state = readState();
    const emperors = await findImmortalEmperors();
    const guardians = await syncEternalGuardActions(emperors, Date.now());
    const lines = [
      '【维度镇守·永恒未知之地】',
      `仙帝纪元：${state.emperorEraStartedAt ? `已于${formatTime(state.emperorEraStartedAt)}开启` : '尚未开启，高维灾厄沉寂'}`,
      `厄土大恐怖：${state.emperorEraStartedAt ? (highlandDestroyed() ? '随厄土覆灭而沉寂' : '活跃') : '沉寂'}`,
      `维度灾厄：${state.emperorEraStartedAt ? '活跃' : '沉寂'}`,
      `当前镇守仙帝：${guardians.length ? guardians.map((item) => item.name).join('、') : '无'}`,
      `镇守状态：${guardians.length ? `永恒防线（${ETERNAL_GUARD_DURATION_MINUTES}分钟循环续持）` : '无人承担镇守责任'}`,
      '真身、法身可分别镇守；对应行动独立占用，结束后须手动重新开始。',
      `击退维度灾厄奖励：每名镇守玩家每轮${ETERNAL_GUARD_ERA_REWARD}点纪元积累，受当前上限约束，双身不重复领取。`,
      '#镇守永恒未知之地 / #结束镇守永恒未知之地',
      '#法身镇守永恒未知之地 / #结束法身镇守永恒未知之地',
      `下一轮来袭：${formatTime(state.nextAssaultAt)}`,
      `来袭${state.assaultCount || 0}次｜击退${state.defenseCount || 0}次｜失守${state.calamityCount || 0}次`,
    ];
    return e.reply(lines.join('\n'));
  }
}
