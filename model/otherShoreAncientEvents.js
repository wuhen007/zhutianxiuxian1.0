import { getOtherShoreTrueWorldSector } from './otherShoreTrueWorld.js';

export const OTHER_SHORE_ANCIENT_EVENTS_KEY = 'ancientEvents';
export const OTHER_SHORE_ANCIENT_EVENTS_VERSION = 1;
export const OTHER_SHORE_ANCIENT_EVENT_RECEIPT_LIMIT = 300;

export const OTHER_SHORE_ANCIENT_EVENT_CATALOG = Object.freeze([
  Object.freeze({
    id: 'qin-qi-refiner-ancestral-court',
    order: 1,
    type: 'chapter',
    name: '先秦炼气祖庭',
    coordinate: '7,-3',
    contributionRequired: 120,
    description: '复原先秦炼气士以星辰为炉、以身为种的祖庭古史。',
    opposition: Object.freeze(['祖庭道火残灵', '裂界守史人']),
    reward: Object.freeze({
      ancientHistory: Object.freeze([
        Object.freeze({ id: 'qin-qi-origin-history', name: '先秦炼气古史·祖庭道火录' }),
      ]),
    }),
  }),
  Object.freeze({
    id: 'spirit-rift-source-court',
    order: 2,
    type: 'chapter',
    name: '灵界裂隙源庭',
    coordinate: '-9,4',
    contributionRequired: 180,
    description: '沿旧源谱追溯灵界裂隙，拼合彼岸古文明第一次越界的炼制术。',
    opposition: Object.freeze(['裂界巡猎者', '源庭校正阵']),
    reward: Object.freeze({
      recipeUnlocks: Object.freeze([
        Object.freeze({ id: 'rift-origin-dao-treasure-method', name: '大道至宝炼制法·裂界归源篇' }),
      ]),
    }),
  }),
  Object.freeze({
    id: 'forbidden-treasure-cleansing-court',
    order: 3,
    type: 'chapter',
    name: '禁宝清算庭',
    coordinate: '13,-8',
    contributionRequired: 260,
    description: '攻入清算中枢，截获尚未被无尽商店收录的先天至宝天机。',
    opposition: Object.freeze(['禁宝司清算舰队', '违禁因果裁定者']),
    reward: Object.freeze({
      innateTreasureClues: Object.freeze([
        Object.freeze({ id: 'unrecorded-primordial-treasure-clue', name: '未录先天至宝·太初界舟线索' }),
      ]),
    }),
  }),
  Object.freeze({
    id: 'era-overlord-observatory-finale',
    order: 4,
    type: 'finale',
    name: '纪元主宰观测台',
    coordinate: '21,-13',
    contributionRequired: 400,
    description: '切断逻辑彼岸的观测链，同时迎战纪元主宰投影与超维清算者。',
    opposition: Object.freeze(['纪元主宰·逻辑投影', '超维清算者·断律使']),
    reward: Object.freeze({
      ancientHistory: Object.freeze([
        Object.freeze({ id: 'logical-shore-final-record', name: '逻辑彼岸古史·纪元清算终卷' }),
      ]),
      authorities: Object.freeze([
        Object.freeze({ id: 'era-overlord-observation', name: '纪元主宰观测权柄残片' }),
        Object.freeze({ id: 'hyperdimensional-cleansing-mark', name: '超维清算者断律印记' }),
      ]),
    }),
  }),
]);

const EVENT_BY_ID = new Map(OTHER_SHORE_ANCIENT_EVENT_CATALOG.map(event => [event.id, event]));
const EVENT_BY_COORDINATE = new Map(
  OTHER_SHORE_ANCIENT_EVENT_CATALOG.map(event => [event.coordinate, event]),
);

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label}不能为空`);
  return text;
}

function whole(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}

function positiveWhole(value, label) {
  const number = whole(value);
  if (number <= 0) throw new Error(`${label}必须为正整数`);
  return number;
}

function timestamp(value) {
  return whole(value, Date.now());
}

function requireWorld(world) {
  if (!world || typeof world !== 'object') throw new TypeError('world 必须是世界文档');
  return world;
}

function eventDefinition(eventIdOrCoordinate) {
  const key = requiredText(eventIdOrCoordinate, 'eventId');
  const definition = EVENT_BY_ID.get(key) || EVENT_BY_COORDINATE.get(key);
  if (!definition) throw new Error(`未知的彼岸古文明事件：${key}`);
  return definition;
}

function createEventRecord(definition) {
  return {
    id: definition.id,
    status: definition.order === 1 ? 'active' : 'locked',
    progress: 0,
    contributionRequired: definition.contributionRequired,
    contributions: {},
    completedAt: null,
    completedBy: null,
    claims: {},
    unlockedAt: definition.order === 1 ? 0 : null,
    updatedAt: 0,
  };
}

function normalizeEventRecord(record, definition) {
  record.id = definition.id;
  record.progress = Math.min(
    definition.contributionRequired,
    whole(record.progress),
  );
  record.contributionRequired = definition.contributionRequired;
  record.contributions ||= {};
  record.claims ||= {};
  record.completedAt = record.completedAt == null ? null : whole(record.completedAt);
  record.completedBy = record.completedBy == null ? null : String(record.completedBy);
  record.unlockedAt = record.unlockedAt == null ? null : whole(record.unlockedAt);
  record.updatedAt = whole(record.updatedAt);
  for (const [playerId, contribution] of Object.entries(record.contributions)) {
    record.contributions[playerId] = {
      playerId,
      playerName: String(contribution?.playerName || playerId),
      amount: whole(contribution?.amount),
      lastContributedAt: whole(contribution?.lastContributedAt),
    };
  }
  return record;
}

function recalculateState(state) {
  let previousCompleted = true;
  let completedCount = 0;
  let activeEventId = null;
  for (const definition of OTHER_SHORE_ANCIENT_EVENT_CATALOG) {
    const record = state.events[definition.id];
    const completed = record.progress >= definition.contributionRequired || record.completedAt != null;
    if (completed) {
      record.progress = definition.contributionRequired;
      record.status = 'completed';
      completedCount++;
    } else if (previousCompleted) {
      record.status = 'active';
      record.unlockedAt ??= 0;
      activeEventId ||= definition.id;
    } else {
      record.status = 'locked';
    }
    previousCompleted = completed;
  }
  state.completedCount = completedCount;
  state.activeEventId = activeEventId;
  state.finaleUnlocked = state.events['forbidden-treasure-cleansing-court'].status === 'completed';
  state.status = completedCount === OTHER_SHORE_ANCIENT_EVENT_CATALOG.length
    ? 'completed'
    : 'active';
}

export function ensureOtherShoreAncientEvents(world) {
  requireWorld(world);
  const state = (world[OTHER_SHORE_ANCIENT_EVENTS_KEY] ||= {});
  state.version = OTHER_SHORE_ANCIENT_EVENTS_VERSION;
  state.chainId = 'other-shore-ancient-civilization';
  state.events ||= {};
  state.receipts ||= {};
  state.updatedAt = whole(state.updatedAt);
  for (const definition of OTHER_SHORE_ANCIENT_EVENT_CATALOG) {
    const record = (state.events[definition.id] ||= createEventRecord(definition));
    normalizeEventRecord(record, definition);
  }
  recalculateState(state);
  return state;
}

export const ensureAncientEvents = ensureOtherShoreAncientEvents;

function receiptFor(state, { operationId, action, actorId, requestKey }) {
  const id = requiredText(operationId, 'operationId');
  const receipt = state.receipts[id];
  if (!receipt) return null;
  if (
    receipt.action !== action
    || receipt.actorId !== actorId
    || receipt.requestKey !== requestKey
  ) {
    throw new Error('operationId 已用于其他彼岸古文明行动');
  }
  return copy(receipt.result);
}

function saveReceipt(state, { operationId, action, actorId, requestKey, result, now }) {
  const id = requiredText(operationId, 'operationId');
  state.receipts[id] = {
    action,
    actorId,
    requestKey,
    at: timestamp(now),
    result: copy(result),
  };
  const ids = Object.keys(state.receipts);
  for (const stale of ids.slice(0, Math.max(0, ids.length - OTHER_SHORE_ANCIENT_EVENT_RECEIPT_LIMIT))) {
    delete state.receipts[stale];
  }
  return copy(result);
}

function rewardUnlocks(state) {
  const unlocks = {
    ancientHistory: [],
    recipeUnlocks: [],
    innateTreasureClues: [],
    authorities: [],
  };
  for (const definition of OTHER_SHORE_ANCIENT_EVENT_CATALOG) {
    if (state.events[definition.id].status !== 'completed') continue;
    for (const [kind, entries] of Object.entries(definition.reward)) {
      unlocks[kind].push(...copy(entries));
    }
  }
  return unlocks;
}

function serializeEvent(world, state, definition, viewerId = '') {
  const record = state.events[definition.id];
  const contribution = record.contributions[viewerId]?.amount || 0;
  const claimed = Boolean(record.claims[viewerId]);
  const sectorExplored = world?.trueWorld?.sectors?.[definition.coordinate]?.status === 'explored';
  return {
    id: definition.id,
    order: definition.order,
    type: definition.type,
    name: definition.name,
    coordinate: definition.coordinate,
    sectorExplored,
    description: definition.description,
    opposition: [...definition.opposition],
    status: record.status,
    progress: record.progress,
    contributionRequired: definition.contributionRequired,
    progressPercent: Number(((record.progress / definition.contributionRequired) * 100).toFixed(2)),
    contributorCount: Object.keys(record.contributions).length,
    completedAt: record.completedAt,
    completedBy: record.completedBy,
    reward: copy(definition.reward),
    viewer: {
      contribution,
      claimed,
      canContribute: Boolean(viewerId) && record.status === 'active' && sectorExplored,
      canClaim: Boolean(viewerId) && record.status === 'completed' && contribution > 0 && !claimed,
    },
  };
}

export function getOtherShoreAncientEvent(world, eventIdOrCoordinate, options = {}) {
  const state = ensureOtherShoreAncientEvents(world);
  const definition = eventDefinition(eventIdOrCoordinate);
  const viewerId = String(options.viewerId || options.playerId || '');
  return serializeEvent(world, state, definition, viewerId);
}

export const getAncientEvent = getOtherShoreAncientEvent;

export function contributeOtherShoreAncientEvent(world, {
  eventId,
  playerId,
  playerName,
  amount = 1,
  operationId,
  now = Date.now(),
} = {}) {
  const state = ensureOtherShoreAncientEvents(world);
  const definition = eventDefinition(eventId);
  const actorId = requiredText(playerId, 'playerId');
  const contributionAmount = positiveWhole(amount, 'amount');
  const requestKey = `${definition.id}:${contributionAmount}`;
  const replay = receiptFor(state, {
    operationId,
    action: 'contribute',
    actorId,
    requestKey,
  });
  if (replay) return replay;

  const record = state.events[definition.id];
  if (record.status === 'locked') throw new Error('前置彼岸古文明章节尚未完成');
  if (record.status === 'completed') throw new Error('彼岸古文明章节已经完成');
  if (getOtherShoreTrueWorldSector(world, definition.coordinate).status !== 'explored') {
    throw new Error(`必须先探索真世界扇区 ${definition.coordinate}`);
  }

  const at = timestamp(now);
  const applied = Math.min(contributionAmount, definition.contributionRequired - record.progress);
  const contribution = (record.contributions[actorId] ||= {
    playerId: actorId,
    playerName: String(playerName || actorId),
    amount: 0,
    lastContributedAt: 0,
  });
  contribution.playerName = String(playerName || contribution.playerName || actorId);
  contribution.amount += applied;
  contribution.lastContributedAt = at;
  record.progress += applied;
  record.updatedAt = at;
  state.updatedAt = at;

  const chapterCompleted = record.progress >= definition.contributionRequired;
  if (chapterCompleted) {
    record.status = 'completed';
    record.completedAt = at;
    record.completedBy = actorId;
    const next = OTHER_SHORE_ANCIENT_EVENT_CATALOG[definition.order];
    if (next) {
      state.events[next.id].status = 'active';
      state.events[next.id].unlockedAt = at;
    }
  }
  recalculateState(state);

  const result = {
    eventId: definition.id,
    coordinate: definition.coordinate,
    applied,
    playerContribution: contribution.amount,
    progress: record.progress,
    contributionRequired: definition.contributionRequired,
    chapterCompleted,
    nextEventId: chapterCompleted ? state.activeEventId : null,
    chainCompleted: state.status === 'completed',
    unlockedReward: chapterCompleted ? copy(definition.reward) : null,
  };
  return saveReceipt(state, {
    operationId,
    action: 'contribute',
    actorId,
    requestKey,
    result,
    now: at,
  });
}

export const contributeAncientEvent = contributeOtherShoreAncientEvent;

export function claimOtherShoreAncientEventReward(world, {
  eventId,
  playerId,
  operationId,
  now = Date.now(),
} = {}) {
  const state = ensureOtherShoreAncientEvents(world);
  const definition = eventDefinition(eventId);
  const actorId = requiredText(playerId, 'playerId');
  const requestKey = definition.id;
  const replay = receiptFor(state, {
    operationId,
    action: 'claim',
    actorId,
    requestKey,
  });
  if (replay) return replay;

  const record = state.events[definition.id];
  if (record.status !== 'completed') throw new Error('彼岸古文明章节尚未完成');
  if (!record.contributions[actorId]?.amount) throw new Error('本章节没有可领取的贡献奖励');

  const existing = record.claims[actorId];
  const at = timestamp(now);
  const claim = existing || {
    claimId: `ancient:${definition.id}:${actorId}`,
    claimedAt: at,
    reward: copy(definition.reward),
  };
  if (!existing) {
    record.claims[actorId] = claim;
    record.updatedAt = at;
    state.updatedAt = at;
  }
  const result = {
    eventId: definition.id,
    duplicate: Boolean(existing),
    claim: copy(claim),
    reward: copy(claim.reward),
  };
  return saveReceipt(state, {
    operationId,
    action: 'claim',
    actorId,
    requestKey,
    result,
    now: at,
  });
}

export const claimAncientEventReward = claimOtherShoreAncientEventReward;

export function serializeOtherShoreAncientEvents(world, options = {}) {
  const state = ensureOtherShoreAncientEvents(world);
  const viewerId = String(options.viewerId || options.playerId || '');
  const events = OTHER_SHORE_ANCIENT_EVENT_CATALOG.map(definition =>
    serializeEvent(world, state, definition, viewerId));
  const claimedEventIds = events.filter(event => event.viewer.claimed).map(event => event.id);
  const claimableEventIds = events.filter(event => event.viewer.canClaim).map(event => event.id);
  return {
    version: state.version,
    chainId: state.chainId,
    status: state.status,
    activeEventId: state.activeEventId,
    completedCount: state.completedCount,
    chapterCount: 3,
    eventCount: events.length,
    finaleUnlocked: state.finaleUnlocked,
    finalEventId: 'era-overlord-observatory-finale',
    globalUnlocks: rewardUnlocks(state),
    events,
    viewer: {
      playerId: viewerId,
      totalContribution: events.reduce((total, event) => total + event.viewer.contribution, 0),
      claimableEventIds,
      claimedEventIds,
      canClaim: claimableEventIds.length > 0,
    },
  };
}

export const serializeAncientEvents = serializeOtherShoreAncientEvents;
