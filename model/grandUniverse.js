import { getRealmAuthorityLevel } from './realmAuthority.js';

export const GRAND_UNIVERSE_MIN_AUTHORITY = 18;
export const GRAND_UNIVERSE_MAX_DUNGEONS = 12;
export const UNIVERSE_DUNGEON_COOLDOWN_MS = 8 * 60 * 60 * 1000;
export const UNIVERSE_DUNGEON_AURA_COST = 100;

export const GRAND_UNIVERSE_LAW_STAGES = Object.freeze([
  { level: 0, name: '宇宙初生', capacity: '真仙', daoRequired: 151, potential: 0, cultivation: 0, aura: 0 },
  { level: 1, name: '红尘天则', capacity: '红尘仙', daoRequired: 160, potential: 500, cultivation: 5_000_000_000, aura: 200 },
  { level: 2, name: '王境法域', capacity: '仙王', daoRequired: 175, potential: 1_000, cultivation: 10_000_000_000, aura: 300 },
  { level: 3, name: '绝顶王域', capacity: '绝顶仙王', daoRequired: 190, potential: 2_000, cultivation: 20_000_000_000, aura: 500 },
  { level: 4, name: '巨头天宇', capacity: '仙王巨头', daoRequired: 205, potential: 4_000, cultivation: 40_000_000_000, aura: 800 },
  { level: 5, name: '帝光诸天', capacity: '帝光仙王', daoRequired: 220, potential: 8_000, cultivation: 80_000_000_000, aura: 1_200 },
]);

export const UNIVERSE_INVENTORY_CATEGORIES = Object.freeze([
  '装备', '丹药', '道具', '功法', '草药', '食材', '材料', '仙宠口粮', '盒子', '宝石',
]);

const DUNGEON_EDIT_FIELDS = Object.freeze({
  '简介': 'description',
  '敌人': 'enemyName',
  '奖励': 'rewardText',
});

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeName(value, maxLength = 10) {
  const name = String(value || '').trim();
  return name.length >= 2 && name.length <= maxLength ? name : '';
}

function universeOf(world) {
  return world?.大宇宙 || null;
}

function lawStage(world) {
  const level = Math.max(0, Math.min(
    GRAND_UNIVERSE_LAW_STAGES.length - 1,
    Math.trunc(number(universeOf(world)?.法则等级))
  ));
  return GRAND_UNIVERSE_LAW_STAGES[level];
}

function ensureDungeonList(universe) {
  if (!Array.isArray(universe.秘境)) universe.秘境 = [];
  return universe.秘境;
}

function findDungeon(world, name) {
  return ensureDungeonList(universeOf(world)).find(item => item.name === String(name || '').trim());
}

function getInventoryMatches(najie, category, itemName) {
  if (!UNIVERSE_INVENTORY_CATEGORIES.includes(category)) return [];
  return (Array.isArray(najie?.[category]) ? najie[category] : [])
    .filter(item => item?.name === itemName && number(item.数量) > 0);
}

function consumeInventoryMatches(najie, category, itemName, amount) {
  const matches = getInventoryMatches(najie, category, itemName);
  const available = matches.reduce((sum, item) => sum + number(item.数量), 0);
  if (available < amount) return { ok: false, reason: 'item', available };

  let remaining = amount;
  const consumed = [];
  for (const item of matches) {
    if (remaining <= 0) break;
    const quantity = Math.min(remaining, number(item.数量));
    const itemSnapshot = structuredClone(item);
    itemSnapshot.数量 = quantity;
    item.数量 = number(item.数量) - quantity;
    remaining -= quantity;
    consumed.push({ item: itemSnapshot, quantity });
  }
  najie[category] = najie[category].filter(item => number(item?.数量) > 0);
  return { ok: true, consumed };
}

function createDungeonRecord(world, name, source, now) {
  const stage = lawStage(world);
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    source,
    description: source.mode === 'item'
      ? `以【${source.itemName}】为核心演化而成的宇宙秘境。`
      : '截取万物轮回的一缕可能，演绎而成的宇宙秘境。',
    enemyName: `${stage.name}守界者`,
    rewardText: '宇宙灵韵与大道感悟',
    lawLevel: stage.level,
    capacity: stage.capacity,
    createdAt: now,
    runs: 0,
    lastRunAt: 0,
  };
}

export function getGrandUniverseLawStage(world) {
  return lawStage(world);
}

export function getGrandUniverseLawCap(player) {
  const authority = getRealmAuthorityLevel(player);
  if (authority < GRAND_UNIVERSE_MIN_AUTHORITY) return -1;
  return authority >= 19 ? GRAND_UNIVERSE_LAW_STAGES.length - 1 : 1;
}

export function isGrandUniverseAbsoluteSpiritImmune(world) {
  return Boolean(universeOf(world)?.绝灵免疫);
}

export function ascendSmallWorldToGrandUniverse(player, world, now = Date.now()) {
  if (!world) return { ok: false, reason: 'world' };
  if (universeOf(world)) return { ok: false, reason: 'ascended' };
  const authority = getRealmAuthorityLevel(player);
  if (authority < GRAND_UNIVERSE_MIN_AUTHORITY) {
    return { ok: false, reason: 'authority', authority, required: GRAND_UNIVERSE_MIN_AUTHORITY };
  }
  if (!player?.已创自身之道 || !player?.自身之道名称) return { ok: false, reason: 'own-way' };
  if (number(world.level) < 5) return { ok: false, reason: 'world-level', current: number(world.level) };
  if (number(player.修炼次数) < GRAND_UNIVERSE_LAW_STAGES[0].daoRequired) {
    return { ok: false, reason: 'dao', current: number(player.修炼次数), required: GRAND_UNIVERSE_LAW_STAGES[0].daoRequired };
  }

  world.大宇宙 = {
    version: 1,
    升格时间: now,
    创世之道: player.自身之道名称,
    法则等级: 0,
    承载上限: GRAND_UNIVERSE_LAW_STAGES[0].capacity,
    法则完善次数: 0,
    道行投入: number(player.修炼次数),
    灵韵: 0,
    绝灵免疫: true,
    秘境: [],
    秘境记录: [],
  };
  world.attributes ||= {};
  world.attributes.面积 = '无垠星海';
  world.attributes.特殊资源 = [...new Set([...(world.attributes.特殊资源 || []), '宇宙本源'])];
  return { ok: true, universe: world.大宇宙, stage: GRAND_UNIVERSE_LAW_STAGES[0] };
}

export function improveGrandUniverseLaws(player, world) {
  const universe = universeOf(world);
  if (!universe) return { ok: false, reason: 'universe' };
  const current = lawStage(world);
  const cap = getGrandUniverseLawCap(player);
  if (current.level >= cap) {
    return { ok: false, reason: 'cap', current, cap: GRAND_UNIVERSE_LAW_STAGES[Math.max(0, cap)] };
  }
  const next = GRAND_UNIVERSE_LAW_STAGES[current.level + 1];
  if (number(player?.修炼次数) < next.daoRequired) {
    return { ok: false, reason: 'dao', current: number(player?.修炼次数), required: next.daoRequired, next };
  }
  if (number(player?.仙道潜力) < next.potential) {
    return { ok: false, reason: 'potential', current: number(player?.仙道潜力), required: next.potential, next };
  }
  if (number(player?.修为) < next.cultivation || number(player?.血气) < next.cultivation) {
    return {
      ok: false,
      reason: 'cultivation',
      cultivation: number(player?.修为),
      blood: number(player?.血气),
      required: next.cultivation,
      next,
    };
  }

  player.仙道潜力 = number(player.仙道潜力) - next.potential;
  player.修为 = number(player.修为) - next.cultivation;
  player.血气 = number(player.血气) - next.cultivation;
  universe.法则等级 = next.level;
  universe.承载上限 = next.capacity;
  universe.法则完善次数 = number(universe.法则完善次数) + 1;
  universe.道行投入 = Math.max(number(universe.道行投入), next.daoRequired);
  universe.灵韵 = number(universe.灵韵) + next.aura;
  return { ok: true, previous: current, stage: next, auraGain: next.aura };
}

export function getItemAuraValue(item) {
  const rarity = Math.max(0, number(item?.稀有度 ?? item?.pinji ?? item?.品级));
  const price = Math.max(0, number(item?.出售价 ?? item?.售价 ?? item?.price));
  return Math.max(10, Math.min(5_000, Math.round(20 + rarity * 25 + Math.log10(price + 1) * 10)));
}

export function refineItemIntoUniverseAura(world, najie, { category, itemName, amount = 1 } = {}) {
  const universe = universeOf(world);
  if (!universe) return { ok: false, reason: 'universe' };
  const count = Math.trunc(number(amount));
  if (!UNIVERSE_INVENTORY_CATEGORIES.includes(category)) return { ok: false, reason: 'category' };
  if (!itemName || count < 1 || count > 9999) return { ok: false, reason: 'input' };

  const consumed = consumeInventoryMatches(najie, category, itemName, count);
  if (!consumed.ok) return consumed;
  const aura = consumed.consumed.reduce(
    (sum, entry) => sum + getItemAuraValue(entry.item) * entry.quantity,
    0
  );
  universe.灵韵 = number(universe.灵韵) + aura;
  return { ok: true, aura, amount: count, totalAura: universe.灵韵 };
}

export function createItemUniverseDungeon(world, najie, { name, category, itemName, now = Date.now() } = {}) {
  const universe = universeOf(world);
  if (!universe) return { ok: false, reason: 'universe' };
  const normalized = normalizeName(name);
  if (!normalized) return { ok: false, reason: 'name' };
  const dungeons = ensureDungeonList(universe);
  if (dungeons.some(item => item.name === normalized)) return { ok: false, reason: 'duplicate' };
  if (dungeons.length >= GRAND_UNIVERSE_MAX_DUNGEONS) return { ok: false, reason: 'limit' };
  if (!UNIVERSE_INVENTORY_CATEGORIES.includes(category)) return { ok: false, reason: 'category' };
  if (number(universe.灵韵) < UNIVERSE_DUNGEON_AURA_COST) {
    return { ok: false, reason: 'aura', current: number(universe.灵韵), required: UNIVERSE_DUNGEON_AURA_COST };
  }

  const consumed = consumeInventoryMatches(najie, category, itemName, 1);
  if (!consumed.ok) return consumed;
  universe.灵韵 = number(universe.灵韵) - UNIVERSE_DUNGEON_AURA_COST;
  const dungeon = createDungeonRecord(world, normalized, {
    mode: 'item',
    category,
    itemName,
    item: consumed.consumed[0].item,
  }, now);
  dungeons.push(dungeon);
  return { ok: true, dungeon, auraCost: UNIVERSE_DUNGEON_AURA_COST };
}

export function getReincarnationDungeonCost(player) {
  const multiplier = getRealmAuthorityLevel(player) >= 21 ? 0.35 : 1;
  return {
    cultivation: Math.round(10_000_000_000_000 * multiplier),
    blood: Math.round(10_000_000_000_000 * multiplier),
    sourceStone: Math.round(100_000_000 * multiplier),
    aura: Math.round(1_000 * multiplier),
    multiplier,
  };
}

export function createReincarnationUniverseDungeon(player, world, { name, now = Date.now() } = {}) {
  const universe = universeOf(world);
  if (!universe) return { ok: false, reason: 'universe' };
  const authority = getRealmAuthorityLevel(player);
  if (authority < 20) return { ok: false, reason: 'authority', authority, required: 20 };
  const normalized = normalizeName(name);
  if (!normalized) return { ok: false, reason: 'name' };
  const dungeons = ensureDungeonList(universe);
  if (dungeons.some(item => item.name === normalized)) return { ok: false, reason: 'duplicate' };
  if (dungeons.length >= GRAND_UNIVERSE_MAX_DUNGEONS) return { ok: false, reason: 'limit' };

  const cost = getReincarnationDungeonCost(player);
  const available = {
    cultivation: number(player?.修为),
    blood: number(player?.血气),
    sourceStone: number(player?.源石),
    aura: number(universe.灵韵),
  };
  const missing = Object.keys(available).filter(key => available[key] < cost[key]);
  if (missing.length) return { ok: false, reason: 'cost', cost, available, missing };

  player.修为 = available.cultivation - cost.cultivation;
  player.血气 = available.blood - cost.blood;
  player.源石 = available.sourceStone - cost.sourceStone;
  universe.灵韵 = available.aura - cost.aura;
  const dungeon = createDungeonRecord(world, normalized, { mode: 'reincarnation' }, now);
  dungeons.push(dungeon);
  return { ok: true, dungeon, cost };
}

export function editUniverseDungeon(world, name, field, value) {
  if (!universeOf(world)) return { ok: false, reason: 'universe' };
  const dungeon = findDungeon(world, name);
  if (!dungeon) return { ok: false, reason: 'dungeon' };
  const key = DUNGEON_EDIT_FIELDS[field];
  if (!key) return { ok: false, reason: 'field' };
  const text = String(value || '').trim();
  if (text.length < 2 || text.length > 60) return { ok: false, reason: 'content' };
  dungeon[key] = text;
  return { ok: true, dungeon, field };
}

export function enterUniverseDungeon(player, world, name, { now = Date.now(), random = Math.random } = {}) {
  const universe = universeOf(world);
  if (!universe) return { ok: false, reason: 'universe' };
  const dungeon = findDungeon(world, name);
  if (!dungeon) return { ok: false, reason: 'dungeon' };
  const lastRunAt = number(dungeon.lastRunAt);
  const remaining = lastRunAt > 0
    ? Math.max(0, lastRunAt + UNIVERSE_DUNGEON_COOLDOWN_MS - now)
    : 0;
  if (remaining > 0) return { ok: false, reason: 'cooldown', remaining };

  const requiredAuthority = dungeon.lawLevel >= 4 ? 19 : dungeon.lawLevel >= 2 ? 18 : 17;
  const authority = getRealmAuthorityLevel(player);
  if (authority < requiredAuthority) {
    return { ok: false, reason: 'authority', authority, required: requiredAuthority };
  }

  const chance = Math.max(0.35, Math.min(0.98, 0.72 + (authority - requiredAuthority) * 0.08));
  const success = number(random()) < chance;
  dungeon.lastRunAt = now;
  dungeon.runs = number(dungeon.runs) + 1;
  const record = { dungeon: dungeon.name, time: now, success };
  universe.秘境记录 ||= [];
  universe.秘境记录.push(record);
  universe.秘境记录 = universe.秘境记录.slice(-30);

  if (!success) {
    player.当前血量 = Math.max(1, Math.floor(number(player.当前血量) * 0.1));
    return { ok: true, success: false, dungeon, chance };
  }

  const multiplier = dungeon.lawLevel + 1;
  const rewards = {
    cultivation: 50_000_000 * multiplier,
    blood: 50_000_000 * multiplier,
    potential: 5 * multiplier,
    aura: 20 * multiplier,
  };
  player.修为 = number(player.修为) + rewards.cultivation;
  player.血气 = number(player.血气) + rewards.blood;
  player.仙道潜力 = number(player.仙道潜力) + rewards.potential;
  universe.灵韵 = number(universe.灵韵) + rewards.aura;
  return { ok: true, success: true, dungeon, chance, rewards };
}
