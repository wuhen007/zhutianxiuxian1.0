import { hasRealmAuthority } from './realmAuthority.js';

export const DARK_TRIAD_NAMES = Object.freeze(['苍帝', '鸿帝', '羽帝']);
export const TIME_RIVER_ATTRIBUTE_RANGE = Object.freeze([1.5, 3]);
export const DARK_TRIAD_REVIVAL_LIMIT = 1;
export const DARK_TRIAD_OPENING_SHIELD_RATE = 0.35;
export const DARK_TRIAD_DAMAGE_REDUCTION = 0.3;
export const CANG_EMPEROR_ATTRIBUTE_RATE = 0.8;
export const CANG_EMPEROR_SUPPRESSION_ACTIONS = 2;
export const TIME_RIVER_PHASE_DURATION_MS = 15 * 60 * 1000;
export const TIME_RIVER_RESCUE_WINDOW_MS = 10 * 60 * 1000;
// 时间长河敌人速度改为定值，不再随玩家境界/倍率浮动
export const TIME_RIVER_BASE_SPEED = 1150;
export const TIME_RIVER_PEAK_SPEED = 1250;
export const TIME_RIVER_PEAK_SPEED_NAMES = Object.freeze(['荒天帝', '叶天帝', '狠人大帝', '尸骸仙帝']);
const TIME_RIVER_SPEED_NAME_ALIAS = Object.freeze({ 狠人: '狠人大帝' });
export const TIME_RIVER_REVIVAL_TAUNTS = Object.freeze([
  '羽帝喝吼：“{player}，你能挣扎到几时！？”',
  '苍帝冷幽幽地说道：“你的确很强，但是，等若跟三个自己血战，你能胜出吗？谁都无法逆天！”',
  '鸿帝冷漠地说道：“望穿古今未来，谁还能与我等比肩，来此一战？你注定是一个失败者！”',
]);

export const TIME_RIVER_COUNTER_SKILLS = Object.freeze([
  '他化自在法',
  '一气化三清',
  '皆字秘',
  '临字秘',
  '数字秘',
  '组字秘',
  '前字秘',
  '行字秘',
  '斗字秘',
  '者字秘',
  '兵字秘',
]);

export const TIME_RIVER_ADVERSARY_PROFILES = Object.freeze({
  叶天帝: Object.freeze({
    id: 'ye-tiandi',
    counter: false,
    era: '后荒古时代',
  }),
  荒天帝: Object.freeze({
    id: 'huang-tiandi',
    counter: true,
    era: '乱古纪元',
  }),
  苍帝: Object.freeze({
    id: 'cang-tiandi',
    counter: true,
    era: '帝落时代',
    reinforcements: Object.freeze(['鸿帝', '羽帝']),
  }),
  鸿帝: Object.freeze({
    id: 'hong-tiandi',
    counter: true,
    era: '仙古纪元',
  }),
  羽帝: Object.freeze({
    id: 'yu-tiandi',
    counter: true,
    era: '乱古纪元',
  }),
  尸骸仙帝: Object.freeze({
    id: 'corpse-immortal-emperor',
    counter: true,
    era: '终极古地',
  }),
});

export const TIME_RIVER_SKILL_LIBRARY = Object.freeze([
  {
    name: '祭天祭地祭英灵',
    class: '功法',
    pr: 0.2,
    cnt: -1,
    beilv: 20,
    other: 0,
    不可防御: 1,
    msg1: '祭天、祭地、祭英灵！苍茫古史中无数残魂回应祭礼，黑暗祭光贯穿时间长河！',
    msg2: '被祭礼之光锁定，道果与肉身同时承受无法回避的二十倍轰击！',
    攻击类型: '元神',
    稀有度: 10,
  },
  {
    name: '鸿帝死咒·泄帝势',
    class: '功法',
    pr: 0.34,
    cnt: -1,
    beilv: 1,
    other: 0,
    时间长河效果: '剥落无敌气魄',
    时间长河速度: 200,
    msg1: '鸿帝身后一望无际的古国突兀浮现，死咒言出即法，冥冥天机搅乱乾坤！',
    msg2: '磅礴无敌的气势被死咒撕开，盖世帝威不断外泄，攻、防与生命同时削减五成！',
    攻击类型: '神通',
    稀有度: 10,
  },
  {
    name: '苍帝无敌拳印',
    class: '功法',
    pr: 0.24,
    cnt: -1,
    beilv: 12,
    other: 0,
    不可防御: 1,
    msg1: '苍帝断喝，灰发披散，宏大的拳意挤碎天宇，万物凋零；拳印打破万古诸天，踏着岁月河流狂暴轰来！',
    msg2: '无敌气势被泄之际，这一拳正中道果，震得手臂发麻、帝躯踉跄！',
    攻击类型: '近战',
    稀有度: 10,
  },
  {
    name: '祭灭万物',
    class: '功法',
    pr: 0.1,
    cnt: -1,
    beilv: 25,
    other: 0,
    不可防御: 1,
    控制: 1,
    msg1: '祭灭万物！苍帝抬手祭尽诸天万象，黑暗火光将古今未来压成一线！',
    msg2: '被祭灭之力钉死于岁月源头，神魂与肉身同时崩解，复生印记剧烈震荡！',
    攻击类型: '元神',
    稀有度: 10,
  },
]);

export const CORPSE_EMPEROR_SKILL_NAMES = Object.freeze([
  '真龙宝术', '真凰宝术', '鲲鹏宝术', '雷帝宝术', '麒麟宝术',
  '天角蚁宝术', '蛄之宝术', '九幽獓宝术', '打神石宝术', '草字剑诀',
  '原始真解终极篇', '平乱诀', '终极帝剑斩杀',
]);

export const CORPSE_EMPEROR_SKILL_LIBRARY = Object.freeze([
  ...CORPSE_EMPEROR_SKILL_NAMES.slice(0, 10).map((name, index) => ({
    name,
    class: '功法',
    pr: 0.16,
    cnt: -1,
    beilv: 4 + index * 0.25,
    other: 0,
    msg1: `尸骸仙帝抬手演化${name}，十凶符文照亮终极古地！`,
    msg2: '古老宝术贯穿仙帝场域，肉身与元神同时震颤！',
    攻击类型: '神通',
    稀有度: 10,
  })),
  {
    name: '原始真解终极篇',
    class: '功法',
    pr: 0.14,
    cnt: -1,
    beilv: 8,
    other: 0,
    msg1: '尸骸仙帝诵出原始真解终极篇，诸天最本源的符文在掌指间生灭！',
    msg2: '万法被还原至最初形态，仙帝符文自源头轰入道果！',
    攻击类型: '元神',
    稀有度: 10,
  },
  {
    name: '平乱诀',
    class: '功法',
    pr: 0.13,
    cnt: -1,
    beilv: 10,
    other: 0,
    msg1: '尸骸仙帝眉心帝光凝剑，平乱诀化作元神剑胎横扫古今！',
    msg2: '元神剑胎无视岁月阻隔，径直斩向识海与道果！',
    攻击类型: '元神',
    稀有度: 10,
  },
  {
    name: '终极帝剑斩杀',
    class: '功法',
    pr: 0.12,
    cnt: -1,
    beilv: 15,
    other: 0,
    不可复活: 1,
    msg1: '尸骸仙帝拔出大罗剑胎，终极帝剑横断万古诸天！',
    msg2: '剑光将肉身与元神一并劈开，复生印记随亿万血雨洒落无尽时空！',
    攻击类型: '元神',
    稀有度: 10,
  },
]);

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(value, fallback = 1) {
  return Math.max(1, Math.trunc(number(value, fallback)));
}

function randomInt(min, max, random) {
  const roll = Math.min(0.999999999, Math.max(0, number(random(), 0)));
  return Math.floor(roll * (max - min + 1)) + min;
}

function timeRiverUnitSpeed(unit) {
  if (unit?._忽略境界速度加成) return integer(unit?.速度, 100);
  return integer(
    number(unit?.速度, 100)
    + number(unit?.mijinglevel_id) * 50
    + number(unit?.xiangulevel_id) * 50
    + Math.max(0, number(unit?.huafenlevel_id, 1) - 1) * 50,
  );
}

export function normalizeTimeRiverSpeedName(name) {
  if (name && typeof name === 'object') {
    name = name.名号 || name.name || name._时间长河身份 || '';
  }
  const raw = String(name || '').trim();
  return TIME_RIVER_SPEED_NAME_ALIAS[raw] || raw;
}

export function getTimeRiverFixedSpeed(name) {
  return TIME_RIVER_PEAK_SPEED_NAMES.includes(normalizeTimeRiverSpeedName(name))
    ? TIME_RIVER_PEAK_SPEED
    : TIME_RIVER_BASE_SPEED;
}

export function rollTimeRiverAttributeMultiplier(random = Math.random) {
  const roll = Math.min(1, Math.max(0, number(random(), 0)));
  const [min, max] = TIME_RIVER_ATTRIBUTE_RANGE;
  return Math.round((min + (max - min) * roll) * 100) / 100;
}

export function applyTimeRiverSacrificeBuff(combatant, ratio = 0) {
  const bonus = Math.max(0, number(ratio));
  if (!bonus) {
    combatant.当前血量 = combatant.血量上限;
    return combatant;
  }
  const multiplier = 1 + bonus;
  combatant.攻击 = integer(number(combatant.攻击) * multiplier);
  combatant.防御 = integer(number(combatant.防御) * multiplier);
  combatant.血量上限 = integer(number(combatant.血量上限) * multiplier);
  combatant.当前血量 = combatant.血量上限;
  combatant.速度 = integer(timeRiverUnitSpeed(combatant) * multiplier);
  combatant._忽略境界速度加成 = true;
  return combatant;
}

export function applyDarkTriadBattleKit(combatant) {
  if (!isDarkTriadEmperor(combatant?.名号)) return combatant;
  combatant._时间长河黑暗三帝 = true;
  combatant._时间长河复活上限 = DARK_TRIAD_REVIVAL_LIMIT;
  combatant._时间长河复活次数已用 = Math.max(0, Math.trunc(number(combatant._时间长河复活次数已用)));
  combatant.护盾值 = Math.max(
    Math.max(0, Math.trunc(number(combatant.护盾值))),
    Math.trunc(number(combatant.血量上限) * DARK_TRIAD_OPENING_SHIELD_RATE),
  );
  combatant._持续减伤比例 = Math.max(number(combatant._持续减伤比例), DARK_TRIAD_DAMAGE_REDUCTION);
  combatant._持续减伤回合 = Math.max(Math.trunc(number(combatant._持续减伤回合)), 6);
  return combatant;
}

export function tryDarkTriadRevival(combatant) {
  if (!combatant?._时间长河黑暗三帝 || number(combatant.当前血量) > 0) {
    return { revived: false };
  }
  const used = Math.max(0, Math.trunc(number(combatant._时间长河复活次数已用)));
  const limit = Math.max(0, Math.trunc(number(combatant._时间长河复活上限, DARK_TRIAD_REVIVAL_LIMIT)));
  if (used >= limit) return { revived: false };

  combatant._时间长河复活次数已用 = used + 1;
  combatant.当前血量 = Math.max(1, number(combatant.血量上限));
  combatant.护盾值 = Math.trunc(number(combatant.血量上限) * 0.25);
  combatant._护盾值 = combatant.护盾值;
  combatant._持续减伤比例 = DARK_TRIAD_DAMAGE_REDUCTION;
  combatant._持续减伤回合 = Math.max(Math.trunc(number(combatant._持续减伤回合)), 3);

  return {
    revived: true,
    used: combatant._时间长河复活次数已用,
    remaining: limit - combatant._时间长河复活次数已用,
    message: `【黑暗帝血·归来】${combatant.名号}自古史尽头满血复生，但控制与负面状态仍烙印在帝躯之上！本场尚余${limit - combatant._时间长河复活次数已用}次复生。`,
  };
}

export function applyCangEmperorOpeningSuppression(combatant) {
  if (!combatant || combatant._苍帝精气神压制) return { applied: false };
  const divineEmbryoQuasiEmperor = hasRealmAuthority(combatant, 20)
    && combatant?.己道推演?.divineEmbryo === '已结出';
  if (divineEmbryoQuasiEmperor || hasRealmAuthority(combatant, 21)) {
    return {
      applied: false,
      immune: true,
      message: `【神胎不朽】${combatant.名号}己道神胎自成一体，苍帝消解精气神的手段毫无作用！`,
    };
  }
  for (const field of ['攻击', '防御', '血量上限', '当前血量']) {
    combatant[field] = integer(number(combatant[field]) * CANG_EMPEROR_ATTRIBUTE_RATE);
  }
  combatant._苍帝精气神压制 = {
    remainingActions: CANG_EMPEROR_SUPPRESSION_ACTIONS,
  };
  return {
    applied: true,
    message: `【苍帝·一念消神】苍帝开场消解精气神，${combatant.名号}前两次行动攻击、防御与生命暂降20%！`,
  };
}

export function tickCangEmperorOpeningSuppression(combatant) {
  const state = combatant?._苍帝精气神压制;
  if (!state) return { restored: false };
  if (state.remainingActions > 0) {
    state.remainingActions -= 1;
    return { restored: false, remainingActions: state.remainingActions };
  }

  for (const field of ['攻击', '防御', '血量上限', '当前血量']) {
    combatant[field] = integer(number(combatant[field]) / CANG_EMPEROR_ATTRIBUTE_RATE);
  }
  combatant.当前血量 = Math.min(combatant.当前血量, combatant.血量上限);
  delete combatant._苍帝精气神压制;
  return {
    restored: true,
    message: `【精气神复归】${combatant.名号}挣脱苍帝压制，攻击、防御与生命恢复！`,
  };
}

export function isDarkTriadEmperor(name) {
  return DARK_TRIAD_NAMES.includes(String(name || '').trim());
}

export function rollTimeRiverEraReward(outcome, random = Math.random) {
  return outcome === 'victory' ? randomInt(3, 5, random) : randomInt(1, 2, random);
}

export function rollDarkTriadContinuation(random = Math.random) {
  if (number(random(), 1) >= 0.3) return { summoned: false, imperialPill: false, reward: 0 };
  const imperialPill = number(random(), 1) < 0.5;
  return { summoned: true, imperialPill, reward: imperialPill ? 30 : 10 };
}

export function scaleTimeRiverAdversary(enemy, ratio = 0.7) {
  const scale = Math.max(0, number(ratio, 0.7));
  const result = { ...enemy };
  for (const field of ['攻击', '防御', '血量上限', '速度']) {
    result[field] = integer(number(enemy?.[field]) * scale);
  }
  if (number(enemy?.护盾值) > 0) result.护盾值 = Math.round(number(enemy.护盾值) * scale);
  result.当前血量 = result.血量上限;
  result._时间长河恢复比例 = scale;
  return result;
}

export function getTimeRiverSacrificeRecovery(player) {
  const mijing = integer(player?.mijinglevel_id, 1);
  const xiangu = integer(player?.xiangulevel_id, 1);
  const huafen = integer(player?.huafenlevel_id, 1);
  const candidates = [
    { path: 'mijing', level: mijing, tiers: [[20, 0.75, '帝光仙王及以上'], [19, 0.5, '仙王巨头'], [18, 0.35, '仙王'], [17, 0.15, '红尘仙']] },
    { path: 'xiangu', level: xiangu, tiers: [[20, 0.75, '帝光仙王及以上'], [19, 0.5, '仙王巨头'], [17, 0.35, '仙王'], [16, 0.15, '真仙']] },
    { path: 'huafen', level: huafen, tiers: [[21, 0.75, '帝光仙王及以上'], [20, 0.5, '仙王巨头'], [19, 0.35, '仙王'], [17, 0.15, '大宇/究极']] },
  ].map(candidate => {
    const tier = candidate.tiers.find(([required]) => candidate.level >= required);
    return tier ? { eligible: true, path: candidate.path, ratio: tier[1], tier: tier[2] } : null;
  }).filter(Boolean).sort((a, b) => b.ratio - a.ratio);
  return candidates[0] || { eligible: false, path: '', ratio: 0, tier: '未成仙' };
}

export function getTimeRiverAdversaryProfile(name) {
  if (name && typeof name === 'object') {
    if (name.counter !== undefined && name.id) return name;
    name = name.名号 || name.name || name._时间长河身份;
  }
  return TIME_RIVER_ADVERSARY_PROFILES[String(name || '').trim()] || null;
}

export function getTimeRiverEnemyNames(primaryName, team = []) {
  return [...new Set([
    String(primaryName || '').trim(),
    ...(Array.isArray(team) ? team.map(enemy => String(enemy?.名号 || enemy?.name || '').trim()) : []),
  ].filter(Boolean))];
}

export function isTimeRiverCounteredSkill(skill, profile) {
  const resolvedProfile = getTimeRiverAdversaryProfile(profile);
  if (!skill) return false;
  const name = String(skill.name || skill.熟练度归属 || '');
  if (name.includes('临字秘') && (resolvedProfile || profile)) return true;
  if (!resolvedProfile?.counter) return false;
  return skill.class === '灵根' || TIME_RIVER_COUNTER_SKILLS.some(item => name.includes(item));
}

export function getTimeRiverCounterMessage(profile, skillName = '') {
  const resolvedProfile = getTimeRiverAdversaryProfile(profile);
  if (resolvedProfile?.id === 'corpse-immortal-emperor') {
    const detail = skillName ? `【${skillName}】` : '此类借力之法';
    return `【仙帝场域·万法成空】${detail}刚刚运转，尸骸仙帝的路尽场域便将灵根、九秘与一切外力尽数压灭。`;
  }
  const enemyName = resolvedProfile?.id === 'huang-tiandi' ? '荒天帝' : '苍帝三帝';
  const detail = skillName ? `【${skillName}】` : '此类借力之法';
  if (enemyName === '荒天帝') {
    return `【荒天帝·反制】${detail}映照古今，却被荒天帝一剑截断：他化自在，他化万古；你之术有形，我之道已独断万古。`;
  }
  if (!resolvedProfile) {
    return `【时间长河·临字反制】${detail}刚刚展开，对手便借古史道痕截断禁忌领域，临字秘未能成形。`;
  }
  return `【苍鸿羽·反制】${detail}刚刚显化，苍帝、鸿帝、羽帝同时出手，三道帝光将其残酷打断：刹那提升法力，数倍、十倍，甚至更多倍的叠加，这依旧难以无敌，我等亦能，且有破解之法。`;
}

export function prioritizeTimeRiverAttackSkills(attacker, skills) {
  if (!Array.isArray(skills) || attacker?._时间长河身份 !== 'corpse-immortal-emperor') {
    return skills;
  }
  return [...skills].sort((a, b) =>
    Number(b?.name === '终极帝剑斩杀') - Number(a?.name === '终极帝剑斩杀')
  );
}

export function buildTimeRiverAdversary(player, template, options = {}) {
  const name = String(template?.name || '').trim();
  const profile = getTimeRiverAdversaryProfile(name);
  const scaleFactor = Math.max(0, number(options.scaleFactor, 1));
  const random = options.random || Math.random;
  const multiplier = rollTimeRiverAttributeMultiplier(random);
  const attack = integer(integer(player?.攻击, integer(number(template?.attack) * scaleFactor)) * multiplier);
  const defense = integer(integer(player?.防御, integer(number(template?.defense) * scaleFactor)) * multiplier);
  const maxHp = integer(integer(player?.血量上限, integer(number(template?.hp) * scaleFactor)) * multiplier);
  const triadSkills = name === '苍帝'
    ? TIME_RIVER_SKILL_LIBRARY.filter(skill => skill.name !== '鸿帝死咒·泄帝势').map(skill => skill.name)
    : name === '鸿帝' ? ['鸿帝死咒·泄帝势'] : [];
  const learned = [...new Set([
    ...(Array.isArray(template?.special) ? template.special : []),
    ...triadSkills,
    ...(name === '尸骸仙帝' ? CORPSE_EMPEROR_SKILL_NAMES : []),
  ])];
  const counter = Boolean(profile?.counter);

  const adversary = {
    名号: name,
    攻击: attack,
    防御: defense,
    当前血量: maxHp,
    血量上限: maxHp,
    暴击率: number(template?.criticalRate, 0),
    灵根: template?.灵根 ? { ...template.灵根 } : undefined,
    法球倍率: number(template?.灵根?.法球倍率, 1),
    学习的功法: learned,
    era: template?.era || profile?.era || '未知纪元',
    速度: getTimeRiverFixedSpeed(name),
    mijinglevel_id: number(player?.mijinglevel_id),
    xiangulevel_id: number(player?.xiangulevel_id),
    huafenlevel_id: number(player?.huafenlevel_id),
    _忽略境界速度加成: true,
    _时间长河身份: profile?.id || '',
    _时间长河反制: counter,
    _时间长河临字秘反制: true,
    _时间长河至宝失效: counter,
  };
  return applyDarkTriadBattleKit(adversary);
}

export function buildTimeRiverTeamBenchmark(players = []) {
  const members = Array.isArray(players) ? players.filter(Boolean) : [];
  if (!members.length) return {};
  const max = field => Math.max(...members.map(player => number(player?.[field])));
  return {
    攻击: max('攻击'),
    防御: max('防御'),
    血量上限: max('血量上限'),
    当前血量: max('血量上限'),
    速度: Math.max(...members.map(timeRiverUnitSpeed)),
    mijinglevel_id: max('mijinglevel_id'),
    xiangulevel_id: max('xiangulevel_id'),
    huafenlevel_id: max('huafenlevel_id'),
    _忽略境界速度加成: true,
  };
}

export function applyTimeRiverSkillEffect(attacker, defender, skill, messages = []) {
  if (skill?.时间长河效果 !== '剥落无敌气魄' || !defender) return false;

  const fields = ['攻击', '防御', '血量上限', '当前血量'];
  for (const field of fields) {
    if (Number.isFinite(Number(defender[field]))) defender[field] = Math.max(1, Math.trunc(defender[field] * 0.5));
  }
  defender.无敌气魄 = false;
  defender._无敌气魄 = false;
  defender._时间长河无敌气魄已卸除 = true;
  messages.push(`【鸿帝死咒·泄帝势】${attacker?.名号 || '鸿帝'}以言出即法的死咒撕开${defender.名号 || '对手'}的无敌气魄，攻、防、生命上限与当前生命均削减50%！`);
  messages.push(`【技能先机】帝威卸甲的时间长河速度：${number(skill.时间长河速度, 200)}。`);
  return true;
}

export function collapsePastWorldlineArtifacts(equipment, player, options = {}) {
  const random = options.random || Math.random;
  const candidates = ['至宝', '帝兵']
    .map(slot => ({ slot, item: equipment?.[slot] }))
    .filter(({ item }) => item?.name)
    .filter(({ item }) => !item.islockd && !item.锁定 && !item.大道至宝本体);
  if (!candidates.length || number(random(), 1) >= 0.35) {
    return { destroyed: false, candidates: candidates.length };
  }

  const selected = candidates[Math.min(candidates.length - 1, randomInt(0, candidates.length - 1, random))];
  const name = selected.item.name;
  equipment[selected.slot] = { name: '' };
  if (selected.slot === '至宝' && player?.当前先天至宝 === name) player.当前先天至宝 = '';
  return {
    destroyed: true,
    slot: selected.slot,
    name,
    reason: '过去时间线被厄土仙帝打灭，道果锚点松动',
  };
}

export function ensureTimeRiverSkills(data) {
  if (!data || !Array.isArray(data.jineng1)) return false;
  const existing = new Set(data.jineng1.map(skill => skill?.name));
  let added = false;
  for (const skill of [...TIME_RIVER_SKILL_LIBRARY, ...CORPSE_EMPEROR_SKILL_LIBRARY]) {
    if (existing.has(skill.name)) continue;
    data.jineng1.push({ ...skill });
    existing.add(skill.name);
    added = true;
  }
  return added;
}
