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
  return 1 + diff * XIANGU_XIANQI.suppressPerStrand;
}
