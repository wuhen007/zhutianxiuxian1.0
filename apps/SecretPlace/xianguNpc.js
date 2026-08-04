const DEFAULT_CELL_TYPES = Object.freeze({
  EMPTY: 0,
  TREASURE: 2,
  NPC: 4,
  EXPLORED_EMPTY: 7,
});

const NPC_LOOT = Object.freeze([
  '灵石',
  '普通道种碎片',
  '仙古矿材',
  '古兽残骨',
  '秘境灵药',
  '远古符纸',
]);

function clonePlainData(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function randomIndex(length, random) {
  const roll = Math.min(1 - Number.EPSILON, Math.max(0, Number(random()) || 0));
  return Math.floor(roll * length);
}

function getNpcId(npc, map, spot) {
  return String(
    npc?.id ||
    npc?.name ||
    npc?.名号 ||
    `bound_${map?.fragmentId || 'unknown'}_${spot.x}_${spot.y}`
  );
}

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function isInside(map, point) {
  return Number.isInteger(point?.x) &&
    Number.isInteger(point?.y) &&
    point.y >= 0 &&
    point.y < map.grid.length &&
    point.x >= 0 &&
    point.x < map.grid[point.y].length;
}

function pointKey(point) {
  return `${point.x},${point.y}`;
}

export function bindXianguNpcLocations(map, npcCandidates = [], { random = Math.random } = {}) {
  if (!Array.isArray(map?.npcLocations)) return [];
  const available = npcCandidates.filter(Boolean).map(clonePlainData);

  for (const spot of map.npcLocations) {
    if (spot?.npc) {
      spot.npcId ||= getNpcId(spot.npc, map, spot);
      spot.npc.id ||= spot.npcId;
      spot.npc.inventory = Array.isArray(spot.npc.inventory) ? spot.npc.inventory : [];
      spot.underCell ??= DEFAULT_CELL_TYPES.EMPTY;
      continue;
    }
    if (available.length === 0) break;

    const index = randomIndex(available.length, random);
    const npc = available.splice(index, 1)[0];
    const npcId = getNpcId(npc, map, spot);
    npc.id ||= npcId;
    npc.inventory = Array.isArray(npc.inventory) ? npc.inventory : [];
    npc.isAlive = npc.isAlive !== false;
    spot.npcId = npcId;
    spot.npc = npc;
    spot.underCell ??= DEFAULT_CELL_TYPES.EMPTY;
  }

  return map.npcLocations;
}

export function getBoundXianguNpc(map, x, y) {
  const spot = map?.npcLocations?.find(item =>
    item?.x === x && item?.y === y && item?.npc?.isAlive !== false
  );
  return spot ? { spot, npc: spot.npc } : null;
}

export function removeBoundXianguNpc(map, npcId) {
  if (!Array.isArray(map?.npcLocations)) return null;
  const index = map.npcLocations.findIndex(spot => spot?.npcId === npcId || spot?.npc?.id === npcId);
  if (index < 0) return null;

  const [spot] = map.npcLocations.splice(index, 1);
  if (map.grid?.[spot.y]?.[spot.x] === DEFAULT_CELL_TYPES.NPC) {
    map.grid[spot.y][spot.x] = spot.underCell ?? DEFAULT_CELL_TYPES.EMPTY;
  }
  return spot;
}

function findPath(map, start, isTarget, occupied, cellTypes) {
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const queue = [{ point: start, firstStep: null }];
  const seen = new Set([pointKey(start)]);

  while (queue.length > 0) {
    const current = queue.shift();
    for (const [dx, dy] of directions) {
      const next = { x: current.point.x + dx, y: current.point.y + dy };
      const key = pointKey(next);
      if (!isInside(map, next) || seen.has(key)) continue;
      seen.add(key);

      const target = isTarget(next);
      const cell = map.grid[next.y][next.x];
      const passable = target || [cellTypes.EMPTY, cellTypes.EXPLORED_EMPTY, cellTypes.TREASURE].includes(cell);
      if (!passable || (occupied.has(key) && !target)) continue;

      const firstStep = current.firstStep || next;
      if (target) return { firstStep, target: next };
      queue.push({ point: next, firstStep });
    }
  }
  return null;
}

function moveNpc(map, spot, next, cellTypes) {
  const destinationCell = map.grid[next.y][next.x];
  if (map.grid?.[spot.y]?.[spot.x] === cellTypes.NPC) {
    map.grid[spot.y][spot.x] = spot.underCell ?? cellTypes.EMPTY;
  }
  spot.underCell = destinationCell === cellTypes.TREASURE
    ? cellTypes.EXPLORED_EMPTY
    : destinationCell;
  spot.x = next.x;
  spot.y = next.y;
  map.grid[next.y][next.x] = cellTypes.NPC;
  return destinationCell;
}

function rollNpcLoot(random) {
  const name = NPC_LOOT[randomIndex(NPC_LOOT.length, random)];
  return name === '灵石'
    ? { name, 灵石: 1000 + randomIndex(5001, random), 数量: 1 }
    : { name, 数量: 1 };
}

function revealNearestTreasure(map, origin, cellTypes) {
  let nearest = null;
  for (let y = 0; y < map.grid.length; y++) {
    for (let x = 0; x < map.grid[y].length; x++) {
      if (map.grid[y][x] !== cellTypes.TREASURE) continue;
      const point = { x, y };
      if (!nearest || distance(origin, point) < distance(origin, nearest)) nearest = point;
    }
  }
  if (nearest && map.revealed?.[nearest.y]) map.revealed[nearest.y][nearest.x] = true;
  return nearest;
}

function getEncounter(map, player, spot, now, random, cellTypes, allowEncounter) {
  if (!allowEncounter || now < (Number(spot.nextEncounterAt) || 0)) return null;
  const playerPos = map.playerPos;
  if (distance(spot, playerPos) > 1) return null;

  const npc = spot.npc;
  const npcId = spot.npcId || npc.id;
  const relations = player.xiangu_npc_relations ||= {};
  const relation = Number(relations[npcId] ?? player.xiangu_faction_rep?.[npc.faction]) || 0;
  const hostile = npc.hostile === true || npc.personality === 'hostile' || relation <= -30;

  if (hostile) {
    spot.nextEncounterAt = now + 300000;
    return { type: 'hunt', npcId, npc, spot };
  }

  const fraudChance = npc.personality === 'scheming' && relation < 100
    ? 0.35
    : relation < 0 && npc.personality !== 'friendly'
      ? 0.25
      : 0;
  if (fraudChance > 0 && random() < fraudChance) {
    relations[npcId] = relation - 10;
    spot.nextEncounterAt = now + 300000;
    return { type: 'fraud', npcId, npc, spot, relationDelta: -10 };
  }

  const befriendChance = npc.personality === 'friendly' || npc.faction === 'good' ? 0.35 : 0.15;
  if (random() < befriendChance) {
    const relationDelta = npc.personality === 'friendly' || npc.faction === 'good' ? 10 : 5;
    relations[npcId] = relation + relationDelta;
    spot.nextEncounterAt = now + 180000;
    return {
      type: 'befriend',
      npcId,
      npc,
      spot,
      relationDelta,
      clue: revealNearestTreasure(map, playerPos, cellTypes),
    };
  }
  return null;
}

export function advanceXianguNpcState(
  map,
  player,
  {
    random = Math.random,
    now = Date.now(),
    force = false,
    allowEncounter = true,
    cooldownMs = 30000,
    initialDelayMs = 15000,
    cellTypes = DEFAULT_CELL_TYPES,
  } = {},
) {
  const active = (map?.npcLocations || []).filter(spot => spot?.npc?.isAlive !== false);
  if (!map?.grid || active.length === 0 || !map.playerPos) return { type: 'idle' };

  map.npcEcology ||= {};
  map.npcEcology.turn = Number.isInteger(map.npcEcology.turn) ? map.npcEcology.turn : 0;
  map.npcEcology.nextActionAt = Number(map.npcEcology.nextActionAt) || 0;

  // Walking onto a hostile NPC must not be neutralized by the global ecology cooldown.
  const currentSpot = active.find(spot => spot.x === map.playerPos.x && spot.y === map.playerPos.y);
  if (currentSpot) {
    const immediate = getEncounter(map, player, currentSpot, now, random, cellTypes, allowEncounter);
    if (immediate) return immediate;
  }

  if (!force) {
    if (!map.npcEcology.nextActionAt) {
      map.npcEcology.nextActionAt = now + initialDelayMs;
      return { type: 'idle' };
    }
    if (now < map.npcEcology.nextActionAt) return { type: 'idle' };
  }
  map.npcEcology.nextActionAt = now + cooldownMs;

  const spot = active[map.npcEcology.turn % active.length];
  map.npcEcology.turn += 1;
  const beforeEncounter = getEncounter(map, player, spot, now, random, cellTypes, allowEncounter);
  if (beforeEncounter) return beforeEncounter;
  if (spot.x === map.playerPos.x && spot.y === map.playerPos.y) return { type: 'idle', npcId: spot.npcId };

  const npcId = spot.npcId || spot.npc.id;
  const relation = Number(
    player.xiangu_npc_relations?.[npcId] ?? player.xiangu_faction_rep?.[spot.npc.faction]
  ) || 0;
  const hostile = spot.npc.hostile === true || spot.npc.personality === 'hostile' || relation <= -30;
  const occupied = new Set(active.filter(item => item !== spot).map(pointKey));
  const oldPos = { x: spot.x, y: spot.y };

  if (hostile) {
    const path = findPath(map, spot, point =>
      point.x === map.playerPos.x && point.y === map.playerPos.y,
    occupied, cellTypes);
    if (!path || (path.firstStep.x === map.playerPos.x && path.firstStep.y === map.playerPos.y)) {
      return getEncounter(map, player, spot, now, random, cellTypes, allowEncounter) || { type: 'idle', npcId };
    }
    moveNpc(map, spot, path.firstStep, cellTypes);
    const encounter = getEncounter(map, player, spot, now, random, cellTypes, allowEncounter);
    if (encounter) return { ...encounter, from: oldPos, to: { x: spot.x, y: spot.y } };
    return {
      type: 'move',
      npcId,
      npc: spot.npc,
      from: oldPos,
      to: { x: spot.x, y: spot.y },
      visible: distance(spot, map.playerPos) <= 2 || Boolean(map.revealed?.[spot.y]?.[spot.x]),
    };
  }

  const treasurePath = findPath(map, spot, point =>
    map.grid[point.y][point.x] === cellTypes.TREASURE,
  occupied, cellTypes);
  if (!treasurePath) return { type: 'idle', npcId };

  const destinationCell = moveNpc(map, spot, treasurePath.firstStep, cellTypes);
  if (destinationCell !== cellTypes.TREASURE) {
    return {
      type: 'move',
      npcId,
      npc: spot.npc,
      from: oldPos,
      to: { x: spot.x, y: spot.y },
      visible: distance(spot, map.playerPos) <= 2 || Boolean(map.revealed?.[spot.y]?.[spot.x]),
    };
  }

  const item = rollNpcLoot(random);
  spot.npc.inventory.push(item);
  return {
    type: 'loot',
    npcId,
    npc: spot.npc,
    from: oldPos,
    to: { x: spot.x, y: spot.y },
    item,
    visible: distance(spot, map.playerPos) <= 2 || Boolean(map.revealed?.[spot.y]?.[spot.x]),
  };
}
