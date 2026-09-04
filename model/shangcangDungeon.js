import { createRequire } from 'node:module';
import { isDaofaActive } from './daofa.js';
import { getDungeonTimedActionMultiplier } from './innateTreasure.js';
import { getMinggeEffects, getMinggeSecretPlaceReductionMs } from './mingge.js';
import { addCappedEraAccumulation } from './selfDaoDeduction.js';

const SHANGCANG_REWARD_PLACES = createRequire(import.meta.url)(
  '../resources/data/item/副本/上苍之上列表.json',
);

export const SHANGCANG_PLANE_ID = 40;
export const SHANGCANG_NORMAL_ACTION = '上苍之上历练';
export const SHANGCANG_ADDICTION_ACTION = '沉迷上苍之上';
export const SHANGCANG_LOCATIONS = Object.freeze(['魂河', '天帝葬坑']);
export const SHANGCANG_COST = Object.freeze({
  灵石: 10_000_000_000,
  源石: 2_000_000_000,
  修为: 300_000_000,
  血气: 300_000_000,
  元神: 120_000_000,
  寿元: 20_000_000,
});

export function isShangcangAction(action) {
  return action?.action === SHANGCANG_NORMAL_ACTION || action?.action === SHANGCANG_ADDICTION_ACTION;
}

export function getShangcangCostShortage(player) {
  return Object.entries(SHANGCANG_COST).find(([field, cost]) => (Number(player?.[field]) || 0) < cost) || null;
}

export function deductShangcangCost(player) {
  if (getShangcangCostShortage(player)) return false;
  for (const [field, cost] of Object.entries(SHANGCANG_COST)) player[field] = Number(player[field]) - cost;
  return true;
}

export function formatShangcangCost() {
  return '100亿灵石、20亿源石、3亿修为、3亿血气、1.2亿元神、2000万寿元';
}

export function calculateShangcangDuration(player, minggeList = []) {
  const learned = Array.isArray(player?.学习的功法) ? player.学习的功法 : [];
  let flatMinutes = 0;
  const messages = [];
  if (learned.includes('行字秘')) {
    flatMinutes = 2 + (Number(player?.mijinglevel_id) >= 9 ? 1 : 0) + (Number(player?.mijinglevel_id) >= 16 ? 1 : 0);
    messages.push(`行字秘缩短${flatMinutes}分钟`);
  } else if (learned.includes('天璇步法')) {
    flatMinutes = 1;
    messages.push('天璇步法缩短1分钟');
  }
  if (isDaofaActive(player)) {
    flatMinutes += 2;
    messages.push('道法仙术缩短2分钟');
  }
  const minggeMs = getMinggeSecretPlaceReductionMs(getMinggeEffects(player, minggeList));
  if (minggeMs > 0) {
    flatMinutes += minggeMs / 60_000;
    messages.push(`命格缩短${Math.round(minggeMs / 1000)}秒`);
  }
  const durationMs = Math.max(
    60_000,
    Math.floor(Math.max(1, 60 - flatMinutes) * 60_000 * getDungeonTimedActionMultiplier(player)),
  );
  return { durationMs, minutes: Math.ceil(durationMs / 60_000), messages };
}

export function rollShangcangRewards(place, random = Math.random, quantityMultiplier = 1) {
  const rewardPlace = typeof place === 'string'
    ? SHANGCANG_REWARD_PLACES.find(item => item.name === place)
    : place;
  const multiplier = Math.max(1, Number(quantityMultiplier) || 1);
  const tiers = ['one', 'two', 'three', 'four'];
  const drops = tiers.flatMap(tier => Array.isArray(rewardPlace?.[tier]) ? rewardPlace[tier] : []);
  const rewards = [];
  for (const drop of drops) {
    if (!drop?.name || !drop?.class) continue;
    if (drop.guaranteed) {
      rewards.push({
        name: drop.name,
        class: drop.class,
        count: Math.max(1, Math.trunc((1 + Math.floor(random() * 3)) * multiplier)),
      });
      continue;
    }
    const chance = Math.max(0, Math.min(1, Number(drop.chance) || 0));
    if (random() < chance) {
      rewards.push({ name: drop.name, class: drop.class, count: Math.max(1, Math.trunc(multiplier)) });
    }
  }
  return rewards;
}

export function recordShangcangVictory(player) {
  player.上苍之上胜场 = Math.max(0, Math.trunc(Number(player.上苍之上胜场) || 0)) + 1;
  const progress = Math.max(0, Math.trunc(Number(player.上苍之上纪元进度) || 0)) + 1;
  const requested = Math.floor(progress / 3) * 5;
  const era = addCappedEraAccumulation(player, requested);
  player.上苍之上纪元进度 = progress % 3;
  return { ...era, progress: player.上苍之上纪元进度, wins: player.上苍之上胜场 };
}
