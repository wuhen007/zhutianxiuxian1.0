import { SMALL_WORLD_ALCHEMY_RATE } from './smallWorldAlchemy.js';

export const WORKSHOP_LEVEL_EFFECTS = Object.freeze({
  1: { capacity: 1, outputBonus: 1.0 },
  2: { capacity: 2, outputBonus: 1.2 },
  3: { capacity: 3, outputBonus: 1.4 },
  4: { capacity: 4, outputBonus: 1.7 },
  5: { capacity: 5, outputBonus: 2.0 },
  6: { capacity: 6, outputBonus: 2.5 },
});

export const WORKSHOP_UPGRADE_HOURS = Object.freeze({
  1: 72,
  2: 120,
  3: 240,
  4: 360,
  5: 480,
});

export const WORKSHOP_UPGRADE_MATERIALS = Object.freeze(['界源矿石', '工坊构件']);
export const WORKSHOP_MATERIAL_RATE = 24 / 14;

export const WORKSHOP_OUTPUTS = Object.freeze({
  战斗: { 灵石: 50000, 源石: 15000, 界源矿石: WORKSHOP_MATERIAL_RATE },
  修炼: { 修为: 3000000, 血气: 3000000, 制符草药: 1, 仙宠口粮: 0.5 },
  炼丹: { 小世界神药: SMALL_WORLD_ALCHEMY_RATE },
  炼器: { 随机矿石: 0.3, 工坊构件: WORKSHOP_MATERIAL_RATE },
  幸运: { 稀有道具: 0.1, 制符草药: 1, 仙宠口粮: 0.5 },
  制符: { 符纸: 1 },
});

export function ensureWorkshopSupplies(world) {
  if (!world.工坊物资 || typeof world.工坊物资 !== 'object' || Array.isArray(world.工坊物资)) {
    world.工坊物资 = {};
  }
  for (const name of ['仙宠口粮', '欠餐', ...WORKSHOP_UPGRADE_MATERIALS]) {
    world.工坊物资[name] = Math.max(0, Math.floor(Number(world.工坊物资[name]) || 0));
  }
  return world.工坊物资;
}

export function getWorkshopUpgradeRequirement(level) {
  const hours = WORKSHOP_UPGRADE_HOURS[level];
  if (!hours) return null;
  return {
    hours,
    materials: Object.fromEntries(WORKSHOP_UPGRADE_MATERIALS.map(name => [name, hours])),
  };
}

export function upgradeWorkshop(world, workshopName) {
  const workshop = world.工坊?.[workshopName];
  if (!workshop) return { ok: false, reason: 'workshop' };
  const level = Math.max(1, Math.floor(Number(workshop.level) || 1));
  const requirement = getWorkshopUpgradeRequirement(level);
  if (!requirement) return { ok: false, reason: 'max', level };

  const supplies = ensureWorkshopSupplies(world);
  const missing = Object.entries(requirement.materials)
    .filter(([name, amount]) => supplies[name] < amount)
    .map(([name, amount]) => ({ name, amount, current: supplies[name] }));
  if (missing.length) return { ok: false, reason: 'materials', level, requirement, missing };

  for (const [name, amount] of Object.entries(requirement.materials)) supplies[name] -= amount;
  workshop.level = level + 1;
  workshop.capacity = WORKSHOP_LEVEL_EFFECTS[workshop.level].capacity;
  return { ok: true, before: level, level: workshop.level, requirement, supplies };
}
