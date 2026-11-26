import { getRealmAuthorityLevel } from './realmAuthority.js';

export const IMPERIAL_REALM_REQUIREMENTS = Object.freeze({
  mijinglevel_id: 16, // 大帝境
  huafenlevel_id: 16, // 混元境·大能
  xiangulevel_id: 15, // 至尊境
});

export const SEALED_IMPERIAL_TECHNIQUES = Object.freeze([
  '临字秘',
  '皆字秘',
  '一气化三清',
]);

const SUPPRESSED_FIELDS = Object.freeze([
  '攻击', '防御', '血量上限', '当前血量', '速度', '法球倍率',
  '暴击率', '暴击伤害', '闪避率', '吸血率', '穿透',
  '攻击加成', '防御加成', '生命加成', '元神伤害加成', '元神伤害减免',
  '神通伤害加成', '神通伤害减免', '近战伤害加成', '近战伤害减免',
  '全伤害类型加成', '全类型减免', '减伤', '治疗效果加成', '每回合恢复',
]);

const ROOT_LAW_MITIGATION = Object.freeze([
  [/先天混沌圣体道胎|混沌圣体道胎/, 0.50],
  [/彼岸.*命运神道体/, 0.50],
  [/天命青儿|始源之律者.*爱莉希雅/, 0.48],
  [/终焉神魔体|无相.*万化天魔体|无化天魔体/, 0.46],
  [/终极涅槃至尊|涅槃.*至尊|涅槃至尊体/, 0.44],
  [/先天圣体道胎|圣体道胎/, 0.42],
  [/混沌体/, 0.40],
  [/大成.*荒古圣体|大成圣体/, 0.38],
  [/人之律者.*爱莉希雅/, 0.38],
  [/命运神道体/, 0.36],
  [/九转轮回体/, 0.25],
  [/八转轮回体/, 0.20],
  [/七转轮回体/, 0.16],
  [/六转轮回体/, 0.12],
  [/五转轮回体/, 0.08],
]);

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rootText(player = {}) {
  const root = player.灵根;
  return typeof root === 'string'
    ? `${root} ${player.体质 || ''} ${player.特殊体质 || ''}`
    : `${root?.name || ''} ${root?.type || ''} ${player.体质 || ''} ${player.特殊体质 || ''}`;
}

function isSealedTechnique(name) {
  return SEALED_IMPERIAL_TECHNIQUES.some(technique =>
    name === technique || String(name || '').startsWith(`${technique}·`)
  );
}

export function createXijiePlayerSnapshot(player = {}, buff = 1, playerId = '') {
  const safeBuff = Math.max(1, number(buff, 1));
  const maxHealth = Math.max(1, Math.trunc(number(player.血量上限, player.当前血量 || 1) * safeBuff));
  return {
    ...player,
    id: String(playerId || player.id || ''),
    灵根: player.灵根 && typeof player.灵根 === 'object' ? { ...player.灵根 } : player.灵根,
    学习的功法: [...(player.学习的功法 || [])],
    分身: Array.isArray(player.分身) ? [...player.分身] : [],
    攻击: Math.max(1, Math.trunc(number(player.攻击, 1))),
    防御: Math.max(1, Math.trunc(number(player.防御, 1) * safeBuff)),
    血量上限: maxHealth,
    当前血量: maxHealth,
    魔值: number(player.魔道值) > 999 ? 1 : 0,
  };
}

export function buildXijieNpcCombatant(monster = {}, player = {}, grade = 1) {
  const safeGrade = Math.max(1, Math.trunc(number(grade, 1)));
  const gradeDefenceScale = 1 + safeGrade * 0.05;
  const maxHealth = Math.max(1, Math.trunc(
    number(monster.blood, 1) * number(player.当前血量, player.血量上限 || 1) / gradeDefenceScale
  ));
  const techniques = [...(monster.学习的功法 || [])];
  return {
    id: `xijie-npc-${monster.id || monster.name || 'unknown'}`,
    名号: monster.name || '未知守卫',
    攻击: Math.max(1, Math.trunc(number(monster.atk, 1) * number(player.攻击, 1))),
    防御: Math.max(1, Math.trunc(number(monster.def, 1) * number(player.防御, 1) / gradeDefenceScale)),
    血量上限: maxHealth,
    当前血量: maxHealth,
    暴击率: number(monster.baoji, 1),
    暴击伤害: number(monster.暴击伤害, 1.5),
    速度: Math.max(1, Math.trunc(number(monster.速度, 100))),
    _忽略境界速度加成: true,
    闪避率: number(monster.闪避率),
    吸血率: number(monster.吸血率),
    穿透: number(monster.穿透),
    灵根: monster.灵根 && typeof monster.灵根 === 'object' ? { ...monster.灵根 } : monster.灵根,
    法球倍率: number(monster.灵根?.法球倍率, monster.法球倍率 || 0),
    学习的功法: techniques,
    当前使用的功法: monster.当前使用的功法 || techniques[0] || '',
    level_id: number(monster.level_id),
    Physique_id: number(monster.Physique_id),
    mijinglevel_id: number(monster.mijinglevel_id),
    xiangulevel_id: number(monster.xiangulevel_id),
    huafenlevel_id: number(monster.huafenlevel_id),
    额外体系境界: monster.额外体系境界 ? { ...monster.额外体系境界 } : {},
    帝道规则: Boolean(monster.帝道规则),
    皇道法则: Boolean(monster.皇道法则),
    道途压制: Boolean(monster.道途压制),
    法则压制比例: number(monster.法则压制比例),
  };
}

export function getRootLawMitigation(player = {}) {
  const text = rootText(player);
  return ROOT_LAW_MITIGATION.find(([pattern]) => pattern.test(text))?.[1] || 0;
}

export function meetsImperialRealmRequirement(player = {}) {
  return Object.entries(IMPERIAL_REALM_REQUIREMENTS).some(([field, required]) =>
    number(player[field]) >= required
  );
}

export function applyXijieLawSuppression(player = {}, npc = {}) {
  const clone = {
    ...player,
    灵根: player.灵根 && typeof player.灵根 === 'object' ? { ...player.灵根 } : player.灵根,
    学习的功法: [...(player.学习的功法 || [])],
  };
  const lawActive = Boolean(npc.帝道规则 || npc.皇道法则 || npc.道途压制);
  if (!lawActive) return { player: clone, suppressed: false, sealed: [], reduction: 0, mitigation: 0 };

  const playerAuthority = getRealmAuthorityLevel(player);
  const npcAuthority = getRealmAuthorityLevel(npc);
  const authorityGap = Math.max(0, npcAuthority - playerAuthority);
  const imperialThresholdMissing = !meetsImperialRealmRequirement(player);
  if (!imperialThresholdMissing && authorityGap === 0) {
    return { player: clone, suppressed: false, sealed: [], reduction: 0, mitigation: 0, authorityGap };
  }

  const imperialDominance = npcAuthority >= 16 && playerAuthority < 16;
  const configuredReduction = Math.max(0, Math.min(0.9, number(npc.法则压制比例)));
  const realmReduction = imperialDominance
    ? Math.min(0.85, 0.70 + Math.max(0, authorityGap - 1) * 0.05)
    : Math.min(0.60, Math.max(1, authorityGap) * 0.18);
  const baseReduction = imperialThresholdMissing
    ? Math.max(configuredReduction, realmReduction)
    : realmReduction;
  const mitigation = getRootLawMitigation(player);
  const reduction = Math.max(0, Math.min(0.9, baseReduction * (1 - mitigation)));
  const remain = 1 - reduction;

  for (const field of SUPPRESSED_FIELDS) {
    if (!Number.isFinite(Number(clone[field]))) continue;
    const value = Number(clone[field]) * remain;
    clone[field] = ['攻击', '防御', '血量上限', '当前血量', '速度'].includes(field)
      ? Math.max(1, Math.trunc(value))
      : Math.max(0, value);
  }

  const sealed = imperialThresholdMissing
    ? clone.学习的功法.filter(isSealedTechnique)
    : [];
  if (sealed.length) {
    clone.学习的功法 = clone.学习的功法.filter(name => !isSealedTechnique(name));
    if (isSealedTechnique(clone.当前使用的功法)) {
      clone.当前使用的功法 = clone.学习的功法[0] || '';
    }
  }

  const lawName = npc.皇道法则 ? '皇道法则' : npc.帝道规则 ? '帝道规则' : '道途法则';
  const rootName = player.灵根?.name || player.灵根 || '普通灵根';
  const sealedText = sealed.length ? `；${[...new Set(sealed)].join('、')}失效` : '';
  return {
    player: clone,
    suppressed: reduction > 0,
    sealed: [...new Set(sealed)],
    reduction,
    mitigation,
    authorityGap,
    message: `【${lawName}压制】${rootName}抵消${Math.round(mitigation * 100)}%法则威压，全属性保留${Math.round(remain * 100)}%${sealedText}。`,
  };
}
