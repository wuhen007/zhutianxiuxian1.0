import fs from 'node:fs';

import { writeJsonAtomically } from '../utils/atomicJson.js';
import { PLACE_LOCATION_NAMES } from './weimianTravel.js';

export const PLANE_DESTRUCTION_RECORD_KEY = '位面毁灭记录';
export const PLANE_DAMAGE_RECORD_KEY = '位面损坏记录';
export const PLANE_DESTRUCTION_SOURCES = Object.freeze({
  DARK_REVOLT: 'dark_revolt',
  FOREIGN_IMPERIAL_PASS: 'foreign_imperial_pass',
  STRANGE_EMPEROR: 'strange_emperor',
  EMPEROR_REFINEMENT: 'emperor_refinement',
  CORPSE_EMPEROR_BREATH: 'corpse_emperor_breath',
  HIGHLAND_TERROR: 'highland_terror',
  DIMENSION_CALAMITY: 'dimension_calamity',
  CAUSAL_BACKLASH: 'causal_backlash',
});

const KNOWN_PLANES = PLACE_LOCATION_NAMES;

const NATURALLY_REPAIRABLE_SOURCES = Object.freeze([
  PLANE_DESTRUCTION_SOURCES.DARK_REVOLT,
  PLANE_DESTRUCTION_SOURCES.FOREIGN_IMPERIAL_PASS,
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
    permanent: planeName === '厄土高原' && state?.高原彻底覆灭 === true,
    planeName,
    source: record.source || 'unknown',
    actor: record.actor || '',
    worldYear: normalizeWorldYear(record.worldYear),
  };
}

export function isEraReshapeUnlocked(filePath) {
  return getPlaneDestructionInfo(filePath, '厄土高原').destroyed;
}

export function markPlaneDestroyed(filePath, planeName, {
  source = 'unknown',
  actor = '',
  worldYear = null,
  permanent = false,
} = {}) {
  const state = readState(filePath);
  if (!state || !(planeName in state)) return false;
  state[planeName] = 0;
  if (planeName === '厄土高原' && permanent) state.高原彻底覆灭 = true;
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

export function markPlanesDestroyed(filePath, planeNames, {
  source = PLANE_DESTRUCTION_SOURCES.DIMENSION_CALAMITY,
  actor = '',
  worldYear = null,
} = {}) {
  const state = readState(filePath);
  if (!state) return [];
  const names = [...new Set((Array.isArray(planeNames) ? planeNames : [])
    .map(String)
    .filter((name) => name && name in state))];
  if (!names.length) return [];
  state[PLANE_DESTRUCTION_RECORD_KEY] ||= {};
  for (const planeName of names) {
    state[planeName] = 0;
    state[PLANE_DESTRUCTION_RECORD_KEY][planeName] = {
      source,
      actor,
      worldYear: normalizeWorldYear(worldYear),
    };
  }
  writeJsonAtomically(filePath, state);
  return names;
}

export function damagePlanes(filePath, planeNames, {
  source = PLANE_DESTRUCTION_SOURCES.CORPSE_EMPEROR_BREATH,
  actor = '',
  bearingLossPerPlane = 100_000,
  now = Date.now(),
} = {}) {
  const state = readState(filePath);
  if (!state) return { damaged: [], bearingBefore: 0, bearingAfter: 0, bearingLoss: 0 };
  if (!state[PLANE_DAMAGE_RECORD_KEY] || typeof state[PLANE_DAMAGE_RECORD_KEY] !== 'object') {
    state[PLANE_DAMAGE_RECORD_KEY] = {};
  }

  const damaged = [...new Set((Array.isArray(planeNames) ? planeNames : []).map(String).filter(Boolean))];
  for (const planeName of damaged) {
    const old = state[PLANE_DAMAGE_RECORD_KEY][planeName] || {};
    state[PLANE_DAMAGE_RECORD_KEY][planeName] = {
      source,
      actor,
      damage: Math.min(100, Math.max(0, Number(old.damage) || 0) + 10),
      count: Math.max(0, Number(old.count) || 0) + 1,
      updatedAt: now,
    };
  }
  const bearingBefore = Math.max(0, Number(state.现世承受力) || 0);
  const bearingLoss = Math.min(bearingBefore, Math.max(0, Number(bearingLossPerPlane) || 0) * damaged.length);
  state.现世承受力 = bearingBefore - bearingLoss;
  state.大宇宙精气流失 = Math.max(0, Number(state.大宇宙精气流失) || 0) + bearingLoss;
  writeJsonAtomically(filePath, state);
  return { damaged, bearingBefore, bearingAfter: state.现世承受力, bearingLoss };
}

export function repairPlane(filePath, planeName) {
  const state = readState(filePath);
  if (!state || state[planeName] !== 0) return false;
  if (planeName === '厄土高原' && state.高原彻底覆灭 === true) return false;
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
    if (planeName === '厄土高原' && state.高原彻底覆灭 === true) continue;
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
    if (planeName === '厄土高原' && state.高原彻底覆灭 === true) continue;
    const record = destructionRecord(state, planeName);
    const destroyedYear = normalizeWorldYear(record.worldYear);
    if (!NATURALLY_REPAIRABLE_SOURCES.includes(record.source)) continue;
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
  if (info.permanent) {
    lines.push('厄土高原已被祭道之上的伟力彻底摧毁，诡异本源与意志永灭。', '此结局超越时间线，映照与岁月重塑均不再复原高原。');
  } else if (info.source === PLANE_DESTRUCTION_SOURCES.DARK_REVOLT) {
    const actor = info.actor && info.actor !== '禁区至尊' ? `【${info.actor}】` : '';
    lines.push(
      `「${planeName}」已被禁区至尊${actor}彻底打爆。`,
      '位面本源正在诸天岁月中缓慢重聚，修复完成前无法进入或下本。',
    );
  } else if (info.source === PLANE_DESTRUCTION_SOURCES.FOREIGN_IMPERIAL_PASS) {
    lines.push(
      `「${planeName}」在异域叩击帝关时被异域法则撕裂。`,
      '帝关城破后，位面本源仍会随诸天岁月缓慢重聚，达到修复年限后恢复。',
      '修复完成前无法进入或下本。',
    );
  } else if (info.source === PLANE_DESTRUCTION_SOURCES.STRANGE_EMPEROR) {
    lines.push(
      `「${planeName}」已被厄土仙帝彻底毁灭。`,
      '仙帝法则磨灭了位面本源，此界不会随时间自行恢复。',
      '唯有仙帝级及以上强者施展映照权能，方可重塑此界。',
    );
  } else if (info.source === PLANE_DESTRUCTION_SOURCES.EMPEROR_REFINEMENT) {
    lines.push(
      `「${planeName}」已被帝尊以世界鼎炼化。`,
      '遮天宇宙的万道与众生道果皆已归入世界鼎，位面通道与副本入口彻底封闭。',
      '帝尊危机未被终结前，此界不会随时间自行恢复。',
      '大帝级强者可发送 #组队迎战帝尊，击败帝尊后夺回万道并重塑此界。',
    );
  } else if (info.source === PLANE_DESTRUCTION_SOURCES.HIGHLAND_TERROR) {
    lines.push(
      `「${planeName}」被厄土高原降下的大恐怖打灭。`,
      '诡异源头磨灭了此界现世锚点，位面不会自然恢复，需由仙帝映照诸世后重塑。',
      '灾厄平息前无法进入或下本。',
    );
  } else if (info.source === PLANE_DESTRUCTION_SOURCES.DIMENSION_CALAMITY) {
    lines.push(
      `「${planeName}」被永恒未知之地降临的大恐怖席卷覆灭。`,
      '维度灾厄已抹去此界当前锚点，位面不会自然恢复，需由高境界映照权能重新锚定。',
      '灾厄平息前无法进入或下本。',
    );
  } else {
    lines.push(
      `「${planeName}」已经被打爆，位面通道与副本入口均已崩塌。`,
      '修复完成前无法进入或下本。',
    );
  }
  return lines.join('\n');
}
