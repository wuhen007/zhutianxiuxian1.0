import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OTHER_SHORE_ANCIENT_EVENT_CATALOG,
  claimOtherShoreAncientEventReward,
  contributeOtherShoreAncientEvent,
  ensureOtherShoreAncientEvents,
  getOtherShoreAncientEvent,
  serializeOtherShoreAncientEvents,
} from '../model/otherShoreAncientEvents.js';
import { ensureOtherShoreTrueWorldState } from '../model/otherShoreTrueWorld.js';

function exploreFixture(world, coordinate) {
  const state = ensureOtherShoreTrueWorldState(world);
  state.sectors[coordinate] = {
    id: coordinate,
    status: 'explored',
    progress: 1,
    progressRequired: 1,
    contributors: {},
    exploredBy: {},
    exploredAt: 1,
    encounterWave: 0,
    encounter: null,
    updatedAt: 1,
  };
}

function complete(world, eventId, playerId, operationId, now) {
  const event = getOtherShoreAncientEvent(world, eventId);
  exploreFixture(world, event.coordinate);
  return contributeOtherShoreAncientEvent(world, {
    eventId,
    playerId,
    amount: event.contributionRequired,
    operationId,
    now,
  });
}

test('古文明事件只初始化四个事件节点，按祖庭到观测台顺序锁定', () => {
  const world = {};
  const state = ensureOtherShoreAncientEvents(world);
  assert.equal(world.trueWorld, undefined);
  assert.equal(Object.keys(state.events).length, 4);
  assert.deepEqual(
    OTHER_SHORE_ANCIENT_EVENT_CATALOG.map(event => event.coordinate),
    ['7,-3', '-9,4', '13,-8', '21,-13'],
  );
  assert.deepEqual(
    OTHER_SHORE_ANCIENT_EVENT_CATALOG.map(event => state.events[event.id].status),
    ['active', 'locked', 'locked', 'locked'],
  );
});

test('章节要求对应真世界扇区已探索，全服贡献合并且 operationId 幂等', () => {
  const world = { seed: 'ancient-events-shared' };
  const eventId = 'qin-qi-refiner-ancestral-court';
  assert.equal(getOtherShoreAncientEvent(world, eventId, { viewerId: 'alice' }).viewer.canContribute, false);
  assert.throws(() => contributeOtherShoreAncientEvent(world, {
    eventId,
    playerId: 'alice',
    amount: 40,
    operationId: 'qin-alice-40',
  }), /必须先探索真世界扇区 7,-3/);

  exploreFixture(world, '7,-3');
  const available = getOtherShoreAncientEvent(world, eventId, { viewerId: 'alice' });
  assert.equal(available.sectorExplored, true);
  assert.equal(available.viewer.canContribute, true);
  const first = contributeOtherShoreAncientEvent(world, {
    eventId,
    playerId: 'alice',
    playerName: '阿离',
    amount: 40,
    operationId: 'qin-alice-40',
    now: 10,
  });
  assert.deepEqual(contributeOtherShoreAncientEvent(world, {
    eventId,
    playerId: 'alice',
    amount: 40,
    operationId: 'qin-alice-40',
    now: 11,
  }), first);

  const done = contributeOtherShoreAncientEvent(world, {
    eventId,
    playerId: 'bob',
    amount: 999,
    operationId: 'qin-bob-rest',
    now: 12,
  });
  assert.equal(done.applied, 80);
  assert.equal(done.chapterCompleted, true);
  assert.equal(done.nextEventId, 'spirit-rift-source-court');
  assert.equal(getOtherShoreAncientEvent(world, eventId).contributorCount, 2);
  assert.equal(serializeOtherShoreAncientEvents(world).globalUnlocks.ancientHistory[0].id, 'qin-qi-origin-history');
  assert.throws(() => contributeOtherShoreAncientEvent(world, {
    eventId,
    playerId: 'alice',
    amount: 41,
    operationId: 'qin-alice-40',
  }), /operationId/);
});

test('三个章节严格顺序开放，参与者奖励按玩家幂等领取', () => {
  const world = { seed: 'ancient-events-claim' };
  exploreFixture(world, '-9,4');
  assert.throws(() => contributeOtherShoreAncientEvent(world, {
    eventId: 'spirit-rift-source-court',
    playerId: 'alice',
    amount: 1,
    operationId: 'locked-spirit',
  }), /前置/);

  complete(world, 'qin-qi-refiner-ancestral-court', 'alice', 'complete-qin', 20);
  const firstClaim = claimOtherShoreAncientEventReward(world, {
    eventId: 'qin-qi-refiner-ancestral-court',
    playerId: 'alice',
    operationId: 'claim-qin',
    now: 21,
  });
  assert.equal(firstClaim.duplicate, false);
  assert.deepEqual(claimOtherShoreAncientEventReward(world, {
    eventId: 'qin-qi-refiner-ancestral-court',
    playerId: 'alice',
    operationId: 'claim-qin',
    now: 22,
  }), firstClaim);
  assert.equal(claimOtherShoreAncientEventReward(world, {
    eventId: 'qin-qi-refiner-ancestral-court',
    playerId: 'alice',
    operationId: 'claim-qin-again',
    now: 23,
  }).duplicate, true);
  assert.throws(() => claimOtherShoreAncientEventReward(world, {
    eventId: 'qin-qi-refiner-ancestral-court',
    playerId: 'bob',
    operationId: 'claim-qin-bob',
  }), /没有可领取/);
  assert.throws(() => claimOtherShoreAncientEventReward(world, {
    eventId: 'qin-qi-refiner-ancestral-court',
    playerId: 'bob',
    operationId: 'claim-qin',
  }), /operationId/);
});

test('禁宝清算庭完成后开放终章，纪元主宰与超维清算者共同降临', () => {
  const world = { seed: 'ancient-events-finale' };
  complete(world, 'qin-qi-refiner-ancestral-court', 'hero', 'finish-1', 30);
  complete(world, 'spirit-rift-source-court', 'hero', 'finish-2', 31);
  const third = complete(world, 'forbidden-treasure-cleansing-court', 'hero', 'finish-3', 32);
  assert.equal(third.nextEventId, 'era-overlord-observatory-finale');

  const beforeFinale = serializeOtherShoreAncientEvents(world, { viewerId: 'hero' });
  assert.equal(beforeFinale.finaleUnlocked, true);
  assert.equal(beforeFinale.globalUnlocks.recipeUnlocks[0].id, 'rift-origin-dao-treasure-method');
  assert.equal(beforeFinale.globalUnlocks.innateTreasureClues[0].id, 'unrecorded-primordial-treasure-clue');
  assert.deepEqual(beforeFinale.events[3].opposition, ['纪元主宰·逻辑投影', '超维清算者·断律使']);

  const finale = complete(world, 'era-overlord-observatory-finale', 'hero', 'finish-finale', 33);
  assert.equal(finale.chainCompleted, true);
  const completed = serializeOtherShoreAncientEvents(world, { viewerId: 'hero' });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.completedCount, 4);
  assert.equal(completed.activeEventId, null);
  assert.deepEqual(
    completed.globalUnlocks.authorities.map(entry => entry.id),
    ['era-overlord-observation', 'hyperdimensional-cleansing-mark'],
  );
  assert.deepEqual(Object.keys(world.trueWorld.sectors).sort(), ['0,0', '13,-8', '21,-13', '7,-3', '-9,4'].sort());
});
