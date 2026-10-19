import {
  calculateWudaoResult,
  getAvailableLifespan,
  getDaoRuleForRealm,
  getTechniqueWudaoProfile,
  getWudaoResourceCosts,
  getXianguDaoRuleForRealm,
} from '../apps/User/wudaoRules.js';
import { getBreakthroughPotentialCost } from '../apps/User/breakthroughPotential.js';
import { getDungeonGongfaReduction, getWudaoGongfaReduction } from './gongfaProficiency.js';
import {
  getMinggeEffects,
  getMinggeSecretPlaceReductionMs,
} from './mingge.js';
import {
  getInnateTreasureProjectionName,
  getDungeonTimedActionMultiplier,
  getTimedActionMultiplier,
  hasEquippedInnateTreasure,
  isInnateTreasureName,
} from './innateTreasure.js';
import { applyQuestionFortuneCost, hasRedDustFortune } from './redDustFortune.js';
import { isDaofaActive } from './daofa.js';
import { calculateExtraAttributeLimit } from './attributeCaps.js';
import { getRealmAuthorityLevel, getRealmAuthorityPath } from './realmAuthority.js';
import { ensureDaoHeart } from './daoHeart.js';
import {
  collectEquipmentStatPools,
  MAX_PERCENT_EQUIPMENT_STAT,
} from './equipmentStats.js';

export { calculateExtraAttributeLimit } from './attributeCaps.js';

const NORMAL_SLOT_NAMES = ['武器', '护具', '法宝'];
const SPECIAL_IMPERIAL_WEAPONS = new Set(['封神榜', '神女炉', '天庭权杖']);

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function integer(value) {
  return Math.trunc(number(value)).toLocaleString('zh-CN');
}

function signedInteger(value) {
  const amount = Math.trunc(number(value));
  return `${amount > 0 ? '+' : ''}${amount.toLocaleString('zh-CN')}`;
}

function percent(value, signed = false) {
  const amount = number(value) * 100;
  const prefix = signed && amount > 0 ? '+' : '';
  return `${prefix}${amount.toFixed(2).replace(/\.00$/, '')}%`;
}

function nameOf(entry, fallback = '未开启') {
  return entry?.level || entry?.name || fallback;
}

function findLevel(list, id) {
  return (list || []).find(item => Number(item?.level_id) === Number(id));
}

function learnedNames(player) {
  return Array.isArray(player?.学习的功法) ? player.学习的功法 : [];
}

export function calculateExtraAttributeState(player) {
  const limit = calculateExtraAttributeLimit(player);
  const result = {};
  for (const [label, field] of [['攻击', '攻击加成'], ['防御', '防御加成'], ['生命', '生命加成']]) {
    const raw = number(player?.[field]);
    const within = Math.min(raw, limit.total);
    const diluted = Math.max(0, raw - limit.total);
    result[label] = {
      raw,
      within,
      diluted,
      status: raw > limit.total ? '已超上限' : raw === limit.total ? '已达上限' : '未达上限',
    };
  }
  return { limit, attributes: result };
}

function getSlotStat(slot, field, options) {
  const pools = collectEquipmentStatPools([slot], options);
  return { rate: pools.percentage[field], fusion: pools.fusion[field], fixed: pools.fixed[field] };
}

function sumSlotStats(equipment, slotNames, options) {
  const total = {
    atkRate: 0, atkFusion: 0, atkFixed: 0,
    defRate: 0, defFusion: 0, defFixed: 0,
    hpRate: 0, hpFusion: 0, hpFixed: 0,
    critical: 0,
  };
  for (const slotName of slotNames) {
    const slot = equipment?.[slotName] || {};
    const attack = getSlotStat(slot, 'atk', options);
    const defense = getSlotStat(slot, 'def', options);
    const health = getSlotStat(slot, 'HP', options);
    total.atkRate += attack.rate;
    total.atkFusion += attack.fusion;
    total.atkFixed += attack.fixed;
    total.defRate += defense.rate;
    total.defFusion += defense.fusion;
    total.defFixed += defense.fixed;
    total.hpRate += health.rate;
    total.hpFusion += health.fusion;
    total.hpFixed += health.fixed;
    total.critical += number(slot.bao);
  }
  return total;
}

function formatSlot(slotName, slot, options) {
  if (!slot?.name) return `${slotName}：无`;
  const attack = getSlotStat(slot, 'atk', options);
  const defense = getSlotStat(slot, 'def', options);
  const health = getSlotStat(slot, 'HP', options);
  const stat = (value, label) => {
    const parts = [];
    if (value.rate) parts.push(percent(value.rate, true));
    if (value.fusion) parts.push(`归一${percent(value.fusion, true)}`);
    if (value.fixed) parts.push(signedInteger(value.fixed));
    return `${label}${parts.join('') || '0'}`;
  };
  return `${slotName}【${slot.自定义名称 || slot.name}】${stat(attack, '攻')}｜${stat(defense, '防')}｜${stat(health, '血')}｜暴击${percent(slot.bao, true)}`;
}

export function calculateAllAttributeSlotBonuses(player, equipment, levels) {
  const secret = findLevel(levels?.secret, player?.mijinglevel_id) || {};
  const ancient = findLevel(levels?.ancient, player?.xiangulevel_id || 1) || {};
  const flower = findLevel(levels?.flower, player?.huafenlevel_id || 1) || {};
  const realmBase = {
    attack: number(secret.基础攻击) + number(ancient.基础攻击) + number(flower.基础攻击),
    defense: number(secret.基础防御) + number(ancient.基础防御) + number(flower.基础防御),
    health: number(secret.基础血量) + number(ancient.基础血量) + number(flower.基础血量),
  };
  const imperial = equipment?.帝兵 || {};
  let imperialScale = 0;
  if (String(imperial.author_name || '') === String(player?.id || '')) imperialScale += 1;
  if (
    SPECIAL_IMPERIAL_WEAPONS.has(imperial.name) &&
    getRealmAuthorityLevel(player) < 12
  ) {
    imperialScale += 0.1;
  } else if (!imperial.author_name) {
    imperialScale += 1;
  }

  const treasureSlot = equipment?.至宝 || {};
  const activeTreasure = getInnateTreasureProjectionName(treasureSlot) ||
    (isInnateTreasureName(treasureSlot.name) ? treasureSlot.name : '');
  const treasureScale = activeTreasure ? 1 : 0;
  const calculate = (slot, scale) => ({
    scale,
    allAttribute: number(slot?.全属性),
    attack: Math.trunc(number(slot?.全属性) * realmBase.attack * scale),
    defense: Math.trunc(number(slot?.全属性) * realmBase.defense * scale),
    health: Math.trunc(number(slot?.全属性) * realmBase.health * scale),
  });
  return {
    realmBase,
    imperial: calculate(imperial, imperialScale),
    treasure: calculate(equipment?.至宝, treasureScale),
  };
}

function wudaoContext(player) {
  const secretId = number(player?.mijinglevel_id);
  const ancientId = number(player?.xiangulevel_id);
  const isAncient = getRealmAuthorityPath(player) === 'xiangu';
  const realmId = isAncient ? ancientId : secretId;
  return {
    isAncient,
    realmId,
    rule: isAncient ? getXianguDaoRuleForRealm(realmId) : getDaoRuleForRealm(realmId),
    path: isAncient ? player?.仙古道途 : player?.道途,
  };
}

export function calculateWudaoCosts(player, context = {}) {
  const minggeEffects = context.minggeEffects || {};
  const { rule, isAncient, realmId, path } = wudaoContext(player);
  if (!rule) {
    return {
      available: false,
      completed: realmId >= 16,
      status: realmId >= 16 ? '道途已圆满' : '当前境界未开放',
      isAncient,
      realmId,
    };
  }
  if (number(path?.stages?.[rule.key]) >= rule.targetExp) {
    return {
      available: false,
      completed: true,
      status: `${rule.name}已圆满`,
      isAncient,
      realmId,
      rule,
    };
  }

  const technique = context.technique || { name: '无', bonus: 0 };
  const result = calculateWudaoResult({
    player,
    rule,
    physiqueName: player?.灵根?.name,
    aptitudeName: player?.天资等级,
    eraIndex: context.eraIndex,
    techniqueBonus: technique.bonus,
    minggeEffects,
    random: () => 0.5,
  });
  const base = getWudaoResourceCosts(player?.mijinglevel_id, player?.xiangulevel_id);
  const costTechnique = getWudaoGongfaReduction(player);
  const costMultiplier = 1 - costTechnique.rate;
  const fortune = hasRedDustFortune(player, 'question', context.now);
  const adjusted = amount => applyQuestionFortuneCost(player, Math.ceil(amount * costMultiplier), context.now);
  const lifespan = applyQuestionFortuneCost(
    player,
    Math.floor(base.lifespan * Math.max(0.5, result.lifespanMultiplier * costMultiplier)),
    context.now
  );
  return {
    available: true,
    rule,
    base,
    technique,
    costTechnique,
    fortune,
    result,
    costs: {
      potential: adjusted(base.potential),
      cultivation: adjusted(base.cultivation),
      blood: adjusted(base.blood),
      lifespan,
      spirit: adjusted(base.spirit),
    },
  };
}

export function calculatePeriodicLifespanDrain(player, difficulty) {
  if (!difficulty?.drainsLifespan) return 0;
  let drain = number(player?.level_id) > 50 ? 500 : number(player?.level_id) <= 41 ? 20 : 1000;
  const root = String(player?.灵根?.type || '');
  if (['圣体道胎', '大成圣体', '大成霸体'].includes(root)) drain = Math.floor(drain * 0.3);
  else if (['小成圣体', '小成霸体', '大道体'].includes(root)) drain = Math.floor(drain * 0.5);
  else if (root === '圣体') drain = Math.floor(drain * 0.7);
  else if (['神体', '神王体', '转生', '魔头', '魔女', '魔法少女', '魔卡少女'].includes(root)) drain = Math.floor(drain * 0.8);
  return drain;
}

function buildRealmSection(player, levels) {
  return [
    `【详细属性·${player?.名号 || player?.id || '未知修士'}】`,
    `练气：${nameOf(findLevel(levels.qi, player?.level_id))}（${number(player?.level_id)}）`,
    `炼体：${nameOf(findLevel(levels.body, player?.Physique_id))}（${number(player?.Physique_id)}）`,
    `秘境：${nameOf(findLevel(levels.secret, player?.mijinglevel_id))}（${number(player?.mijinglevel_id)}）`,
    `仙古：${nameOf(findLevel(levels.ancient, player?.xiangulevel_id || 1))}（${number(player?.xiangulevel_id || 1)}）`,
    `花粉：${nameOf(findLevel(levels.flower, player?.huafenlevel_id || 1))}（${number(player?.huafenlevel_id || 1)}）`,
    `灵根：${player?.灵根?.type || '无'}·${player?.灵根?.name || '无'}｜天资：${player?.天资等级 || '无'}`,
    `命格：${player?.命格?.name || player?.命格 || '无'}${player?.附加命格?.length ? `｜附加${player.附加命格.length}条` : ''}`,
  ].join('\n');
}

function buildCombatSection(player) {
  const daoHeart = ensureDaoHeart(player);
  return [
    '【最终战斗属性】',
    `攻击：${integer(player?.攻击)}｜防御：${integer(player?.防御)}`,
    `气血：${integer(player?.当前血量)}/${integer(player?.血量上限)}`,
    `暴击率：${percent(player?.暴击率)}｜暴击伤害：${percent(player?.暴击伤害)}｜速度：${integer(player?.速度)}`,
    `元神：${integer(player?.元神)}/${integer(player?.元神上限)}｜神识：${integer(player?.神识)}`,
    `修为：${integer(player?.修为)}｜血气：${integer(player?.血气)}｜修炼效率：${percent(player?.修炼效率提升, true)}`,
    `仙道潜力：${integer(player?.仙道潜力)}｜寿元：${integer(player?.寿元)}${number(player?.压制寿元) > 0 ? `（真实${integer(player.压制寿元)}）` : ''}`,
    `生命本源：${integer(player?.生命本源)}｜道心：${integer(daoHeart)}｜道韵：${integer(player?.道韵)}｜幸运：${percent(player?.幸运)}`,
  ].join('\n');
}

function buildResistanceSection(player) {
  const universal = number(player?.全类型减免);
  const resistance = field => Math.min(1, Math.max(0, number(player?.[field]) + universal));
  const damage = field => Math.max(0, number(player?.[field]) + number(player?.全伤害类型加成));
  return [
    '【伤害、抗性与恢复】',
    `元神伤害：${percent(damage('元神伤害加成'), true)}｜元神抗性：${percent(resistance('元神伤害减免'))}`,
    `神通伤害：${percent(damage('神通伤害加成'), true)}｜神通抗性：${percent(resistance('神通伤害减免'))}`,
    `近战伤害：${percent(damage('近战伤害加成'), true)}｜近战抗性：${percent(resistance('近战伤害减免'))}`,
    `全类型：伤害${percent(player?.全伤害类型加成, true)}｜减免${percent(universal, true)}｜额外减伤${percent(player?.减伤, true)}`,
    `闪避：${percent(player?.闪避率)}｜穿透：${percent(player?.穿透)}｜吸血：${percent(player?.吸血率)}`,
    `每回合恢复：${percent(player?.每回合恢复)}｜治疗效果：${percent(player?.治疗效果加成, true)}｜血上限：${percent(player?.血上限加成, true)}`,
    `雷系抗性：${percent(player?.雷帝效果?.当前抗性)}｜五行抗性：${player?.五行抗性 || '无'}`,
  ].join('\n');
}

function buildExtraSection(player) {
  const { limit, attributes } = calculateExtraAttributeState(player);
  const lines = [
    '【额外属性上限与稀释】',
    `当前总上限：${integer(limit.total)}（练气${integer(limit.qi)} + 炼体${integer(limit.body)} + 秘境${integer(limit.secret)}）`,
  ];
  for (const [label, value] of Object.entries(attributes)) {
    lines.push(`${label}：原始${integer(value.raw)}｜阈内${integer(value.within)}｜稀释区${integer(value.diluted)}｜${value.status}`);
  }
  lines.push('稀释区仍会最终固定加算，但不再受到灵根、装备和套装倍率放大。');
  const time = player?.光阴加成 || {};
  lines.push(`光阴豁免：攻${integer(time.攻)}｜防${integer(time.防)}｜血${integer(time.生)}（不进入阈值）`);
  return lines.join('\n');
}

function buildEquipmentSection(player, equipment, levels) {
  const options = { rebalanceOverflow: hasEquippedInnateTreasure(player, '万道神炉', '被动:1') };
  const ordinary = sumSlotStats(equipment, NORMAL_SLOT_NAMES, options);
  const late = calculateAllAttributeSlotBonuses(player, equipment, levels);
  const imperial = late.imperial;
  const treasure = late.treasure;
  return [
    '【装备加成】',
    ...NORMAL_SLOT_NAMES.map(slot => formatSlot(slot, equipment?.[slot], options)),
    `普通装备词条合计：攻${percent(ordinary.atkRate, true)}${signedInteger(ordinary.atkFixed)}｜防${percent(ordinary.defRate, true)}${signedInteger(ordinary.defFixed)}｜血${percent(ordinary.hpRate, true)}${signedInteger(ordinary.hpFixed)}｜暴击${percent(ordinary.critical, true)}`,
    `万象归一词条合计：攻${percent(ordinary.atkFusion, true)}｜防${percent(ordinary.defFusion, true)}｜血${percent(ordinary.hpFusion, true)}`,
    `百分比规则：单件每项最高+${MAX_PERCENT_EQUIPMENT_STAT * 100}%（含基础${MAX_PERCENT_EQUIPMENT_STAT + 1}倍），普通装备与归一词条多件加算无总上限。`,
    `灵根倍率：攻${percent(player?.灵根?.攻击, true)}｜防${percent(player?.灵根?.防御, true)}｜血${percent(player?.灵根?.生命, true)}`,
    '',
    '【帝兵加成】',
    formatSlot('帝兵', equipment?.帝兵, options),
    `全属性：${integer(imperial.allAttribute)} × 额外体系基础 × ${imperial.scale}｜实际攻${integer(imperial.attack)} 防${integer(imperial.defense)} 血${integer(imperial.health)}`,
    '',
    '【至宝加成】',
    formatSlot('至宝', equipment?.至宝, options),
    `当前先天至宝：${player?.当前先天至宝 || equipment?.至宝?.name || '无'}｜全属性倍率实际攻${integer(treasure.attack)} 防${integer(treasure.defense)} 血${integer(treasure.health)}`,
  ].join('\n');
}

function buildWudaoSection(player, context) {
  const report = calculateWudaoCosts(player, context);
  if (!report.available) {
    return [
      '【悟道消耗】',
      report.completed ? `${report.status}，当前悟道不再消耗资源。` : '当前境界尚未开放道途悟道，低境界使用古茶悟道旧流程。',
    ].join('\n');
  }
  const bonus = report.result.bonuses;
  const costs = report.costs;
  return [
    `【悟道消耗·${report.rule.name}】`,
    `仙道潜力${integer(costs.potential)}｜修为${integer(costs.cultivation)}｜血气${integer(costs.blood)}`,
    `寿元${integer(costs.lifespan)}｜元神${integer(costs.spirit)}｜可用寿元${integer(getAvailableLifespan(player))}`,
    `减耗功法：${report.costTechnique.name || '无'}${report.costTechnique.rate ? ` -${percent(report.costTechnique.rate)}` : ''}｜问道签：${report.fortune ? '-20%' : '未生效'}`,
    `悟道寿元命格倍率：${report.result.lifespanMultiplier.toFixed(2)}（低于1为减耗，高于1为增耗）`,
    `收益功法：${report.technique.name} ${percent(report.technique.bonus, true)}`,
    `收益来源：灵根/体质${percent(bonus.physique, true)}｜天资${percent(bonus.aptitude, true)}｜时代${percent(bonus.era, true)}｜命格${percent(bonus.mingge, true)}`,
    '灵根、天资、时代与收益功法只影响悟道收益；浑源法门、悟道寿元命格和问道签才影响本次消耗。',
  ].join('\n');
}

function buildDungeonSection(player, minggeEffects, now) {
  const skills = learnedNames(player);
  let flatMinutes = 0;
  let movement = '无';
  if (skills.includes('行字秘')) {
    flatMinutes = 2 + (number(player?.mijinglevel_id) >= 9 ? 1 : 0) + (number(player?.mijinglevel_id) >= 16 ? 1 : 0);
    movement = `行字秘 -${flatMinutes}分钟`;
  } else if (skills.includes('天璇步法')) {
    flatMinutes = 1;
    movement = '天璇步法 -1分钟';
  }
  const daofaMinutes = isDaofaActive(player, now) ? 2 : 0;
  const minggeSeconds = Math.round(getMinggeSecretPlaceReductionMs(minggeEffects) / 1000);
  const proficiency = getDungeonGongfaReduction(player);
  const treasureMultiplier = getTimedActionMultiplier(player);
  const finalMultiplier = getDungeonTimedActionMultiplier(player);
  return [
    '【副本时间减少】',
    `固定减时：${movement}｜道法仙术${daofaMinutes ? ` -${daofaMinutes}分钟` : ' 未生效'}｜命格 -${minggeSeconds}秒`,
    `功法熟练度：${proficiency.name || '无'}${proficiency.rate ? ` -${percent(proficiency.rate)}` : ''}`,
    `至宝时间倍率：${treasureMultiplier.toFixed(2)}｜副本最终时间倍率：${finalMultiplier.toFixed(2)}（总比例减少${percent(1 - finalMultiplier)}）`,
    `普通副本先减固定时间，再乘${finalMultiplier.toFixed(2)}；沉迷副本的步法/道法固定减时按次数扩大。`,
  ].join('\n');
}

function buildCostSection(player, difficulty, wudao, minggeEffects, now) {
  const tribulationBase = number(player?.mijinglevel_id) >= 10 && number(player?.mijinglevel_id) <= 15
    ? number(player.mijinglevel_id) - 9
    : 0;
  const tribulationCost = applyQuestionFortuneCost(player, tribulationBase, now);
  const drain = calculatePeriodicLifespanDrain(player, difficulty);
  return [
    '【仙道潜力与寿元消耗】',
    `当前仙道潜力：${integer(player?.仙道潜力)}`,
    `下次练气突破：${integer(getBreakthroughPotentialCost(player?.level_id))}｜下次炼体突破：${integer(getBreakthroughPotentialCost(player?.Physique_id))}`,
    `当前遮天渡劫/证道：${tribulationBase ? `${integer(tribulationCost)}（基础${integer(tribulationBase)}）` : '当前境界无固定项'}｜悟道：${wudao.available ? integer(wudao.costs.potential) : wudao.status}`,
    `命格潜力修正：收益${percent(minggeEffects?.仙道潜力收益, true)}｜消耗减少${percent(minggeEffects?.仙道潜力消耗减少)}｜消耗增加${percent(minggeEffects?.仙道潜力消耗增加)}`,
    '普通练气/炼体突破按固定潜力值结算；悟道潜力只受减耗功法与问道签影响。',
    `往生难度：${difficulty?.name || '简单'}｜每3小时寿元流逝：${integer(drain)}${difficulty?.reincarnatesOnExhaustion ? '｜耗尽进入轮回' : ''}`,
    `当前可用寿元：${integer(getAvailableLifespan(player))}｜本次悟道寿元：${wudao.available ? integer(wudao.costs.lifespan) : wudao.status}｜副本入场寿元按地点配置结算`,
  ].join('\n');
}

function compactNumber(value) {
  const amount = Math.abs(number(value));
  const units = [
    [1e16, '京'],
    [1e12, '万亿'],
    [1e8, '亿'],
    [1e4, '万'],
  ];
  for (const [base, unit] of units) {
    if (amount < base) continue;
    return {
      value: (number(value) / base).toFixed(2).replace(/\.00$/, ''),
      unit,
    };
  }
  return { value: integer(value), unit: '' };
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(number(totalSeconds)));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function formatLooseValue(value) {
  if (value === undefined || value === null || value === '') return '无';
  if (Array.isArray(value)) return value.filter(Boolean).join(' / ') || '无';
  if (typeof value === 'object') {
    const parts = Object.entries(value)
      .filter(([, entry]) => entry !== undefined && entry !== null && entry !== false && entry !== '')
      .map(([key, entry]) => entry === true ? key : `${key}${entry}`);
    return parts.join(' / ') || '无';
  }
  return String(value);
}

function formatSlotValue(stat) {
  const parts = [];
  if (stat.rate) parts.push(percent(stat.rate, true));
  if (stat.fusion) parts.push(`归一 ${percent(stat.fusion, true)}`);
  if (stat.fixed) parts.push(signedInteger(stat.fixed));
  return parts.join(' / ') || '0';
}

function equipmentSlotView(slotName, slot, options) {
  const attack = getSlotStat(slot, 'atk', options);
  const defense = getSlotStat(slot, 'def', options);
  const health = getSlotStat(slot, 'HP', options);
  return {
    slot: slotName,
    name: slot?.自定义名称 || slot?.name || '未装备',
    primary: `攻击 ${formatSlotValue(attack)}`,
    secondary: `防御 ${formatSlotValue(defense)}`,
    note: `气血 ${formatSlotValue(health)} · 暴击 ${percent(slot?.bao, true)}`,
  };
}

function attributeContext({ player, data, eraIndex, now }) {
  const levels = {
    qi: data?.Level_list,
    body: data?.LevelMax_list,
    secret: data?.Levelmijing_list,
    ancient: data?.xiangujinshi_list,
    flower: data?.huafen_list,
  };
  const minggeEffects = getMinggeEffects(player, data?.minggeList);
  const technique = getTechniqueWudaoProfile(player?.学习的功法, {
    gongfaList: data?.gongfa_list,
    timeGongfaList: data?.timegongfa_list,
    dijingList: data?.dijingList,
  });
  const wudaoContextData = { minggeEffects, technique, eraIndex, now };
  return {
    levels,
    minggeEffects,
    technique,
    wudaoContextData,
    wudao: calculateWudaoCosts(player, wudaoContextData),
  };
}

export function buildPlayerAttributeView({ player, equipment, data, eraIndex = 2, difficulty, now = Date.now() }) {
  const daoHeart = ensureDaoHeart(player, now);
  const context = attributeContext({ player, data, eraIndex, now });
  const { levels, minggeEffects, technique, wudao } = context;
  const extra = calculateExtraAttributeState(player);
  const options = { rebalanceOverflow: hasEquippedInnateTreasure(player, '万道神炉', '被动:1') };
  const ordinary = sumSlotStats(equipment, NORMAL_SLOT_NAMES, options);
  const allAttribute = calculateAllAttributeSlotBonuses(player, equipment, levels);
  const universalReduction = number(player?.全类型减免);
  const universalDamage = number(player?.全伤害类型加成);
  const resistance = field => Math.min(1, Math.max(0, number(player?.[field]) + universalReduction));
  const damage = field => Math.max(0, number(player?.[field]) + universalDamage);
  const power = compactNumber(
    (number(player?.攻击) + number(player?.防御) * 0.8 + number(player?.血量上限) * 0.6) *
    (number(player?.暴击率) + 1)
  );
  const maxHealth = number(player?.血量上限);
  const currentHealth = number(player?.当前血量);
  const healthPercent = maxHealth > 0 ? Math.min(100, Math.max(0, currentHealth / maxHealth * 100)) : 0;
  const mainFate = typeof player?.命格 === 'object' ? player.命格 : { name: player?.命格 };
  const additionalFates = Array.isArray(player?.附加命格)
    ? player.附加命格.map(item => item?.name || item).filter(Boolean)
    : [];

  const skills = learnedNames(player);
  let movementMinutes = 0;
  let movementName = '无步法减时';
  if (skills.includes('行字秘')) {
    movementMinutes = 2 + (number(player?.mijinglevel_id) >= 9 ? 1 : 0) + (number(player?.mijinglevel_id) >= 16 ? 1 : 0);
    movementName = `行字秘 ${movementMinutes}分`;
  } else if (skills.includes('天璇步法')) {
    movementMinutes = 1;
    movementName = '天璇步法 1分';
  }
  const daofaMinutes = isDaofaActive(player, now) ? 2 : 0;
  const minggeSeconds = Math.round(getMinggeSecretPlaceReductionMs(minggeEffects) / 1000);
  const proficiency = getDungeonGongfaReduction(player);
  const treasureMultiplier = getTimedActionMultiplier(player);
  const finalTimeMultiplier = getDungeonTimedActionMultiplier(player);
  const baseDungeonSeconds = 3600;
  const fixedReductionSeconds = movementMinutes * 60 + daofaMinutes * 60 + minggeSeconds;
  const finalDungeonSeconds = Math.max(0, baseDungeonSeconds - fixedReductionSeconds) * finalTimeMultiplier;

  const tribulationBase = number(player?.mijinglevel_id) >= 10 && number(player?.mijinglevel_id) <= 15
    ? number(player.mijinglevel_id) - 9
    : 0;
  const tribulationCost = applyQuestionFortuneCost(player, tribulationBase, now);
  const periodicDrain = calculatePeriodicLifespanDrain(player, difficulty);
  const availableLifespan = getAvailableLifespan(player);

  const limitRows = Object.entries(extra.attributes).map(([label, value]) => {
    const over = value.diluted > 0;
    const withinPercent = extra.limit.total <= 0
      ? 0
      : over
        ? value.within / Math.max(1, value.raw) * 100
        : value.raw / extra.limit.total * 100;
    const dilutedPercent = over ? value.diluted / Math.max(1, value.raw) * 100 : 0;
    return {
      label: `${label}加成`,
      raw: integer(value.raw),
      within: `阈内 ${integer(value.within)}`,
      remainder: over ? `稀释 ${integer(value.diluted)}` : `余量 ${integer(extra.limit.total - value.within)}`,
      withinPercent: Math.min(100, Math.max(0, withinPercent)).toFixed(2),
      dilutedPercent: Math.min(100, Math.max(0, dilutedPercent)).toFixed(2),
      status: value.status,
      tone: over ? 'is-over' : value.raw === extra.limit.total ? 'is-max' : '',
    };
  });

  const artifactView = (kind, slot, calculated, status) => ({
    kind,
    name: slot?.自定义名称 || slot?.name || '未装备',
    subtitle: slot?.品阶 || slot?.pinji || (slot?.name ? '已装备' : '当前槽位为空'),
    status,
    stats: [
      { label: '全属性', value: integer(calculated.allAttribute) },
      { label: '实际攻击', value: signedInteger(calculated.attack) },
      { label: '实际防御', value: signedInteger(calculated.defense) },
      { label: '实际气血', value: signedInteger(calculated.health) },
    ],
  });

  const wudaoAvailable = Boolean(wudao.available);
  const wudaoBonuses = wudaoAvailable ? wudao.result.bonuses : {};
  const resourceMultiplier = wudaoAvailable
    ? (1 - number(wudao.costTechnique?.rate)) * (wudao.fortune ? 0.8 : 1)
    : 1;
  const wudaoStatus = wudaoAvailable ? wudao.rule.name : wudao.status;

  return {
    identity: {
      name: player?.名号 || player?.id || '未知修士',
      subtitle: [
        [player?.势力, player?.势力职位].filter(Boolean).join(' · '),
        number(player?.轮回次数) > 0 ? `轮回第${integer(player.轮回次数)}世` : '',
        `道途「${wudaoStatus || '未启'}」`,
      ].filter(Boolean).join(' · '),
      archive: `档案编号 ${player?.id || '未知'}`,
    },
    power,
    realms: [
      { label: '练气', name: nameOf(findLevel(levels.qi, player?.level_id)), note: `境界序列 ${integer(player?.level_id)}` },
      { label: '炼体', name: nameOf(findLevel(levels.body, player?.Physique_id)), note: `体魄序列 ${integer(player?.Physique_id)}` },
      { label: '秘境', name: nameOf(findLevel(levels.secret, player?.mijinglevel_id)), note: `秘境序列 ${integer(player?.mijinglevel_id)}` },
      { label: '仙古', name: nameOf(findLevel(levels.ancient, player?.xiangulevel_id || 1)), note: `今世法序列 ${integer(player?.xiangulevel_id || 1)}` },
      { label: '花粉', name: nameOf(findLevel(levels.flower, player?.huafenlevel_id || 1)), note: `进化序列 ${integer(player?.huafenlevel_id || 1)}` },
    ],
    primaryStats: [
      { label: '攻击', value: integer(player?.攻击), note: `额外加成 ${signedInteger(player?.攻击加成)}` },
      { label: '防御', value: integer(player?.防御), note: `额外加成 ${signedInteger(player?.防御加成)}` },
      { label: '气血', value: integer(maxHealth), note: `当前 ${integer(currentHealth)} · ${healthPercent.toFixed(2)}%` },
    ],
    secondaryStats: [
      { label: '暴击率', value: percent(player?.暴击率), note: `暴伤 ${percent(player?.暴击伤害)}` },
      { label: '速度', value: integer(player?.速度), note: `闪避 ${percent(player?.闪避率)}` },
      { label: '元神', value: integer(player?.元神), note: `上限 ${integer(player?.元神上限)}` },
      { label: '神识', value: integer(player?.神识), note: `穿透 ${percent(player?.穿透)}` },
      { label: '修炼效率', value: percent(player?.修炼效率提升, true), note: `${player?.灵根?.name || '无灵根'} · ${player?.天资等级 || '无天资'}` },
      { label: '生命本源', value: integer(player?.生命本源), note: `道心 ${integer(daoHeart)}` },
    ],
    extra: {
      total: integer(extra.limit.total),
      summary: `练气 ${integer(extra.limit.qi)} + 炼体 ${integer(extra.limit.body)} + 秘境 ${integer(extra.limit.secret)}`,
      rows: limitRows,
      exemption: `光阴豁免：攻 ${signedInteger(player?.光阴加成?.攻)} · 防 ${signedInteger(player?.光阴加成?.防)} · 血 ${signedInteger(player?.光阴加成?.生)}，不进入阈值`,
    },
    equipment: {
      slots: NORMAL_SLOT_NAMES.map(slotName => equipmentSlotView(slotName, equipment?.[slotName], options)),
      total: `攻 ${percent(ordinary.atkRate, true)} / ${signedInteger(ordinary.atkFixed)} · 防 ${percent(ordinary.defRate, true)} / ${signedInteger(ordinary.defFixed)} · 血 ${percent(ordinary.hpRate, true)} / ${signedInteger(ordinary.hpFixed)} · 暴击 ${percent(ordinary.critical, true)}`,
      fusion: `攻 ${percent(ordinary.atkFusion, true)} · 防 ${percent(ordinary.defFusion, true)} · 血 ${percent(ordinary.hpFusion, true)} · 单件每项最高 +${MAX_PERCENT_EQUIPMENT_STAT * 100}%（含基础${MAX_PERCENT_EQUIPMENT_STAT + 1}倍） · 多件加算无总上限`,
      imperial: {
        ...artifactView('帝兵', equipment?.帝兵, allAttribute.imperial, `归属倍率 ${allAttribute.imperial.scale.toFixed(2)}×`),
        note: `${integer(allAttribute.imperial.allAttribute)} × 额外体系基础 × ${allAttribute.imperial.scale.toFixed(2)}，按当前归属与境界结算。`,
      },
      treasure: {
        ...artifactView('至宝', equipment?.至宝, allAttribute.treasure, player?.当前先天至宝 ? '先天投影已激活' : '按当前槽位结算'),
        note: `时间倍率 ${treasureMultiplier.toFixed(2)}×，当前先天至宝：${player?.当前先天至宝 || '无'}。`,
      },
    },
    resistance: {
      universalDamage: percent(universalDamage, true),
      universalReduction: percent(universalReduction, true),
      rows: [
        ['神通抗性', '神通伤害减免'],
        ['元神抗性', '元神伤害减免'],
        ['近战抗性', '近战伤害减免'],
        ['雷系抗性', null],
      ].map(([label, field]) => {
        const base = field ? number(player?.[field]) : number(player?.雷帝效果?.当前抗性);
        const value = field ? resistance(field) : Math.min(1, Math.max(0, base));
        return {
          label,
          value: percent(value),
          width: (value * 100).toFixed(2),
          note: field ? `本体 ${percent(base)} + 全减免 ${percent(universalReduction)}` : '雷帝效果 · 独立结算',
        };
      }),
      matrix: [
        { label: '神通伤害', value: percent(damage('神通伤害加成'), true), note: `本体 ${percent(player?.神通伤害加成, true)} + 全伤 ${percent(universalDamage, true)}` },
        { label: '元神伤害', value: percent(damage('元神伤害加成'), true), note: `本体 ${percent(player?.元神伤害加成, true)} + 全伤 ${percent(universalDamage, true)}` },
        { label: '近战伤害', value: percent(damage('近战伤害加成'), true), note: `本体 ${percent(player?.近战伤害加成, true)} + 全伤 ${percent(universalDamage, true)}` },
        { label: '五行抗性', value: formatLooseValue(player?.五行抗性), note: '按属性克制独立判定' },
        { label: '每回合恢复', value: percent(player?.每回合恢复), note: `治疗效果 ${percent(player?.治疗效果加成, true)}` },
        { label: '吸血 / 减伤', value: `${percent(player?.吸血率)} / ${percent(player?.减伤)}`, note: '独立乘区' },
      ],
    },
    wudao: {
      available: wudaoAvailable,
      name: wudaoStatus || '当前境界未开放',
      gainMultiplier: wudaoAvailable ? `${wudao.result.multiplier.toFixed(2)}×` : '未开放',
      status: wudaoAvailable ? '本次实际消耗' : wudaoStatus,
      mainCosts: [
        { label: '仙道潜力', value: wudaoAvailable ? integer(wudao.costs.potential) : '--' },
        { label: '寿元', value: wudaoAvailable ? `${integer(wudao.costs.lifespan)} 年` : '--' },
      ],
      subCosts: wudaoAvailable
        ? [`修为 ${integer(wudao.costs.cultivation)}`, `血气 ${integer(wudao.costs.blood)}`, `元神 ${integer(wudao.costs.spirit)}`]
        : ['当前境界无道途资源消耗'],
      costMultiplier: `${resourceMultiplier.toFixed(2)}×`,
      costFactors: [
        { name: wudaoAvailable ? wudao.costTechnique.name || '无减耗功法' : '无减耗功法', source: '功法熟练度减耗', value: wudaoAvailable && wudao.costTechnique.rate ? `-${percent(wudao.costTechnique.rate)}` : '0%' },
        { name: '问道签', source: '红尘仙缘签', value: wudaoAvailable && wudao.fortune ? '-20%' : '未生效' },
        { name: '悟道寿元命格', source: '仅影响寿元', value: wudaoAvailable ? `${wudao.result.lifespanMultiplier.toFixed(2)}×` : '1.00×' },
      ],
      gainFactors: [
        { name: player?.灵根?.name || '无灵根', source: '灵根 / 体质', value: percent(wudaoBonuses.physique, true) },
        { name: player?.天资等级 || '无天资', source: '天资等级', value: percent(wudaoBonuses.aptitude, true) },
        { name: technique.name || '无收益功法', source: '收益功法', value: percent(wudaoBonuses.technique, true) },
        { name: wudaoAvailable ? wudao.result.era.name : '当前时代', source: '时代增益', value: percent(wudaoBonuses.era, true) },
        { name: mainFate?.name || '无命格', source: '悟道收益命格', value: percent(wudaoBonuses.mingge, true) },
      ],
    },
    dungeon: {
      result: formatDuration(finalDungeonSeconds),
      stages: [
        { label: '原始时间', value: '60:00', note: '地点基础值', operator: '−' },
        { label: '固定减时', value: formatDuration(fixedReductionSeconds), note: `${movementName} · 道法 ${daofaMinutes}分 · 命格 ${minggeSeconds}秒`, operator: '×' },
        { label: '比例倍率', value: finalTimeMultiplier.toFixed(3), note: `熟练度 ${(1 - number(proficiency.rate)).toFixed(2)} × 至宝 ${treasureMultiplier.toFixed(2)}`, operator: '=' },
        { label: '最终用时', value: formatDuration(finalDungeonSeconds), note: `总计减少 ${percent(1 - finalDungeonSeconds / baseDungeonSeconds)}`, result: true },
      ],
    },
    resources: {
      potential: integer(player?.仙道潜力),
      potentialNote: `命格收益 ${percent(minggeEffects?.仙道潜力收益, true)} · 消耗减少 ${percent(minggeEffects?.仙道潜力消耗减少)} · 消耗增加 ${percent(minggeEffects?.仙道潜力消耗增加)}`,
      lifespan: integer(player?.寿元),
      availableLifespan: integer(availableLifespan),
      lifespanNote: number(player?.压制寿元) > 0 ? `当前显示寿元 ${integer(player?.寿元)} · 真实可用 ${integer(availableLifespan)}` : `当前全部可用 ${integer(availableLifespan)}`,
      difficulty: difficulty?.name || '简单',
      expenses: [
        { label: '下次练气突破', value: `潜力 -${integer(getBreakthroughPotentialCost(player?.level_id))}`, note: '固定结算' },
        { label: '下次炼体突破', value: `潜力 -${integer(getBreakthroughPotentialCost(player?.Physique_id))}`, note: '固定结算' },
        { label: '当前悟道', value: wudaoAvailable ? `潜力 -${integer(wudao.costs.potential)}` : wudaoStatus, note: wudaoAvailable ? '已计减耗' : '当前无消耗' },
        { label: '遮天渡劫 / 证道', value: tribulationBase ? `潜力 -${integer(tribulationCost)}` : '当前无固定项', note: tribulationBase ? `基础 ${integer(tribulationBase)}` : '境界未进入结算段' },
        { label: `往生难度 · ${difficulty?.name || '简单'}`, value: `寿元 -${integer(periodicDrain)}`, note: difficulty?.drainsLifespan ? '每 3 小时' : '当前难度不流逝' },
        { label: '当前悟道', value: wudaoAvailable ? `寿元 -${integer(wudao.costs.lifespan)}` : wudaoStatus, note: wudaoAvailable ? `命格倍率 ${wudao.result.lifespanMultiplier.toFixed(2)}` : '当前无消耗' },
      ],
    },
    origins: [
      { label: '灵根', value: [player?.灵根?.type, player?.灵根?.name].filter(Boolean).join(' · ') || '无', note: `攻 ${percent(player?.灵根?.攻击, true)} · 防 ${percent(player?.灵根?.防御, true)} · 血 ${percent(player?.灵根?.生命, true)}` },
      { label: '主命格', value: [mainFate?.rarityName, mainFate?.name].filter(Boolean).join(' · ') || '无', note: `悟道寿元 ${wudaoAvailable ? wudao.result.lifespanMultiplier.toFixed(2) : '1.00'}× · 潜力收益 ${percent(minggeEffects?.仙道潜力收益, true)}` },
      { label: '附加命格', value: additionalFates.join(' / ') || '无', note: `秘境固定减时 ${minggeSeconds}秒 · 悟道收益 ${percent(minggeEffects?.悟道收益, true)}` },
      { label: '道基', value: `元神 ${integer(player?.元神)} / ${integer(player?.元神上限)}`, note: `道心 ${integer(daoHeart)} · 道韵 ${integer(player?.道韵)} · 幸运 ${percent(player?.幸运)}` },
    ],
  };
}

export function buildPlayerAttributeReport({ player, equipment, data, eraIndex = 2, difficulty, now = Date.now() }) {
  const { levels, minggeEffects, wudaoContextData, wudao } = attributeContext({
    player,
    data,
    eraIndex,
    now,
  });
  return [
    buildRealmSection(player, levels),
    buildCombatSection(player),
    buildResistanceSection(player),
    buildExtraSection(player),
    buildEquipmentSection(player, equipment, levels),
    buildWudaoSection(player, wudaoContextData),
    buildDungeonSection(player, minggeEffects, now),
    buildCostSection(player, difficulty, wudao, minggeEffects, now),
  ];
}
