import { getRealmAuthorityPath } from './realmAuthority.js';

const ROUTES = Object.freeze({
  mijing: Object.freeze({ field: 'mijinglevel_id', name: '人体秘境体系' }),
  xiangu: Object.freeze({ field: 'xiangulevel_id', name: '仙古今世法' }),
  huafen: Object.freeze({ field: 'huafenlevel_id', name: '花粉进化路' }),
});

const OWN_WAY_CREATION_REALMS = Object.freeze({
  mijing: Object.freeze({ realmId: 13, realmName: '圣人王' }),
  xiangu: Object.freeze({ realmId: 12, realmName: '虚道境' }),
  huafen: Object.freeze({ realmId: 12, realmName: '神祇境' }),
});

export const OWN_WAY_ROUTE_REALM_GATES = Object.freeze([
  Object.freeze({ target: 1, requirements: Object.freeze({
    mijing: Object.freeze({ realmId: 14, realmName: '大圣' }),
    xiangu: Object.freeze({ realmId: 13, realmName: '斩我境' }),
    huafen: Object.freeze({ realmId: 13, realmName: '神将境' }),
  }) }),
  Object.freeze({ target: 2, requirements: Object.freeze({
    mijing: Object.freeze({ realmId: 15, realmName: '准帝九重天' }),
    xiangu: Object.freeze({ realmId: 14, realmName: '遁一境' }),
    huafen: Object.freeze({ realmId: 14, realmName: '神王境' }),
  }) }),
  Object.freeze({ target: 3, requirements: Object.freeze({
    mijing: Object.freeze({ realmId: 16, realmName: '大帝' }),
    xiangu: Object.freeze({ realmId: 15, realmName: '至尊境' }),
    huafen: Object.freeze({ realmId: 15, realmName: '天尊境' }),
  }) }),
  Object.freeze({ target: 4, requirements: Object.freeze({
    mijing: Object.freeze({ realmId: 17, realmName: '红尘仙' }),
    xiangu: Object.freeze({ realmId: 16, realmName: '真仙境' }),
    huafen: Object.freeze({ realmId: 17, realmName: '大宇境/究极境' }),
  }) }),
  Object.freeze({ target: 5, requirements: Object.freeze({
    mijing: Object.freeze({ realmId: 18, realmName: '仙王' }),
    xiangu: Object.freeze({ realmId: 17, realmName: '仙王' }),
    huafen: Object.freeze({ realmId: 18, realmName: '宇究境' }),
  }) }),
  Object.freeze({ target: 6, requirements: Object.freeze({
    mijing: Object.freeze({ realmId: 20, realmName: '道祖准仙帝' }),
    xiangu: Object.freeze({ realmId: 21, realmName: '准仙帝' }),
    huafen: Object.freeze({ realmId: 21, realmName: '道祖准仙帝' }),
  }) }),
  Object.freeze({ target: 7, requirements: Object.freeze({
    mijing: Object.freeze({ realmId: 21, realmName: '路尽级仙帝' }),
    xiangu: Object.freeze({ realmId: 22, realmName: '路尽级仙帝' }),
    huafen: Object.freeze({ realmId: 22, realmName: '路尽级仙帝' }),
  }) }),
  Object.freeze({ target: 8, requirements: Object.freeze({
    mijing: Object.freeze({ realmId: 22, realmName: '祭道' }),
    xiangu: Object.freeze({ realmId: 23, realmName: '祭道' }),
    huafen: Object.freeze({ realmId: 23, realmName: '祭道' }),
  }) }),
]);

function normalizeRoute(value) {
  const route = String(value || '').trim();
  if (ROUTES[route]) return route;
  if (['人体秘境', '人体秘境体系', '遮天人体秘境'].includes(route)) return 'mijing';
  if (['仙古体系', '仙古今世法'].includes(route)) return 'xiangu';
  if (['花粉路', '花粉进化路'].includes(route)) return 'huafen';
  return '';
}

export function resolveOwnWayRoute(player) {
  const records = Array.isArray(player?.自身之道创造) ? player.自身之道创造 : [];
  const record = records[records.length - 1] || {};
  const candidates = [
    player?.自身之道体系,
    player?.额外体系,
    record.主修体系标识,
    record.主修体系,
    player?.自创修炼体系?.route,
  ];
  for (const candidate of candidates) {
    const route = normalizeRoute(candidate);
    if (route) return route;
  }
  return getRealmAuthorityPath(player);
}

export function bindOwnWayRoute(player, route = resolveOwnWayRoute(player)) {
  const normalized = normalizeRoute(route) || getRealmAuthorityPath(player);
  player.自身之道体系 = normalized;
  return normalized;
}

export function getOwnWayRealmGate(player, targetIndex) {
  const normalizedTarget = Number(targetIndex);
  const route = resolveOwnWayRoute(player);
  const routeConfig = ROUTES[route];
  const gate = OWN_WAY_ROUTE_REALM_GATES.find(item => item.target === normalizedTarget);
  const requirement = normalizedTarget === 0
    ? OWN_WAY_CREATION_REALMS[route]
    : gate?.requirements?.[route];
  if ((normalizedTarget !== 0 && !gate) || !routeConfig || !requirement) {
    return { ok: false, reason: 'route', route, targetIndex: normalizedTarget, missing: ['自身之道所属体系数据异常'] };
  }

  const currentRealmId = Math.max(0, Math.trunc(Number(player?.[routeConfig.field]) || 0));
  const ok = currentRealmId >= requirement.realmId;
  return {
    ok,
    reason: ok ? 'ready' : 'realm',
    route,
    routeName: routeConfig.name,
    field: routeConfig.field,
    currentRealmId,
    requiredRealmId: requirement.realmId,
    requiredRealmName: requirement.realmName,
    missing: ok ? [] : [
      `${routeConfig.name}达到${requirement.realmName}（${routeConfig.field}>=${requirement.realmId}，当前${currentRealmId}）`,
    ],
  };
}
