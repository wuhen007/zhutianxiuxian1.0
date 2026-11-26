import { getLocationId } from './weimianTravel.js';

function playerKeyPart(playerId) {
  return String(playerId);
}

export function getFashanActionKey(playerId) {
  return `xiuxian:player:${playerKeyPart(playerId)}:action:fashan`;
}

export function getFashanHistoryKey(playerId) {
  return `xiuxian:player:${playerKeyPart(playerId)}:addiction_history:fashan`;
}

export function getFashanTravelKey(playerId) {
  return `xiuxian:travel_task:${playerKeyPart(playerId)}:fashan`;
}

export function isFashanReady(player) {
  return Number(player?.法身) === 1 && player?.法身状态 !== '行动中';
}

export function isFashanActionPending(action, now = Date.now()) {
  if (!action || typeof action !== 'object' || action.is_jiesuan == 1) return false;
  if (action.eternal_guard === '1') return true;
  if (action.Place_action == '0' || action.Place_actionplus == '0' || action.time_river == '0' || action.shengxuTaskId) return true;
  const endTime = Number(action.end_time);
  return Number.isFinite(endTime) && endTime > Number(now);
}

export function getActorPlane(player, actor = 'body') {
  const rawPlane = actor === 'fashan' ? player?.法身位置 : player?.power_place;
  return getLocationId(rawPlane);
}

export function requireActorAtPlane(player, expectedPlane, actor = 'body') {
  const expected = getLocationId(expectedPlane);
  const actual = getActorPlane(player, actor);
  const ok = Number.isFinite(actual) && Number.isFinite(expected) && actual === expected;
  return {
    ok,
    expected,
    actual,
    reason: ok ? null : (Number.isFinite(actual) ? 'plane-mismatch' : 'missing-plane'),
  };
}
