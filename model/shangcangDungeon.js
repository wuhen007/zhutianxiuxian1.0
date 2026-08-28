import { isDaofaActive } from './daofa.js';
import { getDungeonTimedActionMultiplier } from './innateTreasure.js';
import { getMinggeEffects, getMinggeSecretPlaceReductionMs } from './mingge.js';

export const SHANGCANG_PLANE_ID = 200;
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

const SOUL_RIVER_DROPS = Object.freeze([
  { name: '天帝拳残页', class: '材料', chance: 0.12 },
  { name: '诸世帝魂莲', class: '丹药', chance: 0.015 },
  { name: '魂河渡世灯', class: '装备', chance: 0.006 },
  { name: '诸世无痕符', class: '道具', chance: 0.003 },
  { name: '花粉路祖种', class: '道具', chance: 0.0012 },
  { name: '万劫轮回莲', class: '草药', chance: 0.001 },
]);

const BURIAL_PIT_DROPS = Object.freeze([
  { name: '葬天古经残页', class: '材料', chance: 0.10 },
  { name: '葬帝玄甲', class: '装备', chance: 0.006 },
  { name: '天帝鼎', class: '装备', chance: 0.003 },
  { name: '荒剑', class: '装备', chance: 0.003 },
  { name: '雷池', class: '装备', chance: 0.003 },
  { name: '时光炉', class: '道具', chance: 0.0012 },
  { name: '祭道甲胄', class: '装备', chance: 0.0005 },
  { name: '女帝战戟', class: '装备', chance: 0.0003 },
]);

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

export function rollShangcangRewards(location, random = Math.random, quantityMultiplier = 1) {
  const soulRiver = location === '魂河';
  const guaranteed = soulRiver
    ? { name: '魂河古晶', class: '材料' }
    : { name: '葬帝黑金', class: '材料' };
  const multiplier = Math.max(1, Number(quantityMultiplier) || 1);
  const rewards = [{ ...guaranteed, count: Math.max(1, Math.trunc((1 + Math.floor(random() * 3)) * multiplier)) }];
  for (const drop of soulRiver ? SOUL_RIVER_DROPS : BURIAL_PIT_DROPS) {
    if (random() < drop.chance) rewards.push({ name: drop.name, class: drop.class, count: Math.max(1, Math.trunc(multiplier)) });
  }
  return rewards;
}

export function recordShangcangVictory(player) {
  player.上苍之上胜场 = Math.max(0, Math.trunc(Number(player.上苍之上胜场) || 0)) + 1;
  const progress = Math.max(0, Math.trunc(Number(player.上苍之上纪元进度) || 0)) + 1;
  const requested = Math.floor(progress / 3) * 5;
  const before = Math.max(0, Number(player.纪元积累) || 0);
  player.纪元积累 = Math.min(100, before + requested);
  player.上苍之上纪元进度 = progress % 3;
  return { gained: player.纪元积累 - before, progress: player.上苍之上纪元进度, wins: player.上苍之上胜场 };
}
