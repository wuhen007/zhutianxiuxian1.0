import { readXianguSharedDocument, updateXianguSharedDocument } from './xianguSharedState.js';
import { recordXianguArenaWin } from './xianguCombat.js';

export const XIANGU_ARENA_FRAGMENT_ID = 'xiangu_arena';
export const XIANGU_ULTIMATE_FRAGMENT_ID = 'xiangu_ultimate';

function getArenaScope(roundId) {
  const normalizedRoundId = String(roundId ?? '').trim();
  if (!normalizedRoundId) throw new TypeError('仙古擂台轮次不能为空');
  return {
    worldSeed: normalizedRoundId,
    fragmentId: XIANGU_ARENA_FRAGMENT_ID,
    entityId: 'arena-event',
  };
}

export function normalizeXianguArenaState(document = {}, roundId) {
  document.version = 1;
  document.roundId = String(roundId);
  document.activeEvent = document.activeEvent && typeof document.activeEvent === 'object'
    ? document.activeEvent
    : null;
  document.lastEventTime = Math.max(0, Number(document.lastEventTime) || 0);
  document.participants = Array.isArray(document.participants) ? document.participants : [];
  document.eventHistory = Array.isArray(document.eventHistory) ? document.eventHistory.slice(-10) : [];
  return document;
}

export async function readXianguArenaState(redis, roundId) {
  return normalizeXianguArenaState(
    await readXianguSharedDocument(redis, getArenaScope(roundId)),
    roundId,
  );
}

export async function startXianguArena(redis, {
  roundId,
  playerId,
  playerName,
  now = Date.now(),
  duration,
  cooldown,
  desc,
} = {}) {
  return (await updateXianguSharedDocument(redis, getArenaScope(roundId), document => {
    const state = normalizeXianguArenaState(document, roundId);
    if (state.activeEvent) return { status: 'active', state };
    const cooldownLeft = state.lastEventTime > 0
      ? state.lastEventTime + Math.max(0, Number(cooldown) || 0) - now
      : 0;
    if (cooldownLeft > 0) return { status: 'cooldown', cooldownLeft, state };

    state.activeEvent = {
      type: 'arena',
      startTime: now,
      endTime: now + Math.max(1, Number(duration) || 1),
      desc: String(desc || ''),
      location: '擂台区域',
      worldSeed: String(roundId),
    };
    state.lastEventTime = now;
    state.participants = [{
      qq: String(playerId),
      name: String(playerName || playerId),
      wins: 0,
      defeatedOpponents: [],
    }];
    return { status: 'started', state };
  })).value;
}

export async function joinXianguArena(redis, {
  roundId,
  playerId,
  playerName,
  now = Date.now(),
} = {}) {
  return (await updateXianguSharedDocument(redis, getArenaScope(roundId), document => {
    const state = normalizeXianguArenaState(document, roundId);
    if (!state.activeEvent || state.activeEvent.endTime <= now) {
      return { status: 'inactive', state };
    }
    const existing = state.participants.find(entry => String(entry.qq) === String(playerId));
    if (existing) return { status: 'joined', participant: existing, state };
    const participant = {
      qq: String(playerId),
      name: String(playerName || playerId),
      wins: 0,
      defeatedOpponents: [],
    };
    state.participants.push(participant);
    return { status: 'added', participant, state };
  })).value;
}

export function getXianguArenaBattleGate(state, attackerId, defenderId, now = Date.now()) {
  if (!state?.activeEvent || state.activeEvent.endTime <= now) {
    return { ok: false, reason: '【仙古擂台】当前擂台尚未开启或已经结束。' };
  }
  const joined = new Set((state.participants || []).map(entry => String(entry.qq)));
  if (!joined.has(String(attackerId)) || !joined.has(String(defenderId))) {
    return { ok: false, reason: '【仙古擂台】交战双方都需先在擂台报名。' };
  }
  return { ok: true };
}

export async function recordXianguArenaBattleWin(redis, {
  roundId,
  winnerId,
  loserId,
  now = Date.now(),
} = {}) {
  return (await updateXianguSharedDocument(redis, getArenaScope(roundId), document => {
    const state = normalizeXianguArenaState(document, roundId);
    const gate = getXianguArenaBattleGate(state, winnerId, loserId, now);
    if (!gate.ok) return { recorded: false, reason: gate.reason, state };
    return {
      recorded: recordXianguArenaWin(state.participants, winnerId, loserId),
      state,
    };
  })).value;
}

export async function closeXianguArena(redis, roundId, now = Date.now(), { force = false } = {}) {
  return (await updateXianguSharedDocument(redis, getArenaScope(roundId), document => {
    const state = normalizeXianguArenaState(document, roundId);
    if (!state.activeEvent || (!force && state.activeEvent.endTime > now)) return null;
    const settlement = {
      event: { ...state.activeEvent },
      participants: state.participants.map(entry => ({
        ...entry,
        defeatedOpponents: [...(entry.defeatedOpponents || [])],
      })),
    };
    state.eventHistory.push({ name: '仙古擂台', time: now, type: 'arena' });
    state.eventHistory = state.eventHistory.slice(-10);
    state.activeEvent = null;
    state.participants = [];
    return settlement;
  })).value;
}
