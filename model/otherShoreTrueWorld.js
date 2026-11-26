import {
  calculateOtherShoreMindCost,
  getOtherShoreTravelTier,
  getOtherShoreTravelRule,
} from './otherShoreRules.js';

/**
 * 真世界领域模型。
 *
 * 真世界不把整张地图展开到世界文档里：半径 48 的六边形空间只在玩家
 * 观测、移动或探索时 materialize 对应扇区。这样既有全服共同推进的地图，
 * 又不会因为地图尺寸增长把 Redis 文档撑爆。
 */

export const OTHER_SHORE_TRUE_WORLD_VERSION = 1;
export const OTHER_SHORE_TRUE_WORLD_RADIUS = 48;
export const OTHER_SHORE_TRUE_WORLD_SECTOR_COUNT =
  1 + 3 * OTHER_SHORE_TRUE_WORLD_RADIUS * (OTHER_SHORE_TRUE_WORLD_RADIUS + 1);
export const OTHER_SHORE_TRUE_WORLD_MAX_OBSERVE_RANGE = 3;
export const OTHER_SHORE_TRUE_WORLD_RECEIPT_LIMIT = 500;
export const OTHER_SHORE_TRUE_WORLD_KEY = 'trueWorld';
export const OTHER_SHORE_TRUE_WORLD_SAME_REALM_MUTANT_RATE = 0.78;

// 英文别名方便控制器与网页层按层级名读取。
export const TRUE_WORLD_RADIUS = OTHER_SHORE_TRUE_WORLD_RADIUS;
export const TRUE_WORLD_SECTOR_COUNT = OTHER_SHORE_TRUE_WORLD_SECTOR_COUNT;

const STATUS_RANK = Object.freeze({ unseen: 0, observed: 1, explored: 2 });
const TIER_ORDER = Object.freeze([
  'true_immortal',
  'immortal_king',
  'immortal_king_giant',
  'quasi_immortal_emperor',
]);

export const OTHER_SHORE_TRUE_WORLD_BIOMES = Object.freeze([
  Object.freeze({
    id: 'qin-ancient-court',
    name: '先秦炼气遗都',
    description: '古炼气士以星辰为炉、以裂隙为舟的残存道场。',
    threat: 3,
  }),
  Object.freeze({
    id: 'spirit-rift-wilds',
    name: '灵界裂隙荒原',
    description: '裂隙像河流一样改道，来自彼岸的邪魔在此留下巢穴。',
    threat: 4,
  }),
  Object.freeze({
    id: 'era-tomb-sea',
    name: '纪元墓海',
    description: '沉没纪元的道果在黑潮下缓慢呼吸。',
    threat: 5,
  }),
  Object.freeze({
    id: 'forbidden-treasure-waste',
    name: '违禁至宝荒境',
    description: '宇宙规则在这里断裂，先天至宝的残响会主动择主。',
    threat: 5,
  }),
  Object.freeze({
    id: 'transdimensional-corridor',
    name: '超维回廊',
    description: '纪元主宰投下观测影子的狭长节点。',
    threat: 6,
  }),
  Object.freeze({
    id: 'true-source-starfield',
    name: '真界源海',
    description: '真界源晶从星海深处析出，守护者从未离开。',
    threat: 4,
  }),
]);

export const OTHER_SHORE_TRUE_WORLD_LANDMARKS = Object.freeze([
  Object.freeze({
    id: 'true-world-gate',
    q: 0,
    r: 0,
    name: '真世界门户',
    kind: 'gate',
    biomeId: 'true-source-starfield',
    lore: '太初星墟记忆中的彼岸入口，所有远征从此重新计算坐标。',
  }),
  Object.freeze({
    id: 'qin-qi-refiner-ancestral-court',
    q: 7,
    r: -3,
    name: '先秦炼气祖庭',
    kind: 'civilization',
    biomeId: 'qin-ancient-court',
    lore: '消失的先秦炼气士曾在这里留下以身为种的道种炉。',
  }),
  Object.freeze({
    id: 'spirit-rift-source',
    q: -9,
    r: 4,
    name: '灵界裂隙源庭',
    kind: 'rift',
    biomeId: 'spirit-rift-wilds',
    lore: '诸天灵界裂缝的旧源谱，记录着彼岸修士第一次越界。',
  }),
  Object.freeze({
    id: 'forbidden-treasure-citadel',
    q: 13,
    r: -8,
    name: '禁宝清算庭',
    kind: 'citadel',
    biomeId: 'forbidden-treasure-waste',
    lore: '彼岸古文明派出销毁先天至宝的超规格清算中枢。',
  }),
  Object.freeze({
    id: 'era-tomb-sea',
    q: -16,
    r: 12,
    name: '纪元墓海',
    kind: 'tomb',
    biomeId: 'era-tomb-sea',
    lore: '击败准仙帝敌群后，可从此处提取纪元积累。',
  }),
  Object.freeze({
    id: 'overlord-observatory',
    q: 21,
    r: -13,
    name: '纪元主宰观测台',
    kind: 'observatory',
    biomeId: 'transdimensional-corridor',
    lore: '逻辑彼岸的超维强者借此投下化身，观察禁宝清算。',
  }),
]);

const LANDMARK_BY_ID = new Map(
  OTHER_SHORE_TRUE_WORLD_LANDMARKS.map((landmark) => [
    `${landmark.q},${landmark.r}`,
    landmark,
  ]),
);
const BIOME_BY_ID = new Map(OTHER_SHORE_TRUE_WORLD_BIOMES.map((biome) => [biome.id, biome]));

export const OTHER_SHORE_TRUE_WORLD_ENEMY_TIERS = Object.freeze({
  true_immortal: Object.freeze({
    id: 'true_immortal',
    name: '真仙灾厄变异体',
    realmName: '真仙',
    maxHp: 1_200_000_000_000_000,
    attack: 480_000_000_000_000,
    defense: 420_000_000_000_000,
    eraReward: 0,
    sourceReward: 0,
  }),
  immortal_king: Object.freeze({
    id: 'immortal_king',
    name: '仙王灾厄变异体',
    realmName: '仙王',
    maxHp: 2_800_000_000_000_000,
    attack: 980_000_000_000_000,
    defense: 860_000_000_000_000,
    eraReward: 0,
    sourceReward: 1,
  }),
  immortal_king_giant: Object.freeze({
    id: 'immortal_king_giant',
    name: '仙王巨头灾厄变异体',
    realmName: '仙王巨头',
    maxHp: 4_800_000_000_000_000,
    attack: 1_600_000_000_000_000,
    defense: 1_450_000_000_000_000,
    eraReward: 0,
    sourceReward: 2,
  }),
  quasi_immortal_emperor: Object.freeze({
    id: 'quasi_immortal_emperor',
    name: '准仙帝灾厄变异体',
    realmName: '准仙帝',
    maxHp: 8_400_000_000_000_000,
    attack: 3_000_000_000_000_000,
    defense: 2_800_000_000_000_000,
    eraReward: 1,
    sourceReward: 4,
  }),
});

export const OTHER_SHORE_TRUE_WORLD_OPPORTUNITIES = Object.freeze([
  Object.freeze({
    id: 'opportunity:qin-qi-refinement',
    name: '先秦炼气遗篇',
    kind: 'technique',
    description: '补全先秦炼气士以身为种的残缺篇章。',
  }),
  Object.freeze({
    id: 'opportunity:rift-coordinate',
    name: '灵界裂隙坐标谱',
    kind: 'lore',
    description: '可追踪彼岸古文明的下一处裂隙节点。',
  }),
  Object.freeze({
    id: 'opportunity:era-dao-pill',
    name: '纪元道髓丹方',
    kind: 'pill',
    description: '炼化纪元道髓的古方，在彼岸规则下不可用于即时回血。',
  }),
  Object.freeze({
    id: 'opportunity:forbidden-treasure-clue',
    name: '先天至宝下落残卷',
    kind: 'treasure-clue',
    description: '记载一件尚未收录至无尽商店的先天至宝线索。',
  }),
  Object.freeze({
    id: 'opportunity:overlord-logic-shard',
    name: '超维主宰逻辑碎片',
    kind: 'authority',
    description: '来自逻辑彼岸的观测残片，可用于解锁超维事件。',
  }),
]);

const MATERIAL_REWARDS = Object.freeze({
  'true-world-source-crystal': '真界源晶',
  'dao-rule-origin': '大道规则本源',
  'dimension-anchor-crystal': '维度锚晶',
  'era-dao-marrow': '纪元道髓',
  'all-heavens-mother-metal': '诸天母金',
});

export const OTHER_SHORE_TRUE_WORLD_ENEMY_PROFILES = OTHER_SHORE_TRUE_WORLD_ENEMY_TIERS;
export const OTHER_SHORE_TRUE_WORLD_ENEMY_CATALOG = OTHER_SHORE_TRUE_WORLD_ENEMY_TIERS;
export const OTHER_SHORE_TRUE_WORLD_OPPORTUNITY_CATALOG = OTHER_SHORE_TRUE_WORLD_OPPORTUNITIES;
export const OTHER_SHORE_TRUE_WORLD_MATERIALS = Object.freeze(
  Object.entries(MATERIAL_REWARDS).map(([id, name]) => ({ id, name })),
);

const MATERIAL_KEYS = Object.freeze(Object.keys(MATERIAL_REWARDS));
const OPPORTUNITY_BY_ID = new Map(OTHER_SHORE_TRUE_WORLD_OPPORTUNITIES.map((entry) => [entry.id, entry]));

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function whole(value, fallback = 0) {
  return Math.max(0, Math.trunc(finite(value, fallback)));
}

function positive(value, label) {
  const number = finite(value, NaN);
  if (!(number > 0)) throw new Error(`${label}必须大于0`);
  return number;
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label}不能为空`);
  return text;
}

function timestamp(value) {
  return whole(value, Date.now());
}

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function roll(seed, key) {
  return hash(`${seed}:${key}`) / 0x100000000;
}

function normalizeCoordinate(coordinateOrQ, maybeR) {
  let q;
  let r;
  if (typeof coordinateOrQ === 'string') {
    const match = coordinateOrQ.trim().match(/^(-?\d+),(-?\d+)$/);
    if (!match) throw new Error(`无效的真世界坐标：${coordinateOrQ}`);
    q = Number(match[1]);
    r = Number(match[2]);
  } else if (Array.isArray(coordinateOrQ)) {
    q = Number(coordinateOrQ[0]);
    r = Number(coordinateOrQ[1]);
  } else if (coordinateOrQ && typeof coordinateOrQ === 'object') {
    q = Number(coordinateOrQ.q ?? coordinateOrQ.x);
    r = Number(coordinateOrQ.r ?? coordinateOrQ.y);
  } else {
    q = Number(coordinateOrQ);
    r = Number(maybeR);
  }
  if (!Number.isInteger(q) || !Number.isInteger(r)) throw new Error('真世界坐标必须是整数');
  return { q, r };
}

export function normalizeOtherShoreTrueWorldCoordinate(coordinateOrQ, maybeR) {
  return normalizeCoordinate(coordinateOrQ, maybeR);
}

export function otherShoreTrueWorldCoordinateId(coordinateOrQ, maybeR) {
  const { q, r } = normalizeCoordinate(coordinateOrQ, maybeR);
  return `${q},${r}`;
}

export const getOtherShoreTrueWorldCoordinateId = otherShoreTrueWorldCoordinateId;

export function getOtherShoreTrueWorldHexDistance(left, right) {
  const a = normalizeCoordinate(left);
  const b = normalizeCoordinate(right);
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

function inRadius(coordinate, radius = OTHER_SHORE_TRUE_WORLD_RADIUS) {
  return (
    Math.abs(coordinate.q) <= radius &&
    Math.abs(coordinate.r) <= radius &&
    Math.abs(coordinate.q + coordinate.r) <= radius
  );
}

function requireCoordinate(coordinate) {
  const normalized = normalizeCoordinate(coordinate);
  if (!inRadius(normalized)) throw new Error(`真世界坐标超出边界：${normalized.q},${normalized.r}`);
  return normalized;
}

function neighborsOf(coordinate) {
  const { q, r } = normalizeCoordinate(coordinate);
  return [
    { q: q + 1, r },
    { q: q + 1, r: r - 1 },
    { q, r: r - 1 },
    { q: q - 1, r },
    { q: q - 1, r: r + 1 },
    { q, r: r + 1 },
  ];
}

export function getOtherShoreTrueWorldNeighbors(coordinate) {
  return neighborsOf(requireCoordinate(coordinate)).filter((entry) => inRadius(entry));
}

function coordinatesWithinRange(center, range) {
  const output = [];
  for (let q = center.q - range; q <= center.q + range; q++) {
    const minR = Math.max(center.r - range, -q - OTHER_SHORE_TRUE_WORLD_RADIUS);
    const maxR = Math.min(center.r + range, -q + OTHER_SHORE_TRUE_WORLD_RADIUS);
    for (let r = minR; r <= maxR; r++) {
      const coordinate = { q, r };
      if (inRadius(coordinate) && getOtherShoreTrueWorldHexDistance(center, coordinate) <= range) {
        output.push(coordinate);
      }
    }
  }
  return output;
}

function requireWorld(world) {
  if (!world || typeof world !== 'object') throw new TypeError('world 必须是世界文档');
  return world;
}

function createPlayerState(playerId, playerName) {
  return {
    playerId,
    playerName: String(playerName || playerId),
    coordinate: '0,0',
    knownSectors: { '0,0': true },
    exploredSectors: {},
    mindRemainder: 0,
    eraAccumulation: 0,
    quasiImmortalEmperorSources: 0,
    materials: {},
    opportunities: {},
    victories: {
      total: 0,
      true_immortal: 0,
      immortal_king: 0,
      immortal_king_giant: 0,
      quasi_immortal_emperor: 0,
    },
    lastActionAt: 0,
  };
}

function createSectorRecord(descriptor, status = 'observed') {
  return {
    id: descriptor.id,
    q: descriptor.q,
    r: descriptor.r,
    status,
    progress: status === 'explored' ? descriptor.progressRequired : 0,
    progressRequired: descriptor.progressRequired,
    contributors: {},
    exploredBy: {},
    exploredAt: status === 'explored' ? 0 : null,
    encounterWave: 0,
    encounter: null,
    updatedAt: 0,
  };
}

function ensureMaterialBag(player) {
  player.materials ||= {};
  for (const key of MATERIAL_KEYS) player.materials[key] = whole(player.materials[key]);
  return player.materials;
}

function ensurePlayer(state, playerId, playerName) {
  const id = requiredText(playerId, 'playerId');
  const player = (state.players[id] ||= createPlayerState(id, playerName));
  player.playerId = id;
  if (playerName) player.playerName = String(playerName);
  player.knownSectors ||= { '0,0': true };
  player.exploredSectors ||= {};
  player.opportunities ||= {};
  player.victories ||= {};
  player.materials ||= {};
  player.mindRemainder = whole(player.mindRemainder);
  player.eraAccumulation = whole(player.eraAccumulation);
  player.quasiImmortalEmperorSources = whole(player.quasiImmortalEmperorSources);
  ensureMaterialBag(player);
  player.knownSectors['0,0'] = true;
  return player;
}

function landmarkFor(coordinate) {
  return LANDMARK_BY_ID.get(otherShoreTrueWorldCoordinateId(coordinate)) || null;
}

function proceduralDescriptor(state, coordinate) {
  const id = otherShoreTrueWorldCoordinateId(coordinate);
  const landmark = landmarkFor(coordinate);
  const distance = getOtherShoreTrueWorldHexDistance({ q: 0, r: 0 }, coordinate);
  const value = hash(`${state.seed}:${id}`);
  const biome = landmark?.biomeId
    ? BIOME_BY_ID.get(landmark.biomeId)
    : OTHER_SHORE_TRUE_WORLD_BIOMES[value % OTHER_SHORE_TRUE_WORLD_BIOMES.length];
  const threat = Math.max(1, Math.min(9, (biome?.threat || 3) + Math.floor(distance / 12)));
  const name = landmark?.name || `${biome.name}·${id}`;
  return {
    id,
    q: coordinate.q,
    r: coordinate.r,
    distance,
    biomeId: biome.id,
    biomeName: biome.name,
    biomeDescription: biome.description,
    name,
    kind: landmark?.kind || biome.id,
    threat,
    progressRequired: 80 + distance * 8 + threat * 4,
    landmark: landmark
      ? {
          id: landmark.id,
          name: landmark.name,
          kind: landmark.kind,
          lore: landmark.lore,
        }
      : null,
  };
}

function descriptorWithState(state, coordinate) {
  const normalized = requireCoordinate(coordinate);
  const descriptor = proceduralDescriptor(state, normalized);
  const record = state.sectors[descriptor.id];
  if (!record || STATUS_RANK[record.status] < STATUS_RANK.observed) {
    return {
      id: descriptor.id,
      q: descriptor.q,
      r: descriptor.r,
      distance: descriptor.distance,
      status: 'unseen',
      discovered: false,
      progress: 0,
      progressRequired: null,
      contributorCount: 0,
      exploredByCount: 0,
      encounter: null,
    };
  }
  return {
    ...descriptor,
    status: record?.status || 'unseen',
    progress: whole(record?.progress),
    progressRequired: whole(record?.progressRequired, descriptor.progressRequired),
    progressRatio: descriptor.progressRequired > 0
      ? Math.min(1, finite(record?.progress) / descriptor.progressRequired)
      : 0,
    discovered: true,
    contributorCount: Object.keys(record?.contributors || {}).length,
    exploredByCount: Object.keys(record?.exploredBy || {}).length,
    encounter: record?.encounter ? serializeEncounter(record.encounter) : null,
  };
}

function ensureSector(state, coordinate, status = 'observed') {
  const normalized = requireCoordinate(coordinate);
  const descriptor = proceduralDescriptor(state, normalized);
  const id = descriptor.id;
  const current = state.sectors[id] || (state.sectors[id] = createSectorRecord(descriptor, status));
  if (STATUS_RANK[status] > STATUS_RANK[current.status]) current.status = status;
  current.progressRequired = whole(current.progressRequired, descriptor.progressRequired) || descriptor.progressRequired;
  current.contributors ||= {};
  current.exploredBy ||= {};
  current.encounterWave = whole(current.encounterWave);
  current.updatedAt = whole(current.updatedAt);
  return current;
}

function recalculateGlobalCounters(state) {
  let observed = 0;
  let explored = 0;
  let contribution = 0;
  for (const record of Object.values(state.sectors)) {
    if (STATUS_RANK[record.status] >= STATUS_RANK.observed) observed++;
    if (STATUS_RANK[record.status] >= STATUS_RANK.explored) explored++;
    contribution += finite(record.progress);
  }
  state.global.observedCount = observed;
  state.global.exploredCount = explored;
  state.global.totalContribution = contribution;
}

export function ensureOtherShoreTrueWorldState(world, { seed } = {}) {
  requireWorld(world);
  const state = (world[OTHER_SHORE_TRUE_WORLD_KEY] ||= {});
  state.version = OTHER_SHORE_TRUE_WORLD_VERSION;
  state.seed = String(state.seed ?? seed ?? world.seed ?? 'true-world');
  state.radius = OTHER_SHORE_TRUE_WORLD_RADIUS;
  state.sectors ||= {};
  state.players ||= {};
  state.pendingClaims ||= {};
  state.receipts ||= {};
  state.global ||= {};
  state.global.eraAccumulation = whole(state.global.eraAccumulation);
  state.global.quasiImmortalEmperorDefeated = whole(state.global.quasiImmortalEmperorDefeated);
  state.global.opportunityCount = whole(state.global.opportunityCount);
  state.global.materialTotals ||= {};
  for (const key of MATERIAL_KEYS) state.global.materialTotals[key] = whole(state.global.materialTotals[key]);
  state.global.encounterCount = whole(state.global.encounterCount);
  state.global.victoryCount = whole(state.global.victoryCount);
  state.updatedAt = whole(state.updatedAt);

  const gate = ensureSector(state, { q: 0, r: 0 }, 'explored');
  gate.progress = gate.progressRequired;
  gate.exploredAt ||= 0;
  recalculateGlobalCounters(state);
  return state;
}

export const ensureTrueWorldState = ensureOtherShoreTrueWorldState;

export function getOtherShoreTrueWorldSector(world, coordinate) {
  const state = ensureOtherShoreTrueWorldState(world);
  return descriptorWithState(state, coordinate);
}

export const getTrueWorldSector = getOtherShoreTrueWorldSector;

export function getOtherShoreTrueWorldProgress(world) {
  const state = ensureOtherShoreTrueWorldState(world);
  return {
    sectorCount: OTHER_SHORE_TRUE_WORLD_SECTOR_COUNT,
    observedCount: state.global.observedCount,
    exploredCount: state.global.exploredCount,
    progressPercent: Number(((state.global.exploredCount / OTHER_SHORE_TRUE_WORLD_SECTOR_COUNT) * 100).toFixed(4)),
    complete: state.global.exploredCount >= OTHER_SHORE_TRUE_WORLD_SECTOR_COUNT,
  };
}

export const isOtherShoreTrueWorldExplorationComplete = (world) =>
  getOtherShoreTrueWorldProgress(world).complete;

function receiptFor(state, operationId, action, actorId) {
  const id = requiredText(operationId, 'operationId');
  const receipt = state.receipts[id];
  if (!receipt) return null;
  if (receipt.action !== action || receipt.actorId !== actorId) {
    throw new Error('operationId 已用于其他真世界行动');
  }
  return copy(receipt.result);
}

function replayReceiptFor(state, operationId, action, actorPrefix, matches = () => true) {
  const stored = state.receipts?.[operationId];
  if (!stored) return null;
  if (stored.action !== action || !String(stored.actorId || '').startsWith(actorPrefix) || !matches(stored.result)) {
    throw new Error('operationId 已用于其他真世界行动');
  }
  return copy(stored.result);
}

function saveReceipt(state, operationId, action, actorId, result, now) {
  const id = requiredText(operationId, 'operationId');
  state.receipts[id] = {
    action,
    actorId,
    at: timestamp(now),
    result: copy(result),
  };
  const ids = Object.keys(state.receipts);
  if (ids.length > OTHER_SHORE_TRUE_WORLD_RECEIPT_LIMIT) {
    for (const stale of ids.slice(0, ids.length - OTHER_SHORE_TRUE_WORLD_RECEIPT_LIMIT)) delete state.receipts[stale];
  }
  return copy(result);
}

function observeRange(value) {
  const range = Number(value ?? 1);
  if (!Number.isInteger(range) || range < 0 || range > OTHER_SHORE_TRUE_WORLD_MAX_OBSERVE_RANGE) {
    throw new Error(`观测范围必须是0-${OTHER_SHORE_TRUE_WORLD_MAX_OBSERVE_RANGE}的整数`);
  }
  return range;
}

function observeInternal(state, player, center, range, now) {
  const revealed = [];
  for (const coordinate of coordinatesWithinRange(center, range)) {
    const before = state.sectors[otherShoreTrueWorldCoordinateId(coordinate)]?.status || 'unseen';
    const record = ensureSector(state, coordinate, 'observed');
    player.knownSectors[record.id] = true;
    if (STATUS_RANK[record.status] > STATUS_RANK[before]) revealed.push(descriptorWithState(state, coordinate));
  }
  player.lastActionAt = timestamp(now);
  state.updatedAt = timestamp(now);
  recalculateGlobalCounters(state);
  return revealed;
}

export function observeOtherShoreTrueWorld(world, {
  playerId,
  playerName,
  coordinate = '0,0',
  range = 1,
  operationId,
  now = Date.now(),
} = {}) {
  const state = ensureOtherShoreTrueWorldState(world);
  const id = requiredText(playerId, 'playerId');
  const center = requireCoordinate(coordinate);
  const operation = requiredText(operationId, 'operationId');
  const actor = `${id}:observe:${otherShoreTrueWorldCoordinateId(center)}`;
  const previous = receiptFor(state, operation, 'true_world_observe', actor);
  if (previous) return previous;
  const viewer = ensurePlayer(state, id, playerName);
  const distance = observeRange(range);
  const revealed = observeInternal(state, viewer, center, distance, now);
  const result = {
    center: otherShoreTrueWorldCoordinateId(center),
    range: distance,
    revealed,
    observedCount: state.global.observedCount,
    sectorCount: OTHER_SHORE_TRUE_WORLD_SECTOR_COUNT,
  };
  return saveReceipt(state, operation, 'true_world_observe', actor, result, now);
}

export const observeTrueWorld = observeOtherShoreTrueWorld;

function normalizePath(from, to, path) {
  const values = Array.isArray(path) && path.length ? path : [from, to];
  const normalized = values.filter((entry) => entry !== undefined && entry !== null).map(requireCoordinate);
  if (normalized.length < 2) throw new Error('真世界移动路径不能为空');
  if (Array.isArray(path) && path.length) {
    const expectedStart = from === undefined ? normalized[0] : from;
    if (otherShoreTrueWorldCoordinateId(normalized[0]) !== otherShoreTrueWorldCoordinateId(expectedStart)) {
      throw new Error('真世界移动路径起点不一致');
    }
    if (to !== undefined && otherShoreTrueWorldCoordinateId(normalized.at(-1)) !== otherShoreTrueWorldCoordinateId(to)) {
      throw new Error('真世界移动路径终点不一致');
    }
  }
  for (let index = 1; index < normalized.length; index++) {
    if (getOtherShoreTrueWorldHexDistance(normalized[index - 1], normalized[index]) !== 1) {
      throw new Error('真世界移动路径必须由相邻扇区组成');
    }
  }
  return normalized;
}

export function moveOtherShoreTrueWorld(world, {
  playerId,
  playerName,
  from,
  to,
  path,
  realm,
  mindAvailable,
  mindRemainder,
  operationId,
  now = Date.now(),
} = {}) {
  const state = ensureOtherShoreTrueWorldState(world);
  const id = requiredText(playerId, 'playerId');
  const viewer = ensurePlayer(state, id, playerName);
  const origin = requireCoordinate(from ?? viewer.coordinate ?? '0,0');
  const route = normalizePath(origin, to, path);
  const operation = requiredText(operationId, 'operationId');
  const destination = route.at(-1);
  const actor = `${id}:move:${otherShoreTrueWorldCoordinateId(origin)}:${otherShoreTrueWorldCoordinateId(destination)}`;
  const replay = replayReceiptFor(
    state,
    operation,
    'true_world_move',
    `${id}:move:`,
    result => result?.from === otherShoreTrueWorldCoordinateId(origin)
      && result?.to === otherShoreTrueWorldCoordinateId(destination)
      && Array.isArray(result?.path)
      && result.path.length === route.length
      && result.path.every((entry, index) => entry === otherShoreTrueWorldCoordinateId(route[index])),
  );
  if (replay) return replay;
  if (viewer.coordinate && viewer.coordinate !== otherShoreTrueWorldCoordinateId(origin)) {
    throw new Error('真世界移动起点与当前坐标不符');
  }
  const suppliedRemainder = mindRemainder === undefined ? viewer.mindRemainder : mindRemainder;
  const unanchoredSteps = route.slice(1).reduce((count, coordinate) => {
    const record = state.sectors[otherShoreTrueWorldCoordinateId(coordinate)];
    return count + (record?.status === 'explored' ? 0 : 1);
  }, 0);
  const travelContext = normalizeTravelContext(realm);
  const travel = calculateOtherShoreMindCost(travelContext, unanchoredSteps, whole(suppliedRemainder));
  if (mindAvailable !== undefined && finite(mindAvailable) < travel.cost) {
    throw new Error(`心神不足：需要${travel.cost}点，当前${finite(mindAvailable)}点`);
  }
  const seen = observeInternal(state, viewer, origin, 0, now);
  void seen;
  const moved = [];
  for (const coordinate of route.slice(1)) {
    const record = ensureSector(state, coordinate, 'observed');
    viewer.knownSectors[record.id] = true;
    moved.push(descriptorWithState(state, coordinate));
  }
  viewer.coordinate = otherShoreTrueWorldCoordinateId(destination);
  viewer.mindRemainder = travel.remainder;
  viewer.lastActionAt = timestamp(now);
  state.updatedAt = timestamp(now);
  const result = {
    from: otherShoreTrueWorldCoordinateId(origin),
    to: viewer.coordinate,
    path: route.map(otherShoreTrueWorldCoordinateId),
    totalSteps: route.length - 1,
    unanchoredSteps,
    mindCost: travel.cost,
    mindRemainder: travel.remainder,
    travelTier: travel.tier,
    moved,
    rule: (() => {
      const rule = getOtherShoreTravelRule(travelContext);
      return {
        ...rule,
        stepsPerMind: Number.isFinite(rule.stepsPerMind) ? rule.stepsPerMind : null,
        unlimitedSteps: !Number.isFinite(rule.stepsPerMind),
      };
    })(),
  };
  return saveReceipt(state, operation, 'true_world_move', actor, result, now);
}

export const moveTrueWorld = moveOtherShoreTrueWorld;

function requireAtSector(viewer, coordinate) {
  const id = otherShoreTrueWorldCoordinateId(coordinate);
  if (viewer.coordinate && viewer.coordinate !== id) throw new Error('当前修士不在目标真世界扇区');
}

export function exploreOtherShoreTrueWorld(world, {
  playerId,
  playerName,
  coordinate,
  amount = 1,
  operationId,
  now = Date.now(),
} = {}) {
  const state = ensureOtherShoreTrueWorldState(world);
  const id = requiredText(playerId, 'playerId');
  const viewer = ensurePlayer(state, id, playerName);
  const target = requireCoordinate(coordinate ?? viewer.coordinate ?? '0,0');
  const sectorId = otherShoreTrueWorldCoordinateId(target);
  const operation = requiredText(operationId, 'operationId');
  const actor = `${id}:explore:${sectorId}`;
  const replay = replayReceiptFor(
    state,
    operation,
    'true_world_explore',
    `${id}:explore:`,
    result => result?.sector?.id === sectorId,
  );
  if (replay) return replay;
  requireAtSector(viewer, target);
  const record = ensureSector(state, target, 'observed');
  viewer.knownSectors[sectorId] = true;
  const requested = positive(amount, '探索贡献');
  const existing = finite(record.contributors[id]);
  const remaining = Math.max(0, record.progressRequired - finite(record.progress));
  const granted = Math.min(requested, remaining);
  if (granted > 0) {
    record.progress += granted;
    record.contributors[id] = existing + granted;
    viewer.explorationContribution = finite(viewer.explorationContribution) + granted;
  }
  let newlyExplored = false;
  if (record.progress >= record.progressRequired && record.status !== 'explored') {
    record.progress = record.progressRequired;
    record.status = 'explored';
    record.exploredAt = timestamp(now);
    record.exploredBy[id] = true;
    viewer.exploredSectors[sectorId] = true;
    newlyExplored = true;
  } else if (record.status === 'explored') {
    viewer.exploredSectors[sectorId] = true;
  }
  record.updatedAt = timestamp(now);
  viewer.lastActionAt = timestamp(now);
  state.updatedAt = timestamp(now);
  recalculateGlobalCounters(state);
  const result = {
    sector: descriptorWithState(state, target),
    requested,
    granted,
    newlyExplored,
    globalExploredCount: state.global.exploredCount,
    sectorCount: OTHER_SHORE_TRUE_WORLD_SECTOR_COUNT,
  };
  return saveReceipt(state, operation, 'true_world_explore', actor, result, now);
}

export const exploreTrueWorld = exploreOtherShoreTrueWorld;
export const contributeOtherShoreTrueWorldExploration = exploreOtherShoreTrueWorld;

function normalizeRealmTier(value) {
  if (value && typeof value === 'object') {
    const explicit = value.tier ?? value.realmTier ?? value.realm ?? value.境界;
    if (explicit !== undefined && explicit !== null && String(explicit).trim()) return normalizeRealmTier(explicit);
    const travelTier = getOtherShoreTravelTier(value);
    if (travelTier === 'immortal_emperor' || travelTier === 'quasi_immortal_emperor') return 'quasi_immortal_emperor';
    if (travelTier === 'immortal_king') return 'immortal_king';
    if (travelTier === 'true_immortal') return 'true_immortal';
    return 'true_immortal';
  }
  const source = String(value ?? '').trim();
  if (/大帝以下|below[_ -]?emperor|未至大帝/i.test(source)) return 'below_emperor';
  if (/准仙帝|quasi[_ -]?immortal[_ -]?emperor/i.test(source)) return 'quasi_immortal_emperor';
  if (/仙王巨头|帝光仙王|giant/i.test(source)) return 'immortal_king_giant';
  if (/仙王|immortal[_ -]?king/i.test(source)) return 'immortal_king';
  return 'true_immortal';
}

function normalizeTravelContext(value) {
  if (typeof value === 'string' && /大帝以下|below[_ -]?emperor|未至大帝/i.test(value)) {
    return { realm: '筑基' };
  }
  if (value && typeof value === 'object' && value.realmTier && !value.realm && !value.境界 && !value.realmName) {
    return { ...value, realm: value.realmTier };
  }
  return value || {};
}

function strongerTier(left, right) {
  return TIER_ORDER.indexOf(left) >= TIER_ORDER.indexOf(right) ? left : right;
}

function enemyTierFor(state, sector, wave) {
  const value = roll(state.seed, `${sector.id}:tier:${wave}`);
  if (value < 0.1) return 'quasi_immortal_emperor';
  if (value < 0.36) return 'immortal_king_giant';
  if (value < 0.76) return 'immortal_king';
  return 'true_immortal';
}

function encounterIdFor(sectorId, wave) {
  return `true-world:${sectorId}:wave-${wave}`;
}

function createEncounter(state, sector, { playerId, realm, now, wave: requestedWave } = {}) {
  const sectorDescriptor = proceduralDescriptor(state, sector);
  const wave = whole(requestedWave) > 0 ? whole(requestedWave) : whole(sector.encounterWave) + 1;
  const baseTier = enemyTierFor(state, sector, wave);
  const playerTier = normalizeRealmTier(realm);
  const sameRealmMutant =
    roll(state.seed, `${sector.id}:mutant:${wave}`) < OTHER_SHORE_TRUE_WORLD_SAME_REALM_MUTANT_RATE;
  const tier = sameRealmMutant ? strongerTier(baseTier, playerTier) : baseTier;
  const profile = OTHER_SHORE_TRUE_WORLD_ENEMY_TIERS[tier];
  const scale = 1 + Math.max(0, sectorDescriptor.threat - 3) * 0.08 + Math.min(0.4, wave * 0.03);
  const maxHp = Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(profile.maxHp * scale));
  const id = encounterIdFor(sector.id, wave);
  return {
    encounterId: id,
    sectorId: sector.id,
    wave,
    tier,
    name: sameRealmMutant ? `同源${profile.name}` : profile.name,
    realmName: profile.realmName,
    sameRealmMutant,
    referenceRealm: sameRealmMutant ? String(realm || profile.realmName) : null,
    maxHp,
    currentHp: maxHp,
    attack: Math.trunc(profile.attack * scale),
    defense: Math.trunc(profile.defense * scale),
    status: 'active',
    startedAt: timestamp(now),
    defeatedAt: null,
    defeatedBy: null,
    contributions: {},
    rewardedPlayers: {},
    participants: {},
  };
}

function serializeEncounter(encounter) {
  if (!encounter) return null;
  return {
    encounterId: encounter.encounterId,
    sectorId: encounter.sectorId,
    wave: encounter.wave,
    tier: encounter.tier,
    name: encounter.name,
    realmName: encounter.realmName,
    sameRealmMutant: encounter.sameRealmMutant === true,
    maxHp: encounter.maxHp,
    currentHp: encounter.currentHp,
    attack: encounter.attack,
    defense: encounter.defense,
    status: encounter.status,
    participantCount: Object.keys(encounter.participants || {}).length,
    contribution: Object.values(encounter.contributions || {}).reduce((sum, value) => sum + finite(value?.damage), 0),
    defeatedAt: encounter.defeatedAt || null,
  };
}

export function getOtherShoreTrueWorldEnemyProfile(world, {
  coordinate = '0,0',
  wave = 1,
  playerId = 'preview',
  realm,
} = {}) {
  const state = ensureOtherShoreTrueWorldState(world);
  const target = requireCoordinate(coordinate);
  // 预览只读取程序化描述，不把未观测扇区写入共享地图。
  const descriptor = proceduralDescriptor(state, target);
  const sector = {
    ...descriptor,
    encounterWave: 0,
    encounter: null,
  };
  const encounter = createEncounter(state, sector, { playerId, realm, now: 0, wave });
  return serializeEncounter(encounter);
}

function encounterFor(state, coordinate) {
  const id = otherShoreTrueWorldCoordinateId(coordinate);
  const sector = state.sectors[id];
  if (!sector?.encounter) throw new Error('该扇区尚未生成敌群');
  return { sector, encounter: sector.encounter };
}

export function startOtherShoreTrueWorldEncounter(world, {
  playerId,
  playerName,
  coordinate,
  realm,
  operationId,
  now = Date.now(),
} = {}) {
  const state = ensureOtherShoreTrueWorldState(world);
  const id = requiredText(playerId, 'playerId');
  const viewer = ensurePlayer(state, id, playerName);
  const target = requireCoordinate(coordinate ?? viewer.coordinate ?? '0,0');
  const sectorId = otherShoreTrueWorldCoordinateId(target);
  const operation = requiredText(operationId, 'operationId');
  const actor = `${id}:encounter:${sectorId}`;
  const replay = replayReceiptFor(
    state,
    operation,
    'true_world_encounter_start',
    `${id}:encounter:`,
    result => result?.sectorId === sectorId,
  );
  if (replay) return replay;
  requireAtSector(viewer, target);
  const sector = ensureSector(state, target, 'observed');
  if (sector.status !== 'explored') throw new Error('先完成该扇区的全服探索');
  const newlySpawned = !sector.encounter || sector.encounter.status === 'defeated';
  if (newlySpawned) {
    sector.encounter = createEncounter(state, sector, { playerId: id, realm, now });
    sector.encounterWave = sector.encounter.wave;
    state.global.encounterCount++;
  }
  sector.encounter.participants[id] = {
    playerName: viewer.playerName,
    joinedAt: timestamp(now),
    realm: String(realm || ''),
  };
  viewer.lastActionAt = timestamp(now);
  sector.updatedAt = timestamp(now);
  state.updatedAt = timestamp(now);
  const result = {
    sectorId,
    encounter: serializeEncounter(sector.encounter),
    newlySpawned,
  };
  return saveReceipt(state, operation, 'true_world_encounter_start', actor, result, now);
}

export const createOtherShoreTrueWorldEncounter = startOtherShoreTrueWorldEncounter;
export const startTrueWorldEncounter = startOtherShoreTrueWorldEncounter;

function battleDamage(encounter, { damage, battle, won } = {}) {
  const explicit = Number(damage);
  if (Number.isFinite(explicit)) return Math.max(0, explicit);
  const remaining = Number(
    battle?.enemyHp ?? battle?.B_hp ?? battle?.bossHp ?? battle?.currentHp,
  );
  if (Number.isFinite(remaining)) return Math.max(0, encounter.currentHp - remaining);
  if (won === true || battle?.winner === 'A') return encounter.currentHp;
  return 0;
}

function battleVictory(battle, won) {
  if (won === true) return true;
  if (won === false) return false;
  const playerHp = Number(battle?.A_hp ?? battle?.playerHp);
  const enemyHp = Number(battle?.B_hp ?? battle?.enemyHp ?? battle?.bossHp);
  return battle?.winner === 'A'
    && Number.isFinite(playerHp)
    && playerHp > 0
    && Number.isFinite(enemyHp)
    && enemyHp <= 0;
}

function chooseOpportunity(state, encounter, actorId) {
  const index = hash(`${state.seed}:${encounter.encounterId}:${actorId}`) % OTHER_SHORE_TRUE_WORLD_OPPORTUNITIES.length;
  return OTHER_SHORE_TRUE_WORLD_OPPORTUNITIES[index];
}

function buildEnemyReward(state, encounter, playerId, damage, share, now) {
  const profile = OTHER_SHORE_TRUE_WORLD_ENEMY_TIERS[encounter.tier];
  const tierIndex = Math.max(0, TIER_ORDER.indexOf(encounter.tier));
  const materials = {};
  materials['true-world-source-crystal'] = 1 + tierIndex;
  if (tierIndex >= 1) materials['dao-rule-origin'] = 1 + tierIndex;
  if (tierIndex >= 2) materials['dimension-anchor-crystal'] = 1 + tierIndex;
  if (tierIndex >= 3) {
    materials['era-dao-marrow'] = 1;
    materials['all-heavens-mother-metal'] = 1;
  }
  const multiplier = Math.max(0.25, Math.min(1, share));
  const grantedMaterials = {};
  for (const [key, amount] of Object.entries(materials)) {
    const granted = Math.max(1, Math.floor(amount * multiplier));
    grantedMaterials[key] = granted;
  }
  const opportunity = chooseOpportunity(state, encounter, playerId);
  let eraAccumulation = 0;
  let sourceCount = 0;
  if (profile.eraReward > 0) {
    eraAccumulation = profile.eraReward;
    sourceCount = profile.sourceReward;
  }
  return {
    playerId,
    tier: encounter.tier,
    damage,
    share,
    materials: grantedMaterials,
    opportunity: { ...copy(opportunity), quantity: 1 },
    eraAccumulation,
    quasiImmortalEmperorSources: sourceCount,
    at: timestamp(now),
  };
}

function applyEnemyReward(state, reward) {
  const player = ensurePlayer(state, reward.playerId);
  for (const [key, amount] of Object.entries(reward.materials || {})) {
    player.materials[key] = whole(player.materials[key]) + whole(amount);
  }
  if (reward.opportunity?.id) {
    player.opportunities[reward.opportunity.id] =
      whole(player.opportunities[reward.opportunity.id]) + whole(reward.opportunity.quantity || 1);
  }
  player.eraAccumulation += whole(reward.eraAccumulation);
  player.quasiImmortalEmperorSources += whole(reward.quasiImmortalEmperorSources);
  player.victories.total = whole(player.victories.total) + 1;
  player.victories[reward.tier] = whole(player.victories[reward.tier]) + 1;
}

function rewardItems(reward) {
  const items = Object.entries(reward?.materials || {}).map(([id, quantity]) => ({
    id,
    name: MATERIAL_REWARDS[id] || id,
    kind: 'material',
    quantity: whole(quantity),
  }));
  if (reward?.opportunity?.id) items.push({ ...copy(reward.opportunity), quantity: whole(reward.opportunity.quantity || 1) });
  return items;
}

export function applyOtherShoreTrueWorldBattle(world, {
  playerId,
  playerName,
  coordinate,
  encounterId,
  damage,
  battle,
  won,
  operationId,
  now = Date.now(),
} = {}) {
  const state = ensureOtherShoreTrueWorldState(world);
  const id = requiredText(playerId, 'playerId');
  const viewer = ensurePlayer(state, id, playerName);
  const target = requireCoordinate(coordinate ?? viewer.coordinate ?? '0,0');
  const { sector, encounter } = encounterFor(state, target);
  const expectedEncounterId = requiredText(encounterId || encounter.encounterId, 'encounterId');
  if (expectedEncounterId !== encounter.encounterId) throw new Error('真世界敌群会话已经变化');
  const operation = requiredText(operationId, 'operationId');
  const actor = `${id}:battle:${sector.id}:${encounter.encounterId}`;
  const replay = replayReceiptFor(
    state,
    operation,
    'true_world_battle',
    `${id}:battle:`,
    result => result?.encounterId === encounter.encounterId,
  );
  if (replay) return replay;
  requireAtSector(viewer, target);
  if (encounter.status !== 'active') {
    const result = {
      encounterId: encounter.encounterId,
      alreadyDefeated: encounter.status === 'defeated',
      defeated: encounter.status === 'defeated',
      currentHp: encounter.currentHp,
      maxHp: encounter.maxHp,
      tier: encounter.tier,
      sameRealmMutant: encounter.sameRealmMutant === true,
      rewards: [],
      eraAccumulation: 0,
      pendingClaimId: null,
    };
    return saveReceipt(state, operation, 'true_world_battle', actor, result, now);
  }
  const victory = battleVictory(battle, won);
  const dealt = Math.min(encounter.currentHp, battleDamage(encounter, { damage, battle, won }));
  if (dealt > 0) {
    encounter.currentHp -= dealt;
    encounter.contributions[id] ||= { playerName: viewer.playerName, damage: 0 };
    encounter.contributions[id].damage += dealt;
    encounter.participants[id] ||= { playerName: viewer.playerName, joinedAt: timestamp(now), realm: '' };
  }
  const defeated = encounter.currentHp <= 0 && victory;
  if (!defeated && encounter.currentHp <= 0) encounter.currentHp = 1;
  const rewards = [];
  if (defeated) {
    encounter.currentHp = 0;
    encounter.status = 'defeated';
    encounter.defeatedAt = timestamp(now);
    encounter.defeatedBy = id;
    state.global.victoryCount++;
    if (encounter.tier === 'quasi_immortal_emperor') {
      state.global.quasiImmortalEmperorDefeated++;
      state.global.eraAccumulation++;
    }
    const totalDamage = Object.values(encounter.contributions).reduce((sum, value) => sum + finite(value.damage), 0);
    for (const [contributorId, contribution] of Object.entries(encounter.contributions)) {
      if (encounter.rewardedPlayers[contributorId] || !(contribution.damage > 0)) continue;
      const share = totalDamage > 0 ? contribution.damage / totalDamage : 1;
      const reward = buildEnemyReward(state, encounter, contributorId, contribution.damage, share, now);
      state.pendingClaims[contributorId] ||= {};
      const claimId = `true-world-loot:${encounter.encounterId}:${contributorId}`;
      state.pendingClaims[contributorId][claimId] = {
        version: 1,
        claimId,
        playerId: contributorId,
        encounterId: encounter.encounterId,
        status: 'pending',
        reward,
        createdAt: timestamp(now),
        claimedAt: null,
      };
      for (const [key, amount] of Object.entries(reward.materials || {})) {
        state.global.materialTotals[key] = whole(state.global.materialTotals[key]) + whole(amount);
      }
      state.global.opportunityCount++;
      encounter.rewardedPlayers[contributorId] = true;
      rewards.push(reward);
    }
  }
  sector.updatedAt = timestamp(now);
  viewer.lastActionAt = timestamp(now);
  state.updatedAt = timestamp(now);
  const actorReward = rewards.find((reward) => reward.playerId === id) || null;
  const actorClaimId = actorReward
    ? `true-world-loot:${encounter.encounterId}:${id}`
    : null;
  const result = {
    encounterId: encounter.encounterId,
    damage: dealt,
    currentHp: encounter.currentHp,
    maxHp: encounter.maxHp,
    defeated,
    tier: encounter.tier,
    sameRealmMutant: encounter.sameRealmMutant,
    rewards: actorReward ? [actorReward] : [],
    eraAccumulation: actorReward?.eraAccumulation || 0,
    pendingClaimId: actorClaimId,
    rewardedPlayerIds: rewards.map((reward) => reward.playerId),
    globalEraAccumulation: state.global.eraAccumulation,
  };
  return saveReceipt(state, operation, 'true_world_battle', actor, result, now);
}

export const battleOtherShoreTrueWorld = applyOtherShoreTrueWorldBattle;
export const resolveOtherShoreTrueWorldEncounter = applyOtherShoreTrueWorldBattle;

/**
 * 领取战斗产生的彼岸战利品。战斗结算和领取拆成两个幂等动作，控制器可以
 * 在 Redis/数据库结算失败后只重试领取，不会重复发放材料或纪元积累。
 */
export function claimOtherShoreTrueWorldLoot(world, {
  playerId,
  claimId,
  operationId,
  now = Date.now(),
} = {}) {
  const state = ensureOtherShoreTrueWorldState(world);
  const id = requiredText(playerId, 'playerId');
  const viewer = ensurePlayer(state, id);
  const claim = state.pendingClaims[id]?.[requiredText(claimId, 'claimId')];
  if (!claim) throw new Error('真世界战利品领取单不存在');
  const operation = requiredText(operationId || `claim:${claim.claimId}`, 'operationId');
  const actor = `${id}:claim:${claim.claimId}`;
  const previous = receiptFor(state, operation, 'true_world_claim', actor);
  if (previous) return previous;
  if (claim.status === 'claimed') {
    const duplicate = {
      claimed: false,
      duplicate: true,
      claimId: claim.claimId,
      encounterId: claim.encounterId,
      items: rewardItems(claim.reward),
      reward: copy(claim.reward),
      eraAccumulation: whole(claim.reward?.eraAccumulation),
      materials: copy(claim.reward?.materials || {}),
      opportunity: copy(claim.reward?.opportunity || null),
    };
    return saveReceipt(state, operation, 'true_world_claim', actor, duplicate, now);
  }
  applyEnemyReward(state, claim.reward);
  claim.status = 'claimed';
  claim.claimedAt = timestamp(now);
  viewer.lastActionAt = timestamp(now);
  state.updatedAt = timestamp(now);
  const result = {
    claimed: true,
    duplicate: false,
    claimId: claim.claimId,
    encounterId: claim.encounterId,
    items: rewardItems(claim.reward),
    reward: copy(claim.reward),
    eraAccumulation: whole(claim.reward?.eraAccumulation),
    materials: copy(claim.reward?.materials || {}),
    opportunity: copy(claim.reward?.opportunity || null),
  };
  return saveReceipt(state, operation, 'true_world_claim', actor, result, now);
}

export const claimTrueWorldLoot = claimOtherShoreTrueWorldLoot;
export const claimOtherShoreLoot = claimOtherShoreTrueWorldLoot;

function serializePlayer(state, player) {
  ensureMaterialBag(player);
  const pendingClaims = Object.values(state.pendingClaims?.[player.playerId] || {})
    .filter((claim) => claim.status === 'pending')
    .map((claim) => ({
      claimId: claim.claimId,
      encounterId: claim.encounterId,
      createdAt: claim.createdAt,
      tier: claim.reward?.tier || null,
      eraAccumulation: whole(claim.reward?.eraAccumulation),
      materialUnits: Object.values(claim.reward?.materials || {}).reduce((sum, value) => sum + whole(value), 0),
      opportunity: claim.reward?.opportunity?.name || null,
    }));
  return {
    playerId: player.playerId,
    playerName: player.playerName,
    coordinate: player.coordinate,
    knownCount: Object.keys(player.knownSectors || {}).length,
    exploredCount: Object.keys(player.exploredSectors || {}).length,
    eraAccumulation: whole(player.eraAccumulation),
    quasiImmortalEmperorSources: whole(player.quasiImmortalEmperorSources),
    materials: Object.fromEntries(MATERIAL_KEYS.map((key) => [key, whole(player.materials[key])])),
    opportunities: Object.entries(player.opportunities || {}).map(([id, quantity]) => ({
      ...(copy(OPPORTUNITY_BY_ID.get(id)) || { id, name: id, kind: 'unknown' }),
      quantity: whole(quantity),
    })),
    victories: { ...player.victories },
    mindRemainder: whole(player.mindRemainder),
    pendingClaims,
    pendingClaimCount: pendingClaims.length,
  };
}

function globalFrontier(state, cap = 64) {
  const ids = new Set();
  for (const record of Object.values(state.sectors)) {
    if (record.status === 'unseen') continue;
    for (const neighbor of getOtherShoreTrueWorldNeighbors(record)) {
      const id = otherShoreTrueWorldCoordinateId(neighbor);
      if (!state.sectors[id] || state.sectors[id].status === 'unseen') ids.add(id);
      if (ids.size >= cap) return [...ids];
    }
  }
  return [...ids];
}

export function serializeOtherShoreTrueWorld(world, {
  viewerId,
  center,
  radius = 3,
  now = Date.now(),
} = {}) {
  const state = ensureOtherShoreTrueWorldState(world);
  const viewer = viewerId ? ensurePlayer(state, viewerId) : null;
  const origin = requireCoordinate(center ?? viewer?.coordinate ?? '0,0');
  const range = Math.max(0, Math.min(6, whole(radius, 3)));
  const visible = coordinatesWithinRange(origin, range).map((coordinate) => {
    const descriptor = descriptorWithState(state, coordinate);
    if (viewer) descriptor.known = viewer.knownSectors[descriptor.id] === true;
    return descriptor;
  });
  const activeEncounters = Object.values(state.sectors)
    .filter((sector) => sector.encounter?.status === 'active')
    .map((sector) => serializeEncounter(sector.encounter));
  const currentSector = viewer ? descriptorWithState(state, viewer.coordinate) : null;
  const pendingClaimCount = viewer
    ? Object.values(state.pendingClaims?.[viewer.playerId] || {}).filter((claim) => claim.status === 'pending').length
    : 0;
  return {
    layer: 'true_world',
    name: '真世界',
    kind: 'procedural-sector-sea',
    exists: true,
    unlocked: true,
    version: state.version,
    seed: state.seed,
    radius: state.radius,
    sectorCount: OTHER_SHORE_TRUE_WORLD_SECTOR_COUNT,
    center: otherShoreTrueWorldCoordinateId(origin),
    currentSectorId: viewer?.coordinate || otherShoreTrueWorldCoordinateId(origin),
    rules: {
      suppressionMultiplier: 0.7,
      externalShop: false,
      externalPillHealing: false,
      explorationShared: true,
    },
    global: {
      observedCount: state.global.observedCount,
      exploredCount: state.global.exploredCount,
      progressPercent: Number(((state.global.exploredCount / OTHER_SHORE_TRUE_WORLD_SECTOR_COUNT) * 100).toFixed(4)),
      totalContribution: state.global.totalContribution,
      eraAccumulation: state.global.eraAccumulation,
      quasiImmortalEmperorDefeated: state.global.quasiImmortalEmperorDefeated,
      encounterCount: state.global.encounterCount,
      victoryCount: state.global.victoryCount,
      opportunityCount: state.global.opportunityCount,
      materialTotals: Object.fromEntries(MATERIAL_KEYS.map((key) => [key, whole(state.global.materialTotals[key])])),
      materialNames: { ...MATERIAL_REWARDS },
    },
    frontier: globalFrontier(state),
    sectors: visible,
    activeEncounters,
    currentSector,
    capabilities: {
      canObserve: Boolean(viewer),
      canMove: Boolean(viewer),
      canExplore: Boolean(viewer && currentSector?.status !== 'explored'),
      canEncounter: Boolean(viewer && currentSector?.status === 'explored'),
      canClaim: pendingClaimCount > 0,
    },
    viewer: viewer
      ? {
          ...serializePlayer(state, viewer),
          currentSector,
          canObserve: true,
          canMove: true,
          canExplore: currentSector.status !== 'explored',
          canEncounter: currentSector.status === 'explored',
          canClaim: pendingClaimCount > 0,
        }
      : null,
    updatedAt: timestamp(now),
  };
}

export const serializeTrueWorld = serializeOtherShoreTrueWorld;

export default {
  ensureOtherShoreTrueWorldState,
  getOtherShoreTrueWorldSector,
  getOtherShoreTrueWorldProgress,
  isOtherShoreTrueWorldExplorationComplete,
  getOtherShoreTrueWorldEnemyProfile,
  observeOtherShoreTrueWorld,
  moveOtherShoreTrueWorld,
  exploreOtherShoreTrueWorld,
  startOtherShoreTrueWorldEncounter,
  applyOtherShoreTrueWorldBattle,
  claimOtherShoreTrueWorldLoot,
  serializeOtherShoreTrueWorld,
};
