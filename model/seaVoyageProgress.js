/**
 * 舟出海探险 —— 海域见闻录进度与套装兑换（照抄 immortalFishingProgress 结构）
 *
 * 见闻记录在 player.海域见闻录[航线][见闻名]；
 * 首次发现给 1 愿鳞；集齐一航线全部见闻 → 兑换 5 仙钓 + 10 愿鳞 + 2 航线特产饵料，
 * 并消耗该航线每种见闻各 1 条（防止无限兑换）。
 */
import {
  SEA_ATLAS,
  getSeaAtlasEntries,
  getSeaRoute,
} from './seaVoyage.js';

export const SEA_ATLAS_DISCOVERY_REWARD = Object.freeze({
  name: '众生愿鳞',
  class: '道具',
  amount: 1,
});

export const SEA_ATLAS_SET_REWARD_BUNDLE = Object.freeze([
  { name: '众生仙钓', class: '道具', amount: 5 },
  { name: '众生愿鳞', class: '道具', amount: 10 },
]);

export const SEA_ATLAS_SET_BAIT_AMOUNT = 2;

export function getSeaRouteAtlasSetRewardBundle(routeName) {
  const route = getSeaRoute(routeName);
  return [
    ...SEA_ATLAS_SET_REWARD_BUNDLE.map(reward => ({ ...reward })),
    ...(route?.bait
      ? [{ name: route.bait, class: '道具', amount: SEA_ATLAS_SET_BAIT_AMOUNT }]
      : []),
  ];
}

/** 记录一条见闻（同名累加） */
export function recordSeaSighting(player, routeName, sightingName, amount = 1) {
  if (!player || !routeName || !sightingName) return 0;
  player.海域见闻录 ||= {};
  player.海域见闻录[routeName] ||= {};
  const current = Number(player.海域见闻录[routeName][sightingName]) || 0;
  player.海域见闻录[routeName][sightingName] = current + Math.max(1, Math.trunc(amount));
  return player.海域见闻录[routeName][sightingName];
}

/** 单航线见闻进度 */
export function getSeaRouteAtlas(player, routeName) {
  const entries = getSeaAtlasEntries(routeName);
  if (!entries) return null;
  const records = player?.海域见闻录?.[routeName] || {};
  const atlasEntries = entries.map(entry => ({
    name: entry.name,
    kind: entry.kind,
    count: Number(records[entry.name]) || 0,
  }));
  return {
    route: routeName,
    entries: atlasEntries,
    collected: atlasEntries.filter(entry => entry.count > 0).length,
    total: atlasEntries.length,
  };
}

/**
 * 可领取的见闻奖励：
 * - discovery：每条见闻首次发现（一次性）
 * - set：每集齐一套（每条见闻各 ≥1）即可兑换，consume 只在套内首个奖励项上标记
 */
export function getPendingSeaVoyageRewards(player) {
  if (!player) return [];
  const claimed = player.海域见闻录奖励;
  const exchanged = player.海域见闻套装兑换;
  const pending = [];
  const add = (key, reward, reason, consume) => {
    if (claimed?.[key] && !consume) return;
    pending.push({ key, ...reward, reason, consume });
  };

  for (const routeName of Object.keys(SEA_ATLAS)) {
    const atlas = getSeaRouteAtlas(player, routeName);
    if (!atlas) continue;
    for (const entry of atlas.entries) {
      if (entry.count <= 0) continue;
      add('discovery:' + routeName + ':' + entry.name, { ...SEA_ATLAS_DISCOVERY_REWARD }, routeName + '见闻' + entry.name);
    }
    const availableSets = Math.min(...atlas.entries.map(entry => Math.floor(entry.count)));
    const consumedSets = Math.max(0, Math.trunc(Number(exchanged?.[routeName]) || 0));
    for (let index = 1; index <= availableSets; index++) {
      const setNumber = consumedSets + index;
      const key = 'set:' + routeName + ':' + setNumber;
      const bundle = getSeaRouteAtlasSetRewardBundle(routeName);
      bundle.forEach((reward, rewardIndex) => {
        pending.push({
          key,
          ...reward,
          reason: routeName + '见闻第' + setNumber + '套集齐',
          consume: rewardIndex === 0 ? { route: routeName, amount: 1 } : undefined,
        });
      });
    }
  }
  return pending;
}

/** 消耗集齐的见闻套装（每条见闻各 -1）并累计兑换次数 */
export function consumeSeaVoyageSets(player, rewards = []) {
  if (!player || !Array.isArray(rewards)) return;
  const amounts = new Map();
  for (const reward of rewards) {
    const route = reward?.consume?.route;
    const amount = Math.max(0, Math.trunc(Number(reward?.consume?.amount) || 0));
    if (route && amount > 0) amounts.set(route, (amounts.get(route) || 0) + amount);
  }
  for (const [routeName, amount] of amounts) {
    const entries = getSeaAtlasEntries(routeName);
    if (!entries) continue;
    const records = player.海域见闻录?.[routeName];
    if (!records || typeof records !== 'object') continue;
    for (const entry of entries) {
      records[entry.name] = Math.max(0, (Number(records[entry.name]) || 0) - amount);
    }
    if (!player.海域见闻套装兑换 || typeof player.海域见闻套装兑换 !== 'object') {
      player.海域见闻套装兑换 = {};
    }
    player.海域见闻套装兑换[routeName] =
      Math.max(0, Math.trunc(Number(player.海域见闻套装兑换[routeName]) || 0)) + amount;
  }
}

/** 标记已领取（仅一次性 discovery 项；set 项由兑换次数追踪） */
export function markSeaVoyageRewardsClaimed(player, rewards = []) {
  if (!player || !Array.isArray(rewards) || rewards.length === 0) return;
  if (!player.海域见闻录奖励
    || typeof player.海域见闻录奖励 !== 'object'
    || Array.isArray(player.海域见闻录奖励)) {
    player.海域见闻录奖励 = {};
  }
  for (const reward of rewards) {
    if (reward?.key && !reward.consume) player.海域见闻录奖励[reward.key] = Date.now();
  }
}
