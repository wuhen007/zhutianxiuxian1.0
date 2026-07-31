import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  DEFAULT_XIANGU_FRAGMENT_SIZES,
  createXianguExitPositions,
  createXianguFragmentSnapshot,
  ensureXianguExitConnectivity,
  pickDifferentXianguFragment,
  restoreXianguFragmentSnapshot,
  resolveXianguFragmentSize,
} from '../apps/SecretPlace/xianguMap.js';

const LEGACY_SIZES = {
  edge_camp: [6, 6],
  spirit_lake: [6, 5],
  ancient_ruins: [7, 6],
  true_dragon_nest: [6, 6],
  chaos_rift: [5, 4],
  dark_prison: [5, 5],
  immortal_podium: [7, 5],
  bone_forest: [6, 6],
  flame_abyss: [6, 6],
  xiangu_core: [5, 5],
  chaos_mosquito: [5, 4],
  void_rift: [4, 4],
};

function reachableCells(grid, start, wallValue = 1) {
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  while (queue.length > 0) {
    const current = queue.shift();
    for (const [dx, dy] of directions) {
      const x = current.x + dx;
      const y = current.y + dy;
      const key = `${x},${y}`;
      if (seen.has(key) || !grid[y] || grid[y][x] === undefined || grid[y][x] === wallValue) continue;
      seen.add(key);
      queue.push({ x, y });
    }
  }

  return seen;
}

test('12张碎片地图的长宽均比旧版增加1格', () => {
  assert.deepEqual(Object.keys(DEFAULT_XIANGU_FRAGMENT_SIZES).sort(), Object.keys(LEGACY_SIZES).sort());
  for (const [fragmentId, legacySize] of Object.entries(LEGACY_SIZES)) {
    const currentSize = DEFAULT_XIANGU_FRAGMENT_SIZES[fragmentId];
    assert.deepEqual(currentSize, [legacySize[0] + 1, legacySize[1] + 1], fragmentId);
    assert.ok(currentSize[0] <= 11 && currentSize[1] <= 11, `${fragmentId} 超出地图模板上限`);
  }
});

test('JSON地图尺寸配置与代码默认值保持一致', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../data/xianguSecretPlace.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.地图配置.碎片尺寸, DEFAULT_XIANGU_FRAGMENT_SIZES);
});

test('地图尺寸支持配置覆盖并限制在模板可渲染范围内', () => {
  const config = {
    地图配置: {
      碎片尺寸: {
        edge_camp: [10, 9],
        spirit_lake: [100, 2],
        chaos_rift: ['bad', 8],
      },
    },
  };

  assert.deepEqual(resolveXianguFragmentSize(config, 'edge_camp'), [10, 9]);
  assert.deepEqual(resolveXianguFragmentSize(config, 'spirit_lake'), [11, 4]);
  assert.deepEqual(resolveXianguFragmentSize(config, 'chaos_rift'), [6, 8]);
  assert.deepEqual(resolveXianguFragmentSize(config, 'void_rift'), [5, 5]);
});

test('只在实际连接方向生成对应边界出口', () => {
  const exits = createXianguExitPositions(8, 7, {
    top: 'ancient_ruins',
    bottom: null,
    left: 'spirit_lake',
    right: 'true_dragon_nest',
  }, () => 0.5);

  assert.deepEqual(exits, [
    { x: 4, y: 0 },
    { x: 0, y: 3 },
    { x: 7, y: 3 },
  ]);
});

test('碎片连接池不会选中当前碎片形成自环', () => {
  assert.equal(
    pickDifferentXianguFragment('xiangu_core', ['xiangu_core', 'flame_abyss'], () => 0),
    'flame_abyss',
  );
  assert.equal(pickDifferentXianguFragment('xiangu_core', ['xiangu_core']), null);
});

test('随机墙体隔断时会打通出生点到所有出口的道路', () => {
  const wall = 1;
  const exit = 5;
  const grid = Array.from({ length: 7 }, () => Array(8).fill(wall));
  const spawn = { x: 3, y: 3 };
  const exits = [{ x: 0, y: 2 }, { x: 7, y: 5 }, { x: 4, y: 0 }];
  grid[spawn.y][spawn.x] = 0;
  for (const point of exits) grid[point.y][point.x] = exit;

  ensureXianguExitConnectivity(grid, spawn, exits, { wallValue: wall, emptyValue: 0 });
  const reachable = reachableCells(grid, spawn, wall);

  for (const point of exits) {
    assert.ok(reachable.has(`${point.x},${point.y}`), `出口 ${point.x},${point.y} 不可达`);
    assert.equal(grid[point.y][point.x], exit, '打通道路时不应覆盖出口');
  }
});

test('返程快照完整恢复地图进度和唯一机缘领取状态', () => {
  const map = {
    fragmentId: 'xiangu_core',
    width: 4,
    height: 4,
    grid: [
      [1, 5, 1, 1],
      [1, 0, 8, 1],
      [1, 0, 0, 1],
      [1, 1, 1, 1],
    ],
    revealed: [
      [false, true, false, false],
      [false, true, true, false],
      [false, true, false, false],
      [false, false, false, false],
    ],
    playerPos: { x: 1, y: 0 },
    connectedFragments: { top: 'spirit_lake' },
    uniqueTreasures: {
      '玉石匣·仙王经文': { pos: { x: 2, y: 1 }, claimed: true },
    },
    npcLocations: [{ x: 1, y: 2 }],
    exitPositions: [{ x: 1, y: 0 }],
    generatedAt: 12345,
  };

  const snapshot = createXianguFragmentSnapshot(map);
  const restored = restoreXianguFragmentSnapshot(snapshot, 'xiangu_core');

  assert.equal(restored.uniqueTreasures['玉石匣·仙王经文'].claimed, true);
  assert.deepEqual(restored.playerPos, { x: 1, y: 0 });
  assert.deepEqual(restored.connectedFragments, { top: 'spirit_lake' });
  restored.grid[1][1] = 7;
  assert.equal(snapshot.grid[1][1], 0, '恢复后的当前地图不应反向修改历史快照');
  assert.equal(restoreXianguFragmentSnapshot({ grid: map.grid }, 'xiangu_core'), null);
});
