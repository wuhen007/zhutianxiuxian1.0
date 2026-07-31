export const PLACE_LOCATION_MAP = Object.freeze({
  '凡间': 0,
  '仙界': 1,
  '下界八域': 1.5,
  '遮天位面': 2,
  '九天十地': 2.5,
  '界海': 3,
  '时间长河': 4,
  '永恒未知之地': 5,
  '仙域': 6,
});

export const DEFAULT_KNOWN_LOCATIONS = Object.freeze(['凡间']);
export const SPECIAL_LOCATIONS = Object.freeze(['仙域', '时间长河', '永恒未知之地']);

export const TRAVEL_BASE_MIN_PER_LEVEL = 15;
export const TRAVEL_REDUCE_MAX = 0.7;
export const TOKEN_HIGH_MIN_PER_LEVEL = 3;
export const TOKEN_LOW_MIN_PER_LEVEL = 12;
export const ACCIDENT_BASE = Object.freeze({ high: 0.05, low: 0.4 });
export const ACCIDENT_REALM_REDUCE = 0.3;
export const COORDINATE_DUNGEON_CHANCE = 0.1;
export const COORDINATE_CLUE_COST = 300_000_000;
export const COORDINATE_EVENT_DURATION_MS = 24 * 60 * 60 * 1000;
export const TIANWAI_WIND_REDUCTION_MINUTES = 5;

const TRAVEL_MAX_REALM = 21;

function level(player, key) {
  return Number(player?.[key]) || 0;
}

export function ensureDefaultCoordinates(player) {
  if (!player || typeof player !== 'object') return false;
  if (!Array.isArray(player.记忆坐标)) player.记忆坐标 = [];
  let changed = false;
  for (const location of DEFAULT_KNOWN_LOCATIONS) {
    if (!player.记忆坐标.includes(location)) {
      player.记忆坐标.unshift(location);
      changed = true;
    }
  }
  return changed;
}

export function hasCoordinate(player, location) {
  if (DEFAULT_KNOWN_LOCATIONS.includes(location)) return true;
  if (location === '遮天位面' && Number(player?.五色祭坛激活) === 1) return true;
  return Array.isArray(player?.记忆坐标) && player.记忆坐标.includes(location);
}

export function getCoordinateLocations() {
  return Object.keys(PLACE_LOCATION_MAP).filter(location => !DEFAULT_KNOWN_LOCATIONS.includes(location));
}

export function getUnknownCoordinates(player) {
  return getCoordinateLocations().filter(location => !hasCoordinate(player, location));
}

export function rememberCoordinate(player, location) {
  if (!Object.hasOwn(PLACE_LOCATION_MAP, location) || DEFAULT_KNOWN_LOCATIONS.includes(location)) return false;
  if (!Array.isArray(player.记忆坐标)) player.记忆坐标 = [];
  if (player.记忆坐标.includes(location)) return false;
  player.记忆坐标.push(location);
  return true;
}

export function getShanghaiDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function rollDailyDungeonCoordinate(player, options = {}) {
  const dateKey = options.dateKey || getShanghaiDateKey(options.now);
  const random = options.random || Math.random;
  const unknown = getUnknownCoordinates(player);
  if (unknown.length === 0) return { attempted: false, reason: 'complete', location: null };
  if (player.坐标副本抽取日期 === dateKey) return { attempted: false, reason: 'daily-limit', location: null };

  player.坐标副本抽取日期 = dateKey;
  const chance = Math.min(1, Math.max(0,
    (options.chance ?? COORDINATE_DUNGEON_CHANCE) * (options.chanceMultiplier ?? 1)
  ));
  if (random() >= chance) {
    return { attempted: true, reason: 'miss', location: null };
  }

  const location = unknown[Math.floor(random() * unknown.length)];
  rememberCoordinate(player, location);
  return { attempted: true, reason: 'found', location };
}

export function purchaseCoordinateClue(player, location, cost = COORDINATE_CLUE_COST) {
  if (!Object.hasOwn(PLACE_LOCATION_MAP, location) || DEFAULT_KNOWN_LOCATIONS.includes(location)) {
    return { ok: false, reason: 'invalid' };
  }
  if (hasCoordinate(player, location)) return { ok: false, reason: 'known' };
  if ((Number(player?.灵石) || 0) < cost) return { ok: false, reason: 'insufficient', cost };

  player.灵石 = Number(player.灵石) - cost;
  rememberCoordinate(player, location);
  return { ok: true, location, cost };
}

export function hasEngravedCoordinate(player, location) {
  return Array.isArray(player?.传送阵坐标) && player.传送阵坐标.includes(location);
}

export function getTokenTier(player) {
  if ((Number(player?.高级传送次数) || 0) > 0) return 'high';
  if ((Number(player?.位面传送次数) || 0) > 0) return 'low';
  return null;
}

export function calcRealmReducePct(player) {
  const realm = Math.max(level(player, 'mijinglevel_id'), level(player, 'xiangulevel_id'));
  return Math.min(TRAVEL_REDUCE_MAX, (realm / TRAVEL_MAX_REALM) * TRAVEL_REDUCE_MAX);
}

export function getBaseTravelThreshold(player) {
  const cultivation = level(player, 'level_id');
  const physique = level(player, 'Physique_id');
  const checks = [
    { label: '练气境界', display: `${cultivation}/42`, met: cultivation >= 42 },
    { label: '肉身境界', display: `${physique}/42`, met: physique >= 42 },
  ];
  return { ok: checks.every(item => item.met), checks };
}

export function getLocationThreshold(player, location) {
  const mijing = level(player, 'mijinglevel_id');
  const xiangu = level(player, 'xiangulevel_id');
  const cultivation = level(player, 'level_id');
  let code = null;
  let checks = [];

  if (location === '时间长河') {
    const met = mijing >= 20 || xiangu >= 20;
    code = met ? null : 'time-river';
    checks = [{ label: '准仙帝境界', display: `秘境 ${mijing}/20 或仙古 ${xiangu}/20`, met }];
  } else if (location === '永恒未知之地') {
    const met = mijing >= 21 || xiangu >= 21;
    code = met ? null : 'eternal-land';
    checks = [{ label: '仙帝境界', display: `秘境 ${mijing}/21 或仙古 ${xiangu}/21`, met }];
  } else if (location === '仙界') {
    const met = cultivation >= 42 || (Number(player?.lunhui) || 0) !== 0;
    code = met ? null : 'immortal-realm';
    checks = [{ label: '成仙条件', display: met ? '已成仙' : '需地仙境或轮回', met }];
  } else if (location === '遮天位面') {
    const altarActive = Number(player?.五色祭坛激活) === 1;
    const met = mijing >= 12 || xiangu > 10 || altarActive;
    code = met ? null : 'zhetian';
    checks = [{
      label: '星海通行',
      display: `秘境 ${mijing}/12、仙古 ${xiangu}/11或五色祭坛${altarActive ? '已激活' : '未激活'}`,
      met,
    }];
  } else if (location === '仙域') {
    const met = mijing >= 18 || xiangu >= 16;
    code = met ? null : 'immortal-domain';
    checks = [{ label: '仙王境界', display: `秘境 ${mijing}/18 或仙古 ${xiangu}/16`, met }];
  } else if (location === '凡间') {
    const met = mijing <= 20 && xiangu <= 20;
    code = met ? null : 'mortal-realm';
    checks = [{ label: '天地承载', display: met ? '可下凡' : '仙帝威压过强', met }];
  }

  return { ok: code === null, code, checks };
}

export function getKunpengReduction(player) {
  if (!player?.学习的功法?.includes('鲲鹏宝术')) return 0;
  const mijing = level(player, 'mijinglevel_id');
  const xiangu = level(player, 'xiangulevel_id');
  let reduction = 3;
  if (mijing >= 15 || xiangu >= 13) reduction++;
  if (mijing >= 18 || xiangu >= 16) reduction++;
  return reduction;
}

export function getBodyTravelQuote(player, fromLocation, toLocation) {
  const distance = Math.abs(Number(fromLocation) - Number(toLocation));
  if (distance === 0) {
    return { distance, xiuweiCost: 0, qixueCost: 0, shouyuanCost: 0, travelTime: 0, kunpengReduction: 0 };
  }

  const multiplier = 1 - calcRealmReducePct(player);
  const kunpengReduction = getKunpengReduction(player);
  return {
    distance,
    xiuweiCost: Math.round(distance * 10000000 * multiplier),
    qixueCost: Math.round(distance * 15000000 * multiplier),
    shouyuanCost: Math.round(distance * 10000 * multiplier),
    travelTime: Math.round(Math.max(1, Math.max(2, distance * TRAVEL_BASE_MIN_PER_LEVEL * multiplier) - kunpengReduction)),
    kunpengReduction,
  };
}

export function getTokenTravelTime(player, fromLocation, toLocation, tier) {
  const distance = Math.abs(Number(fromLocation) - Number(toLocation));
  if (distance === 0) return 0;
  const basePerLevel = tier === 'high' ? TOKEN_HIGH_MIN_PER_LEVEL : TOKEN_LOW_MIN_PER_LEVEL;
  return Math.round(Math.max(1, distance * basePerLevel * (1 - calcRealmReducePct(player))));
}

export function consumeTravelWind(player, travelTime) {
  const originalTime = Math.max(0, Math.round(Number(travelTime) || 0));
  const remainingUses = Math.max(0, Math.floor(Number(player?.天外清风加速次数) || 0));
  if (!player || remainingUses < 1 || originalTime <= 1) {
    return { consumed: false, travelTime: originalTime, reduction: 0, remainingUses };
  }

  const reducedTime = Math.max(1, originalTime - TIANWAI_WIND_REDUCTION_MINUTES);
  player.天外清风加速次数 = remainingUses - 1;
  return {
    consumed: true,
    travelTime: reducedTime,
    reduction: originalTime - reducedTime,
    remainingUses: player.天外清风加速次数,
  };
}

export function recordUnfetteredJourney(player) {
  if (!Array.isArray(player?.支线任务) || !player.支线任务.includes(4)) return 0;
  const progress = player.支线任务进度?.[4];
  if (!progress || progress.阶段 !== 1) return 0;
  progress.横渡位面 = Math.min(3, Math.max(0, Number(progress.横渡位面) || 0) + 1);
  return progress.横渡位面;
}
