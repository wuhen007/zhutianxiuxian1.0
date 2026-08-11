import { getRealmAuthorityLevel } from './realmAuthority.js';

export const FORBIDDEN_DAY_MS = 24 * 60 * 60 * 1000;
export const FORBIDDEN_COOLDOWN_MS = FORBIDDEN_DAY_MS;
export const FORBIDDEN_PROTECTION_MS = 7 * FORBIDDEN_DAY_MS;
export const DISPOSITION_TTL_SECONDS = 10 * 60;
export const SOUL_BRAND_DURATION_MS = 3 * FORBIDDEN_DAY_MS;
export const SOUL_BREAK_COOLDOWN_SECONDS = 12 * 60 * 60;
export const REMAINS_DURATION_MS = 7 * FORBIDDEN_DAY_MS;
export const SOUL_DORMANCY_MS = 30 * 60 * 1000;
export const DAO_CRACK_DURATION_MS = 6 * 60 * 60 * 1000;
export const SUMMON_TTL_SECONDS = 6 * 60 * 60;

export const FORBIDDEN_DISPOSITIONS = Object.freeze({
  烙印: Object.freeze({ authority: 11, soulLevel: 2, karma: 40, demonic: 10 }),
  灭魂: Object.freeze({ authority: 14, soulLevel: 5, karma: 80, demonic: 20 }),
  夺果: Object.freeze({ authority: 15, soulLevel: 6, karma: 100, demonic: 30 }),
});

const SETTLEMENT_HISTORY_LIMIT = 20;

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function integer(value, fallback = 0) {
  return Math.trunc(number(value, fallback));
}

export function forbiddenCooldownKey(playerId) {
  return `xiuxian:forbidden:cooldown:${playerId}`;
}

export function forbiddenPendingKey(playerId) {
  return `xiuxian:forbidden:pending:${playerId}`;
}

export function forbiddenSettlementKey(settlementId) {
  return `xiuxian:forbidden:settlement:${settlementId}`;
}

export function forbiddenSummonKey(playerId) {
  return `xiuxian:forbidden:summon:${playerId}`;
}

export function forbiddenSummonClaimKey(summonId) {
  return `xiuxian:forbidden:summon-claim:${summonId}`;
}

export function forbiddenBreakKey(playerId) {
  return `xiuxian:forbidden:break:${playerId}`;
}

export function forbiddenAssistKey(playerId, dateKey) {
  return `xiuxian:forbidden:assist:${playerId}:${dateKey}`;
}

export function getChinaDateKey(now = Date.now()) {
  return new Date(number(now) + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function ensureForbiddenState(player, now = Date.now()) {
  if (!player || typeof player !== 'object') throw new TypeError('玩家数据无效');

  player.邪道 = object(player.邪道);
  player.邪道创伤 = object(player.邪道创伤);
  const evil = player.邪道;
  const injury = player.邪道创伤;

  evil.version = 1;
  evil.魂奴 ??= null;
  evil.人傀 ??= null;
  evil.待炼遗蜕 ??= null;
  evil.待炼道果 ??= null;
  evil.外来道果 ??= null;
  evil.道果杂质 = Math.max(0, integer(evil.道果杂质));
  evil.魂奴召唤日期 = String(evil.魂奴召唤日期 || '');
  evil.人傀出战日期 = String(evil.人傀出战日期 || '');
  evil.化杂结束至 = Math.max(0, number(evil.化杂结束至));
  evil.结算记录 = Array.isArray(evil.结算记录) ? evil.结算记录.slice(-SETTLEMENT_HISTORY_LIMIT) : [];

  injury.魂印 ??= null;
  injury.真灵蛰伏至 = Math.max(0, number(injury.真灵蛰伏至));
  injury.道果裂痕至 = Math.max(0, number(injury.道果裂痕至));
  injury.禁忌侵害保护至 = Math.max(0, number(injury.禁忌侵害保护至));
  injury.结算记录 = Array.isArray(injury.结算记录) ? injury.结算记录.slice(-SETTLEMENT_HISTORY_LIMIT) : [];

  if (evil.魂奴 && number(evil.魂奴.expiresAt) <= now) evil.魂奴 = null;
  if (evil.待炼遗蜕 && number(evil.待炼遗蜕.expiresAt) <= now) evil.待炼遗蜕 = null;
  if (injury.魂印 && number(injury.魂印.expiresAt) <= now) injury.魂印 = null;
  if (injury.道果裂痕至 > 0 && injury.道果裂痕至 <= now) injury.道果裂痕至 = 0;
  if (injury.禁忌侵害保护至 > 0 && injury.禁忌侵害保护至 <= now) injury.禁忌侵害保护至 = 0;

  if (injury.真灵蛰伏至 > 0 && injury.真灵蛰伏至 <= now) {
    const hpLimit = Math.max(1, integer(player.血量上限, 1));
    const soulLimit = Math.max(0, integer(player.元神上限));
    player.当前血量 = Math.min(hpLimit, Math.max(integer(player.当前血量), Math.floor(hpLimit * 0.3)));
    player.元神 = Math.min(soulLimit, Math.max(integer(player.元神), Math.floor(soulLimit * 0.7)));
    injury.真灵蛰伏至 = 0;
  }

  if (evil.化杂结束至 > 0 && evil.化杂结束至 <= now) {
    evil.道果杂质 = Math.max(0, evil.道果杂质 - 30);
    evil.化杂结束至 = 0;
  }

  return evil;
}

export function isForbiddenCultivator(player) {
  return number(player?.魔道值) >= 1000 || ['魔头', '天魔'].includes(player?.灵根?.type);
}

export function getForbiddenProtection(player, now = Date.now()) {
  ensureForbiddenState(player, now);
  const until = Math.max(
    number(player.邪道创伤.禁忌侵害保护至),
    number(player.天魔炼化保护至)
  );
  return { protected: until > now, until, waitMs: Math.max(0, until - now) };
}

export function protectForbiddenTarget(player, now = Date.now()) {
  ensureForbiddenState(player, now);
  const until = now + FORBIDDEN_PROTECTION_MS;
  player.邪道创伤.禁忌侵害保护至 = Math.max(
    number(player.邪道创伤.禁忌侵害保护至),
    until
  );
  player.天魔炼化保护至 = Math.max(number(player.天魔炼化保护至), until);
  return player.邪道创伤.禁忌侵害保护至;
}

export function getForbiddenTargetEligibility(attacker, target, now = Date.now()) {
  ensureForbiddenState(attacker, now);
  ensureForbiddenState(target, now);
  if (!isForbiddenCultivator(attacker)) return { ok: false, reason: '你尚未真正踏入邪道' };
  if (number(attacker.当前血量) <= 0) return { ok: false, reason: '你已身受重创，无法镇魂' };
  if (number(target.当前血量) <= 0) return { ok: false, reason: '目标真灵沉寂，无法再次镇魂' };

  const attackerAuthority = getRealmAuthorityLevel(attacker);
  const targetAuthority = getRealmAuthorityLevel(target);
  if (attackerAuthority < FORBIDDEN_DISPOSITIONS.烙印.authority) {
    return { ok: false, reason: '至少需要斩道王者或真一境权柄方可镇魂' };
  }
  if (integer(attacker.yuanshenlevel_id) < FORBIDDEN_DISPOSITIONS.烙印.soulLevel) {
    return { ok: false, reason: '至少需要王者或真神级元神方可镇魂' };
  }
  if (targetAuthority < attackerAuthority - 1) {
    return { ok: false, reason: '目标比你低两个以上权柄等级，受天道弱者保护' };
  }
  const protection = getForbiddenProtection(target, now);
  if (protection.protected) return { ok: false, reason: '目标仍受禁忌侵害保护', waitMs: protection.waitMs };
  return { ok: true, attackerAuthority, targetAuthority };
}

export function getDispositionEligibility(type, attacker, target, now = Date.now()) {
  const config = FORBIDDEN_DISPOSITIONS[type];
  if (!config) return { ok: false, reason: '未知处置' };
  ensureForbiddenState(attacker, now);
  ensureForbiddenState(target, now);
  const authority = getRealmAuthorityLevel(attacker);
  const soulLevel = integer(attacker.yuanshenlevel_id);
  if (authority < config.authority || soulLevel < config.soulLevel) {
    return { ok: false, reason: `${type}所需的境界或元神权柄不足` };
  }
  if (type === '烙印' && attacker.邪道.魂奴) return { ok: false, reason: '你已有尚未消散的魂奴' };
  if (type === '烙印' && target.邪道创伤.魂印) return { ok: false, reason: '目标已有魂印' };
  if (type === '灭魂' && attacker.邪道.待炼遗蜕) return { ok: false, reason: '你已有一具待炼遗蜕' };
  if (type === '夺果' && attacker.邪道.待炼道果) return { ok: false, reason: '你已有一枚待炼道果' };
  if (type === '夺果' && getRealmAuthorityLevel(target) < 14) return { ok: false, reason: '目标尚未凝成可剥取的高阶道果' };
  if (type === '夺果' && (!target.自身之道类型 || !target.自身之道名称)) {
    return { ok: false, reason: '目标尚未开创自身之道' };
  }
  return { ok: true, config };
}

export function getAvailableDispositions(attacker, target, now = Date.now()) {
  return Object.keys(FORBIDDEN_DISPOSITIONS).filter(type => getDispositionEligibility(type, attacker, target, now).ok);
}

export function createForbiddenSnapshot(player, playerId, now = Date.now()) {
  return {
    sourceId: String(playerId),
    sourceName: String(player?.名号 || playerId),
    realmAuthority: getRealmAuthorityLevel(player),
    soulLevel: Math.max(0, integer(player?.yuanshenlevel_id)),
    attack: Math.max(1, integer(player?.攻击, 1)),
    defense: Math.max(0, integer(player?.防御)),
    hp: Math.max(1, integer(player?.血量上限 || player?.当前血量, 1)),
    rootName: String(player?.灵根?.name || ''),
    rootType: String(player?.灵根?.type || ''),
    technique: String(player?.当前使用的功法 || player?.学习的功法?.[0] || ''),
    createdAt: now,
  };
}

function hasSettlement(records, settlementId) {
  return records.some(record => record?.id === settlementId);
}

function recordSettlement(records, settlementId, type, now) {
  if (hasSettlement(records, settlementId)) return;
  records.push({ id: settlementId, type, settledAt: now });
  records.splice(0, Math.max(0, records.length - SETTLEMENT_HISTORY_LIMIT));
}

export function applyForbiddenDisposition(type, attacker, target, options = {}) {
  const now = number(options.now, Date.now());
  const settlementId = String(options.settlementId || '');
  if (!settlementId) throw new TypeError('缺少镇魂结算ID');
  ensureForbiddenState(attacker, now);
  ensureForbiddenState(target, now);

  const attackerApplied = hasSettlement(attacker.邪道.结算记录, settlementId);
  const targetApplied = hasSettlement(target.邪道创伤.结算记录, settlementId);
  if (!attackerApplied && !targetApplied) {
    const eligibility = getDispositionEligibility(type, attacker, target, now);
    if (!eligibility.ok) return eligibility;
  }

  const config = FORBIDDEN_DISPOSITIONS[type];
  const snapshot = { ...object(options.snapshot || createForbiddenSnapshot(target, options.targetId, now)) };

  if (!attackerApplied) {
    if (type === '烙印') {
      attacker.邪道.魂奴 = {
        ...snapshot,
        settlementId,
        masterAuthority: getRealmAuthorityLevel(attacker),
        resentment: 0,
        expiresAt: now + SOUL_BRAND_DURATION_MS,
      };
    } else if (type === '灭魂') {
      attacker.邪道.待炼遗蜕 = {
        ...snapshot,
        settlementId,
        expiresAt: now + REMAINS_DURATION_MS,
      };
    } else if (type === '夺果') {
      attacker.邪道.待炼道果 = {
        sourceId: snapshot.sourceId,
        sourceName: snapshot.sourceName,
        authority: snapshot.realmAuthority,
        wayType: String(target.自身之道类型),
        wayName: String(target.自身之道名称),
        settlementId,
        obtainedAt: now,
      };
    }
    attacker.业力值 = Math.max(0, integer(attacker.业力值)) + config.karma;
    attacker.魔道值 = Math.max(0, integer(attacker.魔道值)) + config.demonic;
    recordSettlement(attacker.邪道.结算记录, settlementId, type, now);
  }

  if (!targetApplied) {
    if (type === '烙印') {
      target.邪道创伤.魂印 = {
        settlementId,
        masterId: String(options.attackerId || attacker.id || ''),
        masterName: String(attacker.名号 || options.attackerId || ''),
        masterAuthority: getRealmAuthorityLevel(attacker),
        masterSoulLevel: Math.max(0, integer(attacker.yuanshenlevel_id)),
        resentment: 0,
        failedAttempts: 0,
        expiresAt: now + SOUL_BRAND_DURATION_MS,
      };
    } else if (type === '灭魂') {
      target.当前血量 = 0;
      target.道心值 = Math.max(1, integer(target.道心值, 100) - 10);
      target.邪道创伤.真灵蛰伏至 = now + SOUL_DORMANCY_MS;
    } else if (type === '夺果') {
      target.邪道创伤.道果裂痕至 = now + DAO_CRACK_DURATION_MS;
    }
    protectForbiddenTarget(target, now);
    recordSettlement(target.邪道创伤.结算记录, settlementId, type, now);
  }

  return {
    ok: true,
    type,
    config,
    attackerApplied: !attackerApplied,
    targetApplied: !targetApplied,
    idempotent: attackerApplied && targetApplied,
  };
}

export function calculateSoulBreakChance(target, brand) {
  const soulDiff = integer(target?.yuanshenlevel_id) - integer(brand?.masterSoulLevel);
  const failed = Math.max(0, integer(brand?.failedAttempts));
  return Math.min(0.9, Math.max(0.1, 0.35 + soulDiff * 0.08 + failed * 0.15));
}

export function addSoulBrandResentment(brand, amount = 35) {
  brand.failedAttempts = Math.max(0, integer(brand.failedAttempts)) + 1;
  brand.resentment = Math.max(0, integer(brand.resentment)) + Math.max(0, integer(amount));
  return brand.resentment >= 100;
}

export function breakSoulBrand(master, target, options = {}) {
  ensureForbiddenState(master, options.now);
  ensureForbiddenState(target, options.now);
  const brand = target.邪道创伤.魂印;
  if (!brand) return false;
  if (master.邪道.魂奴?.sourceId === String(options.targetId || target.id || '')) {
    master.邪道.魂奴 = null;
  }
  target.邪道创伤.魂印 = null;
  if (options.backlash !== false) {
    master.元神 = Math.max(1, Math.floor(Math.max(1, number(master.元神, 1)) * 0.8));
  }
  return true;
}

export function craftHumanPuppet(player, now = Date.now()) {
  ensureForbiddenState(player, now);
  const remains = player.邪道.待炼遗蜕;
  if (!remains) return { ok: false, reason: '你没有可供炼制的遗蜕' };
  if (player.邪道.人傀) return { ok: false, reason: '你已经持有一尊人傀' };
  player.邪道.人傀 = {
    ...remains,
    attack: Math.max(1, Math.floor(number(remains.attack, 1) * 0.3)),
    defense: Math.max(0, Math.floor(number(remains.defense) * 0.3)),
    hp: Math.max(1, Math.floor(number(remains.hp, 1) * 0.3)),
    durability: 100,
    craftedAt: now,
  };
  player.邪道.待炼遗蜕 = null;
  return { ok: true, puppet: player.邪道.人傀 };
}

export function repairHumanPuppet(player, amount = 40, now = Date.now()) {
  ensureForbiddenState(player, now);
  if (!player.邪道.人傀) return { ok: false, reason: '你尚未炼制人傀' };
  const before = Math.min(100, Math.max(0, integer(player.邪道.人傀.durability)));
  if (before >= 100) return { ok: false, reason: '人傀耐久已满' };
  player.邪道.人傀.durability = Math.min(100, before + Math.max(0, integer(amount)));
  return { ok: true, before, current: player.邪道.人傀.durability };
}

export function refineStolenDaoFruit(player, now = Date.now()) {
  ensureForbiddenState(player, now);
  if (!player.邪道.待炼道果) return { ok: false, reason: '你没有待炼道果' };
  if (player.邪道.外来道果) return { ok: false, reason: '外来道果槽已有道果，请先熔去' };
  if (player.邪道.道果杂质 >= 60) return { ok: false, reason: '道果杂质过重，无法继续炼化' };
  player.邪道.外来道果 = {
    ...player.邪道.待炼道果,
    bonus: 0.03,
    refinedAt: now,
  };
  player.邪道.待炼道果 = null;
  player.邪道.道果杂质 += 15;
  return { ok: true, fruit: player.邪道.外来道果, impurity: player.邪道.道果杂质 };
}

export function meltStolenDaoFruit(player, now = Date.now()) {
  ensureForbiddenState(player, now);
  if (!player.邪道.外来道果) return { ok: false, reason: '外来道果槽为空' };
  player.邪道.外来道果 = null;
  player.邪道.道果杂质 = Math.max(0, player.邪道.道果杂质 - 10);
  return { ok: true, impurity: player.邪道.道果杂质 };
}

export function applyForbiddenBattleModifiers(player, now = Date.now()) {
  ensureForbiddenState(player, now);
  if (player._forbiddenSoulModifiersApplied) return [];
  const messages = [];
  let multiplier = 1;
  if (player.邪道.外来道果) {
    multiplier *= 1 + number(player.邪道.外来道果.bonus, 0.03);
    messages.push(`【外来道果】${player.邪道.外来道果.wayName || '无名道果'}令全属性提升3%`);
  }
  if (player.邪道创伤.道果裂痕至 > now) {
    multiplier *= 0.95;
    messages.push('【道果裂痕】攻防血降低5%');
  }
  if (multiplier !== 1) {
    for (const field of ['攻击', '防御', '血量上限', '当前血量']) {
      if (Number.isFinite(Number(player[field]))) player[field] = Math.max(field.includes('血量') ? 1 : 0, Math.floor(player[field] * multiplier));
    }
  }
  player._forbiddenSoulModifiersApplied = true;
  return messages;
}

export function getForbiddenCultivationMultiplier(player, now = Date.now()) {
  ensureForbiddenState(player, now);
  return player.邪道创伤.道果裂痕至 > now ? 0.9 : 1;
}

export function buildForbiddenCompanion(player, type, now = Date.now()) {
  ensureForbiddenState(player, now);
  const source = type === '人傀' ? player.邪道.人傀 : player.邪道.魂奴;
  if (!source) return null;
  if (type === '人傀' && integer(source.durability) <= 0) return null;
  const ratio = type === '人傀' ? 1 : 0.25;
  const attack = Math.max(1, Math.min(
    Math.floor(number(source.attack, 1) * ratio),
    Math.floor(Math.max(1, number(player.攻击, 1)) * 0.35)
  ));
  const defense = Math.max(0, Math.min(
    Math.floor(number(source.defense) * ratio),
    Math.floor(Math.max(0, number(player.防御)) * 0.35)
  ));
  const hp = Math.max(1, Math.min(
    Math.floor(number(source.hp, 1) * ratio),
    Math.floor(Math.max(1, number(player.血量上限 || player.当前血量, 1)) * 0.35)
  ));
  return {
    名号: `${source.sourceName || '无名修士'}·${type}`,
    攻击: attack,
    防御: defense,
    血量上限: hp,
    当前血量: hp,
    速度: Math.max(1, Math.floor(number(player.速度, 100) * 0.5)),
    法球倍率: 1,
    灵根: { name: type, type: '傀儡', 法球倍率: 1, 攻击: 0, 防御: 0, 生命: 0 },
    学习的功法: [],
    当前使用的功法: String(source.technique || ''),
    分身: [],
    仙宠: null,
    当前先天至宝: '',
    先天权柄: {},
    不可复活: true,
    _forbiddenCompanion: true,
  };
}
