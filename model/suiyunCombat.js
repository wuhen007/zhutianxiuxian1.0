import { getSuiyunStage, hasSuiyunSkills } from './suiyun.js';
import { getHighRealmBarrier } from './highRealmBarrier.js';

// 未指定的推条/控制时长/防反比例集中于此；岁云灵根与月华受赐者不占功法槽。
export const SUIYUN_COMBAT = Object.freeze({
  targets: 9, hits: 9, multiplier: 25,
  pushback: 2500, controlTurns: 1, frostRatio: .2,
  defenseReduction: .5, reflectionRatio: 1,
  revives: 3, reviveMultiplier: 1.5,
  executionThreshold: .15,
});

/** 岁云常青的杀伐延伸：讨伐天骄与诛仙四剑被动同级，单次至多斩落 40% 气血。 */
export const SUIYUN_TIANJIAO_PROGRESS = Object.freeze({ win: 40, lose: 2 });
export const TIANJIAO_BASE_PROGRESS = Object.freeze({ win: 20, lose: 1 });

const value = (number, fallback = 0) => Number.isFinite(Number(number)) ? Math.max(0, Number(number)) : fallback;
const scaled = (number, ratio, minimum = 0) => Math.max(minimum, Math.min(Number.MAX_VALUE, value(number) * ratio));
const living = unit => value(unit?.当前血量) > 0;
const eligible = unit => hasSuiyunSkills(unit) && !unit?._高境界镇杀 && !unit?._高境界压制;
const label = unit => unit?.名号 || unit?.name || '修士';

/** 常青属于灵根本人，不随月华三技或召唤物复制。 */
export function hasSuiyunEvergreen(unit) {
  return getSuiyunStage(unit) > 0 && !unit?._高境界镇杀 && !unit?._高境界压制
    && !unit?._tahua_type && !unit?._yiqihua_entity && !unit?._万灵魔幡主魂
    && !unit?._帝骑分身 && !unit?._圆神分身 && unit?.分身 !== true;
}

/**
 * 讨伐天骄的单次进度伤害。岁云常青与诛仙四剑被动同级，两者并存不叠加，40% 即上限。
 * 只共享“斩落气血”这一路，诛仙四剑的降仇恨与畏惧仍由至宝自己结算。
 */
export function getTianjiaoProgressPenalty(player, { zhuxian = false } = {}) {
  if (zhuxian) return { win: SUIYUN_TIANJIAO_PROGRESS.win, lose: SUIYUN_TIANJIAO_PROGRESS.lose, empowered: true, source: '诛仙四剑' };
  if (hasSuiyunEvergreen(player)) return { win: SUIYUN_TIANJIAO_PROGRESS.win, lose: SUIYUN_TIANJIAO_PROGRESS.lose, empowered: true, source: '岁云常青' };
  return { win: TIANJIAO_BASE_PROGRESS.win, lose: TIANJIAO_BASE_PROGRESS.lose, empowered: false, source: '' };
}

export function clearSuiyunBattleRestrictions(unit) {
  if (!hasSuiyunEvergreen(unit)) return false;
  unit.不可复活 = false;
  unit.禁疗 = 0;
  for (const field of ['_先天禁疗', '_技能禁疗回合', '_技能禁疗原值', '_帝骑禁疗回合', '_帝骑原禁疗', '_大道生死断轮回', '_suiyunExecutionBlocked']) delete unit[field];
  return true;
}

export function getSuiyunHealingMultiplier(unit) {
  if (clearSuiyunBattleRestrictions(unit)) return 1;
  return unit?._先天禁疗 ? 0 : 1 - Math.min(1, value(unit?.禁疗));
}

export function canExecuteCombatTarget(unit, messages, source = '斩杀') {
  if (!unit || !living(unit)) return false;
  if (hasSuiyunEvergreen(unit)) {
    messages?.push(`【岁云常青】${label(unit)}免疫${source}的即死裁决。`);
    return false;
  }
  return true;
}

export function executeCombatTarget(unit, messages, source = '斩杀', blockRevival = false) {
  if (!canExecuteCombatTarget(unit, messages, source)) return false;
  if (blockRevival) unit.不可复活 = true;
  unit.当前血量 = 0;
  return true;
}

/** 也在霜剑伤害扣血后、复活前调用，避免致命连击提前复生。 */
export function executeSuiyunMoonTarget(unit, messages) {
  if (!unit || value(unit.当前血量) >= value(unit.血量上限) * SUIYUN_COMBAT.executionThreshold || hasSuiyunEvergreen(unit)) return false;
  if (value(unit.血量上限) <= 0) return false;
  unit.不可复活 = true;
  unit._suiyunExecutionBlocked = true;
  unit.当前血量 = 0;
  messages?.push(`【霜剑入月·斩月】${label(unit)}生命低于15%，直接斩杀并封禁复活。`);
  return true;
}

/** 仅对本场战斗副本调用；下场不继承控制、霜寒或复活计数。 */
export function resetSuiyunCombat(unit) {
  if (!unit) return unit;
  for (const field of ['_suiyunFrost', '_suiyunFrostTurn', '_suiyunControl', '_suiyunRevives', '_suiyunMoonHit', '_suiyunExecutionBlocked']) delete unit[field];
  clearSuiyunBattleRestrictions(unit);
  return unit;
}

export function tickSuiyunFrost(unit, turnToken) {
  const inactive = { active: false, messages: [], speedMultiplier: 1, hpLost: 0 };
  if (!unit?._suiyunFrost || !living(unit)) return inactive;
  if (turnToken != null && unit._suiyunFrostTurn === turnToken) return inactive;
  if (turnToken != null) unit._suiyunFrostTurn = turnToken;
  const multiplier = 1 - SUIYUN_COMBAT.frostRatio;
  const before = value(unit.当前血量);
  // 霜寒是持续百分比衰减，不按命中次数叠层，不经过攻击防御/反伤管线。
  unit.当前血量 = Math.floor(scaled(before, multiplier));
  unit.攻击 = scaled(unit.攻击, multiplier);
  unit.防御 = scaled(unit.防御, multiplier);
  unit.速度 = scaled(unit.速度 ?? 100, multiplier, 1);
  if (unit._speed != null) unit._speed = scaled(unit._speed, multiplier, 1);
  return {
    active: true, hpLost: before - unit.当前血量, speedMultiplier: multiplier,
    messages: [`【霜寒】${label(unit)}本回合当前生命、攻击、防御、速度各减少20%。`],
  };
}

export function consumeSuiyunControl(unit) {
  if (!(value(unit?._suiyunControl) > 0)) return false;
  unit._suiyunControl = Math.max(0, Math.trunc(value(unit._suiyunControl)) - 1);
  return true;
}

export function reduceSuiyunDamage(defender, damage) {
  const incoming = value(damage);
  return eligible(defender) ? Math.floor(incoming * (1 - SUIYUN_COMBAT.defenseReduction)) : incoming;
}

/** 传入护盾和替身结算后的实际掉血；反伤只结算一次，永不递归反弹。 */
export function reflectSuiyunDamage(defender, attacker, actualLost) {
  if (!eligible(defender) || !attacker || attacker === defender || !living(attacker)
    || !(value(actualLost) > 0) || getHighRealmBarrier(defender, attacker)?.higherSide === 'B') {
    return { reflected: false, damage: 0, messages: [] };
  }
  const raw = scaled(actualLost, SUIYUN_COMBAT.reflectionRatio);
  const damage = Math.min(value(attacker.当前血量), reduceSuiyunDamage(attacker, raw));
  attacker.当前血量 = Math.max(0, value(attacker.当前血量) - damage);
  return {
    reflected: damage > 0, damage,
    messages: damage > 0 ? [`【岁云归一】${label(defender)}归一护体，向${label(attacker)}反还${damage}点伤害。`] : [],
  };
}

export function trySuiyunRevival(unit) {
  clearSuiyunBattleRestrictions(unit);
  const used = Math.max(0, Math.trunc(value(unit?._suiyunRevives)));
  const inactive = { revived: false, message: '', speedMultiplier: 1, remaining: Math.max(0, SUIYUN_COMBAT.revives - used) };
  if (!eligible(unit) || living(unit) || unit?.不可复活 || used >= SUIYUN_COMBAT.revives) return inactive;
  const multiplier = SUIYUN_COMBAT.reviveMultiplier;
  unit._suiyunRevives = used + 1;
  unit.攻击 = scaled(unit.攻击, multiplier);
  unit.防御 = scaled(unit.防御, multiplier);
  unit.血量上限 = scaled(unit.血量上限, multiplier, 1);
  unit.速度 = scaled(unit.速度 ?? 100, multiplier, 1);
  if (unit._speed != null) unit._speed = scaled(unit._speed, multiplier, 1);
  unit.当前血量 = unit.血量上限;
  unit.已死亡 = false;
  return {
    revived: true, speedMultiplier: multiplier, remaining: SUIYUN_COMBAT.revives - used - 1,
    message: `【白云苍狗】${label(unit)}第${used + 1}/3次重归世间，攻、防、生命上限与速度提升50%，气血回满！`,
  };
}

/**
 * 引擎提供真实扣血/复活接口：跳过防御技能与防御公式，保留其护盾及伤害结算。
 * 9个不同敌方单位各9击；不分摊、不随目标或连击序号递减。
 */
export function castSuiyunMoonSword(attacker, enemies, { applyDamage, revive, pushActionBar } = {}) {
  const result = { active: false, messages: [], totalDamage: 0, hits: 0, targets: 0 };
  if (!eligible(attacker) || !living(attacker)) return result;
  const targets = [...new Set(Array.isArray(enemies) ? enemies : [enemies])]
    .filter(target => target && target !== attacker && living(target)
      && getHighRealmBarrier(attacker, target)?.higherSide !== 'B')
    .slice(0, SUIYUN_COMBAT.targets);
  if (!targets.length) return result;
  const reviveUnit = unit => {
    if (living(unit)) return;
    if (revive) revive(unit);
    else {
      const revival = trySuiyunRevival(unit);
      if (revival.revived) result.messages.push(revival.message);
    }
  };
  const deal = applyDamage || ((target, raw, source) => {
    const actual = Math.min(value(target.当前血量), reduceSuiyunDamage(target, raw));
    target.当前血量 = Math.max(0, value(target.当前血量) - actual);
    const reflected = reflectSuiyunDamage(target, source, actual);
    result.messages.push(...reflected.messages);
    return actual;
  });
  result.active = true;
  result.messages.push(`【霜剑入月】${label(attacker)}凝月成霜，对至多九名敌人各斩九剑，每剑25倍攻击且群攻不衰减！`);
  for (const target of targets) {
    if (!living(attacker)) break;
    if (!living(target)) continue;
    target._suiyunFrost = true;
    target._suiyunControl = Math.max(value(target._suiyunControl), SUIYUN_COMBAT.controlTurns);
    // 绝对控制不消费普通免控/定海护持，并且每次施展仅推条一次。
    if (pushActionBar) pushActionBar(target, SUIYUN_COMBAT.pushback);
    else target._actionBar = Math.max(0, value(target._actionBar) - SUIYUN_COMBAT.pushback);
    result.targets++;
    result.messages.push(`【霜寒绝控】${label(target)}下一次行动被封禁，行动条降低2500点，霜寒持续本场战斗。`);
    let damage = 0;
    let hits = 0;
    if (executeSuiyunMoonTarget(target, result.messages)) continue;
    for (let index = 0; index < SUIYUN_COMBAT.hits && living(attacker) && living(target); index++) {
      let actual;
      target._suiyunMoonHit = true;
      try { actual = deal(target, scaled(attacker.攻击, SUIYUN_COMBAT.multiplier), attacker); }
      finally { delete target._suiyunMoonHit; }
      damage += value(actual);
      hits++;
      executeSuiyunMoonTarget(target, result.messages);
      reviveUnit(target);
      reviveUnit(attacker);
    }
    result.totalDamage += damage;
    result.hits += hits;
    result.messages.push(`霜剑击中${label(target)}${hits}次，实际伤害合计${damage}。`);
  }
  return result;
}
