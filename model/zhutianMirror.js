import { getRealmAuthorityLevel } from './realmAuthority.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const MIRROR_TIER_CONFIG = Object.freeze({
  1: { name: '一阶·初映', energyMax: 3 },
  2: { name: '二阶·寻界', energyMax: 4 },
  3: { name: '三阶·锚定', energyMax: 5 },
  4: { name: '四阶·破界', energyMax: 6 },
  5: { name: '五阶·界海', energyMax: 8 },
  6: { name: '六阶·诸天', energyMax: 10 },
  7: { name: '七阶·彼岸', energyMax: 12 },
});

export const WORLD_MIN_MIRROR_TIER = Object.freeze({
  魔卡少女樱: 1,
  魔女之旅: 1,
  魔法少女小圆: 2,
  假面骑士帝骑: 3,
  '星穹铁道·匹诺康尼': 3,
  万道争锋: 4,
  崩坏宇宙: 4,
  剑渊古路: 5,
  一剑独尊: 5,
  星海归墟: 6,
});

export const MIRROR_REFINEMENT_REQUIREMENTS = Object.freeze({
  1: { 镜尘: 50, 世界残响: 10, 世界印记: 1 },
  2: { 镜尘: 120, 世界残响: 30, 位面晶核: 1, 世界印记: 2 },
  3: { 镜尘: 250, 世界残响: 60, 位面晶核: 3, 世界印记: 3 },
  4: { 镜尘: 450, 世界残响: 100, 位面晶核: 6, 时空锚: 1 },
  5: { 镜尘: 800, 位面晶核: 10, 时空锚: 3, 世界印记: 5 },
  6: { 镜尘: 1500, 世界印记: 7, 诸天镜心: 1 },
});

export const ZHUTIAN_AVATAR_STAGE_REQUIREMENTS = Object.freeze({
  2: Object.freeze({ levelId: 42, levelName: '地仙', authority: 10, authorityName: '大能级', label: '地仙本体 + 大能级额外体系' }),
  3: Object.freeze({ levelId: 46, levelName: '金仙', authority: 15, authorityName: '准帝级', label: '金仙本体 + 准帝级额外体系' }),
  4: Object.freeze({ levelId: 50, levelName: '究极仙王', authority: 20, authorityName: '准仙帝级', label: '究极仙王本体 + 准仙帝级额外体系' }),
});

export const TOMOEDA_LOCATIONS = Object.freeze({
  友枝小学: { minTier: 1, cards: ['影', '静', '歌', '眠', '声', '灯', '花', '甘', '小'] },
  企鹅公园: { minTier: 1, cards: ['风', '翔', '跳', '树', '雨', '云', '浮', '力', '泡'] },
  库洛宅邸: { minTier: 2, cards: ['镜', '锭', '梦', '迷', '幻', '剑', '盾', '替', '秤'] },
  月峰神社: { minTier: 2, cards: ['光', '暗', '雪', '雾', '岚', '双', '创', '冻'] },
  东京塔: { minTier: 3, cards: ['火', '水', '地', '雷', '斗', '击', '矢', '波', '砂'] },
  梦境友枝町: { minTier: 4, cards: ['移', '消', '时', '轮', '戾', '大', '拔', '无'] },
});

export const MITAKIHARA_LOCATIONS = Object.freeze({
  见泷原中学: { minTier: 2, hopeShards: 4, despairPurified: 4, corruption: 5 },
  蔷薇园魔女结界: { minTier: 2, hopeShards: 6, despairPurified: 8, corruption: 8 },
  零食魔女结界: { minTier: 2, hopeShards: 7, despairPurified: 10, corruption: 10 },
  人鱼魔女结界: { minTier: 3, hopeShards: 9, despairPurified: 14, corruption: 14 },
  魔女之夜: { minTier: 4, hopeShards: 14, despairPurified: 20, corruption: 20 },
});

const DECADE_RIDER_CARDS = Object.freeze(['空我', '亚极陀', '龙骑', 'Faiz', '剑', '响鬼', '甲斗', '电王', 'Kiva']);
export const DECADE_TOUR_WORLDS = Object.freeze(DECADE_RIDER_CARDS.map(name => `${name}世界`).concat('Decade世界'));

export const CLOW_CARD_COMBOS = Object.freeze({
  疾风封印: ['风', '翔', '影'],
  元素共鸣: ['火', '水', '地'],
  月华守护: ['光', '暗', '盾'],
  梦境回廊: ['镜', '梦', '时'],
});

export const DECADE_LOCATIONS = Object.freeze({
  光写真馆: { minTier: 3, cards: ['空我', '亚极陀', '龙骑'] },
  骑士大战遗迹: { minTier: 3, cards: ['Faiz', '剑', '响鬼'] },
  世界融合点: { minTier: 3, cards: ['甲斗', '电王', 'Kiva'] },
  大修卡基地: { minTier: 4, cards: DECADE_RIDER_CARDS },
  极光帷幕深处: { minTier: 5, cards: DECADE_RIDER_CARDS },
});

export const SAKURA_BASE_ROOT = Object.freeze({
  id: 7010015,
  name: '木之本樱',
  type: '魔卡少女',
  归类: '诸天万界',
  eff: 0.4,
  法球倍率: 0.4,
  攻击: 0.5,
  防御: 0.5,
  生命: 0.5,
  生命本源: 0,
  稀有度: 5,
});

export const MADOKA_BASE_ROOT = Object.freeze({
  id: 7010015,
  name: '鹿目圆',
  type: '魔法少女',
  归类: '诸天万界',
  eff: 1.25,
  法球倍率: 1.25,
  攻击: 1,
  防御: 1,
  生命: 1,
  生命本源: 0,
  稀有度: 5,
});

export const DECADE_BASE_ROOT = Object.freeze({
  id: 7010015,
  name: '门矢士',
  type: '假面驾驭',
  归类: '诸天万界',
  eff: 1,
  法球倍率: 0.6,
  攻击: 0.25,
  防御: 0.25,
  生命: 0.25,
  生命本源: 0,
  稀有度: 5,
});

export const DECADE_ROOT = Object.freeze({
  id: 7010015,
  name: '帝骑',
  type: '假面驾驭',
  归类: '诸天万界',
  eff: 1,
  法球倍率: 1,
  攻击: 1,
  防御: 1,
  生命: 1,
  生命本源: 0,
  稀有度: 5,
});

export const DECADE_GOD_MASTER_ROOT = Object.freeze({
  id: 7010015,
  name: '帝骑·神主',
  type: '终极假面驾驭',
  归类: '诸天万界',
  eff: 2,
  法球倍率: 2,
  攻击: 2,
  防御: 2,
  生命: 2,
  生命本源: 0,
  稀有度: 7,
});

export const DECADE_ULTIMATE_ROOT = Object.freeze({
  id: 7010015,
  name: '帝骑·终极神主',
  type: '超终极假面驾驭',
  归类: '诸天万界',
  eff: 4,
  法球倍率: 4,
  攻击: 4,
  防御: 4,
  生命: 4,
  生命本源: 0,
  稀有度: 9,
});

const MATERIAL_NAMES = ['镜尘', '世界残响', '位面晶核', '时空锚', '诸天镜心'];
const SAKURA_REQUIRED_CARDS = ['风', '翔', '影'];
const LEGACY_AVATARS = Object.freeze({
  木之本樱: { name: '木之本樱', world: '魔卡少女樱', stage: 1 },
  '星之杖·木之本樱': { name: '木之本樱', world: '魔卡少女樱', stage: 2 },
  '梦之杖·木之本樱': { name: '木之本樱', world: '魔卡少女樱', stage: 3 },
  鹿目圆: { name: '鹿目圆', world: '魔法少女小圆', stage: 1 },
  '许愿者·圆': { name: '鹿目圆', world: '魔法少女小圆', stage: 2 },
  '希望之光·圆': { name: '鹿目圆', world: '魔法少女小圆', stage: 3 },
  圆神: { name: '鹿目圆', world: '魔法少女小圆', stage: 4 },
  门矢士: { name: '门矢士', world: '假面骑士帝骑', stage: 1 },
  帝骑: { name: '门矢士', world: '假面骑士帝骑', stage: 2 },
  '帝骑·神主': { name: '门矢士', world: '假面骑士帝骑', stage: 3 },
  '帝骑·终极神主': { name: '门矢士', world: '假面骑士帝骑', stage: 4 },
  少女流萤: { name: '少女流萤', world: '星穹铁道·匹诺康尼', stage: 1 },
  流萤萨姆机甲: { name: '少女流萤', world: '星穹铁道·匹诺康尼', stage: 2 },
  伊蕾娜: { name: '伊蕾娜', world: '魔女之旅', stage: 1 },
  爱莉希雅: { name: '爱莉希雅', world: '崩坏宇宙', stage: 1 },
  '人之律者·爱莉希雅': { name: '爱莉希雅', world: '崩坏宇宙', stage: 2 },
  '始源之律者·爱莉希雅': { name: '爱莉希雅', world: '崩坏宇宙', stage: 3 },
  天命青儿: { name: '天命青儿', world: '一剑独尊', stage: 1 },
});

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function asNonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

export function applyProjectionEffect(projection, expression) {
  for (const part of String(expression || '').split(',')) {
    const match = part.trim().match(/([+-]?\d+)(魂|影)/);
    if (!match) continue;
    const value = Number(match[1]);
    if (match[2] === '魂') {
      const current = Number(projection.soulStability);
      projection.soulStability = Math.max(0, Math.min(100, (Number.isFinite(current) ? current : 0) + value));
    } else {
      const current = Number(projection.worldInfluence);
      projection.worldInfluence = Math.max(0, (Number.isFinite(current) ? current : 0) + value);
    }
  }
  return projection;
}

function addUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

function getChinaDate(now = Date.now()) {
  const timestamp = now instanceof Date ? now.getTime() : Number(now);
  return new Date(timestamp + DAY_MS / 3).toISOString().slice(0, 10);
}

export function inspectZhutianAvatarAdvancement(player, targetStage) {
  const requirement = ZHUTIAN_AVATAR_STAGE_REQUIREMENTS[targetStage];
  if (!requirement) return { ok: true, targetStage, requirement: null, missing: [] };

  const levelId = asNonNegativeInteger(player?.level_id);
  const authority = getRealmAuthorityLevel(player);
  const missing = [];
  if (levelId < requirement.levelId) missing.push(`本体境界需达到【${requirement.levelName}】`);
  if (authority < requirement.authority) {
    missing.push(`额外体系（秘境、仙古或花粉）至少一条需达到【${requirement.authorityName}】等效层次`);
  }
  return { ok: missing.length === 0, targetStage, requirement, levelId, authority, missing };
}

function upsertAvatar(player, avatar) {
  const current = player.诸天化身谱.find(item => item.name === avatar.name);
  if (current) {
    current.world = avatar.world;
    if (avatar.stage >= asNonNegativeInteger(current.stage)) {
      current.stage = avatar.stage;
      current.root = clone(avatar.root);
    }
    return current;
  }
  const created = { ...avatar, root: clone(avatar.root) };
  player.诸天化身谱.push(created);
  return created;
}

export function getClowCardCombo(cards = []) {
  const selected = new Set(cards);
  return Object.entries(CLOW_CARD_COMBOS).find(([, required]) => required.every(card => selected.has(card)))?.[0] || null;
}

export function ensureSakuraCardSystem(player) {
  if (!player.库洛牌系统 || typeof player.库洛牌系统 !== 'object') player.库洛牌系统 = {};
  const system = player.库洛牌系统;
  if (!Array.isArray(system.已封印库洛牌)) system.已封印库洛牌 = [];
  system.已封印库洛牌 = [...new Set(system.已封印库洛牌.filter(Boolean))];
  system.魔杖形态 ||= '初始封印杖';
  system.魔法熟练度 = asNonNegativeInteger(system.魔法熟练度);
  system.通过月之审判 = Boolean(system.通过月之审判);
  system.通过梦之试炼 = Boolean(system.通过梦之试炼);
  system.当前梦境进度 = asNonNegativeInteger(system.当前梦境进度);
  system.月之审判次数 = asNonNegativeInteger(system.月之审判次数);
  system.总探索次数 = asNonNegativeInteger(system.总探索次数);
  if (!Array.isArray(system.出战卡组)) system.出战卡组 = [];
  system.出战卡组 = [...new Set(system.出战卡组.filter(card => system.已封印库洛牌.includes(card)))].slice(0, 3);
  system.当前组合 = getClowCardCombo(system.出战卡组);
  return system;
}

export function setClowCardDeck(player, cards, { now = Date.now() } = {}) {
  ensureZhutianMirrorSystem(player, { now });
  const selected = [...new Set(cards.filter(Boolean))];
  if (selected.length !== 3 || cards.length !== 3) return { ok: false, reason: 'count' };
  const missing = selected.filter(card => !player.库洛牌系统.已封印库洛牌.includes(card));
  if (missing.length > 0) return { ok: false, reason: 'card', missing };
  player.库洛牌系统.出战卡组 = selected;
  player.库洛牌系统.当前组合 = getClowCardCombo(selected);
  return { ok: true, cards: selected, combo: player.库洛牌系统.当前组合 };
}

function ensureMadokaHopeSystem(player) {
  if (!player.希望系统 || typeof player.希望系统 !== 'object') player.希望系统 = {};
  const hope = player.希望系统;
  for (const name of ['希望碎片', '拯救人数', '助人次数', '净化绝望值', '因果律领悟', '时间线干涉']) {
    hope[name] = asNonNegativeInteger(hope[name]);
  }
  return hope;
}

export function ensureZhutianMirrorSystem(player, { now = Date.now(), migrateLegacy = true } = {}) {
  if (!player.诸天镜系统 || typeof player.诸天镜系统 !== 'object') player.诸天镜系统 = {};
  if (!Array.isArray(player.诸天化身谱)) player.诸天化身谱 = [];

  const system = player.诸天镜系统;
  system.已绑定 = Boolean(system.已绑定);
  system.镜阶 = Math.min(7, Math.max(1, asNonNegativeInteger(system.镜阶) || 1));
  system.镜能 = asNonNegativeInteger(system.镜能);
  system.镜能日期 ||= getChinaDate(now);
  if (!system.材料 || typeof system.材料 !== 'object') system.材料 = {};
  for (const name of MATERIAL_NAMES) system.材料[name] = asNonNegativeInteger(system.材料[name]);
  if (!Array.isArray(system.已解锁世界)) system.已解锁世界 = [];
  if (!Array.isArray(system.世界印记)) system.世界印记 = [];
  if (!system.异界遗物 || typeof system.异界遗物 !== 'object' || Array.isArray(system.异界遗物)) system.异界遗物 = {};
  system.已解锁世界 = [...new Set(system.已解锁世界.filter(Boolean))];
  system.世界印记 = [...new Set(system.世界印记.filter(Boolean))];
  for (const [name, amount] of Object.entries(system.异界遗物)) {
    system.异界遗物[name] = asNonNegativeInteger(amount);
  }
  if (!system.世界进度 || typeof system.世界进度 !== 'object') system.世界进度 = {};
  if (!system.世界进度.魔法少女樱 || typeof system.世界进度.魔法少女樱 !== 'object') {
    system.世界进度.魔法少女樱 = {};
  }
  const sakura = system.世界进度.魔法少女樱;
  sakura.探索度 = Math.min(100, asNonNegativeInteger(sakura.探索度));
  sakura.有效探索次数 = asNonNegativeInteger(sakura.有效探索次数);
  sakura.封印之钥 = Boolean(sakura.封印之钥);
  sakura.基础化身已解锁 = Boolean(sakura.基础化身已解锁);

  if (!system.世界进度.魔法少女小圆 || typeof system.世界进度.魔法少女小圆 !== 'object') {
    system.世界进度.魔法少女小圆 = {};
  }
  const madoka = system.世界进度.魔法少女小圆;
  madoka.探索度 = Math.min(100, asNonNegativeInteger(madoka.探索度));
  madoka.有效探索次数 = asNonNegativeInteger(madoka.有效探索次数);
  madoka.因果碎片 = asNonNegativeInteger(madoka.因果碎片);
  madoka.悲叹之种 = asNonNegativeInteger(madoka.悲叹之种);
  madoka.灵魂宝石污浊度 = Math.min(100, asNonNegativeInteger(madoka.灵魂宝石污浊度));
  madoka.时间线重置次数 = asNonNegativeInteger(madoka.时间线重置次数);
  madoka.灵魂宝石 = Boolean(madoka.灵魂宝石);
  madoka.基础化身已解锁 = Boolean(madoka.基础化身已解锁);

  if (!system.世界进度.假面骑士帝骑 || typeof system.世界进度.假面骑士帝骑 !== 'object') {
    system.世界进度.假面骑士帝骑 = {};
  }
  const decade = system.世界进度.假面骑士帝骑;
  decade.探索度 = Math.min(100, asNonNegativeInteger(decade.探索度));
  decade.有效探索次数 = asNonNegativeInteger(decade.有效探索次数);
  decade.共鸣度 = asNonNegativeInteger(decade.共鸣度);
  decade.帝骑驱动器 = Boolean(decade.帝骑驱动器);
  decade.基础化身已解锁 = Boolean(decade.基础化身已解锁);
  decade.帝骑已解锁 = Boolean(decade.帝骑已解锁);
  decade.神主已解锁 = Boolean(decade.神主已解锁);
  decade.终极神主已解锁 = Boolean(decade.终极神主已解锁);
  decade.终极卡试炼 = Boolean(decade.终极卡试炼);
  decade.神主触屏碎片 = Math.min(10, asNonNegativeInteger(decade.神主触屏碎片));
  decade.碎片保底计数 = Math.min(2, asNonNegativeInteger(decade.碎片保底计数));
  decade.世界融合度 = Math.min(100, asNonNegativeInteger(decade.世界融合度));
  decade.融合危机次数 = asNonNegativeInteger(decade.融合危机次数);
  if (!Array.isArray(decade.骑士卡片)) decade.骑士卡片 = [];
  decade.骑士卡片 = [...new Set(decade.骑士卡片.filter(name => DECADE_RIDER_CARDS.includes(name)))];
  if (!Array.isArray(decade.出战卡组)) decade.出战卡组 = [];
  decade.出战卡组 = [...new Set(decade.出战卡组.filter(name => decade.骑士卡片.includes(name)))].slice(0, DECADE_RIDER_CARDS.length);
  if (!Array.isArray(decade.已巡游世界)) decade.已巡游世界 = [];
  decade.已巡游世界 = [...new Set(decade.已巡游世界.filter(name => DECADE_TOUR_WORLDS.includes(name)))];

  if (migrateLegacy) {
    const legacy = LEGACY_AVATARS[player.灵根?.name];
    if (legacy) {
      const firstMigration = !system.已绑定;
      system.已绑定 = true;
      if (firstMigration) {
        system.镜能 = MIRROR_TIER_CONFIG[system.镜阶].energyMax;
        system.镜能日期 = getChinaDate(now);
      }
      addUnique(system.已解锁世界, legacy.world);
      addUnique(system.世界印记, legacy.world);
      upsertAvatar(player, { ...legacy, root: player.灵根 });
      system.当前化身 = legacy.name;
      if (legacy.name === '木之本樱') sakura.基础化身已解锁 = true;
      if (legacy.name === '鹿目圆') madoka.基础化身已解锁 = true;
      if (legacy.name === '门矢士') {
        decade.基础化身已解锁 = true;
        if (legacy.stage >= 2) decade.帝骑已解锁 = true;
        if (legacy.stage >= 3) decade.神主已解锁 = true;
        if (legacy.stage >= 4) {
          decade.终极神主已解锁 = true;
          decade.终极卡试炼 = true;
        }
      }
    }
  }

  if (system.已绑定) {
    for (const [world, tier] of Object.entries(WORLD_MIN_MIRROR_TIER)) {
      if (tier <= system.镜阶) addUnique(system.已解锁世界, world);
    }
    const today = getChinaDate(now);
    if (system.镜能日期 !== today) {
      system.镜能 = MIRROR_TIER_CONFIG[system.镜阶].energyMax;
      system.镜能日期 = today;
    } else {
      system.镜能 = Math.min(system.镜能, MIRROR_TIER_CONFIG[system.镜阶].energyMax);
    }
  }
  ensureSakuraCardSystem(player);
  ensureMadokaHopeSystem(player);
  return system;
}

export function bindBasicZhutianMirror(player, { now = Date.now() } = {}) {
  const system = ensureZhutianMirrorSystem(player, { now });
  const firstBind = !system.已绑定;
  system.已绑定 = true;
  system.镜能日期 = getChinaDate(now);
  system.镜能 = MIRROR_TIER_CONFIG[system.镜阶].energyMax;
  addUnique(system.已解锁世界, '魔卡少女樱');
  if (!firstBind) system.材料.镜尘 += 25;
  return { firstBind, system };
}

export function getWorldMinimumMirrorTier(worldName) {
  return WORLD_MIN_MIRROR_TIER[worldName] || 1;
}

export function consumeMirrorEnergy(player, amount = 1, { now = Date.now() } = {}) {
  const system = ensureZhutianMirrorSystem(player, { now });
  const cost = Math.max(1, asNonNegativeInteger(amount));
  if (!system.已绑定) return { ok: false, reason: 'unbound', system };
  if (system.镜能 < cost) return { ok: false, reason: 'energy', system };
  system.镜能 -= cost;
  return { ok: true, cost, system };
}

export function refundMirrorEnergy(player, amount = 1, { now = Date.now() } = {}) {
  const system = ensureZhutianMirrorSystem(player, { now });
  system.镜能 = Math.min(
    MIRROR_TIER_CONFIG[system.镜阶].energyMax,
    system.镜能 + Math.max(1, asNonNegativeInteger(amount)),
  );
  return system.镜能;
}

export function addMirrorRelic(player, name, amount = 1, { now = Date.now() } = {}) {
  const system = ensureZhutianMirrorSystem(player, { now });
  system.异界遗物[name] = (system.异界遗物[name] || 0) + Math.max(1, asNonNegativeInteger(amount));
  return system.异界遗物[name];
}

export function recordProjectionMirrorProgress(
  player,
  worldName,
  { difficulty = 1, endingType = 'neutral', now = Date.now() } = {},
) {
  const system = ensureZhutianMirrorSystem(player, { now });
  if (endingType === 'bad') return { gained: false, newMark: false, 镜尘: 0, 世界残响: 0, 位面晶核: 0, 时空锚: 0, 诸天镜心: 0 };

  const worldTier = getWorldMinimumMirrorTier(worldName);
  const value = Math.max(1, asNonNegativeInteger(difficulty));
  const rewards = {
    gained: true,
    newMark: !system.世界印记.includes(worldName),
    镜尘: 4 + value,
    世界残响: Math.max(1, Math.floor(value / 2)),
    位面晶核: worldTier >= 2 ? 1 : 0,
    时空锚: worldTier >= 4 ? 1 : 0,
    诸天镜心: worldTier >= 6 && endingType === 'good' ? 1 : 0,
  };
  addUnique(system.世界印记, worldName);
  for (const name of MATERIAL_NAMES) system.材料[name] += rewards[name];
  return rewards;
}

export function refineZhutianMirror(player, { now = Date.now() } = {}) {
  const system = ensureZhutianMirrorSystem(player, { now });
  if (!system.已绑定) return { ok: false, reason: 'unbound', system };
  if (system.镜阶 >= 7) return { ok: false, reason: 'max', system };

  const requirement = MIRROR_REFINEMENT_REQUIREMENTS[system.镜阶];
  const missing = [];
  for (const [name, amount] of Object.entries(requirement)) {
    const current = name === '世界印记' ? system.世界印记.length : system.材料[name];
    if (current < amount) missing.push({ name, current, amount });
  }
  if (missing.length > 0) return { ok: false, reason: 'materials', missing, requirement, system };

  for (const [name, amount] of Object.entries(requirement)) {
    if (name !== '世界印记') system.材料[name] -= amount;
  }
  system.镜阶 += 1;
  system.镜能 = MIRROR_TIER_CONFIG[system.镜阶].energyMax;
  for (const [world, tier] of Object.entries(WORLD_MIN_MIRROR_TIER)) {
    if (tier <= system.镜阶) addUnique(system.已解锁世界, world);
  }
  return { ok: true, tier: system.镜阶, system };
}

function tryUnlockSakuraAvatar(player) {
  const system = player.诸天镜系统;
  const progress = system.世界进度.魔法少女樱;
  const cards = player.库洛牌系统.已封印库洛牌;
  if (progress.基础化身已解锁 || !progress.封印之钥 || !SAKURA_REQUIRED_CARDS.every(card => cards.includes(card))) {
    return false;
  }
  progress.基础化身已解锁 = true;
  addUnique(system.世界印记, '魔卡少女樱');
  upsertAvatar(player, { name: '木之本樱', world: '魔卡少女樱', stage: 1, root: SAKURA_BASE_ROOT });
  return true;
}

export function exploreTomoeda(
  player,
  locationName,
  { now = Date.now(), random = Math.random, consumeEnergy = true, keyChance = 0.14, cardChance = 0.65 } = {},
) {
  const system = ensureZhutianMirrorSystem(player, { now });
  const location = TOMOEDA_LOCATIONS[locationName];
  if (!location) return { ok: false, reason: 'location', system };
  if (!system.已绑定) return { ok: false, reason: 'unbound', system };
  if (system.镜阶 < location.minTier) {
    return { ok: false, reason: 'tier', requiredTier: location.minTier, system };
  }
  if (consumeEnergy) {
    const consumed = consumeMirrorEnergy(player, 1, { now });
    if (!consumed.ok) return consumed;
  }

  const progress = system.世界进度.魔法少女樱;
  progress.有效探索次数 += 1;
  progress.探索度 = Math.min(100, progress.探索度 + 8);
  player.库洛牌系统.总探索次数 += 1;

  const combo = player.库洛牌系统.当前组合;
  let dust = 4 + Math.floor(random() * 3);
  let echo = random() < 0.35 ? 1 : 0;
  if (combo === '元素共鸣') {
    dust += 3;
    echo = 1;
  }
  system.材料.镜尘 += dust;
  system.材料.世界残响 += echo;

  let keyFound = false;
  if (!progress.封印之钥 && progress.有效探索次数 >= 3) {
    if (progress.有效探索次数 >= 8 || random() < keyChance) {
      progress.封印之钥 = true;
      keyFound = true;
    }
  }

  let card = null;
  const unowned = location.cards.filter(name => !player.库洛牌系统.已封印库洛牌.includes(name));
  if (unowned.length > 0 && random() < (combo === '疾风封印' ? 1 : cardChance)) {
    card = unowned[Math.floor(random() * unowned.length)];
    player.库洛牌系统.已封印库洛牌.push(card);
    player.库洛牌系统.魔法熟练度 += 5;
  }
  if (combo === '梦境回廊') player.库洛牌系统.魔法熟练度 += 3;

  const unlocked = tryUnlockSakuraAvatar(player);
  return {
    ok: true,
    location: locationName,
    dust,
    echo,
    keyFound,
    card,
    combo,
    unlocked,
    progress: progress.探索度,
    remainingEnergy: system.镜能,
    system,
  };
}

function tryUnlockMadokaAvatar(player) {
  const system = player.诸天镜系统;
  const progress = system.世界进度.魔法少女小圆;
  if (progress.基础化身已解锁 || !progress.灵魂宝石 || progress.因果碎片 < 3) return false;
  progress.基础化身已解锁 = true;
  addUnique(system.世界印记, '魔法少女小圆');
  upsertAvatar(player, { name: '鹿目圆', world: '魔法少女小圆', stage: 1, root: MADOKA_BASE_ROOT });
  return true;
}

export function exploreMitakihara(
  player,
  locationName,
  { now = Date.now(), random = Math.random, consumeEnergy = true, gemChance = 0.14, griefSeedChance = 0.35 } = {},
) {
  const system = ensureZhutianMirrorSystem(player, { now });
  const location = MITAKIHARA_LOCATIONS[locationName];
  if (!location) return { ok: false, reason: 'location', system };
  if (!system.已绑定) return { ok: false, reason: 'unbound', system };
  if (system.镜阶 < location.minTier) return { ok: false, reason: 'tier', requiredTier: location.minTier, system };
  if (consumeEnergy) {
    const consumed = consumeMirrorEnergy(player, 1, { now });
    if (!consumed.ok) return consumed;
  }

  const progress = system.世界进度.魔法少女小圆;
  const hope = ensureMadokaHopeSystem(player);
  progress.有效探索次数 += 1;
  progress.探索度 = Math.min(100, progress.探索度 + 8);
  progress.因果碎片 += 1;

  const dust = 5 + Math.floor(random() * 4);
  const echo = random() < 0.45 ? 1 : 0;
  system.材料.镜尘 += dust;
  system.材料.世界残响 += echo;

  const griefSeed = random() < griefSeedChance;
  if (griefSeed) progress.悲叹之种 += 1;
  const hopeShards = location.hopeShards + (griefSeed ? 5 : 0);
  const despairPurified = location.despairPurified + (griefSeed ? 10 : 0);
  hope.希望碎片 += hopeShards;
  hope.净化绝望值 += despairPurified;
  if (progress.有效探索次数 % 3 === 0) hope.因果律领悟 += 1;

  let gemFound = false;
  if (!progress.灵魂宝石 && progress.有效探索次数 >= 3) {
    if (progress.有效探索次数 >= 8 || random() < gemChance) {
      progress.灵魂宝石 = true;
      gemFound = true;
    }
  }

  let corruptionGain = 0;
  let timelineCollapsed = false;
  if (progress.灵魂宝石) {
    corruptionGain = location.corruption;
    progress.灵魂宝石污浊度 += corruptionGain;
    if (progress.灵魂宝石污浊度 >= 100) {
      progress.灵魂宝石污浊度 = 50;
      progress.时间线重置次数 += 1;
      timelineCollapsed = true;
    }
  }

  const unlocked = tryUnlockMadokaAvatar(player);
  return {
    ok: true,
    location: locationName,
    dust,
    echo,
    griefSeed,
    hopeShards,
    despairPurified,
    gemFound,
    corruptionGain,
    timelineCollapsed,
    unlocked,
    progress: progress.探索度,
    remainingEnergy: system.镜能,
    system,
  };
}

export function purifyMadokaSoulGem(player, { now = Date.now() } = {}) {
  const system = ensureZhutianMirrorSystem(player, { now });
  const progress = system.世界进度.魔法少女小圆;
  if (!progress.灵魂宝石) return { ok: false, reason: 'gem', system };
  if (progress.悲叹之种 < 1) return { ok: false, reason: 'seed', system };
  if (progress.灵魂宝石污浊度 <= 0) return { ok: false, reason: 'clean', system };
  const before = progress.灵魂宝石污浊度;
  progress.悲叹之种 -= 1;
  progress.灵魂宝石污浊度 = Math.max(0, before - 40);
  ensureMadokaHopeSystem(player).净化绝望值 += 20;
  return { ok: true, before, after: progress.灵魂宝石污浊度, system };
}

export function resetMitakiharaTimeline(player, { now = Date.now(), consumeEnergy = true } = {}) {
  const system = ensureZhutianMirrorSystem(player, { now });
  const progress = system.世界进度.魔法少女小圆;
  if (!progress.灵魂宝石) return { ok: false, reason: 'gem', system };
  if (progress.灵魂宝石污浊度 < 60) return { ok: false, reason: 'corruption', system };
  if (consumeEnergy) {
    const consumed = consumeMirrorEnergy(player, 1, { now });
    if (!consumed.ok) return consumed;
  }
  const before = progress.灵魂宝石污浊度;
  progress.灵魂宝石污浊度 = 0;
  progress.时间线重置次数 += 1;
  ensureMadokaHopeSystem(player).时间线干涉 += 1;
  system.材料.镜尘 += 8;
  return { ok: true, before, remainingEnergy: system.镜能, system };
}

function tryUnlockDecadeAvatar(player) {
  const system = player.诸天镜系统;
  const progress = system.世界进度.假面骑士帝骑;
  let unlocked = false;
  let advanced = false;
  let godMasterUnlocked = false;
  let rootChanged = false;
  let realmBlocked = null;

  if (!progress.基础化身已解锁 && progress.帝骑驱动器 && progress.骑士卡片.length >= 3) {
    progress.基础化身已解锁 = true;
    addUnique(system.世界印记, '假面骑士帝骑');
    upsertAvatar(player, { name: '门矢士', world: '假面骑士帝骑', stage: 1, root: DECADE_BASE_ROOT });
    unlocked = true;
  }
  if (progress.基础化身已解锁 && !progress.帝骑已解锁 && progress.骑士卡片.length === DECADE_RIDER_CARDS.length) {
    const realm = inspectZhutianAvatarAdvancement(player, 2);
    if (!realm.ok) {
      realmBlocked = realm;
    } else {
      progress.帝骑已解锁 = true;
      upsertAvatar(player, { name: '门矢士', world: '假面骑士帝骑', stage: 2, root: DECADE_ROOT });
      if (system.当前化身 === '门矢士' && player.灵根?.name === '门矢士') {
        player.灵根 = clone(DECADE_ROOT);
        rootChanged = true;
      }
      advanced = true;
    }
  }
  if (progress.帝骑已解锁 && !progress.神主已解锁 && progress.神主触屏碎片 >= 10) {
    const realm = inspectZhutianAvatarAdvancement(player, 3);
    if (!realm.ok) {
      realmBlocked = realm;
    } else {
      progress.神主已解锁 = true;
      upsertAvatar(player, { name: '门矢士', world: '假面骑士帝骑', stage: 3, root: DECADE_GOD_MASTER_ROOT });
      if (system.当前化身 === '门矢士' && ['门矢士', '帝骑'].includes(player.灵根?.name)) {
        player.灵根 = clone(DECADE_GOD_MASTER_ROOT);
        rootChanged = true;
      }
      godMasterUnlocked = true;
    }
  }
  return { unlocked, advanced, godMasterUnlocked, rootChanged, realmBlocked };
}

export function setDecadeCardDeck(player, cards, { now = Date.now() } = {}) {
  const system = ensureZhutianMirrorSystem(player, { now });
  const progress = system.世界进度.假面骑士帝骑;
  const selected = [...new Set(cards.filter(Boolean))];
  if (selected.length !== 3 || cards.length !== 3) return { ok: false, reason: 'count', system };
  const missing = selected.filter(card => !progress.骑士卡片.includes(card));
  if (missing.length > 0) return { ok: false, reason: 'card', missing, system };
  progress.出战卡组 = selected;
  return { ok: true, cards: selected, system };
}

export function exploreDecadeWorld(
  player,
  locationName,
  { now = Date.now(), random = Math.random, consumeEnergy = true, driverChance = 0.14 } = {},
) {
  const system = ensureZhutianMirrorSystem(player, { now });
  const location = DECADE_LOCATIONS[locationName];
  if (!location) return { ok: false, reason: 'location', system };
  if (!system.已绑定) return { ok: false, reason: 'unbound', system };
  if (system.镜阶 < location.minTier) return { ok: false, reason: 'tier', requiredTier: location.minTier, system };
  const progress = system.世界进度.假面骑士帝骑;
  if (progress.世界融合度 >= 100) return { ok: false, reason: 'crisis', system };
  if (consumeEnergy) {
    const consumed = consumeMirrorEnergy(player, 1, { now });
    if (!consumed.ok) return consumed;
  }

  progress.有效探索次数 += 1;
  progress.探索度 = Math.min(100, progress.探索度 + 8);

  const dust = 6 + Math.floor(random() * 4);
  const echo = random() < 0.5 ? 1 : 0;
  system.材料.镜尘 += dust;
  system.材料.世界残响 += echo;

  let card = null;
  const unowned = location.cards.filter(name => !progress.骑士卡片.includes(name));
  if (unowned.length > 0) {
    card = unowned[Math.floor(random() * unowned.length)];
    progress.骑士卡片.push(card);
  }
  progress.共鸣度 += card ? 10 : 4;

  const fusionGain = 8 + Math.floor(random() * 5);
  progress.世界融合度 = Math.min(100, progress.世界融合度 + fusionGain);

  let driverFound = false;
  if (!progress.帝骑驱动器 && progress.有效探索次数 >= 3) {
    if (progress.有效探索次数 >= 8 || random() < driverChance) {
      progress.帝骑驱动器 = true;
      driverFound = true;
    }
  }

  let touchFragment = false;
  const advancedLocation = locationName === '大修卡基地' || locationName === '极光帷幕深处';
  if (advancedLocation && progress.神主触屏碎片 < 10) {
    progress.碎片保底计数 += 1;
    if (progress.碎片保底计数 >= 3 || random() < 0.35) {
      progress.神主触屏碎片 += 1;
      progress.碎片保底计数 = 0;
      touchFragment = true;
    }
  }

  const avatar = tryUnlockDecadeAvatar(player);
  let touredWorld = null;
  if (advancedLocation && progress.神主已解锁) {
    const unvisited = DECADE_TOUR_WORLDS.filter(name => !progress.已巡游世界.includes(name));
    if (unvisited.length > 0) {
      touredWorld = unvisited[Math.floor(random() * unvisited.length)];
      progress.已巡游世界.push(touredWorld);
      progress.共鸣度 += 10;
    }
  }
  return {
    ok: true,
    location: locationName,
    dust,
    echo,
    card,
    driverFound,
    touchFragment,
    touredWorld,
    fusionGain,
    crisis: progress.世界融合度 >= 100,
    ...avatar,
    progress: progress.探索度,
    remainingEnergy: system.镜能,
    system,
  };
}

export function executeFinalAttackRide(player, { now = Date.now(), consumeEnergy = true } = {}) {
  const system = ensureZhutianMirrorSystem(player, { now });
  const progress = system.世界进度.假面骑士帝骑;
  if (!system.已绑定) return { ok: false, reason: 'unbound', system };
  if (system.镜阶 < 3) return { ok: false, reason: 'tier', requiredTier: 3, system };
  if (progress.出战卡组.length === 0) return { ok: false, reason: 'deck', system };
  if (progress.世界融合度 < 60) return { ok: false, reason: 'fusion', current: progress.世界融合度, system };
  if (consumeEnergy) {
    const consumed = consumeMirrorEnergy(player, 1, { now });
    if (!consumed.ok) return consumed;
  }
  const before = progress.世界融合度;
  progress.世界融合度 = Math.max(0, before - 70);
  progress.融合危机次数 += 1;
  progress.共鸣度 += 20;
  system.材料.镜尘 += 12;
  system.材料.世界残响 += 2;
  return {
    ok: true,
    cards: [...progress.出战卡组],
    before,
    after: progress.世界融合度,
    remainingEnergy: system.镜能,
    system,
  };
}

export function challengeUltimateCardTrial(player, route, { now = Date.now(), consumeEnergy = true } = {}) {
  const system = ensureZhutianMirrorSystem(player, { now });
  const progress = system.世界进度.假面骑士帝骑;
  if (progress.终极神主已解锁) return { ok: false, reason: 'completed', system };
  if (!progress.神主已解锁) return { ok: false, reason: 'stage', system };
  if (progress.已巡游世界.length < DECADE_TOUR_WORLDS.length) {
    return { ok: false, reason: 'tour', current: progress.已巡游世界.length, required: DECADE_TOUR_WORLDS.length, system };
  }
  if (!['强攻', '共鸣', '守护'].includes(route)) return { ok: false, reason: 'route', system };
  if (route === '强攻' && progress.共鸣度 < 220) return { ok: false, reason: 'resonance', current: progress.共鸣度, required: 220, system };
  if (route === '共鸣' && progress.出战卡组.length === 0) return { ok: false, reason: 'deck', system };
  if (route === '守护' && progress.融合危机次数 < 1) return { ok: false, reason: 'battle', system };
  const realm = inspectZhutianAvatarAdvancement(player, 4);
  if (!realm.ok) return { ok: false, reason: 'realm', realmBlocked: realm, system };
  if (consumeEnergy) {
    const consumed = consumeMirrorEnergy(player, 1, { now });
    if (!consumed.ok) return consumed;
  }

  progress.终极卡试炼 = true;
  progress.终极神主已解锁 = true;
  upsertAvatar(player, { name: '门矢士', world: '假面骑士帝骑', stage: 4, root: DECADE_ULTIMATE_ROOT });
  let rootChanged = false;
  if (system.当前化身 === '门矢士' && ['门矢士', '帝骑', '帝骑·神主'].includes(player.灵根?.name)) {
    player.灵根 = clone(DECADE_ULTIMATE_ROOT);
    rootChanged = true;
  }
  return { ok: true, route, rootChanged, remainingEnergy: system.镜能, system };
}

export function loadZhutianAvatar(player, avatarName, { now = Date.now() } = {}) {
  const system = ensureZhutianMirrorSystem(player, { now });
  if (!system.已绑定) return { ok: false, reason: 'unbound', system };

  if (avatarName === '本源') {
    if (!system.本源灵根) return { ok: false, reason: 'origin', system };
    player.灵根 = clone(system.本源灵根);
    delete system.当前化身;
    return { ok: true, name: '本源', root: player.灵根, system };
  }

  const avatar = player.诸天化身谱.find(item => item.name === avatarName);
  if (!avatar) return { ok: false, reason: 'avatar', system };
  // 本源灵根可能已通过进阶或重塑发生变化，装载化身前刷新当前本源快照。
  if (!system.当前化身 && player.灵根) system.本源灵根 = clone(player.灵根);
  player.灵根 = clone(avatar.root);
  system.当前化身 = avatar.name;
  return { ok: true, name: avatar.name, root: player.灵根, system };
}

export function syncCurrentZhutianAvatar(player, { now = Date.now() } = {}) {
  const system = ensureZhutianMirrorSystem(player, { now, migrateLegacy: false });
  const legacy = LEGACY_AVATARS[player.灵根?.name];
  if (!legacy) return false;
  upsertAvatar(player, { ...legacy, root: player.灵根 });
  system.当前化身 = legacy.name;
  addUnique(system.已解锁世界, legacy.world);
  addUnique(system.世界印记, legacy.world);
  if (legacy.name === '门矢士') {
    const progress = system.世界进度.假面骑士帝骑;
    progress.基础化身已解锁 = true;
    if (legacy.stage >= 2) progress.帝骑已解锁 = true;
    if (legacy.stage >= 3) progress.神主已解锁 = true;
    if (legacy.stage >= 4) {
      progress.终极神主已解锁 = true;
      progress.终极卡试炼 = true;
    }
  }
  return true;
}
