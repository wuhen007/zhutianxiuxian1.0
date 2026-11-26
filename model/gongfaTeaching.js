import { hasRealmAuthority } from './realmAuthority.js';
import { getMemoryEffects } from './memoryPath.js';

export const TEACH_MIN_MIJING_LEVEL = 12;
export const TEACH_MIN_XIANGU_LEVEL = 11;
export const TEACH_MIN_AUTHORITY_LEVEL = 12;

const GONGFA_HIERARCHY = Object.freeze({
  武学: 0,
  限定功法: 0,
  修炼功法: 1,
  炼器: 1,
  炼丹: 1,
  推演: 1,
  技能: 1,
  天魔法: 2,
  命运法: 2,
  天赋: 2,
  道与法: 3,
  宝术: 3,
  精神法门: 3,
  九秘: 4,
  盖世杀术: 4,
  帝经: 5,
  十凶宝术: 6,
  仙王法: 7,
  仙帝法: 8,
  神慧者: 9,
});

export function canTeachGongfa(player) {
  return hasRealmAuthority(player, TEACH_MIN_AUTHORITY_LEVEL);
}

export function getGongfaLevel(type) {
  return GONGFA_HIERARCHY[type] ?? 8;
}

export function getTeachingSuccessRate(level, aptitude) {
  if (aptitude === '生而愚痴') return 0.3;
  if (level >= 6) return 0.7;
  if (level >= 4) return 0.8;
  return 1;
}

export function getLearningPotentialCost(player, baseCost) {
  return Math.max(0, Math.ceil(Math.max(0, Number(baseCost) || 0) * getMemoryEffects(player).learnCostMultiplier));
}

export function getTeachingCosts(level, learner) {
  return {
    potential: getLearningPotentialCost(learner, level + 1),
    spirit: 100000 * (level + 1) * (level + 1),
  };
}

export function reserveTeachingCosts(state, level, learner) {
  const costs = getTeachingCosts(level, learner);
  if (state.remainingPotential < costs.potential) {
    return { ok: false, reason: 'potential', ...state, costs };
  }
  if (state.remainingSpirit < costs.spirit) {
    return { ok: false, reason: 'spirit', ...state, costs };
  }
  return {
    ok: true,
    remainingPotential: state.remainingPotential - costs.potential,
    remainingSpirit: state.remainingSpirit - costs.spirit,
    costs,
  };
}

export function applyTeachingResult(target, gongfaNames, remainingPotential) {
  target.学习的功法 = Array.isArray(target.学习的功法) ? target.学习的功法 : [];
  for (const gongfaName of gongfaNames) {
    if (!target.学习的功法.includes(gongfaName)) target.学习的功法.push(gongfaName);
  }
  target.仙道潜力 = remainingPotential;
  return target;
}
