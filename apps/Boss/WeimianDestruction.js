/**
 * 诡异大祭·位面破坏系统
 * 
 * 圣墟原著设定：
 * 诡异大祭期间，厄土仙帝与始祖攻击大千宇宙，
 * 将位面连同其中的亿万生灵一起打爆——
 * 形神俱灭，坠入永寂之界！
 * 唯准仙帝及以上境界，方能在这灭世浩劫中存活。
 * 
 * 机制：
 * - 诡异大祭开启后保留一次开场预警，后续按诸天纪年节点随机破坏位面
 * - 该位面所有低于准仙帝的玩家 → 入永寂（存档备份到永寂者列表，正式数据清除）
 * - 准仙帝及以上玩家 → 存活，传送至凡间
 * - 被破坏的位面持续封锁，直至仙帝级及以上力量修复
 * - 永寂者可被仙帝映照权能召唤归来
 */

import fs from 'fs';
import path from 'path';
import { data, config } from '../../api/api.js';
import { Write_player } from '../../model/xiuxian.js';
import { sendToYongJi } from './YongJiList.js';
import { getRealmEventWorldYear } from '../../model/realmEventClock.js';
import { hasRealmAuthority } from '../../model/realmAuthority.js';
import {
  markPlaneDestroyed,
  PLANE_DESTRUCTION_SOURCES,
  repairDestroyedPlanes,
  repairPlane,
} from '../../model/planeDestruction.js';

// ==================== 配置常量 ====================

/**
 * 位面毁灭跟随诸天位面的纪年推进。
 * EraChangeTask 默认每次推进 1000 年，因此每两个推进节点触发一轮毁灭。
 */
const DESTRUCTION_WORLD_YEAR_INTERVAL = 2000;
const CLOCK_POLL_INTERVAL = 30 * 1000;
const FIRST_WAVE_DELAY = 10 * 1000;

/** 存活最低权柄：等效准仙帝 = 权柄等级 >= 20 */
const ZHUNXIAN_THRESHOLD = 20;

/** 可被破坏的位面（按圣墟原著，越底层越先遭殃；仙域虽是终局，诡异大祭期间厄土仙帝亦能染指） */
const DESTROYABLE_PLANES = [
  { id: 0,   name: '凡间',       desc: '亿万生灵的起点，在厄土仙帝掌中不过一缕青烟' },
  { id: 1,   name: '仙界',       desc: '仙道昌盛万古，此刻却成了最丰厚的祭品' },
  { id: 1.5, name: '下界八域',   desc: '八域崩裂，古教传承化为劫灰，万灵哀嚎' },
  { id: 2,   name: '遮天位面',   desc: '大帝道统，禁区林立，终究化为齑粉' },
  { id: 2.5, name: '九天十地',   desc: '仙王故土，乱古战场，在祭道之力下土崩瓦解' },
  { id: 3,   name: '界海',       desc: '准仙帝喋血之地，黑暗源头，终难逃破灭' },
  { id: 6,   name: '仙域',       desc: '诸天至高之地，厄土仙帝的真正目标——万古仙域，就此陨落' },
];

/** 不可破坏的终局位面（仅时间长河与永恒未知，因果缠绕/超脱轮回） */
const IMMUNE_PLANES = {
  4: '时间长河',   // 超脱时间本质，因果缠绕，厄土仙帝亦难彻底抹去
  5: '永恒未知',   // 一切终结之地，连诡异始祖都无法触碰
};

/** 位面ID→名称映射 */
const PLANE_NAMES = {
  0: '凡间', 1: '仙界', 1.5: '下界八域',
  2: '遮天位面', 2.5: '九天十地', 3: '界海',
  4: '时间长河', 5: '永恒未知之地', 6: '仙域',
};

// ==================== 运行时状态 ====================

const timerState = globalThis[Symbol.for('zhutianxiuxian.weimianDestructionTimers')] ??= {
  destructionTimer: null,
  firstWaveTimer: null,
};
let destructionInProgress = false;
let destroyedPlanes = new Set();
let protectedPlanes = new Set();
let nextDestructionWorldYear = 0;

const DESTRUCTION_REDIS_KEYS = {
  destroyed: 'xiuxian:weimian_destruction:destroyed',
  protected: 'xiuxian:weimian_destruction:protected',
  rescueUsed: 'xiuxian:weimian_destruction:rescue_used',
  currentTargets: 'xiuxian:weimian_destruction:current_targets',
  nextWorldYear: 'xiuxian:weimian_destruction:next_world_year',
  lastRepairWorldYear: 'xiuxian:weimian_destruction:last_repair_world_year',
  timerActive: 'xiuxian:weimian_destruction:timer_active',
};

function currentWorldYear() {
  try {
    const era = config.getConfig('xiuxian', 'xiuxian')?.Era || {};
    const current = era.current || {};
    const totalYears = Number(current.totalYears);
    if (Number.isFinite(totalYears)) return Math.max(0, totalYears);
    return getRealmEventWorldYear(current.index, current.years, current.epoch);
  } catch (e) {
    return 0;
  }
}

function currentPlaneLevel() {
  try {
    const obj = JSON.parse(fs.readFileSync(data.filePathMap.weimianList, 'utf8'));
    const level = Number(obj?.['诸天位面']);
    return Number.isFinite(level) ? Math.max(1, level) : 1;
  } catch {
    return 1;
  }
}

function destructionWorldYearInterval() {
  try {
    const configured = Number(config.getConfig('xiuxian', 'xiuxian')?.Era?.weimianRepairInterval);
    if (Number.isFinite(configured) && configured > 0) return configured;
  } catch (e) {}
  return DESTRUCTION_WORLD_YEAR_INTERVAL;
}

function persistDestructionState() {
  return Promise.all([
    redis.set(DESTRUCTION_REDIS_KEYS.destroyed, JSON.stringify([...destroyedPlanes])),
    redis.set(DESTRUCTION_REDIS_KEYS.protected, JSON.stringify([...protectedPlanes])),
    redis.set(DESTRUCTION_REDIS_KEYS.nextWorldYear, String(nextDestructionWorldYear)),
  ]);
}

function cancelDestructionTimer(timer) {
  if (!timer) return;
  if (typeof timer.cancel === 'function') timer.cancel();
  else clearInterval(timer);
}

function readActiveEvent() {
  return redis.get('guiyishizu');
}

async function loadDestructionState() {
  try {
    const [saved, savedProtected, savedNext] = await Promise.all([
      redis.get(DESTRUCTION_REDIS_KEYS.destroyed),
      redis.get(DESTRUCTION_REDIS_KEYS.protected),
      redis.get(DESTRUCTION_REDIS_KEYS.nextWorldYear),
    ]);
    destroyedPlanes = saved ? new Set(JSON.parse(saved)) : new Set();
    protectedPlanes = savedProtected ? new Set(JSON.parse(savedProtected)) : new Set();
    const parsedNext = Number(savedNext);
    nextDestructionWorldYear = Number.isFinite(parsedNext) && parsedNext > 0
      ? parsedNext
      : currentWorldYear() + destructionWorldYearInterval();
  } catch (e) {
    destroyedPlanes = new Set();
    protectedPlanes = new Set();
    nextDestructionWorldYear = currentWorldYear() + destructionWorldYearInterval();
  }
}

async function startWorldClockDestruction() {
  await loadDestructionState();
  cancelDestructionTimer(timerState.destructionTimer);
  timerState.destructionTimer = null;
  if (timerState.firstWaveTimer) clearTimeout(timerState.firstWaveTimer);
  const firstWaveTimer = setTimeout(async () => {
    if (timerState.firstWaveTimer !== firstWaveTimer) return;
    timerState.firstWaveTimer = null;
    await destroyRandomPlane();
  }, FIRST_WAVE_DELAY);
  timerState.firstWaveTimer = firstWaveTimer;
  firstWaveTimer.unref?.();

  const destructionTimer = setInterval(async () => {
    if (destructionInProgress) return;
    const year = currentWorldYear();
    if (year < nextDestructionWorldYear) return;
    await destroyRandomPlane();
    if (timerState.destructionTimer !== destructionTimer) return;
    nextDestructionWorldYear = Math.max(nextDestructionWorldYear + destructionWorldYearInterval(), year + 1);
    try {
      await redis.set(DESTRUCTION_REDIS_KEYS.nextWorldYear, String(nextDestructionWorldYear));
    } catch (e) {}
  }, CLOCK_POLL_INTERVAL);
  timerState.destructionTimer = destructionTimer;
  destructionTimer.unref?.();
  await redis.set(DESTRUCTION_REDIS_KEYS.timerActive, 'true');
  logger.info(`[诡异大祭] 诸天纪年时钟启动 | 当前:${currentWorldYear()} | 下一轮:${nextDestructionWorldYear}`);
}

async function getWorldClockDestructionStatus() {
  let destroyedList = [...destroyedPlanes];
  let protectedList = [...protectedPlanes];
  let savedNext = nextDestructionWorldYear;
  let active = false;
  let rescueUsed = false;
  let lastRepairWorldYear = null;
  try {
    const [timer, destroyed, protectedValue, next, used, lastRepair] = await Promise.all([
      redis.get(DESTRUCTION_REDIS_KEYS.timerActive),
      redis.get(DESTRUCTION_REDIS_KEYS.destroyed),
      redis.get(DESTRUCTION_REDIS_KEYS.protected),
      redis.get(DESTRUCTION_REDIS_KEYS.nextWorldYear),
      redis.get(DESTRUCTION_REDIS_KEYS.rescueUsed),
      redis.get(DESTRUCTION_REDIS_KEYS.lastRepairWorldYear),
    ]);
    active = timer === 'true';
    if (destroyed) destroyedList = JSON.parse(destroyed);
    if (protectedValue) protectedList = JSON.parse(protectedValue);
    const parsedNext = Number(next);
    if (Number.isFinite(parsedNext) && parsedNext > 0) savedNext = parsedNext;
    rescueUsed = Boolean(used);
    lastRepairWorldYear = Number(lastRepair);
  } catch (e) {}

  const remaining = DESTROYABLE_PLANES.filter(p => !destroyedList.includes(p.id));
  const immune = Object.keys(IMMUNE_PLANES).map(Number).map(id => IMMUNE_PLANES[id]);
  return {
    active,
    destroyed: destroyedList.map(id => PLANE_NAMES[id] || `未知(${id})`),
    remaining: remaining.map(p => p.name),
    protected: protectedList.map(id => PLANE_NAMES[id] || `未知(${id})`),
    immune,
    totalDestroyable: DESTROYABLE_PLANES.length,
    destroyedCount: destroyedList.length,
    interval: destructionWorldYearInterval(),
    intervalUnit: 'world-year',
    worldYear: currentWorldYear(),
    nextWorldYear: savedNext,
    planeLevel: currentPlaneLevel(),
    rescueUsed,
    lastRepairWorldYear: Number.isFinite(lastRepairWorldYear) ? lastRepairWorldYear : null,
    threshold: ZHUNXIAN_THRESHOLD,
  };
}

async function isDestructionEventActive() {
  const dajie = await readActiveEvent();
  if (dajie) {
    try {
      if (!JSON.parse(dajie).isEternallyDefeated) return true;
    } catch (e) {
      return true;
    }
  }
  return false;
}

/**
 * 帝境修士可以在一次位面毁灭波次前救场：封住一个位面并撤离其中低境界修士。
 */
export async function rescuePlaneForPlayer(qq) {
  const playerId = String(qq).replace('qg_', '');
  if (!(await isDestructionEventActive())) {
    return { ok: false, reason: '黑暗动乱尚未降临' };
  }
  const player = await data.getData('player', playerId);
  if (!player) return { ok: false, reason: '角色不存在' };
  if (!hasRealmAuthority(player, 16)) {
    return { ok: false, reason: '至少需要大帝境界才能撑开救援通道' };
  }
  if (await redis.get(DESTRUCTION_REDIS_KEYS.rescueUsed)) {
    return { ok: false, reason: '本次黑暗动乱的救场帝印已经用尽' };
  }

  await loadDestructionState();
  const remaining = DESTROYABLE_PLANES.filter(p => !destroyedPlanes.has(p.id) && !protectedPlanes.has(p.id));
  const ownPlane = remaining.find(p => p.id === Number(player.power_place));
  const target = ownPlane || remaining[0];
  if (!target) return { ok: false, reason: '所有可救援位面均已毁灭或受到保护' };

  const evacuatedNames = [];
  try {
    const playerDir = data.filePathMap.player;
    const files = fs.existsSync(playerDir) ? fs.readdirSync(playerDir).filter(file => file.endsWith('.json')) : [];
    for (const file of files) {
      const targetQq = file.replace('.json', '');
      const targetPlayer = await data.getData('player', targetQq);
      if (!targetPlayer || Number(targetPlayer.power_place) !== Number(target.id)) continue;
      if (hasRealmAuthority(targetPlayer, ZHUNXIAN_THRESHOLD)) continue;
      targetPlayer.power_place = 0;
      targetPlayer.位面救援记录 = {
        rescuer: player.名号 || playerId,
        source: target.name,
        worldYear: currentWorldYear(),
      };
      await Write_player(targetQq, targetPlayer);
      evacuatedNames.push(targetPlayer.名号 || targetQq);
    }
  } catch (e) {
    logger.error('[诡异大祭] 救场撤离失败:', e.message);
  }

  protectedPlanes.add(target.id);
  await redis.set(DESTRUCTION_REDIS_KEYS.rescueUsed, JSON.stringify({
    qq: playerId,
    name: player.名号 || playerId,
    planeId: target.id,
    worldYear: currentWorldYear(),
  }));
  await persistDestructionState();

  const groups = await getGroupList();
  await sendToAllGroups(groups, [
    '【帝者救场·万灵西迁】',
    `${player.名号 || playerId}撕开帝道裂缝，护住「${target.name}」。`,
    `低境界修士已撤离 ${evacuatedNames.length} 人；此位面将在本次黑暗动乱中免于毁灭。`,
  ].join('\n'));
  return { ok: true, plane: target, evacuated: evacuatedNames.length, evacuatedNames };
}

// ==================== 公开接口 ====================

/**
 * 开始位面破坏定时器
 * 在诡异大祭开启时由BOSS3.js调用
 */
export async function startWeimianDestruction() {
  await startWorldClockDestruction();
}

/**
 * 停止位面破坏定时器
 * 诡异大祭结束时由BOSS3.js调用
 */
export async function stopWeimianDestruction() {
  cancelDestructionTimer(timerState.destructionTimer);
  timerState.destructionTimer = null;
  if (timerState.firstWaveTimer) clearTimeout(timerState.firstWaveTimer);
  timerState.firstWaveTimer = null;
  destructionInProgress = false;
  protectedPlanes = new Set();
  nextDestructionWorldYear = 0;
  try {
    await redis.del(
      DESTRUCTION_REDIS_KEYS.protected,
      DESTRUCTION_REDIS_KEYS.rescueUsed,
      DESTRUCTION_REDIS_KEYS.currentTargets,
      DESTRUCTION_REDIS_KEYS.nextWorldYear,
      DESTRUCTION_REDIS_KEYS.lastRepairWorldYear,
      DESTRUCTION_REDIS_KEYS.timerActive,
    );
  } catch (e) {}
  logger.info('[诡异大祭] 位面破坏系统停止，厄土仙帝造成的位面崩灭保留至仙帝映照修复');
  return true;
}

/**
 * 获取当前位面破坏状态
 * 供 #位面毁灭状态 命令使用
 */
export async function getDestructionStatus() {
  return getWorldClockDestructionStatus();
}

/**
 * 检查指定位面是否已被破坏
 */
export function isPlaneDestroyed(planeId) {
  return destroyedPlanes.has(planeId);
}

/**
 * 修复所有被破坏的位面（映照诸天后调用）
 * 清除内存状态、Redis记录、位面.json三处同步
 */
export async function repairAllDestroyedPlanes(options = {}) {
  const requestedWorldYear = Number(options.worldYear);
  const repairWorldYear = Number.isFinite(requestedWorldYear)
    ? Math.max(0, requestedWorldYear)
    : currentWorldYear();
  const repaired = repairDestroyedPlanes(data.filePathMap.weimianList);
  destroyedPlanes.clear();
  protectedPlanes.clear();
  nextDestructionWorldYear = repairWorldYear + destructionWorldYearInterval();
  try {
    await redis.del(
      DESTRUCTION_REDIS_KEYS.destroyed,
      DESTRUCTION_REDIS_KEYS.protected,
      DESTRUCTION_REDIS_KEYS.rescueUsed,
      DESTRUCTION_REDIS_KEYS.currentTargets,
    );
    await redis.set(DESTRUCTION_REDIS_KEYS.nextWorldYear, String(nextDestructionWorldYear));
    await redis.set(DESTRUCTION_REDIS_KEYS.lastRepairWorldYear, String(repairWorldYear));
  } catch (e) {}
  logger.info(`[诡异大祭] 位面修复完成 | 修复:${repaired.length} | 纪年:${repairWorldYear}`);
  return { repaired, repairedCount: repaired.length, worldYear: repairWorldYear };
}

/**
 * 修复单个被破坏的位面（映照指定位面后调用）
 * @param {number} planeId - 位面ID
 * @returns {boolean} 是否成功修复（false表示该位面未被破坏）
 */
export async function repairSinglePlane(planeId) {
  planeId = Number(planeId);
  const repairedPlaneName = PLANE_NAMES[planeId];
  if (!repairedPlaneName || !repairPlane(data.filePathMap.weimianList, repairedPlaneName)) return false;
  destroyedPlanes.delete(planeId);
  protectedPlanes.delete(planeId);
  try {
    await redis.set(DESTRUCTION_REDIS_KEYS.destroyed, JSON.stringify([...destroyedPlanes]));
    await redis.set(DESTRUCTION_REDIS_KEYS.protected, JSON.stringify([...protectedPlanes]));
    await redis.set(DESTRUCTION_REDIS_KEYS.lastRepairWorldYear, String(currentWorldYear()));
  } catch (e) {}
  logger.info(`[诡异大祭] 仙帝映照——位面「${repairedPlaneName || planeId}」已修复`);
  return true;
}

/** 管理员按位面名称修复，同时同步运行时毁灭状态。 */
export async function repairDestroyedPlaneByName(planeName) {
  const name = String(planeName || '').trim();
  if (!repairPlane(data.filePathMap.weimianList, name)) return false;
  const planeId = Object.keys(PLANE_NAMES).find(id => PLANE_NAMES[id] === name);
  if (planeId !== undefined) {
    destroyedPlanes.delete(Number(planeId));
    protectedPlanes.delete(Number(planeId));
  }
  try {
    await redis.set(DESTRUCTION_REDIS_KEYS.destroyed, JSON.stringify([...destroyedPlanes]));
    await redis.set(DESTRUCTION_REDIS_KEYS.protected, JSON.stringify([...protectedPlanes]));
    await redis.set(DESTRUCTION_REDIS_KEYS.lastRepairWorldYear, String(currentWorldYear()));
  } catch (e) {}
  logger.info(`[诡异大祭] 管理员恢复位面「${name}」`);
  return true;
}

// ==================== 核心破坏逻辑 ====================

/**
 * 随机选择一个可破坏位面并执行破坏
 */
async function destroyWorldClockPlane() {
  if (destructionInProgress) return;
  destructionInProgress = true;
  try {
    if (!(await isDestructionEventActive())) {
      await stopWeimianDestruction();
      return;
    }

    const remaining = DESTROYABLE_PLANES.filter(
      plane => !destroyedPlanes.has(plane.id) && !protectedPlanes.has(plane.id),
    );
    if (remaining.length === 0) {
      logger.info('[诡异大祭] 本轮可毁位面均已被毁或受到帝者保护');
      return;
    }

    const targets = [...remaining]
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(2, remaining.length));
    await redis.set(DESTRUCTION_REDIS_KEYS.currentTargets, JSON.stringify(targets.map(target => target.id)));

    for (let index = 0; index < targets.length; index++) {
      const target = targets[index];
      const result = await destroyPlane(target);
      destroyedPlanes.add(target.id);
      markPlaneDestroyed(data.filePathMap.weimianList, target.name, {
        source: PLANE_DESTRUCTION_SOURCES.STRANGE_EMPEROR,
        actor: '厄土仙帝',
        worldYear: currentWorldYear(),
      });
      await broadcastDestruction(target, result);
      if (index < targets.length - 1) await new Promise(resolve => setTimeout(resolve, 1500));
    }

    await persistDestructionState();
    if (destroyedPlanes.size >= DESTROYABLE_PLANES.length) await sendFinalWarning();
  } catch (err) {
    logger.error('[诡异大祭] 位面破坏失败:', err);
  } finally {
    destructionInProgress = false;
    try {
      await redis.del(DESTRUCTION_REDIS_KEYS.currentTargets);
    } catch (e) {}
  }
}

async function destroyRandomPlane() {
  return destroyWorldClockPlane();
}

/**
 * 破坏指定位面
 * 扫描该位面所有玩家，准仙帝以下入永寂，以上存活
 * 
 * @param {Object} planeInfo - { id, name, desc }
 * @returns {{ yongji: number, survived: number, survivorNames: string[], yongjiNames: string[] }}
 */
async function destroyPlane(planeInfo) {
  let yongji = 0;
  let survived = 0;
  const survivorNames = [];
  const yongjiNames = [];

  try {
    const playerDir = data.filePathMap.player;
    if (!fs.existsSync(playerDir)) {
      logger.warn(`[诡异大祭] 玩家数据目录不存在: ${playerDir}`);
      return { yongji: 0, survived: 0, survivorNames: [], yongjiNames: [] };
    }

    const files = fs.readdirSync(playerDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const qq = file.replace('.json', '');

      try {
        const playerData = await data.getData('player', qq);
        if (!playerData) continue;

        // 检查是否在目标位面
        if (Number(playerData.power_place) !== Number(planeInfo.id)) continue;

        // 检查寂灭状态——如果玩家正在寂灭中，视为已在厄土高原（不在本位面）
        let inOblivion = false;
        try {
          const oblivionData = await redis.get(`xiuxian:player:${qq}:oblivion`);
          if (oblivionData) {
            const oblivion = JSON.parse(oblivionData);
            if (Date.now() < oblivion.endTime) {
              inOblivion = true;
            }
          }
        } catch (e) {}
        if (inOblivion) continue; // 寂灭中的玩家不受位面破坏影响

        const playerName = playerData.名号 || qq;

        if (hasRealmAuthority(playerData, ZHUNXIAN_THRESHOLD)) {
          // ✅ 准仙帝及以上：存活，传送至凡间
          playerData.power_place = 0;
          await Write_player(qq, playerData);
          survived++;
          survivorNames.push(playerName);

          logger.info(`[诡异大祭] ✓ ${playerName}(${qq}) 准仙帝修为，于位面崩灭中存活`);
        } else {
          // 🔴 境界不足：形神俱灭，入永寂之界（存档备份，现世数据清除）
          const ok = await sendToYongJi(qq, playerData, planeInfo.id, planeInfo.name);
          if (ok) {
            yongji++;
            yongjiNames.push(playerName);
            logger.info(`[诡异大祭] ✗ ${playerName}(${qq}) 坠入永寂之界`);
          }
        }
      } catch (playerErr) {
        logger.error(`[诡异大祭] 处理玩家${qq}失败:`, playerErr.message);
      }
    }
  } catch (err) {
    logger.error('[诡异大祭] 扫描玩家文件失败:', err.message);
  }

  return { yongji, survived, survivorNames, yongjiNames };
}

// ==================== 广播系统 ====================

/**
 * 全服广播位面破坏消息
 */
async function broadcastDestruction(planeInfo, result) {
  const groupList = await getGroupList();

  // 随机厄土仙帝台词（圣墟风格）
  const ancestorQuotes = [
    '「这个位面，碍眼太久了。」',
    '「蝼蚁栖身之所，也配称世界？」',
    '「祭掉此界，为大祭添一份薪柴。」',
    '「亿万生灵？不过是祭坛上的一缕青烟罢了。」',
    '「尔等的存在本身，便是对大祭的亵渎。」',
    '「厄土高原之下，万物皆为蝼蚁——连蝼蚁都不如。」',
    '「这一掌，祭掉一界因果——又何妨？」',
    '「诸天万界，终将归于永恒的黑暗，我只是……顺势而为。」',
    '「俯瞰诸天，汝等不过困笼之虫，挣扎无益。」',
    '「大祭的祭品，从来就不是一界一域——而是这整个现世！」',
    '「尔等呼唤的仙帝，又在何处？」',
    '「仙域又怎样？本帝一手打爆，不过须臾之事。」',
  ];

  const quote = ancestorQuotes[Math.floor(Math.random() * ancestorQuotes.length)];

  const totalCount = result.yongji + result.survived;
  const intervalSec = destructionWorldYearInterval();

  // 分3段发送，每段简短清晰，避免特殊Unicode字符导致NT内核超时
  const part1 = [
    `诡异大祭 - 位面崩灭`,
    `厄土高原之上，黑雾骤然沸腾！`,
    `厄土仙帝的身影在虚空中骤然凝聚——`,
    `那双眼眸冷冷注视着`,
    `【${planeInfo.name}】`,
    ``,
    `他缓缓抬起那只蕴含诡异物质的巨掌——`,
    `${quote}`,
  ].join('\n');

  const part2 = [
    `轰！！！！`,
    `位面「${planeInfo.name}」——崩灭了！`,
    `${planeInfo.desc}`,
    ``,
    totalCount > 0 ? `位面内${totalCount}位修士中：` : `该位面空无一人……但它的毁灭本身，就是对诸天的警告。`,
  ];
  if (result.yongji > 0) part2.push(`> 坠入永寂：${result.yongji}人（形神俱灭，沉眠于永寂之界）`);
  if (result.survived > 0) part2.push(`> 侥幸存活：${result.survived}人（准仙帝及以上，传送至凡间）`);
  if (result.survivorNames.length > 0) {
    part2.push(`存活者：${result.survivorNames.join('、')}`);
  } else if (result.yongji > 0) {
    part2.push(`无人生还……`);
  }
  if (result.yongji > 0) part2.push(`永寂者如欲归来，需得仙帝「映照」权能救赎。`);
  const msg2 = part2.join('\n');

  const part3 = [
    `「尔等听着——」`,
    `「这，仅仅只是开始。」`,
    `「大祭的祭品，从来就不是一界一域。」`,
    `「而是这——整个诸天万界！」`,
    ``,
    `【下一位面将在诸天纪年推进${intervalSec}年后被破坏】`,
  ].join('\n');

  // 分段发送，每段间隔800ms
  await sendToAllGroups(groupList, part1);
  await new Promise(r => setTimeout(r, 800));
  await sendToAllGroups(groupList, msg2);
  await new Promise(r => setTimeout(r, 800));
  await sendToAllGroups(groupList, part3);
}

/**
 * 最终警告（所有可破坏位面即将/已被全灭）
 */
async function sendFinalWarning() {
  const groupList = await getGroupList();

  const remaining = DESTROYABLE_PLANES.filter(p => !destroyedPlanes.has(p.id));

  let msg;
  if (remaining.length === 0) {
    msg = [
      `诡异大祭 - 诸天终末`,
      ``,
      `所有可破坏的位面，皆已化为虚无……`,
      ``,
      `厄土高原之上，十大始祖齐齐睁开双眼，`,
      `他们的目光交汇，贯穿古今未来——`,
      ``,
      `「诸天万界，祭品已备。」`,
      `「接下来——」`,
      `「便是我族大祭的真正高潮！」`,
      ``,
      `「祭掉现世！葬下永恒！」`,
      ``,
      `黑雾笼罩诸天，黑暗物质侵蚀时间长河……`,
      `唯时间长河、永恒未知、仙域三界，`,
      `因其特殊地位暂未被波及——`,
      `但也只是——暂时。`,
      ``,
      `【最后警告】`,
      `所有幸存的修士，若想活下去，`,
      `只有一条路——`,
      `踏入厄土高原，屠灭诡异始祖！`,
      `「#迎战厄土高原」`,
    ].join('\n');
  } else {
    msg = [
      `诡异大祭 - 灭世警告`,
      ``,
      `位面接连崩灭，剩下可破坏的位面仅剩：`,
      ...remaining.map(p => `  > ${p.name}`),
      ``,
      `厄土高原之上，始祖冷笑着——`,
      `「躲？你们能躲到哪里去？」`,
      `「这些位面，一个都逃不掉。」`,
      ``,
      `【最后警告】`,
      `不想身灭道消，就拿起你们的兵器——`,
      `「#迎战厄土高原」`,
    ].join('\n');
  }

  await sendToAllGroups(groupList, msg);
}

/**
 * 被破坏位面中全员永寂的额外广播
 */
async function broadcastAllYongJi(planeInfo, yongjiCount) {
  if (yongjiCount === 0) return;

  const groupList = await getGroupList();

  const msg = [
    `诡异大祭 - 举界永寂`,
    ``,
    `位面「${planeInfo.name}」中，${yongjiCount}位修士——`,
    `全数坠入永寂之界。`,
    ``,
    `他们的名号、道果、一切存在痕迹——`,
    `被诡异物质从现世中彻底剥离，`,
    `悬浮于永寂之界那永恒的沉默里。`,
    ``,
    `「世间暂无此人。」`,
    `「除非——」`,
    `「有仙帝以映照之权，将其从永寂中唤醒。」`,
    ``,
    `【映照命令】`,
    `仙帝可使用：`,
    `  > #映照[名号] — 复活单名永寂者`,
    `  > #映照${planeInfo.name} — 复活该位面所有永寂者`,
    `  > #映照诸天 — 复活所有位面所有永寂者（代价极大）`,
  ].join('\n');

  await sendToAllGroups(groupList, msg);
}

// ==================== 工具函数 ====================

/**
 * 获取全局推送群列表
 * 统一读取 config xiuxian.Era.notifyGroups，与项目其他模块保持一致
 * 管理员通过 #全局推送消息群号 / #删除全局推送群号 / #查看全局推送 管理
 */
async function getGroupList() {
  let groupList = [];

  // 方法1：优先读 AdminSuper 全局推送配置
  try {
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const notifyGroups = xiuxianConfig?.Era?.notifyGroups || [];
    if (notifyGroups.length > 0) {
      groupList = notifyGroups.map(g => String(g));
      logger.info(`[诡异大祭] 从配置读取全局推送群列表: ${groupList.join(', ')}`);
      return groupList;
    }
  } catch (e) {
    logger.error('[诡异大祭] 从配置读取群列表失败，将尝试Redis:', e.message);
  }

  // 方法2：fallback 到 Redis 拍卖群列表（与 EraChangeTask.js 一致）
  try {
    const redisGlKey = 'xiuxian:AuctionofficialTask_GroupList';
    const redisGroups = await redis.sMembers(redisGlKey);
    if (redisGroups && redisGroups.length > 0) {
      groupList = redisGroups.map(g => String(g));
      logger.info(`[诡异大祭] 从Redis读取群列表(fallback): ${groupList.join(', ')}`);
      return groupList;
    }
  } catch (e) {
    logger.error('[诡异大祭] 从Redis读取群列表失败:', e.message);
  }

  logger.warn('[诡异大祭] 群列表为空，无法推送消息！请检查AdminSuper配置或Redis拍卖群列表');
  return [];
}

async function sendToAllGroups(groupList, msg) {
  const groups = groupList || [];
  for (const groupId of groups) {
    Bot.pickGroup(groupId).sendMsg(msg).catch(console.error);
  }
}

// ==================== 命令处理 ====================

/**
 * 处理 #位面毁灭状态 命令
 * @param {Object} e - 消息事件
 */
export async function handleDestructionStatusCommand(e) {
  const status = await getDestructionStatus();

  if (!status.active) {
    await e.reply([
      `【位面毁灭系统】`,
      `诡异大祭未开启，位面毁灭系统处于休眠状态。`,
      ``,
      `「大祭未至，诸天尚安。」`,
      `「但——他们终会来的。」`,
    ].join('\n'));
    return;
  }

  const progressBar = (() => {
    const pct = status.destroyedCount / status.totalDestroyable;
    const filled = Math.round(pct * 15);
    const empty = 15 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty) + ` ${status.destroyedCount}/${status.totalDestroyable}`;
  })();

  await e.reply([
    `\n══════ 诡异大祭 · 位面毁灭状态 ══════`,
    ``,
    `毁灭进度：${progressBar}`,
    `毁灭时钟：诸天纪年每${status.interval}年一轮（当前${status.worldYear}年，下一轮${status.nextWorldYear}年）`,
    `诸天位面等级：${status.planeLevel} | 帝者救场：${status.rescueUsed ? '本次已用' : '可由大帝施展一次'}`,
    `上次法则修复纪年：${status.lastRepairWorldYear ?? '尚未记录'}`,
    `存活门槛：秘境等级≥${status.threshold}（准仙帝及以上）`,
    ``,
    `已崩灭位面（${status.destroyedCount}/${status.totalDestroyable}）：`,
    ...(status.destroyed.length > 0
      ? status.destroyed.map(n => `  ◆ ${n} 【已崩灭·不可进入】`)
      : ['  ◆ （暂无）']),
    ``,
    `幸存位面（${status.remaining.length}）：`,
    ...status.remaining.map(n => `  ◇ ${n}`),
    ...(status.protected.length > 0 ? [``, `帝者守护位面：${status.protected.join('、')}`] : []),
    ``,
    `终局位面（不可破坏）：`,
    ...status.immune.map(n => `  ◎ ${n}`),
    ``,
    `「大祭不休，毁灭不止——」`,
    status.destroyedCount >= status.totalDestroyable - 1 ? (
      `「所有可破坏位面即将全灭！你还等什么？！」`
    ) : (
      `「下一个被毁灭的，会是你所在的位面吗？」`
    ),
  ].join('\n'));
}
