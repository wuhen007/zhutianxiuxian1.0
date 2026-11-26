import {
  FISHING_PLANE_NAMES,
  getPlaneFishAtlas,
  getPlaneFishConfig,
} from './immortalFishing.js';

export const IMMORTAL_FISHING_SIGN_BASE_REWARD = 1;
export const IMMORTAL_FISHING_SIGN_STREAK_BONUS_DAY = 7;
export const IMMORTAL_FISHING_SIGN_STREAK_BONUS = 1;

/** 垂纶签到随机仙饵奖池：权重越低越稀有 */
export const IMMORTAL_FISHING_SIGN_BAIT_POOL = Object.freeze([
  { name: '百草香饵', weight: 30 },
  { name: '神藏仙饵', weight: 24 },
  { name: '矿髓沉饵', weight: 20 },
  { name: '因果道饵', weight: 16 },
  { name: '轮回冥饵', weight: 10 },
]);

/** 每日随机仙饵数量区间（第7日潮头在区间外再额外 +1） */
export const IMMORTAL_FISHING_SIGN_BAIT_MIN = 1;
export const IMMORTAL_FISHING_SIGN_BAIT_MAX = 3;

export const FISH_ATLAS_SET_REWARD_BUNDLE = Object.freeze([
  { name: '众生仙钓', class: '道具', amount: 5 },
  { name: '众生愿鳞', class: '道具', amount: 10 },
]);

const PLANE_SET_BAIT = Object.freeze({
  凡间: '百草香饵',
  仙界: '神藏仙饵',
  遮天位面: '因果道饵',
  下界八域: '百草香饵',
  九天十地: '矿髓沉饵',
  太初星墟: '因果道饵',
  仙域: '轮回冥饵',
});

const DISCOVERY_REWARD = Object.freeze({
  ordinary: { name: '众生愿鳞', class: '道具', amount: 1 },
  king: { name: '众生愿鳞', class: '道具', amount: 3 },
});

export function getFishAtlasSetRewardBundle(planeName) {
  const baitName = PLANE_SET_BAIT[planeName];
  return [
    ...FISH_ATLAS_SET_REWARD_BUNDLE.map(reward => ({ ...reward })),
    ...(baitName ? [{ name: baitName, class: '道具', amount: 2 }] : []),
  ];
}

/**
 * A set is repeatable: one copy of every fish in a plane can be exchanged.
 * The actual fish quantities are consumed by consumeFishAtlasSets.
 */
export function getPendingFishAtlasRewards(player) {
  if (!player) return [];
  const claimed = player.众生鱼图鉴奖励;
  const exchanged = player.众生鱼图鉴套装兑换;
  const pending = [];
  const add = (key, reward, reason, consume) => {
    if (claimed?.[key] && !consume) return;
    pending.push({ key, ...reward, reason, consume });
  };

  for (const plane of FISHING_PLANE_NAMES) {
    const atlas = getPlaneFishAtlas(player, plane);
    for (const entry of atlas.entries) {
      if (entry.count <= 0) continue;
      const reward = entry.king ? DISCOVERY_REWARD.king : DISCOVERY_REWARD.ordinary;
      add('discovery:' + plane + ':' + entry.name, reward, plane + '鱼谱发现' + entry.name);
    }

    const availableSets = Math.min(...atlas.entries.map(entry => Math.floor(entry.count)));
    const consumedSets = Math.max(0, Math.trunc(Number(exchanged?.[plane]) || 0));
    for (let index = 1; index <= availableSets; index++) {
      const setNumber = consumedSets + index;
      const key = 'set:' + plane + ':' + setNumber;
      const bundle = getFishAtlasSetRewardBundle(plane);
      bundle.forEach((reward, rewardIndex) => {
        // consume 只在每套首个奖励项上标记一次，避免求和时重复扣减
        pending.push({
          key,
          ...reward,
          reason: plane + '鱼谱第' + setNumber + '套集齐',
          consume: rewardIndex === 0 ? { plane, amount: 1 } : undefined,
        });
      });
    }
  }
  return pending;
}

export function consumeFishAtlasSets(player, rewards = []) {
  if (!player || !Array.isArray(rewards)) return;
  const amounts = new Map();
  for (const reward of rewards) {
    const plane = reward?.consume?.plane;
    const amount = Math.max(0, Math.trunc(Number(reward?.consume?.amount) || 0));
    if (plane && amount > 0) amounts.set(plane, (amounts.get(plane) || 0) + amount);
  }
  for (const [plane, amount] of amounts) {
    const config = getPlaneFishConfig(plane);
    if (!config) continue;
    const records = player.众生鱼图鉴?.[plane];
    if (!records || typeof records !== 'object') continue;
    for (const fish of [...config.fish, config.king]) {
      records[fish.name] = Math.max(0, (Number(records[fish.name]) || 0) - amount);
    }
    if (!player.众生鱼图鉴套装兑换 || typeof player.众生鱼图鉴套装兑换 !== 'object') {
      player.众生鱼图鉴套装兑换 = {};
    }
    player.众生鱼图鉴套装兑换[plane] =
      Math.max(0, Math.trunc(Number(player.众生鱼图鉴套装兑换[plane]) || 0)) + amount;
  }
}

export function markFishAtlasRewardsClaimed(player, rewards = []) {
  if (!player || !Array.isArray(rewards) || rewards.length === 0) return;
  if (!player.众生鱼图鉴奖励
    || typeof player.众生鱼图鉴奖励 !== 'object'
    || Array.isArray(player.众生鱼图鉴奖励)) {
    player.众生鱼图鉴奖励 = {};
  }
  for (const reward of rewards) {
    if (reward?.key && !reward.consume) player.众生鱼图鉴奖励[reward.key] = Date.now();
  }
}

export function getImmortalFishingDate(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year + '-' + values.month + '-' + values.day;
}

/** 按权重抽取一种签到仙饵 */
export function rollSignBait(random = Math.random) {
  const totalWeight = IMMORTAL_FISHING_SIGN_BAIT_POOL.reduce(
    (sum, bait) => sum + bait.weight,
    0
  );
  let cursor = Math.max(0, Math.min(0.999999999, random())) * totalWeight;
  for (const bait of IMMORTAL_FISHING_SIGN_BAIT_POOL) {
    cursor -= bait.weight;
    if (cursor < 0) return bait.name;
  }
  return IMMORTAL_FISHING_SIGN_BAIT_POOL[IMMORTAL_FISHING_SIGN_BAIT_POOL.length - 1].name;
}

/**
 * 组装垂纶签到奖励：
 * - hookAmount：众生仙钓数量（第7日潮头额外 +1）
 * - baits：随机仙饵清单（1~3 种/个，第7日额外 +1 个，同类合并）
 */
export function buildImmortalFishingSignRewards(streak, random = Math.random) {
  const bonus = Number(streak) % IMMORTAL_FISHING_SIGN_STREAK_BONUS_DAY === 0;
  const hookAmount = IMMORTAL_FISHING_SIGN_BASE_REWARD
    + (bonus ? IMMORTAL_FISHING_SIGN_STREAK_BONUS : 0);
  const baitCount = IMMORTAL_FISHING_SIGN_BAIT_MIN
    + Math.floor(
      Math.max(0, Math.min(0.999999999, random()))
        * (IMMORTAL_FISHING_SIGN_BAIT_MAX - IMMORTAL_FISHING_SIGN_BAIT_MIN + 1)
    )
    + (bonus ? IMMORTAL_FISHING_SIGN_STREAK_BONUS : 0);
  const counts = new Map();
  for (let index = 0; index < baitCount; index++) {
    const name = rollSignBait(random);
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return {
    hookAmount,
    baits: [...counts.entries()].map(([name, amount]) => ({ name, amount })),
  };
}

export function claimImmortalFishingSign(player, now = Date.now(), random = Math.random) {
  if (!player) return { claimed: false, reason: 'missing-player' };
  const today = getImmortalFishingDate(now);
  const yesterday = getImmortalFishingDate(Number(now) - 24 * 60 * 60 * 1000);
  const current = player.众生仙钓签到
    && typeof player.众生仙钓签到 === 'object'
    && !Array.isArray(player.众生仙钓签到)
    ? player.众生仙钓签到
    : {};
  if (current.lastDate === today) {
    return {
      claimed: false,
      alreadyClaimed: true,
      date: today,
      streak: Math.max(0, Math.trunc(Number(current.streak) || 0)),
      amount: 0,
      rewards: null,
    };
  }

  const previousStreak = Math.max(0, Math.trunc(Number(current.streak) || 0));
  const streak = current.lastDate === yesterday ? previousStreak + 1 : 1;
  const rewards = buildImmortalFishingSignRewards(streak, random);
  const amount = rewards.hookAmount;
  player.众生仙钓签到 = {
    lastDate: today,
    streak,
    total: Math.max(0, Math.trunc(Number(current.total) || 0)) + 1,
  };
  return {
    claimed: true,
    alreadyClaimed: false,
    date: today,
    streak,
    amount,
    rewards,
  };
}