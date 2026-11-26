import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OTHER_SHORE_TRUE_WORLD_RADIUS,
  OTHER_SHORE_TRUE_WORLD_SECTOR_COUNT,
  applyOtherShoreTrueWorldBattle,
  claimOtherShoreTrueWorldLoot,
  ensureOtherShoreTrueWorldState,
  exploreOtherShoreTrueWorld,
  getOtherShoreTrueWorldEnemyProfile,
  getOtherShoreTrueWorldSector,
  moveOtherShoreTrueWorld,
  observeOtherShoreTrueWorld,
  serializeOtherShoreTrueWorld,
  startOtherShoreTrueWorldEncounter,
} from '../model/otherShoreTrueWorld.js';

function preparePlayer(world, playerId, coordinate = '0,0') {
  observeOtherShoreTrueWorld(world, {
    playerId,
    coordinate: '0,0',
    range: 1,
    operationId: `${playerId}-observe`,
    now: 1,
  });
  if (coordinate !== '0,0') {
    const [q, r] = coordinate.split(',').map(Number);
    const path = ['0,0'];
    let currentQ = 0;
    let currentR = 0;
    while (currentQ !== q) {
      currentQ += Math.sign(q - currentQ);
      path.push(`${currentQ},${currentR}`);
    }
    while (currentR !== r) {
      currentR += Math.sign(r - currentR);
      path.push(`${currentQ},${currentR}`);
    }
    moveOtherShoreTrueWorld(world, {
      playerId,
      from: '0,0',
      to: coordinate,
      path,
      realm: '真仙',
      mindAvailable: 100,
      operationId: `${playerId}-move-${coordinate}`,
      now: 2,
    });
  }
}

test('真世界使用大半径程序化扇区，初始化只物化入口', () => {
  const world = { seed: 'true-world-size' };
  const state = ensureOtherShoreTrueWorldState(world);
  assert.equal(OTHER_SHORE_TRUE_WORLD_RADIUS, 48);
  assert.equal(OTHER_SHORE_TRUE_WORLD_SECTOR_COUNT, 7057);
  assert.equal(state.radius, OTHER_SHORE_TRUE_WORLD_RADIUS);
  assert.equal(Object.keys(state.sectors).length, 1);
  assert.equal(state.sectors['0,0'].status, 'explored');
  assert.equal(state.global.exploredCount, 1);
});

test('观测是全服共享的，序列化只返回当前邻域而保留浩大规模摘要', () => {
  const world = { seed: 'true-world-observe' };
  const first = observeOtherShoreTrueWorld(world, {
    playerId: 'alice',
    coordinate: '0,0',
    range: 2,
    operationId: 'observe-alice',
    now: 10,
  });
  assert.equal(first.revealed.length, 18);
  const second = serializeOtherShoreTrueWorld(world, { viewerId: 'bob', center: '0,0', radius: 2 });
  assert.equal(second.sectorCount, 7057);
  assert.equal(second.global.observedCount, 19);
  assert.ok(second.sectors.every((sector) => sector.status !== 'unseen'));
  assert.equal(second.viewer.currentSector.id, '0,0');
  assert.equal(second.viewer.canObserve, true);
  assert.equal(second.viewer.canMove, true);
});

test('未探索扇区移动按彼岸境界消耗心神并保留路程余数', () => {
  const world = { seed: 'true-world-travel' };
  preparePlayer(world, 'traveler', '0,0');
  const low = moveOtherShoreTrueWorld(world, {
    playerId: 'traveler',
    from: '0,0',
    to: '1,0',
    realm: '筑基',
    mindAvailable: 5,
    operationId: 'move-low',
    now: 20,
  });
  assert.equal(low.mindCost, 5);
  assert.equal(low.mindRemainder, 0);

  const world2 = { seed: 'true-world-travel-immortal' };
  preparePlayer(world2, 'immortal', '0,0');
  const first = moveOtherShoreTrueWorld(world2, {
    playerId: 'immortal',
    from: '0,0',
    path: ['0,0', '1,0', '2,0'],
    realm: '真仙',
    mindAvailable: 1,
    operationId: 'move-immortal',
    now: 20,
  });
  assert.equal(first.mindCost, 1);
  assert.equal(first.mindRemainder, 0);
});

test('全服贡献合并推进扇区，完成后才开放敌群', () => {
  const world = { seed: 'true-world-explore' };
  preparePlayer(world, 'alice', '1,0');
  preparePlayer(world, 'bob', '0,0');
  moveOtherShoreTrueWorld(world, {
    playerId: 'bob',
    from: '0,0',
    to: '1,0',
    realm: '仙王',
    mindAvailable: 1,
    operationId: 'bob-move-1,0',
    now: 3,
  });
  const required = getOtherShoreTrueWorldSector(world, '1,0').progressRequired;
  const half = exploreOtherShoreTrueWorld(world, {
    playerId: 'alice',
    coordinate: '1,0',
    amount: Math.floor(required / 2),
    operationId: 'alice-explore-half',
    now: 30,
  });
  assert.equal(half.newlyExplored, false);
  const done = exploreOtherShoreTrueWorld(world, {
    playerId: 'bob',
    coordinate: '1,0',
    amount: required,
    operationId: 'bob-explore-rest',
    now: 31,
  });
  assert.equal(done.newlyExplored, true);
  assert.equal(done.sector.status, 'explored');
  assert.equal(serializeOtherShoreTrueWorld(world).global.exploredCount, 2);
  assert.throws(() => startOtherShoreTrueWorldEncounter(world, {
    playerId: 'alice',
    coordinate: '0,1',
    operationId: 'blocked-encounter',
  }), /当前修士不在目标/);
});

test('准仙帝灾厄变异体击败后生成纪元积累与待领取战利品', () => {
  const world = { seed: 'true-world-quasi' };
  let candidate = null;
  for (let q = -8; q <= 8 && !candidate; q++) {
    for (let r = -8; r <= 8 && !candidate; r++) {
      if (Math.abs(q + r) > 8 || (q === 0 && r === 0)) continue;
      const coordinate = `${q},${r}`;
      const profile = getOtherShoreTrueWorldEnemyProfile(world, {
        coordinate,
        wave: 1,
        playerId: 'hero',
        realm: '准仙帝',
      });
      if (profile.tier === 'quasi_immortal_emperor') candidate = coordinate;
    }
  }
  assert.ok(candidate, '测试种子应能生成准仙帝敌群');
  const world2 = { seed: 'true-world-quasi' };
  preparePlayer(world2, 'hero', candidate);
  const required = getOtherShoreTrueWorldSector(world2, candidate).progressRequired;
  exploreOtherShoreTrueWorld(world2, {
    playerId: 'hero',
    coordinate: candidate,
    amount: required,
    operationId: 'hero-explore',
    now: 10,
  });
  const started = startOtherShoreTrueWorldEncounter(world2, {
    playerId: 'hero',
    coordinate: candidate,
    realm: '准仙帝',
    operationId: 'hero-encounter',
    now: 11,
  });
  assert.equal(started.encounter.tier, 'quasi_immortal_emperor');
  assert.equal(started.encounter.sameRealmMutant, true);
  const battle = applyOtherShoreTrueWorldBattle(world2, {
    playerId: 'hero',
    coordinate: candidate,
    encounterId: started.encounter.encounterId,
    won: true,
    operationId: 'hero-battle',
    now: 12,
  });
  assert.equal(battle.defeated, true);
  assert.equal(battle.globalEraAccumulation, 1);
  assert.equal(battle.rewards.length, 1);
  const serialized = serializeOtherShoreTrueWorld(world2, { viewerId: 'hero', center: candidate });
  assert.equal(serialized.viewer.canClaim, true);
  const claimId = serialized.viewer.pendingClaims[0].claimId;
  const claimed = claimOtherShoreTrueWorldLoot(world2, {
    playerId: 'hero',
    claimId,
    operationId: 'hero-claim',
    now: 13,
  });
  assert.equal(claimed.claimed, true);
  assert.equal(claimed.eraAccumulation, 1);
  assert.ok(claimed.materials['era-dao-marrow'] >= 1);
  const replay = claimOtherShoreTrueWorldLoot(world2, {
    playerId: 'hero',
    claimId,
    operationId: 'hero-claim',
    now: 14,
  });
  assert.deepEqual(replay, claimed);
  assert.equal(serializeOtherShoreTrueWorld(world2, { viewerId: 'hero' }).viewer.canClaim, false);
});

test('同一 operationId 跨玩家或跨行动会被拒绝，战斗结果本身可幂等重放', () => {
  const world = { seed: 'true-world-receipt' };
  const first = observeOtherShoreTrueWorld(world, {
    playerId: 'alice',
    coordinate: '0,0',
    range: 1,
    operationId: 'shared-op',
  });
  assert.deepEqual(
    observeOtherShoreTrueWorld(world, {
      playerId: 'alice',
      coordinate: '0,0',
      range: 1,
      operationId: 'shared-op',
    }),
    first,
  );
  assert.throws(() => observeOtherShoreTrueWorld(world, {
    playerId: 'bob',
    coordinate: '0,0',
    range: 1,
    operationId: 'shared-op',
  }), /operationId/);
});

test('真世界动作回执在玩家移动后仍可按 operationId 重放', () => {
  const world = { seed: 'true-world-replay-after-move' };
  preparePlayer(world, 'traveler', '0,0');
  const first = moveOtherShoreTrueWorld(world, {
    playerId: 'traveler',
    from: '0,0',
    to: '1,0',
    path: ['0,0', '1,0'],
    realm: '真仙',
    mindAvailable: 10,
    operationId: 'traveler-move-first',
    now: 20,
  });
  moveOtherShoreTrueWorld(world, {
    playerId: 'traveler',
    from: '1,0',
    to: '2,0',
    path: ['1,0', '2,0'],
    realm: '真仙',
    mindAvailable: 10,
    operationId: 'traveler-move-second',
    now: 21,
  });
  const replay = moveOtherShoreTrueWorld(world, {
    playerId: 'traveler',
    from: '0,0',
    to: '1,0',
    path: ['0,0', '1,0'],
    realm: '真仙',
    mindAvailable: 10,
    operationId: 'traveler-move-first',
    now: 22,
  });
  assert.deepEqual(replay, first);
  assert.throws(() => moveOtherShoreTrueWorld(world, {
    playerId: 'traveler',
    from: '0,0',
    to: '2,0',
    path: ['0,0', '1,0', '2,0'],
    realm: '真仙',
    mindAvailable: 10,
    operationId: 'traveler-move-first',
    now: 23,
  }), /operationId/);
});

test('玩家体系等级字段会参与同源变异体的境界判定，预览不物化扇区', () => {
  const world = { seed: 'true-world-level-fields' };
  const state = ensureOtherShoreTrueWorldState(world);
  let candidate = null;
  for (let q = -8; q <= 8 && !candidate; q++) {
    for (let r = -8; r <= 8 && !candidate; r++) {
      if (Math.abs(q + r) > 8 || (q === 0 && r === 0)) continue;
      const profile = getOtherShoreTrueWorldEnemyProfile(world, {
        coordinate: `${q},${r}`,
        wave: 1,
        playerId: 'level-hero',
        realm: { mijinglevel_id: 20 },
      });
      if (profile.tier === 'quasi_immortal_emperor') candidate = `${q},${r}`;
    }
  }
  assert.ok(candidate);
  assert.equal(Object.keys(state.sectors).length, 1);
});

test('同归于尽不会被记作真世界击杀，仍保留一点击杀门槛', () => {
  const world = { seed: 'true-world-draw-edge' };
  preparePlayer(world, 'draw-hero', '1,0');
  const required = getOtherShoreTrueWorldSector(world, '1,0').progressRequired;
  exploreOtherShoreTrueWorld(world, {
    playerId: 'draw-hero',
    coordinate: '1,0',
    amount: required,
    operationId: 'draw-explore',
    now: 10,
  });
  const started = startOtherShoreTrueWorldEncounter(world, {
    playerId: 'draw-hero',
    coordinate: '1,0',
    realm: '准仙帝',
    operationId: 'draw-encounter',
    now: 11,
  });
  const draw = applyOtherShoreTrueWorldBattle(world, {
    playerId: 'draw-hero',
    coordinate: '1,0',
    encounterId: started.encounter.encounterId,
    battle: { winner: 'draw', A_hp: 0, B_hp: 0 },
    operationId: 'draw-battle',
    now: 12,
  });
  assert.equal(draw.defeated, false);
  assert.equal(draw.currentHp, 1);
  assert.equal(serializeOtherShoreTrueWorld(world, { viewerId: 'draw-hero', center: '1,0' }).viewer.canClaim, false);
});
