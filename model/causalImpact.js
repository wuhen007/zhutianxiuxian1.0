import fs from 'node:fs';
import path from 'node:path';

import { config } from '../api/api.js';
import {
  __PATH,
  Read_player,
  Write_player,
} from './xiuxian.js';
import {
  applyCausalCompensation,
  CAUSAL_COMPENSATION_MAX_TARGETS,
  collectRelatedNames,
  getCausalDebtTier,
} from './worldlineAuthority.js';
import {
  applyCausalHighlandPressure,
  ensureStrangeSacrificeState,
} from './strangeSacrifice.js';
import { getRealmEventWorldYear } from './realmEventClock.js';
import {
  damagePlanes,
  PLANE_DESTRUCTION_SOURCES,
} from './planeDestruction.js';
import { writeJsonAtomically } from '../utils/atomicJson.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';

export const CAUSAL_DAMAGE_PLANES = Object.freeze([
  '凡间',
  '仙界',
  '下界八域',
  '太初星墟',
  '遮天位面',
  '九天十地',
  '界海',
  '时间长河',
  '仙域',
]);

const CAUSAL_STATE_FILE = path.join(__PATH.data_path, 'worldline_causal_state.json');
const SACRIFICE_STATE_FILE = path.join(__PATH.data_path, 'strange_sacrifice_state.json');
const PLANE_STATE_FILE = path.join(__PATH.data_path, '位面.json');
const CAUSAL_PLANE_DAMAGE_THRESHOLD = 600;
const CAUSAL_PLANE_DAMAGE_STEP = 100;
const MAX_CAUSAL_HISTORY = 100;
const MAX_PENDING_COMPENSATIONS = 256;
const MAX_UNRESOLVED_RELATIONS = 128;
const COMPENSATION_RETRY_BASE_MS = 60_000;
const COMPENSATION_RETRY_MAX_MS = 6 * 60 * 60 * 1000;
const COMPENSATION_CLAIM_TTL_MS = 10 * 60 * 1000;
const RELATION_FIELDS = Object.freeze([
  ['道侣', '道侣'],
  ['师父', '师徒'],
  ['师傅', '师徒'],
  ['护法玩家', '护法'],
  ['护法', '护法'],
  ['徒弟', '师徒'],
  ['弟子', '师徒'],
]);
const RELATION_TOKEN_KEYS = new Set([
  'id', 'qq', 'QQ', 'user_id', 'playerId', 'targetId', '玩家ID',
  'name', '名号', '名字', '道号',
]);
const IGNORED_RELATION_TOKENS = new Set(['', '0', '无', '暂无', '未知', 'null', 'undefined']);

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeToken(value) {
  const token = String(value ?? '').trim();
  return IGNORED_RELATION_TOKENS.has(token) ? '' : token;
}

function collectRelationTokens(value, tokens = [], depth = 0) {
  if (value === null || value === undefined || depth > 3) return tokens;
  if (typeof value !== 'object') {
    const token = normalizeToken(value);
    if (token) tokens.push(token);
    return tokens;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRelationTokens(item, tokens, depth + 1);
    return tokens;
  }
  for (const [key, child] of Object.entries(value)) {
    if (RELATION_TOKEN_KEYS.has(key) && typeof child !== 'object') {
      const token = normalizeToken(child);
      if (token) tokens.push(token);
    } else if (typeof child === 'object') {
      collectRelationTokens(child, tokens, depth + 1);
    }
  }
  return tokens;
}

function relationEntries(player) {
  return RELATION_FIELDS
    .filter(([field]) => Object.prototype.hasOwnProperty.call(player || {}, field))
    .map(([field, label]) => ({
      field,
      label,
      tokens: [...new Set(collectRelationTokens(player[field]))],
    }))
    .filter(entry => entry.tokens.length);
}

function relationMatches(tokens, id, name) {
  const normalizedId = normalizeToken(id);
  const normalizedName = normalizeToken(name);
  return tokens.some(token => token === normalizedId || (normalizedName && token === normalizedName));
}

function sameSect(actor, target) {
  const actorSect = normalizeToken(actor?.宗门?.宗门名称);
  const targetSect = normalizeToken(target?.宗门?.宗门名称);
  return Boolean(actorSect && actorSect !== '无' && actorSect === targetSect);
}

function playerFiles(directory) {
  try {
    return fs.readdirSync(directory).filter(file => file.endsWith('.json'));
  } catch {
    return [];
  }
}

/**
 * 从现世玩家存档反查道侣、师徒、护法和同宗门成员。
 * ponytail: 进程内扫描玩家文件，适合当前规模；玩家量显著增长时再换索引。
 */
export function findCausalRelatedPlayers(
  actor,
  { actorId = '', playerDirectory = __PATH.player_path, maxTargets = CAUSAL_COMPENSATION_MAX_TARGETS } = {},
) {
  const sourceId = normalizeToken(actorId || actor?.id || actor?.qq || actor?.user_id);
  const sourceName = normalizeToken(actor?.名号);
  const actorRelations = relationEntries(actor);
  const files = playerFiles(playerDirectory);
  const found = new Map();

  for (const file of files) {
    const id = normalizeToken(file.slice(0, -5));
    if (!id || id === sourceId) continue;
    let target;
    try {
      target = JSON.parse(fs.readFileSync(path.join(playerDirectory, file), 'utf8'));
    } catch {
      continue;
    }
    const name = normalizeToken(target?.名号) || id;
    if (sourceName && name === sourceName) continue;

    const relations = new Set();
    let direct = false;
    for (const entry of actorRelations) {
      if (relationMatches(entry.tokens, id, name)) {
        relations.add(entry.label);
        direct = true;
      }
    }
    for (const entry of relationEntries(target)) {
      if (relationMatches(entry.tokens, sourceId, sourceName)) {
        relations.add(entry.label);
        direct = true;
      }
    }
    if (sameSect(actor, target)) relations.add('宗门成员');
    if (!relations.size) continue;

    const previous = found.get(id);
    found.set(id, {
      id,
      name,
      relation: [...new Set([
        ...(previous?.relation ? previous.relation.split('/').filter(Boolean) : []),
        ...relations,
      ])].join('/'),
      priority: Math.min(previous?.priority ?? 2, direct ? 0 : 1),
    });
  }

  const targets = [...found.values()]
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, Math.trunc(number(maxTargets, CAUSAL_COMPENSATION_MAX_TARGETS))))
    .map(({ priority, ...target }) => target);
  const known = new Set(targets.flatMap(target => [target.id, target.name]));
  const pending = [];
  for (const entry of actorRelations) {
    for (const token of entry.tokens) {
      if (token === sourceId || token === sourceName || known.has(token) || pending.includes(token)) continue;
      pending.push(token);
    }
  }
  for (const name of collectRelatedNames(actor)) {
    if (name === normalizeToken(actor?.宗门?.宗门名称) || known.has(name) || pending.includes(name)) continue;
    pending.push(name);
  }
  const pendingRelations = pending.slice(0, 8).map(token => {
    const relation = actorRelations
      .filter(entry => entry.tokens.includes(token))
      .map(entry => entry.label)
      .filter(Boolean);
    return {
      token,
      relation: [...new Set(relation)].join('/') || '因果关联',
    };
  });
  return {
    targets,
    pending: pendingRelations.map(item => item.token),
    pendingRelations,
  };
}

function defaultCausalState() {
  return {
    version: 3,
    absoluteSpiritAdvance: 0,
    absoluteSpiritExtension: 0,
    relatedIncidents: 0,
    planeDamage: 0,
    highlandSacrificeAdvance: 0,
    planeDamageCursor: 0,
    causalPlaneDamageUnits: 0,
    causalPlaneDamagePendingUnits: 0,
    compensationSequence: 0,
    pendingCompensations: [],
    unresolvedRelations: [],
    lastCompensationRetryAt: 0,
    lastImpactAt: 0,
    history: [],
  };
}

function readObject(file, fallback = {}) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function ensureCausalState(value) {
  const state = {
    ...defaultCausalState(),
    ...(value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  };
  state.version = 3;
  state.history = Array.isArray(state.history) ? state.history : [];
  state.pendingCompensations = Array.isArray(state.pendingCompensations)
    ? state.pendingCompensations.filter(task => task && typeof task === 'object' && task.id)
    : [];
  state.unresolvedRelations = Array.isArray(state.unresolvedRelations)
    ? state.unresolvedRelations.filter(item => item && typeof item === 'object' && item.key)
    : [];
  state.unresolvedRelations = state.unresolvedRelations.map(item => ({
    ...item,
    sourceId: String(item.sourceId || ''),
    sourceName: String(item.sourceName || ''),
    token: String(item.token || ''),
    relation: String(item.relation || '因果关联'),
    amount: Math.max(1, number(item.amount, Math.max(1, number(item.hits, 1)))),
    hits: Math.max(1, Math.trunc(number(item.hits, 1))),
  }));
  state.compensationSequence = Math.max(0, Math.trunc(number(state.compensationSequence)));
  state.lastCompensationRetryAt = Math.max(0, number(state.lastCompensationRetryAt));
  return state;
}

function nextCompensationTaskId(state, actorId, now) {
  state.compensationSequence += 1;
  return `${String(actorId || 'unknown')}:${Math.trunc(now)}:${state.compensationSequence}`;
}

function createCompensationTask(state, {
  actorId,
  sourceName,
  targetId,
  targetName,
  relation = '因果关联',
  amount = 1,
  now,
}) {
  const task = {
    id: `${nextCompensationTaskId(state, actorId, now)}:${String(targetId)}`,
    targetId: String(targetId),
    targetName: String(targetName || targetId),
    sourceId: String(actorId || ''),
    sourceName: String(sourceName || ''),
    relation: String(relation || '因果关联'),
    amount: Math.max(1, number(amount, 1)),
    createdAt: now,
    attempts: 0,
    nextRetryAt: 0,
    processingAt: 0,
    lastError: '',
  };
  state.pendingCompensations.push(task);
  return task;
}

function trimCompensationQueues(state) {
  if (state.pendingCompensations.length > MAX_PENDING_COMPENSATIONS) {
    // ponytail: 固定队列上限，优先保留最新事件；高并发部署再升级为独立持久队列。
    state.pendingCompensations = state.pendingCompensations.slice(-MAX_PENDING_COMPENSATIONS);
  }
  if (state.unresolvedRelations.length > MAX_UNRESOLVED_RELATIONS) {
    state.unresolvedRelations = state.unresolvedRelations.slice(-MAX_UNRESOLVED_RELATIONS);
  }
}

function enqueueCompensationTasks(state, {
  actorId,
  sourceName,
  related,
  amount,
  now,
}) {
  const tasks = [];
  for (const target of related?.targets || []) {
    tasks.push(createCompensationTask(state, {
      actorId,
      sourceName,
      targetId: target.id,
      targetName: target.name,
      relation: target.relation,
      amount,
      now,
    }));
  }

  const pendingRelations = Array.isArray(related?.pendingRelations)
    ? related.pendingRelations
    : (related?.pending || []).map(token => ({ token, relation: '因果关联' }));
  for (const pendingRelation of pendingRelations) {
    const token = normalizeToken(pendingRelation?.token);
    if (!token) continue;
    const key = `${String(actorId || sourceName || 'unknown')}:${String(token)}`;
    const existing = state.unresolvedRelations.find(item => item.key === key);
    if (existing) {
      existing.lastSeenAt = now;
      existing.hits = Math.max(0, Math.trunc(number(existing.hits))) + 1;
      existing.amount = Math.max(1, number(existing.amount)) + Math.max(1, number(amount, 1));
      existing.relation = [...new Set([
        ...String(existing.relation || '').split('/').filter(Boolean),
        String(pendingRelation?.relation || '因果关联'),
      ])].join('/') || '因果关联';
    } else {
      state.unresolvedRelations.push({
        key,
        sourceId: String(actorId || ''),
        sourceName: String(sourceName || ''),
        token,
        relation: String(pendingRelation?.relation || '因果关联'),
        amount: Math.max(1, number(amount, 1)),
        firstSeenAt: now,
        lastSeenAt: now,
        hits: 1,
      });
    }
  }
  trimCompensationQueues(state);
  return tasks;
}

function buildPlayerTokenIndex(directory) {
  const index = new Map();
  for (const file of playerFiles(directory)) {
    const id = normalizeToken(file.slice(0, -5));
    if (!id) continue;
    let player;
    try {
      player = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
    } catch {
      continue;
    }
    const name = normalizeToken(player?.名号)
      || normalizeToken(player?.名字)
      || normalizeToken(player?.道号)
      || id;
    const target = { id, name };
    for (const token of [
      id,
      player?.id,
      player?.qq,
      player?.QQ,
      player?.user_id,
      player?.名号,
      player?.名字,
      player?.道号,
    ]) {
      const normalized = normalizeToken(token);
      if (normalized && !index.has(normalized)) index.set(normalized, target);
    }
  }
  return index;
}

function resolveUnresolvedRelations(state, {
  playerDirectory,
  now,
} = {}) {
  if (!state.unresolvedRelations.length) return [];
  const index = buildPlayerTokenIndex(playerDirectory);
  const resolved = [];
  const remaining = [];
  for (const relation of state.unresolvedRelations) {
    const target = index.get(normalizeToken(relation.token));
    if (!target || target.id === normalizeToken(relation.sourceId)) {
      remaining.push(relation);
      continue;
    }
    resolved.push(createCompensationTask(state, {
      actorId: relation.sourceId,
      sourceName: relation.sourceName,
      targetId: target.id,
      targetName: target.name,
      relation: relation.relation,
      amount: relation.amount,
      now,
    }));
  }
  state.unresolvedRelations = remaining;
  trimCompensationQueues(state);
  return resolved;
}

async function claimCompensationTask(causalStateFile, taskId, now) {
  return withPlayerMutationLock('worldline:causal-impact', async () => {
    const state = ensureCausalState(readObject(causalStateFile));
    const task = state.pendingCompensations.find(item => item.id === taskId);
    if (!task) return null;
    if (number(task.nextRetryAt) > now) return null;
    if (number(task.processingAt) > 0 && now - number(task.processingAt) < COMPENSATION_CLAIM_TTL_MS) {
      return null;
    }
    task.attempts = Math.max(0, Math.trunc(number(task.attempts))) + 1;
    task.processingAt = now;
    task.lastAttemptAt = now;
    writeJsonAtomically(causalStateFile, state);
    return { ...task };
  });
}

async function finishCompensationTask(causalStateFile, taskId, {
  now,
  error = '',
  success = false,
} = {}) {
  return withPlayerMutationLock('worldline:causal-impact', async () => {
    const state = ensureCausalState(readObject(causalStateFile));
    const index = state.pendingCompensations.findIndex(item => item.id === taskId);
    if (index < 0) return false;
    const task = state.pendingCompensations[index];
    if (success) {
      state.pendingCompensations.splice(index, 1);
    } else {
      const attempts = Math.max(1, Math.trunc(number(task.attempts)));
      task.processingAt = 0;
      task.lastError = String(error || '未知写入错误').slice(0, 240);
      task.lastFailedAt = now;
      task.nextRetryAt = now + Math.min(
        COMPENSATION_RETRY_MAX_MS,
        COMPENSATION_RETRY_BASE_MS * (2 ** Math.min(8, attempts - 1)),
      );
    }
    state.lastCompensationRetryAt = now;
    writeJsonAtomically(causalStateFile, state);
    return true;
  });
}

async function processCompensationTask(task, {
  causalStateFile,
  readPlayer,
  writePlayer,
  now,
} = {}) {
  const claimed = await claimCompensationTask(causalStateFile, task.id, now);
  if (!claimed) return { status: 'skipped', task };

  try {
    let outcome = null;
    await withPlayerMutationLock(claimed.targetId, async () => {
      const target = await readPlayer(claimed.targetId);
      if (!target || typeof target !== 'object') {
        throw new Error('目标玩家存档不存在');
      }
      if (isSacrificeBubble(target)) {
        outcome = {
          status: 'skippedBubble',
          id: claimed.targetId,
          name: claimed.targetName,
        };
        return;
      }
      const result = applyCausalCompensation(target, {
        sourceId: claimed.sourceId,
        sourceName: claimed.sourceName,
        relation: claimed.relation,
        amount: claimed.amount,
        eventId: claimed.id,
        now,
      });
      await writePlayer(claimed.targetId, target, { trackDailyTask: false });
      outcome = {
        status: result.deduped ? 'deduped' : 'applied',
        id: claimed.targetId,
        name: target.名号 || claimed.targetName,
        relation: claimed.relation,
        ...result,
      };
    });
    await finishCompensationTask(causalStateFile, claimed.id, { now, success: true });
    return outcome || { status: 'applied', id: claimed.targetId, name: claimed.targetName };
  } catch (error) {
    await finishCompensationTask(causalStateFile, claimed.id, {
      now,
      error: error?.message || error,
      success: false,
    });
    return {
      status: 'failed',
      id: claimed.targetId,
      name: claimed.targetName,
      error: error?.message || String(error),
    };
  }
}

export async function retryPendingCausalCompensations(options = {}) {
  const causalStateFile = options.causalStateFile || CAUSAL_STATE_FILE;
  const readPlayer = options.readPlayer || Read_player;
  const writePlayer = options.writePlayer || Write_player;
  const playerDirectory = options.playerDirectory || __PATH.player_path;
  const now = number(options.now, Date.now());
  const maxTasks = Math.max(1, Math.trunc(number(options.maxTasks, 8)));
  const excluded = new Set((options.excludeIds || []).map(String));
  const prepared = await withPlayerMutationLock('worldline:causal-impact', async () => {
    const state = ensureCausalState(readObject(causalStateFile));
    const resolved = resolveUnresolvedRelations(state, { playerDirectory, now });
    state.lastCompensationRetryAt = now;
    writeJsonAtomically(causalStateFile, state);
    const tasks = state.pendingCompensations
      .filter(task => !excluded.has(String(task.id)) && number(task.nextRetryAt) <= now)
      .slice(0, maxTasks)
      .map(task => ({ ...task }));
    return { tasks, resolved: resolved.length };
  });
  const tasks = prepared.tasks;
  const result = {
    applied: [],
    skippedBubble: [],
    failed: [],
    deduped: [],
    attempted: tasks.length,
    resolvedRelations: prepared.resolved,
  };
  for (const task of tasks) {
    const outcome = await processCompensationTask(task, {
      causalStateFile,
      readPlayer,
      writePlayer,
      now,
    });
    if (outcome.status === 'applied') result.applied.push(outcome);
    else if (outcome.status === 'skippedBubble') result.skippedBubble.push(outcome);
    else if (outcome.status === 'deduped') result.deduped.push(outcome);
    else if (outcome.status === 'failed') result.failed.push(outcome);
  }
  const state = ensureCausalState(readObject(causalStateFile));
  result.pending = state.pendingCompensations.length;
  return result;
}

export function getCausalImpactStatus(options = {}) {
  const causalStateFile = options.causalStateFile || CAUSAL_STATE_FILE;
  const state = ensureCausalState(readObject(causalStateFile));
  const worldYear = number(options.worldYear, currentWorldYear());
  const sacrifice = ensureStrangeSacrificeState(
    readObject(options.sacrificeStateFile || SACRIFICE_STATE_FILE),
    worldYear,
  );
  return {
    pendingCompensations: state.pendingCompensations.map(task => ({ ...task })),
    unresolvedRelations: state.unresolvedRelations.map(item => ({ ...item })),
    planeDamage: Math.max(0, number(state.planeDamage)),
    highlandSacrificeAdvance: Math.max(0, number(state.highlandSacrificeAdvance)),
    lastImpactAt: number(state.lastImpactAt),
    lastCompensationRetryAt: number(state.lastCompensationRetryAt),
    sacrifice: {
      phase: sacrifice.phase,
      bigDueWorldYear: sacrifice.bigDueWorldYear,
      activeEvent: sacrifice.activeEvent,
      pressureCount: sacrifice.causalPressureCount,
      plateauDestroyed: sacrifice.plateauDestroyed,
    },
  };
}

function currentWorldYear() {
  try {
    const current = config.getConfig('xiuxian', 'xiuxian')?.Era?.current || {};
    return Math.max(
      number(current.totalYears),
      getRealmEventWorldYear(current.index, current.years, current.epoch),
    );
  } catch {
    return 0;
  }
}

function selectCausalPlanes(plane, state, amount) {
  const selected = [];
  const records = plane?.['位面损坏记录'] || {};
  const length = CAUSAL_DAMAGE_PLANES.length;
  let cursor = ((Math.trunc(number(state.planeDamageCursor)) % length) + length) % length;
  for (let attempts = 0; attempts < length && selected.length < amount; attempts += 1) {
    const name = CAUSAL_DAMAGE_PLANES[cursor];
    cursor = (cursor + 1) % length;
    if (!(name in (plane || {})) || Number(plane[name]) === 0) continue;
    if (number(records[name]?.damage) >= 100) continue;
    selected.push(name);
  }
  state.planeDamageCursor = cursor;
  return selected;
}

function causalPlaneUnits(state, debt) {
  const currentDebt = Math.max(0, number(debt));
  if (currentDebt < CAUSAL_PLANE_DAMAGE_THRESHOLD) return 0;
  const targetUnits = Math.max(
    1,
    Math.floor((currentDebt - (CAUSAL_PLANE_DAMAGE_THRESHOLD - 1)) / CAUSAL_PLANE_DAMAGE_STEP),
  );
  const applied = Math.max(0, Math.trunc(number(state.causalPlaneDamageUnits)));
  state.causalPlaneDamagePendingUnits = Math.max(0, targetUnits - applied);
  return Math.min(3, state.causalPlaneDamagePendingUnits);
}

function isSacrificeBubble(player) {
  return player?.始祖永祭?.status === 'bubble' || player?.修仙状态 === '空间泡影';
}

function actorIdentity(actor, options) {
  return normalizeToken(options.actorId || actor?.id || actor?.qq || actor?.user_id);
}

/**
 * 统一执行因果债的三类真实副作用：众生代偿、位面损伤、大祭时间压力。
 */
export async function persistCausalImpact(actor, debtResult, options = {}) {
  const delta = Math.max(0, number(debtResult?.delta));
  if (!delta) return null;

  const now = number(options.now, Date.now());
  const actorId = actorIdentity(actor, options);
  const sourceName = String(actor?.名号 || actorId || '因果施术者');
  const causalStateFile = options.causalStateFile || CAUSAL_STATE_FILE;
  const sacrificeStateFile = options.sacrificeStateFile || SACRIFICE_STATE_FILE;
  const planeFile = options.planeFile || PLANE_STATE_FILE;
  const playerDirectory = options.playerDirectory || __PATH.player_path;
  const readPlayer = options.readPlayer || Read_player;
  const writePlayer = options.writePlayer || Write_player;
  const worldYear = Number.isFinite(Number(options.worldYear))
    ? Math.max(0, Math.trunc(Number(options.worldYear)))
    : currentWorldYear();
  const tier = debtResult.tier || getCausalDebtTier(debtResult.debt);
  const impact = {
    debt: number(debtResult.debt),
    delta,
    tier,
    compensation: {
      applied: [],
      skippedBubble: [],
      pending: [],
      failed: [],
      deduped: [],
      queued: [],
      retried: [],
      pendingCount: 0,
      unresolvedCount: 0,
    },
    planes: { damaged: [], units: 0, bearingBefore: 0, bearingAfter: 0, bearingLoss: 0 },
    highland: {
      advancedWorldYears: 0,
      dueBefore: null,
      dueAfter: null,
      activeEventShortened: 0,
      appliedTo: null,
    },
  };
  let related = { targets: [], pending: [] };
  let queuedTasks = [];

  await withPlayerMutationLock('worldline:causal-impact', async () => {
    const state = ensureCausalState(readObject(causalStateFile));
    state.history = Array.isArray(state.history) ? state.history : [];
    state.planeDamageCursor = Math.trunc(number(state.planeDamageCursor));
    state.causalPlaneDamageUnits = Math.max(0, Math.trunc(number(state.causalPlaneDamageUnits)));
    state.causalPlaneDamagePendingUnits = Math.max(0, Math.trunc(number(state.causalPlaneDamagePendingUnits)));
    state.lastImpactAt = now;

    if (tier.level >= 1) state.absoluteSpiritAdvance += delta;
    if (tier.level >= 2) {
      state.absoluteSpiritExtension += Math.ceil(delta / 2);
      state.relatedIncidents += 1;
      related = findCausalRelatedPlayers(actor, { actorId, playerDirectory });
      impact.compensation.pending = [...related.pending];
      queuedTasks = enqueueCompensationTasks(state, {
        actorId,
        sourceName,
        related,
        amount: delta,
        now,
      });
      impact.compensation.queued = queuedTasks.map(task => ({
        id: task.id,
        targetId: task.targetId,
        name: task.targetName,
      }));
    }

    if (tier.level >= 3) {
      state.planeDamage += delta;
      const plane = readObject(planeFile);
      const units = causalPlaneUnits(state, debtResult.debt);
      if (units && Object.keys(plane).length) {
        const names = selectCausalPlanes(plane, state, units);
        if (names.length) {
          try {
            const result = damagePlanes(planeFile, names, {
              source: PLANE_DESTRUCTION_SOURCES.CAUSAL_BACKLASH,
              actor: sourceName,
              bearingLossPerPlane: 100_000,
              now,
            });
            impact.planes = { ...impact.planes, ...result, units: result.damaged.length };
            state.causalPlaneDamageUnits += result.damaged.length;
            state.causalPlaneDamagePendingUnits = Math.max(
              0,
              state.causalPlaneDamagePendingUnits - result.damaged.length,
            );
          } catch (error) {
            impact.planes.error = error.message;
          }
        }
      }
    }

    if (tier.level >= 4) {
      state.highlandSacrificeAdvance += delta;
      const plane = readObject(planeFile);
      const sacrifice = ensureStrangeSacrificeState(readObject(sacrificeStateFile), worldYear);
      const wasDestroyed = sacrifice.plateauDestroyed;
      if (plane.高原彻底覆灭 === true) sacrifice.plateauDestroyed = true;
      const pressure = applyCausalHighlandPressure(sacrifice, {
        debtDelta: delta,
        worldYear,
        now,
      });
      impact.highland = {
        advancedWorldYears: pressure.advancedWorldYears,
        dueBefore: pressure.dueBefore,
        dueAfter: pressure.dueAfter,
        activeEventShortened: pressure.activeEventShortened,
        appliedTo: pressure.appliedTo,
      };
      if (pressure.changed || wasDestroyed !== sacrifice.plateauDestroyed) {
        writeJsonAtomically(sacrificeStateFile, pressure.state);
      }
    }

    state.history = [
      ...state.history,
      {
        actor: sourceName,
        debt: debtResult.debt,
        delta,
        tier: tier.name,
        related: actor.因果牵连?.related || [],
        impact: {
          compensation: queuedTasks.length,
          planes: impact.planes.damaged,
          highlandAdvance: impact.highland.advancedWorldYears,
        },
        at: now,
      },
    ].slice(-MAX_CAUSAL_HISTORY);
    writeJsonAtomically(causalStateFile, state);
  });

  const collectCompensationOutcome = (outcome) => {
    if (outcome?.status === 'applied') impact.compensation.applied.push(outcome);
    else if (outcome?.status === 'skippedBubble') impact.compensation.skippedBubble.push(outcome);
    else if (outcome?.status === 'deduped') impact.compensation.deduped.push(outcome);
    else if (outcome?.status === 'failed') impact.compensation.failed.push(outcome);
  };
  for (const task of queuedTasks) {
    collectCompensationOutcome(await processCompensationTask(task, {
      causalStateFile,
      readPlayer,
      writePlayer,
      now,
    }));
  }

  const retried = await retryPendingCausalCompensations({
    causalStateFile,
    playerDirectory,
    readPlayer,
    writePlayer,
    now,
    maxTasks: options.retryLimit ?? 8,
    excludeIds: queuedTasks.map(task => task.id),
  });
  impact.compensation.retried = [
    ...retried.applied,
    ...retried.skippedBubble,
    ...retried.deduped,
  ];
  impact.compensation.failed.push(...retried.failed);
  impact.compensation.pendingCount = retried.pending;
  impact.compensation.unresolvedCount = getCausalImpactStatus({
    causalStateFile,
    sacrificeStateFile,
    worldYear,
  }).unresolvedRelations.length;

  return impact;
}
