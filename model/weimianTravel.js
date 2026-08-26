import { getGongfaNumericMultiplier } from './gongfaProficiency.js';
import { getRealmAuthorityLevel } from './realmAuthority.js';
import { isCultivatingExtraPath } from './extraCultivation.js';

export const PLACE_LOCATION_MAP = Object.freeze({
  '凡间': 0,
  '仙界': 1,
  '下界八域': 1.5,
  '遮天位面': 2,
  '九天十地': 2.5,
  '界海': 3,
  '异域': 3.2,
  '太初星墟': 3.5,
  '时间长河': 3.6,
  '小阴间': 4,
  '大阴间': 5,
  '仙域': 6,
  '永恒未知之地': 6.5,
  '阳间': 7,
  '厄土高原': 100,
  '上苍之上': 200,
  '百维真界': 400,
  '原初宇宙海': 500,
  '千维宙古界': 600,
  '万维梵宇界': 700,
  '神维丝线海': 800,
});

export const DEFAULT_KNOWN_LOCATIONS = Object.freeze(['凡间']);
export const SPECIAL_LOCATIONS = Object.freeze([
  '仙域', '异域', '时间长河', '永恒未知之地', '小阴间', '大阴间', '阳间',
  '厄土高原', '上苍之上', '百维真界', '原初宇宙海',
  '千维宙古界', '万维梵宇界', '神维丝线海',
]);

export const ALL_HEAVENS_LOCATIONS = Object.freeze([
  '凡间', '仙界', '下界八域', '遮天位面', '九天十地', '界海', '异域',
  '太初星墟', '时间长河', '小阴间', '大阴间', '仙域', '阳间',
]);

export const DIMENSION_BARRIER_LAYERS = Object.freeze({
  '厄土高原': 1,
  '上苍之上': 2,
  '永恒未知之地': 3,
  '百维真界': 4,
  '原初宇宙海': 5,
  '千维宙古界': 6,
  '万维梵宇界': 7,
  '神维丝线海': 8,
});

export const DIMENSION_BARRIER_BASE_MINUTES = 8 * 60;

// 圣墟位面三级：小阴间（映照绝巅 11）/ 大阴间（13）/ 阳间（17）
export const SHENGXU_PLANES = Object.freeze(['小阴间', '大阴间', '阳间']);

export function isShengxuPlane(location) {
  return SHENGXU_PLANES.includes(location);
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
  if (Object.hasOwn(PLACE_LOCATION_MAP, location)) return String(location);
  const numeric = Number(location);
  return Object.entries(PLACE_LOCATION_MAP)
    .find(([, value]) => Number(value) === numeric)?.[0] || '';
}

export function getDimensionLayer(location) {
  const name = getLocationName(location);
  return DIMENSION_BARRIER_LAYERS[name] || 0;
}

export function isAllHeavensLocation(location) {
  return ALL_HEAVENS_LOCATIONS.includes(getLocationName(location));
}

export function getDimensionBarrierCount(fromLocation, toLocation) {
  return Math.abs(getDimensionLayer(fromLocation) - getDimensionLayer(toLocation));
}

export function isInstantAllHeavensTravel(player, fromLocation, toLocation) {
  return getRealmAuthorityLevel(player) >= 20
    && isAllHeavensLocation(fromLocation)
    && isAllHeavensLocation(toLocation);
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
  return Math.max(
    60 * barriers,
    Math.round(barriers * DIMENSION_BARRIER_BASE_MINUTES * getDimensionTravelMultiplier(player))
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
  if (isShengxuPlane(location) && (
    isCultivatingExtraPath(player, 'huafen') || getRealmAuthorityLevel(player) >= 20
  )) return true;
  return Array.isArray(player?.记忆坐标) && player.记忆坐标.includes(location);
}

export function getCoordinateLocations() {
  return Object.keys(PLACE_LOCATION_MAP).filter(location =>
    !isShengxuPlane(location) && !DEFAULT_KNOWN_LOCATIONS.includes(location)
  );
}

export function getUnknownCoordinates(player) {
  return getCoordinateLocations().filter(location => (
    !hasCoordinate(player, location)
    && (getDimensionLayer(location) === 0 || getLocationThreshold(player, location).ok)
  ));
}

export function rememberCoordinate(player, location) {
  if (isShengxuPlane(location) || !Object.hasOwn(PLACE_LOCATION_MAP, location) || DEFAULT_KNOWN_LOCATIONS.includes(location)) return false;
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
  if (isShengxuPlane(location) || !Object.hasOwn(PLACE_LOCATION_MAP, location) || DEFAULT_KNOWN_LOCATIONS.includes(location)) {
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
  const mijing = level(player, 'mijinglevel_id');
  const xiangu = level(player, 'xiangulevel_id');
  const huafen = level(player, 'huafenlevel_id');
  const cultivation = level(player, 'level_id');
  const authority = getRealmAuthorityLevel(player);
  const dimensionLayer = getDimensionLayer(location);
  let code = null;
  let checks = [];

  if (dimensionLayer > 0) {
    const required = dimensionLayer <= 4 ? 21 : dimensionLayer <= 6 ? 23 : 24;
    const met = authority >= required;
    code = met ? null : 'dimension-barrier';
    checks = [{
      label: `第${dimensionLayer}重维度壁垒`,
      display: `等效权柄 ${authority}/${required}（${dimensionLayer <= 4 ? '仙帝' : dimensionLayer <= 6 ? '祭道之上' : '唯一道之上'}）`,
      met,
    }];
  } else if (location === '小阴间') {
    const met = authority >= 20 || (isCultivatingExtraPath(player, 'huafen') && huafen >= 2);
    code = met ? null : 'shengxu';
    checks = [{ label: '花粉进化路', display: `花粉 ${huafen}/2，且未兼修其他额外体系`, met }];
  } else if (location === '大阴间') {
    const met = authority >= 20 || (isCultivatingExtraPath(player, 'huafen') && huafen >= 12);
    code = met ? null : 'dayinjian';
    checks = [{ label: '花粉·神祇境', display: `花粉 ${huafen}/12`, met }];
  } else if (location === '阳间') {
    // 神将（13）即可入阳间，于法则完整之地冲击神王（14）
    const met = authority >= 20 || (isCultivatingExtraPath(player, 'huafen') && huafen >= 13);
    code = met ? null : 'yangjian';
    checks = [{ label: '花粉·神将境', display: `花粉 ${huafen}/13`, met }];
  } else if (location === '时间长河') {
    const met = mijing >= 20 || xiangu >= 20 || huafen >= 21;
    code = met ? null : 'time-river';
    checks = [{ label: '准仙帝境界', display: `秘境 ${mijing}/20、仙古 ${xiangu}/20或花粉 ${huafen}/21`, met }];
  } else if (location === '仙界') {
    const met = cultivation >= 42 || (Number(player?.lunhui) || 0) !== 0;
    code = met ? null : 'immortal-realm';
    checks = [{ label: '成仙条件', display: met ? '已成仙' : '需地仙境或轮回', met }];
  } else if (location === '遮天位面') {
    const altarActive = Number(player?.五色祭坛激活) === 1;
    const authority = getRealmAuthorityLevel(player);
    const met = authority >= ZHETIAN_ENTRY_AUTHORITY_LEVEL || altarActive;
    code = met ? null : 'zhetian';
    checks = [{
      label: '圣人级星海通行',
      display: `等效权柄 ${authority}/${ZHETIAN_ENTRY_AUTHORITY_LEVEL}（秘境 ${mijing}/12、仙古 ${xiangu}/11、花粉 ${huafen}/11）或五色祭坛${altarActive ? '已激活' : '未激活'}`,
      met,
    }];
  } else if (location === '仙域') {
    const met = mijing >= 18 || xiangu >= 16 || huafen >= 18;
    code = met ? null : 'immortal-domain';
    checks = [{ label: '仙王境界', display: `秘境 ${mijing}/18、仙古 ${xiangu}/16或花粉 ${huafen}/18`, met }];
  } else if (location === '异域') {
    const met = authority >= 18;
    code = met ? null : 'foreign-realm';
    checks = [{ label: '异域界壁', display: `等效权柄 ${authority}/18（仙王）`, met }];
  } else if (location === '太初星墟') {
    const met = mijing >= 16 || xiangu >= 16 || huafen >= 15;
    code = met ? null : 'primordial-ruins';
    checks = [{ label: '裂界承载', display: `秘境 ${mijing}/16、仙古 ${xiangu}/16或花粉 ${huafen}/15`, met }];
  } else if (location === '凡间') {
    const met = authority >= 20 || (mijing <= 20 && xiangu <= 20 && huafen <= 21);
    code = met ? null : 'mortal-realm';
    checks = [{ label: '天地承载', display: met ? '可收束权柄下凡' : '仙帝威压过强', met }];
  }

  return { ok: code === null, code, checks };
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

export function getBodyTravelQuote(player, fromLocation, toLocation) {
  const barriers = getDimensionBarrierCount(fromLocation, toLocation);
  const distance = barriers || Math.abs(Number(fromLocation) - Number(toLocation));
  if (distance === 0) {
    return { distance, dimensionBarrierCount: 0, xiuweiCost: 0, qixueCost: 0, shouyuanCost: 0, travelTime: 0, kunpengReduction: 0 };
  }

  const multiplier = 1 - calcRealmReducePct(player);
  if (barriers > 0) {
    return {
      distance,
      dimensionBarrierCount: barriers,
      xiuweiCost: Math.round(barriers * 1_000_000_000 * multiplier),
      qixueCost: Math.round(barriers * 1_500_000_000 * multiplier),
      shouyuanCost: Math.round(barriers * 100_000 * multiplier),
      travelTime: getDimensionBarrierTravelTime(player, fromLocation, toLocation),
      kunpengReduction: 0,
    };
  }
  const kunpengReduction = getKunpengReduction(player);
  return {
    distance,
    dimensionBarrierCount: 0,
    xiuweiCost: Math.round(distance * 10000000 * multiplier),
    qixueCost: Math.round(distance * 15000000 * multiplier),
    shouyuanCost: Math.round(distance * 10000 * multiplier),
    travelTime: isInstantAllHeavensTravel(player, fromLocation, toLocation)
      ? 0
      : Math.round(Math.max(1, Math.max(2, distance * TRAVEL_BASE_MIN_PER_LEVEL * multiplier) - kunpengReduction)),
    kunpengReduction,
  };
}

export function getTokenTravelTime(player, fromLocation, toLocation, tier) {
  if (isInstantAllHeavensTravel(player, fromLocation, toLocation)) return 0;
  const barrierTime = getDimensionBarrierTravelTime(player, fromLocation, toLocation);
  if (barrierTime > 0) return barrierTime;
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

function getPlaneNameByLocation(location) {
  const numericLocation = Number(location);
  return Object.entries(PLACE_LOCATION_MAP)
    .find(([, value]) => Number(value) === numericLocation)?.[0] || '';
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
  const toPlane = task?.to_name || getPlaneNameByLocation(task?.to_location);
  const fromPlane = task?.from_name || getPlaneNameByLocation(task?.from_location);
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
  const touchesZhetian = Number(task?.from_location) === PLACE_LOCATION_MAP.遮天位面 ||
    Number(task?.to_location) === PLACE_LOCATION_MAP.遮天位面;
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
