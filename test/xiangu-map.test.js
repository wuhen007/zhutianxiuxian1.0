import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  DEFAULT_XIANGU_MARROW_POOL_CONFIG,
  DEFAULT_XIANGU_FRAGMENT_SIZES,
  XIANGU_MARROW_POOL_KIND,
  XIANGU_MARROW_POOL_NAME,
  calculateXianguMarrowPoolRewards,
  createXianguExitPositions,
  createXianguFragmentSnapshot,
  ensureXianguRequiredConnections,
  ensureXianguExitConnectivity,
  getRevealedXianguExits,
  getXianguMarrowPoolTrapChance,
  isXianguExitUnlocked,
  pickDifferentXianguFragment,
  placeXianguMarrowPool,
  restoreXianguFragmentSnapshot,
  resolveXianguMarrowPoolConfig,
  resolveXianguFragmentSize,
} from '../apps/SecretPlace/xianguMap.js';

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

test('12张碎片地图均不少于120格', () => {
  assert.equal(Object.keys(DEFAULT_XIANGU_FRAGMENT_SIZES).length, 12);
  for (const [fragmentId, [width, height]] of Object.entries(DEFAULT_XIANGU_FRAGMENT_SIZES)) {
    assert.ok(width * height >= 120, `${fragmentId} 少于120格`);
    assert.ok(width <= 11 && height <= 11, `${fragmentId} 超出地图模板上限`);
  }
});

test('JSON地图尺寸配置与代码默认值保持一致', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../data/xianguSecretPlace.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.地图配置.碎片尺寸, DEFAULT_XIANGU_FRAGMENT_SIZES);
});

test('地图尺寸配置始终归一化为至少120格', () => {
  const config = {
    地图配置: {
      碎片尺寸: {
        edge_camp: [10, 9],
        spirit_lake: [100, 2],
        chaos_rift: ['bad', 8],
      },
    },
  };

  assert.deepEqual(resolveXianguFragmentSize(config, 'edge_camp'), [11, 11]);
  assert.deepEqual(resolveXianguFragmentSize(config, 'spirit_lake'), [11, 11]);
  assert.deepEqual(resolveXianguFragmentSize(config, 'chaos_rift'), [11, 11]);
  assert.deepEqual(resolveXianguFragmentSize(config, 'void_rift'), [11, 11]);
});

test('神识地图模板先显示地图，再显示探索信息和图例', () => {
  const html = fs.readFileSync(new URL('../resources/html/xiangu_map/xiangu_map.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('class="map-panel"') < html.indexOf('class="info-panel"'));
  assert.match(html, /\.main-layout\s*{[^}]*flex-direction:\s*column;/s);
  assert.match(html, /class="map-stage"/);
  assert.match(html, /class="detail-grid"/);
  assert.match(html, /cell-rival/);
  assert.match(html, /class="artifact"/);
  assert.match(html, /class="scroll-paper"/);
  assert.match(html, /class="scroll-rod scroll-rod-top"/);
  assert.match(html, /img\/state\/背景图\.jpg/);
  assert.doesNotMatch(html, /💎|👣|🗺️|👁️|🔒/);
});

test('仙古地图三版审稿页共享一套地图结构', () => {
  const html = fs.readFileSync(new URL('../resources/html/xiangu_map/xiangu_map_review.html', import.meta.url), 'utf8');
  assert.match(html, /data-theme-value="tianshu"/);
  assert.match(html, /data-theme-value="xianting"/);
  assert.match(html, /data-theme-value="shanhe"/);
  assert.equal(html.match(/id="map-grid"/g)?.length, 1);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(html, /[—–]/);
});

test('方向移动使用图片回执且跨区移动必须经过已揭示出口', () => {
  const source = fs.readFileSync(new URL('../apps/SecretPlace/xianguPlace.js', import.meta.url), 'utf8');
  assert.match(source, /borderCell === CELL_TYPE\.EXIT && isXianguExitUnlocked\(map, borderCellX, borderCellY\)/);
  assert.doesNotMatch(source, /borderCell === CELL_TYPE\.EXIT \|\| borderCell === CELL_TYPE\.EXPLORED_EMPTY/);
  assert.match(source, /async replyXianguMapWithEvents\(e, eventLines = \[\]\)/);
  assert.match(source, /XIANGU_MOVEMENT_TEXT_CELL_TYPES\.has\(targetCell\)/);
  assert.match(source, /return this\.replyXianguMapWithEvents\(e, eventLines\);/);
  assert.doesNotMatch(source, /`【移动信息】`/);
  assert.match(source, /const targetExit = getRevealedXianguExits\(oldMap\)\.find/);
  assert.match(source, /player\.xiangu_world_seed = String\(weimianData\.仙古秘境开启时间/);
  assert.match(source, /createXianguSeededRandom\(`\$\{instanceId\}:grid`\)/);
  assert.match(source, /instanceId: targetFragmentState\.instanceId/);
  assert.match(source, /revealAdjacentCells\(map, playerPos, scanRange\);[\s\S]*?grantXianguExitDiscoveryDaoyun[\s\S]*?Write_player\(player_qq, player\)/);
  assert.match(source, /delivery\.status === 'fallback' && !delivery\.receipt/);
  assert.match(source, /map\.grid\[y\]\[x\] = CELL_TYPE\.TREASURE/);
  assert.match(source, /foundTreasure\.claimed = false/);
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

test('只有已经揭示的真实出口才能用于碎片移动', () => {
  const map = {
    grid: [
      [1, 5, 1, 1],
      [7, 0, 0, 5],
      [1, 0, 0, 1],
      [1, 1, 5, 1],
    ],
    revealed: [
      [false, true, false, false],
      [true, true, false, false],
      [false, false, false, false],
      [false, false, true, false],
    ],
    connectedFragments: {
      top: 'spirit_lake',
      left: 'ancient_ruins',
      right: 'true_dragon_nest',
      bottom: 'xiangu_core',
    },
    exitPositions: [{ x: 1, y: 0 }, { x: 3, y: 1 }, { x: 2, y: 3 }],
  };

  assert.deepEqual(getRevealedXianguExits(map), [
    { direction: 'top', target: 'spirit_lake', position: { x: 1, y: 0 } },
    { direction: 'bottom', target: 'xiangu_core', position: { x: 2, y: 3 } },
  ]);
  assert.equal(isXianguExitUnlocked(map, 1, 0), true);
  assert.equal(isXianguExitUnlocked(map, 3, 1), false, '未揭示出口不能通行');
  assert.equal(isXianguExitUnlocked(map, 0, 1), false, '已探索空地不能冒充出口');
});

test('碎片连接池不会选中当前碎片形成自环', () => {
  assert.equal(
    pickDifferentXianguFragment('xiangu_core', ['xiangu_core', 'flame_abyss'], () => 0),
    'flame_abyss',
  );
  assert.equal(pickDifferentXianguFragment('xiangu_core', ['xiangu_core']), null);
});

test('旧边缘碎片重复返程出口会补成唯一推进路线', () => {
  const legacyConnections = {
    top: null,
    bottom: 'edge_camp',
    left: 'void_rift',
    right: 'edge_camp',
  };
  const repaired = ensureXianguRequiredConnections(
    'spirit_lake',
    legacyConnections,
    ['edge_camp', 'ancient_ruins'],
    () => 0,
  );

  assert.deepEqual(repaired, {
    top: 'ancient_ruins',
    bottom: 'edge_camp',
    left: 'void_rift',
    right: null,
  });
  assert.deepEqual(legacyConnections, {
    top: null,
    bottom: 'edge_camp',
    left: 'void_rift',
    right: 'edge_camp',
  }, '纯函数不应改写旧存档连接');
  assert.deepEqual(
    ensureXianguRequiredConnections('spirit_lake', repaired, ['edge_camp', 'ancient_ruins'], () => 0.9),
    repaired,
    '已修复的连接应保持幂等',
  );
});

test('必需连接在无空方向时只替换重复目标', () => {
  const repaired = ensureXianguRequiredConnections('spirit_lake', {
    top: 'edge_camp',
    bottom: 'edge_camp',
    left: 'void_rift',
    right: 'xiangu_core',
  }, ['ancient_ruins'], () => 0);

  assert.deepEqual(new Set(Object.values(repaired).filter(Boolean)), new Set([
    'ancient_ruins',
    'edge_camp',
    'void_rift',
    'xiangu_core',
  ]));
});

test('必需连接会清理自环并忽略当前碎片目标', () => {
  const repaired = ensureXianguRequiredConnections('spirit_lake', {
    top: 'spirit_lake',
    bottom: 'edge_camp',
    left: 'edge_camp',
    right: null,
  }, ['spirit_lake', 'ancient_ruins'], () => 0);
  const targets = Object.values(repaired).filter(Boolean);

  assert.ok(targets.includes('ancient_ruins'));
  assert.ok(!targets.includes('spirit_lake'));
  assert.equal(new Set(targets).size, targets.length);
});

test('返程方向受保护时不会被主线修复替换', () => {
  const repaired = ensureXianguRequiredConnections('ancient_ruins', {
    top: 'spirit_lake',
    bottom: 'dark_prison',
    left: null,
    right: 'dark_prison',
  }, ['dark_prison', 'xiangu_core'], () => 0, 'top');

  assert.equal(repaired.top, 'spirit_lake');
  assert.ok(Object.values(repaired).includes('xiangu_core'));
  assert.equal(new Set(Object.values(repaired).filter(Boolean)).size,
    Object.values(repaired).filter(Boolean).length);
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
    instanceId: 'run-1',
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

  assert.equal(snapshot.instanceId, 'run-1');
  assert.equal(restored.instanceId, 'run-1');
  assert.equal(restored.uniqueTreasures['玉石匣·仙王经文'].claimed, true);
  assert.deepEqual(restored.playerPos, { x: 1, y: 0 });
  assert.deepEqual(restored.connectedFragments, { top: 'spirit_lake' });
  restored.grid[1][1] = 7;
  assert.equal(snapshot.grid[1][1], 0, '恢复后的当前地图不应反向修改历史快照');
  assert.equal(restoreXianguFragmentSnapshot({ grid: map.grid }, 'xiangu_core'), null);
});

test('marrow pool config uses defaults and normalizes overrides', () => {
  assert.deepEqual(resolveXianguMarrowPoolConfig(), DEFAULT_XIANGU_MARROW_POOL_CONFIG);
  assert.deepEqual(resolveXianguMarrowPoolConfig({
    万道仙髓池: {
      探索概率: 2,
      NPC邀请概率: -1,
      仙道潜力: 75.9,
      修血倍率: 6,
    },
  }), {
    exploreChance: 1,
    npcInviteChance: 0,
    potentialGain: 75,
    rewardMultiplier: 6,
    worldUnique: false,
  });
  assert.deepEqual(resolveXianguMarrowPoolConfig({
    marrowPool: {
      exploreChance: 'bad',
      npcInviteChance: 0.25,
      potentialGain: -10,
      rewardMultiplier: '',
      worldUnique: 'true',
    },
  }), {
    exploreChance: 0.03,
    npcInviteChance: 0.25,
    potentialGain: 0,
    rewardMultiplier: 5,
    worldUnique: true,
  });
});

test('marrow pool trap chance follows NPC hostility and relation precedence', () => {
  assert.equal(getXianguMarrowPoolTrapChance({ hostile: true, personality: 'friendly' }, -100), 0.75);
  assert.equal(getXianguMarrowPoolTrapChance({ personality: 'hostile', faction: 'good' }, -100), 0.75);
  assert.equal(getXianguMarrowPoolTrapChance({ personality: 'scheming', faction: 'good' }, -100), 0.6);
  assert.equal(getXianguMarrowPoolTrapChance({ personality: 'friendly', faction: 'good' }, -1), 0.4);
  assert.equal(getXianguMarrowPoolTrapChance({ personality: 'friendly' }, 0), 0);
  assert.equal(getXianguMarrowPoolTrapChance({ faction: 'good' }, 0), 0);
  assert.equal(getXianguMarrowPoolTrapChance({ faction: 'neutral' }, -Number.EPSILON), 0.4);
  assert.equal(getXianguMarrowPoolTrapChance({ faction: 'neutral' }, 0), 0.1);
});

test('marrow pool rewards use the treasure formula then multiply the whole result by five', () => {
  const rolls = [0, 0.5];
  const rewards = calculateXianguMarrowPoolRewards({
    level_id: 2,
    Physique_id: 3,
    mijinglevel_id: 4,
    xiangulevel_id: 5,
  }, {
    random: () => rolls.shift(),
  });

  assert.deepEqual(rewards, {
    xiuwei: 8_010_000,
    xueqi: 22_510_000,
  });
});

test('marrow pool placement reuses unique treasure cells and allows only one per fragment', () => {
  const map = {
    fragmentId: 'edge_camp',
    grid: [
      [1, 1, 1, 1, 1],
      [1, 0, 2, 0, 1],
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
      [1, 1, 1, 1, 1],
    ],
    revealed: Array.from({ length: 5 }, () => Array(5).fill(false)),
    playerPos: { x: 2, y: 2 },
    uniqueTreasures: {},
  };

  const placed = placeXianguMarrowPool(map, {
    reveal: true,
    metadata: { invitedBy: 'npc-1', isTrap: true },
    random: () => 0,
  });

  assert.equal(placed.placed, true);
  assert.equal(placed.key, `${XIANGU_MARROW_POOL_NAME}@1,1`);
  assert.deepEqual(placed.position, { x: 1, y: 1 });
  assert.equal(map.grid[1][1], 8);
  assert.equal(map.revealed[1][1], true);
  assert.equal(placed.treasure.kind, XIANGU_MARROW_POOL_KIND);
  assert.equal(placed.treasure.name, XIANGU_MARROW_POOL_NAME);
  assert.equal(placed.treasure.invitedBy, 'npc-1');
  assert.equal(placed.treasure.isTrap, true);
  assert.equal(placed.treasure.claimed, false);

  const gridAfterFirstPlacement = structuredClone(map.grid);
  const duplicate = placeXianguMarrowPool(map, { random: () => 0.99 });
  assert.equal(duplicate.placed, false);
  assert.equal(duplicate.reason, 'exists');
  assert.deepEqual(map.grid, gridAfterFirstPlacement);
  assert.equal(Object.keys(map.uniqueTreasures).length, 1);
});

test('marrow pool placement reports when no internal empty cell is available', () => {
  const map = {
    grid: Array.from({ length: 4 }, () => Array(4).fill(1)),
    revealed: Array.from({ length: 4 }, () => Array(4).fill(false)),
    uniqueTreasures: {},
  };

  assert.deepEqual(placeXianguMarrowPool(map), {
    placed: false,
    reason: 'no_empty_cell',
  });
});
