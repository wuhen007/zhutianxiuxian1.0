import { getRealmAuthorityLevel, getRealmAuthorityPath, lowerRealmAuthority } from './realmAuthority.js';
import { getCausalDebtMultiplier } from './innateTreasure.js';

export const WORLDLINE_STATE_VERSION = 2;
export const BREAK_KING_EMPEROR_RETRY_COOLDOWN_MS = 30 * 60 * 1000;
export const CAUSAL_DEBT_BACKLASH_THRESHOLD = 200;
export const TIME_RIVER_BACKLASH_BOLTS = 20;
export const TIME_RIVER_BACKLASH_DAMAGE_RATIO = 1.2;
export const WORLDLINE_WITHDRAWAL_BLOCK_MS = 12 * 60 * 60 * 1000;

export const PRE_QUASI_EMPEROR_REALMS = Object.freeze({
  mijing: Object.freeze({ field: 'mijinglevel_id', realmId: 19, targetRealmId: 20, name: '秘境体系' }),
  xiangu: Object.freeze({ field: 'xiangulevel_id', realmId: 20, targetRealmId: 21, name: '仙古体系' }),
  huafen: Object.freeze({ field: 'huafenlevel_id', realmId: 20, targetRealmId: 21, name: '花粉路' }),
});

export const CAUSAL_FACT_TYPES = Object.freeze({
  证道: Object.freeze({ weight: 180, label: '证道成帝' }),
  创道: Object.freeze({ weight: 160, label: '开创大道' }),
  造化: Object.freeze({ weight: 140, label: '唯一性造化' }),
  功法: Object.freeze({ weight: 50, label: '习得功法' }),
  物品: Object.freeze({ weight: 70, label: '获得物品' }),
  至宝: Object.freeze({ weight: 150, label: '执掌至宝' }),
  关系: Object.freeze({ weight: 90, label: '因果关系' }),
});

const MAX_FACTS = 240;
const MAX_HISTORY = 120;

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function trimHistory(history) {
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
}

function factId(type, name) {
  return `${type}:${String(name).trim()}`;
}

export function ensureWorldlineState(player) {
  const old = player.时间线权能 && typeof player.时间线权能 === 'object'
    ? player.时间线权能
    : {};
  old.version = WORLDLINE_STATE_VERSION;
  old.facts = Array.isArray(old.facts) ? old.facts : [];
  old.destroyedLines = Array.isArray(old.destroyedLines) ? old.destroyedLines.map(String) : [];
  old.withdrawals = old.withdrawals && typeof old.withdrawals === 'object' ? old.withdrawals : {};
  old.tribulations = old.tribulations && typeof old.tribulations === 'object' ? old.tribulations : {};
  old.history = Array.isArray(old.history) ? old.history : [];
  old.causalDebt = Math.max(0, number(old.causalDebt));
  old.withdrawalBlockedUntil = Math.max(0, number(old.withdrawalBlockedUntil));
  old.noReturn = Boolean(old.noReturn);
  player.时间线权能 = old;
  return old;
}

export function registerCausalFact(player, type, name, options = {}) {
  const normalizedType = CAUSAL_FACT_TYPES[type] ? type : '物品';
  const normalizedName = String(name || '').trim();
  if (!normalizedName) return null;

  const state = ensureWorldlineState(player);
  const id = factId(normalizedType, normalizedName);
  let fact = state.facts.find(item => item.id === id);
  if (!fact) {
    fact = {
      id,
      type: normalizedType,
      name: normalizedName,
      state: 'anchored',
      createdAt: options.now ?? Date.now(),
      source: options.source || '',
      erasedLines: [],
    };
    state.facts.push(fact);
    if (state.facts.length > MAX_FACTS) state.facts.splice(0, state.facts.length - MAX_FACTS);
  } else if (fact.state !== 'anchored' && options.reanchor) {
    fact.state = 'anchored';
    fact.reanchoredAt = options.now ?? Date.now();
  }
  return fact;
}

export function synchronizeCausalFacts(player, now = Date.now()) {
  if (player.自创修炼体系?.name) {
    registerCausalFact(player, '创道', player.自创修炼体系.name, {
      now,
      source: player.自创修炼体系.route || getRealmAuthorityPath(player),
    });
  }
  if (player.已创自身之道 && player.自身之道名称) {
    registerCausalFact(player, '创道', player.自身之道名称, { now, source: '自身之道' });
  }
  if (getRealmAuthorityLevel(player) >= 21) {
    registerCausalFact(player, '证道', '仙帝道果', { now, source: getRealmAuthorityPath(player) });
  }
  return ensureWorldlineState(player).facts;
}

export function getBreakKingEmperorGate(player, forcedRoute, now = Date.now()) {
  const route = PRE_QUASI_EMPEROR_REALMS[forcedRoute]
    ? forcedRoute
    : PRE_QUASI_EMPEROR_REALMS[player?.自创修炼体系?.route]
      ? player.自创修炼体系.route
      : getRealmAuthorityPath(player);
  const config = PRE_QUASI_EMPEROR_REALMS[route];
  const realmId = number(player?.[config.field]);
  const state = ensureWorldlineState(player);
  const tribulation = state.tribulations[route];

  if (realmId < config.realmId) return { ok: false, reason: 'realm', route, config, realmId };
  if (realmId >= config.targetRealmId) {
    return { ok: true, reason: 'transcended', route, config, realmId, tribulation };
  }
  if (realmId !== config.realmId) return { ok: false, reason: 'route', route, config, realmId };

  const system = player.自创修炼体系;
  if (!system || (system.route && system.route !== route)) {
    return { ok: false, reason: 'system', route, config, realmId };
  }
  if (tribulation?.status === 'passed') {
    return { ok: true, reason: 'passed', route, config, realmId, tribulation };
  }
  if (isShapeSpiritDestroyed(player)) {
    return { ok: false, reason: 'destroyed', route, config, realmId, tribulation };
  }
  const retryAt = number(tribulation?.lastAttemptAt) + BREAK_KING_EMPEROR_RETRY_COOLDOWN_MS;
  if (tribulation?.status === 'failed' && retryAt > now) {
    return { ok: false, reason: 'cooldown', route, config, realmId, tribulation, retryAt };
  }
  return { ok: true, reason: 'ready', route, config, realmId, tribulation };
}

export function canEnterQuasiEmperor(player, route = getRealmAuthorityPath(player)) {
  const config = PRE_QUASI_EMPEROR_REALMS[route];
  if (!config) return { ok: false, reason: 'route', route };
  const realmId = number(player?.[config.field]);
  if (realmId >= config.targetRealmId) return { ok: true, reason: 'transcended', route, config };
  if (realmId !== config.realmId) return { ok: true, reason: 'not_transition', route, config };

  const gate = getBreakKingEmperorGate(player, route);
  if (!player.自创修炼体系 || (player.自创修炼体系.route && player.自创修炼体系.route !== route)) {
    return { ...gate, ok: false, reason: 'system' };
  }
  if (gate.tribulation?.status !== 'passed') return { ...gate, ok: false, reason: 'tribulation' };
  return { ...gate, ok: true, reason: 'passed' };
}

export function setShapeSpiritDestroyed(player, reason, now = Date.now()) {
  const state = ensureWorldlineState(player);
  if (!isShapeSpiritDestroyed(player)) player.形神俱灭前状态 = player.修仙状态 || '空闲';
  player.修仙状态 = '形神俱灭';
  player.练气存档状态 = '不可用';
  player.纳戒封锁 = { locked: true, reason: reason || '形神俱灭', at: now };
  player.当前血量 = 0;
  state.history.push({ type: '形神俱灭', reason: reason || '', at: now });
  trimHistory(state.history);
  return state;
}

export function isShapeSpiritDestroyed(player) {
  return player?.修仙状态 === '形神俱灭'
    || player?.练气存档状态 === '不可用'
    || player?.纳戒封锁?.locked === true;
}

export function rebuildShapeSpirit(player, rebuilderName = '', now = Date.now()) {
  if (!isShapeSpiritDestroyed(player)) return { ok: false, reason: 'healthy' };
  const state = ensureWorldlineState(player);
  player.修仙状态 = player.形神俱灭前状态 || '空闲';
  delete player.形神俱灭前状态;
  player.练气存档状态 = '可用';
  player.纳戒封锁 = { locked: false, repairedAt: now, repairedBy: rebuilderName };
  const maxHp = Math.max(1, number(player.血量上限, number(player.血气上限, 1)));
  player.当前血量 = Math.max(1, Math.floor(maxHp * 0.2));
  player.神魂损伤 = Math.max(0, number(player.神魂损伤) - 1);
  state.history.push({ type: '重塑形神', by: rebuilderName, at: now });
  trimHistory(state.history);
  return { ok: true, currentHp: player.当前血量 };
}

export function markBreakKingEmperorTribulationPassed(player, forcedRoute, now = Date.now()) {
  const gate = getBreakKingEmperorGate(player, forcedRoute, now);
  if (!gate.ok || (gate.reason !== 'ready' && gate.reason !== 'passed')) {
    return { ok: false, reason: gate.reason, gate };
  }

  const state = ensureWorldlineState(player);
  const record = {
    attempts: Math.max(0, number(gate.tribulation?.attempts)) + (gate.reason === 'ready' ? 1 : 0),
    status: 'passed',
    lastAttemptAt: now,
    passedAt: gate.tribulation?.passedAt || now,
  };
  state.tribulations[gate.route] = record;
  player.破王成帝 = 0;
  registerCausalFact(player, '创道', player.自创修炼体系.name, {
    now,
    source: gate.route,
    reanchor: true,
  });
  state.history.push({ type: '破王成帝劫', result: 'passed', route: gate.route, at: now });
  trimHistory(state.history);
  return { ok: true, outcome: 'passed', gate, record };
}

export function resolveBreakKingEmperorFailure(player, forcedRoute, random = Math.random, now = Date.now()) {
  const gate = getBreakKingEmperorGate(player, forcedRoute, now);
  if (!gate.ok || gate.reason !== 'ready') return { ok: false, reason: gate.reason, gate };

  const state = ensureWorldlineState(player);
  const roll = Math.max(0, Math.min(0.999999, number(random())));
  const record = {
    attempts: Math.max(0, number(gate.tribulation?.attempts)) + 1,
    status: 'failed',
    lastAttemptAt: now,
  };
  state.tribulations[gate.route] = record;

  if (roll < 0.55) {
    player.道果瑕疵 = number(player.道果瑕疵) + 1;
    record.outcome = 'flaw';
  } else if (roll < 0.85) {
    const maxHp = Math.max(1, number(player.血量上限, number(player.血气上限, 1)));
    player.当前血量 = Math.max(1, Math.floor(maxHp * 0.05));
    player.神魂损伤 = number(player.神魂损伤) + 1;
    record.outcome = 'severe';
  } else {
    setShapeSpiritDestroyed(player, '破王成帝劫失败', now);
    record.outcome = 'destroyed';
  }
  state.history.push({ type: '破王成帝劫', result: record.outcome, route: gate.route, at: now });
  trimHistory(state.history);
  return { ok: true, outcome: record.outcome, roll, gate, record };
}

export function resolveBreakKingEmperorTribulation(player, random = Math.random, now = Date.now()) {
  const gate = getBreakKingEmperorGate(player, getRealmAuthorityPath(player), now);
  if (!gate.ok || gate.reason !== 'ready') return { ok: false, reason: gate.reason, gate };

  const state = ensureWorldlineState(player);
  const attempts = Math.max(0, number(gate.tribulation?.attempts));
  const flawPenalty = Math.min(0.18, number(player.道果瑕疵) * 0.025);
  const debtPenalty = Math.min(0.22, state.causalDebt / 4000);
  const protection = Math.min(0.12, attempts * 0.02);
  const chance = Math.max(0.25, Math.min(0.75, 0.58 - flawPenalty - debtPenalty + protection));
  const roll = Math.max(0, Math.min(0.999999, number(random())));
  const record = {
    attempts: attempts + 1,
    chance,
    lastAttemptAt: now,
    status: 'failed',
  };
  state.tribulations[gate.route] = record;

  if (roll < chance) {
    record.status = 'passed';
    record.passedAt = now;
    player.破王成帝 = 0;
    registerCausalFact(player, '创道', player.自创修炼体系.name, {
      now,
      source: gate.route,
      reanchor: true,
    });
    state.history.push({ type: '破王成帝劫', result: 'passed', route: gate.route, at: now });
    trimHistory(state.history);
    return { ok: true, outcome: 'passed', chance, roll, gate, record };
  }

  if (roll < chance + 0.2) {
    player.道果瑕疵 = number(player.道果瑕疵) + 1;
    record.outcome = 'flaw';
  } else if (roll < chance + 0.34) {
    const maxHp = Math.max(1, number(player.血量上限, number(player.血气上限, 1)));
    player.当前血量 = Math.max(1, Math.floor(maxHp * 0.05));
    player.神魂损伤 = number(player.神魂损伤) + 1;
    record.outcome = 'severe';
  } else {
    setShapeSpiritDestroyed(player, '破王成帝劫失败', now);
    record.outcome = 'destroyed';
  }
  state.history.push({ type: '破王成帝劫', result: record.outcome, route: gate.route, at: now });
  trimHistory(state.history);
  return { ok: true, outcome: record.outcome, chance, roll, gate, record };
}

export function getCausalDebtTier(debt) {
  const value = Math.max(0, number(debt));
  if (value >= 1000) return { level: 4, name: '厄土大祭', effect: '厄土高原大祭可能提前降临' };
  if (value >= 600) return { level: 3, name: '古史清算', effect: '诸天位面与自身道果一同受损' };
  if (value >= 300) return { level: 2, name: '众生代偿', effect: '与自身有关之人被卷入因果惩罚' };
  if (value >= 100) return { level: 1, name: '绝灵回响', effect: '绝灵时代可能提前或延长' };
  return { level: 0, name: '因果平稳', effect: '尚未形成显著反噬' };
}

function updateCausalDebtProjection(player, state, now = Date.now()) {
  const tier = getCausalDebtTier(state.causalDebt);
  player.因果反噬 = { debt: state.causalDebt, ...tier, updatedAt: now };
  if (tier.level >= 2) {
    player.因果牵连 = {
      level: tier.level,
      effect: tier.effect,
      related: collectRelatedNames(player),
      updatedAt: now,
    };
  } else {
    delete player.因果牵连;
  }
  return tier;
}

export function getWorldlineWithdrawalBlock(player, now = Date.now()) {
  const state = ensureWorldlineState(player);
  const remainingMs = Math.max(0, state.withdrawalBlockedUntil - now);
  return {
    blocked: remainingMs > 0,
    until: state.withdrawalBlockedUntil,
    remainingMs,
  };
}

export function resolveCausalDebtBacklash(player, now = Date.now()) {
  const state = ensureWorldlineState(player);
  if (state.causalDebt <= CAUSAL_DEBT_BACKLASH_THRESHOLD) {
    return { triggered: false, debt: state.causalDebt };
  }

  const maxHp = Math.max(1, number(player.血量上限, number(player.血气上限, 1)));
  const damagePerBolt = Math.ceil(maxHp * TIME_RIVER_BACKLASH_DAMAGE_RATIO);
  const currentHp = Math.max(0, number(player.当前血量, maxHp));
  const totalDamage = damagePerBolt * TIME_RIVER_BACKLASH_BOLTS;
  player.当前血量 = Math.max(0, currentHp - totalDamage);
  const killed = player.当前血量 <= 0;
  if (killed) {
    player.道伤 = Math.max(0, number(player.道伤)) + 2;
    state.withdrawalBlockedUntil = Math.max(
      state.withdrawalBlockedUntil,
      now + WORLDLINE_WITHDRAWAL_BLOCK_MS,
    );
  }
  const result = {
    triggered: true,
    bolts: TIME_RIVER_BACKLASH_BOLTS,
    damagePerBolt,
    totalDamage,
    killed,
    blockedUntil: killed ? state.withdrawalBlockedUntil : 0,
  };
  state.history.push({ type: '时间长河雷劫', ...result, at: now });
  trimHistory(state.history);
  return result;
}

export function getCausalDebtReductionRate(player) {
  const level = getRealmAuthorityLevel(player);
  if (level >= 23) return Number.POSITIVE_INFINITY;
  if (level >= 22) return 5;
  if (level >= 21) return 3;
  if (level >= 20) return 1.5;
  return 0;
}

export function reduceCausalDebtWithEraAccumulation(player, requestedAmount = 1, now = Date.now()) {
  const state = ensureWorldlineState(player);
  const rate = getCausalDebtReductionRate(player);
  if (rate <= 0) return { ok: false, reason: 'authority', debt: state.causalDebt, rate };
  if (state.causalDebt <= 0) return { ok: false, reason: 'no_debt', debt: 0, rate };

  if (!Number.isFinite(rate)) {
    const reduced = state.causalDebt;
    state.causalDebt = 0;
    const tier = updateCausalDebtProjection(player, state, now);
    state.history.push({ type: '纪元消债', spent: 0, reduced, rate: 'free', at: now });
    trimHistory(state.history);
    return { ok: true, spent: 0, reduced, debt: 0, rate, tier, costFree: true };
  }

  const requested = Math.max(1, Math.floor(number(requestedAmount, 1)));
  const available = Math.max(0, Math.floor(number(player.纪元积累)));
  if (available <= 0) return { ok: false, reason: 'insufficient', debt: state.causalDebt, rate, available };
  const spent = Math.min(requested, available, Math.ceil(state.causalDebt / rate));
  const reduced = Math.min(state.causalDebt, spent * rate);
  player.纪元积累 = available - spent;
  state.causalDebt = Math.max(0, state.causalDebt - reduced);
  const tier = updateCausalDebtProjection(player, state, now);
  state.history.push({ type: '纪元消债', spent, reduced, rate, at: now });
  trimHistory(state.history);
  return { ok: true, spent, reduced, debt: state.causalDebt, rate, tier, costFree: false };
}

export function addCausalDebt(player, amount, reason, now = Date.now()) {
  const state = ensureWorldlineState(player);
  const costFree = getRealmAuthorityLevel(player) >= 23;
  const delta = costFree ? 0 : Math.ceil(Math.max(0, number(amount)) * getCausalDebtMultiplier(player));
  state.causalDebt += delta;
  state.history.push({ type: '因果债', amount: delta, reason: reason || '', at: now });
  trimHistory(state.history);
  const tier = updateCausalDebtProjection(player, state, now);
  const backlash = delta > 0 ? resolveCausalDebtBacklash(player, now) : { triggered: false };
  return { debt: state.causalDebt, delta, tier, backlash, costFree };
}

export function collectRelatedNames(player) {
  const names = [];
  const candidates = [
    player?.道侣?.name,
    player?.道侣?.名号,
    player?.师父?.name,
    player?.师父?.名号,
    player?.宗门?.宗门名称,
    player?.护法玩家?.名字,
  ];
  for (const value of candidates) {
    const name = String(value || '').trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names.slice(0, 8);
}

export function removeArtifactRankingEntries(ranking, itemName) {
  const normalizedName = String(itemName || '').trim();
  let removed = 0;
  const items = (Array.isArray(ranking) ? ranking : []).filter(item => {
    if (!normalizedName || item?.name !== normalizedName) return true;
    removed += 1;
    return false;
  });
  return { items, removed };
}

export function compareWorldlineAuthority(attacker, target) {
  const attackerLevel = getRealmAuthorityLevel(attacker);
  const targetLevel = getRealmAuthorityLevel(target);
  if (attackerLevel < 20) return { ok: false, reason: 'authority', attackerLevel, targetLevel };
  if (targetLevel > attackerLevel) return { ok: false, reason: 'higher_target', attackerLevel, targetLevel };
  if (targetLevel === attackerLevel) return { ok: false, reason: 'same_level', attackerLevel, targetLevel };
  return { ok: true, reason: 'suppressed', attackerLevel, targetLevel };
}

export function destroyWorldline(target, lineId, options = {}) {
  const state = ensureWorldlineState(target);
  const normalizedLineId = String(lineId || 'unknown');
  if (!state.destroyedLines.includes(normalizedLineId)) state.destroyedLines.push(normalizedLineId);

  const targetLevel = getRealmAuthorityLevel(target);
  let presentEffect = 'none';
  if (targetLevel === 20) {
    target.道果瑕疵 = number(target.道果瑕疵) + 1;
    target.古史创伤 = number(target.古史创伤) + 1;
    presentEffect = 'quasi_emperor_flaw';
  } else if (targetLevel < 20) {
    target.古史创伤 = number(target.古史创伤) + 1;
    presentEffect = 'causal_wound';
  }

  const available = [...new Set((options.availableLineIds || []).map(String))];
  const allLinesDestroyed = available.length > 0
    && available.every(id => state.destroyedLines.includes(id));
  if (targetLevel >= 21 && allLinesDestroyed && options.currentEternalSilence) {
    state.noReturn = true;
    playerNoReturn(target, options.now ?? Date.now());
  }
  state.history.push({
    type: '时间线毁灭',
    lineId: normalizedLineId,
    presentEffect,
    at: options.now ?? Date.now(),
  });
  trimHistory(state.history);
  return { presentEffect, allLinesDestroyed, noReturn: state.noReturn };
}

function playerNoReturn(player, now) {
  player.永寂状态 = '绝无复生';
  player.练气存档状态 = '永久不可用';
  player.纳戒封锁 = { locked: true, permanent: true, reason: '全时间线尽灭且当世永寂', at: now };
}

export function resolveAncientHistoryStrike(attacker, target, options = {}) {
  const comparison = compareWorldlineAuthority(attacker, target);
  const now = options.now ?? Date.now();
  if (!comparison.ok) {
    const debt = addCausalDebt(attacker, comparison.reason === 'same_level' ? 45 : 80, '强行触碰受护持的古史', now);
    if (comparison.reason === 'higher_target' && comparison.targetLevel >= 21) {
      setShapeSpiritDestroyed(attacker, '触碰路尽级古史遭本体抹杀', now);
      return { ok: false, ...comparison, outcome: 'obliterated', debt };
    }
    return {
      ok: false,
      ...comparison,
      outcome: comparison.reason === 'same_level' ? 'body_clash' : 'protected',
      debt,
    };
  }

  const type = CAUSAL_FACT_TYPES[options.type] ? options.type : '物品';
  const fact = registerCausalFact(target, type, options.name, { now, source: '古史锚点' });
  const targetLevel = comparison.targetLevel;
  if (targetLevel >= 21) {
    const line = destroyWorldline(target, options.lineId, options);
    fact.erasedLines = [...new Set([...(fact.erasedLines || []), String(options.lineId)])];
    const debt = addCausalDebt(attacker, CAUSAL_FACT_TYPES[type].weight, `打灭${type}时间线`, now);
    return { ok: true, outcome: 'line_only', fact, line, debt, ...comparison };
  }

  const line = destroyWorldline(target, options.lineId, options);
  if (type === '证道') {
    lowerRealmAuthority(target);
    line.presentEffect = 'realm_loss';
  }
  fact.state = 'erased';
  fact.erasedAt = now;
  fact.erasedBy = attacker.名号 || '';
  const multiplier = targetLevel === 20 ? 1.5 : 1;
  const debt = addCausalDebt(
    attacker,
    Math.ceil(CAUSAL_FACT_TYPES[type].weight * multiplier),
    `改写${type}既定事实`,
    now,
  );
  return { ok: true, outcome: 'fact_erased', fact, line, debt, ...comparison };
}

export function getTimelineWithdrawalAuthority(player) {
  const level = getRealmAuthorityLevel(player);
  if (level >= 22) return { level, mode: 'scope_select', limit: Number.POSITIVE_INFINITY, revealLines: true };
  if (level >= 21) return { level, mode: 'target_select', limit: Number.POSITIVE_INFINITY, revealLines: true };
  if (level >= 20) return { level, mode: 'random_one', limit: 1, revealLines: false };
  return { level, mode: 'none', limit: 0, revealLines: false };
}

export function getWithdrawalLimit(player) {
  return getTimelineWithdrawalAuthority(player).limit;
}

export function selectWithdrawableLines(player, lineIds, targetId, category, itemName, random = Math.random) {
  const state = ensureWorldlineState(player);
  const authority = getTimelineWithdrawalAuthority(player);
  if (authority.limit === 0) return [];
  const prefix = `${String(targetId)}:${String(category)}:${String(itemName)}:`;
  const available = [...new Set((lineIds || []).map(String))]
    .filter(lineId => !state.withdrawals[`${prefix}${lineId}`]);
  if (authority.mode !== 'random_one' || available.length <= 1) return available;
  const roll = Math.min(1 - Number.EPSILON, Math.max(0, Number(random()) || 0));
  return [available[Math.floor(roll * available.length)]];
}

export function isTimelineWithdrawalClaimed(player, targetId, category, itemName, lineId) {
  const state = ensureWorldlineState(player);
  return Boolean(state.withdrawals[
    `${String(targetId)}:${String(category)}:${String(itemName)}:${String(lineId)}`
  ]);
}

export function parseTimelineSelection(value, maxCount) {
  const max = Math.max(0, Math.trunc(number(maxCount)));
  const text = String(value || '').trim();
  if (!text || max === 0) return [];
  if (text === '全部') return Array.from({ length: max }, (_, index) => index);
  const tokens = text.split(/[\s,，、]+/).filter(Boolean);
  if (!tokens.length || tokens.some(token => !/^\d+$/.test(token))) return [];
  const indexes = [...new Set(tokens.map(token => Number(token) - 1))];
  return indexes.every(index => index >= 0 && index < max) ? indexes : [];
}

export function recordTimelineWithdrawal(player, {
  targetId,
  category,
  itemName,
  lineIds,
  amount = 0,
  playerId = '',
  now = Date.now(),
}) {
  return recordTimelineWithdrawals(player, {
    playerId,
    category,
    itemName,
    claims: [{ targetId, lineIds, amount }],
    now,
  });
}

export function recordTimelineWithdrawals(player, {
  playerId = '',
  category,
  itemName,
  claims = [],
  now = Date.now(),
}) {
  const state = ensureWorldlineState(player);
  const normalizedClaims = claims
    .map(claim => {
      const targetId = String(claim?.targetId || '');
      const fallbackLineIds = [...new Set((claim?.lineIds || []).map(String))];
      const fallbackAmount = Math.max(0, number(claim?.amount));
      const fallbackPerLine = fallbackLineIds.length ? fallbackAmount / fallbackLineIds.length : 0;
      const sourceLines = Array.isArray(claim?.lines)
        ? claim.lines
        : fallbackLineIds.map(lineId => ({ lineId, amount: fallbackPerLine }));
      const lines = [...new Map(sourceLines.map(line => [
        String(line?.lineId || ''),
        { lineId: String(line?.lineId || ''), amount: Math.max(0, number(line?.amount)) },
      ])).values()].filter(line => line.lineId);
      return { targetId, lines };
    })
    .filter(claim => claim.targetId && claim.lines.length);
  let lineCount = 0;
  let causalCost = 0;
  const ownId = String(playerId || player.qq || player.id || '');
  for (const claim of normalizedClaims) {
    const multiplier = claim.targetId === ownId ? 1 : 2;
    lineCount += claim.lines.length;
    for (const line of claim.lines) {
      const key = `${claim.targetId}:${String(category)}:${String(itemName)}:${line.lineId}`;
      state.withdrawals[key] = { at: now, amount: line.amount };
      causalCost += Math.max(10, Math.ceil(12 + Math.log10(Math.max(1, line.amount)) * 8)) * multiplier;
    }
  }
  return addCausalDebt(
    player,
    causalCost,
    `支取${normalizedClaims.length}名玩家${lineCount}条时间线中的${itemName}`,
    now,
  );
}

export function getWorldlineStatus(player) {
  synchronizeCausalFacts(player);
  const state = ensureWorldlineState(player);
  const level = getRealmAuthorityLevel(player);
  return {
    level,
    route: getRealmAuthorityPath(player),
    facts: state.facts,
    destroyedLines: state.destroyedLines,
    causalDebt: state.causalDebt,
    debtTier: getCausalDebtTier(state.causalDebt),
    debtReductionRate: getCausalDebtReductionRate(player),
    withdrawalLimit: getWithdrawalLimit(player),
    withdrawalBlockedUntil: state.withdrawalBlockedUntil,
    shapeSpiritDestroyed: isShapeSpiritDestroyed(player),
    noReturn: state.noReturn,
  };
}
