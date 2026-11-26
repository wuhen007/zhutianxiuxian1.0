export const BINGZI_TECHNIQUE = '兵字秘';
export const BINGZI_FRAGMENT = '兵字秘残卷';
export const BINGZI_MOUNTAIN_COUNT = 9;
export const BINGZI_DURATION_MS = 24 * 60 * 60 * 1000;

function getParticipant(state, qq) {
  return state?.participants?.[String(qq)] || null;
}

function createParticipant(qq, name, now) {
  return {
    qq: String(qq),
    name: name || `修士${qq}`,
    score: 0,
    tracedCaiClan: false,
    trackedMoonPrincess: false,
    guesses: [],
    mountainFound: false,
    observedWeaponDiagram: false,
    declaredWeapon: null,
    completedAt: null,
    joinedAt: now,
  };
}

export function createBingziLegacy(timestamp = Date.now(), random = Math.random) {
  return {
    status: 'open',
    openedAt: timestamp,
    targetMountain: 1 + Math.floor(random() * BINGZI_MOUNTAIN_COUNT),
    participants: {},
    rankings: [],
    winner: null,
    rewardedQqs: [],
  };
}

export function traceCaiClan(state, qq, name, now = Date.now()) {
  const key = String(qq);
  const participant = state.participants[key] || createParticipant(key, name, now);
  state.participants[key] = participant;
  if (participant.tracedCaiClan) return { ok: false, reason: 'duplicate', participant };
  participant.tracedCaiClan = true;
  participant.score += 10;
  return { ok: true, participant };
}

export function trackMoonPrincess(state, qq) {
  const participant = getParticipant(state, qq);
  if (!participant?.tracedCaiClan) return { ok: false, reason: 'trace_required' };
  if (participant.trackedMoonPrincess) return { ok: false, reason: 'duplicate', participant };
  participant.trackedMoonPrincess = true;
  participant.score += 10;
  const target = state.targetMountain;
  const rangeStart = Math.floor((target - 1) / 3) * 3 + 1;
  return {
    ok: true,
    participant,
    clue: {
      rangeStart,
      rangeEnd: rangeStart + 2,
      parity: target % 2 === 0 ? '偶数' : '奇数',
    },
  };
}

export function identifyBingziMountain(state, qq, mountain) {
  const participant = getParticipant(state, qq);
  if (!participant?.trackedMoonPrincess) return { ok: false, reason: 'track_required' };
  if (participant.mountainFound) return { ok: false, reason: 'already_found', participant };
  mountain = Math.trunc(Number(mountain));
  if (mountain < 1 || mountain > BINGZI_MOUNTAIN_COUNT) return { ok: false, reason: 'invalid' };
  if (participant.guesses.includes(mountain)) return { ok: false, reason: 'duplicate_guess' };
  if (participant.guesses.length >= 3) return { ok: false, reason: 'limit' };
  participant.guesses.push(mountain);
  if (mountain !== state.targetMountain) {
    return {
      ok: false,
      reason: 'wrong',
      participant,
      direction: mountain < state.targetMountain ? '更靠近主峰' : '更远离主峰',
    };
  }
  participant.mountainFound = true;
  participant.score += Math.max(10, 40 - participant.guesses.length * 10);
  return { ok: true, participant };
}

export function observeBingziDiagram(state, qq, insight = 0) {
  const participant = getParticipant(state, qq);
  if (!participant?.mountainFound) return { ok: false, reason: 'mountain_required' };
  if (participant.observedWeaponDiagram) return { ok: false, reason: 'duplicate', participant };
  const insightScore = Math.max(0, Math.min(20, Math.trunc(Number(insight) || 0)));
  participant.observedWeaponDiagram = true;
  participant.score += 25 + insightScore;
  return { ok: true, participant, insightScore };
}

export function declareOnlyWeapon(state, qq, weapon, now = Date.now()) {
  const participant = getParticipant(state, qq);
  if (!participant?.observedWeaponDiagram) return { ok: false, reason: 'observe_required' };
  if (participant.completedAt) return { ok: false, reason: 'duplicate', participant };
  if (!weapon?.name) return { ok: false, reason: 'weapon_required' };
  participant.declaredWeapon = weapon.name;
  participant.score += weapon.isEmperorWeapon ? 25 : 15;
  participant.completedAt = now;
  return { ok: true, participant };
}

export function rankBingziLegacy(state) {
  return Object.values(state?.participants || {})
    .map((participant) => ({ ...participant }))
    .sort((a, b) =>
      Number(Boolean(b.completedAt)) - Number(Boolean(a.completedAt)) ||
      (Number(b.score) || 0) - (Number(a.score) || 0) ||
      (Number(a.completedAt) || Number.MAX_SAFE_INTEGER) -
        (Number(b.completedAt) || Number.MAX_SAFE_INTEGER) ||
      (Number(a.joinedAt) || 0) - (Number(b.joinedAt) || 0)
    );
}

export function settleBingziLegacy(state, now = Date.now()) {
  if (state.status === 'settled') return { ok: true, alreadySettled: true, state };
  state.status = 'settled';
  state.settledAt = now;
  state.rankings = rankBingziLegacy(state);
  return { ok: true, state };
}
