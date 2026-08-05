import { getPlayerPlaneCoordinate, getPlayerPlaneName } from './planeCoords.js';

export const TIANJIAO_SCENT_USES = 3;
export const SOURCE_STONE_FIELD_DURATION_MS = 24 * 60 * 60 * 1000;
export const SOURCE_STONE_FIELD_USES = 3;

export const SOURCE_STONE_FIELD_CONFIG = Object.freeze({
  源地师: Object.freeze({ name: '寻龙点穴阵', cost: 1_000_000, multiplier: 1.2 }),
  源天师: Object.freeze({ name: '源天神阵', cost: 3_000_000, multiplier: 1.35 }),
});

export function calculateTianjiTrainingReward(player, quantity = 1, options = {}) {
  const random = options.random || Math.random;
  const count = Math.max(1, Math.floor(Number(quantity) || 1));
  const level = Number(player?.level_id) || 0;
  const physique = Number(player?.Physique_id) || 0;
  const mijing = Number(player?.mijinglevel_id) || 0;
  const xiangu = Number(player?.xiangulevel_id) || 0;
  const doubleChance = Math.min(0.5, Math.max(0.05, 0.2 + (Number(player?.幸运) || 0)));
  let cultivation = 0;
  let blood = 0;
  let doubled = 0;

  for (let index = 0; index < count; index++) {
    const cultivationBase = Math.trunc(2000 + 10000 * level ** 2 * mijing * xiangu * (2 + random()));
    const bloodBase = Math.trunc(2000 + 10000 * physique ** 2 * mijing * xiangu * (2 + random()));
    const multiplier = random() < doubleChance ? 2 : 1;
    cultivation += cultivationBase * multiplier;
    blood += bloodBase * multiplier;
    if (multiplier === 2) doubled++;
  }

  return { cultivation, blood, doubled, count, doubleChance };
}

export function activateTianjiaoScent(player, now = Date.now()) {
  const active = player?.万里追息;
  if (Number(active?.remaining) > 0) return { ok: false, reason: 'active', state: active };
  player.万里追息 = { target: '', remaining: TIANJIAO_SCENT_USES, activatedAt: now };
  return { ok: true, state: player.万里追息 };
}

export function getTianjiaoScentAccess(player, target) {
  const state = player?.万里追息;
  if (!state || Number(state.remaining) <= 0) return { ok: false, reason: 'none', state: null };
  if (state.target && state.target !== target) return { ok: false, reason: 'target', state };
  return { ok: true, reason: null, state };
}

export function consumeTianjiaoScent(player, target) {
  const access = getTianjiaoScentAccess(player, target);
  if (!access.ok) return access;
  const state = access.state;
  if (!state.target) state.target = target;
  state.remaining--;
  const result = { ok: true, target: state.target, remaining: state.remaining };
  if (state.remaining <= 0) delete player.万里追息;
  return result;
}

export function prepareSourceStoneField(player, now = Date.now()) {
  const config = SOURCE_STONE_FIELD_CONFIG[player?.occupation];
  if (!config) return { ok: false, reason: 'occupation' };
  if (Number(player?.源石场?.expiresAt) > now && Number(player?.源石场?.remaining) > 0) {
    return { ok: false, reason: 'active', field: player.源石场 };
  }
  const plane = getPlayerPlaneName(player);
  const coordinate = getPlayerPlaneCoordinate(player, plane);
  if (!plane || !coordinate) return { ok: false, reason: 'location' };
  if ((Number(player.源石) || 0) < config.cost) {
    return { ok: false, reason: 'cost', cost: config.cost };
  }

  player.源石 -= config.cost;
  player.源石场 = {
    name: config.name,
    profession: player.occupation,
    plane,
    coordinate,
    multiplier: config.multiplier,
    remaining: SOURCE_STONE_FIELD_USES,
    createdAt: now,
    expiresAt: now + SOURCE_STONE_FIELD_DURATION_MS,
  };
  return { ok: true, cost: config.cost, field: player.源石场 };
}

export function getSourceStoneFieldAccess(player, now = Date.now()) {
  const field = player?.源石场;
  if (!field || Number(field.remaining) <= 0) return { ok: false, reason: 'none', field: null };
  if (Number(field.expiresAt) <= now) return { ok: false, reason: 'expired', field };
  const plane = getPlayerPlaneName(player);
  const coordinate = getPlayerPlaneCoordinate(player, plane);
  if (plane !== field.plane) return { ok: false, reason: 'plane', field };
  if (!coordinate || coordinate.x !== Number(field.coordinate?.x) || coordinate.y !== Number(field.coordinate?.y)) {
    return { ok: false, reason: 'coordinate', field };
  }
  return { ok: true, reason: null, field };
}

export function applyPveStatMultiplier(combatant, multiplier) {
  for (const field of ['攻击', '防御', '当前血量', '血量上限']) {
    combatant[field] = Math.max(1, Math.floor((Number(combatant[field]) || 0) * multiplier));
  }
  return combatant;
}

export function consumeSourceStoneField(player, combatant, now = Date.now()) {
  const access = getSourceStoneFieldAccess(player, now);
  if (!access.ok) return access;
  const { field } = access;
  applyPveStatMultiplier(combatant, Number(field.multiplier) || 1);
  field.remaining--;
  const result = {
    ok: true,
    consumed: true,
    name: field.name,
    multiplier: field.multiplier,
    remaining: field.remaining,
  };
  if (field.remaining <= 0) delete player.源石场;
  return result;
}
