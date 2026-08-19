const EQUIPMENT_BEASTS = new Set(['玄武', '朱雀', '白虎']);
const MAX_REWARD_RARITY = 4;

export function getDivineBeastRewardPool(beast, preferred, data) {
  if (beast === '麒麟') {
    return (preferred ? data.qilin : data.danyao_list)
      .filter(item => Number(item.稀有度) <= MAX_REWARD_RARITY);
  }

  if (beast === '青龙') {
    return (preferred ? data.qinlong : data.gongfa_list)
      .filter(item => Number(item.稀有度) <= MAX_REWARD_RARITY);
  }

  if (EQUIPMENT_BEASTS.has(beast)) {
    return (preferred ? data.xuanwu : data.equipment_list)
      .filter(item => item.name !== '大罗剑胎');
  }

  return [];
}

export function pickDivineBeastReward(beast, preferred, data, random = Math.random) {
  const pool = getDivineBeastRewardPool(beast, preferred, data);
  if (pool.length === 0) throw new Error(`神兽${beast}没有可用奖励`);
  return pool[Math.floor(random() * pool.length)];
}
