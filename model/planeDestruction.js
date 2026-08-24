import fs from 'node:fs';

import { writeJsonAtomically } from '../utils/atomicJson.js';

export const PLANE_DESTRUCTION_RECORD_KEY = '位面毁灭记录';
export const PLANE_DESTRUCTION_SOURCES = Object.freeze({
  DARK_REVOLT: 'dark_revolt',
  STRANGE_EMPEROR: 'strange_emperor',
});

const KNOWN_PLANES = Object.freeze([
  '凡间', '仙界', '下界八域', '遮天位面', '九天十地', '界海', '太初星墟', '仙域',
]);

function readState(filePath) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function destructionRecord(state, planeName) {
  const records = state?.[PLANE_DESTRUCTION_RECORD_KEY];
  const record = records && typeof records === 'object' ? records[planeName] : null;
  return record && typeof record === 'object' ? record : {};
}

function normalizeWorldYear(value) {
  if (value === null || value === undefined || value === '') return null;
  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

export function getPlaneDestructionInfo(filePath, planeName) {
  const state = readState(filePath);
  const record = destructionRecord(state, planeName);
  return {
    destroyed: state?.[planeName] === 0,
    planeName,
    source: record.source || 'unknown',
    actor: record.actor || '',
    worldYear: normalizeWorldYear(record.worldYear),
  };
}

export function markPlaneDestroyed(filePath, planeName, {
  source = 'unknown',
  actor = '',
  worldYear = null,
} = {}) {
  const state = readState(filePath);
  if (!state || !(planeName in state)) return false;
  state[planeName] = 0;
  if (!state[PLANE_DESTRUCTION_RECORD_KEY] || typeof state[PLANE_DESTRUCTION_RECORD_KEY] !== 'object') {
    state[PLANE_DESTRUCTION_RECORD_KEY] = {};
  }
  state[PLANE_DESTRUCTION_RECORD_KEY][planeName] = {
    source,
    actor,
    worldYear: normalizeWorldYear(worldYear),
  };
  writeJsonAtomically(filePath, state);
  return true;
}

export function repairPlane(filePath, planeName) {
  const state = readState(filePath);
  if (!state || state[planeName] !== 0) return false;
  state[planeName] = 1;
  if (state[PLANE_DESTRUCTION_RECORD_KEY]) {
    delete state[PLANE_DESTRUCTION_RECORD_KEY][planeName];
    if (Object.keys(state[PLANE_DESTRUCTION_RECORD_KEY]).length === 0) {
      delete state[PLANE_DESTRUCTION_RECORD_KEY];
    }
  }
  writeJsonAtomically(filePath, state);
  return true;
}

export function repairDestroyedPlanes(filePath, { sources = null } = {}) {
  const state = readState(filePath);
  if (!state) return [];
  const allowedSources = sources ? new Set(sources) : null;
  const repaired = [];
  for (const planeName of KNOWN_PLANES) {
    if (state[planeName] !== 0) continue;
    const source = destructionRecord(state, planeName).source || 'unknown';
    if (allowedSources && !allowedSources.has(source)) continue;
    state[planeName] = 1;
    if (state[PLANE_DESTRUCTION_RECORD_KEY]) delete state[PLANE_DESTRUCTION_RECORD_KEY][planeName];
    repaired.push(planeName);
  }
  if (repaired.length === 0) return repaired;
  if (state[PLANE_DESTRUCTION_RECORD_KEY] && Object.keys(state[PLANE_DESTRUCTION_RECORD_KEY]).length === 0) {
    delete state[PLANE_DESTRUCTION_RECORD_KEY];
  }
  writeJsonAtomically(filePath, state);
  return repaired;
}

export function repairNaturallyDestroyedPlanes(filePath, {
  worldYear,
  minAge = 2000,
} = {}) {
  const state = readState(filePath);
  if (!state) return [];
  const currentYear = normalizeWorldYear(worldYear);
  const requiredAge = Math.max(1, Number(minAge) || 2000);
  const repaired = [];
  for (const planeName of KNOWN_PLANES) {
    if (state[planeName] !== 0) continue;
    const record = destructionRecord(state, planeName);
    const destroyedYear = normalizeWorldYear(record.worldYear);
    if (record.source !== PLANE_DESTRUCTION_SOURCES.DARK_REVOLT) continue;
    if (currentYear === null || destroyedYear === null) continue;
    if (currentYear - destroyedYear < requiredAge) continue;
    state[planeName] = 1;
    delete state[PLANE_DESTRUCTION_RECORD_KEY][planeName];
    repaired.push(planeName);
  }
  if (repaired.length === 0) return repaired;
  if (Object.keys(state[PLANE_DESTRUCTION_RECORD_KEY]).length === 0) delete state[PLANE_DESTRUCTION_RECORD_KEY];
  writeJsonAtomically(filePath, state);
  return repaired;
}

export function buildPlaneDestroyedMessage(filePath, planeName) {
  const info = getPlaneDestructionInfo(filePath, planeName);
  const lines = ['【虚空封锁·位面崩灭】', ''];
  if (info.source === PLANE_DESTRUCTION_SOURCES.DARK_REVOLT) {
    const actor = info.actor && info.actor !== '禁区至尊' ? `【${info.actor}】` : '';
    lines.push(
      `「${planeName}」已被禁区至尊${actor}彻底打爆。`,
      '位面本源正在诸天岁月中缓慢重聚，修复完成前无法进入或下本。',
    );
  } else if (info.source === PLANE_DESTRUCTION_SOURCES.STRANGE_EMPEROR) {
    lines.push(
      `「${planeName}」已被厄土仙帝彻底毁灭。`,
      '仙帝法则磨灭了位面本源，此界不会随时间自行恢复。',
      '唯有仙帝级及以上强者施展映照权能，方可重塑此界。',
    );
  } else {
    lines.push(
      `「${planeName}」已经被打爆，位面通道与副本入口均已崩塌。`,
      '修复完成前无法进入或下本。',
    );
  }
  return lines.join('\n');
}
