import { getRealmAuthorityLevel, getRealmAuthorityPath, hasReachedImmortalEmperor, rememberImmortalEmperorHistory } from './realmAuthority.js';
import { synchronizeCausalFacts } from './worldlineAuthority.js';
import { tryEternalFateRewrite } from './innateTreasure.js';
import { hasSuiyunCultivationLifespanImmunity } from './suiyun.js';

export { resetSelfDaoAfterImmortalEmperorFall } from './realmAuthority.js';

export const SELF_DAO_REQUIRED_ATTEMPTS = 20;
export const SACRIFICE_DAO_REQUIRED_ATTEMPTS = 10;
export const SACRIFICE_DAO_COST_MULTIPLIER = 10;
export const SELF_DAO_REALM_AWAKENING = 5;
export const SELF_DAO_QUASI_EMPEROR_PEAK_ATTEMPT = 10;
export const SELF_DAO_DIVINE_EMBRYO_ATTEMPT = 15;
export const SELF_DAO_HALF_IMMORTAL_EMPEROR_ATTEMPT = 20;
export const SELF_DAO_PEAK_DAMAGE_REDUCTION = 0.3;
export const SELF_DAO_LATE_COST_MULTIPLIER = 20;
export const SELF_DAO_RECOVERY_MS = 320 * 60 * 1000;
export const ERA_ACCUMULATION_CAPS = Object.freeze({
  default: 100,
  quasiEmperorPeak: 200,
  divineEmbryo: 300,
  halfImmortalEmperor: 500,
  immortalEmperor: 1000,
});
export const SELF_DAO_COSTS = Object.freeze({
  era: 50,
  mind: 50,
  spirit: 10_000_000_000,
  potential: 3_000,
  lifespan: 3_000_000_000,
  cultivation: 3_000_000_000_000,
  blood: 3_000_000_000_000,
});
export const SACRIFICE_DAO_COSTS = Object.freeze(Object.fromEntries(
  Object.entries(SELF_DAO_COSTS).map(([key, cost]) => [key, cost * SACRIFICE_DAO_COST_MULTIPLIER]),
));
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

export function getEraAccumulationCap(player) {
  const state = player?.己道推演 && typeof player.己道推演 === 'object' ? player.己道推演 : {};
  const attempts = Math.max(0, Math.trunc(number(state.attempts)));
  if (getRealmAuthorityLevel(player) >= 21 || state.completed) return ERA_ACCUMULATION_CAPS.immortalEmperor;
  if (state.halfImmortalEmperor || attempts >= SELF_DAO_HALF_IMMORTAL_EMPEROR_ATTEMPT) return ERA_ACCUMULATION_CAPS.halfImmortalEmperor;
  if (state.divineEmbryo === '已结出' || attempts >= SELF_DAO_DIVINE_EMBRYO_ATTEMPT) return ERA_ACCUMULATION_CAPS.divineEmbryo;
  if (state.quasiEmperorPeak || attempts >= SELF_DAO_QUASI_EMPEROR_PEAK_ATTEMPT) return ERA_ACCUMULATION_CAPS.quasiEmperorPeak;
  return ERA_ACCUMULATION_CAPS.default;
}

export function addCappedEraAccumulation(player, amount) {
  const before = Math.max(0, number(player?.纪元积累));
  const requested = Math.max(0, Math.trunc(number(amount)));
  const cap = getEraAccumulationCap(player);
  const gained = Math.min(requested, Math.max(0, cap - before));
  player.纪元积累 = before + gained;
  return { before, gained, cap, after: player.纪元积累 };
}

const SELF_DAO_BATTLE_BONUS_FIELDS = Object.freeze([
  '攻击', '防御', '血量上限', '速度', '_speed',
  '元神伤害加成', '神通伤害加成', '近战伤害加成', '全伤害类型加成',
  '暴击率', '暴击伤害', '闪避率', '穿透', '减伤', '减伤比例',
]);

function unlockSelfDaoMilestones(player, state, now = Date.now()) {
  if (state.attempts >= SELF_DAO_QUASI_EMPEROR_PEAK_ATTEMPT) {
    state.quasiEmperorPeak = true;
    state.quasiEmperorPeakAt ||= now;
  }
  if (state.attempts >= SELF_DAO_DIVINE_EMBRYO_ATTEMPT) {
    state.divineEmbryo = '已结出';
    state.divineEmbryoAt ||= now;
  }
  if (state.attempts >= SELF_DAO_HALF_IMMORTAL_EMPEROR_ATTEMPT) {
    state.halfImmortalEmperor = true;
    state.halfImmortalEmperorAt ||= now;
  }

  if (state.completed || state.recovery?.status === 'recovering') return;
  if (state.halfImmortalEmperor) {
    player.自身之道境界 = '半步仙帝·神胎圆满';
    player.道果状态 = '半步仙帝·可破万法加持';
    if (player.自创修炼体系) player.自创修炼体系.stage = '六境圆满·半步仙帝';
  } else if (state.divineEmbryo === '已结出') {
    player.自身之道境界 = '绝顶道祖·神胎初成';
    player.道果状态 = '神胎初成·万劫不灭';
    if (player.自创修炼体系) player.自创修炼体系.stage = '六境圆满·神胎初成';
  } else if (state.quasiEmperorPeak) {
    player.自身之道境界 = '准仙帝极巅·绝顶道祖';
    player.道果状态 = '绝顶道祖·己道极巅';
    if (player.自创修炼体系) player.自创修炼体系.stage = '六境圆满·准仙帝极巅';
  }
}

export function ensureSelfDaoDeduction(player) {
  const old = player.己道推演 && typeof player.己道推演 === 'object' ? player.己道推演 : {};
  old.attempts = Math.max(0, Math.min(SELF_DAO_REQUIRED_ATTEMPTS, Math.trunc(number(old.attempts))));
  old.realms = Array.isArray(old.realms) ? old.realms.slice(0, 6) : [];
  old.pathAwakened = old.attempts >= SELF_DAO_REALM_AWAKENING || Boolean(old.pathAwakened);
  old.battlePending = Boolean(old.battlePending);
  old.completed = Boolean(old.completed);
  old.sacrificeAttempts = getSacrificeDaoAttempts(player);
  if (number(old.progressionVersion) < 2) {
    if (old.completed || old.recovery?.status === 'recovering') {
      old.attempts = SELF_DAO_REQUIRED_ATTEMPTS;
    } else if (old.attempts >= 10) {
      old.battlePending = false;
      delete old.divineEmbryo;
      delete old.divineEmbryoAt;
    }
    old.progressionVersion = 2;
  }
  unlockSelfDaoMilestones(player, old);
  // 旧版存档可能只记录了层数，达到第二十层时仍应进入尸骸仙帝战。
  if (!old.completed && old.recovery?.status !== 'recovering' && old.attempts >= SELF_DAO_REQUIRED_ATTEMPTS) {
    old.battlePending = true;
  }
  player.己道推演 = old;
  return old;
}

export function getSacrificeDaoAttempts(player) {
  return Math.max(0, Math.min(SACRIFICE_DAO_REQUIRED_ATTEMPTS,
    Math.trunc(number(player?.己道推演?.sacrificeAttempts))));
}

export function getSelfDaoDeductionCosts(player) {
  const attempts = Math.max(0, Math.trunc(number(player?.己道推演?.attempts)));
  const costs = getRealmAuthorityLevel(player) >= 21 ? SACRIFICE_DAO_COSTS
    : attempts < SELF_DAO_REALM_AWAKENING ? SELF_DAO_COSTS
    : Object.fromEntries(Object.entries(SELF_DAO_COSTS).map(([key, cost]) => [
    key,
    key === 'mind' ? cost
      : key === 'era' ? (attempts < 10 ? 50 : attempts < 15 ? 70 : 80)
        : cost * SELF_DAO_LATE_COST_MULTIPLIER,
  ]));
  return hasSuiyunCultivationLifespanImmunity(player) ? { ...costs, lifespan: 0 } : costs;
}

export function getSelfDaoDeductionGate(player) {
  const state = ensureSelfDaoDeduction(player);
  const authority = getRealmAuthorityLevel(player);
  const sacrifice = authority === 21;
  if (authority > 21 || (!sacrifice && state.completed)) return { ok: false, reason: 'completed', state };
  if (state.recovery?.status === 'recovering') return { ok: false, reason: 'recovering', state };
  if (sacrifice) {
    if (state.sacrificeAttempts >= SACRIFICE_DAO_REQUIRED_ATTEMPTS) return { ok: false, reason: 'sacrifice_completed', state };
    if (number(player?.自身之道阶段) < 7 || number(player?.修炼次数) < 400) {
      return { ok: false, reason: 'sacrifice_own_way_cap', state };
    }
  } else {
    if (state.battlePending) return { ok: true, reason: 'battle', state };
    if (authority !== 20) return { ok: false, reason: 'realm', state };
    if (!player?.已创自身之道) return { ok: false, reason: 'own_way', state };
    if (!player?.自创修炼体系?.name) return { ok: false, reason: 'system', state };
    if (number(player?.自身之道阶段) < 6 || number(player?.修炼次数) < 300) {
      return { ok: false, reason: 'own_way_cap', state };
    }
    if (state.attempts >= SELF_DAO_REALM_AWAKENING && state.realms.length !== 6) {
      return { ok: false, reason: 'realms', state };
    }
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
    : { ok: true, reason: 'deduce', resources, costs, state, sacrifice };
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
  if (costs.lifespan > 0) {
    const lifeField = lifespanField(player);
    player[lifeField] = number(player[lifeField]) - costs.lifespan;
    if (lifeField === '压制寿元') player.寿元 = Math.min(number(player.寿元), player.压制寿元, 9999);
  }

  const state = gate.state;
  if (gate.sacrifice) {
    state.sacrificeAttempts += 1;
    state.lastSacrificeDeductionAt = now;
    return { ok: true, reason: 'sacrifice_deduced', state, costs, attempt: state.sacrificeAttempts };
  }
  state.attempts += 1;
  state.lastDeductionAt = now;
  state.pathAwakened = state.attempts >= SELF_DAO_REALM_AWAKENING;
  if (state.attempts === SELF_DAO_REALM_AWAKENING) state.awakenedAt = now;
  unlockSelfDaoMilestones(player, state, now);
  if (state.attempts === SELF_DAO_REQUIRED_ATTEMPTS) {
    state.battlePending = true;
    if (state.terrorTriggered == null) state.terrorTriggered = false;
  }
  return { ok: true, reason: 'deduced', state, costs, attempt: state.attempts };
}

export function resetSelfDaoBattleState(unit) {
  if (!unit || typeof unit !== 'object') return unit;
  delete unit._己道极巅减伤已应用;
  delete unit._己道神胎复活可用;
  delete unit._己道神胎复活已用;
  delete unit._半步仙帝加成压制;
  return unit;
}

export function enforceSelfDaoBuffSuppression(unit) {
  const seal = unit?._半步仙帝加成压制;
  if (!seal) return false;
  for (const field of SELF_DAO_BATTLE_BONUS_FIELDS) {
    const ceiling = number(seal[field]);
    if (ceiling > 0 && number(unit[field]) > ceiling) unit[field] = ceiling;
  }
  if (number(unit.当前血量) > number(unit.血量上限)) unit.当前血量 = number(unit.血量上限);
  for (const field of ['护盾值', '_护盾值', '_持续减伤回合', '_持续减伤比例', '_免控回合']) {
    if (number(unit[field]) > 0) unit[field] = 0;
  }
  return true;
}

export function applySelfDaoBattleOpening(holder, opponents = []) {
  if (!holder || typeof holder !== 'object') return [];
  const state = ensureSelfDaoDeduction(holder);
  const messages = [];
  if (state.quasiEmperorPeak && !holder._己道极巅减伤已应用) {
    holder._己道极巅减伤已应用 = true;
    holder.神通伤害减免 = Math.min(0.9, number(holder.神通伤害减免) + SELF_DAO_PEAK_DAMAGE_REDUCTION);
    holder.近战伤害减免 = Math.min(0.9, number(holder.近战伤害减免) + SELF_DAO_PEAK_DAMAGE_REDUCTION);
    messages.push(`【绝顶道祖】${holder.名号 || '修士'}己道护体，获得30%神通与近战伤害减免。`);
  }
  if (state.divineEmbryo === '已结出') holder._己道神胎复活可用 = true;
  if (!state.halfImmortalEmperor) return messages;

  const targets = (Array.isArray(opponents) ? opponents : [opponents]).filter(Boolean);
  for (const opponent of targets) {
    opponent._半步仙帝加成压制 = Object.fromEntries(
      SELF_DAO_BATTLE_BONUS_FIELDS.map(field => [field, number(opponent[field])])
    );
    enforceSelfDaoBuffSuppression(opponent);
  }
  if (targets.length) messages.push(`【半步仙帝·破法】${holder.名号 || '修士'}照见加持根源，破解敌方本场属性、护盾与减伤增益。`);
  return messages;
}

export function trySelfDaoDivineEmbryoRevival(unit) {
  if (!unit?._己道神胎复活可用 || unit._己道神胎复活已用 || number(unit.当前血量) > 0) {
    return { revived: false };
  }
  unit._己道神胎复活已用 = true;
  unit.当前血量 = Math.max(1, number(unit.血量上限));
  unit.dongjie = false;
  for (const field of [
    'fumianhuihe', 'fumian_damage', '_fumianhuihe', '_fumian_damage',
    '_东皇冻结回合', '_技能速度削弱回合', '_技能速度削弱比例',
  ]) unit[field] = 0;
  unit.fumian_type = null;
  unit._fumian_type = null;
  return {
    revived: true,
    message: `【己道神胎·再生】${unit.名号 || '修士'}以神胎重塑肉身与元神，满血复生并解除控制；本场额外复生次数已用。`,
  };
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

export function promoteSelfDaoToImmortalEmperor(player, now = Date.now(), route = player?.自创修炼体系?.route || getRealmAuthorityPath(player)) {
  const state = ensureSelfDaoDeduction(player);
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
  rememberImmortalEmperorHistory(player);
  synchronizeCausalFacts(player, now);
  return { ok: true, route, state };
}

export function canReproveImmortalEmperor(player) {
  const route = getRealmAuthorityPath(player);
  const field = route === 'xiangu' ? 'xiangulevel_id' : route === 'huafen' ? 'huafenlevel_id' : 'mijinglevel_id';
  return getRealmAuthorityLevel(player) === 20
    && number(player?.[field]) === (route === 'mijing' ? 20 : 21)
    && hasReachedImmortalEmperor(player);
}

export function reproveImmortalEmperor(player, now = Date.now()) {
  if (!canReproveImmortalEmperor(player)) return { ok: false, reason: 'ineligible' };
  if (['形神俱灭', '身灭道消'].includes(player.修仙状态)
    || player.始祖永祭?.status === 'bubble' || !(number(player.当前血量) > 0)) {
    return { ok: false, reason: 'unavailable' };
  }
  const result = promoteSelfDaoToImmortalEmperor(player, now, getRealmAuthorityPath(player));
  player.修为 = 0;
  player.血气 = 0;
  result.state.reprovedAt = now;
  return result;
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
