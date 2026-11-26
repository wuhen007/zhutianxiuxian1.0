import { getRealmAuthorityLevel } from './realmAuthority.js';
import { getActiveZhutianAvatarName } from './zhutianMirror.js';

export const MEMORY_DATA = '奇怪的数据';
export const MEMORY_TECHNIQUE = '六相冰封';
export const MEMORY_POEM = '记忆之诗篇';
export const MEMORY_DROP_CHANCE = .0001;
export const MEMORY_HOUR_MS = 3_600_000;
export const MEMORY_FACTORS = Object.freeze(['门径', '浪漫', '理性', '纷争', '诡计', '死亡', '天空', '海洋', '大地', '律法', '时间', '负世']);
export const MEMORY_STAGES = Object.freeze([
  { name: '金血之体', realm: 0, realmName: '无', cap: 3, life: 50, eff: 20, orb: 1.5, stats: .2 },
  { name: '逐火行者', realm: 10, realmName: '仙台大能', cap: 6, life: 150, eff: 100, orb: 3, stats: 1 },
  { name: '半神之体', realm: 12, realmName: '圣人', cap: 9, life: 300, eff: 300, orb: 10, stats: 5 },
  { name: '无漏净子', realm: 16, realmName: '大帝', cap: 12, life: 500, eff: 3000, orb: 100, stats: 10 },
  // 星神·记忆已移除，旧灵根由 normalizeMemoryPlayer 兼容到无漏净子。
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
  if (player?.灵根?.name === '星神·记忆' || Number(player?.灵根?.id) === 7092005) return 4;
  return MEMORY_STAGES.findIndex(stage => stage.name === player?.灵根?.name) + 1;
}

export function createMemoryRoot(stage) {
  const spec = MEMORY_STAGES[stage - 1];
  if (!spec) throw new RangeError('记忆命途阶段应为1至4');
  return { id: 7092000 + stage, name: spec.name, type: '记忆命途', 归类: '记忆命途', eff: spec.eff,
    法球倍率: spec.orb, 攻击: spec.stats, 防御: spec.stats, 生命: spec.stats, 生命本源: spec.life,
    稀有度: 10, 唯一灵根: true, 不可随机获取: true };
}

// 只规范当前读取的对象；余额、装备和因子历史保留，正常写档时一并保存。
export function normalizeMemoryPlayer(player) {
  if (!player || typeof player !== 'object') return false;
  const syncRoot = root => {
    const stage = getMemoryStage({ 灵根: root });
    return stage ? { ...root, ...createMemoryRoot(stage) } : root;
  };
  const previous = player.灵根;
  const next = syncRoot(previous);
  const rootChanged = next !== previous && Object.keys(next).some(key => next[key] !== previous[key]);
  if (rootChanged) {
    player.灵根 = next;
    if (Number(player.法球倍率) === Number(previous.法球倍率)) player.法球倍率 = next.法球倍率;
  }
  // 装载化身期间保留隐藏根身份，卸载后再迁移，遵守诸天镜的改根版本保护。
  if (player.隐藏灵根 && !getActiveZhutianAvatarName(player)) player.隐藏灵根 = syncRoot(player.隐藏灵根);
  if (player.诸天镜系统?.本源灵根) player.诸天镜系统.本源灵根 = syncRoot(player.诸天镜系统.本源灵根);
  if (player.天资等级 === '星神之资') {
    // 旧觉醒没有保存原天资，停用专属天资后回到普通默认等级。
    player.天资等级 = '平庸之资';
    player.天资评价 = '普通天资';
  }
  const maximum = getMemoryLifeMaximum(player);
  if (maximum && Number(player.生命本源) > maximum) player.生命本源 = maximum;
  return rootChanged;
}

export function ensureMemoryState(player) {
  if (!player || typeof player !== 'object') throw new TypeError('玩家数据缺失');
  normalizeMemoryPlayer(player);
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
  // 记忆棱镜/碎片功能暂停，旧余额原样封存。
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
  return MEMORY_STAGES[stage - 1].life + (stage <= 2 ? tiers.filter(Boolean).length * 10 : tiers.filter(tier => tier === 3).length * 20);
}

export function getMemoryEffects(player) {
  const stage = getMemoryStage(player);
  const tiers = MEMORY_FACTORS.map(name => getMemoryFactorTier(player, name));
  const count = tiers.filter(Boolean).length;
  const titan = tiers.filter(tier => tier === 3).length;
  const tier = name => getMemoryFactorTier(player, name);
  return {
    enlightenmentBonus: count * .03,
    tribulationReduction: Math.min(.95, (stage >= 2 ? .3 : 0) + count * .03),
    lootMultiplier: Math.min(4, (stage >= 2 ? 2 : 1) + Math.floor(titan / 6)),
    // 保留中性字段兼容各结算入口，普通物品不再额外加件。
    lootBonus: 0,
    dungeonCostReduction: [0, .2, .3, .4][tier('门径')],
    // 保留中性字段兼容旧调用；门径不再改变副本耗时。
    dungeonSpeed: 1,
    dungeonTimeMultiplier: 1,
    // 只加成基础渔获（众生海奖池、钓鱼地图），仙饵产物不吃这条倍率。
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

/** 仅供副本入场的修为、血气、灵石、寿元扣费；整数资源向上取整。 */
export function getMemoryDungeonCost(player, amount) {
  const value = Number(amount);
  const percentage = [100, 80, 70, 60][getMemoryFactorTier(player, '门径')];
  if (!Number.isFinite(value) || value <= 0 || percentage === 100) return value;
  return Math.ceil(value * percentage / 100);
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
  player.生命本源 = MEMORY_STAGES[0].life;
  player.linggenshow = 0;
  // 星神之资暂停：保留觉醒前的普通天资。
  return { ok: true, stage: 1, name: player.灵根.name };
}

export function advanceMemoryPath(player, { now = Date.now() } = {}) {
  normalizeMemoryPlayer(player);
  const current = getMemoryStage(player);
  if (!current) return fail('当前未开启记忆命途。');
  if (current >= MEMORY_STAGES.length) return fail('无漏净子已是当前最终阶段。');
  const state = ensureMemoryState(player);
  const next = MEMORY_STAGES[current];
  if (getRealmAuthorityLevel(player) < next.realm) return fail(`下一阶段需要${next.realmName}级境界。`);
  const requiredFactors = [3, 6, 9, 12][current - 1];
  if (Object.keys(state.因子).length < requiredFactors) return fail(`晋升需要${requiredFactors}个因子。`);
  if (current === 2 && state.逐火次数 < 12) return fail('逐火之旅需完整完成12次。');
  if (current === 3 && state.泰坦次数 < 12) return fail('泰坦试炼需完整完成12次。');
  player.灵根 = createMemoryRoot(current + 1);
  player.生命本源 = getMemoryLifeMaximum(player);
  // 记忆之诗篇与碎片收入暂停，晋升仅更新灵根和本源。
  return { ok: true, stage: current + 1, name: next.name, grantPoem: false };
}

function factorResult(player, name, previousLife) {
  const maximum = getMemoryLifeMaximum(player);
  player.生命本源 = Math.min(maximum, positive(player.生命本源) + Math.max(0, maximum - previousLife));
  return { ok: true, factor: name, tier: getMemoryFactorTier(player, name), lifeMaximum: maximum,
    equipment: name === '浪漫' ? [...MEMORY_ROMANCE_SETS[getMemoryFactorTier(player, name) - 1]] : [] };
}

export function recordMemoryDungeon(player, { token, rounds = 1, escaped = false } = {}) {
  if (escaped || !getMemoryStage(player) || !String(token || '') || !Number.isSafeInteger(rounds) || rounds <= 0) return { applied: false, gain: 0 };
  const state = ensureMemoryState(player);
  const id = String(token);
  if (state.秘境记录.includes(id)) return { applied: false, gain: 0 };
  state.秘境记录.push(id);
  state.秘境记录 = state.秘境记录.slice(-512);
  const previous = player.模拟值;
  player.模拟值 = Math.min(100, previous + rounds * 2);
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
  // 六相冰封及棱镜收入暂停，兼容旧调用但不消费本源或发放收益。
  return fail('六相冰封已停用。');
  /*
  if (!getMemoryStage(player) || !player.学习的功法?.includes(MEMORY_TECHNIQUE)) return fail('需开启记忆命途并习得《六相冰封》。');
  if (!['玩家', '天骄', '灾厄'].includes(kind) || !String(targetId || '')) return fail('请指定真实已镇压的本源。');
  const state = ensureMemoryState(player);
  const key = `${kind}:${targetId}`;
  if (state.炼化记录.includes(key)) return fail('这份本源已经收入记忆。');
  const gain = roll(100, 300, random);
  player.记忆棱镜 += gain;
  state.炼化记录.push(key);
  return { ok: true, gain, prismGain: gain, lifeSourceGain: 0 };
  */
}

export function cultivateMemoryPath(player, { now = Date.now(), random = Math.random } = {}) {
  // 星神觐见暂停。
  return fail('星神觐见已停用。');
  /*
  if (!getMemoryStage(player)) return fail('请先开启记忆命途。');
  const state = ensureMemoryState(player);
  if (state.上次觐见 != null && now < state.上次觐见 + 24 * MEMORY_HOUR_MS) return { ...fail('星神觐见每24小时一次。'), retryAt: state.上次觐见 + 24 * MEMORY_HOUR_MS };
  const gain = roll(2000, 5000, random);
  player.记忆棱镜 += gain;
  state.上次觐见 = now;
  return { ok: true, gain };
  */
}

export function getMemoryFragments(player) { return Math.round(positive(player?.记忆碎片) * 1000) / 1000; }
export function spendMemoryFragments(player, cost) {
  // 碎片经济暂停，旧余额不再消费。
  return false;
  /*
  if (!Number.isFinite(cost) || cost <= 0 || getMemoryFragments(player) < cost) return false;
  player.记忆碎片 = Math.round((getMemoryFragments(player) - cost) * 1000) / 1000;
  return true;
  */
}
export function settleMemoryFragments(player, { now = Date.now() } = {}) {
  // 记忆之诗篇暂停，离线和在线均不结算碎片。
  return { hours: 0, fragments: 0 };
  /*
  if (getMemoryStage(player) < 4 || !player.记忆命途?.已获诗篇) return { hours: 0, fragments: 0 };
  const state = ensureMemoryState(player);
  state.碎片结算时间 = state.碎片结算时间 == null ? now : finite(state.碎片结算时间, now);
  const hours = Math.floor(Math.max(0, now - state.碎片结算时间) / MEMORY_HOUR_MS);
  const fragments = hours / 10;
  player.记忆碎片 = Math.round((getMemoryFragments(player) + fragments) * 1000) / 1000;
  state.碎片结算时间 += hours * MEMORY_HOUR_MS;
  return { hours, fragments };
  */
}
export function convertMemoryPrisms(player, amount = 10000, kind = '碎片') {
  // 棱镜/碎片兑换暂停，历史余额原样保留。
  return fail('记忆棱镜兑换已停用。');
  /*
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
  */
}
