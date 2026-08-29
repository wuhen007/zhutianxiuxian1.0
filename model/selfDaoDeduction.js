import { getRealmAuthorityLevel, getRealmAuthorityPath } from './realmAuthority.js';
import { synchronizeCausalFacts } from './worldlineAuthority.js';
import { tryEternalFateRewrite } from './innateTreasure.js';

export const SELF_DAO_REQUIRED_ATTEMPTS = 10;
export const SELF_DAO_REALM_AWAKENING = 5;
export const SELF_DAO_LATE_COST_MULTIPLIER = 20;
export const SELF_DAO_RECOVERY_MS = 320 * 60 * 1000;
export const SELF_DAO_COSTS = Object.freeze({
  era: 50,
  mind: 50,
  spirit: 10_000_000_000,
  potential: 3_000,
  lifespan: 3_000_000_000,
  cultivation: 3_000_000_000_000,
  blood: 3_000_000_000_000,
});
export const SELF_DAO_PLANE_TARGETS = Object.freeze([
  '仙域', '九天十地', '遮天位面', '下界八域', '小阴间',
  '大阴间', '阳间', '仙界', '凡间', '界海',
]);

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function lifespanField(player) {
  return number(player?.压制寿元) > 0 ? '压制寿元' : '寿元';
}

export function ensureSelfDaoDeduction(player) {
  const old = player.己道推演 && typeof player.己道推演 === 'object' ? player.己道推演 : {};
  old.attempts = Math.max(0, Math.min(SELF_DAO_REQUIRED_ATTEMPTS, Math.trunc(number(old.attempts))));
  old.realms = Array.isArray(old.realms) ? old.realms.slice(0, 6) : [];
  old.pathAwakened = old.attempts >= SELF_DAO_REALM_AWAKENING || Boolean(old.pathAwakened);
  old.battlePending = Boolean(old.battlePending);
  old.completed = Boolean(old.completed);
  player.己道推演 = old;
  return old;
}

export function getSelfDaoDeductionCosts(player) {
  const attempts = Math.max(0, Math.trunc(number(player?.己道推演?.attempts)));
  if (attempts < SELF_DAO_REALM_AWAKENING) return SELF_DAO_COSTS;
  return Object.fromEntries(Object.entries(SELF_DAO_COSTS).map(([key, cost]) => [
    key,
    key === 'mind' ? cost : cost * SELF_DAO_LATE_COST_MULTIPLIER,
  ]));
}

export function getSelfDaoDeductionGate(player) {
  const state = ensureSelfDaoDeduction(player);
  if (getRealmAuthorityLevel(player) >= 21 || state.completed) return { ok: false, reason: 'completed', state };
  if (state.recovery?.status === 'recovering') return { ok: false, reason: 'recovering', state };
  if (state.battlePending) return { ok: true, reason: 'battle', state };
  if (getRealmAuthorityLevel(player) !== 20) return { ok: false, reason: 'realm', state };
  if (!player?.已创自身之道) return { ok: false, reason: 'own_way', state };
  if (!player?.自创修炼体系?.name) return { ok: false, reason: 'system', state };
  if (number(player?.自身之道阶段) < 6 || number(player?.修炼次数) < 300) {
    return { ok: false, reason: 'own_way_cap', state };
  }
  if (state.attempts >= SELF_DAO_REALM_AWAKENING && state.realms.length !== 6) {
    return { ok: false, reason: 'realms', state };
  }

  const resources = {
    era: number(player.纪元积累),
    mind: number(player.心神),
    spirit: number(player.元神),
    potential: number(player.仙道潜力),
    lifespan: number(player[lifespanField(player)]),
    cultivation: number(player.修为),
    blood: number(player.血气),
  };
  const costs = getSelfDaoDeductionCosts(player);
  const missing = Object.entries(costs)
    .filter(([key, cost]) => resources[key] < cost)
    .map(([key, cost]) => ({ key, have: resources[key], need: cost }));
  return missing.length ? { ok: false, reason: 'resources', missing, resources, costs, state }
    : { ok: true, reason: 'deduce', resources, costs, state };
}

export function consumeSelfDaoDeduction(player, now = Date.now()) {
  const gate = getSelfDaoDeductionGate(player);
  if (!gate.ok || gate.reason !== 'deduce') return gate;

  const costs = gate.costs;
  player.纪元积累 = number(player.纪元积累) - costs.era;
  player.心神 = number(player.心神) - costs.mind;
  player.元神 = number(player.元神) - costs.spirit;
  player.仙道潜力 = number(player.仙道潜力) - costs.potential;
  player.修为 = number(player.修为) - costs.cultivation;
  player.血气 = number(player.血气) - costs.blood;
  const lifeField = lifespanField(player);
  player[lifeField] = number(player[lifeField]) - costs.lifespan;
  if (lifeField === '压制寿元') player.寿元 = Math.min(number(player.寿元), player.压制寿元, 9999);

  const state = gate.state;
  state.attempts += 1;
  state.lastDeductionAt = now;
  state.pathAwakened = state.attempts >= SELF_DAO_REALM_AWAKENING;
  if (state.attempts === SELF_DAO_REALM_AWAKENING) state.awakenedAt = now;
  if (state.attempts === SELF_DAO_REQUIRED_ATTEMPTS) {
    state.divineEmbryo = '已结出';
    state.battlePending = true;
    state.terrorTriggered = false;
  }
  return { ok: true, reason: 'deduced', state, costs, attempt: state.attempts };
}

export function setCultivationSystemRealms(player, names, now = Date.now()) {
  const state = ensureSelfDaoDeduction(player);
  if (state.attempts < SELF_DAO_REALM_AWAKENING) return { ok: false, reason: 'locked', state };
  if (!player?.自创修炼体系?.name) return { ok: false, reason: 'system', state };
  const realms = Array.isArray(names) ? names.map(name => String(name || '').trim()).filter(Boolean) : [];
  if (realms.length !== 6) return { ok: false, reason: 'count', state };
  if (new Set(realms).size !== realms.length) return { ok: false, reason: 'duplicate', state };
  if (realms.some(name => name.length > 8 || /[#\r\n]/.test(name))) return { ok: false, reason: 'name', state };

  state.realms = realms;
  state.realmsNamedAt = now;
  player.自创修炼体系.realms = [...realms];
  player.自创修炼体系.stage = '六境雏形';
  return { ok: true, state, realms };
}

export function promoteSelfDaoToImmortalEmperor(player, now = Date.now()) {
  const state = ensureSelfDaoDeduction(player);
  const route = player?.自创修炼体系?.route || getRealmAuthorityPath(player);
  if (route === 'xiangu') player.xiangulevel_id = Math.max(22, number(player.xiangulevel_id));
  else if (route === 'huafen') player.huafenlevel_id = Math.max(22, number(player.huafenlevel_id));
  else player.mijinglevel_id = Math.max(21, number(player.mijinglevel_id));

  player.自身之道阶段 = Math.max(7, number(player.自身之道阶段));
  player.修炼次数 = Math.max(301, number(player.修炼次数));
  player.自身之道境界 = '仙帝·道源唯一';
  player.自身之道根基 = '道源唯一';
  player.境界称号 = '路尽级仙帝';
  player.当前血量 = Math.max(1, number(player.血量上限));
  player.修仙状态 = '空闲';
  player.道果状态 = '神胎圆满·道源唯一';
  if (player.自创修炼体系) {
    player.自创修炼体系.stage = '六境圆满·神胎路尽';
    player.自创修炼体系.realms = [...state.realms];
    player.自创修炼体系.emperorAt = now;
  }
  state.completed = true;
  state.battlePending = false;
  state.completedAt = now;
  state.recovery = null;
  synchronizeCausalFacts(player, now);
  return { ok: true, route, state };
}

export function startCorpseEmperorRecovery(player, now = Date.now()) {
  const state = ensureSelfDaoDeduction(player);
  if (tryEternalFateRewrite(player, now)) {
    state.battlePending = true;
    state.recovery = null;
    return { rewritten: true, startAt: now, endAt: now };
  }
  state.battlePending = false;
  state.recovery = {
    status: 'recovering',
    startAt: now,
    endAt: now + SELF_DAO_RECOVERY_MS,
  };
  player.身灭道消前状态 = player.修仙状态 || '空闲';
  player.修仙状态 = '身灭道消';
  player.道果状态 = '身灭道消·真血散落';
  player.当前血量 = 0;
  return state.recovery;
}

export function completeCorpseEmperorRecovery(player, now = Date.now()) {
  const state = ensureSelfDaoDeduction(player);
  if (state.recovery?.status !== 'recovering') return { ok: false, reason: 'idle', state };
  if (number(state.recovery.endAt) > now) return { ok: false, reason: 'waiting', state };
  delete player.身灭道消前状态;
  return promoteSelfDaoToImmortalEmperor(player, now);
}

export function getCorpseEmperorRecoveryState(player, now = Date.now()) {
  const recovery = ensureSelfDaoDeduction(player).recovery;
  if (recovery?.status !== 'recovering') return { active: false, remainingMs: 0 };
  return { active: number(recovery.endAt) > now, remainingMs: Math.max(0, number(recovery.endAt) - now), recovery };
}
