import { getRealmAuthorityLevel } from './realmAuthority.js';

export const WANHUA_BANNER_NAME = '【万化】万灵魔幡';
export const WANHUA_TIANMO_PHYSIQUE = '无相·万化天魔体';
export const WANHUA_SOUL_CAP = 9999;
export const WANHUA_MAIN_SOUL_CAP = 10;
export const WANHUA_SOUL_STAT_BONUS = 20_000_000;
export const WANHUA_ACTIVE_CHANCE = 0.18;
export const WANHUA_ACTION_BAR_REDUCTION = 750;
export const WANHUA_MAIN_SOUL_SUMMON_CHANCE = 0.5;

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(value, fallback = 0) {
  return Math.trunc(number(value, fallback));
}

function clampInteger(value, min, max) {
  return Math.min(max, Math.max(min, integer(value)));
}

function normalizeMainSoul(soul) {
  if (!soul || typeof soul !== 'object' || Array.isArray(soul)) return null;
  return {
    sourceId: String(soul.sourceId || ''),
    sourceName: String(soul.sourceName || '无名天骄'),
    realmAuthority: Math.max(0, integer(soul.realmAuthority)),
    attack: Math.max(1, integer(soul.attack, 1)),
    defense: Math.max(0, integer(soul.defense)),
    hp: Math.max(1, integer(soul.hp, 1)),
    speed: Math.max(1, integer(soul.speed, 100)),
    spellMultiplier: Math.max(0, number(soul.spellMultiplier, 1)),
    soul: Math.max(0, integer(soul.soul)),
    soulLimit: Math.max(0, integer(soul.soulLimit)),
    rootName: String(soul.rootName || ''),
    rootType: String(soul.rootType || ''),
    technique: String(soul.technique || ''),
    capturedAt: Math.max(0, number(soul.capturedAt)),
  };
}

export function ensureWanhuaBannerState(player) {
  if (!player || typeof player !== 'object') throw new TypeError('玩家数据无效');
  if (!player.万灵魔幡 || typeof player.万灵魔幡 !== 'object' || Array.isArray(player.万灵魔幡)) {
    player.万灵魔幡 = {};
  }

  const state = player.万灵魔幡;
  state.version = 1;
  state.生魂 = clampInteger(state.生魂, 0, WANHUA_SOUL_CAP);
  state.累计炼魂 = Math.max(state.生魂, integer(state.累计炼魂));
  state.主魂 = (Array.isArray(state.主魂) ? state.主魂 : [])
    .map(normalizeMainSoul)
    .filter(Boolean)
    .slice(-WANHUA_MAIN_SOUL_CAP);
  state.上次炼魂 = Math.max(0, number(state.上次炼魂));
  return state;
}

export function isWanhuaBannerEquipped(equipment) {
  return equipment?.法宝?.name === WANHUA_BANNER_NAME;
}

export function isWanhuaBannerUser(player, equipment) {
  return player?.灵根?.name === WANHUA_TIANMO_PHYSIQUE && isWanhuaBannerEquipped(equipment);
}

export function isWanhuaMainSoulTarget(target) {
  if (!target || typeof target !== 'object') return false;
  if (
    target.天骄 === true ||
    target.isTianjiao === true ||
    number(target.天骄等级) > 0 ||
    ['天骄', '至尊天骄'].includes(target.类型)
  ) return true;

  const name = String(target.名号 || target.name || '');
  return /天骄|至尊|准帝|大帝|仙帝|始祖/.test(name) || getRealmAuthorityLevel(target) >= 18;
}

export function createWanhuaMainSoulSnapshot(target, now = Date.now()) {
  return normalizeMainSoul({
    sourceId: target?.id,
    sourceName: target?.名号 || target?.name,
    realmAuthority: getRealmAuthorityLevel(target),
    attack: target?.攻击,
    defense: target?.防御,
    hp: target?.血量上限 || target?.当前血量,
    speed: target?.速度,
    spellMultiplier: target?.法球倍率,
    soul: target?.元神,
    soulLimit: target?.元神上限,
    rootName: target?.灵根?.name,
    rootType: target?.灵根?.type,
    technique: target?.当前使用的功法 || target?.学习的功法?.[0],
    capturedAt: now,
  });
}

export function recordWanhuaKill(player, target, options = {}) {
  const state = ensureWanhuaBannerState(player);
  if (!target || String(target.id || '') === String(player.id || '__owner__')) {
    return { addedSoul: 0, addedMainSoul: null, state };
  }

  const now = number(options.now, Date.now());
  const before = state.生魂;
  state.生魂 = Math.min(WANHUA_SOUL_CAP, state.生魂 + 1);
  state.累计炼魂 += 1;
  state.上次炼魂 = now;

  let addedMainSoul = null;
  if ((options.mainSoulEligible ?? isWanhuaMainSoulTarget(target)) && state.主魂.length < WANHUA_MAIN_SOUL_CAP) {
    const snapshot = createWanhuaMainSoulSnapshot(target, now);
    const duplicate = snapshot.sourceId
      ? state.主魂.some(soul => soul.sourceId === snapshot.sourceId)
      : false;
    if (!duplicate) {
      state.主魂.push(snapshot);
      addedMainSoul = snapshot;
    }
  }

  return {
    addedSoul: state.生魂 - before,
    addedMainSoul,
    state,
  };
}

export function buildWanhuaMainSoulCompanion(snapshot, index = 0) {
  const soul = normalizeMainSoul(snapshot);
  if (!soul) return null;
  const ratio = 0.35;
  const hp = Math.max(1, Math.trunc(soul.hp * ratio));
  return {
    名号: `【主魂】${soul.sourceName}${index ? `·${index}` : ''}`,
    攻击: Math.max(1, Math.trunc(soul.attack * ratio)),
    防御: Math.max(0, Math.trunc(soul.defense * ratio)),
    血量上限: hp,
    当前血量: hp,
    速度: Math.max(1, Math.trunc(soul.speed * ratio)),
    法球倍率: soul.spellMultiplier,
    元神: Math.max(0, Math.trunc(soul.soul * ratio)),
    元神上限: Math.max(0, Math.trunc(soul.soulLimit * ratio)),
    灵根: { name: soul.rootName, type: soul.rootType },
    学习的功法: soul.technique ? [soul.technique] : [],
    当前使用的功法: soul.technique,
    暴击率: 0,
    暴击伤害: 0,
    分身: [],
    _万灵魔幡主魂: true,
  };
}

function reduceCoreAttributes(opponent) {
  for (const field of ['攻击', '防御', '血量上限', '当前血量', '速度', '元神上限', '元神']) {
    if (!Number.isFinite(Number(opponent?.[field]))) continue;
    opponent[field] = Math.max(field === '当前血量' ? 0 : 1, Math.trunc(Number(opponent[field]) * 0.75));
  }
  if (Number.isFinite(Number(opponent?.血量上限))) {
    opponent.当前血量 = Math.min(number(opponent.当前血量), number(opponent.血量上限));
  }
}

export function applyWanhuaBannerOpening(player, opponent, equipment, options = {}) {
  if (!isWanhuaBannerUser(player, equipment)) return { active: false, messages: [], companions: [] };
  if (player._万灵魔幡已展开) return player._万灵魔幡战斗效果;

  const state = ensureWanhuaBannerState(player);
  const soulCount = state.生魂;
  const mainSoulCount = state.主魂.length;
  const statBonus = soulCount * WANHUA_SOUL_STAT_BONUS;
  const messages = [
    `【万化·万灵魔幡】${player.名号}身后魔幡猎猎，${soulCount}道万灵魔魂齐声恸哭！`,
  ];

  player.攻击 = Math.max(1, integer(player.攻击, 1) + statBonus);
  player.防御 = Math.max(0, integer(player.防御) + statBonus);
  player.血量上限 = Math.max(1, integer(player.血量上限, 1) + statBonus);
  player.当前血量 = Math.min(player.血量上限, Math.max(0, integer(player.当前血量) + statBonus));
  player.吸血率 = Math.max(0, number(player.吸血率) + mainSoulCount * 0.03);
  player.穿透 = Math.max(0, number(player.穿透) + mainSoulCount * 0.03);

  if (soulCount >= 1000) {
    const shield = Math.trunc(player.血量上限 * 0.2);
    player.护盾值 = Math.max(0, integer(player.护盾值)) + shield;
    messages.push(`千魂结界展开，凝成相当于生命上限20%的万灵护盾（${shield}）。`);
  }
  if (soulCount >= 2500) {
    player.神通伤害减免 = Math.min(0.9, number(player.神通伤害减免) + 0.3);
    player.元神伤害减免 = Math.min(0.9, number(player.元神伤害减免) + 0.3);
    messages.push('二千五百魂共镇幡域，神通与元神抗性提升30%。');
  }
  if (soulCount >= WANHUA_SOUL_CAP && opponent) {
    const opponents = (Array.isArray(opponent) ? opponent : [opponent]).filter(Boolean);
    for (const target of opponents) reduceCoreAttributes(target);
    const targetName = opponents.length > 1 ? '敌方全体' : opponents[0]?.名号;
    messages.push(`九九九九魂圆满，${targetName || '敌手'}被万灵咒怨削去25%全属性！`);
  }

  const companions = [];
  const random = typeof options.random === 'function' ? options.random : Math.random;
  if (mainSoulCount >= WANHUA_MAIN_SOUL_CAP && random() < WANHUA_MAIN_SOUL_SUMMON_CHANCE) {
    const count = Math.min(3, Math.max(1, 1 + Math.floor(random() * 3)));
    const pool = [...state.主魂].sort(() => random() - 0.5).slice(0, count);
    for (const [index, soul] of pool.entries()) {
      const companion = buildWanhuaMainSoulCompanion(soul, index + 1);
      if (companion) companions.push(companion);
    }
    player.分身 = Array.isArray(player.分身) ? player.分身 : [];
    player.分身.push(...companions);
    messages.push(`十方主魂归位，${companions.length}尊主魂携生前35%战力踏出魔幡！`);
  }

  const result = {
    active: true,
    soulCount,
    mainSoulCount,
    statBonus,
    companions,
    messages,
  };
  player._万灵魔幡已展开 = true;
  player._万灵魔幡战斗效果 = result;
  return result;
}

export function rollWanhuaBannerActiveAttack(attacker, defender, options = {}) {
  const combat = attacker?._万灵魔幡战斗效果;
  if (!combat?.active || combat.soulCount < 4000 || attacker._万灵魔幡主动已触发) return null;
  const random = typeof options.random === 'function' ? options.random : Math.random;
  if (random() >= WANHUA_ACTIVE_CHANCE) return null;

  attacker._万灵魔幡主动已触发 = true;
  const rawDamage = Math.max(
    1,
    Math.trunc(number(attacker.攻击, 1) * Math.max(1, number(attacker.法球倍率, 1)) * 0.35)
  );
  return {
    rawDamage,
    actionBarReduction: WANHUA_ACTION_BAR_REDUCTION,
    message: `【万灵噬神】魔幡卷落，万魂啃噬${defender?.名号 || '敌手'}元神，并镇压其行动！`,
  };
}

export function formatWanhuaBannerStatus(player) {
  const state = ensureWanhuaBannerState(player);
  const thresholds = [1000, 2500, 4000, WANHUA_SOUL_CAP];
  const next = thresholds.find(value => state.生魂 < value);
  return [
    '【万化】万灵魔幡',
    `万灵魔魂：${state.生魂}/${WANHUA_SOUL_CAP}`,
    `天骄主魂：${state.主魂.length}/${WANHUA_MAIN_SOUL_CAP}`,
    `单魂战斗增幅：攻防生各+${WANHUA_SOUL_STAT_BONUS.toLocaleString('zh-CN')}`,
    next ? `下一重幡域：${next}魂` : '幡域境界：九九归一·万灵魔域',
  ].join('\n');
}
