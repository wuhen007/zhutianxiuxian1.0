import { hasSuiyunAuthority } from './suiyunAuthority.js';
import { getMemoryDungeonCost } from './memoryPath.js';

function withRewardTiers(dungeon) {
  const level = Math.max(1, Number(dungeon.requiredLevel) || 1);
  const fruit = level >= 14 ? '祖种异果' : level >= 7 ? '本源异果' : '进化异果';
  const three = [{ name: dungeon.gongfa, class: '功法', amount: 1 }];
  if (dungeon.herbChance) three.push({ name: '本源圣药', class: '道具', amount: 1 });
  return Object.freeze({
    ...dungeon,
    one: Object.freeze([{ name: dungeon.medium, class: '道具', amount: 1 }]),
    two: Object.freeze([{ name: fruit, class: '道具', amount: 1 }]),
    three: Object.freeze(three.map(Object.freeze)),
  });
}

export const SHENGXU_DUNGEONS = Object.freeze([
  Object.freeze({ chapter: '地球篇', name: '太行山', requiredLevel: 2, monster: '太行苍狼', scale: 0.68, medium: '普通进化花粉', amount: 2, accumulation: 6, gongfa: '形意呼吸法', gongfaChance: 0.12, duration: 7, skills: [{ name: '大力牛魔拳', chance: 0.15 }, { name: '共振术', chance: 0.08 }] }),
  Object.freeze({ chapter: '地球篇', name: '昆仑山', requiredLevel: 2, monster: '昆仑兽王', scale: 0.72, medium: '普通进化花粉', amount: 2, accumulation: 8, gongfa: '形意呼吸法', gongfaChance: 0.18, duration: 7, skills: [{ name: '终极拳', chance: 0.15 }, { name: '螺旋术', chance: 0.08 }] }),
  Object.freeze({ chapter: '地球篇', name: '武当山', requiredLevel: 3, monster: '金顶异禽王', scale: 0.78, medium: '普通进化花粉', amount: 3, accumulation: 8, gongfa: '太极呼吸法', gongfaChance: 0.18, duration: 7, skills: [{ name: '闪电拳', chance: 0.15 }] }),
  Object.freeze({ chapter: '地球篇', name: '龙虎山', requiredLevel: 4, monster: '枷锁古猿', scale: 0.86, medium: '灵性进化花粉', amount: 1, accumulation: 10, gongfa: '太极呼吸法', gongfaChance: 0.14, duration: 7, skills: [{ name: '火眼金睛', chance: 0.12 }] }),
  Object.freeze({ chapter: '地球篇', name: '嵩山', requiredLevel: 4, monster: '嵩山老猿', scale: 0.88, medium: '灵性进化花粉', amount: 1, accumulation: 10, gongfa: '大雷音呼吸法', gongfaChance: 0.06, duration: 7, skills: [{ name: '大日如来拳', chance: 0.12 }] }),
  Object.freeze({ chapter: '地球篇', name: '终南山', requiredLevel: 5, monster: '异树守卫', scale: 0.92, medium: '灵性进化花粉', amount: 1, accumulation: 11, gongfa: '道引呼吸法', gongfaChance: 0.04, duration: 7, skills: [{ name: '不灭经·护身', chance: 0.12 }] }),
  Object.freeze({ chapter: '地球篇', name: '泰山', requiredLevel: 5, monster: '封禅异禽王', scale: 0.95, medium: '灵性进化花粉', amount: 2, accumulation: 11, gongfa: '道引呼吸法', gongfaChance: 0.05, duration: 7, skills: [{ name: '大力牛魔拳', chance: 0.1 }, { name: '终极拳', chance: 0.08 }] }),
  Object.freeze({ chapter: '地球篇', name: '顺天玉虚宫', requiredLevel: 6, monster: '失控异变体', scale: 0.98, medium: '灵性进化花粉', amount: 2, accumulation: 12, gongfa: '形意呼吸法', gongfaChance: 0.1, duration: 7, skills: [{ name: '火眼金睛', chance: 0.1 }, { name: '闪电拳', chance: 0.08 }] }),
  Object.freeze({ chapter: '地球篇', name: '大雷音寺遗址', requiredLevel: 6, monster: '雷音尸魔', scale: 1, medium: '灵性进化花粉', amount: 2, accumulation: 12, gongfa: '大雷音呼吸法', gongfaChance: 0.1, duration: 7, skills: [{ name: '大日如来拳', chance: 0.1 }, { name: '不灭经·护身', chance: 0.08 }] }),
  Object.freeze({ chapter: '星路篇', name: '小阴间星路', requiredLevel: 8, monster: '星路猎杀者', scale: 1.1, medium: '神性进化花粉', amount: 1, accumulation: 16, gongfa: '道引呼吸法', gongfaChance: 0.07, duration: 10, fieldPage: true, skills: [{ name: '寒霜覆地', chance: 0.1 }, { name: '七妙宝术·土', chance: 0.1 }, { name: '少阴拳', chance: 0.07 }, { name: '少阳拳', chance: 0.06 }] }),
  Object.freeze({ chapter: '阳间篇', name: '阳间名山', requiredLevel: 11, monster: '阳间神祇', scale: 1.22, medium: '神性进化花粉', amount: 2, accumulation: 20, gongfa: '道引呼吸法', gongfaChance: 0.1, duration: 15, herbChance: 0.05, fieldPage: true, skills: [{ name: '七妙宝术·金', chance: 0.08 }, { name: '七妙宝术·火', chance: 0.08 }, { name: '场域法·镇', chance: 0.06 }, { name: '魂钟精神攻杀术', chance: 0.05 }, { name: '五色神光', chance: 0.04 }, { name: '金色符文秘术', chance: 0.03 }] }),
  Object.freeze({ chapter: '诡异篇', name: '魂河古地', requiredLevel: 17, monster: '魂河接引者', scale: 1.38, medium: '无暇进化花粉', amount: 1, accumulation: 28, gongfa: '盗引呼吸法', gongfaChance: 0.03, duration: 20, herbChance: 0.1, fieldPage: true, skills: [{ name: '七妙宝术·水', chance: 0.06 }, { name: '七妙宝术·木', chance: 0.06 }, { name: '七妙宝术·阴', chance: 0.08 }, { name: '七妙宝术·阳', chance: 0.08 }, { name: '时间妙术', chance: 0.05 }, { name: '时光术', chance: 0.03 }, { name: '小六道时光术', chance: 0.03 }, { name: '斩千秋', chance: 0.025 }, { name: '九宝妙术', chance: 0.015 }] }),
].map(withRewardTiers));

// 呼吸法下本提速：呼吸法越精深，圣墟探索归来越快
export const BREATHING_TIME_REDUCTION = Object.freeze({
  基础呼吸法: 0,
  形意呼吸法: 1,
  太极呼吸法: 2,
  大雷音呼吸法: 3,
  道引呼吸法: 4,
  盗引呼吸法: 5,
});

// 圣墟唯一机缘：祖种掉落率保持在千分之一量级，仅由圣墟探索结算抽取。
export const FLOWER_ANCESTOR_SEED_DROP_CHANCE = 0.0012;

export const SHENGXU_EXPLORE_MIN_DURATION_MIN = 5;

export function getShengxuDungeonPlane(dungeon) {
  return ['阳间篇', '诡异篇'].includes(dungeon?.chapter) ? '阳间' : '小阴间';
}

/** 入场成本随花粉境界与怪物强度增长，寿元成本随基础探索时长增长。 */
export function getShengxuExploreCost(dungeon, player) {
  const level = Math.max(1, Math.trunc(Number(dungeon?.requiredLevel) || 1));
  const scale = Math.max(0.1, Number(dungeon?.scale) || 1);
  return {
    xiuwei: getMemoryDungeonCost(player, Math.max(1, Math.round(1000000 * level * scale))),
    xueqi: getMemoryDungeonCost(player, Math.max(1, Math.round(1000000 * level * scale))),
    lingshi: getMemoryDungeonCost(player, Math.max(1, Math.round(500000 * level * scale))),
    shouyuan: getMemoryDungeonCost(player, Math.max(1, Math.ceil((Number(dungeon?.duration) || 5) / 5))),
  };
}

export function getShengxuExploreShortages(player, cost) {
  const fields = [
    ['修为', 'xiuwei'],
    ['血气', 'xueqi'],
    ['灵石', 'lingshi'],
    ['寿元', 'shouyuan'],
  ];
  return fields
    .filter(([field, key]) => (Number(player?.[field]) || 0) < cost[key])
    .map(([field, key]) => `${field}需${cost[key].toLocaleString()}，现有${Math.max(0, Number(player?.[field]) || 0).toLocaleString()}`);
}

/** 圣墟探索耗时 = 副本基础时长 − 呼吸法提速（下限 5 分钟） */
export function getShengxuExploreDuration(player, dungeon) {
  const base = Math.max(1, Math.trunc(Number(dungeon?.duration) || 15));
  const learned = Array.isArray(player?.学习的功法) ? player.学习的功法 : [];
  const reduction = Object.entries(BREATHING_TIME_REDUCTION)
    .filter(([name]) => learned.includes(name))
    .reduce((max, [, value]) => Math.max(max, value), 0);
  return Math.max(1 / 60, Math.max(SHENGXU_EXPLORE_MIN_DURATION_MIN, base - reduction) - (hasSuiyunAuthority(player, '天空') ? 1 : 0));
}

export const SHENGXU_FACTIONS = Object.freeze({
  菩提基因: Object.freeze({ position: '外勤进化者', requiredLevel: 2, medium: '普通进化花粉', amount: 3, dew: 0, accumulation: 5 }),
  大梦净土: Object.freeze({ position: '外门弟子', requiredLevel: 8, medium: '灵性进化花粉', amount: 2, dew: 1, accumulation: 10 }),
  阳间第一山: Object.freeze({ position: '记名门徒', requiredLevel: 12, medium: '神性进化花粉', amount: 1, dew: 2, accumulation: 15 }),
});

export function getShengxuDungeon(name) {
  return SHENGXU_DUNGEONS.find(dungeon => dungeon.name === String(name || '').trim()) || null;
}

export function createShengxuMonster(player, dungeon) {
  const maxHealth = Math.max(1, Number(player?.血量上限 || player?.当前血量) || 1);
  const scale = Math.max(0.1, Number(dungeon?.scale) || 1);
  return {
    名号: dungeon?.monster || '异变生灵',
    攻击: Math.max(1, Math.trunc((Number(player?.攻击) || 1) * scale)),
    防御: Math.max(1, Math.trunc((Number(player?.防御) || 1) * scale)),
    当前血量: Math.max(1, Math.trunc(maxHealth * scale)),
    血量上限: Math.max(1, Math.trunc(maxHealth * scale)),
    暴击率: Math.max(0.1, Number(player?.暴击率) || 0.1),
    暴击伤害: Math.max(1.5, Number(player?.暴击伤害) || 1.5),
    速度: Math.max(100, Math.trunc((Number(player?.速度) || 100) * scale)),
    灵根: { name: '异变血脉', type: '妖体', 法球倍率: 1 },
    学习的功法: [],
    level_id: Math.max(1, Math.trunc(Number(player?.level_id) || 1)),
    Physique_id: Math.max(1, Math.trunc(Number(player?.Physique_id) || 1)),
    mijinglevel_id: 1,
    xiangulevel_id: 1,
    huafenlevel_id: dungeon?.requiredLevel || 1,
    修为: 0,
    血气: 0,
    元神: 0,
    神识: 0,
    _万灵魔幡不可炼化: true,
  };
}

export function resolveShengxuDungeonReward(dungeon, random = Math.random) {
  if (!dungeon) return null;
  const level = Math.max(1, Math.trunc(Number(dungeon.requiredLevel) || 1));
  return {
    medium: dungeon.medium,
    amount: dungeon.amount,
    accumulation: dungeon.accumulation,
    // 战斗成长收益：修为/血气/灵石随副本等级缩放
    xiuwei: 5000000 * level,
    xueqi: 5000000 * level,
    lingshi: 2000000 * level,
    // 异果是副本中的额外机缘，副本越深，掉落品质越高。
    fruit: Number(random()) < Math.min(0.28, 0.08 + level * 0.01)
      ? (level >= 14 ? '祖种异果' : level >= 7 ? '本源异果' : '进化异果')
      : '',
    // 本源圣药：阳间名山/魂河古地概率掉落（净化始祖污染度 −60）
    herb: Number(random()) < (dungeon.herbChance || 0) ? '本源圣药' : '',
    // 呼吸法传承：概率直接获得；另走残页收集（5 张合成，见下方）
    gongfa: Number(random()) < dungeon.gongfaChance ? dungeon.gongfa : '',
    ancestorSeed: Number(random()) < FLOWER_ANCESTOR_SEED_DROP_CHANCE ? '花粉路祖种' : '',
  };
}

/** 按常规副本的 one/two/three 级联概率抽取一项额外奖励。 */
export function resolveShengxuTierReward(dungeon, random = Math.random, rates = {}) {
  if (!dungeon) return null;
  const oneRate = Number.isFinite(Number(rates.one)) ? Number(rates.one) : 0.99;
  const twoRate = Number.isFinite(Number(rates.two)) ? Number(rates.two) : 0.5;
  const threeRate = Number.isFinite(Number(rates.three)) ? Number(rates.three) : 0.25;
  if (Number(random()) > oneRate) return null;
  let tier = 'one';
  if (Number(random()) <= twoRate) tier = Number(random()) <= threeRate ? 'three' : 'two';
  const pool = Array.isArray(dungeon[tier]) ? dungeon[tier] : [];
  if (!pool.length) return null;
  const index = Math.min(pool.length - 1, Math.floor(Math.max(0, Number(random()) || 0) * pool.length));
  return { ...pool[index], tier };
}

// ==== 呼吸法残页：副本刷取功法（每处每日一次 → 每日 1 张，5 张合成一本）====
export const BREATHING_PAGE_REQUIRE = 5;
export const BREATHING_PAGE_LEARNED_REWARD = 5; // 已学会时折现为进化积淀

export function ensureBreathingPages(player) {
  if (!player || typeof player !== 'object') return {};
  if (!player.呼吸法残页 || typeof player.呼吸法残页 !== 'object' || Array.isArray(player.呼吸法残页)) {
    player.呼吸法残页 = {};
  }
  return player.呼吸法残页;
}

/** 探索胜利拾取呼吸法残页；已学会该呼吸法则折现进化积淀 */
export function collectBreathingPage(player, gongfa) {
  const pages = ensureBreathingPages(player);
  if (!gongfa) return { ok: false, reason: 'no-gongfa' };
  if (Array.isArray(player?.学习的功法) && player.学习的功法.includes(gongfa)) {
    player.进化积淀 = Math.max(0, Number(player.进化积淀) || 0) + BREATHING_PAGE_LEARNED_REWARD;
    return { ok: true, gongfa, learned: true, reward: BREATHING_PAGE_LEARNED_REWARD, count: Number(pages[gongfa]) || 0, need: BREATHING_PAGE_REQUIRE };
  }
  pages[gongfa] = Math.max(0, Number(pages[gongfa]) || 0) + 1;
  return { ok: true, gongfa, learned: false, count: pages[gongfa], need: BREATHING_PAGE_REQUIRE };
}

/** 用 5 张残页合成指定呼吸法 */
export function synthesizeBreathingMethod(player, gongfa) {
  const pages = ensureBreathingPages(player);
  const count = Math.max(0, Number(pages[gongfa]) || 0);
  if (count < BREATHING_PAGE_REQUIRE) {
    return { ok: false, reason: 'insufficient', gongfa, count, need: BREATHING_PAGE_REQUIRE };
  }
  pages[gongfa] = count - BREATHING_PAGE_REQUIRE;
  player.学习的功法 ??= [];
  if (!player.学习的功法.includes(gongfa)) player.学习的功法.push(gongfa);
  return { ok: true, gongfa, remaining: pages[gongfa] };
}
