import {
  FOREIGN_OVERLORD_MAX_HP,
  FOREIGN_OVERLORD_REFINEMENT_WEIGHT,
  applyForeignOverlordBattleResult,
  createForeignOverlord,
  createForeignOverlordCombatant,
} from './foreignCalamity.js';
import {
  findOtherShoreShortestPath,
  getOtherShoreHexDistance,
} from './otherShoreWorld.js';

export const OTHER_SHORE_THREAT_PHASES = Object.freeze([
  'calamity',
  'overlord',
  'decision',
  'purge',
  'resolved',
]);
export const OTHER_SHORE_THREAT_KILL_TARGET = 10;
export const OTHER_SHORE_THREAT_REFINEMENT_WEIGHT = FOREIGN_OVERLORD_REFINEMENT_WEIGHT;
export const OTHER_SHORE_PURGE_STEP_MS = 5 * 60 * 1000;
export const OTHER_SHORE_PURGE_BASE_DEFENSE = 6;
export const OTHER_SHORE_PURGE_OCCUPIED_INCREASE = 4;
export const OTHER_SHORE_THREAT_LEDGER_LIMIT = 12;
export const OTHER_SHORE_TREASURE_SIGNAL_LIMIT = 20;
export const OTHER_SHORE_PURGE_ESCALATION_PROFILES = Object.freeze({
  purge: Object.freeze({
    stage: 'purge',
    title: '禁宝司清剿使',
    type: '禁宝司清剿使',
    attributeMultiplier: 1,
    abilities: Object.freeze(['禁宝律令']),
  }),
  eraLord: Object.freeze({
    stage: 'era_lord',
    title: '禁宝司纪元主宰',
    type: '纪元主宰',
    attributeMultiplier: 1.5,
    abilities: Object.freeze(['禁宝律令', '纪元统御', '古史裁定']),
  }),
  hyperdimensional: Object.freeze({
    stage: 'hyperdimensional',
    title: '禁宝司超维清算者',
    type: '超维强者',
    attributeMultiplier: 2.25,
    abilities: Object.freeze(['禁宝律令', '纪元统御', '超维投影', '维度封锁', '大道降阶']),
  }),
});

const INITIAL_STAR_ID = '1,-1';
const PURGE_ORIGIN_STAR_ID = '1,-3';
const HYPERDIMENSIONAL_PRESSURE = 4;
const VISITED_PHASES = new Set(['visited', 'anchored', 'cleared']);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveInteger(value, fallback) {
  return Math.max(1, Math.trunc(finite(value, fallback)));
}

function requiredText(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label}不能为空`);
  return text;
}

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function randomValue(random) {
  return Math.min(0.999999999, Math.max(0, finite(random(), 0)));
}

function rememberHistory(event, type, now, details = {}) {
  event.history ||= [];
  event.history.push({ type, at: positiveInteger(now, Date.now()), ...details });
  if (event.history.length > 50) event.history.splice(0, event.history.length - 50);
}

function findStar(world, starId) {
  return world?.stars?.find(star => star.id === String(starId || '')) || null;
}

function requireStar(world, starId) {
  const star = findStar(world, starId);
  if (!star) throw new Error(`彼岸大星不存在：${starId}`);
  return star;
}

function requireEvent(world, eventId, starId) {
  const event = world?.threat;
  if (!event) throw new Error('当前没有彼岸威胁事件');
  if (event.eventId !== requiredText(eventId, 'eventId')) throw new Error('彼岸威胁事件已经变化');
  if (starId !== undefined && event.starId !== requiredText(starId, 'starId')) {
    throw new Error(`必须位于事件大星 ${event.starId}`);
  }
  return event;
}

function requirePhase(event, phase) {
  if (event.phase !== phase) throw new Error(`当前事件阶段不是 ${phase}`);
}

function operationReceipt(event, operationId, action, playerId) {
  const id = requiredText(operationId, 'operationId');
  const receipt = event.receipts?.[id];
  if (!receipt) return null;
  if (receipt.action !== action || receipt.playerId !== playerId) {
    throw new Error('operationId 已用于其他彼岸行动');
  }
  return copy(receipt.result);
}

function saveOperationReceipt(event, operationId, action, playerId, result, now) {
  event.receipts ||= {};
  event.receipts[operationId] = {
    action,
    playerId,
    at: positiveInteger(now, Date.now()),
    result: copy(result),
  };
  return result;
}

function chooseThreatStar(world, sequence, explicitStarId) {
  if (explicitStarId) {
    const star = requireStar(world, explicitStarId);
    if (sequence > 1 && !VISITED_PHASES.has(world.states?.[star.id]?.phase)) {
      throw new Error('后续威胁只能发生在全服已经踏足的大星');
    }
    return star;
  }
  if (sequence === 1 && findStar(world, INITIAL_STAR_ID)) return findStar(world, INITIAL_STAR_ID);

  const previousStarId = world.threat?.starId;
  const candidates = world.stars
    .filter(star => star.id !== world.centerId && VISITED_PHASES.has(world.states?.[star.id]?.phase))
    .sort((left, right) => left.id.localeCompare(right.id));
  const withoutPrevious = candidates.filter(star => star.id !== previousStarId);
  const pool = withoutPrevious.length ? withoutPrevious : candidates;
  if (!pool.length) throw new Error('尚无可承载下一轮威胁的已踏足大星');
  return pool[(sequence - 2) % pool.length];
}

function revealInitialThreatStar(world, starId) {
  const state = world.states?.[starId];
  if (state?.phase === 'unobserved') state.phase = 'sensed';
}

function createThreatEvent(world, { sequence, starId, now = Date.now() } = {}) {
  const number = positiveInteger(sequence, 1);
  const star = chooseThreatStar(world, number, starId);
  if (number === 1) revealInitialThreatStar(world, star.id);
  const timestamp = positiveInteger(now, Date.now());
  const event = {
    version: 1,
    eventId: `other-shore-threat-${number}-${timestamp}`,
    sequence: number,
    phase: 'calamity',
    starId: star.id,
    title: `${star.name}·同源灾厄潮`,
    createdAt: timestamp,
    updatedAt: timestamp,
    killCount: 0,
    killTarget: OTHER_SHORE_THREAT_KILL_TARGET,
    calamity: { killers: {}, defeatIds: {} },
    overlord: null,
    decision: null,
    purge: null,
    treasureSignals: [],
    escalation: { eraLord: false, hyperdimensional: false },
    receipts: {},
    history: [],
  };
  rememberHistory(event, 'calamity_started', timestamp, { starId: star.id, title: event.title });
  return event;
}

export function ensureOtherShoreThreat(world, options = {}) {
  if (!world || typeof world !== 'object') throw new TypeError('world 必须是世界文档');
  if (world.threat) return { created: false, event: world.threat };
  const latestSequence = Math.max(0, ...(world.threatLedger || []).map(record => finite(record.sequence)));
  world.threat = createThreatEvent(world, { ...options, sequence: latestSequence + 1 });
  return { created: true, event: world.threat };
}

export function startNextOtherShoreThreat(world, options = {}) {
  if (!world || typeof world !== 'object') throw new TypeError('world 必须是世界文档');
  if (world.threat && world.threat.phase !== 'resolved') throw new Error('上一轮彼岸威胁尚未结束');
  const previousSequence = Math.max(
    finite(world.threat?.sequence),
    ...(world.threatLedger || []).map(record => finite(record.sequence)),
  );
  const sequence = positiveInteger(previousSequence + 1, 1);
  world.threat = createThreatEvent(world, { ...options, sequence });
  return { created: true, event: world.threat };
}

export function registerOtherShoreCalamityKill(world, {
  eventId,
  starId,
  playerId,
  playerName,
  variantId,
  operationId,
  now = Date.now(),
} = {}) {
  const event = requireEvent(world, eventId, starId);
  const id = requiredText(playerId, 'playerId');
  const operation = requiredText(operationId, 'operationId');
  const previous = operationReceipt(event, operation, 'calamity_kill', id);
  if (previous) return previous;
  requirePhase(event, 'calamity');

  const defeat = requiredText(variantId, 'variantId');
  const duplicate = Boolean(event.calamity.killers[id] || event.calamity.defeatIds[defeat]);
  if (!duplicate) {
    const name = String(playerName || id);
    const timestamp = positiveInteger(now, Date.now());
    event.calamity.killers[id] = { name, variantId: defeat, at: timestamp };
    event.calamity.defeatIds[defeat] = id;
    event.killCount++;
    event.updatedAt = timestamp;
    rememberHistory(event, 'calamity_kill', timestamp, { playerName: name, killCount: event.killCount });
    if (event.killCount >= event.killTarget) {
      event.phase = 'overlord';
      event.overlord = createForeignOverlord({
        sequence: event.sequence,
        killCount: event.killCount,
        now: timestamp,
      });
      rememberHistory(event, 'overlord_spawned', timestamp, { title: event.overlord.名号 });
    }
  }

  const result = {
    duplicate,
    killCount: event.killCount,
    killTarget: event.killTarget,
    phase: event.phase,
    spawnedOverlord: !duplicate && event.phase === 'overlord',
  };
  return saveOperationReceipt(event, operation, 'calamity_kill', id, result, now);
}

export function recordOtherShoreTreasureSignal(world, {
  eventId,
  starId,
  userId,
  userName,
  treasureName,
  operationId,
  now = Date.now(),
} = {}) {
  const event = requireEvent(world, eventId);
  const residentId = requiredText(userId, 'userId');
  const operation = requiredText(operationId, 'operationId');
  const previous = operationReceipt(event, operation, 'treasure_signal', residentId);
  if (previous) return previous;
  if (event.phase === 'resolved') throw new Error('本轮彼岸威胁已经结算');
  const location = requireStar(world, requiredText(starId, 'starId')).id;
  const treasure = requiredText(treasureName, 'treasureName');
  event.treasureSignals ||= [];
  const duplicate = event.treasureSignals.some(signal =>
    signal.starId === location && signal.userId === residentId && signal.treasureName === treasure
  );
  if (!duplicate) {
    const timestamp = positiveInteger(now, Date.now());
    event.treasureSignals.push({
      starId: location,
      userId: residentId,
      userName: String(userName || residentId),
      treasureName: treasure,
      signaledAt: timestamp,
    });
    if (event.treasureSignals.length > OTHER_SHORE_TREASURE_SIGNAL_LIMIT) {
      event.treasureSignals.splice(0, event.treasureSignals.length - OTHER_SHORE_TREASURE_SIGNAL_LIMIT);
    }
    if (event.purge) {
      event.purge.targets = copy(event.treasureSignals);
      event.purge.reason = '先天至宝显化触发禁宝司清算';
    }
    event.updatedAt = timestamp;
    rememberHistory(event, 'treasure_signaled', timestamp, {
      starId: location,
      userName: String(userName || residentId),
      treasureName: treasure,
    });
  }
  const result = { duplicate, signalCount: event.treasureSignals.length };
  return saveOperationReceipt(event, operation, 'treasure_signal', residentId, result, now);
}

export function createOtherShoreThreatOverlordCombatant(world, { eventId, starId } = {}) {
  const event = requireEvent(world, eventId, starId);
  requirePhase(event, 'overlord');
  return createForeignOverlordCombatant(event.overlord);
}

export function applyOtherShoreThreatOverlordBattle(world, {
  eventId,
  starId,
  playerId,
  playerName,
  battle,
  operationId,
  now = Date.now(),
} = {}) {
  const event = requireEvent(world, eventId, starId);
  const id = requiredText(playerId, 'playerId');
  const operation = requiredText(operationId, 'operationId');
  const previous = operationReceipt(event, operation, 'overlord_battle', id);
  if (previous) return previous;
  requirePhase(event, 'overlord');
  if (!battle || typeof battle !== 'object') throw new Error('battle 不能为空');

  const timestamp = positiveInteger(now, Date.now());
  const settled = applyForeignOverlordBattleResult(event.overlord, battle, {
    playerId: id,
    playerName: String(playerName || id),
    now: timestamp,
  });
  event.updatedAt = timestamp;
  if (settled.damage > 0) {
    rememberHistory(event, 'overlord_battle', timestamp, {
      playerName: String(playerName || id),
      damage: settled.damage,
    });
  }
  if (settled.revivedDuringBattle) {
    event.escalation.hyperdimensional = true;
    rememberHistory(event, 'overlord_revived', timestamp);
  }
  if (event.overlord.status === 'defeated') {
    event.phase = 'decision';
    event.decision = {
      status: 'pending',
      authorizedPlayerId: event.overlord.defeatedBy,
      authorizedPlayerName: event.overlord.defeatedByName,
      openedAt: timestamp,
    };
    rememberHistory(event, 'decision_opened', timestamp, {
      authorizedPlayerName: event.decision.authorizedPlayerName,
    });
  }

  const result = {
    damage: settled.damage,
    revived: settled.revivedDuringBattle,
    defeated: event.overlord.status === 'defeated',
    currentHp: event.overlord.当前血量,
    maxHp: event.overlord.血量上限,
    phase: event.phase,
  };
  return saveOperationReceipt(event, operation, 'overlord_battle', id, result, timestamp);
}

function normalizeFate(value) {
  if (value === 'kill' || value === '击杀') return 'kill';
  if (value === 'refine' || value === '炼化') return 'refine';
  throw new Error('魔主归宿只能选择击杀或炼化');
}

function validatePurgeRoute(world, route, targetStarId) {
  if (!Array.isArray(route) || !route.length) throw new Error('清剿路线不能为空');
  const ids = route.map(starId => requireStar(world, starId).id);
  if (ids.at(-1) !== targetStarId) throw new Error('清剿路线必须抵达事件大星');
  for (let index = 1; index < ids.length; index++) {
    if (getOtherShoreHexDistance(ids[index - 1], ids[index]) !== 1) {
      throw new Error('清剿路线必须由相邻大星组成');
    }
  }
  return ids;
}

function defaultPurgeRoute(world, targetStarId) {
  const origin = findStar(world, PURGE_ORIGIN_STAR_ID) ? PURGE_ORIGIN_STAR_ID : world.centerId;
  return findOtherShoreShortestPath(world, origin, targetStarId);
}

export function chooseOtherShoreOverlordFate(world, {
  eventId,
  starId,
  playerId,
  playerName,
  choice,
  canRefine = false,
  route,
  operationId,
  now = Date.now(),
  stepMs = OTHER_SHORE_PURGE_STEP_MS,
  defenseRequirement = OTHER_SHORE_PURGE_BASE_DEFENSE,
  occupiedIncrease = OTHER_SHORE_PURGE_OCCUPIED_INCREASE,
} = {}) {
  const event = requireEvent(world, eventId, starId);
  const id = requiredText(playerId, 'playerId');
  const operation = requiredText(operationId, 'operationId');
  const previous = operationReceipt(event, operation, 'overlord_fate', id);
  if (previous) return previous;
  requirePhase(event, 'decision');
  if (event.decision.authorizedPlayerId !== id) throw new Error('只有击败魔主的修士可以决定其归宿');

  const fate = normalizeFate(choice);
  if (fate === 'refine' && canRefine !== true) throw new Error('当前修士不具备炼化灾厄魔主的资格');
  const timestamp = positiveInteger(now, Date.now());
  const purgeRoute = validatePurgeRoute(world, route || defaultPurgeRoute(world, event.starId), event.starId);
  event.decision = {
    ...event.decision,
    status: 'chosen',
    choice: fate,
    chosenBy: id,
    chosenByName: String(playerName || event.decision.authorizedPlayerName || id),
    chosenAt: timestamp,
    refinementWeight: fate === 'refine' ? OTHER_SHORE_THREAT_REFINEMENT_WEIGHT : 0,
  };
  event.phase = 'purge';
  event.purge = {
    title: '禁宝司清剿使来袭',
    reason: event.treasureSignals.length
      ? '先天至宝显化触发禁宝司清算'
      : '灾厄魔主违禁权柄暴露',
    targets: copy(event.treasureSignals),
    status: purgeRoute.length === 1 ? 'occupied' : 'advancing',
    route: purgeRoute,
    routeIndex: 0,
    currentStarId: purgeRoute[0],
    targetStarId: event.starId,
    startedAt: timestamp,
    nextAdvanceAt: purgeRoute.length === 1 ? null : timestamp + positiveInteger(stepMs, OTHER_SHORE_PURGE_STEP_MS),
    stepMs: positiveInteger(stepMs, OTHER_SHORE_PURGE_STEP_MS),
    pressure: 1,
    defense: 0,
    defenseRequirement: positiveInteger(defenseRequirement, OTHER_SHORE_PURGE_BASE_DEFENSE),
    occupiedIncrease: positiveInteger(occupiedIncrease, OTHER_SHORE_PURGE_OCCUPIED_INCREASE),
    occupied: purgeRoute.length === 1,
    defenders: {},
  };
  if (event.purge.occupied) {
    event.purge.arrivedAt = timestamp;
    event.purge.defenseRequirement += event.purge.occupiedIncrease;
    event.escalation.eraLord = true;
  }
  event.updatedAt = timestamp;
  rememberHistory(event, 'overlord_fate_chosen', timestamp, {
    choice: fate,
    playerName: event.decision.chosenByName,
  });
  rememberHistory(event, 'purge_started', timestamp, { currentStarId: event.purge.currentStarId });

  const result = {
    choice: fate,
    refinementWeight: event.decision.refinementWeight,
    phase: event.phase,
    purge: copy(event.purge),
  };
  return saveOperationReceipt(event, operation, 'overlord_fate', id, result, timestamp);
}

export function advanceOtherShoreThreat(world, { eventId, now = Date.now() } = {}) {
  const event = requireEvent(world, eventId);
  if (event.phase === 'resolved') return { phase: event.phase, advanced: 0, occupied: event.purge?.occupied === true };
  requirePhase(event, 'purge');
  const purge = event.purge;
  const timestamp = positiveInteger(now, Date.now());
  let advanced = 0;
  while (!purge.occupied && timestamp >= purge.nextAdvanceAt) {
    purge.routeIndex++;
    purge.currentStarId = purge.route[purge.routeIndex];
    purge.pressure++;
    purge.nextAdvanceAt += purge.stepMs;
    advanced++;
    rememberHistory(event, 'purge_advanced', purge.nextAdvanceAt - purge.stepMs, {
      currentStarId: purge.currentStarId,
      pressure: purge.pressure,
    });
    if (purge.routeIndex >= purge.route.length - 1) {
      purge.status = 'occupied';
      purge.occupied = true;
      purge.arrivedAt = purge.nextAdvanceAt - purge.stepMs;
      purge.nextAdvanceAt = null;
      purge.defenseRequirement += purge.occupiedIncrease;
      event.escalation.eraLord = true;
      rememberHistory(event, 'star_occupied', purge.arrivedAt, {
        defenseRequirement: purge.defenseRequirement,
      });
    }
  }
  if (purge.pressure >= HYPERDIMENSIONAL_PRESSURE || event.overlord?.revived) {
    event.escalation.hyperdimensional = true;
  }
  if (advanced) event.updatedAt = timestamp;
  return {
    phase: event.phase,
    advanced,
    currentStarId: purge.currentStarId,
    pressure: purge.pressure,
    occupied: purge.occupied,
    defenseRequirement: purge.defenseRequirement,
    escalation: copy(event.escalation),
  };
}

function contributionFor(event, playerId) {
  const id = String(playerId || '');
  const kill = event.calamity?.killers?.[id] ? 1 : 0;
  const overlordDamage = Math.max(0, finite(event.overlord?.contributions?.[id]?.damage));
  const purgeDefense = Math.max(0, finite(event.purge?.defenders?.[id]?.amount));
  const refinementWeight = event.decision?.choice === 'refine' && event.decision?.chosenBy === id
    ? OTHER_SHORE_THREAT_REFINEMENT_WEIGHT
    : 0;
  const maxHp = Math.max(1, finite(event.overlord?.血量上限, FOREIGN_OVERLORD_MAX_HP));
  const overlordShare = Math.min(1, overlordDamage / maxHp);
  const score = Number((kill * 20 + overlordShare * 100 + purgeDefense * 20 + refinementWeight * 20).toFixed(3));
  const tier = score >= 100 ? 'epoch' : score >= 40 ? 'major' : score > 0 ? 'participant' : 'none';
  const name = event.calamity?.killers?.[id]?.name
    || event.overlord?.contributions?.[id]?.name
    || event.purge?.defenders?.[id]?.name
    || id;
  return { id, name, kill, overlordDamage, overlordShare, purgeDefense, refinementWeight, score, tier };
}

export function calculateOtherShoreThreatContribution(event, playerId) {
  if (!event || typeof event !== 'object') throw new TypeError('event 不能为空');
  return contributionFor(event, requiredText(playerId, 'playerId'));
}

function participantIds(event) {
  return [...new Set([
    ...Object.keys(event.calamity?.killers || {}),
    ...Object.keys(event.overlord?.contributions || {}).filter(id => finite(event.overlord.contributions[id]?.damage) > 0),
    ...Object.keys(event.purge?.defenders || {}).filter(id => finite(event.purge.defenders[id]?.amount) > 0),
  ])];
}

function pruneThreatLedger(world) {
  const ledger = world.threatLedger || [];
  const pending = ledger.filter(record => record.eligiblePlayerIds.some(id => !record.claims?.[id]));
  const completed = ledger
    .filter(record => !record.eligiblePlayerIds.some(id => !record.claims?.[id]))
    .slice(-OTHER_SHORE_THREAT_LEDGER_LIMIT);
  const keep = new Set([...pending, ...completed]);
  world.threatLedger = ledger.filter(record => keep.has(record));
}

function resolveThreat(world, event, now) {
  if (event.phase === 'resolved') return world.threatLedger?.find(record => record.eventId === event.eventId);
  const timestamp = positiveInteger(now, Date.now());
  event.phase = 'resolved';
  event.resolvedAt = timestamp;
  event.updatedAt = timestamp;
  event.purge.status = 'defended';
  rememberHistory(event, 'threat_resolved', timestamp, { defense: event.purge.defense });

  const participants = Object.fromEntries(
    participantIds(event).map(id => [id, contributionFor(event, id)]),
  );
  const record = {
    eventId: event.eventId,
    sequence: event.sequence,
    starId: event.starId,
    title: event.title,
    resolvedAt: timestamp,
    decision: {
      choice: event.decision.choice,
      refinementWeight: event.decision.refinementWeight,
    },
    escalation: copy(event.escalation),
    participants,
    eligiblePlayerIds: Object.keys(participants),
    claims: {},
  };
  world.threatLedger ||= [];
  if (!world.threatLedger.some(current => current.eventId === event.eventId)) world.threatLedger.push(record);
  pruneThreatLedger(world);
  return record;
}

export function registerOtherShorePurgeDefense(world, {
  eventId,
  starId,
  playerId,
  playerName,
  won = true,
  operationId,
  now = Date.now(),
} = {}) {
  const event = requireEvent(world, eventId);
  const id = requiredText(playerId, 'playerId');
  const operation = requiredText(operationId, 'operationId');
  const previous = operationReceipt(event, operation, 'purge_defense', id);
  if (previous) return previous;
  requirePhase(event, 'purge');
  advanceOtherShoreThreat(world, { eventId, now });
  if (event.purge.currentStarId !== requiredText(starId, 'starId')) {
    throw new Error(`必须位于清剿使当前所在大星 ${event.purge.currentStarId}`);
  }

  const duplicate = Boolean(event.purge.defenders[id]);
  const timestamp = positiveInteger(now, Date.now());
  let granted = 0;
  if (won === true && !duplicate) {
    granted = 1;
    event.purge.defenders[id] = {
      name: String(playerName || id),
      amount: granted,
      at: timestamp,
    };
    event.purge.defense += granted;
    event.updatedAt = timestamp;
    rememberHistory(event, 'purge_defense', timestamp, {
      playerName: String(playerName || id),
      defense: event.purge.defense,
    });
  }
  const resolved = event.purge.defense >= event.purge.defenseRequirement;
  if (resolved) resolveThreat(world, event, timestamp);

  const result = {
    duplicate,
    granted,
    defense: event.purge.defense,
    defenseRequirement: event.purge.defenseRequirement,
    occupied: event.purge.occupied,
    resolved,
    phase: event.phase,
  };
  return saveOperationReceipt(event, operation, 'purge_defense', id, result, timestamp);
}

export function claimOtherShoreThreatReward(world, {
  eventId,
  playerId,
  claimId,
  now = Date.now(),
} = {}) {
  const id = requiredText(playerId, 'playerId');
  const claim = requiredText(claimId, 'claimId');
  const record = world?.threatLedger?.find(current => current.eventId === requiredText(eventId, 'eventId'));
  if (!record) throw new Error('彼岸威胁结算记录不存在');
  if (!record.eligiblePlayerIds.includes(id)) throw new Error('本轮没有可领取的参与奖励');
  if (record.claims[id]) return { duplicate: true, claim: copy(record.claims[id]), reward: copy(record.participants[id]) };
  if (Object.values(record.claims).some(current => current.claimId === claim)) {
    throw new Error('claimId 已用于其他领奖记录');
  }
  record.claims[id] = { claimId: claim, claimedAt: positiveInteger(now, Date.now()) };
  pruneThreatLedger(world);
  return { duplicate: false, claim: copy(record.claims[id]), reward: copy(record.participants[id]) };
}

function createScaledSnapshot(player, {
  eventId,
  starId,
  playerId,
  now,
  random,
  type,
  name,
  scale,
  idPrefix,
}) {
  if (!player || typeof player !== 'object') throw new TypeError('player 不能为空');
  const source = copy(player);
  const jitter = 0.95 + randomValue(random) * 0.1;
  const multiplier = scale * jitter;
  const scaled = field => Math.max(1, Math.round(finite(source[field], 1) * multiplier));
  const maxHp = scaled('血量上限');
  return {
    id: `${idPrefix}-${requiredText(eventId, 'eventId')}-${requiredText(playerId || source.id || source.qq || source.userId || 'player', 'playerId')}-${positiveInteger(now, Date.now())}`,
    eventId: String(eventId),
    starId: requiredText(starId, 'starId'),
    type,
    名号: name(source),
    攻击: scaled('攻击'),
    防御: scaled('防御'),
    当前血量: maxHp,
    血量上限: maxHp,
    暴击率: Math.min(1, Math.max(0, finite(source.暴击率) * multiplier)),
    暴击伤害: Math.max(1, finite(source.暴击伤害, 1.5) * multiplier),
    闪避率: Math.min(0.8, Math.max(0, finite(source.闪避率) * multiplier)),
    吸血率: Math.min(0.8, Math.max(0, finite(source.吸血率) * multiplier)),
    穿透: Math.max(0, Math.round(finite(source.穿透) * multiplier)),
    速度: scaled('速度'),
    元神: scaled('元神'),
    生命本源: scaled('生命本源'),
    level_id: positiveInteger(source.level_id, 1),
    Physique_id: positiveInteger(source.Physique_id, 1),
    mijinglevel_id: positiveInteger(source.mijinglevel_id, 1),
    xiangulevel_id: positiveInteger(source.xiangulevel_id, 1),
    huafenlevel_id: positiveInteger(source.huafenlevel_id, 1),
    灵根: copy(source.灵根 || { name: type, type: '彼岸', 法球倍率: 1 }),
    法球倍率: Math.max(0, finite(source.法球倍率, source.灵根?.法球倍率 || 1)),
    学习的功法: copy(source.学习的功法 || []),
    _忽略境界速度加成: true,
  };
}

export function createOtherShoreCalamityVariant(player, {
  eventId,
  starId,
  playerId,
  now = Date.now(),
  random = Math.random,
} = {}) {
  return createScaledSnapshot(player, {
    eventId,
    starId,
    playerId,
    now,
    random,
    type: '彼岸同源灾厄变异体',
    name: source => `${source.名号 || '无名修士'}·灾厄异相`,
    scale: 1,
    idPrefix: 'other-shore-calamity',
  });
}

export function getOtherShorePurgeEscalationProfile(escalation = {}) {
  if (escalation?.hyperdimensional === true) return OTHER_SHORE_PURGE_ESCALATION_PROFILES.hyperdimensional;
  if (escalation?.eraLord === true) return OTHER_SHORE_PURGE_ESCALATION_PROFILES.eraLord;
  return OTHER_SHORE_PURGE_ESCALATION_PROFILES.purge;
}

export function createOtherShorePurgeEnvoy(player, {
  eventId,
  starId,
  playerId,
  pressure = 1,
  escalation = {},
  now = Date.now(),
  random = Math.random,
} = {}) {
  const normalizedPressure = positiveInteger(pressure, 1);
  const profile = getOtherShorePurgeEscalationProfile(escalation);
  return {
    ...createScaledSnapshot(player, {
      eventId,
      starId,
      playerId,
      now,
      random,
      type: profile.type,
      name: source => `${profile.title}·${source.名号 || '无名修士'}`,
      scale: (1.15 + Math.min(10, normalizedPressure) * 0.05) * profile.attributeMultiplier,
      idPrefix: 'other-shore-purge',
    }),
    pressure: normalizedPressure,
    boss: profile.stage !== 'purge',
    escalationStage: profile.stage,
    escalation: {
      eraLord: escalation?.eraLord === true,
      hyperdimensional: escalation?.hyperdimensional === true,
      stage: profile.stage,
      title: profile.title,
      attributeMultiplier: profile.attributeMultiplier,
    },
    abilities: [...profile.abilities],
    能力标记: [...profile.abilities],
  };
}

function serializeEscalation(escalation = {}) {
  const profile = getOtherShorePurgeEscalationProfile(escalation);
  return {
    eraLord: escalation.eraLord === true,
    hyperdimensional: escalation.hyperdimensional === true,
    stage: profile.stage,
    title: profile.title,
    envoyType: profile.type,
    attributeMultiplier: profile.attributeMultiplier,
    abilities: [...profile.abilities],
  };
}

function publicHistory(history) {
  return (history || []).map(entry => {
    const { playerId, authorizedPlayerId, ...visible } = entry;
    return copy(visible);
  });
}

export function serializeOtherShoreThreat(world, viewerOrOptions = {}) {
  const event = world?.threat;
  if (!event) return null;
  const options = typeof viewerOrOptions === 'string'
    ? { viewerId: viewerOrOptions }
    : viewerOrOptions || {};
  const viewerId = String(options.viewerId || '');
  const positionId = String(options.positionId || '');
  const viewerContribution = viewerId ? contributionFor(event, viewerId) : contributionFor(event, '');
  const pendingRewards = (world.threatLedger || [])
    .filter(record => record.eligiblePlayerIds.includes(viewerId) && !record.claims?.[viewerId])
    .map(record => ({
      eventId: record.eventId,
      title: record.title,
      score: record.participants[viewerId].score,
      tier: record.participants[viewerId].tier,
    }));
  const claimedRewardEventIds = (world.threatLedger || [])
    .filter(record => record.claims?.[viewerId])
    .map(record => record.eventId);
  const canDecide = event.phase === 'decision' && event.decision?.authorizedPlayerId === viewerId;
  const canExecute = canDecide && positionId === event.starId;
  const canChallenge = Boolean(viewerId) && positionId === event.starId && (
    (event.phase === 'calamity' && !event.calamity?.killers?.[viewerId])
    || event.phase === 'overlord'
  );
  const canDefend = Boolean(viewerId) && event.phase === 'purge'
    && positionId === event.purge?.currentStarId
    && !event.purge?.defenders?.[viewerId];

  return {
    eventId: event.eventId,
    phase: event.phase,
    starId: event.starId,
    title: event.title,
    killCount: event.killCount,
    killTarget: event.killTarget,
    overlord: event.overlord ? {
      id: event.overlord.id,
      title: event.overlord.名号,
      status: event.overlord.status,
      currentHp: event.overlord.当前血量,
      maxHp: event.overlord.血量上限,
      revived: event.overlord.revived === true,
      contributionCount: Object.keys(event.overlord.contributions || {}).length,
      viewerDamage: viewerContribution.overlordDamage,
    } : null,
    decision: event.decision ? {
      status: event.decision.status,
      choice: event.decision.choice || null,
      chosenByName: event.decision.chosenByName || null,
      refinementWeight: finite(event.decision.refinementWeight),
      openedAt: event.decision.openedAt,
      chosenAt: event.decision.chosenAt || null,
    } : null,
    purge: event.purge ? {
      title: event.purge.title,
      reason: event.purge.reason,
      targets: copy(event.purge.targets || []),
      status: event.purge.status,
      route: [...event.purge.route],
      routeIndex: event.purge.routeIndex,
      currentStarId: event.purge.currentStarId,
      targetStarId: event.purge.targetStarId,
      nextAdvanceAt: event.purge.nextAdvanceAt,
      pressure: event.purge.pressure,
      defense: event.purge.defense,
      defenseRequirement: event.purge.defenseRequirement,
      occupied: event.purge.occupied,
      defenderCount: Object.keys(event.purge.defenders || {}).length,
      viewerDefense: viewerContribution.purgeDefense,
    } : null,
    escalation: serializeEscalation(event.escalation),
    viewer: {
      id: viewerId,
      calamityKill: viewerContribution.kill,
      overlordDamage: viewerContribution.overlordDamage,
      purgeDefense: viewerContribution.purgeDefense,
      refinementWeight: viewerContribution.refinementWeight,
      currentScore: viewerContribution.score,
      currentTier: viewerContribution.tier,
      canDecide,
      canChallenge,
      canDefend,
      canExecute,
      canRefine: canExecute && options.canRefine === true,
      canClaim: pendingRewards.length > 0,
      pendingRewardEventId: pendingRewards[0]?.eventId || null,
      pendingReward: pendingRewards.some(record => record.eventId === event.eventId),
      pendingRewards,
      claimedRewardEventIds,
    },
    history: publicHistory(event.history),
  };
}
