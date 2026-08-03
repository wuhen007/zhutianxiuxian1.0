export const PLACE_LOCATION_MAP = Object.freeze({
  '凡间': 0,
  '仙界': 1,
  '下界八域': 1.5,
  '遮天位面': 2,
  '九天十地': 2.5,
  '界海': 3,
  '太初星墟': 3.5,
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
export const FORBIDDEN_SUPREME_ATTENTION_THRESHOLD = 3;
export const FORBIDDEN_SUPREME_ALL_ATTRIBUTE = 75_000_000_000;
export const FORBIDDEN_SUPREME_EQUIPMENT_MULTIPLIER = 150;

export const FORBIDDEN_SUPREMES = Object.freeze([
  {
    name: '石皇',
    weight: 45,
    root: { name: '大圆满圣灵皇体', type: '大成圣体', 法球倍率: 2.2, 攻击: 4, 防御: 5, 生命: 6 },
    techniques: ['石皇经·天荒镇世', '行字秘·极尽', '者字秘'],
    equipment: '不死山古皇战装',
    imperialWeapon: '天荒戟',
  },
  {
    name: '光暗至尊',
    weight: 35,
    root: { name: '光暗双生皇体', type: '光暗皇体', 法球倍率: 2, 攻击: 3, 防御: 3, 生命: 3.5 },
    techniques: ['光暗古经·两仪葬界', '维宙星灭诀', '皆字秘'],
    equipment: '光暗古皇战装',
    imperialWeapon: '光暗至尊器',
  },
  {
    name: '神墟之主',
    weight: 20,
    root: { name: '神墟古皇体', type: '古皇体', 法球倍率: 1.8, 攻击: 2, 防御: 2.5, 生命: 3 },
    techniques: ['神墟古经·万域放逐', '永恒的放逐', '临字秘'],
    equipment: '神墟古皇战装',
    imperialWeapon: '神墟古皇兵',
  },
]);

const SUPREME_GEAR_BASE = Object.freeze({ 攻击: 120_000_000, 防御: 120_000_000, 血量: 180_000_000 });
const SUPREME_WEAPON_BASE = Object.freeze({ 攻击: 50_000_000, 防御: 50_000_000, 血量: 50_000_000, 全属性: 12 });
const SUPREME_LOOT_CATEGORIES = Object.freeze(['装备', '丹药', '道具', '功法', '草药', '材料', '盒子', '宝石']);

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
  } else if (location === '太初星墟') {
    const met = mijing >= 16 || xiangu >= 16;
    code = met ? null : 'primordial-ruins';
    checks = [{ label: '裂界承载', display: `秘境 ${mijing}/16 或仙古 ${xiangu}/16`, met }];
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

export function registerForbiddenSupremeAttention(player, task) {
  const touchesZhetian = Number(task?.from_location) === PLACE_LOCATION_MAP.遮天位面 ||
    Number(task?.to_location) === PLACE_LOCATION_MAP.遮天位面;
  if (!touchesZhetian) return { relevant: false, count: 0, intercept: false, warning: '' };

  const count = Math.min(
    FORBIDDEN_SUPREME_ATTENTION_THRESHOLD,
    Math.max(0, Math.floor(Number(player?.禁区至尊注视) || 0)) + 1
  );
  player.禁区至尊注视 = count;
  const warnings = {
    1: '虚空深处似有一道冰冷眸光扫过，位面阵纹已被某位禁区至尊记住。',
    2: '北斗生命禁区传来帝兵复苏之音，那道目光再次锁定了你的穿梭轨迹。',
  };
  return {
    relevant: true,
    count,
    intercept: count >= FORBIDDEN_SUPREME_ATTENTION_THRESHOLD,
    warning: warnings[count] || '',
  };
}

export function selectForbiddenSupreme(random = Math.random) {
  const totalWeight = FORBIDDEN_SUPREMES.reduce((sum, supreme) => sum + supreme.weight, 0);
  let roll = Math.min(0.999999999999, Math.max(0, Number(random()) || 0)) * totalWeight;
  for (const supreme of FORBIDDEN_SUPREMES) {
    roll -= supreme.weight;
    if (roll < 0) return supreme;
  }
  return FORBIDDEN_SUPREMES.at(-1);
}

function maxRealm(levels) {
  return (levels || []).reduce((highest, current) =>
    !highest || Number(current?.level_id) > Number(highest?.level_id) ? current : highest, null) || {};
}

function realmStat(realm, key) {
  return Number(realm?.[key]) || 0;
}

export function buildForbiddenSupreme(supreme, realms) {
  const cultivation = maxRealm(realms?.cultivation);
  const physique = maxRealm(realms?.physique);
  const secret = (realms?.secret || []).find(item => Number(item.level_id) === 16) || {};
  const ancient = (realms?.ancient || []).find(item => Number(item.level_id) === 1) || {};
  const root = supreme.root;
  const base = key => realmStat(cultivation, key) + realmStat(physique, key) +
    realmStat(secret, key) + realmStat(ancient, key) + FORBIDDEN_SUPREME_ALL_ATTRIBUTE;
  const weaponRealm = {
    攻击: realmStat(secret, '基础攻击') + realmStat(ancient, '基础攻击'),
    防御: realmStat(secret, '基础防御') + realmStat(ancient, '基础防御'),
    血量: realmStat(secret, '基础血量') + realmStat(ancient, '基础血量'),
  };
  const stat = (key, rootKey) => Math.trunc(
    base(key) * (1 + Number(root[rootKey] || 0)) +
    (SUPREME_GEAR_BASE[rootKey] + SUPREME_WEAPON_BASE[rootKey]) * FORBIDDEN_SUPREME_EQUIPMENT_MULTIPLIER +
    weaponRealm[rootKey] * SUPREME_WEAPON_BASE.全属性 * FORBIDDEN_SUPREME_EQUIPMENT_MULTIPLIER
  );
  const hp = stat('基础血量', '血量');

  return {
    名号: `${supreme.name}·极尽升华`,
    level_id: Number(cultivation.level_id) || 0,
    Physique_id: Number(physique.level_id) || 0,
    mijinglevel_id: 16,
    xiangulevel_id: 1,
    攻击: stat('基础攻击', '攻击'),
    防御: stat('基础防御', '防御'),
    当前血量: hp,
    血量上限: hp,
    暴击率: realmStat(cultivation, '基础暴击') + realmStat(physique, '基础暴击'),
    暴击伤害: 2.5,
    速度: 100,
    灵根: { ...root },
    法球倍率: root.法球倍率,
    学习的功法: [...supreme.techniques],
    装备描述: `${supreme.equipment}×${FORBIDDEN_SUPREME_EQUIPMENT_MULTIPLIER}`,
    帝兵描述: `${supreme.imperialWeapon}×${FORBIDDEN_SUPREME_EQUIPMENT_MULTIPLIER}`,
  };
}

function itemValue(item) {
  return (Number(item?.稀有度) || 0) * 1e15 +
    (Number(item?.pinji ?? item?.品阶) || 0) * 1e12 +
    (Number(item?.出售价) || 0);
}

export function applyForbiddenSupremePlunder(player, najie, keepRatio = 0.2) {
  const learnedTechniques = Array.isArray(player?.学习的功法) ? [...player.学习的功法] : [];
  player.学习的功法 = [];
  player.当前血量 = 1;
  player.元神 = Math.max(0, Math.trunc((Number(player.元神) || 0) * 0.1));
  player.禁区至尊注视 = 0;
  player.禁区至尊堵截次数 = Math.max(0, Math.floor(Number(player.禁区至尊堵截次数) || 0)) + 1;

  const stacks = [];
  for (const category of SUPREME_LOOT_CATEGORIES) {
    for (const item of Array.isArray(najie?.[category]) ? najie[category] : []) {
      stacks.push({ category, item, quantity: Math.max(1, Math.floor(Number(item?.数量) || 1)) });
    }
  }
  const totalQuantity = stacks.reduce((sum, entry) => sum + entry.quantity, 0);
  let keepQuantity = Math.floor(totalQuantity * Math.min(1, Math.max(0, Number(keepRatio) || 0)));
  const kept = new Map();
  for (const entry of [...stacks].sort((a, b) => itemValue(a.item) - itemValue(b.item))) {
    if (keepQuantity <= 0) break;
    const amount = Math.min(entry.quantity, keepQuantity);
    kept.set(entry.item, amount);
    keepQuantity -= amount;
  }

  const takenItems = [];
  for (const category of SUPREME_LOOT_CATEGORIES) {
    if (!Array.isArray(najie?.[category])) continue;
    const remaining = [];
    for (const item of najie[category]) {
      const originalQuantity = Math.max(1, Math.floor(Number(item?.数量) || 1));
      const remainingQuantity = kept.get(item) || 0;
      const takenQuantity = originalQuantity - remainingQuantity;
      if (takenQuantity > 0) takenItems.push({ category, name: item?.name || '无名物品', quantity: takenQuantity });
      if (remainingQuantity > 0) remaining.push({ ...item, 数量: remainingQuantity });
    }
    najie[category] = remaining;
  }

  return {
    learnedTechniques,
    takenItems,
    takenQuantity: takenItems.reduce((sum, item) => sum + item.quantity, 0),
    remainingQuantity: totalQuantity - takenItems.reduce((sum, item) => sum + item.quantity, 0),
  };
}
