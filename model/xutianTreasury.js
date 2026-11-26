export const XUTIAN_MASTER_INHERITANCE_CHANCE = 0.001;

export const XUTIAN_TREASURY_REWARDS = Object.freeze([
  Object.freeze({ name: '定神丹', class: '丹药', amount: 2, weight: 3490 }),
  Object.freeze({ name: '太虚养神丹', class: '丹药', amount: 1, weight: 2500 }),
  Object.freeze({ name: '七窍养神丹', class: '丹药', amount: 1, weight: 1000 }),
  Object.freeze({ name: '太虚拓识丹', class: '丹药', amount: 1, weight: 500 }),
  Object.freeze({ name: '虚天悟道丹', class: '丹药', amount: 1, weight: 1000 }),
  Object.freeze({ name: '九灭重生经', class: '功法', amount: 1, weight: 500 }),
  Object.freeze({ name: '神灵斩劫经', class: '功法', amount: 1, weight: 500 }),
  Object.freeze({ name: '元神盾', class: '功法', amount: 1, weight: 500 }),
  Object.freeze({ name: '虚天之主传承', class: '道具', amount: 1, weight: 10 }),
]);

const TOTAL_WEIGHT = XUTIAN_TREASURY_REWARDS.reduce((sum, reward) => sum + reward.weight, 0);

export function pickXutianTreasuryReward(random = Math.random) {
  let roll = Math.min(Math.max(Number(random()) || 0, 0), 1 - Number.EPSILON) * TOTAL_WEIGHT;
  for (const reward of XUTIAN_TREASURY_REWARDS) {
    roll -= reward.weight;
    if (roll < 0) return { ...reward };
  }
  return { ...XUTIAN_TREASURY_REWARDS.at(-1) };
}

export function validateXutianTreasuryRewards(rewards = XUTIAN_TREASURY_REWARDS) {
  return rewards.every(reward => reward.name && reward.class && reward.amount > 0 && reward.weight > 0);
}
