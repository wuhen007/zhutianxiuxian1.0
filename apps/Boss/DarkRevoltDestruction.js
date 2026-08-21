import fs from 'fs';
import { config, data } from '../../api/api.js';
import { Write_player } from '../../model/xiuxian.js';
import { getRealmEventWorldYear } from '../../model/realmEventClock.js';

export const DARK_REVOLT_DESTRUCTION = Object.freeze({
  intervalWorldYears: 5000,
  stateKey: 'Xiuxian:DarkRevoltPlaneDestruction',
  targets: Object.freeze([
    { id: 0, name: '凡间', dataName: '凡间', hitsToDestroy: 1 },
    { id: 1, name: '仙境', dataName: '仙界', hitsToDestroy: 1 },
    { id: 1.5, name: '下界八域', dataName: '下界八域', hitsToDestroy: 1 },
    { id: 3.5, name: '太初星墟', dataName: '太初星墟', hitsToDestroy: 1 },
    { id: 2, name: '遮天位面', dataName: '遮天位面', hitsToDestroy: 3 },
  ]),
});

let destructionInProgress = false;

export function getCurrentWorldYear() {
  const current = config.getConfig('xiuxian', 'xiuxian')?.Era?.current || {};
  if (Number.isFinite(Number(current.totalYears))) return Number(current.totalYears);
  return getRealmEventWorldYear(current.index || 0, current.years || 0, current.epoch || 1);
}

function emptyCounts() {
  return Object.fromEntries(DARK_REVOLT_DESTRUCTION.targets.map(target => [target.name, 0]));
}

function defaultState(eventId, worldYear) {
  return {
    version: 1,
    eventId: String(eventId || ''),
    lastBattleWorldYear: Number(worldYear) || 0,
    lastEventWorldYear: null,
    damageCounts: emptyCounts(),
    history: [],
  };
}

function readJsonState(raw) {
  if (!raw) return null;
  try {
    const state = JSON.parse(raw);
    return state && typeof state === 'object' ? state : null;
  } catch {
    return null;
  }
}

async function readState() {
  return readJsonState(await redis.get(DARK_REVOLT_DESTRUCTION.stateKey));
}

async function writeState(state) {
  await redis.set(DARK_REVOLT_DESTRUCTION.stateKey, JSON.stringify(state));
}

function normalizeState(state, eventId, worldYear) {
  const normalized = state && state.eventId === String(eventId)
    ? state
    : defaultState(eventId, worldYear);
  normalized.version = 1;
  normalized.eventId = String(eventId || normalized.eventId || '');
  normalized.lastBattleWorldYear = Number.isFinite(Number(normalized.lastBattleWorldYear))
    ? Number(normalized.lastBattleWorldYear)
    : Number(worldYear) || 0;
  normalized.damageCounts = normalized.damageCounts && typeof normalized.damageCounts === 'object'
    ? normalized.damageCounts
    : emptyCounts();
  normalized.history = Array.isArray(normalized.history) ? normalized.history : [];
  for (const target of DARK_REVOLT_DESTRUCTION.targets) {
    normalized.damageCounts[target.name] = Math.max(0, Math.min(
      target.hitsToDestroy,
      Number(normalized.damageCounts[target.name]) || 0,
    ));
  }
  return normalized;
}

function readWorldState() {
  try {
    const file = data.filePathMap.weimianList;
    if (!fs.existsSync(file)) return {};
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function writeWorldState(worldState) {
  try {
    fs.writeFileSync(data.filePathMap.weimianList, JSON.stringify(worldState, null, 4), 'utf8');
    return true;
  } catch (error) {
    logger.error('[黑暗动乱] 保存毁灭位面状态失败:', error.message);
    return false;
  }
}

async function sendPlayersIntoReincarnation(target, supremeName, hit, worldYear) {
  const names = [];
  let files = [];
  try {
    const playerDir = data.filePathMap.player;
    files = fs.existsSync(playerDir) ? fs.readdirSync(playerDir).filter(file => file.endsWith('.json')) : [];
  } catch (error) {
    logger.error('[黑暗动乱] 扫描轮回名单失败:', error.message);
  }

  for (const file of files) {
    const qq = file.replace('.json', '');
    try {
      const player = await data.getData('player', qq);
      if (!player || Number(player.power_place) !== Number(target.id)) continue;
      player.power_place = 0;
      player.黑暗动乱轮回 = {
        状态: '轮回中',
        位面: target.name,
        至尊: supremeName || '禁区至尊',
        次数: hit,
        纪年: Number(worldYear) || 0,
        时间: Date.now(),
      };
      await Write_player(qq, player);
      names.push(player.名号 || qq);
    } catch (error) {
      logger.error(`[黑暗动乱] 将玩家${qq}打入轮回失败:`, error.message);
    }
  }
  return names;
}

export async function initializeDarkRevoltDestruction({ eventId, worldYear = getCurrentWorldYear() } = {}) {
  const state = defaultState(eventId, worldYear);
  await writeState(state);
  return state;
}

export async function touchDarkRevoltActivity({ eventId, worldYear = getCurrentWorldYear() } = {}) {
  let state = normalizeState(await readState(), eventId, worldYear);
  state.lastBattleWorldYear = Number(worldYear) || 0;
  await writeState(state);
  return state;
}

export async function clearDarkRevoltDestruction() {
  await redis.del(DARK_REVOLT_DESTRUCTION.stateKey);
  return true;
}

export async function getDarkRevoltDestructionStatus() {
  const rawBoss = await redis.get('Xiuxian:WorldBossStatus2');
  const bossStatus = readJsonState(rawBoss);
  const state = bossStatus?.harvestStartedAt
    ? normalizeState(await readState(), bossStatus.harvestStartedAt, getCurrentWorldYear())
    : await readState();
  const counts = state?.damageCounts || emptyCounts();
  return {
    active: bossStatus?.KilledTime === -1,
    intervalWorldYears: DARK_REVOLT_DESTRUCTION.intervalWorldYears,
    lastBattleWorldYear: state?.lastBattleWorldYear ?? null,
    lastEventWorldYear: state?.lastEventWorldYear ?? null,
    targets: DARK_REVOLT_DESTRUCTION.targets.map(target => ({
      ...target,
      hits: Number(counts[target.name]) || 0,
      destroyed: Number(counts[target.name]) >= target.hitsToDestroy,
    })),
  };
}

export async function processDarkRevoltPlaneDestruction(worldYear = getCurrentWorldYear()) {
  if (destructionInProgress) return null;
  destructionInProgress = true;
  try {
    const rawBoss = await redis.get('Xiuxian:WorldBossStatus2');
    const bossStatus = readJsonState(rawBoss);
    if (!bossStatus || bossStatus.KilledTime !== -1 || !bossStatus.harvestStartedAt) return null;

    let state = normalizeState(await readState(), bossStatus.harvestStartedAt, worldYear);
    const worldState = readWorldState();
    let worldStateChanged = false;
    for (const target of DARK_REVOLT_DESTRUCTION.targets) {
      if (worldState[target.dataName] === 0 && state.damageCounts[target.name] < target.hitsToDestroy) {
        state.damageCounts[target.name] = target.hitsToDestroy;
        worldStateChanged = true;
      }
    }

    const idleWorldYears = Number(worldYear) - state.lastBattleWorldYear;
    if (idleWorldYears < DARK_REVOLT_DESTRUCTION.intervalWorldYears) {
      if (worldStateChanged) await writeState(state);
      return null;
    }

    const target = DARK_REVOLT_DESTRUCTION.targets.find(item => (
      state.damageCounts[item.name] < item.hitsToDestroy
    ));
    if (!target) {
      if (worldStateChanged) await writeState(state);
      return null;
    }

    const hit = state.damageCounts[target.name] + 1;
    const supremeName = bossStatus.bosses?.find(boss => boss.id === bossStatus.activeBossId)?.名号 || '禁区至尊';
    const reincarnatedNames = await sendPlayersIntoReincarnation(target, supremeName, hit, worldYear);
    state.damageCounts[target.name] = hit;
    state.lastBattleWorldYear = Number(worldYear) || 0;
    state.lastEventWorldYear = Number(worldYear) || 0;
    state.history.push({
      worldYear: Number(worldYear) || 0,
      plane: target.name,
      hit,
      supreme: supremeName,
      reincarnated: reincarnatedNames.length,
    });
    state.history = state.history.slice(-20);

    let fullyDestroyed = false;
    if (hit >= target.hitsToDestroy && worldState[target.dataName] !== 0) {
      worldState[target.dataName] = 0;
      worldStateChanged = true;
      fullyDestroyed = true;
    }
    await writeState(state);
    if (worldStateChanged) writeWorldState(worldState);

    return {
      target,
      hit,
      hitsToDestroy: target.hitsToDestroy,
      supremeName,
      reincarnatedNames,
      fullyDestroyed,
      remainingHits: Math.max(0, target.hitsToDestroy - hit),
      idleWorldYears,
      worldYear: Number(worldYear) || 0,
    };
  } finally {
    destructionInProgress = false;
  }
}

export function formatDarkRevoltPlaneDestruction(event) {
  if (!event) return '';
  const lines = [
    '【黑暗动乱·禁区至尊毁灭位面】',
    `时隔${event.idleWorldYears}年，始终无人迎战${event.supremeName}。`,
    `${event.supremeName}出手轰击「${event.target.name}」！`,
    `本次为该位面第${event.hit}/${event.hitsToDestroy}次毁灭打击。`,
    `位面内修士未坠入永寂，而是被至尊法则打入轮回：${event.reincarnatedNames.length}人。`,
  ];
  lines.push(event.fullyDestroyed
    ? event.hitsToDestroy === 3
      ? `「${event.target.name}」承受三次毁灭，位面本源彻底崩灭！`
      : `「${event.target.name}」位面本源被至尊彻底击碎！`
    : `位面尚未彻底毁灭，还需${event.remainingHits}次毁灭打击。`);
  return lines.join('\n');
}
