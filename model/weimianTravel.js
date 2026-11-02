import { hasExclusiveEquipmentSet } from './exclusiveEquipmentSets.js';
import { getGongfaNumericMultiplier } from './gongfaProficiency.js';
import { getRealmAuthorityLevel } from './realmAuthority.js';
import { isCultivatingExtraPath } from './extraCultivation.js';
import { isRevivalEarthActive, REVIVAL_EARTH_LOCATION } from './revivalEarth.js';
import { isTrialUniverseActive } from './trialUniverse.js';
import { isSwordMagicActive } from './swordMagic.js';

export const PLACE_LOCATION_MAP = Object.freeze({
  '凡间': 0,
  '复活地球': REVIVAL_EARTH_LOCATION,
  '试炼宇宙': 0.6,
  '剑与魔法': 0.7,
  '仙界': 1,
  '下界八域': 1.5,
  '遮天位面': 2,
  '九天十地': 2.5,
  '界海': 3,
  '异域': 3.2,
  '太初星墟': 3.5,
  '彼岸世界': 3.8,
  '时间长河': 3.6,
  '小阴间': 4,
  '大阴间': 5,
  '仙域': 6,
  '永恒未知之地': 42,
  '阳间': 7,
  '厄土高原': 20,
  '上苍之上': 40,
  '超维宇宙': 45,
  '百维真界': 60,
  '原初宇宙海': 80,
  '千维宙古界': 100,
  '万维梵宇界': 120,
  '神维丝线海': 150,
});

export const PLACE_LOCATION_NAMES = Object.freeze(Object.keys(PLACE_LOCATION_MAP));
export const PLACE_LOCATION_PATTERN = PLACE_LOCATION_NAMES.join('|');

export const DEFAULT_KNOWN_LOCATIONS = Object.freeze(['凡间']);
export const SEALED_LOCATIONS = Object.freeze(['彼岸世界', '复活地球', '试炼宇宙', '剑与魔法']);
export const SPECIAL_LOCATIONS = Object.freeze([
  '仙域', '异域', '时间长河', '永恒未知之地', '小阴间', '大阴间', '阳间',
  '厄土高原', '上苍之上', '超维宇宙', '百维真界', '原初宇宙海',
  '千维宙古界', '万维梵宇界', '神维丝线海',
]);

export const ALL_HEAVENS_LOCATIONS = Object.freeze([
  '凡间', '仙界', '下界八域', '遮天位面', '九天十地', '界海', '异域',
  '太初星墟', '小阴间', '大阴间', '仙域', '阳间',
]);

// 仙帝可直接触及的四处界壁区域。名称只在此处维护，其他入口通过共享集合引用。
export const EMPEROR_BOUNDARY_LOCATIONS = Object.freeze([
  '上苍之上', '永恒未知之地', '厄土高原', '时间长河',
]);

// 方图坐标数据的实际覆盖范围。高维位面没有实体方图，但仍可记录抽象坐标锚点。
export const COORDINATE_MAPPED_LOCATIONS = Object.freeze([
  '凡间', '仙界', '下界八域', '遮天位面', '九天十地', '界海',
  '太初星墟', '仙域', '小阴间', '大阴间', '阳间',
]);

// 时间长河是独立的时序域；仙帝可将四大界壁区域与诸天视为一组可达区域。
export const TIME_RIVER_LOCATIONS = Object.freeze(['时间长河']);
export const EMPEROR_FREE_TRAVEL_LOCATIONS = Object.freeze([
  ...ALL_HEAVENS_LOCATIONS,
  ...EMPEROR_BOUNDARY_LOCATIONS,
]);
export const EMPEROR_INSTANT_TRAVEL_LOCATIONS = Object.freeze([
  ...ALL_HEAVENS_LOCATIONS,
  '上苍之上',
]);
export const IMMORTAL_EMPEROR_TRAVEL_TIME_REDUCTION = 0.7;

// 旧存档曾把永恒未知之地写成 6.5。该值只作为读取兼容别名，新的写入一律使用42。
export const LEGACY_PLACE_LOCATION_NAMES = Object.freeze({
  6.5: '永恒未知之地',
});

export const DIMENSION_GROUPS = Object.freeze({
  allHeavens: Object.freeze({
    key: 'all-heavens',
    name: '诸天万界',
    layer: 0,
    layerLabel: '第0层',
    locations: ALL_HEAVENS_LOCATIONS,
    barrier: '本维度内部无维度壁垒，准仙帝即可凭权柄无等待穿梭。',
  }),
  timeRiver: Object.freeze({
    key: 'time-river',
    name: '时间长河',
    layer: -1,
    layerLabel: '独立时序域',
    locations: TIME_RIVER_LOCATIONS,
    barrier: '与诸天万界以时序界壁相隔，遨游必须先身处时间长河。',
  }),
  upperHeaven: Object.freeze({
    key: 'upper-heaven',
    name: '上苍之上',
    layer: 1,
    layerLabel: '第1层',
    locations: Object.freeze(['上苍之上']),
    barrier: '诸天万界之外的第一重空间壁垒，仙帝可无等待往返。',
  }),
  eternalUnknown: Object.freeze({
    key: 'eternal-unknown',
    name: '永恒未知之地',
    layer: 3,
    layerLabel: '第3层',
    locations: Object.freeze(['永恒未知之地']),
    barrier: '与厄土同属第三重维度壁垒，仙帝可直达但仍受跨层航程计时。',
  }),
  higherDimensions: Object.freeze({
    key: 'higher-dimensions',
    name: '更高维度',
    layer: null,
    layerLabel: '第2层及以上',
    locations: Object.freeze([
      '超维宇宙', '厄土高原', '百维真界', '原初宇宙海',
      '千维宙古界', '万维梵宇界', '神维丝线海',
    ]),
    barrier: '依次叠加维度壁垒，仍按破界强度与层数判定。',
  }),
});

export const DIMENSION_BARRIER_LAYERS = Object.freeze({
  '时间长河': -1,
  '上苍之上': 1,
  '超维宇宙': 2,
  '厄土高原': 3,
  '永恒未知之地': 3,
  '百维真界': 4,
  '原初宇宙海': 5,
  '千维宙古界': 6,
  '万维梵宇界': 7,
  '神维丝线海': 8,
});

// 破界强度独立于三大修炼体系境界编号，避免用 30、50 等门槛污染现有境界表。
export const DIMENSION_BARRIER_POWER_REQUIREMENTS = Object.freeze({
  '超维宇宙': 30,
  '上苍之上': 50,
  '厄土高原': 60,
  '永恒未知之地': 65,
  '百维真界': 80,
  '原初宇宙海': 90,
  '千维宙古界': 100,
  '万维梵宇界': 120,
  '神维丝线海': 150,
});

// 当前道途的等效破界强度。原初宇宙海未给出数值，按相邻层级补为 90。
export const DIMENSION_BREAKING_POWER_BY_AUTHORITY = Object.freeze({
  20: 30,
  21: 65,
  22: 80,
  23: 100,
  24: 120,
  25: 150,
});

export const SAN_SHI_TONG_GUAN_NAME = '三世铜棺';
export const SAN_SHI_TONG_GUAN_MIN_AUTHORITY = 20;

// 时间长河是独立时序域，跨时序界壁航程基准按 1 小时/重计（仅时间长河生效）
export const TIME_RIVER_BARRIER_BASE_MINUTES = 60;

// 圣墟位面三级：小阴间（映照绝巅 11）/ 大阴间（13）/ 阳间（17）
export const SHENGXU_PLANES = Object.freeze(['小阴间', '大阴间', '阳间']);

export function isShengxuPlane(location) {
  return SHENGXU_PLANES.includes(getLocationName(location));
}

export const TRAVEL_BASE_MIN_PER_LEVEL = 15;
export const TRAVEL_REDUCE_MAX = 0.7;
export const ZHETIAN_ENTRY_AUTHORITY_LEVEL = 12;
export const TOKEN_HIGH_MIN_PER_LEVEL = 3;
export const TOKEN_LOW_MIN_PER_LEVEL = 12;
export const ACCIDENT_BASE = Object.freeze({ high: 0.05, low: 0.4 });
export const ACCIDENT_REALM_REDUCE = 0.3;
export const COORDINATE_DUNGEON_CHANCE = 0.1;
export const COORDINATE_CLUE_COST = 300_000_000;
export const COORDINATE_EVENT_DURATION_MS = 24 * 60 * 60 * 1000;
export const TIANWAI_WIND_REDUCTION_MINUTES = 5;
export const FORBIDDEN_SUPREME_ATTENTION_THRESHOLD = 10;
export const FORBIDDEN_SUPREME_ALL_ATTRIBUTE = 75_000_000_000;
export const FORBIDDEN_SUPREME_EQUIPMENT_MULTIPLIER = 150;

export function getLocationName(location) {
  let value = location;
  if (typeof value === 'string') {
    value = value.trim();
    if (!value) return '';
    if (Object.hasOwn(PLACE_LOCATION_MAP, value)) return value;
  } else if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '';
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  const current = Object.entries(PLACE_LOCATION_MAP)
    .find(([, value]) => Number(value) === numeric)?.[0] || '';
  return current || LEGACY_PLACE_LOCATION_NAMES[numeric] || '';
}

// 将名称、当前编号与旧存档编号统一解析为当前规范编号。
export function getLocationId(location) {
  const name = getLocationName(location);
  if (name) return Number(PLACE_LOCATION_MAP[name]);
  if (typeof location === 'string' && !location.trim()) return NaN;
  if (location === null || location === undefined) return NaN;
  const numeric = Number(location);
  return Number.isFinite(numeric) ? numeric : NaN;
}

// 将坐标记忆中的数字、名称和旧别名统一保存为规范名称，同时去重。
export function normalizeLocationList(locations) {
  if (!Array.isArray(locations)) return [];
  const normalized = [];
  for (const location of locations) {
    const name = getLocationName(location);
    let value = name;
    if (!value && typeof location === 'string') value = location.trim();
    if (!value && typeof location === 'number' && Number.isFinite(location)) value = location;
    if (!value || normalized.includes(value)) continue;
    normalized.push(value);
  }
  return normalized;
}

export function isSealedLocation(location) {
  return SEALED_LOCATIONS.includes(getLocationName(location));
}

export function getDimensionLayer(location) {
  const name = getLocationName(location);
  return DIMENSION_BARRIER_LAYERS[name] || 0;
}

export function isAllHeavensLocation(location) {
  return ALL_HEAVENS_LOCATIONS.includes(getLocationName(location));
}

export function isTimeRiverLocation(location) {
  return TIME_RIVER_LOCATIONS.includes(getLocationName(location));
}

export function getDimensionGroup(location) {
  const name = getLocationName(location);
  return Object.values(DIMENSION_GROUPS).find(group => group.locations.includes(name)) || null;
}

export function getDimensionName(location) {
  return getDimensionGroup(location)?.name || (isSealedLocation(location) ? '封闭裂界' : '未知维度');
}

export function getDimensionBarrierDescription(location) {
  const group = getDimensionGroup(location);
  if (group?.key === 'higher-dimensions') {
    return `第${getDimensionLayer(location)}重维度壁垒，需满足对应破界强度，跨层时壁垒逐重叠加。`;
  }
  return group?.barrier || (
    isSealedLocation(location) ? '封闭裂界节点，不进入常规维度通道。' : '维度资料未登记。'
  );
}

export function isEmperorFreeTravelLocation(location) {
  return EMPEROR_FREE_TRAVEL_LOCATIONS.includes(getLocationName(location));
}

export function canImmortalEmperorFreeTravel(player, fromLocation, toLocation) {
  const from = getLocationName(fromLocation);
  const to = getLocationName(toLocation);
  return getRealmAuthorityLevel(player) >= 21
    && from !== ''
    && to !== ''
    && from !== to
    && isEmperorFreeTravelLocation(from)
    && isEmperorFreeTravelLocation(to);
}

export function getDimensionBarrierCount(fromLocation, toLocation) {
  return Math.abs(getDimensionLayer(fromLocation) - getDimensionLayer(toLocation));
}

export function getDimensionBreakingPower(player) {
  const authority = getRealmAuthorityLevel(player);
  if (authority <= 0) return 0;
  if (authority >= 25) return DIMENSION_BREAKING_POWER_BY_AUTHORITY[25];
  return DIMENSION_BREAKING_POWER_BY_AUTHORITY[authority] || 0;
}

export function canUseSanShiTongGuanPassage(player, toLocation, coffinCount = 0) {
  const location = getLocationName(toLocation);
  if (location !== '上苍之上') return false;
  if (getRealmAuthorityLevel(player) < SAN_SHI_TONG_GUAN_MIN_AUTHORITY) return false;
  if (Number(coffinCount) < 1) return false;
  return getDimensionBreakingPower(player) < DIMENSION_BARRIER_POWER_REQUIREMENTS[location];
}

export function getDimensionTradeCompatibility(fromPlayer, toPlayer) {
  const fromLayer = getDimensionLayer(fromPlayer?.power_place);
  const toLayer = getDimensionLayer(toPlayer?.power_place);
  return {
    ok: fromLayer === toLayer,
    fromLayer,
    toLayer,
    reason: fromLayer === toLayer ? null : 'dimension-barrier',
  };
}

export function canUseCrossServerTrade(player) {
  return isAllHeavensLocation(player?.power_place);
}

export function isInstantAllHeavensTravel(player, fromLocation, toLocation) {
  const authority = getRealmAuthorityLevel(player);
  const from = getLocationName(fromLocation);
  const to = getLocationName(toLocation);
  if (authority >= 21
    && EMPEROR_INSTANT_TRAVEL_LOCATIONS.includes(from)
    && EMPEROR_INSTANT_TRAVEL_LOCATIONS.includes(to)) {
    return true;
  }
  return authority >= 20
    && isAllHeavensLocation(from)
    && isAllHeavensLocation(to);
}

function getDimensionTravelMultiplier(player) {
  const authority = getRealmAuthorityLevel(player);
  if (authority >= 24) return 0.2;
  if (authority >= 23) return 0.35;
  if (authority >= 22) return 0.55;
  return 0.75;
}

export function getDimensionBarrierTravelTime(player, fromLocation, toLocation) {
  const barriers = getDimensionBarrierCount(fromLocation, toLocation);
  if (barriers === 0) return 0;
  if (isInstantAllHeavensTravel(player, fromLocation, toLocation)) return 0;
  // 时间长河（独立时序域）：维持 1 小时/重 × 权柄系数的专属规则
  const involvesTimeRiver = isTimeRiverLocation(fromLocation) || isTimeRiverLocation(toLocation);
  if (involvesTimeRiver) {
    let multiplier = getDimensionTravelMultiplier(player);
    if (getRealmAuthorityLevel(player) >= 21) {
      multiplier = Math.min(multiplier, 1 - IMMORTAL_EMPEROR_TRAVEL_TIME_REDUCTION);
    }
    return Math.max(1, Math.round(barriers * TIME_RIVER_BARRIER_BASE_MINUTES * multiplier));
  }
  // 其余维度壁垒（上苍之上、永恒未知之地与高维位面）：
  // 位面数值差 × 15 分钟/级 × 壁垒层数 × 境界减免系数
  const fromValue = getLocationId(fromLocation);
  const toValue = getLocationId(toLocation);
  const rawDistance = Number.isFinite(fromValue) && Number.isFinite(toValue)
    ? Math.abs(fromValue - toValue)
    : 0;
  const realmMultiplier = 1 - calcRealmReducePct(player);
  return Math.max(
    1,
    Math.round(Math.max(2, rawDistance * TRAVEL_BASE_MIN_PER_LEVEL * realmMultiplier) * barriers),
  );
}

// 禁区至尊注视·概率与豁免（按穿梭方式区分触发概率；准帝九重天以上可凭体质/境界豁免）
// 肉身横渡 50% / 低级传送阵 25% / 高级传送阵 5%
export const SUPREME_NOTICE_CHANCE = Object.freeze({ body: 0.5, low: 0.25, high: 0.05 });
// 准帝九重天可威慑至尊的「绝世体质」（圣体道胎 = 先天圣体道胎在灵根.type 中的写法）
export const SUPREME_EXEMPT_PHYSIQUES = Object.freeze(['圣体', '霸体', '圣体道胎', '混沌体']);
export const SUPREME_EXEMPT_MIJING = 15;       // 仙台秘境——准帝九重天（mijinglevel_id）
export const SUPREME_TERRIFIED_MIJING = 16;    // 仙台秘境——大帝（mijinglevel_id）
// 可为玩家「抹除禁区至尊印记」的剧情 NPC
export const SUPREME_MARK_ERASERS = Object.freeze(['盖九幽', '莫晓羽', '苏灵', '武祖叶萧', '柳神']);

export const FORBIDDEN_SUPREMES = Object.freeze([
  {
    name: '石皇',
    weight: 45,
    root: { name: '大圆满圣灵皇体', type: '大成圣体', 法球倍率: 3.4, 攻击: 4.5, 防御: 5.2, 生命: 5.8 },
    techniques: ['石皇经·天荒镇世', '行字秘·极尽', '者字秘'],
    equipment: '不死山古皇战装',
    imperialWeapon: '天荒戟',
  },
  {
    name: '光暗至尊',
    weight: 30,
    root: { name: '光暗双生至尊体', type: '光暗皇体', 法球倍率: 3.4, 攻击: 4, 防御: 4, 生命: 4.9 },
    techniques: ['光暗古经·两仪葬界', '维宙星灭诀', '皆字秘'],
    equipment: '光暗古皇战装',
    imperialWeapon: '光暗至尊器',
  },
  {
    name: '神墟之主',
    weight: 15,
    root: { name: '神墟万域古皇体', type: '古皇体', 法球倍率: 3.3, 攻击: 3.7, 防御: 4.7, 生命: 5.1 },
    techniques: ['神墟古经·万域放逐', '永恒的放逐', '临字秘'],
    equipment: '神墟古皇战装',
    imperialWeapon: '神墟古皇兵',
  },
  {
    name: '长生天尊',
    weight: 5,
    root: { name: '长生仙体·不死药身', type: '至尊体', 法球倍率: 3.2, 攻击: 3.6, 防御: 4.2, 生命: 4.8 },
    techniques: ['长生天功·万古不朽', '者字秘', '长生仙光·极尽升华'],
    equipment: '仙陵长生战装',
    imperialWeapon: '长生剑',
  },
  {
    name: '轮回之主',
    weight: 3,
    root: { name: '九转轮回至尊体', type: '至尊体', 法球倍率: 3.1, 攻击: 3.8, 防御: 4.1, 生命: 4.6 },
    techniques: ['轮回古经·九世葬天', '六道轮回拳', '者字秘'],
    equipment: '轮回海至尊战装',
    imperialWeapon: '轮回刀',
  },
  {
    name: '弃天至尊',
    weight: 2,
    root: { name: '弃天灭世至尊体', type: '至尊体', 法球倍率: 3.5, 攻击: 4.2, 防御: 4.3, 生命: 5.2 },
    techniques: ['弃天古经·灭世劫', '皆字秘', '弃天九斩'],
    equipment: '弃天至尊战装',
    imperialWeapon: '弃天神矛',
  },
]);

export const LOWER_REALM_POWERS = Object.freeze([
  {
    name: '不老山神灵法身',
    weight: 40,
    root: { name: '五行天脉神体', type: '神体', 法球倍率: 1.8, 攻击: 2.2, 防御: 2.8, 生命: 3.2 },
    techniques: ['五行神令·封天绝地'],
    equipment: '不老山五行神甲',
    imperialWeapon: '五行神盘',
    xianguLevel: 11,
    allAttribute: 3_500_000_000,
  },
  {
    name: '魔灵湖老尊者',
    weight: 35,
    root: { name: '太古天蛛王血', type: '太古王血', 法球倍率: 1.7, 攻击: 2.5, 防御: 2, 生命: 2.8 },
    techniques: ['天蛛宝术·八荒缚界'],
    equipment: '魔灵天蛛战衣',
    imperialWeapon: '八荒蛛矛',
    xianguLevel: 7,
    allAttribute: 2_500_000_000,
    equipmentMultiplier: 25,
  },
  {
    name: '太古神山老天神',
    weight: 25,
    root: { name: '太古天神体', type: '天神体', 法球倍率: 1.9, 攻击: 2.4, 防御: 2.6, 生命: 3.5 },
    techniques: ['太古神山印·天神镇界'],
    equipment: '太古神山战铠',
    imperialWeapon: '天神镇界印',
    xianguLevel: 11,
    allAttribute: 4_000_000_000,
  },
]);

export const NINE_HEAVENS_POWERS = Object.freeze([
  {
    name: '仙殿残仙',
    weight: 45,
    root: { name: '残仙真躯', type: '真仙体', 法球倍率: 2.1, 攻击: 3.5, 防御: 3.2, 生命: 4 },
    techniques: ['仙殿古经·青铜镇世'],
    equipment: '仙殿残仙战衣',
    imperialWeapon: '青铜仙殿',
    xianguLevel: 16,
    allAttribute: 30_000_000_000,
  },
  {
    name: '王长生',
    weight: 35,
    root: { name: '长生仙体', type: '长生仙体', 法球倍率: 2, 攻击: 3.2, 防御: 3, 生命: 3.8 },
    techniques: ['平乱诀·元神化剑'],
    equipment: '长生世家至尊战衣',
    imperialWeapon: '平乱仙剑',
    xianguLevel: 15,
    allAttribute: 26_000_000_000,
  },
  {
    name: '金太君',
    weight: 20,
    root: { name: '至尊金身', type: '至尊体', 法球倍率: 1.9, 攻击: 2.8, 防御: 3.4, 生命: 3.6 },
    techniques: ['金家至尊经·边荒镇天'],
    equipment: '金家至尊甲',
    imperialWeapon: '边荒至尊杖',
    xianguLevel: 15,
    allAttribute: 22_000_000_000,
  },
]);

export const IMMORTAL_REALM_POWERS = Object.freeze([
  {
    name: '巡天仙君',
    weight: 45,
    root: { name: '九霄巡天仙体', type: '仙体', 法球倍率: 2, 攻击: 3.2, 防御: 2.8, 生命: 3.5 },
    techniques: ['巡天仙经·万里封疆'],
    equipment: '九霄巡天仙甲',
    imperialWeapon: '巡天仙鉴',
    mijingLevel: 1,
    allAttribute: 18_000_000_000,
  },
  {
    name: '镇界天尊',
    weight: 35,
    root: { name: '玄黄镇界仙胎', type: '仙胎', 法球倍率: 1.9, 攻击: 2.8, 防御: 3.8, 生命: 4.2 },
    techniques: ['镇界天书·山河永固'],
    equipment: '玄黄镇界仙衣',
    imperialWeapon: '山河镇界钟',
    mijingLevel: 1,
    allAttribute: 20_000_000_000,
  },
  {
    name: '接引殿主',
    weight: 20,
    root: { name: '彼岸接引仙体', type: '仙体', 法球倍率: 1.8, 攻击: 2.6, 防御: 3, 生命: 3.4 },
    techniques: ['接引古经·彼岸天门'],
    equipment: '接引殿主法袍',
    imperialWeapon: '彼岸天门',
    mijingLevel: 1,
    allAttribute: 16_000_000_000,
  },
]);

export const LOCAL_POWER_GROUPS = Object.freeze({
  '遮天位面': {
    planeName: '遮天位面',
    title: '禁区至尊',
    attentionField: '禁区至尊注视',
    defeatField: '禁区至尊堵截次数',
    repelField: '击退禁区至尊次数',
    encounterTitle: '横断星路',
    powers: FORBIDDEN_SUPREMES,
    threshold: FORBIDDEN_SUPREME_ATTENTION_THRESHOLD,
    mijingLevel: 16,
    xianguLevel: 1,
    allAttribute: FORBIDDEN_SUPREME_ALL_ATTRIBUTE,
    equipmentMultiplier: FORBIDDEN_SUPREME_EQUIPMENT_MULTIPLIER,
    keepRatio: 0.2,
    warnings: {
      1: '虚空深处似有一道冰冷眸光扫过，位面阵纹已被某位禁区至尊记住。',
      2: '北斗生命禁区传来帝兵复苏之音，那道目光再次锁定了你的穿梭轨迹。',
      3: '禁区方向垂落一缕杀意，星路上被推演的气息越来越重。',
      4: '不死山与光暗禁区同时亮起，注视已如附骨之疽。',
      5: '你的每一次穿梭都在禁区眼中留下痕迹，有至尊开始推算你的落脚点。',
      6: '帝兵锋芒隔着星域遥遥锁定，虚空深处的杀机已凝成实质。',
      7: '数道至尊神念交织成网，你每一次跨界都要穿过他们的视线。',
      8: '禁区震颤，有古皇在沉睡中睁眼——留给你的时间不多了。',
      9: '最后一次警告：下一次穿梭，禁区至尊将横断星路截杀于界壁之间！',
    },
  },
  '下界八域': {
    planeName: '下界八域',
    title: '下界巨头',
    attentionField: '下界八域大能注视',
    defeatField: '下界八域堵截次数',
    repelField: '击退下界八域大能次数',
    encounterTitle: '神灵法旨封路',
    powers: LOWER_REALM_POWERS,
    threshold: 3,
    mijingLevel: 1,
    xianguLevel: 11,
    allAttribute: 3_000_000_000,
    equipmentMultiplier: 30,
    keepRatio: 0.5,
    warnings: {
      1: '大荒深处有古老祭坛亮起，你撕裂界壁的气息已被上界道统捕捉。',
      2: '一纸神灵法旨横过八域，数道神念开始推演你的下一次落点。',
    },
  },
  '九天十地': {
    planeName: '九天十地',
    title: '九天至尊',
    attentionField: '九天十地大能注视',
    defeatField: '九天十地堵截次数',
    repelField: '击退九天十地大能次数',
    encounterTitle: '仙道法旨截空',
    powers: NINE_HEAVENS_POWERS,
    threshold: 3,
    mijingLevel: 1,
    xianguLevel: 15,
    allAttribute: 25_000_000_000,
    equipmentMultiplier: 90,
    keepRatio: 0.25,
    warnings: {
      1: '三千道州上空仙光一闪，有至尊隔着无尽疆域望向了位面裂口。',
      2: '青铜仙殿传出钟鸣，数位古老存在已联手锁定你的虚空坐标。',
    },
  },
  '仙界': {
    planeName: '仙界',
    title: '仙界执法者',
    attentionField: '仙界大能注视',
    defeatField: '仙界堵截次数',
    repelField: '击退仙界大能次数',
    encounterTitle: '天规封锁仙门',
    powers: IMMORTAL_REALM_POWERS,
    threshold: 3,
    mijingLevel: 17,
    xianguLevel: 1,
    allAttribute: 18_000_000_000,
    equipmentMultiplier: 60,
    keepRatio: 0.35,
    warnings: {
      1: '九霄巡天镜映出你的身影，私自穿越仙凡壁垒已被记入天规。',
      2: '接引天门忽然闭合，仙界执法者正在沿着残留空间波动追索而来。',
    },
  },
});

const POWER_GEAR_BASE = Object.freeze({ 攻击: 120_000_000, 防御: 120_000_000, 血量: 180_000_000 });
const POWER_WEAPON_BASE = Object.freeze({ 攻击: 50_000_000, 防御: 50_000_000, 血量: 50_000_000, 全属性: 12 });
const SUPREME_LOOT_CATEGORIES = Object.freeze(['装备', '丹药', '道具', '功法', '草药', '材料', '盒子', '宝石']);

const TRAVEL_MAX_REALM = 21;

function level(player, key) {
  return Number(player?.[key]) || 0;
}

export function ensureDefaultCoordinates(player) {
  if (!player || typeof player !== 'object') return false;
  const current = normalizeLocationList(player.记忆坐标);
  const hadArray = Array.isArray(player.记忆坐标);
  const changedByNormalization = !hadArray
    || current.length !== player.记忆坐标.length
    || current.some((location, index) => location !== player.记忆坐标[index]);
  player.记忆坐标 = current;
  let changed = changedByNormalization;
  for (const location of DEFAULT_KNOWN_LOCATIONS) {
    if (!player.记忆坐标.includes(location)) {
      player.记忆坐标.unshift(location);
      changed = true;
    }
  }
  return changed;
}

export function hasCoordinate(player, location) {
  const locationName = getLocationName(location);
  if (isSealedLocation(locationName)) return false;
  if (getRealmAuthorityLevel(player) >= 21 && isEmperorFreeTravelLocation(locationName)) return true;
  if (DEFAULT_KNOWN_LOCATIONS.includes(locationName)) return true;
  if (locationName === '遮天位面' && Number(player?.五色祭坛激活) === 1) return true;
  if (isShengxuPlane(locationName) && (
    isCultivatingExtraPath(player, 'huafen') || getRealmAuthorityLevel(player) >= 20
  )) return true;
  if (!locationName || !Object.hasOwn(PLACE_LOCATION_MAP, locationName)) return false;
  return Array.isArray(player?.记忆坐标)
    && player.记忆坐标.some(value => getLocationName(value) === locationName);
}

export function getCoordinateLocations() {
  return PLACE_LOCATION_NAMES.filter(location =>
    !isShengxuPlane(location)
    && !isSealedLocation(location)
    && !DEFAULT_KNOWN_LOCATIONS.includes(location)
  );
}

export function getUnknownCoordinates(player) {
  return getCoordinateLocations().filter(location => (
    !hasCoordinate(player, location)
    && (getDimensionLayer(location) === 0 || getLocationThreshold(player, location).ok)
  ));
}

export function rememberCoordinate(player, location) {
  const locationName = getLocationName(location);
  if (isShengxuPlane(locationName) || isSealedLocation(locationName)
    || !locationName || !Object.hasOwn(PLACE_LOCATION_MAP, locationName)
    || DEFAULT_KNOWN_LOCATIONS.includes(locationName)) return false;
  player.记忆坐标 = normalizeLocationList(player.记忆坐标);
  if (player.记忆坐标.some(value => getLocationName(value) === locationName)) return false;
  player.记忆坐标.push(locationName);
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
  const locationName = getLocationName(location);
  if (isShengxuPlane(locationName) || isSealedLocation(locationName)
    || !locationName || !Object.hasOwn(PLACE_LOCATION_MAP, locationName)
    || DEFAULT_KNOWN_LOCATIONS.includes(locationName)) {
    return { ok: false, reason: 'invalid' };
  }
  if (hasCoordinate(player, locationName)) return { ok: false, reason: 'known' };
  if ((Number(player?.灵石) || 0) < cost) return { ok: false, reason: 'insufficient', cost };

  player.灵石 = Number(player.灵石) - cost;
  rememberCoordinate(player, locationName);
  return { ok: true, location: locationName, cost };
}

export function hasEngravedCoordinate(player, location) {
  const locationName = getLocationName(location);
  if (!locationName) return false;
  return Array.isArray(player?.传送阵坐标)
    && player.传送阵坐标.some(value => getLocationName(value) === locationName);
}

export function getTokenTier(player) {
  if ((Number(player?.高级传送次数) || 0) > 0) return 'high';
  if ((Number(player?.位面传送次数) || 0) > 0) return 'low';
  return null;
}

export function calcRealmReducePct(player) {
  const realm = Math.max(
    level(player, 'mijinglevel_id'),
    level(player, 'xiangulevel_id'),
    getRealmAuthorityLevel({ huafenlevel_id: player?.huafenlevel_id })
  );
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
  const locationName = getLocationName(location);
  const mijing = level(player, 'mijinglevel_id');
  const xiangu = level(player, 'xiangulevel_id');
  const huafen = level(player, 'huafenlevel_id');
  const cultivation = level(player, 'level_id');
  const authority = getRealmAuthorityLevel(player);
  const dimensionLayer = getDimensionLayer(locationName);
  let code = null;
  let checks = [];

  if (!locationName || !Object.hasOwn(PLACE_LOCATION_MAP, locationName)) {
    code = 'unknown';
    checks = [{ label: '位面定位', display: '目标位面未登记', met: false }];
  } else if (isSwordMagicActive(player) || locationName === '剑与魔法') {
    code = 'sword-magic';
    checks = [{ label: '独立异界路线', display: '由 #降临 剑与魔法 创建异界角色，按大陆主线冒险', met: false }];
  } else if (isTrialUniverseActive(player) || locationName === '试炼宇宙') {
    code = 'trial-universe';
    checks = [{ label: '独立试炼路线', display: '由 #降临 试炼宇宙 选择开局；试炼空间不接通常规传送', met: false }];
  } else if (isRevivalEarthActive(player) || locationName === '复活地球') {
    code = 'revival-earth';
    checks = [{ label: '独立凡间路线', display: '由 #复活地球 入界 选择开局；本篇结束后通过接引进入仙界', met: false }];
  } else if (isSealedLocation(locationName)) {
    code = 'sealed';
    checks = [{ label: '裂界唯一通路', display: '需由太初星墟唤醒裂界残忆', met: false }];
  } else if (authority >= 21 && isEmperorFreeTravelLocation(locationName)) {
    checks = [{
      label: '仙帝维度权能',
      display: `${EMPEROR_BOUNDARY_LOCATIONS.join('、')}及诸天万界可直达`,
      met: true,
    }];
  } else if (dimensionLayer > 0) {
    const required = DIMENSION_BARRIER_POWER_REQUIREMENTS[locationName] || 0;
    const breakingPower = getDimensionBreakingPower(player);
    const met = breakingPower >= required;
    code = met ? null : 'dimension-barrier';
    checks = [{
      label: `第${dimensionLayer}重维度壁垒`,
      display: `破界强度 ${breakingPower}/${required}（等效权柄 ${authority}）`,
      met,
    }];
  } else if (locationName === '小阴间') {
    const met = authority >= 20 || (isCultivatingExtraPath(player, 'huafen') && huafen >= 2);
    code = met ? null : 'shengxu';
    checks = [{ label: '花粉进化路', display: `花粉 ${huafen}/2，且未兼修其他额外体系`, met }];
  } else if (locationName === '大阴间') {
    // 映照诸天已达小阴间法则上限；先入大阴间，再冲击神祇。
    const met = authority >= 20 || (isCultivatingExtraPath(player, 'huafen') && huafen >= 11);
    code = met ? null : 'dayinjian';
    checks = [{ label: '花粉·映照诸天', display: `主修花粉 ${huafen}/11，可入大阴间冲击神祇`, met }];
  } else if (locationName === '阳间') {
    // 神将（13）即可入阳间，于法则完整之地冲击神王（14）
    const met = authority >= 20 || (isCultivatingExtraPath(player, 'huafen') && huafen >= 13);
    code = met ? null : 'yangjian';
    checks = [{ label: '花粉·神将境', display: `花粉 ${huafen}/13`, met }];
  } else if (locationName === '时间长河') {
    const met = mijing >= 20 || xiangu >= 20 || huafen >= 21;
    code = met ? null : 'time-river';
    checks = [{ label: '准仙帝境界', display: `秘境 ${mijing}/20、仙古 ${xiangu}/20或花粉 ${huafen}/21`, met }];
  } else if (locationName === '仙界') {
    const met = cultivation >= 42 || (Number(player?.lunhui) || 0) !== 0;
    code = met ? null : 'immortal-realm';
    checks = [{ label: '成仙条件', display: met ? '已成仙' : '需地仙境或轮回', met }];
  } else if (locationName === '遮天位面') {
    const altarActive = Number(player?.五色祭坛激活) === 1;
    const authority = getRealmAuthorityLevel(player);
    const met = authority >= ZHETIAN_ENTRY_AUTHORITY_LEVEL || altarActive;
    code = met ? null : 'zhetian';
    checks = [{
      label: '圣人级星海通行',
      display: `等效权柄 ${authority}/${ZHETIAN_ENTRY_AUTHORITY_LEVEL}（秘境 ${mijing}/12、仙古 ${xiangu}/11、花粉 ${huafen}/11）或五色祭坛${altarActive ? '已激活' : '未激活'}`,
      met,
    }];
  } else if (locationName === '仙域') {
    // 阳间承载至大宇/究极（17）；主修花粉需在宇究之前有合法入域之路。
    // 原秘境、仙古及已有花粉高境通行条件保持，只补主修花粉的衔接。
    const flowerEntry = isCultivatingExtraPath(player, 'huafen') && huafen >= 17;
    const met = mijing >= 18 || xiangu >= 16 || huafen >= 18 || flowerEntry;
    code = met ? null : 'immortal-domain';
    checks = [{ label: '仙域承载', display: `秘境 ${mijing}/18、仙古 ${xiangu}/16、花粉 ${huafen}/18，或主修花粉 ${huafen}/17（大宇／究极）`, met }];
  } else if (locationName === '异域') {
    const met = authority >= 18;
    code = met ? null : 'foreign-realm';
    checks = [{ label: '异域界壁', display: `等效权柄 ${authority}/18（仙王）`, met }];
  } else if (locationName === '太初星墟') {
    const met = mijing >= 16 || xiangu >= 16 || huafen >= 15;
    code = met ? null : 'primordial-ruins';
    checks = [{ label: '裂界承载', display: `秘境 ${mijing}/16、仙古 ${xiangu}/16或花粉 ${huafen}/15`, met }];
  } else if (locationName === '凡间') {
    const met = authority >= 20 || (mijing <= 20 && xiangu <= 20 && huafen <= 21);
    code = met ? null : 'mortal-realm';
    checks = [{ label: '天地承载', display: met ? '可收束权柄下凡' : '仙帝威压过强', met }];
  }

  return { ok: code === null, code, checks };
}

/**
 * 岁云剑尊套（岁云剑 + 岁云袍 + 云月之莲）。
 * 齐套者横渡诸天只付修为与血气：不耗寿元、无需等待、不必先记坐标。
 */
export function hasSuiyunSovereignTravelSet(player, equipment) {
  return hasExclusiveEquipmentSet(player, equipment, '岁云剑尊套');
}

export function getKunpengReduction(player) {
  if (!player?.学习的功法?.includes('鲲鹏宝术')) return 0;
  const mijing = level(player, 'mijinglevel_id');
  const xiangu = level(player, 'xiangulevel_id');
  const huafen = level(player, 'huafenlevel_id');
  let reduction = 3;
  if (mijing >= 15 || xiangu >= 13 || huafen >= 14) reduction++;
  if (mijing >= 18 || xiangu >= 16 || huafen >= 17) reduction++;
  return Number((reduction * getGongfaNumericMultiplier(player, '鲲鹏宝术')).toFixed(2));
}

export function getBodyTravelQuote(player, fromLocation, toLocation, equipment) {
  const barriers = getDimensionBarrierCount(fromLocation, toLocation);
  const fromValue = getLocationId(fromLocation);
  const toValue = getLocationId(toLocation);
  const rawDistance = Number.isFinite(fromValue) && Number.isFinite(toValue)
    ? Math.abs(fromValue - toValue)
    : 0;
  const distance = barriers || (Number.isFinite(rawDistance) ? rawDistance : 0);
  const instant = isInstantAllHeavensTravel(player, fromLocation, toLocation);
  if (distance === 0) {
    return { distance, dimensionBarrierCount: 0, xiuweiCost: 0, qixueCost: 0, shouyuanCost: 0, travelTime: 0, kunpengReduction: 0, suiyunInstant: false };
  }

  const multiplier = 1 - calcRealmReducePct(player);
  const quote = barriers > 0
    ? buildBarrierTravelQuote(distance, barriers, multiplier, player, fromLocation, toLocation, instant)
    : buildDistanceTravelQuote(distance, multiplier, instant, player);
  // 岁云剑尊套：只保留修为与血气，寿元归零、航程归零。
  if (hasSuiyunSovereignTravelSet(player, equipment)) {
    return { ...quote, shouyuanCost: 0, travelTime: 0, kunpengReduction: 0, suiyunInstant: true };
  }
  return { ...quote, suiyunInstant: false };
}

function buildBarrierTravelQuote(distance, barriers, multiplier, player, fromLocation, toLocation, instant) {
  // 维度壁垒航程同样可被鲲鹏宝术减免
  const kunpengReduction = instant ? 0 : getKunpengReduction(player);
  const barrierTime = instant ? 0 : getDimensionBarrierTravelTime(player, fromLocation, toLocation);
  return {
    distance,
    dimensionBarrierCount: barriers,
    xiuweiCost: Math.round(barriers * 1_000_000_000 * multiplier),
    qixueCost: Math.round(barriers * 1_500_000_000 * multiplier),
    shouyuanCost: Math.round(barriers * 100_000 * multiplier),
    travelTime: barrierTime <= 0
      ? 0
      : Math.max(1, barrierTime - kunpengReduction),
    kunpengReduction,
    instant,
  };
}

function buildDistanceTravelQuote(distance, multiplier, instant, player) {
  const kunpengReduction = getKunpengReduction(player);
  return {
    distance,
    dimensionBarrierCount: 0,
    xiuweiCost: Math.round(distance * 10000000 * multiplier),
    qixueCost: Math.round(distance * 15000000 * multiplier),
    shouyuanCost: Math.round(distance * 10000 * multiplier),
    travelTime: instant
      ? 0
      : Math.round(Math.max(1, Math.max(2, distance * TRAVEL_BASE_MIN_PER_LEVEL * multiplier) - kunpengReduction)),
    kunpengReduction,
  };
}

export function getTokenTravelTime(player, fromLocation, toLocation, tier, equipment) {
  if (isInstantAllHeavensTravel(player, fromLocation, toLocation)) return 0;
  if (hasSuiyunSovereignTravelSet(player, equipment)) return 0;
  const barrierTime = getDimensionBarrierTravelTime(player, fromLocation, toLocation);
  if (barrierTime > 0) return barrierTime;
  const fromValue = getLocationId(fromLocation);
  const toValue = getLocationId(toLocation);
  const distance = Number.isFinite(fromValue) && Number.isFinite(toValue)
    ? Math.abs(fromValue - toValue)
    : 0;
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

function getPlaneNameByLocation(location) {
  return getLocationName(location);
}

function registerGroupAttention(player, group) {
  const count = Math.min(
    group.threshold,
    Math.max(0, Math.floor(Number(player?.[group.attentionField]) || 0)) + 1
  );
  player[group.attentionField] = count;
  return {
    relevant: true,
    planeName: group.planeName,
    title: group.title,
    count,
    threshold: group.threshold,
    intercept: count >= group.threshold,
    warning: group.warnings[count] || '',
    group,
  };
}

export function registerLocalPowerAttention(player, task) {
  const toPlane = getLocationName(task?.to_name) || getPlaneNameByLocation(task?.to_location);
  const fromPlane = getLocationName(task?.from_name) || getPlaneNameByLocation(task?.from_location);
  const group = LOCAL_POWER_GROUPS[toPlane] || LOCAL_POWER_GROUPS[fromPlane];
  if (!group) return { relevant: false, count: 0, intercept: false, warning: '' };
  return registerGroupAttention(player, group);
}

export function evaluateSupremeExemption(player) {
  const mijing = level(player, 'mijinglevel_id');
  if (mijing >= SUPREME_TERRIFIED_MIJING) {
    return {
      exempt: true,
      level: 'emperor',
      warning: '你横渡遮天位面，万古禁区一片死寂——大帝意志所及，无人敢窥伺你的星路。',
    };
  }
  if (mijing >= SUPREME_EXEMPT_MIJING) {
    const physique = String(player?.灵根?.type || '');
    if (SUPREME_EXEMPT_PHYSIQUES.includes(physique)) {
      return {
        exempt: true,
        level: 'quasi-emperor',
        warning: '你撕裂界壁的气息让禁区至尊侧目，但感应到你的体质与帝道之威后，那道冰冷眸光悄然退散。',
      };
    }
  }
  return { exempt: false, level: null, warning: '' };
}

export function registerForbiddenSupremeAttention(player, task, options = {}) {
  const touchesZhetian = getLocationId(task?.from_location) === PLACE_LOCATION_MAP.遮天位面 ||
    getLocationId(task?.to_location) === PLACE_LOCATION_MAP.遮天位面 ||
    getLocationName(task?.from_name) === '遮天位面' ||
    getLocationName(task?.to_name) === '遮天位面';
  if (!touchesZhetian) return { relevant: false, count: 0, intercept: false, warning: '' };

  const group = LOCAL_POWER_GROUPS.遮天位面;
  const exemption = evaluateSupremeExemption(player);
  if (exemption.exempt) {
    return {
      relevant: true,
      planeName: group.planeName,
      title: group.title,
      count: Math.max(0, Math.floor(Number(player?.[group.attentionField]) || 0)),
      threshold: group.threshold,
      intercept: false,
      exempt: true,
      exemptLevel: exemption.level,
      warning: exemption.warning,
      group,
    };
  }

  // 按穿梭方式概率掷骰决定本次是否引起注视
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const usedToken = Boolean(task?.used_token);
  const tokenTier = task?.token_tier;
  const chance = !usedToken
    ? SUPREME_NOTICE_CHANCE.body
    : (tokenTier === 'high' ? SUPREME_NOTICE_CHANCE.high : SUPREME_NOTICE_CHANCE.low);

  if (random() >= chance) {
    return {
      relevant: true,
      planeName: group.planeName,
      title: group.title,
      count: Math.max(0, Math.floor(Number(player?.[group.attentionField]) || 0)),
      threshold: group.threshold,
      intercept: false,
      warning: '',
      noticed: false,
      group,
    };
  }

  return registerGroupAttention(player, group);
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

export function selectLocalPower(planeName, random = Math.random) {
  const group = LOCAL_POWER_GROUPS[planeName];
  if (!group) return null;
  const totalWeight = group.powers.reduce((sum, power) => sum + power.weight, 0);
  let roll = Math.min(0.999999999999, Math.max(0, Number(random()) || 0)) * totalWeight;
  let selected = group.powers.at(-1);
  for (const power of group.powers) {
    roll -= power.weight;
    if (roll < 0) {
      selected = power;
      break;
    }
  }
  return { ...selected, group };
}

function maxRealm(levels) {
  return (levels || []).reduce((highest, current) =>
    !highest || Number(current?.level_id) > Number(highest?.level_id) ? current : highest, null) || {};
}

function realmStat(realm, key) {
  return Number(realm?.[key]) || 0;
}

export function buildLocalPower(encounter, realms) {
  const group = encounter.group;
  const cultivation = maxRealm(realms?.cultivation);
  const physique = maxRealm(realms?.physique);
  const mijingLevel = Number(encounter.mijingLevel ?? group.mijingLevel) || 1;
  const xianguLevel = Number(encounter.xianguLevel ?? group.xianguLevel) || 1;
  const allAttribute = Number(encounter.allAttribute ?? group.allAttribute) || 0;
  const equipmentMultiplier = Number(encounter.equipmentMultiplier ?? group.equipmentMultiplier) || 1;
  const secret = (realms?.secret || []).find(item => Number(item.level_id) === mijingLevel) || {};
  const ancient = (realms?.ancient || []).find(item => Number(item.level_id) === xianguLevel) || {};
  const root = encounter.root;
  const base = key => realmStat(cultivation, key) + realmStat(physique, key) +
    realmStat(secret, key) + realmStat(ancient, key) + allAttribute;
  const weaponRealm = {
    攻击: realmStat(secret, '基础攻击') + realmStat(ancient, '基础攻击'),
    防御: realmStat(secret, '基础防御') + realmStat(ancient, '基础防御'),
    血量: realmStat(secret, '基础血量') + realmStat(ancient, '基础血量'),
  };
  const stat = (key, rootKey) => Math.trunc(
    base(key) * (1 + Number(root[rootKey] || 0)) +
    (POWER_GEAR_BASE[rootKey] + POWER_WEAPON_BASE[rootKey]) * equipmentMultiplier +
    weaponRealm[rootKey] * POWER_WEAPON_BASE.全属性 * equipmentMultiplier
  );
  const hp = stat('基础血量', '血量');

  return {
    名号: encounter.group.planeName === '遮天位面' ? `${encounter.name}·极尽升华` : encounter.name,
    level_id: Number(cultivation.level_id) || 0,
    Physique_id: Number(physique.level_id) || 0,
    mijinglevel_id: mijingLevel,
    xiangulevel_id: xianguLevel,
    攻击: stat('基础攻击', '攻击'),
    防御: stat('基础防御', '防御'),
    当前血量: hp,
    血量上限: hp,
    暴击率: realmStat(cultivation, '基础暴击') + realmStat(physique, '基础暴击'),
    暴击伤害: 2.5,
    速度: 100,
    灵根: { ...root },
    法球倍率: root.法球倍率,
    学习的功法: [...encounter.techniques],
    装备描述: `${encounter.equipment}×${equipmentMultiplier}`,
    帝兵描述: `${encounter.imperialWeapon}×${equipmentMultiplier}`,
    全属性加成: allAttribute,
    装备倍率: equipmentMultiplier,
  };
}

export function buildForbiddenSupreme(supreme, realms) {
  return buildLocalPower({ ...supreme, group: LOCAL_POWER_GROUPS.遮天位面 }, realms);
}

function itemValue(item) {
  return (Number(item?.稀有度) || 0) * 1e15 +
    (Number(item?.pinji ?? item?.品阶) || 0) * 1e12 +
    (Number(item?.出售价) || 0);
}

export function applyLocalPowerPlunder(player, najie, encounter, keepRatio = encounter?.group?.keepRatio ?? 0.2) {
  const learnedTechniques = Array.isArray(player?.学习的功法) ? [...player.学习的功法] : [];
  player.学习的功法 = [];
  player.当前血量 = 1;
  player.元神 = Math.max(0, Math.trunc((Number(player.元神) || 0) * 0.1));
  const attentionField = encounter?.group?.attentionField || '禁区至尊注视';
  const defeatField = encounter?.group?.defeatField || '禁区至尊堵截次数';
  player[attentionField] = 0;
  player[defeatField] = Math.max(0, Math.floor(Number(player[defeatField]) || 0)) + 1;

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

export function applyForbiddenSupremePlunder(player, najie, keepRatio = 0.2) {
  return applyLocalPowerPlunder(
    player,
    najie,
    { group: LOCAL_POWER_GROUPS.遮天位面 },
    keepRatio
  );
}

export function resetLocalPowerAttention(player, encounter) {
  const field = encounter?.group?.attentionField;
  if (field) player[field] = 0;
}
