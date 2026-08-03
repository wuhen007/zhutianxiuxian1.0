export const SMALL_WORLD_ALCHEMY_RATE = 0.05;

export const SMALL_WORLD_PILL_POOL = [
  { name: '小界蕴灵丹', weight: 70 },
  { name: '洞天造化丹', weight: 22 },
  { name: '世界本源丹', weight: 7 },
  { name: '鸿蒙道源丹', weight: 1 },
];

export const XUTIAN_SMALL_WORLD_PILL_POOL = [
  { name: '小界蕴灵丹', weight: 55 },
  { name: '洞天造化丹', weight: 20 },
  { name: '世界本源丹', weight: 6 },
  { name: '鸿蒙道源丹', weight: 1 },
  { name: '定神丹', weight: 14 },
  { name: '太虚养神丹', weight: 4 },
];

export function pickSmallWorldPill(randomValue = Math.random(), options = {}) {
  const pool = options.xutianAlchemy ? XUTIAN_SMALL_WORLD_PILL_POOL : SMALL_WORLD_PILL_POOL;
  let roll = Math.min(Math.max(Number(randomValue) || 0, 0), 1 - Number.EPSILON) * 100;

  for (const pill of pool) {
    if (roll < pill.weight) return pill.name;
    roll -= pill.weight;
  }

  return pool.at(-1).name;
}
