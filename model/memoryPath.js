import { getRealmAuthorityLevel } from './realmAuthority.js';
import { getActiveZhutianAvatarName } from './zhutianMirror.js';

export const MEMORY_DATA = '奇怪的数据';
export const MEMORY_TECHNIQUE = '六相冰封';
export const MEMORY_POEM = '记忆之诗篇';
export const MEMORY_DROP_CHANCE = .0001;
export const MEMORY_HOUR_MS = 3_600_000;
export const MEMORY_FACTORS = Object.freeze(['门径', '浪漫', '理性', '纷争', '诡计', '死亡', '天空', '海洋', '大地', '律法', '时间', '负世']);
export const MEMORY_STAGES = Object.freeze([
  { name: '金血之体', realm: 0, realmName: '无', cap: 3, life: 250, eff: 20, orb: 1.5, stats: 2 },
  { name: '逐火行者', realm: 10, realmName: '仙台大能', cap: 6, life: 600, eff: 100, orb: 3, stats: 10 },
  { name: '半神之体', realm: 12, realmName: '圣人', cap: 9, life: 1200, eff: 300, orb: 10, stats: 50 },
  { name: '无漏净子', realm: 16, realmName: '大帝', cap: 12, life: 2400, eff: 3000, orb: 100, stats: 500 },
  { name: '星神·记忆', realm: 20, realmName: '准仙帝', cap: 12, life: 5400, eff: 30000, orb: 1000, stats: 5000 },
].map(Object.freeze));
export const MEMORY_ROMANCE_SETS = Object.freeze([
  ['逐火之刃', '逐火之甲', '逐火圣杖'], ['泰坦之刃', '泰坦胸甲', '泰坦权杖'], ['星神长弓', '星神圣衣', '星神权杖'],
]);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positive = value => Math.max(0, finite(value));
const integer = value => Math.floor(positive(value));
const fail = reason => ({ ok: false, reason });
const roll = (min, max, random) => min + Math.floor(Math.max(0, Math.min(1 - Number.EPSILON, finite(random()))) * (max - min + 1));

export function getMemoryStage(player) {
  return MEMORY_STAGES.findIndex(stage => stage.name === player?.灵根?.name) + 1;
}

export function createMemoryRoot(stage) {
  const spec = MEMORY_STAGES[stage - 1];
  if (!spec) throw new RangeError('记忆命途阶段应为1至5');
  return { id: 7092000 + stage, name: spec.name, type: '记忆命途', 归类: '记忆命途', eff: spec.eff,
    法球倍率: spec.orb, 攻击: spec.stats, 防御: spec.stats, 生命: spec.stats, 生命本源: spec.life,
    稀有度: 10, 唯一灵根: true, 不可随机获取: true };
}

export function ensureMemoryState(player) {
  if (!player || typeof player !== 'object') throw new TypeError('玩家数据缺失');
  if (!player.记忆命途 || typeof player.记忆命途 !== 'object' || Array.isArray(player.记忆命途)) player.记忆命途 = {};
  const state = player.记忆命途;
  state.version = 1;
  state.因子 = Object.fromEntries(MEMORY_FACTORS.flatMap(name => {
    const tier = integer(state.因子?.[name]);
    return tier > 0 ? [[name, Math.min(3, tier)]] : [];
  }));
  state.逐火次数 = Math.min(12, integer(state.逐火次数));
  state.泰坦次数 = Math.min(12, integer(state.泰坦次数));
  state.秘境记录 = Array.isArray(state.秘境记录) ? [...new Set(state.秘境记录.map(String))].slice(-512) : [];
  state.炼化记录 = Array.isArray(state.炼化记录) ? [...new Set(state.炼化记录.map(String))] : [];
  player.模拟值 = Math.min(100, integer(player.模拟值));
  player.记忆棱镜 = integer(player.记忆棱镜);
  player.记忆碎片 = getMemoryFragments(player);
  return state;
}

export function getMemoryFactorTier(player, name) {
  if (!getMemoryStage(player) || !MEMORY_FACTORS.includes(name)) return 0;
  return Math.min(3, integer(player?.记忆命途?.因子?.[name]));
}

export function getMemoryLifeMaximum(player) {
  const stage = getMemoryStage(player);
  if (!stage) return 0;
  const tiers = MEMORY_FACTORS.map(name => getMemoryFactorTier(player, name));
  return MEMORY_STAGES[stage - 1].life + (stage <= 2 ? tiers.filter(Boolean).length * 100 : tiers.filter(tier => tier === 3).length * 200);
}

export function getMemoryEffects(player) {
  const stage = getMemoryStage(player);
  const tiers = MEMORY_FACTORS.map(name => getMemoryFactorTier(player, name));
  const count = tiers.filter(Boolean).length;
  const titan = tiers.filter(tier => tier === 3).length;
  const tier = name => getMemoryFactorTier(player, name);
  return {
    enlightenmentBonus: (stage >= 2 ? .2 : 0) + count * .03,
    tribulationReduction: Math.min(.95, (stage >= 2 ? .5 : 0) + count * .03),
    // 泰坦保留已获得因子的黄金基础，两个额外倍率取高，升级不倒扣已得收益。
    lootMultiplier: (stage >= 2 ? 3 : 1) + Math.max(Math.floor(count / 3) * 2, Math.floor(titan / 3) * 3),
    dungeonSpeed: [1, 2, 3, 5][tier('门径')],
    dungeonTimeMultiplier: 1 / [1, 2, 3, 5][tier('门径')],
    fishingMultiplier: [1, 2, 3, 4][tier('海洋')],
    plantGrowthMultiplier: [1, 1.5, 2, 3][tier('大地')],
    seedMultiplier: [1, 1.5, 2, 3][tier('大地')],
    learnCostMultiplier: [1, .5, 0, 0][tier('理性')],
    teachCooldownMultiplier: tier('理性') === 3 ? .5 : 1,
    refineProtectionGap: [0, 3, 4, 5][tier('天空')],
    guaranteedDrops: ['one', 'two', 'three'].slice(0, tier('律法')),
    factorCount: count, titanCount: titan, lifeMaximum: getMemoryLifeMaximum(player),
  };
}

export function canRefineMemoryTarget(attacker, target) {
  const gap = getMemoryEffects(target).refineProtectionGap;
  return gap === 0 || getRealmAuthorityLevel(attacker) > getRealmAuthorityLevel(target) + gap;
}

export function activateMemoryPath(player, { now = Date.now() } = {}) {
  if (getActiveZhutianAvatarName(player)) return fail('请先装载本源，再消耗奇怪的数据。');
  if (getMemoryStage(player) || player?.记忆命途?.已觉醒) return fail('记忆命途已经开启。');
  const state = ensureMemoryState(player);
  Object.assign(state, { 已觉醒: true, 觉醒时间: now });
  player.灵根 = createMemoryRoot(1);
  player.生命本源 = 250;
  player.linggenshow = 0;
  player.天资等级 = '星神之资';
  player.天资评价 = '演尽万象，铭刻诸世；等同无演无尽级天资。';
  return { ok: true, stage: 1, name: player.灵根.name };
}

export function advanceMemoryPath(player, { now = Date.now() } = {}) {
  const current = getMemoryStage(player);
  if (!current) return fail('请先消耗奇怪的数据，开启金血之体。');
  if (current >= 5) return fail('星神·记忆已经圆满。');
  const state = ensureMemoryState(player);
  const next = MEMORY_STAGES[current];
  if (getRealmAuthorityLevel(player) < next.realm) return fail(`下一阶段需要${next.realmName}级境界。`);
  const requiredFactors = [3, 6, 9, 12][current - 1];
  if (Object.keys(state.因子).length < requiredFactors) return fail(`晋升需要${requiredFactors}个因子。`);
  if (current === 2 && state.逐火次数 < 12) return fail('逐火之旅需完整完成12次。');
  if (current === 3 && state.泰坦次数 < 12) return fail('泰坦试炼需完整完成12次。');
  player.灵根 = createMemoryRoot(current + 1);
  player.生命本源 = getMemoryLifeMaximum(player);
  if (current + 1 >= 4 && !state.已获诗篇) {
    state.已获诗篇 = true;
    state.碎片结算时间 = now;
  }
  return { ok: true, stage: current + 1, name: next.name, grantPoem: current + 1 === 4 };
}

function factorResult(player, name, previousLife) {
  const maximum = getMemoryLifeMaximum(player);
  player.生命本源 = Math.min(maximum, positive(player.生命本源) + Math.max(0, maximum - previousLife));
  return { ok: true, factor: name, tier: getMemoryFactorTier(player, name), lifeMaximum: maximum,
    equipment: name === '浪漫' ? [...MEMORY_ROMANCE_SETS[getMemoryFactorTier(player, name) - 1]] : [] };
}

export function recordMemoryDungeon(player, { token, rounds = 1 } = {}) {
  if (!getMemoryStage(player) || !String(token || '') || !Number.isSafeInteger(rounds) || rounds <= 0) return { applied: false, gain: 0 };
  const state = ensureMemoryState(player);
  const id = String(token);
  if (state.秘境记录.includes(id)) return { applied: false, gain: 0 };
  state.秘境记录.push(id);
  state.秘境记录 = state.秘境记录.slice(-512);
  const previous = player.模拟值;
  player.模拟值 = Math.min(100, previous + rounds * 5);
  return { applied: true, gain: player.模拟值 - previous, progress: player.模拟值 };
}

export function simulateMemoryPath(player, { random = Math.random } = {}) {
  const stage = getMemoryStage(player);
  if (!stage) return fail('金血之体觉醒后才可命途模拟。');
  const state = ensureMemoryState(player);
  if (Object.keys(state.因子).length >= MEMORY_STAGES[stage - 1].cap) return fail('已达到本阶段因子上限，请以 #命途行进 晋升。');
  if (player.模拟值 < 100) return fail(`模拟值不足100%，当前${player.模拟值}%。`);
  const available = MEMORY_FACTORS.filter(name => !state.因子[name]);
  const name = available[roll(0, available.length - 1, random)];
  const before = getMemoryLifeMaximum(player);
  state.因子[name] = state.泰坦次数 >= 12 ? 3 : state.逐火次数 >= 12 ? 2 : 1;
  player.模拟值 -= 100;
  return factorResult(player, name, before);
}

export function runMemoryJourney(player, { now = Date.now(), random = Math.random } = {}) {
  if (getMemoryStage(player) < 2) return fail('逐火行者起可踏上逐火之旅。');
  const state = ensureMemoryState(player);
  if (state.逐火次数 >= 12) return fail('十二次逐火之旅已圆满。');
  if (!Object.keys(state.因子).length) return fail('请先获得黄金因子。');
  if (state.上次逐火 != null && now < state.上次逐火 + 6 * MEMORY_HOUR_MS) {
    return { ...fail('逐火之旅每现实6小时进行一次。'), retryAt: state.上次逐火 + 6 * MEMORY_HOUR_MS };
  }
  const before = getMemoryLifeMaximum(player);
  const candidates = MEMORY_FACTORS.filter(name => state.因子[name] === 1);
  const name = candidates.length ? candidates[roll(0, candidates.length - 1, random)] : '';
  if (name) state.因子[name] = 2;
  state.逐火次数++;
  state.上次逐火 = now;
  return { ...factorResult(player, name, before), progress: state.逐火次数, total: 12,
    message: name ? `${name}因子强化完成。` : '已持因子皆获强化，本次巩固逐火印记。' };
}

function titanEligibility(player, now) {
  if (getMemoryStage(player) < 3) return fail('半神之体起可进行泰坦试炼。');
  const state = ensureMemoryState(player);
  if (state.泰坦次数 >= 12) return fail('十二道泰坦试炼已圆满。');
  if (state.上次泰坦 != null && now < state.上次泰坦 + MEMORY_HOUR_MS) return { ...fail('泰坦试炼每现实小时可挑战一次。'), retryAt: state.上次泰坦 + MEMORY_HOUR_MS };
  return { ok: true, state };
}

export function buildMemoryTitanTrial(player, { now = Date.now() } = {}) {
  const check = titanEligibility(player, now);
  if (!check.ok) return check;
  const scale = .65 + check.state.泰坦次数 * .04;
  const hp = Math.max(1, finite(player.血量上限, 100));
  const enemy = { 名号: `泰坦记忆·第${check.state.泰坦次数 + 1}试炼`,
    攻击: Math.max(1, Math.floor(positive(player.攻击) * scale)), 防御: Math.floor(positive(player.防御) * scale),
    血量上限: hp * scale, 当前血量: hp * scale, 速度: 100, 暴击率: .1, 暴击伤害: 1.5,
    灵根: { name: '泰坦试炼投影', 法球倍率: 1 }, 法球倍率: 1, 学习的功法: [], 分身: [],
    mijinglevel_id: player.mijinglevel_id || 0, xiangulevel_id: player.xiangulevel_id || 0,
    huafenlevel_id: player.huafenlevel_id || 0, _万灵魔幡不可炼化: true };
  const attacker = structuredClone(player);
  attacker.当前血量 = hp;
  return { ok: true, index: check.state.泰坦次数, attacker, enemy };
}

export function applyMemoryTitanTrial(player, won, { now = Date.now(), random = Math.random, expectedIndex } = {}) {
  const check = titanEligibility(player, now);
  if (!check.ok) return check;
  const state = check.state;
  if (expectedIndex != null && expectedIndex !== state.泰坦次数) return fail('试炼进度已变化。');
  state.上次泰坦 = now;
  if (!won) return { ok: true, won: false, progress: state.泰坦次数, total: 12, message: '本次试炼失利，进度保留。' };
  const candidates = MEMORY_FACTORS.filter(name => state.因子[name] === 2);
  const name = candidates.length ? candidates[roll(0, candidates.length - 1, random)] : '';
  const before = getMemoryLifeMaximum(player);
  if (name) state.因子[name] = 3;
  state.泰坦次数++;
  return { ...factorResult(player, name, before), won: true, progress: state.泰坦次数, total: 12,
    message: name ? `${name}蜕变为泰坦因子。` : '已持强化因子皆化泰坦，本次巩固泰坦见证。' };
}

export function refineMemoryPath(player, { targetId, kind = '天骄', random = Math.random } = {}) {
  if (!getMemoryStage(player) || !player.学习的功法?.includes(MEMORY_TECHNIQUE)) return fail('需开启记忆命途并习得《六相冰封》。');
  if (!['玩家', '天骄', '灾厄'].includes(kind) || !String(targetId || '')) return fail('请指定真实已镇压的本源。');
  const state = ensureMemoryState(player);
  const key = `${kind}:${targetId}`;
  if (state.炼化记录.includes(key)) return fail('这份本源已经收入记忆。');
  const gain = roll(100, 300, random);
  player.记忆棱镜 += gain;
  state.炼化记录.push(key);
  return { ok: true, gain, prismGain: gain, lifeSourceGain: 0 };
}

export function cultivateMemoryPath(player, { now = Date.now(), random = Math.random } = {}) {
  if (!getMemoryStage(player)) return fail('请先开启记忆命途。');
  const state = ensureMemoryState(player);
  if (state.上次觐见 != null && now < state.上次觐见 + 24 * MEMORY_HOUR_MS) return { ...fail('星神觐见每24小时一次。'), retryAt: state.上次觐见 + 24 * MEMORY_HOUR_MS };
  const gain = roll(2000, 5000, random);
  player.记忆棱镜 += gain;
  state.上次觐见 = now;
  return { ok: true, gain };
}

export function getMemoryFragments(player) { return Math.round(positive(player?.记忆碎片) * 1000) / 1000; }
export function spendMemoryFragments(player, cost) {
  if (!Number.isFinite(cost) || cost <= 0 || getMemoryFragments(player) < cost) return false;
  player.记忆碎片 = Math.round((getMemoryFragments(player) - cost) * 1000) / 1000;
  return true;
}
export function settleMemoryFragments(player, { now = Date.now() } = {}) {
  if (getMemoryStage(player) < 4 || !player.记忆命途?.已获诗篇) return { hours: 0, fragments: 0 };
  const state = ensureMemoryState(player);
  state.碎片结算时间 = state.碎片结算时间 == null ? now : finite(state.碎片结算时间, now);
  const hours = Math.floor(Math.max(0, now - state.碎片结算时间) / MEMORY_HOUR_MS);
  const fragments = hours / 10;
  player.记忆碎片 = Math.round((getMemoryFragments(player) + fragments) * 1000) / 1000;
  state.碎片结算时间 += hours * MEMORY_HOUR_MS;
  return { hours, fragments };
}
export function convertMemoryPrisms(player, amount = 10000, kind = '碎片') {
  if (!getMemoryStage(player)) return fail('请先开启记忆命途。');
  const divisor = kind === '潜力' ? 100 : kind === '碎片' ? 10000 : 0;
  const count = Number(amount);
  if (!divisor || !Number.isSafeInteger(count) || count <= 0 || count % divisor) return fail(`兑换需${divisor || 100}的正整数倍记忆棱镜。`);
  if (positive(player.记忆棱镜) < count) return fail('记忆棱镜不足。');
  const gain = kind === '潜力' ? count / 50 : count / 100000;
  const next = (kind === '潜力' ? positive(player.仙道潜力) : getMemoryFragments(player)) + gain;
  if (!Number.isFinite(next) || next > Number.MAX_SAFE_INTEGER) return fail('结算数值超出精确范围。');
  player.记忆棱镜 -= count;
  if (kind === '潜力') player.仙道潜力 = next;
  else player.记忆碎片 = Math.round(next * 1000) / 1000;
  return { ok: true, spent: count, gain, kind };
}
