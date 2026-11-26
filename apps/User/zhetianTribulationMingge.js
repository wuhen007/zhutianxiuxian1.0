import {
  calculateMinggeChance,
  calculateMinggeCost,
  getMinggeEffectNumber,
} from '../../model/mingge.js';

export function calculateZhetianTribulationCosts(
  eraAdjustedCost,
  effects = {},
  type = 'tribulation'
) {
  const bloodCost = Math.max(0, Math.ceil(Number(eraAdjustedCost) || 0));
  const reductionKey = type === 'zhengdao' ? '证道修为减少' : '渡劫修为减少';
  const cultivationCost = calculateMinggeCost(
    bloodCost,
    effects,
    reductionKey,
    null,
    { minimum: 0 }
  );

  return {
    bloodCost,
    cultivationCost,
    reduction: Math.max(0, getMinggeEffectNumber(effects, reductionKey)),
  };
}

export function rollZhetianMinggeRevival(effects = {}, random = Math.random) {
  const chance = calculateMinggeChance(0, effects, '复活概率');
  return {
    chance,
    revived: chance > 0 && Number(random()) < chance,
  };
}
