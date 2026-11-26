import { getMemoryFactorTier, getMemoryStage } from './memoryPath.js';
import { getHighRealmBarrier } from './highRealmBarrier.js';
import { getRealmAuthorityLevel } from './realmAuthority.js';

const states = new WeakMap();
const number = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const name = unit => unit?.名号 || unit?.name || '修士';
const eligible = unit => getMemoryStage(unit) > 0 && !unit?._高境界镇杀 && !unit?._高境界压制
  && !unit?._tahua_type && !unit?._yiqihua_entity && !unit?._帝骑分身 && unit?.分身 !== true;
const tier = (unit, factor) => eligible(unit) ? getMemoryFactorTier(unit, factor) : 0;
const atTier = (unit, factor, values) => values[tier(unit, factor) - 1] || 0;

export function hasMemoryCombatEffects(unit) {
  return ['纷争', '诡计', '死亡', '负世'].some(factor => tier(unit, factor) > 0);
}

/** 只接收战斗深拷贝；计数放在弱映射内，不随角色存档或召唤物复制。 */
export function resetMemoryCombat(unit) {
  if (!unit || typeof unit !== 'object') return unit;
  states.set(unit, {
    baseAttack: number(unit.攻击), baseHp: number(unit.血量上限), rounds: 0, attacks: 0,
    guarded: false, revived: false, cancelAttack: false, marks: 0,
  });
  return unit;
}

function stateOf(unit) {
  if (!states.has(unit)) resetMemoryCombat(unit);
  return states.get(unit);
}

export function tickMemoryCombatRound(unit, roundToken) {
  const messages = [];
  if (!unit || number(unit.当前血量) <= 0 || !eligible(unit)) return { messages };
  const state = stateOf(unit);
  if (roundToken != null && state.roundToken === roundToken) return { messages };
  state.roundToken = roundToken;
  state.rounds++;
  const attackRatio = atTier(unit, '负世', [.01, .02, .03]);
  if (attackRatio) {
    const gain = state.baseAttack * attackRatio;
    unit.攻击 = Math.min(Number.MAX_VALUE, number(unit.攻击) + gain);
    messages.push(`【负世】${name(unit)}承担万世之重，本回合攻击增加${gain}。`);
  }
  const hpRatio = atTier(unit, '纷争', [.02, .04, .08]);
  if (hpRatio && state.rounds % 3 === 0) {
    const gain = state.baseHp * hpRatio;
    unit.血量上限 = Math.min(Number.MAX_VALUE, number(unit.血量上限) + gain);
    messages.push(`【纷争】${name(unit)}历经三回合争战，生命上限增加${gain}。`);
  }
  return { messages };
}

export function consumeMemoryTrick(unit) {
  if (!unit || !stateOf(unit).cancelAttack) return { skipped: false, message: '' };
  stateOf(unit).cancelAttack = false;
  return {
    skipped: true,
    message: `【诡计】${name(unit)}本次攻击取消：在激烈的战斗之中体内能量突然停滞也不是没有可能。`,
  };
}

function protectedFromExecution(unit) {
  const ordinaryCalamity = /^foreign-(?!overlord-)/.test(String(unit?.id || ''))
    && ['孽兽', '域外邪魔', '外道修士'].includes(unit?.type);
  return Boolean((unit?.id && !ordinaryCalamity) || unit?.user_id || unit?.qq || unit?.天骄 || unit?.isTianjiao
    || unit?.boss || unit?.type === 'boss' || ['天骄', '至尊天骄'].includes(unit?.类型)
    || /天骄|大帝|仙帝|始祖/.test(name(unit)) || getRealmAuthorityLevel(unit) >= 16);
}

/** 每个真实攻击行动计一次，不按技能连击次数额外增长。 */
export function recordMemoryAttack(attacker, target, actionToken, { applyDamage, revive } = {}) {
  const messages = [];
  if (!attacker || !target || number(attacker.当前血量) <= 0 || number(target.当前血量) <= 0
    || !eligible(attacker) || getHighRealmBarrier(attacker, target)?.higherSide === 'B') return { messages };
  const state = stateOf(attacker);
  if (actionToken != null && state.actionToken === actionToken) return { messages };
  state.actionToken = actionToken;
  state.attacks++;
  const trickPeriod = atTier(attacker, '诡计', [6, 4, 2]);
  if (trickPeriod && state.attacks % trickPeriod === 0) {
    stateOf(target).cancelAttack = true;
    messages.push(`【诡计】${name(attacker)}截断敌手能量流转，${name(target)}的下一次攻击将被取消。`);
  }
  const markPeriod = atTier(attacker, '死亡', [12, 8, 4]);
  if (!markPeriod || state.attacks % markPeriod !== 0) return { messages };
  const marked = stateOf(target);
  const threshold = atTier(attacker, '死亡', [12, 12, 8]);
  marked.marks++;
  messages.push(`【死亡·灰暗】${name(target)}的灰暗印记累积至${marked.marks}/${threshold}。`);
  if (marked.marks < threshold) return { messages };
  marked.marks = 0;
  if (protectedFromExecution(target)) {
    const damage = number(target.血量上限) * .25;
    if (applyDamage) applyDamage(target, damage, attacker);
    else target.当前血量 = Math.max(0, number(target.当前血量) - damage);
    messages.push(`【死亡·灰暗终结】${name(target)}承受生命上限25%的伤害，未触发直接处决。`);
  } else {
    target.当前血量 = 0;
    messages.push(`【死亡·灰暗终结】${name(target)}的印记达到极限，生机归于沉寂。`);
  }
  if (revive) { revive(target); revive(attacker); }
  return { messages };
}

export function tryMemoryLethalSurvival(unit) {
  if (!unit || number(unit.当前血量) > 0 || !eligible(unit) || unit.不可复活) return { revived: false, message: '' };
  const state = stateOf(unit);
  if (tier(unit, '死亡') && !state.guarded) {
    state.guarded = true;
    unit.当前血量 = 1;
    unit.已死亡 = false;
    return { revived: true, guarded: true, message: `【死亡·拒绝终结】${name(unit)}保留最后1点生命，本场保命已消耗。` };
  }
  if (tier(unit, '纷争') && !state.revived) {
    state.revived = true;
    unit.当前血量 = Math.max(1, Math.floor(number(unit.血量上限) * .5));
    unit.已死亡 = false;
    return { revived: true, guarded: false, message: `【纷争·再起】${name(unit)}重返争战，恢复50%生命上限，本场复活已消耗。` };
  }
  return { revived: false, message: '' };
}

export function createMemoryTribulationState() {
  return { rounds: 0, cooldown: 0, used: false };
}

export function tickMemoryTribulationRound(state) {
  state.rounds++;
  state.cooldown = Math.max(0, number(state.cooldown) - 1);
}

/** 一次渡劫至多触发一次；冷却按后续雷劫道数递减，下一次渡劫重新初始化。 */
export function tryMemoryTimeRevival(player, state, { damage, lethal = false } = {}) {
  const cost = atTier(player, '时间', [500, 400, 300]);
  const isLethal = lethal || (damage == null ? number(player?.当前血量) <= 1 : number(damage) >= number(player?.当前血量));
  if (!cost || !isLethal || !state || state.used || number(state.cooldown) > 0 || player?.不可复活
    || number(player?.生命本源) < cost) return { revived: false, message: '', cost: 0 };
  player.生命本源 = number(player.生命本源) - cost;
  player.当前血量 = Math.max(1, number(player.血量上限));
  state.used = true;
  state.cooldown = 12;
  return { revived: true, cost, message: `【时间·逆转劫数】${name(player)}消耗${cost}点生命本源，满血复苏并避开本道劫数；冷却12道雷劫，本场仅触发一次。` };
}
