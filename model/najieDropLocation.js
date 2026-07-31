import {
  calcCoordDistance,
  getCoordLimit,
  getPlayerPlaneCoordinate,
  getPlayerPlaneName,
  listMappedPlanes,
} from './planeCoords.js';
import { PLACE_LOCATION_MAP } from './weimianTravel.js';

const LEGACY_PLANE_ALIASES = Object.freeze({
  禁地: '遮天位面',
  仙境: '仙界',
  仙古秘境: '九天十地',
  古地府: '界海',
  轮回路: '凡间',
});

export function getNajieDropPlanes() {
  return listMappedPlanes()
    .filter(name => Object.hasOwn(PLACE_LOCATION_MAP, name))
    .map(name => ({ id: PLACE_LOCATION_MAP[name], name }));
}

function wrapCoordinate(value, max) {
  const size = max + 1;
  const number = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0;
  return ((number % size) + size) % size;
}

/** 将旧版虚构位面/超范围坐标稳定迁移到正式坐标轴。 */
export function normalizeNajieDropLocation(location = {}) {
  const planes = getNajieDropPlanes();
  const { maxX, maxY } = getCoordLimit();
  if (planes.length === 0) {
    return {
      ...location,
      weimianId: 0,
      weimianName: '凡间',
      x: wrapCoordinate(location.x, maxX),
      y: wrapCoordinate(location.y, maxY),
      coordinateVersion: 2,
    };
  }
  let planeName = LEGACY_PLANE_ALIASES[location.weimianName] || location.weimianName;
  if (!planes.some(plane => plane.name === planeName)) {
    const legacyId = Math.abs(Math.trunc(Number(location.weimianId) || 0));
    planeName = planes[legacyId % planes.length]?.name || '凡间';
  }
  const plane = planes.find(item => item.name === planeName) || planes[0];
  return {
    ...location,
    weimianId: plane.id,
    weimianName: plane.name,
    x: wrapCoordinate(location.x, maxX),
    y: wrapCoordinate(location.y, maxY),
    coordinateVersion: 2,
  };
}

export function createNajieDropLocation(lunhuiCount, random = Math.random) {
  const planes = getNajieDropPlanes();
  if (planes.length === 0) return normalizeNajieDropLocation();
  const cycles = Number(lunhuiCount) || 0;
  const count = cycles <= 1
    ? 2
    : cycles <= 3
      ? 4
      : cycles <= 5
        ? 6
        : planes.length;
  const available = planes.slice(0, count);
  const plane = available[Math.floor(random() * available.length)] || available[0];
  const { maxX, maxY } = getCoordLimit();
  return {
    weimianId: plane.id,
    weimianName: plane.name,
    x: Math.min(maxX, Math.floor(random() * (maxX + 1))),
    y: Math.min(maxY, Math.floor(random() * (maxY + 1))),
    coordinateVersion: 2,
  };
}

export function checkNajieDropReach(player, rawLocation) {
  const location = normalizeNajieDropLocation(rawLocation);
  const currentPlane = getPlayerPlaneName(player);
  if (currentPlane !== location.weimianName) {
    return { ok: false, reason: 'plane', currentPlane, location };
  }
  const coordinate = getPlayerPlaneCoordinate(player, currentPlane);
  if (!coordinate) {
    return { ok: false, reason: 'unset', currentPlane, location };
  }
  const distance = calcCoordDistance(coordinate, location);
  if (distance !== 0) {
    return { ok: false, reason: 'coordinate', currentPlane, coordinate, distance, location };
  }
  return { ok: true, currentPlane, coordinate, distance: 0, location };
}

export function findNearbyNajieDrops(allDrops, player, radius) {
  const currentPlane = getPlayerPlaneName(player);
  const coordinate = getPlayerPlaneCoordinate(player, currentPlane);
  if (!currentPlane || !coordinate) return [];
  const maxRadius = Math.hypot(getCoordLimit().maxX, getCoordLimit().maxY);
  const safeRadius = Math.min(Math.max(0, Number(radius) || 0), maxRadius);

  return allDrops
    .map((drop, index) => {
      const location = normalizeNajieDropLocation(drop.location);
      return {
        drop: { ...drop, location },
        globalIndex: index + 1,
        distance: location.weimianName === currentPlane
          ? calcCoordDistance(coordinate, location)
          : Infinity,
      };
    })
    .filter(item => item.distance <= safeRadius)
    .sort((a, b) => a.distance - b.distance || a.globalIndex - b.globalIndex);
}
