import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceXianguNpcState,
  bindXianguNpcLocations,
  getBoundXianguNpc,
  removeBoundXianguNpc,
  strengthenXianguNpc,
  XIANGU_NPC_POWER_CONFIG,
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
  assert.deepEqual(action.npc.inventory, [{ name: '源石', 源石: 1, 数量: 1 }]);

  removeBoundXianguNpc(map, 'looter');
  assert.equal(map.grid[1][2], 7);
  const restored = restoreXianguFragmentSnapshot(createXianguFragmentSnapshot(map), 'edge_camp');
  assert.equal(getBoundXianguNpc(restored, 2, 1), null, '死亡NPC不应随地图快照恢复');
  assert.equal(advanceXianguNpcState(map, { xiangu_npc_relations: {} }, { force: true }).type, 'idle');
});

test('本局已击败NPC不会再次绑定到新地图格子', () => {
  const map = createMap();
  bindXianguNpcLocations(map, [
    { id: 'dead_tianjiao', name: '已败天骄' },
    { id: 'living_tianjiao', name: '尚存天骄' },
  ], {
    random: () => 0,
    excludedIds: ['dead_tianjiao'],
  });

  assert.equal(getBoundXianguNpc(map, 1, 1).npc.id, 'living_tianjiao');
});

test('恢复旧碎片时会清除死亡名单中的既有NPC', () => {
  const map = createMap();
  map.npcLocations[0] = {
    ...map.npcLocations[0],
    npcId: 'dead-one',
    npc: { id: 'dead-one', name: '已陨修士', isAlive: true },
    underCell: 0,
  };

  bindXianguNpcLocations(map, [], { excludedIds: ['dead-one'] });

  assert.equal(map.npcLocations.length, 0);
  assert.equal(map.grid[1][1], 0);
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

test('hunt_player目标会无视友善性格与高好感主动追猎玩家', () => {
  const map = createMap({ playerPos: { x: 3, y: 1 } });
  bindXianguNpcLocations(map, [{
    id: 'canon_hunter',
    name: '古代怪胎',
    personality: 'friendly',
    xianguGoal: { action: 'hunt_player' },
  }], { random: () => 0 });

  const action = advanceXianguNpcState(map, {
    xiangu_npc_relations: { canon_hunter: 999 },
  }, { force: true, now: 100, random: () => 0 });

  assert.equal(action.type, 'hunt');
  assert.deepEqual(action.to, { x: 2, y: 1 });
});

test('seek_item目标会在宝物格优先搜寻非唯一目标材料', () => {
  const map = createMap({ treasure: { x: 2, y: 1 } });
  bindXianguNpcLocations(map, [{
    id: 'canon_seeker',
    name: '寻宝天骄',
    xianguGoal: { action: 'seek_item', item: '真凰翎羽' },
  }], { random: () => 0 });

  const action = advanceXianguNpcState(map, { xiangu_npc_relations: {} }, {
    force: true,
    now: 100,
    random: () => 0,
  });

  assert.deepEqual(action.item, { name: '真凰翎羽', 数量: 1 });
});

test('seek_item目标不会从普通宝物格生成大罗剑胎等世界唯一物', () => {
  const map = createMap({ treasure: { x: 2, y: 1 } });
  bindXianguNpcLocations(map, [{
    id: 'unique_seeker',
    name: '孤剑云',
    xianguGoal: { action: 'seek_item', item: '大罗剑胎' },
  }], { random: () => 0 });

  const action = advanceXianguNpcState(map, { xiangu_npc_relations: {} }, {
    force: true,
    now: 100,
    random: () => 0,
  });

  assert.equal(action.item.name, '源石');
  assert.notEqual(action.item.name, '大罗剑胎');
});

const npcRealms = {
  cultivation: [
    { level_id: 1, level: '练气初境', 基础攻击: 1, 基础防御: 2, 基础血量: 3, 基础暴击: 0.1 },
    { level_id: 4, level: '练气满境', 基础攻击: 100, 基础防御: 200, 基础血量: 300, 基础暴击: 0.8 },
  ],
  physique: [
    { level_id: 2, level: '炼体初境', 基础攻击: 4, 基础防御: 5, 基础血量: 6, 基础暴击: 0.1 },
    { level_id: 5, level: '炼体满境', 基础攻击: 40, 基础防御: 50, 基础血量: 60, 基础暴击: 0.4 },
  ],
  secret: [
    { level_id: 1, level: '秘境一层', 基础攻击: 10, 基础防御: 20, 基础血量: 30 },
  ],
  ancient: [
    { level_id: 7, level: '尊者境', 基础攻击: 7, 基础防御: 8, 基础血量: 9 },
    { level_id: 8, level: '神火境', 基础攻击: 17, 基础防御: 18, 基础血量: 19 },
    { level_id: 9, level: '真一境', 基础攻击: 27, 基础防御: 28, 基础血量: 29 },
  ],
};

test('仙古NPC统一为练气炼体满级、秘境一层并按下限倍率结算', () => {
  const npc = strengthenXianguNpc({ id: 'minimum' }, npcRealms, { random: () => 0 });
  const extra = XIANGU_NPC_POWER_CONFIG.minExtraAttribute;

  assert.equal(npc.level_id, 4);
  assert.equal(npc.Physique_id, 5);
  assert.equal(npc.mijinglevel_id, 1);
  assert.equal(npc.xiangulevel_id, 7);
  assert.equal(npc.境界, '尊者境');
  assert.equal(npc.额外属性加成, extra);
  assert.equal(npc.装备倍率, 30);
  assert.equal(npc.帝兵倍率, 50);
  assert.equal(npc.攻击, (100 + 40 + 10 + 7 + extra) * 30 + (10 + 7) * 50);
  assert.equal(npc.防御, (200 + 50 + 20 + 8 + extra) * 30 + (20 + 8) * 50);
  assert.equal(npc.血量上限, (300 + 60 + 30 + 9 + extra) * 30 + (30 + 9) * 50);
  assert.equal(npc.当前血量, npc.血量上限);
  assert.ok(Math.abs(npc.暴击率 - 1.2) < Number.EPSILON * 2);
});

test('仙古NPC随机属性能取到上限，旧原著等级会限制在七至九级', () => {
  const maximum = strengthenXianguNpc({ id: 'maximum' }, npcRealms, { random: () => 1 });
  const legacy = strengthenXianguNpc({ id: 'legacy', level_id: 11 }, npcRealms, { random: () => 0 });

  assert.equal(maximum.xiangulevel_id, 9);
  assert.equal(maximum.额外属性加成, XIANGU_NPC_POWER_CONFIG.maxExtraAttribute);
  assert.equal(legacy.xiangulevel_id, 9);
  assert.equal(legacy.level_id, 4);
});

test('已强化NPC重复读取不会重掷仙古等级和额外属性', () => {
  const first = strengthenXianguNpc({ id: 'stable' }, npcRealms, { random: () => 0 });
  const second = strengthenXianguNpc(first, npcRealms, {
    random: () => { throw new Error('不应重新随机'); },
  });

  assert.equal(second.xiangulevel_id, first.xiangulevel_id);
  assert.equal(second.仙古额外全属性, first.仙古额外全属性);
  assert.equal(second.攻击, first.攻击);
  assert.equal(second.防御, first.防御);
  assert.equal(second.血量上限, first.血量上限);
});
