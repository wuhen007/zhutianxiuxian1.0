import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeJsonAtomically } from '../utils/atomicJson.js';

export const STONE_JAR_OPPORTUNITY = '石罐本体';
export const STONE_JAR_CLUE_REQUIREMENT = 9;

const STATE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'resources',
  'data',
  'shengxu_unique_opportunity.json'
);

export function defaultShengxuOpportunityState() {
  return { opportunities: {} };
}

export function readShengxuOpportunityState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return defaultShengxuOpportunityState();
    return { ...defaultShengxuOpportunityState(), ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
  } catch (error) {
    console.error('[圣墟唯一机缘] 读取状态失败:', error.message);
    return defaultShengxuOpportunityState();
  }
}

export function claimShengxuOpportunityState(state, name, ownerId, now = Date.now()) {
  state.opportunities ??= {};
  if (state.opportunities[name]) {
    return { ok: false, reason: 'owned', ownerId: state.opportunities[name].ownerId };
  }
  state.opportunities[name] = { ownerId: String(ownerId), claimedAt: now };
  return { ok: true, name, ownerId: String(ownerId), claimedAt: now };
}

export function claimShengxuOpportunity(name, ownerId, now = Date.now()) {
  const state = readShengxuOpportunityState();
  const result = claimShengxuOpportunityState(state, name, ownerId, now);
  if (result.ok) writeJsonAtomically(STATE_FILE, state);
  return result;
}

export function getShengxuOpportunityOwner(name) {
  return readShengxuOpportunityState().opportunities?.[name]?.ownerId || '';
}
