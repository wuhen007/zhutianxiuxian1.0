import { getRealmAuthorityLevel } from './realmAuthority.js';
import { getActiveZhutianAvatarName } from './zhutianMirror.js';
import { calculateCalamityLifeSourceGain, getCalamityRefinementResourceGains } from './tianmoHuasheng.js';
import { getMemoryDungeonCost } from './memoryPath.js';

export const SUIYUN_REMNANT = '岁云的残念';
export const SUIYUN_TECHNIQUE = '月华炼天功';
export const SUIYUN_TREASURE = '无上天阙枝';
export const SUIYUN_DROP_CHANCE = 0.00001;
export const SUIYUN_HOUR_MS = 3_600_000;
export const SUIYUN_DAY_MS = 24 * SUIYUN_HOUR_MS;
export const SUIYUN_EQUIPMENT = Object.freeze(['岁云袍', '岁云剑', '云月之莲']);
export const SUIYUN_FROST_EQUIPMENT = Object.freeze(['霜月剑', '霜月剑袍', '霜月之莲']);
export const SUIYUN_LOTUS_NAME = '云月之莲';
export const SUIYUN_LOTUS_STAT_PER_MOONLIGHT = 200_000;
export const SUIYUN_PET_NAME = '岁云剑灵';
export const SUIYUN_PET_LEGACY_NAME = '霜月剑灵';
export const SUIYUN_PET_FORGING_GROWTH = 0.4;
export const SUIYUN_PET_ALCHEMY_GROWTH = 0.4;
export const SUIYUN_PET_STAGE = 3;
export const SUIYUN_PALACE_POTENTIAL_PER_HOUR = 50;
export const SUIYUN_PALACE_POWER_STAGE = 4;
export const SUIYUN_PALACE_POWER_PER_HOUR = .5;
export const SUIYUN_EXCLUSIVE_SKILLS = Object.freeze(['霜剑入月', '岁云归一', '白云苍狗']);
export const SUIYUN_GIFT_LIMIT = 3;
export const SUIYUN_PALACE_DUNGEON = '岁云殿堂';
// 第6条：觉醒残念即自动入主「岁云剑宫」，宫主专属帝经与势力商店。
export const SUIYUN_PALACE_FACTION = '岁云剑宫';
export const SUIYUN_PALACE_POSITION = '宫主';
export const SUIYUN_PALACE_TECHNIQUE = '岁云化月';
// 第2条：月华救赎——100点月华恢复满生命本源（可对他人），200点从大牢捞人。
export const SUIYUN_REDEEM_LIFE_COST = 100;
export const SUIYUN_REDEEM_RESCUE_COST = 200;
// 第7条：如月长存为岁云灵根自带的渡劫复活被动，亦可由他人双修习得。
export const SUIYUN_REVIVAL_SKILL = '如月长存';
export const SUIYUN_REVIVAL_TEACH_CHANCE = 0.15;
export const SUIYUN_NINE_SECRETS = Object.freeze(['临字秘', '兵字秘', '斗字秘', '者字秘', '皆字秘', '数字秘', '组字秘', '前字秘', '行字秘']);
export const SUIYUN_TEN_XIONG = Object.freeze(['真龙宝术', '真凰宝术', '鲲鹏宝术', '雷帝宝术', '麒麟宝术', '天角蚁宝术', '蛄之宝术', '九幽獓宝术', '打神石宝术', '九叶剑草宝术']);
export const SUIYUN_METALS = Object.freeze(['仙泪绿金', '凰血赤金', '龙纹黑金', '永恒蓝金', '神痕紫金', '道劫黄金', '羽化青金', '太阴天金', '太阳天金']);
export const SUIYUN_YEAR_REWARDS = Object.freeze([
  ...SUIYUN_METALS.map(name => Object.freeze({ name, class: '材料' })),
  Object.freeze({ name: '潜力丹', class: '丹药' }),
  Object.freeze({ name: '普通封灵符', class: '道具' }),
  Object.freeze({ name: '心神丹', class: '丹药' }),
]);

export const SUIYUN_STAGES = Object.freeze([
  { name: '月华之体', realm: 0, realmName: '无', life: 200, cap: 600, enlightenmentBonus: .2, tribulationReduction: .2, lootMultiplier: 1, eff: 20, orb: 1.5, stats: 2 },
  { name: '月华似剑', realm: 10, realmName: '神火境', life: 600, cap: 1800, enlightenmentBonus: .2, tribulationReduction: .3, lootMultiplier: 5, eff: 100, orb: 3, stats: 10 },
  { name: '霜月剑尊', realm: 12, realmName: '天神境', life: 1800, cap: 5400, enlightenmentBonus: .2, tribulationReduction: .5, lootMultiplier: 10, eff: 300, orb: 10, stats: 50 },
  { name: '岁云化身', realm: 16, realmName: '至尊境', life: 5400, cap: 15000, enlightenmentBonus: .45, tribulationReduction: .75, lootMultiplier: 10, eff: 3000, orb: 100, stats: 500 },
  { name: '岁云剑尊', realm: 20, realmName: '准仙帝', life: 15000, cap: 15000, enlightenmentBonus: .45, tribulationReduction: .85, lootMultiplier: 10, eff: 30000, orb: 1000, stats: 5000 },
].map(Object.freeze));

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positive = value => Math.max(0, finite(value));
const roundOrigin = value => Math.round(value * 1000) / 1000;
const fail = reason => ({ ok: false, reason });
const randomInteger = (min, max, random) => min + Math.floor(Math.min(1 - Number.EPSILON, Math.max(0, finite(random()))) * (max - min + 1));

export function getSuiyunStage(player) {
  return SUIYUN_STAGES.findIndex(stage => stage.name === player?.灵根?.name) + 1;
}

/** 常青护持修道寿元；只由悟道、己道推演消费入口使用，自然寿元流逝照常结算。 */
export function hasSuiyunCultivationLifespanImmunity(player) {
  return getSuiyunStage(player) > 0
    && !player?._tahua_type && !player?._yiqihua_entity && !player?._万灵魔幡主魂
    && !player?._帝骑分身 && !player?._圆神分身 && player?.分身 !== true;
}

/** 赐予仅传授三项战技，不赋予岁云灵根的其他被动或再传授资格。 */
export function hasSuiyunSkills(player) {
  if (getSuiyunStage(player) > 0) return true;
  if (player?._tahua_type || player?._yiqihua_entity || player?._万灵魔幡主魂
    || player?._帝骑分身 || player?._圆神分身 || player?.分身 === true) return false;
  const gift = player?.月华传承;
  const recipient = String(player?.id || '');
  return Boolean(recipient && gift && typeof gift === 'object' && !Array.isArray(gift)
    && String(gift.受赐者 || '') === recipient
    && String(gift.授予者 || '').trim() && String(gift.授予者) !== recipient
    && Number.isInteger(gift.名额) && gift.名额 >= 1 && gift.名额 <= SUIYUN_GIFT_LIMIT
    && Number.isFinite(gift.传授时间) && gift.传授时间 >= 0
    && Array.isArray(gift.技能) && SUIYUN_EXCLUSIVE_SKILLS.every(name => gift.技能.includes(name)));
}

export function hasSuiyunFreeDungeonEntry(player) {
  return getSuiyunStage(player) >= SUIYUN_PET_STAGE;
}

export function getSuiyunDungeonEntryPlace(player, place) {
  if (!place) return place;
  const adjusted = { ...place };
  for (const field of ['Price', 'shouyuan', 'experience']) {
    if (hasSuiyunFreeDungeonEntry(player)) adjusted[field] = 0;
    else if (place[field] != null) adjusted[field] = getMemoryDungeonCost(player, place[field]);
  }
  return adjusted;
}

export function getSuiyunEffects(player) {
  const stage = getSuiyunStage(player);
  return {
    enlightenmentBonus: SUIYUN_STAGES[stage - 1]?.enlightenmentBonus || 0,
    tribulationReduction: SUIYUN_STAGES[stage - 1]?.tribulationReduction || 0,
    lootMultiplier: SUIYUN_STAGES[stage - 1]?.lootMultiplier || 1,
    noDemonicValue: stage > 0,
    madoka: stage === 5,
    luckBonus: stage > 0 ? 1 : 0,
    freeDungeonEntry: hasSuiyunFreeDungeonEntry(player),
    absoluteSpiritImmune: stage > 0,
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
  // 残念融入本源即入主岁云剑宫，位同宫主；势力履历由指令层落盘。
  player.势力 = SUIYUN_PALACE_FACTION;
  player.势力职位 = SUIYUN_PALACE_POSITION;
  delete player.势力脱离冷却至;
  return { ok: true, stage: 1, name: '月华之体', faction: SUIYUN_PALACE_FACTION, position: SUIYUN_PALACE_POSITION };
}

export function advanceSuiyun(player, { now = Date.now() } = {}) {
  const current = getSuiyunStage(player);
  if (!current) return fail('先消耗岁云的残念，唤醒月华之体。');
  if (current === 5) return fail('岁云剑尊已经圆满。');
  if (getActiveZhutianAvatarName(player)) return fail('请先装载本源，再自动承接岁云传承。');
  const state = ensureSuiyunState(player);
  const next = SUIYUN_STAGES[current];
  if (getRealmAuthorityLevel(player) < next.realm) {
    return fail(`下一阶段需达到仙古·${next.realmName}境界（跨体系等效权柄${next.realm}级）。`);
  }
  player.灵根 = createSuiyunRoot(current + 1);
  player.法球倍率 = next.orb;
  state.炼化本源 = 0;
  player.生命本源 = next.life;
  if (current + 1 === SUIYUN_PALACE_POWER_STAGE) state.岁云之力启用时间 = now;
  if (current + 1 >= 4) {
    player.岁云法则 = true;
    player.已领悟法则 = Array.isArray(player.已领悟法则) ? player.已领悟法则 : [];
    if (!player.已领悟法则.includes('岁云法则')) player.已领悟法则.push('岁云法则');
  }
  return { ok: true, stage: current + 1, name: next.name, grantPet: current + 1 === SUIYUN_PET_STAGE, grantEquipment: current + 1 === 5 };
}

/** 境界达标自动连升，跌境不回退；保存入口负责奖励与属性重建。 */
export function advanceSuiyunToRealm(player, { now = Date.now() } = {}) {
  const previous = getSuiyunStage(player);
  if (!previous || getActiveZhutianAvatarName(player) || player?._tahua_type || player?.分身 === true) return false;
  while (getSuiyunStage(player) < 5 && getRealmAuthorityLevel(player) >= SUIYUN_STAGES[getSuiyunStage(player)].realm) {
    if (!advanceSuiyun(player, { now }).ok) break;
  }
  const changed = getSuiyunStage(player) !== previous;
  if (changed) ensureSuiyunState(player).自动晋升待结算 = true;
  return changed;
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

/** 每小时领取一份；可指定类别或物品，不叠秘境掉落倍率。 */
export function receiveSuiyunYears(player, selection = '', { now = Date.now(), random = Math.random } = {}) {
  if (!getSuiyunStage(player)) return fail('请先开启岁云月华传承。');
  const name = String(selection || '').trim().replace(/^祈愿\s*/, '').replace(/^九大仙金材料$/, '材料').replace(/^封灵符$/, '普通封灵符');
  const secrets = name === '九秘' ? SUIYUN_NINE_SECRETS : SUIYUN_NINE_SECRETS.includes(name) ? [name] : null;
  const tenXiong = name === '十凶宝术' || name === '十凶' ? SUIYUN_TEN_XIONG
    : SUIYUN_TEN_XIONG.includes(name) ? [name] : null;
  const pool = secrets ? secrets.map(name => ({ name, class: '功法' }))
    : tenXiong ? tenXiong.map(name => ({ name, class: '功法' }))
    : name === '材料' || name === '仙金' ? SUIYUN_YEAR_REWARDS.slice(0, 9)
    : name ? SUIYUN_YEAR_REWARDS.filter(item => item.name === name) : SUIYUN_YEAR_REWARDS;
  if (!pool.length) return fail('用法：#岁岁年年 [材料/潜力丹/封灵符/心神丹]，或 #岁岁年年 祈愿 封灵符/心神丹/九秘/十凶宝术等；封灵符对应普通封灵符，不填时随机领取现行奖池。');
  const state = ensureSuiyunState(player);
  if (state.上次岁岁年年 != null && now < finite(state.上次岁岁年年) + SUIYUN_HOUR_MS) {
    return { ...fail('岁岁年年每现实小时可领取一次。'), retryAt: finite(state.上次岁岁年年) + SUIYUN_HOUR_MS };
  }
  const item = pool[randomInteger(0, pool.length - 1, random)];
  state.上次岁岁年年 = now;
  return { ok: true, item, amount: 1, retryAt: now + SUIYUN_HOUR_MS };
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
  const lifeMaximumBefore = getSuiyunLifeMaximum(player);
  // 灾厄沿用天魔本源抽取与权重公式，但仍保留岁云五阶自己的本源上限。
  const rawLifeGain = kind === '灾厄'
    ? calculateCalamityLifeSourceGain(sourceLifeEssence, weight)
    : kind === '玩家' ? 0 : Math.max(1, Math.floor(positive(sourceLifeEssence) * .1));
  const lifeGain = roundOrigin(Math.max(0, Math.min(spec.cap - lifeMaximumBefore, rawLifeGain)));
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
    resourceGains.potential = roundOrigin(lifeMaximumBefore * .05);
    // 按炼化前本源上限的5%独立发放，封顶仍有潜力收益；不叠物品倍率或灾厄权重。
    player.仙道潜力 = roundOrigin(positive(player.仙道潜力) + resourceGains.potential);
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

/** 直接扣减可消费月华余额；不足返回 false。云月之莲的累计炼化成长不受影响。 */
export function spendMoonlight(player, cost) {
  const amount = Number(cost);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const current = positive(player?.月华值);
  if (current < amount) return false;
  player.月华值 = Math.round((current - amount) * 1000) / 1000;
  return true;
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
  if (!getSuiyunStage(player) || !world?.月华天宫) return { hours: 0, power: 0, potentialGain: 0 };
  const previousPotentialTime = world.月华天宫上次结算时间;
  const previousPowerTime = world.月华天宫岁云结算时间;
  if (world.月华天宫上次结算时间 == null || !Number.isFinite(Number(world.月华天宫上次结算时间))) {
    world.月华天宫上次结算时间 = now;
  }
  const last = Number(world.月华天宫上次结算时间);
  const hours = Math.floor(Math.max(0, now - last) / SUIYUN_HOUR_MS);
  const potentialGain = hours * SUIYUN_PALACE_POTENTIAL_PER_HOUR;
  const powerEnabled = getSuiyunStage(player) >= SUIYUN_PALACE_POWER_STAGE;
  const savedPowerTime = world.月华天宫岁云结算时间 == null ? last : finite(world.月华天宫岁云结算时间, last);
  const unlockedAt = finite(player.岁云?.岁云之力启用时间, savedPowerTime);
  const powerStart = Math.max(savedPowerTime, unlockedAt);
  const powerHours = powerEnabled ? Math.floor(Math.max(0, now - powerStart) / SUIYUN_HOUR_MS) : 0;
  const [outside, inside] = String(world.attributes?.时间流速 || '1:1').split(':').map(Number);
  const ratio = inside / outside;
  const timeMultiplier = outside > 0 && inside > 0 && Number.isFinite(ratio) ? ratio : 1;
  const power = Math.round(powerHours * SUIYUN_PALACE_POWER_PER_HOUR * timeMultiplier * 1000) / 1000;
  // 与潜力独立计时，前三阶停产期及晋升前时间不补发岁云之力。
  world.月华天宫岁云结算时间 = powerEnabled ? powerStart + powerHours * SUIYUN_HOUR_MS : now;
  if (hours) {
    player.仙道潜力 = positive(player.仙道潜力) + potentialGain;
    world.月华天宫上次结算时间 = last + hours * SUIYUN_HOUR_MS;
  }
  if (power) player.岁云之力 = Math.round((getSuiyunPower(player) + power) * 1000) / 1000;
  return { hours, power, potentialGain, powerHours,
    changed: previousPotentialTime !== world.月华天宫上次结算时间 || previousPowerTime !== world.月华天宫岁云结算时间 };
}
