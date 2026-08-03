export const SUPREME_STAGE_NAMES = Object.freeze([
  null,
  '天生至尊',
  '涅槃·至尊',
  '终极涅槃·至尊',
]);

export function getSupremeStage(player) {
  return Math.max(0, SUPREME_STAGE_NAMES.indexOf(player?.灵根?.name));
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
