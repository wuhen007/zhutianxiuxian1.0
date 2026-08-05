import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { getRealmEventWorldYear } from './realmEventClock.js';
import { judgeGuardBattle } from './riftGuardian.js';

export const FESTIVAL_PLANE = '太初星墟';
export const RIFT_PLANES = Object.freeze(['仙界', FESTIVAL_PLANE]);
export const RIFT_REFRESH_YEARS = 2000;
export const RIFT_DURATION_MS = 4 * 60 * 60 * 1000;
export const RIFT_BASE_CHANCE = 0.35;
export const RIFT_PITY_STEP = 0.15;
export const RIFT_MAX_CHANCE = 0.8;
export const RIFT_MAX_DEPTH = 3;
export const RIFT_EXCHANGES = Object.freeze({
  真我宝盒: Object.freeze({ cost: 10, name: '真我宝盒', class: '盒子', amount: 1 }),
  超越宝盒: Object.freeze({ cost: 10, name: '超越宝盒', class: '盒子', amount: 1 }),
  星图: Object.freeze({ cost: 40, name: '星图', class: '道具', amount: 1 }),
  巡界玉符: Object.freeze({ cost: 18, name: '巡界玉符', class: '道具', amount: 2 }),
  定神丹: Object.freeze({ cost: 25, name: '定神丹', class: '丹药', amount: 1 }),
  无尽秘钥: Object.freeze({cost: 50,name: '无尽秘钥',class: '道具',amount: 1,}),
  无尽秘钥配方: Object.freeze({cost: 100,name: '无尽秘钥配方',class: '道具',amount: 1,}),
});

export function parseRiftExchangeName(message) {
  return String(message || '').replace(/^#界源兑换/, '').replace(/\s+/g, '');
}

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
  稳阵: {
    baseChance: 0.92,
    depthPenalty: 0.08,
    loot: depth => 3 + depth,
    anchor: 6,
    contribution: 4,
    // 界潮涌动：环境扰动，压低当层成功率；全服锚定度够高时界潮被压制一半
    disturbance: Object.freeze({
      type: '界潮涌动',
      trigger: 0.35,
      penalty: 0.2,
      anchorRelief: 60,
      reliefRate: 0.5,
    }),
  },
  寻宝: {
    baseChance: 0.74,
    depthPenalty: 0.11,
    loot: depth => 5 + depth * 2,
    anchor: 3,
    contribution: 3,
    // 守护灵：先掷潜行/破阵，成功加成收益，失败折损收益并压低成功率
    disturbance: Object.freeze({
      type: '守护灵',
      trigger: 0.45,
      stealthBase: 0.5,
      winScale: 1.3,
      failScale: 0.6,
      failPenalty: 0.1,
    }),
  },
  强攻: {
    baseChance: 0.6,
    depthPenalty: 0.12,
    loot: depth => 8 + depth * 3,
    anchor: 4,
    contribution: 6,
    // 裂界守卫：每层必战，胜负直接取代成功率判定
    disturbance: Object.freeze({ type: '裂界守卫', trigger: 1, combat: true }),
  },
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
  // Windows 上杀软 / 索引器会瞬时锁住 JSON 文件，导致 writeFileSync 抛
  // "UNKNOWN: unknown error, open ..."。这里用 写临时文件 + rename + 重试 抗住这种瞬时锁。
  const data = JSON.stringify(state, null, 2);
  const tmp = `${STATE_FILE}.tmp`;
  const delays = [0, 20, 60, 120, 240, 400];
  let lastErr;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) {
      const end = Date.now() + delays[i];
      while (Date.now() < end) {}
    }
    try {
      fs.writeFileSync(tmp, data, 'utf8');
      try {
        fs.renameSync(tmp, STATE_FILE);
      } catch (renameErr) {
        // rename 偶发被锁，退化为直接覆盖写
        fs.writeFileSync(STATE_FILE, data, 'utf8');
        try { fs.unlinkSync(tmp); } catch {}
      }
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  // 最后兜底：再直接写一次
  try {
    fs.writeFileSync(STATE_FILE, data, 'utf8');
    return;
  } catch (err) {
    lastErr = err;
  }
  throw lastErr;
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

/**
 * 管理员强制开启裂界：绕过世界年判定，立即在指定位面生成一处裂界。
 * pick 可为数字（第几个定义，从 1 起）或副本名（模糊匹配）；缺省则随机。
 */
export function openRiftManually(state, plane, options = {}) {
  if (!RIFT_PLANES.includes(plane)) {
    return { ok: false, reason: 'plane', planes: RIFT_PLANES };
  }
  const definitions = RIFT_DEFINITIONS[plane];
  const random = options.random || Math.random;
  let definition;
  const pick = options.pick;
  if (pick != null) {
    if (typeof pick === 'number') {
      definition = definitions[Math.min(definitions.length - 1, Math.max(0, Math.floor(pick) - 1))];
    } else {
      definition = definitions.find(d => d.name === pick) || definitions.find(d => d.name.includes(pick));
    }
  }
  if (!definition) {
    definition = definitions[Math.min(definitions.length - 1, Math.floor(random() * definitions.length))];
  }
  const now = Number(options.now) || Date.now();
  const duration = Math.max(60000, Number(options.durationMs) || RIFT_DURATION_MS);
  const id = `manual-${plane}-${now}-${Math.floor(random() * 1e6)}`;
  const rift = {
    id,
    plane,
    ...definition,
    worldYear: Number(options.worldYear) || 0,
    openedAt: now,
    expiresAt: now + duration,
    anchor: 0,
    contribution: {},
    expeditions: {},
    manual: true,
  };
  state.activeRifts ||= [];
  state.activeRifts.push(rift);
  return { ok: true, rift };
}

/**
 * 管理员强制关闭裂界。
 * options.all 关闭全部；否则可指定 plane（关闭该位面所有进行中裂界）或 id（精确关闭）。
 * 仅把 expiresAt 拨到过去；玩家正在进行的探索会在下次操作时按过期自动结算，已得界源不丢。
 */
export function closeRifts(state, options = {}) {
  const now = Number(options.now) || Date.now();
  const closed = [];
  for (const rift of state.activeRifts || []) {
    if (Number(rift.expiresAt) <= now) continue;
    if (options.id) {
      if (rift.id !== options.id) continue;
    } else if (options.plane) {
      if (rift.plane !== options.plane) continue;
    } else if (!options.all) {
      continue;
    }
    rift.expiresAt = now - 1;
    closed.push({ id: rift.id, name: rift.name, plane: rift.plane });
  }
  return { ok: true, closed };
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
  let chance = route.baseChance - depth * route.depthPenalty + realmBonus + signBonus;

  // ===== 外界干扰阶段 =====
  const config = route.disturbance;
  const disturbance = { type: config?.type || null, triggered: false, detail: '', verdict: null };
  let lootScale = 1;
  let contributionBonus = 0;
  let hpLoss = 0;
  let forcedFail = false;
  let combatResolved = false;

  if (config?.combat) {
    // 强攻：每层强制遭遇裂界守卫，战斗结果直接取代成功率判定
    const guardian = options.guardian;
    if (guardian) {
      const verdict = judgeGuardBattle(options.combatPower, guardian, { random });
      disturbance.triggered = true;
      disturbance.verdict = verdict;
      disturbance.detail = verdict.summary;
      lootScale = verdict.lootScale;
      contributionBonus = verdict.contributionBonus;
      hpLoss = verdict.hpLoss;
      combatResolved = true;
      forcedFail = verdict.outcome === 'lose';
    }
  } else if (config && random() < config.trigger) {
    disturbance.triggered = true;
    if (config.type === '界潮涌动') {
      const anchor = Math.max(0, Number(rift.anchor) || 0);
      const relieved = anchor >= config.anchorRelief;
      const penalty = relieved ? config.penalty * config.reliefRate : config.penalty;
      chance -= penalty;
      disturbance.penalty = Number(penalty.toFixed(4));
      disturbance.relieved = relieved;
      disturbance.detail = relieved
        ? `界潮翻涌，但锚定度${anchor}%压住了大半，成功率-${Math.round(penalty * 100)}%`
        : `界潮翻涌冲散阵脚，成功率-${Math.round(penalty * 100)}%`;
    } else if (config.type === '守护灵') {
      const stealthChance = Math.min(
        0.95,
        Math.max(
          0.05,
          config.stealthBase +
            signBonus +
            Math.min(0.1, Math.max(0, (Number(options.realmLevel) - 16) * 0.01))
        )
      );
      const stealthPass = random() < stealthChance;
      disturbance.stealthChance = Number(stealthChance.toFixed(4));
      disturbance.stealthPass = stealthPass;
      if (stealthPass) {
        lootScale = config.winScale;
        disturbance.detail = `潜行绕过守护灵（成功率${Math.round(stealthChance * 100)}%），本层收益×${config.winScale}`;
      } else {
        lootScale = config.failScale;
        chance -= config.failPenalty;
        disturbance.detail = `破阵失手惊动守护灵（成功率${Math.round(stealthChance * 100)}%），收益×${config.failScale}且成功率-${Math.round(config.failPenalty * 100)}%`;
      }
    }
  }

  chance = Math.min(0.98, Math.max(0.05, chance));
  const success = combatResolved ? !forcedFail : random() < chance;

  if (!success) {
    expedition.status = 'failed';
    expedition.finishedAt = Number(options.now) || Date.now();
    expedition.secured = Math.floor((Number(expedition.loot) || 0) / 2);
    return {
      ok: true,
      success: false,
      chance,
      disturbance,
      hpLoss,
      rift,
      expedition,
      secured: expedition.secured,
    };
  }

  const gained = Math.max(1, Math.round(route.loot(depth) * lootScale));
  const contribution = route.contribution + contributionBonus;
  expedition.loot += gained;
  expedition.depth = depth + 1;
  expedition.contribution += contribution;
  rift.anchor = Math.min(100, Math.max(0, Number(rift.anchor) || 0) + route.anchor);
  rift.contribution ||= {};
  rift.contribution[qq] = (Number(rift.contribution[qq]) || 0) + contribution;
  const completed = expedition.depth >= RIFT_MAX_DEPTH;
  if (completed) {
    expedition.status = 'cleared';
    expedition.finishedAt = Number(options.now) || Date.now();
    expedition.secured = expedition.loot;
  }
  return {
    ok: true,
    success: true,
    completed,
    chance,
    gained,
    disturbance,
    hpLoss,
    rift,
    expedition,
    secured: completed ? expedition.secured : 0,
  };
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

export function calculateRiftPayout(rift, secured, realm = {}) {
  const multiplier = 1 + Math.min(100, Math.max(0, Number(rift?.anchor) || 0)) / 200;
  const source = Math.floor(Math.max(0, Number(secured) || 0) * multiplier);
  // 境界乘区：练气境界 × 炼体境界 × 仙古境界 × 秘境境界，任一为 0/缺失按 1 计，保证新玩家不归零。
  const level = Math.max(1, Number(realm.level) || 1);
  const physique = Math.max(1, Number(realm.physique) || 1);
  const xiangu = Math.max(1, Number(realm.xiangu) || 1);
  const mijing = Math.max(1, Number(realm.mijing) || 1);
  const realmMult = level * physique * xiangu * mijing;
  return {
    multiplier,
    source,
    realmMult,
    cultivation: source * 500000 * realmMult,
    blood: source * 500000 * realmMult,
  };
}
