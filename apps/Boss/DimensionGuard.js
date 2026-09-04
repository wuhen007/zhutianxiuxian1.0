import fs from 'node:fs';
import path from 'node:path';

import { config, data, plugin } from '../../api/api.js';
import {
  Read_player,
  Write_player,
  __PATH,
} from '../../model/xiuxian.js';
import {
  markPlanesDestroyed,
  PLANE_DESTRUCTION_SOURCES,
} from '../../model/planeDestruction.js';
import {
  DIMENSION_THREAT_TYPES,
  ETERNAL_GUARD_DURATION_MINUTES,
  ETERNAL_GUARD_INTERVAL_MS,
  advanceDimensionGuardState,
  applyEternalGuardStatus,
  createDimensionGuardState,
  isEternalGuardAction,
  isGuardingEternal,
  isImmortalEmperorPlayer,
} from '../../model/dimensionGuard.js';
import { writeJsonAtomically } from '../../utils/atomicJson.js';

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
    const actionKey = `xiuxian:player:${emperor.id}:action`;
    const currentAction = readAction(await redis.get(actionKey));
    const guarding = isGuardingEternal(emperor.player);

    // 穿梭流程会先写入目标位面，再等待 TravelTask 结算；期间不能被镇守巡查接管。
    if (guarding && isActiveTravelAction(currentAction, now)) continue;

    if (!guarding) {
      if (isEternalGuardAction(currentAction)) await redis.del(actionKey);
      if (emperor.player.修仙状态 === '镇守永恒未知之地') {
        emperor.player.修仙状态 = '空闲';
        delete emperor.player.永恒镇守结束时间;
        await Write_player(emperor.id, emperor.player);
      }
      continue;
    }

    const needsRenewal = !isEternalGuardAction(currentAction)
      || Number(currentAction.end_time) <= now + ETERNAL_GUARD_INTERVAL_MS;
    let action = currentAction;
    if (needsRenewal) {
      action = applyEternalGuardStatus(emperor.player, now);
      await Write_player(emperor.id, emperor.player);
      await redis.set(actionKey, JSON.stringify(action));
    } else if (emperor.player.修仙状态 !== '镇守永恒未知之地') {
      emperor.player.修仙状态 = '镇守永恒未知之地';
      emperor.player.永恒镇守开始时间 ||= Number(action.start_time) || now;
      emperor.player.永恒镇守结束时间 = Number(action.end_time) || 0;
      await Write_player(emperor.id, emperor.player);
    }

    guardians.push({
      ...emperor,
      guardEndAt: Number(action?.end_time) || 0,
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
    if (this.ticking) return false;
    this.ticking = true;
    try {
      const now = Date.now();
      const emperors = await findImmortalEmperors();
      const guardians = await syncEternalGuardActions(emperors, now);
      const result = advanceDimensionGuardState(readState(), {
        now,
        emperorAppeared: emperors.length > 0,
        guarded: guardians.length > 0,
        highlandDestroyed: highlandDestroyed(),
      });
      saveState(result.state);

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
          `${guardians.map((item) => item.name).join('、')}真身镇守永恒未知之地，与高维来敌每时每刻征战。`,
          '帝光横断万古，本轮来袭已被挡在上苍之外，诸天万界得以延续。',
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
        '仙帝真身归位永恒未知之地后，方可阻止下一轮灾厄；已毁位面需以映照权能重塑。',
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
      `真身状态：${guardians.length ? `镇守永恒未知之地（${ETERNAL_GUARD_DURATION_MINUTES}分钟循环续持）` : '无人承担镇守责任'}`,
      '镇守期间真身每时每刻都在大战，法身可在诸天代行并刷取副本。',
      `下一轮来袭：${formatTime(state.nextAssaultAt)}`,
      `来袭${state.assaultCount || 0}次｜击退${state.defenseCount || 0}次｜失守${state.calamityCount || 0}次`,
    ];
    return e.reply(lines.join('\n'));
  }
}
