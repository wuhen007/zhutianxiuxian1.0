const DEFAULT_CELL_TYPES = Object.freeze({
  EMPTY: 0,
  TREASURE: 2,
  NPC: 4,
  EXPLORED_EMPTY: 7,
});

const NPC_LOOT = Object.freeze([
  '源石',
  '普通道种碎片',
  '仙古矿材',
  '古兽残骨',
  '秘境灵药',
  '远古符纸',
]);

const XIANGU_WORLD_UNIQUE_ITEMS = new Set([
  '玉石匣·仙王经文', '玉石匣', '仙王经文',
  '一滴帝血', '帝血', '大罗剑胎',
]);

export const XIANGU_NPC_POWER_CONFIG = Object.freeze({
  minXianguLevel: 7,
  maxXianguLevel: 9,
  mijingLevel: 1,
  equipmentMultiplier: 30,
  imperialMultiplier: 50,
  minExtraAttribute: 130_000_000,
  maxExtraAttribute: 1_000_000_000,
});

function clonePlainData(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function randomIndex(length, random) {
  const roll = Math.min(1 - Number.EPSILON, Math.max(0, Number(random()) || 0));
  return Math.floor(roll * length);
}

function randomInteger(min, max, random) {
  const roll = Math.min(1 - Number.EPSILON, Math.max(0, Number(random()) || 0));
  return min + Math.floor(roll * (max - min + 1));
}

function maxRealm(levels) {
  return (Array.isArray(levels) ? levels : []).reduce((highest, realm) =>
    !highest || Number(realm?.level_id) > Number(highest?.level_id) ? realm : highest, null) || {};
}

function findRealm(levels, levelId) {
  return (Array.isArray(levels) ? levels : [])
    .find(realm => Number(realm?.level_id) === Number(levelId)) || {};
}

function realmStat(realm, field) {
  return Number(realm?.[field]) || 0;
}

function clampInteger(value, min, max) {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * 统一仙古地图 NPC 的四体系与战斗属性。返回新对象，旧地图重复迁移不会重掷属性。
 */
export function strengthenXianguNpc(
  npc = {},
  realms = {},
  { random = Math.random } = {},
) {
  const config = XIANGU_NPC_POWER_CONFIG;
  const cultivation = maxRealm(realms.cultivation);
  const physique = maxRealm(realms.physique);
  const legacyXianguLevel = Number(npc.xiangulevel_id) || Number(npc.level_id);
  const xianguLevel = Number.isFinite(legacyXianguLevel) && legacyXianguLevel > 0
    ? clampInteger(legacyXianguLevel, config.minXianguLevel, config.maxXianguLevel)
    : randomInteger(config.minXianguLevel, config.maxXianguLevel, random);
  const secret = findRealm(realms.secret, config.mijingLevel);
  const ancient = findRealm(realms.ancient, xianguLevel);
  const storedExtra = Number(npc.仙古额外全属性 ?? npc.额外属性加成);
  const extraAttribute = Number.isFinite(storedExtra) && storedExtra > 0
    ? clampInteger(storedExtra, config.minExtraAttribute, config.maxExtraAttribute)
    : randomInteger(config.minExtraAttribute, config.maxExtraAttribute, random);

  const baseStat = field => realmStat(cultivation, field) + realmStat(physique, field) +
    realmStat(secret, field) + realmStat(ancient, field) + extraAttribute;
  const imperialStat = field => realmStat(secret, field) + realmStat(ancient, field);
  const finalStat = field => Math.max(1, Math.trunc(
    baseStat(field) * config.equipmentMultiplier +
    imperialStat(field) * config.imperialMultiplier
  ));
  const hp = finalStat('基础血量');

  return {
    ...npc,
    level_id: Number(cultivation.level_id) || 0,
    Physique_id: Number(physique.level_id) || 0,
    mijinglevel_id: config.mijingLevel,
    xiangulevel_id: xianguLevel,
    境界: ancient.level || npc.境界 || '未知境界',
    攻击: finalStat('基础攻击'),
    防御: finalStat('基础防御'),
    当前血量: hp,
    血量上限: hp,
    暴击率: realmStat(cultivation, '基础暴击') + realmStat(physique, '基础暴击'),
    仙古额外全属性: extraAttribute,
    额外属性加成: extraAttribute,
    全属性加成: extraAttribute,
    装备倍率: config.equipmentMultiplier,
    帝兵倍率: config.imperialMultiplier,
    装备描述: `仙古战装×${config.equipmentMultiplier}`,
    帝兵描述: `本命帝兵×${config.imperialMultiplier}`,
  };
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

export function bindXianguNpcLocations(
  map,
  npcCandidates = [],
  { random = Math.random, excludedIds = [] } = {},
) {
  if (!Array.isArray(map?.npcLocations)) return [];
  const excluded = new Set(excludedIds.map(String));
  for (let index = map.npcLocations.length - 1; index >= 0; index--) {
    const spot = map.npcLocations[index];
    const npcId = String(spot?.npcId || spot?.npc?.id || spot?.npc?.name || spot?.npc?.名号 || '');
    if (!npcId || !excluded.has(npcId)) continue;
    map.npcLocations.splice(index, 1);
    if (map.grid?.[spot.y]?.[spot.x] === DEFAULT_CELL_TYPES.NPC) {
      map.grid[spot.y][spot.x] = spot.underCell ?? DEFAULT_CELL_TYPES.EMPTY;
    }
  }
  const available = npcCandidates
    .filter(npc => npc && !excluded.has(String(npc.id || npc.name || npc.名号 || '')))
    .map(clonePlainData);

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
  return name === '源石'
    ? { name, 源石: 1, 数量: 1 }
    : { name, 数量: 1 };
}

function rollNpcGoalLoot(npc, map, random) {
  const goal = npc?.xianguGoal;
  const target = String(goal?.item || '').trim();
  const uniqueNames = Object.entries(map?.uniqueTreasures || {}).flatMap(([name, treasure]) =>
    [name, treasure?.name].filter(Boolean)
  );
  const isUnique = goal?.unique === true || goal?.worldUnique === true ||
    XIANGU_WORLD_UNIQUE_ITEMS.has(target) || uniqueNames.includes(target);

  return goal?.action === 'seek_item' && target && !isUnique
    ? { name: target, 数量: 1 }
    : rollNpcLoot(random);
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
  const hostile = npc.xianguGoal?.action === 'hunt_player' ||
    npc.hostile === true || npc.personality === 'hostile' || relation <= -30;

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
  const hostile = spot.npc.xianguGoal?.action === 'hunt_player' ||
    spot.npc.hostile === true || spot.npc.personality === 'hostile' || relation <= -30;
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

  const item = rollNpcGoalLoot(spot.npc, map, random);
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
