export const DEFAULT_XIANGU_FRAGMENT_SIZES = Object.freeze({
  edge_camp: Object.freeze([11, 11]),
  spirit_lake: Object.freeze([11, 11]),
  ancient_ruins: Object.freeze([11, 11]),
  true_dragon_nest: Object.freeze([11, 11]),
  chaos_rift: Object.freeze([11, 11]),
  dark_prison: Object.freeze([11, 11]),
  immortal_podium: Object.freeze([11, 11]),
  bone_forest: Object.freeze([11, 11]),
  flame_abyss: Object.freeze([11, 11]),
  xiangu_core: Object.freeze([11, 11]),
  xiangu_arena: Object.freeze([11, 11]),
  xiangu_ultimate: Object.freeze([11, 11]),
  chaos_mosquito: Object.freeze([11, 11]),
  void_rift: Object.freeze([11, 11]),
});

export const XIANGU_MOVE_DIRECTIONS = Object.freeze({
  '上': Object.freeze({ dx: 0, dy: -1, name: '上方' }),
  '下': Object.freeze({ dx: 0, dy: 1, name: '下方' }),
  '左': Object.freeze({ dx: -1, dy: 0, name: '左方' }),
  '右': Object.freeze({ dx: 1, dy: 0, name: '右方' }),
  '左上': Object.freeze({ dx: -1, dy: -1, name: '左上方' }),
  '右上': Object.freeze({ dx: 1, dy: -1, name: '右上方' }),
  '左下': Object.freeze({ dx: -1, dy: 1, name: '左下方' }),
  '右下': Object.freeze({ dx: 1, dy: 1, name: '右下方' }),
});

const XIANGU_OPPOSITE_BOUNDARY = Object.freeze({
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
});

export function parseXianguMoveCommand(message, maxSteps = 20) {
  const match = String(message || '').trim().match(/^#(左上|右上|左下|右下|上|下|左|右)(\d*)$/);
  if (!match) return null;

  const limit = Math.max(1, Math.floor(Number(maxSteps) || 20));
  return {
    key: match[1],
    ...XIANGU_MOVE_DIRECTIONS[match[1]],
    steps: match[2] ? Math.max(1, Math.min(limit, parseInt(match[2], 10) || 1)) : 1,
  };
}

export function resolveXianguBoundaryTransition(map, currentPosition, nextPosition) {
  const width = Math.floor(Number(map?.width) || Number(map?.grid?.[0]?.length));
  const height = Math.floor(Number(map?.height) || Number(map?.grid?.length));
  if (width < 1 || height < 1 || !currentPosition || !nextPosition) return null;

  const verticalDirection = nextPosition.y < 0
    ? 'top'
    : nextPosition.y >= height ? 'bottom' : null;
  const horizontalDirection = nextPosition.x < 0
    ? 'left'
    : nextPosition.x >= width ? 'right' : null;
  const direction = verticalDirection || horizontalDirection;
  if (!direction) return null;

  return {
    direction,
    enterDirection: XIANGU_OPPOSITE_BOUNDARY[direction],
    borderPosition: {
      x: horizontalDirection === 'left'
        ? 0
        : horizontalDirection === 'right' ? width - 1 : currentPosition.x,
      y: verticalDirection === 'top'
        ? 0
        : verticalDirection === 'bottom' ? height - 1 : currentPosition.y,
    },
  };
}

export const XIANGU_MARROW_POOL_NAME = '万道仙髓池';
export const XIANGU_MARROW_POOL_KIND = 'wandao_xiansui_pool';
export const DEFAULT_XIANGU_MARROW_POOL_CONFIG = Object.freeze({
  exploreChance: 0.03,
  npcInviteChance: 0.18,
  potentialGain: 50,
  rewardMultiplier: 5,
  // A pool belongs to the discovering player's map unless configured otherwise.
  worldUnique: false,
});

const MIN_FRAGMENT_SIDE = 11;
const MAX_FRAGMENT_SIDE = 11;

function clonePlainData(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function normalizeSide(value, fallback) {
  const side = Math.floor(Number(value));
  if (!Number.isFinite(side)) return fallback;
  return Math.min(MAX_FRAGMENT_SIDE, Math.max(MIN_FRAGMENT_SIDE, side));
}

function normalizeSize(value, fallback) {
  if (!Array.isArray(value) || value.length < 2) return [...fallback];
  return [
    normalizeSide(value[0], fallback[0]),
    normalizeSide(value[1], fallback[1]),
  ];
}

function normalizeProbability(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

function normalizeNonNegative(value, fallback, integer = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const normalized = Math.max(0, number);
  return integer ? Math.floor(normalized) : normalized;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on', '\u662f', '\u771f'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off', '\u5426', '\u5047'].includes(normalized)) return false;
  return fallback;
}

export function resolveXianguMarrowPoolConfig(config = {}) {
  const poolConfig = config?.万道仙髓池配置 ||
    config?.万道仙髓池 ||
    config?.机缘宝池 ||
    config?.marrowPool ||
    config;

  return {
    exploreChance: normalizeProbability(
      poolConfig?.探索概率 ?? poolConfig?.exploreChance,
      DEFAULT_XIANGU_MARROW_POOL_CONFIG.exploreChance,
    ),
    npcInviteChance: normalizeProbability(
      poolConfig?.NPC邀请概率 ?? poolConfig?.npcInviteChance,
      DEFAULT_XIANGU_MARROW_POOL_CONFIG.npcInviteChance,
    ),
    potentialGain: normalizeNonNegative(
      poolConfig?.仙道潜力 ?? poolConfig?.potentialGain,
      DEFAULT_XIANGU_MARROW_POOL_CONFIG.potentialGain,
      true,
    ),
    rewardMultiplier: normalizeNonNegative(
      poolConfig?.修血倍率 ?? poolConfig?.rewardMultiplier,
      DEFAULT_XIANGU_MARROW_POOL_CONFIG.rewardMultiplier,
    ),
    worldUnique: normalizeBoolean(
      poolConfig?.['\u5168\u5c40\u552f\u4e00'] ?? poolConfig?.worldUnique,
      DEFAULT_XIANGU_MARROW_POOL_CONFIG.worldUnique,
    ),
  };
}

export function getXianguMarrowPoolTrapChance(npc, relation = 0) {
  if (npc?.hostile === true || npc?.personality === 'hostile') return 0.75;
  if (npc?.personality === 'scheming') return 0.6;
  if ((Number(relation) || 0) < 0) return 0.4;
  if (npc?.personality === 'friendly' || npc?.faction === 'good') return 0;
  return 0.1;
}

export function resolveXianguFragmentSize(config = {}, fragmentId, fallback = [6, 6]) {
  const mapConfig = config?.地图配置 || config?.mapConfig || config;
  const configuredSizes = mapConfig?.碎片尺寸 || mapConfig?.fragmentSizes || {};
  const defaultSize = DEFAULT_XIANGU_FRAGMENT_SIZES[fragmentId] || normalizeSize(fallback, [6, 6]);
  return normalizeSize(configuredSizes[fragmentId], defaultSize);
}

function boundedRandom(random) {
  const value = Number(typeof random === 'function' ? random() : Math.random());
  return Number.isFinite(value) ? Math.min(1 - Number.EPSILON, Math.max(0, value)) : 0;
}

function randomIndex(length, random) {
  return Math.floor(boundedRandom(random) * length);
}

export function calculateXianguMarrowPoolRewards(
  player = {},
  {
    rewardMultiplier = DEFAULT_XIANGU_MARROW_POOL_CONFIG.rewardMultiplier,
    random = Math.random,
  } = {},
) {
  const levelId = Number(player.level_id) || 0;
  const physiqueId = Number(player.Physique_id) || 0;
  const secretRealmId = Number(player.mijinglevel_id) || 0;
  const ancientRealmId = Number(player.xiangulevel_id) || 0;
  const multiplier = normalizeNonNegative(
    rewardMultiplier,
    DEFAULT_XIANGU_MARROW_POOL_CONFIG.rewardMultiplier,
  );

  const baseXiuwei = Math.trunc(
    2000 + 10000 * levelId * levelId * secretRealmId * ancientRealmId * (2 + boundedRandom(random)),
  );
  const baseXueqi = Math.trunc(
    2000 + 10000 * physiqueId * physiqueId * secretRealmId * ancientRealmId * (2 + boundedRandom(random)),
  );

  return {
    xiuwei: Math.trunc(baseXiuwei * multiplier),
    xueqi: Math.trunc(baseXueqi * multiplier),
  };
}

export function placeXianguMarrowPool(
  map,
  {
    reveal = false,
    metadata = {},
    random = Math.random,
    emptyValue = 0,
    uniqueTreasureValue = 8,
  } = {},
) {
  const size = getRectangularGridSize(map?.grid);
  if (!size) return { placed: false, reason: 'invalid_map' };

  const uniqueTreasures = map.uniqueTreasures && typeof map.uniqueTreasures === 'object' &&
    !Array.isArray(map.uniqueTreasures)
    ? map.uniqueTreasures
    : {};
  const existingEntry = Object.entries(uniqueTreasures).find(([key, treasure]) =>
    treasure?.kind === XIANGU_MARROW_POOL_KIND ||
    treasure?.name === XIANGU_MARROW_POOL_NAME ||
    String(key).startsWith(`${XIANGU_MARROW_POOL_NAME}@`),
  );
  if (existingEntry) {
    return {
      placed: false,
      reason: 'exists',
      key: existingEntry[0],
      position: clonePlainData(existingEntry[1]?.pos),
      treasure: existingEntry[1],
    };
  }

  const candidates = [];
  for (let y = 1; y < size.height - 1; y++) {
    for (let x = 1; x < size.width - 1; x++) {
      if (
        map.grid[y][x] === emptyValue &&
        (map.playerPos?.x !== x || map.playerPos?.y !== y)
      ) {
        candidates.push({ x, y });
      }
    }
  }
  if (candidates.length === 0) return { placed: false, reason: 'no_empty_cell' };

  const position = candidates[randomIndex(candidates.length, random)];
  const customMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? clonePlainData(metadata)
    : {};
  const treasure = {
    desc: '仙古万道残韵沉积而成的仙髓宝池，可洗炼根骨、增益潜力',
    distEcho: 2,
    echoMsg: {
      2: '远处传来水波声，万道残韵随之轻鸣...',
      1: '仙髓气息扑面而来，一方宝池已近在眼前！',
    },
    ...customMetadata,
    kind: XIANGU_MARROW_POOL_KIND,
    name: XIANGU_MARROW_POOL_NAME,
    pos: { ...position },
    claimed: false,
  };

  let key = `${XIANGU_MARROW_POOL_NAME}@${position.x},${position.y}`;
  for (let suffix = 2; Object.hasOwn(uniqueTreasures, key); suffix++) {
    key = `${XIANGU_MARROW_POOL_NAME}@${position.x},${position.y}#${suffix}`;
  }

  map.uniqueTreasures = uniqueTreasures;
  map.grid[position.y][position.x] = uniqueTreasureValue;
  uniqueTreasures[key] = treasure;
  if (reveal && Array.isArray(map.revealed?.[position.y])) {
    map.revealed[position.y][position.x] = true;
  }

  return {
    placed: true,
    key,
    position: { ...position },
    treasure,
  };
}

export function pickDifferentXianguFragment(currentFragmentId, candidates, random = Math.random) {
  const available = [...new Set(Array.isArray(candidates) ? candidates : [])]
    .filter(fragmentId => fragmentId && String(fragmentId) !== String(currentFragmentId));
  return available.length > 0 ? available[randomIndex(available.length, random)] : null;
}

export function ensureXianguRequiredConnections(
  currentFragmentId,
  connections = {},
  requiredTargets = [],
  random = Math.random,
  protectedDirection = null,
) {
  const directions = ['top', 'bottom', 'left', 'right'];
  const currentKey = String(currentFragmentId || '');
  const protectedKey = directions.includes(protectedDirection) ? protectedDirection : null;
  const result = Object.fromEntries(directions.map(direction => {
    const target = connections?.[direction];
    return [direction, target && String(target) !== currentKey ? target : null];
  }));
  const required = [...new Set(Array.isArray(requiredTargets) ? requiredTargets : [])]
    .filter(target => target && String(target) !== currentKey);
  const requiredKeys = new Set(required.map(String));

  for (const target of required) {
    const targetKey = String(target);
    if (directions.some(direction => String(result[direction] || '') === targetKey)) continue;

    let candidates = directions.filter(direction => direction !== protectedKey && !result[direction]);
    if (candidates.length === 0) {
      const counts = new Map();
      for (const direction of directions) {
        if (direction === protectedKey) continue;
        const key = String(result[direction]);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      candidates = directions.filter(direction =>
        direction !== protectedKey && counts.get(String(result[direction])) > 1
      );
    }
    if (candidates.length === 0) {
      candidates = directions.filter(direction =>
        direction !== protectedKey && !requiredKeys.has(String(result[direction]))
      );
    }
    if (candidates.length === 0) break;
    result[candidates[randomIndex(candidates.length, random)]] = target;
  }

  const seen = new Set();
  if (protectedKey && result[protectedKey]) seen.add(String(result[protectedKey]));
  for (const direction of directions) {
    if (direction === protectedKey) continue;
    const target = result[direction];
    const key = String(target || '');
    if (!target || key === currentKey || seen.has(key)) result[direction] = null;
    else seen.add(key);
  }
  return result;
}

export function createXianguExitPositions(width, height, connections = {}, random = Math.random) {
  const w = Math.max(3, Math.floor(Number(width) || 0));
  const h = Math.max(3, Math.floor(Number(height) || 0));
  const positions = [];

  for (const direction of ['top', 'bottom', 'left', 'right']) {
    if (!connections?.[direction]) continue;
    if (direction === 'top' || direction === 'bottom') {
      positions.push({
        x: 1 + randomIndex(w - 2, random),
        y: direction === 'top' ? 0 : h - 1,
      });
    } else {
      positions.push({
        x: direction === 'left' ? 0 : w - 1,
        y: 1 + randomIndex(h - 2, random),
      });
    }
  }

  return positions;
}

export function getRevealedXianguExits(map, exitValue = 5) {
  const size = getRectangularGridSize(map?.grid);
  const revealedSize = getRectangularGridSize(map?.revealed);
  if (!size || !revealedSize || size.width !== revealedSize.width || size.height !== revealedSize.height) {
    return [];
  }

  const directions = [
    ['top', point => point.y === 0],
    ['bottom', point => point.y === size.height - 1],
    ['left', point => point.x === 0],
    ['right', point => point.x === size.width - 1],
  ];

  return (Array.isArray(map.exitPositions) ? map.exitPositions : [])
    .filter(point =>
      isPointInside(map.grid, point) &&
      map.grid[point.y][point.x] === exitValue &&
      map.revealed[point.y][point.x] === true
    )
    .map(point => {
      const direction = directions.find(([, matches]) => matches(point))?.[0];
      return direction && map.connectedFragments?.[direction]
        ? { direction, target: map.connectedFragments[direction], position: { ...point } }
        : null;
    })
    .filter(Boolean);
}

export function isXianguExitUnlocked(map, x, y, exitValue = 5) {
  return getRevealedXianguExits(map, exitValue)
    .some(exit => exit.position.x === x && exit.position.y === y);
}

function getRectangularGridSize(grid) {
  if (!Array.isArray(grid) || grid.length < 3 || !Array.isArray(grid[0]) || grid[0].length < 3) {
    return null;
  }
  const width = grid[0].length;
  if (grid.some(row => !Array.isArray(row) || row.length !== width)) return null;
  return { width, height: grid.length };
}

export function createXianguFragmentSnapshot(map = {}) {
  const size = getRectangularGridSize(map.grid);
  const revealedSize = getRectangularGridSize(map.revealed);
  if (!size || !revealedSize || size.width !== revealedSize.width || size.height !== revealedSize.height) {
    return null;
  }
  if (!isPointInside(map.grid, map.playerPos)) return null;

  return clonePlainData({
    version: 1,
    fragmentId: String(map.fragmentId || ''),
    instanceId: map.instanceId,
    width: size.width,
    height: size.height,
    grid: map.grid,
    revealed: map.revealed,
    lastPos: map.playerPos,
    connectedFragments: map.connectedFragments || {},
    uniqueTreasures: map.uniqueTreasures || {},
    npcLocations: map.npcLocations || [],
    npcEcology: map.npcEcology || {},
    exitPositions: map.exitPositions || [],
    generatedAt: Number(map.generatedAt) || Date.now(),
  });
}

export function restoreXianguFragmentSnapshot(snapshot, fragmentId) {
  if (!snapshot || snapshot.version !== 1 || String(snapshot.fragmentId) !== String(fragmentId)) return null;
  const size = getRectangularGridSize(snapshot.grid);
  const revealedSize = getRectangularGridSize(snapshot.revealed);
  if (!size || !revealedSize || size.width !== revealedSize.width || size.height !== revealedSize.height) {
    return null;
  }
  if (
    Number(snapshot.width) !== size.width ||
    Number(snapshot.height) !== size.height ||
    !isPointInside(snapshot.grid, snapshot.lastPos)
  ) {
    return null;
  }

  return clonePlainData({
    instanceId: snapshot.instanceId,
    width: size.width,
    height: size.height,
    grid: snapshot.grid,
    revealed: snapshot.revealed,
    playerPos: snapshot.lastPos,
    connectedFragments: snapshot.connectedFragments || {},
    uniqueTreasures: snapshot.uniqueTreasures || {},
    npcLocations: snapshot.npcLocations || [],
    npcEcology: snapshot.npcEcology || {},
    exitPositions: snapshot.exitPositions || [],
    generatedAt: Number(snapshot.generatedAt) || Date.now(),
  });
}

function isPointInside(grid, point) {
  return Number.isInteger(point?.x) &&
    Number.isInteger(point?.y) &&
    point.y >= 0 &&
    point.y < grid.length &&
    Array.isArray(grid[point.y]) &&
    point.x >= 0 &&
    point.x < grid[point.y].length;
}

function carveCell(grid, x, y, wallValue, emptyValue) {
  if (grid[y]?.[x] === wallValue) grid[y][x] = emptyValue;
}

export function ensureXianguExitConnectivity(
  grid,
  spawnPosition,
  exitPositions,
  { wallValue = 1, emptyValue = 0 } = {},
) {
  if (!Array.isArray(grid) || grid.length < 3 || !isPointInside(grid, spawnPosition)) return grid;
  const height = grid.length;
  const width = Math.min(...grid.map(row => Array.isArray(row) ? row.length : 0));
  if (width < 3) return grid;

  for (const exit of Array.isArray(exitPositions) ? exitPositions : []) {
    if (!isPointInside(grid, exit)) continue;

    const target = {
      x: Math.min(width - 2, Math.max(1, exit.x)),
      y: Math.min(height - 2, Math.max(1, exit.y)),
    };
    let x = spawnPosition.x;
    let y = spawnPosition.y;

    while (x !== target.x) {
      x += Math.sign(target.x - x);
      carveCell(grid, x, y, wallValue, emptyValue);
    }
    while (y !== target.y) {
      y += Math.sign(target.y - y);
      carveCell(grid, x, y, wallValue, emptyValue);
    }
  }

  return grid;
}
