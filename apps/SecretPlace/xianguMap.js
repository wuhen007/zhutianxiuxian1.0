export const DEFAULT_XIANGU_FRAGMENT_SIZES = Object.freeze({
  edge_camp: Object.freeze([7, 7]),
  spirit_lake: Object.freeze([7, 6]),
  ancient_ruins: Object.freeze([8, 7]),
  true_dragon_nest: Object.freeze([7, 7]),
  chaos_rift: Object.freeze([6, 5]),
  dark_prison: Object.freeze([6, 6]),
  immortal_podium: Object.freeze([8, 6]),
  bone_forest: Object.freeze([7, 7]),
  flame_abyss: Object.freeze([7, 7]),
  xiangu_core: Object.freeze([6, 6]),
  chaos_mosquito: Object.freeze([6, 5]),
  void_rift: Object.freeze([5, 5]),
});

const MIN_FRAGMENT_SIDE = 4;
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

export function resolveXianguFragmentSize(config = {}, fragmentId, fallback = [6, 6]) {
  const mapConfig = config?.地图配置 || config?.mapConfig || config;
  const configuredSizes = mapConfig?.碎片尺寸 || mapConfig?.fragmentSizes || {};
  const defaultSize = DEFAULT_XIANGU_FRAGMENT_SIZES[fragmentId] || normalizeSize(fallback, [6, 6]);
  return normalizeSize(configuredSizes[fragmentId], defaultSize);
}

function randomIndex(length, random) {
  const value = Number(typeof random === 'function' ? random() : Math.random());
  const bounded = Number.isFinite(value) ? Math.min(1 - Number.EPSILON, Math.max(0, value)) : 0;
  return Math.floor(bounded * length);
}

export function pickDifferentXianguFragment(currentFragmentId, candidates, random = Math.random) {
  const available = [...new Set(Array.isArray(candidates) ? candidates : [])]
    .filter(fragmentId => fragmentId && String(fragmentId) !== String(currentFragmentId));
  return available.length > 0 ? available[randomIndex(available.length, random)] : null;
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
    width: size.width,
    height: size.height,
    grid: map.grid,
    revealed: map.revealed,
    lastPos: map.playerPos,
    connectedFragments: map.connectedFragments || {},
    uniqueTreasures: map.uniqueTreasures || {},
    npcLocations: map.npcLocations || [],
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
    width: size.width,
    height: size.height,
    grid: snapshot.grid,
    revealed: snapshot.revealed,
    playerPos: snapshot.lastPos,
    connectedFragments: snapshot.connectedFragments || {},
    uniqueTreasures: snapshot.uniqueTreasures || {},
    npcLocations: snapshot.npcLocations || [],
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
