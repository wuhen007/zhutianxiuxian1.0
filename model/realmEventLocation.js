import {
  getLocation,
  getPlaneLocations,
  getPlayerPlaneCoordinate,
  getPlayerPlaneName,
  listMappedPlanes,
  randomCoordIn,
} from "./planeCoords.js";
import { PLACE_LOCATION_MAP } from "./weimianTravel.js";

function pickRandom(items, random) {
  return items[Math.floor(random() * items.length)];
}

/** 为位面事件生成玩家能够抵达的真实地点与坐标。 */
export function createRealmEventLocation(options = {}) {
  const random = options.random || Math.random;
  const mappedPlanes = listMappedPlanes().filter((name) =>
    Object.hasOwn(PLACE_LOCATION_MAP, name)
  );
  const plane = mappedPlanes.includes(options.plane)
    ? options.plane
    : pickRandom(mappedPlanes, random);
  if (!plane) return null;

  const requested = options.location
    ? getLocation(plane, options.location)
    : null;
  const candidates = getPlaneLocations(plane).filter(
    (location) => location.type === "site"
  );
  const location = requested || pickRandom(candidates, random);
  if (!location) return null;

  return {
    plane,
    location: location.name,
    coordinate: randomCoordIn(location, random),
  };
}

/** 新事件显示精确坐标；旧事件没有坐标时仍显示原地点文本。 */
export function formatRealmEventLocation(event, fallback = "未知地点") {
  const plane = event?.plane || event?.sourcePlane || "";
  const location = event?.location || "";
  const name = [plane, location].filter(Boolean).join("·") || fallback;
  const x = Number(event?.coordinate?.x);
  const y = Number(event?.coordinate?.y);
  return Number.isInteger(x) && Number.isInteger(y)
    ? `${name}（坐标 ${x},${y}）`
    : name;
}

export function formatRealmEventTravel(event) {
  const x = Number(event?.coordinate?.x);
  const y = Number(event?.coordinate?.y);
  const plane = event?.plane || event?.sourcePlane;
  if (!plane || !Number.isInteger(x) || !Number.isInteger(y)) return "";
  return `先穿梭至${plane}，再发送 #前往${x},${y}`;
}

/** 校验玩家是否已抵达事件所在位面与精确坐标。 */
export function getRealmEventReach(player, event) {
  const eventPlane = event?.plane || event?.sourcePlane || null;
  const currentPlane = getPlayerPlaneName(player);
  if (!eventPlane || currentPlane !== eventPlane) {
    return {
      ok: false,
      reason: "plane",
      eventPlane,
      currentPlane,
      currentCoordinate: null,
    };
  }

  const x = Number(event?.coordinate?.x);
  const y = Number(event?.coordinate?.y);
  const currentCoordinate = getPlayerPlaneCoordinate(player, eventPlane);
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return {
      ok: true,
      reason: null,
      eventPlane,
      currentPlane,
      currentCoordinate,
    };
  }
  if (
    !currentCoordinate ||
    currentCoordinate.x !== x ||
    currentCoordinate.y !== y
  ) {
    return {
      ok: false,
      reason: "coordinate",
      eventPlane,
      currentPlane,
      currentCoordinate,
    };
  }
  return {
    ok: true,
    reason: null,
    eventPlane,
    currentPlane,
    currentCoordinate,
  };
}
