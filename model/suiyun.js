import { getRealmAuthorityLevel } from './realmAuthority.js';
import { getActiveZhutianAvatarName } from './zhutianMirror.js';
import { calculateCalamityLifeSourceGain, getCalamityRefinementResourceGains } from './tianmoHuasheng.js';

export const SUIYUN_REMNANT = '岁云的残念';
export const SUIYUN_TECHNIQUE = '月华炼天功';
export const SUIYUN_TREASURE = '无上天阙枝';
export const SUIYUN_DROP_CHANCE = 0.00001;
export const SUIYUN_HOUR_MS = 3_600_000;
export const SUIYUN_DAY_MS = 24 * SUIYUN_HOUR_MS;
export const SUIYUN_EQUIPMENT = Object.freeze(['岁云袍', '岁云剑', '云月之莲']);
export const SUIYUN_LOTUS_NAME = '云月之莲';
export const SUIYUN_LOTUS_STAT_PER_MOONLIGHT = 200_000;

export const SUIYUN_STAGES = Object.freeze([
  { name: '月华之体', realm: 0, realmName: '无', life: 200, cap: 600, enlightenmentBonus: .2, tribulationReduction: .2, lootMultiplier: 1, eff: 20, orb: 1.5, stats: 2 },
  { name: '月华似剑', realm: 10, realmName: '仙台大能', life: 600, cap: 1800, enlightenmentBonus: .2, tribulationReduction: .3, lootMultiplier: 5, eff: 100, orb: 3, stats: 10 },
  { name: '霜月剑尊', realm: 12, realmName: '圣人', life: 1800, cap: 5400, enlightenmentBonus: .2, tribulationReduction: .5, lootMultiplier: 10, eff: 300, orb: 10, stats: 50 },
  { name: '岁云化身', realm: 16, realmName: '大帝', life: 5400, cap: 15000, enlightenmentBonus: .45, tribulationReduction: .6, lootMultiplier: 10, eff: 3000, orb: 100, stats: 500 },
  { name: '岁云剑尊', realm: 20, realmName: '准仙帝', life: 15000, cap: 15000, enlightenmentBonus: .45, tribulationReduction: .85, lootMultiplier: 10, eff: 30000, orb: 1000, stats: 5000 },
].map(Object.freeze));

export const SUIYUN_TRIALS = Object.freeze({
  moon: Object.freeze({ field: '引月入体', count: 12, command: '#引月入体', label: '化月如霜' }),
  frost: Object.freeze({ field: '化霜入剑', count: 12, command: '#化霜入剑', label: '霜华似剑' }),
  witness: Object.freeze({ field: '月之见证', count: 9, command: '#月之见证', label: '以月证剑' }),
});

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positive = value => Math.max(0, finite(value));
const roundOrigin = value => Math.round(value * 1000) / 1000;
const fail = reason => ({ ok: false, reason });
const randomInteger = (min, max, random) => min + Math.floor(Math.min(1 - Number.EPSILON, Math.max(0, finite(random()))) * (max - min + 1));

export function getSuiyunStage(player) {
  return SUIYUN_STAGES.findIndex(stage => stage.name === player?.灵根?.name) + 1;
}

export function getSuiyunEffects(player) {
  const stage = getSuiyunStage(player);
  return {
    enlightenmentBonus: SUIYUN_STAGES[stage - 1]?.enlightenmentBonus || 0,
    tribulationReduction: SUIYUN_STAGES[stage - 1]?.tribulationReduction || 0,
    lootMultiplier: SUIYUN_STAGES[stage - 1]?.lootMultiplier || 1,
    noDemonicValue: stage > 0,
    madoka: stage === 5,
  };
}

export function createSuiyunRoot(stage) {
  const spec = SUIYUN_STAGES[stage - 1];
  if (!spec) throw new RangeError('岁云阶段应为1至5');
  return {
    id: 7091000 + stage, name: spec.name, type: '岁云', 归类: '岁云',
    eff: spec.eff, 法球倍率: spec.orb, 攻击: spec.stats, 防御: spec.stats,
    生命: spec.stats, 生命本源: spec.life, 稀有度: 10, 唯一灵根: true, 不可随机获取: true,
  };
}

export function ensureSuiyunState(player) {
  if (!player || typeof player !== 'object') throw new TypeError('玩家数据缺失');
  if (!player.岁云 || typeof player.岁云 !== 'object' || Array.isArray(player.岁云)) player.岁云 = {};
  const state = player.岁云;
  state.version = 1;
  for (const trial of Object.values(SUIYUN_TRIALS)) {
    state[trial.field] = Math.min(trial.count, Math.trunc(positive(state[trial.field])));
  }
  state.炼化本源 = positive(state.炼化本源);
  // 旧档没有每次炼化所得的准确月华数，不用混有日修炼收益的余额反推。
  state.累计炼化月华 = Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(positive(state.累计炼化月华)));
  state.炼化记录 = Array.isArray(state.炼化记录) ? [...new Set(state.炼化记录.map(String))] : [];
  player.月华值 = positive(player.月华值);
  player.岁云之力 = getSuiyunPower(player);
  return state;
}

/** 成长独立于可消费余额；只在装备重算末段加一次，不回写法宝基础三围。 */
export function getSuiyunLotusBonus(player, equipment) {
  const moonlight = Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(positive(player?.岁云?.累计炼化月华)));
  const lotus = equipment?.法宝;
  const binding = lotus?.绑定者 || lotus?.author_name;
  const active = getSuiyunStage(player) > 0 && lotus?.name === SUIYUN_LOTUS_NAME
    && (lotus.id == null || Number(lotus.id) === 9600303)
    && (!binding || String(binding) === String(player?.id));
  return {
    active, moonlight, statBonus: active ? moonlight * SUIYUN_LOTUS_STAT_PER_MOONLIGHT : 0,
    perMoonlight: SUIYUN_LOTUS_STAT_PER_MOONLIGHT,
  };
}

export function getSuiyunLifeMaximum(player) {
  const spec = SUIYUN_STAGES[getSuiyunStage(player) - 1];
  return spec ? Math.min(spec.cap, spec.life + positive(player?.岁云?.炼化本源)) : 0;
}

export function activateSuiyun(player, { now = Date.now() } = {}) {
  if (getActiveZhutianAvatarName(player)) return fail('请先装载本源，再消耗岁云的残念。');
  if (getSuiyunStage(player) || player?.岁云?.已觉醒) return fail('岁云残念已与你结缘，请继续现有见证。');
  const state = ensureSuiyunState(player);
  state.已觉醒 = true;
  state.觉醒时间 = now;
  state.炼化本源 = 0;
  player.灵根 = createSuiyunRoot(1);
  player.linggenshow = 0;
  player.生命本源 = 200;
  player.天资等级 = '岁云';
  player.天资评价 = '月华照见诸世，岁云演尽万法；等同无演无尽级天资。';
  return { ok: true, stage: 1, name: '月华之体' };
}

export function advanceSuiyun(player) {
  const current = getSuiyunStage(player);
  if (!current) return fail('先消耗岁云的残念，唤醒月华之体。');
  if (current === 5) return fail('岁云剑尊已经圆满。');
  const state = ensureSuiyunState(player);
  const next = SUIYUN_STAGES[current];
  if (getRealmAuthorityLevel(player) < next.realm) return fail(`下一阶段需达到${next.realmName}级境界。`);
  if (current === 1 && Object.values(SUIYUN_TRIALS).some(trial => state[trial.field] < trial.count)) {
    return fail('先依次完成引月入体12次、化霜入剑12关、月之见证9战。');
  }
  player.灵根 = createSuiyunRoot(current + 1);
  state.炼化本源 = 0;
  player.生命本源 = next.life;
  if (current + 1 >= 4) {
    player.岁云法则 = true;
    player.已领悟法则 = Array.isArray(player.已领悟法则) ? player.已领悟法则 : [];
    if (!player.已领悟法则.includes('岁云法则')) player.已领悟法则.push('岁云法则');
  }
  return { ok: true, stage: current + 1, name: next.name, grantEquipment: current + 1 === 5 };
}

function trialEligibility(player, route, now) {
  if (getSuiyunStage(player) !== 1) return fail('三重月华试炼属于月华之体的晋升见证。');
  const config = SUIYUN_TRIALS[route];
  if (!config) return fail('未知月华试炼。');
  const state = ensureSuiyunState(player);
  if (state[config.field] >= config.count) return fail('这重月华试炼已经圆满。');
  if (route !== 'moon' && state.引月入体 < 12) return fail('请先完成十二次引月入体。');
  if (route === 'witness' && state.化霜入剑 < 12) return fail('请先完成十二道化霜入剑试炼。');
  if (route === 'moon' && state.上次引月 != null && now < finite(state.上次引月) + SUIYUN_HOUR_MS) {
    return { ...fail('引月入体每现实小时可试炼一次。'), retryAt: finite(state.上次引月) + SUIYUN_HOUR_MS };
  }
  return { ok: true, state, config, index: state[config.field] };
}

export function buildSuiyunTrialBattle(player, route, { now = Date.now() } = {}) {
  const check = trialEligibility(player, route, now);
  if (!check.ok) return check;
  const { index, config } = check;
  const attacker = structuredClone(player);
  const hp = Math.max(1, finite(player.血量上限, 100));
  attacker.当前血量 = hp;
  const scale = (route === 'moon' ? .5 : route === 'frost' ? .65 : .8) + index * .035;
  const enemy = {
    名号: `${config.label}·第${index + 1}道月影`,
    攻击: Math.max(1, Math.floor(finite(player.攻击, 10) * scale)),
    防御: Math.max(1, Math.floor(finite(player.防御, 10) * scale)),
    血量上限: Math.max(1, Math.floor(hp * scale)), 当前血量: Math.max(1, Math.floor(hp * scale)),
    暴击率: .1, 暴击伤害: 1.5, 速度: Math.max(1, finite(player.速度, 100) * scale),
    灵根: { name: '月华试炼投影', type: '试炼', 法球倍率: 1 }, 法球倍率: 1,
    学习的功法: [], 仙宠: null, 分身: [], mijinglevel_id: player.mijinglevel_id || 0,
    xiangulevel_id: player.xiangulevel_id || 0, huafenlevel_id: player.huafenlevel_id || 0,
    _万灵魔幡不可炼化: true,
  };
  return { ...check, attacker, enemy, route, trialText: `${config.label}：胜利后推进一重，失败保留进度。` };
}

export function applySuiyunTrialResult(player, route, won, remainingHp = 0, { now = Date.now(), expectedIndex } = {}) {
  const check = trialEligibility(player, route, now);
  if (!check.ok) return check;
  if (expectedIndex !== undefined && expectedIndex !== check.index) return fail('试炼进度已变化，请重新挑战。');
  if (route === 'moon') check.state.上次引月 = now;
  if (won) check.state[check.config.field] += 1;
  const progress = check.state[check.config.field];
  return { ok: true, won: Boolean(won), progress, total: check.config.count, message: `${check.config.label}：${progress}/${check.config.count}${won ? '，月华见证已铭刻。' : '，本次未破，进度保留。'}` };
}

export function cultivateSuiyun(player, { now = Date.now(), random = Math.random } = {}) {
  if (!getSuiyunStage(player)) return fail('月华之体觉醒后才可云月修炼。');
  const state = ensureSuiyunState(player);
  if (state.上次修炼 != null && now < finite(state.上次修炼) + SUIYUN_DAY_MS) {
    return { ...fail('云月修炼每24小时可进行一次。'), retryAt: finite(state.上次修炼) + SUIYUN_DAY_MS };
  }
  const gain = randomInteger(2000, 5000, random);
  player.月华值 += gain;
  state.上次修炼 = now;
  return { ok: true, gain, moonlight: gain, retryAt: now + SUIYUN_DAY_MS };
}

export function refineSuiyun(player, { targetId, kind = '天骄', sourceLifeEssence = 100, weight, now = Date.now(), random = Math.random } = {}) {
  if (!getSuiyunStage(player)) return fail('月华之体觉醒后才可炼化。');
  if (!player.学习的功法?.includes(SUIYUN_TECHNIQUE)) return fail('请先习得《月华炼天功》。');
  if (!['玩家', '天骄', '灾厄'].includes(kind) || !String(targetId || '').trim()) return fail('请选择已击败的玩家、天骄或灾厄。');
  const state = ensureSuiyunState(player);
  const record = `${kind}:${targetId}`;
  if (state.炼化记录.includes(record)) return fail('这一份本源已经炼化。');
  const spec = SUIYUN_STAGES[getSuiyunStage(player) - 1];
  const gain = randomInteger(100, 300, random);
  // 灾厄沿用天魔本源抽取与权重公式，但仍保留岁云五阶自己的本源上限。
  const rawLifeGain = kind === '灾厄'
    ? calculateCalamityLifeSourceGain(sourceLifeEssence, weight)
    : kind === '玩家' ? 0 : Math.max(1, Math.floor(positive(sourceLifeEssence) * .1));
  const lifeGain = roundOrigin(Math.max(0, Math.min(spec.cap - getSuiyunLifeMaximum(player), rawLifeGain)));
  const resourceGains = kind === '灾厄' ? getCalamityRefinementResourceGains(player) : null;
  state.炼化本源 = roundOrigin(state.炼化本源 + lifeGain);
  state.炼化记录.push(record);
  state.上次炼化 = now;
  state.累计炼化月华 = Math.min(Number.MAX_SAFE_INTEGER, state.累计炼化月华 + gain);
  player.月华值 += gain;
  const previousLife = positive(player.生命本源);
  player.生命本源 = roundOrigin(Math.min(getSuiyunLifeMaximum(player), previousLife + lifeGain));
  const actualLifeGain = roundOrigin(Math.max(0, player.生命本源 - previousLife));
  if (resourceGains) {
    player.修为 = positive(player.修为) + resourceGains.cultivation;
    player.血气 = positive(player.血气) + resourceGains.blood;
    player.元神 = positive(player.元神) + resourceGains.soul;
    resourceGains.potential = actualLifeGain;
    // 与本源实增精确等量，不叠命格/物品倍率，不触碰元神上限或魔道值。
    player.仙道潜力 = roundOrigin(positive(player.仙道潜力) + actualLifeGain);
  }
  return { ok: true, gain, moonlight: gain, lifeGain: actualLifeGain, lifeSourceGain: actualLifeGain, lifeMaximum: getSuiyunLifeMaximum(player), resourceGains };
}

export function getSuiyunPower(player) {
  return Math.round(positive(player?.岁云之力) * 1000) / 1000;
}

export function spendSuiyunPower(player, cost) {
  if (!Number.isFinite(cost) || cost <= 0 || getSuiyunPower(player) < cost) return false;
  player.岁云之力 = Math.round((getSuiyunPower(player) - cost) * 1000) / 1000;
  return true;
}

export function convertSuiyunPower(player, amount = 10000) {
  if (!getSuiyunStage(player)) return fail('月华之体觉醒后才可转化。');
  const count = Number(amount);
  if (!Number.isSafeInteger(count) || count <= 0 || count % 10000 !== 0) return fail('兑换月华值须为10000的正整数倍。');
  ensureSuiyunState(player);
  if (player.月华值 < count) return fail('月华值不足。');
  const power = count / 100000;
  player.月华值 -= count;
  player.岁云之力 = Math.round((getSuiyunPower(player) + power) * 1000) / 1000;
  return { ok: true, spent: count, power, gain: power };
}

export function ascendSuiyunPalace(world, now = Date.now()) {
  if (!world || world.月华天宫) return false;
  world.原世界名 ||= world.world_name;
  world.world_name = '月华天宫';
  world.月华天宫 = true;
  world.月华天宫上次结算时间 = now;
  return true;
}

export function settleSuiyunPalace(player, world, { now = Date.now() } = {}) {
  if (!getSuiyunStage(player) || !world?.月华天宫) return { hours: 0, power: 0 };
  if (world.月华天宫上次结算时间 == null || !Number.isFinite(Number(world.月华天宫上次结算时间))) {
    world.月华天宫上次结算时间 = now;
    return { hours: 0, power: 0 };
  }
  const last = Number(world.月华天宫上次结算时间);
  const hours = Math.floor(Math.max(0, now - last) / SUIYUN_HOUR_MS);
  const power = hours * .5;
  if (hours) {
    player.岁云之力 = Math.round((getSuiyunPower(player) + power) * 1000) / 1000;
    world.月华天宫上次结算时间 = last + hours * SUIYUN_HOUR_MS;
  }
  return { hours, power };
}
