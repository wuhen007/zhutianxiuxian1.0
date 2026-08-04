import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceXianguNpcState,
  bindXianguNpcLocations,
  getBoundXianguNpc,
  removeBoundXianguNpc,
} from '../apps/SecretPlace/xianguNpc.js';
import {
  createXianguFragmentSnapshot,
  restoreXianguFragmentSnapshot,
} from '../apps/SecretPlace/xianguMap.js';

function createMap({ playerPos = { x: 3, y: 3 }, npc = { x: 1, y: 1 }, treasure = null } = {}) {
  const grid = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ];
  grid[npc.y][npc.x] = 4;
  if (treasure) grid[treasure.y][treasure.x] = 2;
  return {
    fragmentId: 'edge_camp',
    width: 5,
    height: 5,
    grid,
    revealed: Array.from({ length: 5 }, () => Array(5).fill(false)),
    playerPos,
    connectedFragments: {},
    uniqueTreasures: {},
    npcLocations: [{ ...npc }],
    npcEcology: {},
    exitPositions: [],
    generatedAt: 1,
  };
}

test('NPC格绑定稳定身份并随碎片快照恢复', () => {
  const map = createMap();
  bindXianguNpcLocations(map, [{ id: 'npc_stable', name: '稳定修士', inventory: [{ name: '仙古矿材' }] }], {
    random: () => 0,
  });
  bindXianguNpcLocations(map, [{ id: 'npc_other', name: '另一修士' }], { random: () => 0 });

  assert.equal(getBoundXianguNpc(map, 1, 1).npc.id, 'npc_stable');
  const restored = restoreXianguFragmentSnapshot(createXianguFragmentSnapshot(map), 'edge_camp');
  assert.equal(getBoundXianguNpc(restored, 1, 1).npc.id, 'npc_stable');
  assert.deepEqual(getBoundXianguNpc(restored, 1, 1).npc.inventory, [{ name: '仙古矿材' }]);
});

test('NPC搜刮真实宝物格，战败后可留下已搜刮空地', () => {
  const map = createMap({ treasure: { x: 2, y: 1 } });
  bindXianguNpcLocations(map, [{ id: 'looter', name: '寻宝修士', personality: 'neutral' }], {
    random: () => 0,
  });

  const action = advanceXianguNpcState(map, { xiangu_npc_relations: {} }, {
    force: true,
    now: 100,
    random: () => 0,
  });

  assert.equal(action.type, 'loot');
  assert.deepEqual(action.to, { x: 2, y: 1 });
  assert.equal(map.grid[1][1], 0);
  assert.equal(map.grid[1][2], 4);
  assert.deepEqual(action.npc.inventory, [{ name: '灵石', 灵石: 1000, 数量: 1 }]);

  removeBoundXianguNpc(map, 'looter');
  assert.equal(map.grid[1][2], 7);
  assert.equal(advanceXianguNpcState(map, { xiangu_npc_relations: {} }, { force: true }).type, 'idle');
});

test('友善NPC会主动结交并提供真实机缘坐标', () => {
  const map = createMap({ playerPos: { x: 1, y: 1 }, treasure: { x: 3, y: 1 } });
  bindXianguNpcLocations(map, [{ id: 'friend', name: '善意修士', personality: 'friendly' }], {
    random: () => 0,
  });
  const player = { xiangu_npc_relations: {} };

  const action = advanceXianguNpcState(map, player, { force: true, now: 100, random: () => 0 });

  assert.equal(action.type, 'befriend');
  assert.equal(player.xiangu_npc_relations.friend, 10);
  assert.deepEqual(action.clue, { x: 3, y: 1 });
  assert.equal(map.revealed[1][3], true);
});

test('善谋NPC会以结交为名发动骗局', () => {
  const map = createMap({ playerPos: { x: 1, y: 1 } });
  bindXianguNpcLocations(map, [{ id: 'schemer', name: '善谋修士', personality: 'scheming' }], {
    random: () => 0,
  });
  const player = { xiangu_npc_relations: {} };

  const action = advanceXianguNpcState(map, player, { force: true, now: 100, random: () => 0 });

  assert.equal(action.type, 'fraud');
  assert.equal(action.npcId, 'schemer');
  assert.equal(player.xiangu_npc_relations.schemer, -10);
});

test('敌对NPC会向玩家移动并在相邻时触发追猎', () => {
  const map = createMap({ playerPos: { x: 3, y: 1 } });
  bindXianguNpcLocations(map, [{ id: 'hunter', name: '追猎者', personality: 'hostile', hostile: true }], {
    random: () => 0,
  });

  const action = advanceXianguNpcState(map, { xiangu_npc_relations: {} }, {
    force: true,
    now: 100,
    random: () => 0,
  });

  assert.equal(action.type, 'hunt');
  assert.deepEqual(action.from, { x: 1, y: 1 });
  assert.deepEqual(action.to, { x: 2, y: 1 });
  assert.equal(map.grid[1][1], 0);
  assert.equal(map.grid[1][2], 4);
});
