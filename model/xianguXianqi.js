export const XIANGU_XIANQI = Object.freeze({
  maxStrands: 3,
  suppressPerStrand: 0.3,
  strandNames: Object.freeze({
    1: '第一道仙气',
    2: '第二道仙气',
    3: '第三道仙气',
  }),
  trials: Object.freeze({
    2: Object.freeze({ name: '第二道仙气', costMultiplier: 20 }),
    3: Object.freeze({ name: '第三道仙气', costMultiplier: 30 }),
  }),
});

export const XIANGU_SHENHUO_QUALITY_TIERS = Object.freeze([
  Object.freeze({ quality: '下品', rate: 0.3, refineCost: 0 }),
  Object.freeze({ quality: '中品', rate: 0.5, refineCost: 1 }),
  Object.freeze({ quality: '上品', rate: 1.0, refineCost: 1 }),
  Object.freeze({ quality: '极品', rate: 1.5, refineCost: 2 }),
  Object.freeze({ quality: '唯一', rate: 2.0, refineCost: 3 }),
]);

export const DAOZHONG_TO_SHENHUO_QUALITY = Object.freeze({
  普通: '下品',
  稀有: '中品',
  传说: '上品',
  神话: '极品',
});

export function getFlameQualityRate(quality) {
  const matched = XIANGU_SHENHUO_QUALITY_TIERS.find(tier => tier.quality === quality);
  return matched ? matched.rate : 1.0;
}

export function resolveXianguShenhuoQuality(player) {
  const sh = player?.xiangu_shenhuo;
  if (!sh || typeof sh !== 'object') return '上品';
  if (sh.神火品质) return sh.神火品质;
  if (sh.路线 === '祭炼真我') return '唯一';
  if (sh.道种品质) return DAOZHONG_TO_SHENHUO_QUALITY[sh.道种品质] || '下品';
  if (sh.点燃方式 === '自身修炼' || sh.点燃方式 === '苦修') return '下品';
  return '上品';
}

export function getXianguShenhuoAttributeMultiplier(player) {
  const levelId = Number(player?.xiangulevel_id) || 0;
  if (levelId < 8) return 1.0;
  const sh = player?.xiangu_shenhuo;
  if (!sh || typeof sh !== 'object' || !sh.已点燃) return 1.0;
  const explicitRate = Number(sh.属性倍率);
  if (Number.isFinite(explicitRate) && explicitRate > 0) {
    return Math.max(0.3, Math.min(2.0, explicitRate));
  }
  return getFlameQualityRate(resolveXianguShenhuoQuality(player));
}

export function getXianguExternalDaoFlawMultiplier(player) {
  const levelId = Number(player?.xiangulevel_id) || 0;
  if (levelId >= 15 && player?.xiangu_zhizun_external_dao_flaw) {
    return 0.88;
  }
  return 1.0;
}

export function scaleXianguBaseStats(player, levels = []) {
  const levelId = Number(player?.xiangulevel_id) || 1;
  const current = (levels || []).find(item => Number(item?.level_id) === levelId) || {
    基础攻击: 0,
    基础防御: 0,
    基础血量: 0,
  };
  if (levelId < 8) {
    return {
      基础攻击: Number(current.基础攻击) || 0,
      基础防御: Number(current.基础防御) || 0,
      基础血量: Number(current.基础血量) || 0,
    };
  }
  const lv7 = (levels || []).find(item => Number(item?.level_id) === 7) || {
    基础攻击: 0,
    基础防御: 0,
    基础血量: 0,
  };
  const shenhuoMult = getXianguShenhuoAttributeMultiplier(player);
  const flawMult = getXianguExternalDaoFlawMultiplier(player);
  const scale = (baseVal, lv7Val) => {
    const base = Number(baseVal) || 0;
    const floor = Number(lv7Val) || 0;
    const delta = Math.max(0, base - floor);
    return Math.trunc((floor + delta * shenhuoMult) * flawMult);
  };
  return {
    基础攻击: scale(current.基础攻击, lv7.基础攻击),
    基础防御: scale(current.基础防御, lv7.基础防御),
    基础血量: scale(current.基础血量, lv7.基础血量),
  };
}

export function getNextShenhuoRefinement(player) {
  const sh = player?.xiangu_shenhuo;
  if (!sh || !sh.已点燃 || (Number(player?.xiangulevel_id) || 0) < 8) {
    return { ok: false, reason: 'unlit', message: '尚未点燃神火，无法炼化道火精粹。' };
  }
  const currentQuality = resolveXianguShenhuoQuality(player);
  const currentIndex = XIANGU_SHENHUO_QUALITY_TIERS.findIndex(
    tier => tier.quality === currentQuality
  );
  if (currentIndex < 0 || currentIndex >= XIANGU_SHENHUO_QUALITY_TIERS.length - 1) {
    return {
      ok: false,
      reason: 'max',
      currentQuality,
      message: '你的神火已臻至【唯一真火（×2.0）】最高品质，无需继续提纯。',
    };
  }
  const nextTier = XIANGU_SHENHUO_QUALITY_TIERS[currentIndex + 1];
  const ownedEssence = Math.max(0, Math.floor(Number(player?.xiangu_daohuo_jingcui) || 0));
  if (ownedEssence < nextTier.refineCost) {
    return {
      ok: false,
      reason: 'essence',
      currentQuality,
      nextTier,
      ownedEssence,
      message: `将神火从【${currentQuality}】提纯至【${nextTier.quality}（×${nextTier.rate.toFixed(1)}）】需消耗 ${nextTier.refineCost} 份道火精粹液（当前拥有 ${ownedEssence} 份）。`,
    };
  }
  return {
    ok: true,
    currentQuality,
    nextTier,
    ownedEssence,
  };
}

export function applyShenhuoRefinement(player) {
  const check = getNextShenhuoRefinement(player);
  if (!check.ok) return check;
  const { nextTier, currentQuality } = check;
  player.xiangu_daohuo_jingcui = Math.max(
    0,
    Math.floor(Number(player.xiangu_daohuo_jingcui) || 0) - nextTier.refineCost
  );
  player.xiangu_shenhuo.神火品质 = nextTier.quality;
  player.xiangu_shenhuo.属性倍率 = nextTier.rate;
  let grantedFirstStrand = false;
  if ((nextTier.quality === '极品' || nextTier.quality === '唯一') && getXianqiStrands(player) === 0) {
    grantedFirstStrand = grantXianqi(player, `道火精粹提纯·${nextTier.quality}神火`);
  }
  return {
    ok: true,
    previousQuality: currentQuality,
    nextQuality: nextTier.quality,
    nextRate: nextTier.rate,
    cost: nextTier.refineCost,
    grantedFirstStrand,
  };
}

export function canResolveZhizunExternalDaoFlaw(player) {
  if (!player?.xiangu_zhizun_external_dao_flaw) {
    return { ok: false, reason: 'none', message: '你的至尊道果浑然无瑕，并无外道载道隐患。' };
  }
  if ((Number(player?.xiangulevel_id) || 0) < 15) {
    return { ok: false, reason: 'realm', message: '尚未踏足至尊境。' };
  }
  const isShengyuan = player?.仙古院籍?.分院 === '圣院';
  const hasYishenweizhong = Boolean(player?.xiangu_yishenweizhong);
  if (!isShengyuan && !hasYishenweizhong) {
    return {
      ok: false,
      reason: 'qualification',
      message: '重塑至尊道基需拜入天神书院·圣院，或曾修成【以身为种】真义。',
    };
  }
  const potentialCost = isShengyuan ? 15 : 20;
  const currentPotential = Math.max(0, Number(player?.仙道潜力) || 0);
  if (currentPotential < potentialCost) {
    return {
      ok: false,
      reason: 'potential',
      potentialCost,
      currentPotential,
      message: `涅槃重塑至尊道基需消耗 ${potentialCost} 点仙道潜力（当前：${currentPotential} 点）。`,
    };
  }
  return {
    ok: true,
    potentialCost,
    isShengyuan,
  };
}

export function applyResolveZhizunExternalDaoFlaw(player) {
  const check = canResolveZhizunExternalDaoFlaw(player);
  if (!check.ok) return check;
  player.仙道潜力 = Math.max(0, (Number(player.仙道潜力) || 0) - check.potentialCost);
  player.xiangu_zhizun_external_dao_flaw = false;
  player.xiangu_yishenweizhong = true;
  player.xiangu_zhizun_flaw_resolved = true;
  return {
    ok: true,
    potentialCost: check.potentialCost,
    isShengyuan: check.isShengyuan,
  };
}

export function clampXianqiStrands(value) {
  const raw = value && typeof value === 'object' ? value.strands : value;
  const strands = Math.trunc(Number(raw) || 0);
  return Math.max(0, Math.min(XIANGU_XIANQI.maxStrands, strands));
}

export function getXianqiStrands(player) {
  return clampXianqiStrands(player?.xiangu_xianqi);
}

function normalizeDetailEntry(entry, strand) {
  const source = entry && typeof entry === 'object' ? entry : {};
  const { type: _legacyType, ...rest } = source;
  return {
    ...rest,
    strand,
    name: XIANGU_XIANQI.strandNames[strand],
    src: source.src || '历史存档·来源未记录',
    ts: source.ts || null,
  };
}

export function ensureXianqiState(player) {
  if (!player || typeof player !== 'object') return 0;

  const legacy = player.xiangu_xianqi && typeof player.xiangu_xianqi === 'object'
    ? player.xiangu_xianqi
    : null;
  const strands = clampXianqiStrands(player.xiangu_xianqi);
  const existingDetail = player.xiangu_xianqi_detail && typeof player.xiangu_xianqi_detail === 'object'
    ? player.xiangu_xianqi_detail
    : {};
  const legacyList = Array.isArray(legacy?.list) ? legacy.list : [];
  const existingList = Array.isArray(existingDetail.list) ? existingDetail.list : legacyList;
  const list = [];

  for (let strand = 1; strand <= strands; strand += 1) {
    list.push(normalizeDetailEntry(existingList[strand - 1], strand));
  }

  player.xiangu_xianqi = strands;
  player.xiangu_xianqi_detail = {
    ...existingDetail,
    list,
    flags: existingDetail.flags && typeof existingDetail.flags === 'object'
      ? existingDetail.flags
      : (legacy?.flags && typeof legacy.flags === 'object' ? legacy.flags : {}),
  };
  return strands;
}

export function grantXianqi(player, src, now = new Date()) {
  const strands = ensureXianqiState(player);
  if (strands >= XIANGU_XIANQI.maxStrands) return false;
  if (player.xiangu_xianqi_detail.list.some(entry => entry.src === src)) return false;

  const nextStrand = strands + 1;
  player.xiangu_xianqi = nextStrand;
  player.xiangu_xianqi_detail.list.push({
    strand: nextStrand,
    name: XIANGU_XIANQI.strandNames[nextStrand],
    src,
    ts: now instanceof Date ? now.toISOString() : String(now),
  });
  return true;
}

export function getNextXianqiTrial(player) {
  const strands = getXianqiStrands(player);
  const levelId = Number(player?.xiangulevel_id);

  if (levelId !== 8) {
    return { allowed: false, reason: 'realm', strands };
  }
  if (strands === 0) {
    return { allowed: false, reason: 'first_strand_required', strands };
  }
  if (strands >= XIANGU_XIANQI.maxStrands) {
    return { allowed: false, reason: 'complete', strands };
  }

  const targetStrand = strands + 1;
  return {
    allowed: true,
    strands,
    targetStrand,
    ...XIANGU_XIANQI.trials[targetStrand],
  };
}

export function getXianqiSuppressMultiplier(attacker, defender) {
  // 斩道王者已立己道、掌握法则，仙气无法再形成层次压制。
  if (Number(defender?.mijinglevel_id) >= 11) return 1;
  const diff = Math.max(0, getXianqiStrands(attacker) - getXianqiStrands(defender));
  if (diff <= 0) return 1;
  const xianyuanBoost = attacker?.仙古院籍?.分院 === '仙院' ? 1.15 : 1.0;
  return Number((1 + diff * XIANGU_XIANQI.suppressPerStrand * xianyuanBoost).toFixed(4));
}

export function getXianqiShieldReductionRate(defender) {
  const strands = getXianqiStrands(defender);
  if (strands <= 0) return 0;
  const baseRate = strands * 0.04;
  const xianyuanBoost = defender?.仙古院籍?.分院 === '仙院' ? 1.15 : 1.0;
  return Math.min(0.25, Number((baseRate * xianyuanBoost).toFixed(4)));
}

export function handleXianguCombatEffects(
  attacker,
  defender,
  msg = [],
  random = Math.random,
  dealDamage = null
) {
  if (!attacker || !defender) return { triggered: false, bonusDamage: 0, healed: 0 };
  const isShengyuan = attacker?.仙古院籍?.分院 === '圣院';
  const shengyuanScale = isShengyuan ? 1.2 : 1.0;
  const atk = Math.max(1, Number(attacker.攻击) || 1);
  const maxHp = Math.max(1, Number(attacker.血量上限 || attacker.血气上限 || attacker.当前血量) || 1);
  let totalBonusDamage = 0;
  let totalHealed = 0;
  let anyTriggered = false;

  const applyExtraDamage = raw => {
    const dmg = Math.max(1, Math.trunc(raw));
    if (typeof dealDamage === 'function') {
      const res = dealDamage(defender, dmg, attacker);
      return Number(res?.actual_damage) || 0;
    }
    const before = Math.max(0, Number(defender.当前血量) || 0);
    defender.当前血量 = Math.max(0, before - dmg);
    return before - defender.当前血量;
  };

  const applyHeal = raw => {
    const heal = Math.max(1, Math.trunc(raw));
    const cur = Math.max(0, Number(attacker.当前血量) || 0);
    const next = Math.min(maxHp, cur + heal);
    const actual = Math.max(0, next - cur);
    attacker.当前血量 = next;
    return actual;
  };

  // 1. 【尊者极境·五行涅槃】
  const wuxingPower = String(attacker.五行神通 || '').trim();
  if (wuxingPower && Number(random()) < Math.min(0.45, 0.25 * shengyuanScale)) {
    anyTriggered = true;
    if (wuxingPower.includes('庚金')) {
      const shred = Math.max(1, Math.trunc((Number(defender.防御) || 0) * 0.08 * shengyuanScale));
      defender.防御 = Math.max(0, (Number(defender.防御) || 0) - shred);
      const hit = applyExtraDamage(atk * 0.22 * shengyuanScale);
      totalBonusDamage += hit;
      msg.push(`【极境·庚金剑气】${attacker.名号}五行洞天齐鸣，庚金剑气撕裂${defender.名号}护体宝光（破甲-${shred.toLocaleString()}，造成${hit.toLocaleString()}伤害）！`);
    } else if (wuxingPower.includes('乙木')) {
      const healed = applyHeal(maxHp * 0.08 * shengyuanScale);
      totalHealed += healed;
      msg.push(`【极境·乙木回春】${attacker.名号}运转五行涅槃生机，青霞漫卷，恢复${healed.toLocaleString()}点生命！`);
    } else if (wuxingPower.includes('离火')) {
      const hit = applyExtraDamage(atk * 0.3 * shengyuanScale);
      totalBonusDamage += hit;
      msg.push(`【极境·离火神焰】${attacker.名号}祭出涅槃离火焚烧诸天，对${defender.名号}造成${hit.toLocaleString()}点灼烧伤害！`);
    } else if (wuxingPower.includes('水') || wuxingPower.includes('玄水') || wuxingPower.includes('葵水')) {
      const hit = applyExtraDamage(atk * 0.2 * shengyuanScale);
      totalBonusDamage += hit;
      defender.速度 = Math.max(1, Math.trunc((Number(defender.速度) || 100) * 0.9));
      msg.push(`【极境·玄水真罡】${attacker.名号}引太阴玄水封冻虚空，迟滞${defender.名号}身法并造成${hit.toLocaleString()}点伤害！`);
    } else if (wuxingPower.includes('戊土')) {
      const defGain = Math.max(1, Math.trunc((Number(attacker.防御) || 1) * 0.1 * shengyuanScale));
      attacker.防御 = (Number(attacker.防御) || 0) + defGain;
      msg.push(`【极境·戊土圣盾】${attacker.名号}脚踏戊土本源，万法难撼，防御提升+${defGain.toLocaleString()}！`);
    }
  }

  // 2. 【圣祭境·神王法则爆发】
  if (Number(attacker.xiangulevel_id) === 10 && Number(random()) < 0.28) {
    anyTriggered = true;
    const hit = applyExtraDamage(atk * 0.35 * shengyuanScale);
    totalBonusDamage += hit;
    msg.push(`【圣祭·神王一击】${attacker.名号}体内圣祭领域剧烈震荡，法则祭献化作神王法相轰落，额外造成${hit.toLocaleString()}点伤害！`);
  }

  // 3. 【虚道极境·逆伐斩我】
  if (attacker.xiangu_nifa_zhanwo) {
    const atkRealm = Number(attacker.xiangulevel_id) || 0;
    const defRealm = Number(defender.xiangulevel_id) || 0;
    const isHigherOrBoss = defRealm > atkRealm || Boolean(defender.isBoss) || (Number(defender.攻击) || 0) >= atk;
    if (isHigherOrBoss && Number(random()) < Math.min(0.65, 0.45 * shengyuanScale)) {
      anyTriggered = true;
      const hit = applyExtraDamage(atk * 0.18 * shengyuanScale);
      totalBonusDamage += hit;
      msg.push(`【极境·逆伐斩我】${attacker.名号}身负九天十地劫印，逆战强敌战意暴涨，轰出${hit.toLocaleString()}点破境伤害！`);
    }
  }

  // 4. 【斩我极境·斩仙铡刀】
  if (attacker.xiangu_zhanxian_zhadao && Number(random()) < Math.min(0.55, 0.32 * shengyuanScale)) {
    anyTriggered = true;
    const trueDmg = Math.max(1, Math.trunc(atk * 0.22 * shengyuanScale));
    const before = Math.max(0, Number(defender.当前血量) || 0);
    defender.当前血量 = Math.max(0, before - trueDmg);
    const actual = before - defender.当前血量;
    totalBonusDamage += actual;
    msg.push(`【极境·斩仙铡刀】${attacker.名号}眉心显化葬地斩仙铡刀，一刀斩落元神本源，无视防御斩去${defender.名号}${actual.toLocaleString()}点生命！`);
  }

  // 5. 【九重雷天·太古雷灵协战】
  const spirits = Math.min(3, Math.max(0, Math.floor(Number(attacker.xiangu_leiling) || 0)));
  if (spirits > 0 && Number(random()) < 0.15 * spirits) {
    anyTriggered = true;
    const hit = applyExtraDamage(atk * (0.08 * spirits));
    const healed = applyHeal(maxHp * (0.02 * spirits));
    totalBonusDamage += hit;
    totalHealed += healed;
    msg.push(`【至宝·雷灵协战】${attacker.名号}肩头${spirits}头太古雷灵吞吐九天雷劫液，轰杀${defender.名号}${hit.toLocaleString()}点伤害并反哺${healed.toLocaleString()}点气血！`);
  }

  return {
    triggered: anyTriggered,
    bonusDamage: totalBonusDamage,
    healed: totalHealed,
  };
}

export function resolveXianguDefensiveMitigation(defender, incomingDamage, msg = []) {
  const dmg = Math.max(0, Number(incomingDamage) || 0);
  if (!defender || dmg <= 0) return dmg;
  let current = dmg;

  if (defender.五行抗性 === '圆满') {
    const isShengyuan = defender?.仙古院籍?.分院 === '圣院';
    const rate = isShengyuan ? 0.096 : 0.08;
    const reduced = Math.trunc(current * rate);
    if (reduced > 0) {
      current -= reduced;
      msg.push(`【极境·五行不灭】${defender.名号}五行抗性圆满，万法流转化去${reduced.toLocaleString()}点伤害！`);
    }
  }

  const shieldRate = getXianqiShieldReductionRate(defender);
  if (shieldRate > 0) {
    const reduced = Math.trunc(current * shieldRate);
    if (reduced > 0) {
      current -= reduced;
      msg.push(`【仙气·万法不侵】${defender.名号}体表仙气缭绕，抵消了${reduced.toLocaleString()}点伤害！`);
    }
  }

  return Math.max(0, current);
}
