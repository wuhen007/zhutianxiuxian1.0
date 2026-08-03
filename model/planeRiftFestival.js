import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { getRealmEventWorldYear } from './realmEventClock.js';

export const FESTIVAL_PLANE = '太初星墟';
export const RIFT_PLANES = Object.freeze(['仙界', FESTIVAL_PLANE]);
export const RIFT_REFRESH_YEARS = 2000;
export const RIFT_DURATION_MS = 4 * 60 * 60 * 1000;
export const RIFT_BASE_CHANCE = 0.35;
export const RIFT_PITY_STEP = 0.15;
export const RIFT_MAX_CHANCE = 0.8;
export const RIFT_MAX_DEPTH = 3;

const MODEL_DIR = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(MODEL_DIR, '..', 'resources', 'data', 'plane_rift_festival.json');

const RIFT_DEFINITIONS = Object.freeze({
  仙界: [
    { name: '斩岁仙府', location: '冥寒仙府', coordinate: { x: 242, y: 116 } },
    { name: '万象丹庭', location: '广寒界', coordinate: { x: 90, y: 745 } },
    { name: '天河兵冢', location: '永恒之花', coordinate: { x: 625, y: 720 } },
  ],
  [FESTIVAL_PLANE]: [
    { name: '归零舰墓', location: '归零舰墓', coordinate: { x: 180, y: 180 } },
    { name: '太初矿心', location: '太初矿心', coordinate: { x: 500, y: 500 } },
    { name: '无光观测站', location: '无光观测站', coordinate: { x: 820, y: 180 } },
  ],
});

export const RIFT_ROUTES = Object.freeze({
  稳阵: { baseChance: 0.92, depthPenalty: 0.08, loot: depth => 3 + depth, anchor: 6, contribution: 4 },
  寻宝: { baseChance: 0.74, depthPenalty: 0.11, loot: depth => 5 + depth * 2, anchor: 3, contribution: 3 },
  强攻: { baseChance: 0.6, depthPenalty: 0.12, loot: depth => 8 + depth * 3, anchor: 4, contribution: 6 },
});

export function getDefaultRiftState() {
  return {
    lastCheckWorldYear: null,
    pity: Object.fromEntries(RIFT_PLANES.map(plane => [plane, 0])),
    activeRifts: [],
    history: [],
  };
}

export function readRiftState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return {
        ...getDefaultRiftState(),
        ...saved,
        pity: { ...getDefaultRiftState().pity, ...(saved.pity || {}) },
      };
    }
  } catch (error) {
    console.error('[巡界活动] 读取状态失败:', error.message);
  }
  return getDefaultRiftState();
}

export function saveRiftState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export function getActiveRifts(state, now = Date.now()) {
  return (state.activeRifts || []).filter(rift => Number(rift.expiresAt) > now);
}

function hasPendingExpeditions(rift) {
  return Object.values(rift?.expeditions || {}).some(expedition =>
    expedition?.status === 'active' || !expedition?.settled
  );
}

export function getRiftRefreshChance(state, plane) {
  return Math.min(
    RIFT_MAX_CHANCE,
    RIFT_BASE_CHANCE + Math.max(0, Number(state.pity?.[plane]) || 0) * RIFT_PITY_STEP,
  );
}

export function rollPeriodicRifts(state, currentWorldYear, options = {}) {
  const random = options.random || Math.random;
  const now = Number(options.now) || Date.now();
  if (currentWorldYear <= 0 || currentWorldYear % RIFT_REFRESH_YEARS !== 0) {
    return { checked: false, opened: [] };
  }
  if (Number(state.lastCheckWorldYear) === currentWorldYear) {
    return { checked: false, opened: [] };
  }

  state.lastCheckWorldYear = currentWorldYear;
  state.activeRifts = (state.activeRifts || []).filter(rift =>
    Number(rift.expiresAt) > now || hasPendingExpeditions(rift)
  );
  state.pity ||= {};
  state.history ||= [];
  const opened = [];

  for (const plane of RIFT_PLANES) {
    if (state.activeRifts.some(rift => rift.plane === plane && Number(rift.expiresAt) > now)) continue;
    const chance = getRiftRefreshChance(state, plane);
    if (random() >= chance) {
      state.pity[plane] = Math.max(0, Number(state.pity[plane]) || 0) + 1;
      continue;
    }

    const definitions = RIFT_DEFINITIONS[plane];
    const definition = definitions[Math.min(definitions.length - 1, Math.floor(random() * definitions.length))];
    const rift = {
      id: `${currentWorldYear}-${plane}`,
      plane,
      ...definition,
      worldYear: currentWorldYear,
      openedAt: now,
      expiresAt: now + RIFT_DURATION_MS,
      anchor: 0,
      contribution: {},
      expeditions: {},
    };
    state.activeRifts.push(rift);
    state.history.push({ id: rift.id, plane, name: rift.name, worldYear: currentWorldYear, openedAt: now });
    state.pity[plane] = 0;
    opened.push(rift);
  }

  state.history = state.history.slice(-50);
  return { checked: true, opened };
}

export function triggerPeriodicRifts(eraIndex, years, epoch = 1, options = {}) {
  const state = readRiftState();
  const worldYear = getRealmEventWorldYear(eraIndex, years, epoch);
  const result = rollPeriodicRifts(state, worldYear, options);
  if (!result.checked) return null;
  saveRiftState(state);
  if (result.opened.length === 0) return null;

  return {
    ...result,
    message: [
      '【巡界司急报·限时裂界】',
      ...result.opened.flatMap(rift => [
        `${rift.plane}出现「${rift.name}」！`,
        `入口：${rift.location}（坐标 ${rift.coordinate.x},${rift.coordinate.y}）`,
      ]),
      '裂界仅维持4小时。抵达对应位面坐标后发送 #进入裂界。',
      '探索可选稳阵、寻宝、强攻；越深入收益越高，失手则只保住一半界源。',
    ].join('\n'),
  };
}

export function triggerPeriodicRiftsForEra(eraIndex, years, epoch = 1, options = {}) {
  return triggerPeriodicRifts(eraIndex, years, epoch, options);
}

export function updateFestivalSign(player, dateKey, yesterdayKey) {
  const sign = player.巡界签到 || { lastDate: '', streak: 0, total: 0 };
  if (sign.lastDate === dateKey) return { ok: false, reason: 'already', sign };
  sign.streak = sign.lastDate === yesterdayKey ? Math.max(0, Number(sign.streak) || 0) + 1 : 1;
  sign.total = Math.max(0, Number(sign.total) || 0) + 1;
  sign.lastDate = dateKey;
  player.巡界签到 = sign;
  return { ok: true, sign };
}

export function beginRiftExpedition(state, riftId, qq, now = Date.now()) {
  const rift = getActiveRifts(state, now).find(item => item.id === riftId);
  if (!rift) return { ok: false, reason: 'closed' };
  rift.expeditions ||= {};
  if (rift.expeditions[qq]) return { ok: false, reason: 'used', expedition: rift.expeditions[qq] };
  const expedition = {
    status: 'active', depth: 0, loot: 0, contribution: 0, startedAt: now, settled: false,
  };
  rift.expeditions[qq] = expedition;
  return { ok: true, rift, expedition };
}

export function exploreRift(state, riftId, qq, routeName, options = {}) {
  const random = options.random || Math.random;
  const rift = (state.activeRifts || []).find(item => item.id === riftId);
  const expedition = rift?.expeditions?.[qq];
  const route = RIFT_ROUTES[routeName];
  if (!rift || !expedition) return { ok: false, reason: 'missing' };
  if (expedition.status !== 'active') return { ok: false, reason: 'finished' };
  if (!route) return { ok: false, reason: 'route' };
  if (Number(rift.expiresAt) <= (Number(options.now) || Date.now())) {
    return { ok: false, reason: 'expired', rift, expedition };
  }

  const depth = Math.max(0, Number(expedition.depth) || 0);
  const realmBonus = Math.min(0.15, Math.max(0, (Number(options.realmLevel) - 16) * 0.02));
  const signBonus = Math.min(0.07, Math.max(0, Number(options.signStreak) || 0) * 0.01);
  const chance = Math.min(0.98, Math.max(0.05, route.baseChance - depth * route.depthPenalty + realmBonus + signBonus));
  const success = random() < chance;

  if (!success) {
    expedition.status = 'failed';
    expedition.finishedAt = Number(options.now) || Date.now();
    expedition.secured = Math.floor((Number(expedition.loot) || 0) / 2);
    return { ok: true, success: false, chance, rift, expedition, secured: expedition.secured };
  }

  const gained = route.loot(depth);
  expedition.loot += gained;
  expedition.depth = depth + 1;
  expedition.contribution += route.contribution;
  rift.anchor = Math.min(100, Math.max(0, Number(rift.anchor) || 0) + route.anchor);
  rift.contribution ||= {};
  rift.contribution[qq] = (Number(rift.contribution[qq]) || 0) + route.contribution;
  const completed = expedition.depth >= RIFT_MAX_DEPTH;
  if (completed) {
    expedition.status = 'cleared';
    expedition.finishedAt = Number(options.now) || Date.now();
    expedition.secured = expedition.loot;
  }
  return { ok: true, success: true, completed, chance, gained, rift, expedition, secured: completed ? expedition.secured : 0 };
}

export function withdrawRift(state, riftId, qq, now = Date.now()) {
  const rift = (state.activeRifts || []).find(item => item.id === riftId);
  const expedition = rift?.expeditions?.[qq];
  if (!rift || !expedition) return { ok: false, reason: 'missing' };
  if (expedition.status !== 'active') return { ok: false, reason: 'finished' };
  expedition.status = Number(rift.expiresAt) <= now ? 'expired' : 'withdrew';
  expedition.finishedAt = now;
  expedition.secured = Math.max(0, Number(expedition.loot) || 0);
  return { ok: true, rift, expedition, secured: expedition.secured };
}

export function calculateRiftPayout(rift, secured) {
  const multiplier = 1 + Math.min(100, Math.max(0, Number(rift?.anchor) || 0)) / 200;
  const source = Math.floor(Math.max(0, Number(secured) || 0) * multiplier);
  return { multiplier, source, cultivation: source * 500000, blood: source * 500000 };
}
