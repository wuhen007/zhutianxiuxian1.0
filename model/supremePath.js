export const SUPREME_STAGE_NAMES = Object.freeze([
  null,
  '天生至尊',
  '涅槃·至尊',
  '终极涅槃·至尊',
]);

const SUPREME_BONE_ARTS = Object.freeze({
  至尊骨: Object.freeze({ skill: '上苍之手', minStage: 1 }),
  涅槃至尊骨: Object.freeze({ skill: '轮回宝术', minStage: 2 }),
});

const SUPREME_COMBINED_ART = '轮回天罚';
export const DAHUANG_PUPIL_ENCOUNTER_CHANCE = 0.1;

export function getSupremeStage(player) {
  return Math.max(0, SUPREME_STAGE_NAMES.indexOf(player?.灵根?.name));
}

export function repairSupremeBoneManifestation(player) {
  const stage = getSupremeStage(player);
  const reachedBloodExtreme = new Set((player?.极境 || []).map(String)).has('2');
  // 仅「天生至尊」(阶段 1) 在达到搬血极境后自动补齐并显化至尊骨；
  // 涅槃·至尊 / 终极涅槃·至尊 须走 #至尊试炼 进阶，不在此自动显化。
  if (stage !== 1 || !reachedBloodExtreme || player?.至尊骨) return false;

  player.至尊骨 = [null, '初现', '涅槃再生', '血肉铭骨'][stage];
  return true;
}

export function ensureSupremePath(player) {
  const stage = getSupremeStage(player);
  if (stage < 1) return null;

  const old = player.至尊之路 || {};
  player.至尊之路 = {
    阶段: stage,
    仙骨: Boolean(old.仙骨),
    重瞳: Boolean(old.重瞳),
    共鸣: Boolean(old.共鸣),
    试炼: old.试炼 || null,
  };
  player.至尊之路.称号 = getSupremeTitle(player);
  return player.至尊之路;
}

function syncSupremeCombinedArt(player) {
  const learned = player?.学习的功法;
  if (!Array.isArray(learned)) return false;
  if (!learned.includes('上苍之手') || !learned.includes('轮回宝术') || learned.includes(SUPREME_COMBINED_ART)) {
    return false;
  }
  learned.push(SUPREME_COMBINED_ART);
  return true;
}

export function learnSupremeBoneArt(player, boneName) {
  const art = SUPREME_BONE_ARTS[boneName];
  if (!art) return { ok: false, reason: 'unknown_bone' };

  const stage = getSupremeStage(player);
  if (stage < art.minStage) return { ok: false, reason: 'wrong_stage', requiredStage: art.minStage };

  player.学习的功法 ??= [];
  if (player.学习的功法.includes(art.skill)) {
    return { ok: false, reason: 'known', skill: art.skill };
  }

  player.学习的功法.push(art.skill);
  return {
    ok: true,
    skill: art.skill,
    combined: syncSupremeCombinedArt(player) ? SUPREME_COMBINED_ART : null,
  };
}

export function getSupremeTitle(player) {
  const path = player?.至尊之路 || {};
  if (path.共鸣 && path.重瞳 && path.仙骨) return '至尊重瞳仙骨';
  if (path.重瞳 && path.仙骨) return '重瞳双骨至尊';
  if (path.重瞳) return '重瞳至尊';
  if (path.仙骨) return '双骨至尊';
  return SUPREME_STAGE_NAMES[getSupremeStage(player)] || '未踏至尊路';
}

/**
 * 灵根技能既可来自本命灵根，也可来自至尊路的伴生天赋。
 * 重瞳与至尊骨共存时追加低倍率组合技，保留当前至尊骨阶段的本命神通。
 */
export function hasSupremeInnate(player, skillName) {
  const rootName = player?.灵根?.name;
  const path = getSupremeStage(player) > 0 ? player?.至尊之路 : null;

  if (!path) {
    return rootName === skillName || (rootName === '重瞳者' && skillName === '重瞳');
  }

  if (skillName === '仙骨') return Boolean(path.仙骨);
  if (skillName === '至尊重瞳仙骨') return Boolean(path.共鸣 && path.重瞳 && path.仙骨);
  if (skillName === '重瞳至尊') return Boolean(path.重瞳 && !path.共鸣);
  if (skillName === '重瞳') return rootName === '重瞳者';

  if (rootName === skillName) return true;
  return false;
}

export function getSupremeTrialSpec(kind) {
  if (kind === 'nirvana') {
    return { target: 9, enemyName: '夺骨者投影', enemyScale: 0.65 };
  }
  if (kind === 'ultimate') {
    return { target: 4, enemyName: '至尊骨中的自己', enemyScale: 0.8 };
  }
  return null;
}

export function rollDahuangPupilEncounter(player, options = {}) {
  const {
    dungeon,
    hasSource = false,
    random = Math.random,
  } = options;
  if (
    dungeon !== '大荒峡谷' ||
    getSupremeStage(player) < 1 ||
    player?.至尊之路?.重瞳 ||
    hasSource ||
    random() >= DAHUANG_PUPIL_ENCOUNTER_CHANCE
  ) {
    return null;
  }

  const maxHp = Math.max(1, Number(player?.血量上限 || player?.当前血量 || 1));
  const opponentHp = Math.max(1, Math.trunc(maxHp * 0.8));
  return {
    名号: '大荒重瞳者',
    攻击: Math.max(1, Math.trunc(Number(player?.攻击 || 1) * 0.6)),
    防御: Math.max(1, Math.trunc(Number(player?.防御 || 1) * 0.65)),
    当前血量: opponentHp,
    血量上限: opponentHp,
    暴击率: Math.min(0.35, Number(player?.暴击率 || 0.1)),
    暴击伤害: Number(player?.暴击伤害 || 1.5),
    灵根: {
      name: '重瞳者',
      type: '重瞳',
      法球倍率: 3,
      攻击: 5,
      防御: 5,
      生命: 5,
    },
    法球倍率: 3,
    学习的功法: [],
    仙宠: null,
    速度: Number(player?.速度 || 100),
    mijinglevel_id: Number(player?.mijinglevel_id || 0),
    xiangulevel_id: Number(player?.xiangulevel_id || 0),
  };
}

export function getNirvanaMissing(player) {
  const missing = [];
  const extremes = new Set((player?.极境 || []).map(String));
  const learned = player?.学习的功法 || [];
  if (player?.至尊骨 !== '初现') missing.push('至尊骨初现');
  if (!extremes.has('2')) missing.push('搬血极境');
  if (!extremes.has('3')) missing.push('洞天极境');
  if (!learned.includes('原始真解神引篇')) missing.push('原始真解神引篇');
  return missing;
}

export function getUltimateMissing(player) {
  const missing = [];
  const learned = player?.学习的功法 || [];
  if (!learned.includes('六道轮回天功')) missing.push('六道轮回天功');
  if (!learned.includes('原始真解终极篇')) missing.push('原始真解终极篇');
  if (Number(player?.纪元积累 || 0) < 100) missing.push(`纪元积累100（当前${player?.纪元积累 || 0}）`);
  return missing;
}
