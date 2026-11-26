import { calculateOtherShoreMindCost } from "./otherShoreRules.js";

export const OTHER_SHORE_MAP_RADIUS = 4;
export const OTHER_SHORE_PHASES = Object.freeze([
  "unobserved",
  "sensed",
  "visited",
  "anchored",
  "cleared",
]);

export const OTHER_SHORE_HEX_DIRECTIONS = Object.freeze([
  Object.freeze({ q: 1, r: 0 }),
  Object.freeze({ q: 1, r: -1 }),
  Object.freeze({ q: 0, r: -1 }),
  Object.freeze({ q: -1, r: 0 }),
  Object.freeze({ q: -1, r: 1 }),
  Object.freeze({ q: 0, r: 1 }),
]);

export const OTHER_SHORE_KEY_STARS = Object.freeze([
  Object.freeze({
    q: 0,
    r: 0,
    name: "沧澜祖星",
    kind: "origin",
    risk: 0,
    anchorRequirement: 0,
    description: "先秦炼气士曾由此借灵界裂缝返乡，初始道标仍记录着那条古航路。",
  }),
  Object.freeze({
    q: 4,
    r: 0,
    name: "观潮天门",
    kind: "gate",
    risk: 4,
    anchorRequirement: 8,
    description: "观测诸世界潮汐的古老天门。",
  }),
  Object.freeze({
    q: 0,
    r: 4,
    name: "归墟海眼",
    kind: "abyss",
    risk: 5,
    anchorRequirement: 9,
    description: "无数星海法则在此沉降。",
  }),
  Object.freeze({
    q: -4,
    r: 4,
    name: "万古葬星",
    kind: "tomb",
    risk: 5,
    anchorRequirement: 9,
    description: "葬着多个纪元的大星残骸。",
  }),
  Object.freeze({
    q: -4,
    r: 0,
    name: "纪元碑林",
    kind: "archive",
    risk: 3,
    anchorRequirement: 7,
    description: "彼岸古文明留下的纪元记录库。",
  }),
  Object.freeze({
    q: 0,
    r: -4,
    name: "裂界母锚",
    kind: "anchor",
    risk: 5,
    anchorRequirement: 10,
    description: "诸灵界裂缝的源头母锚，残存坐标指向先秦炼气士失落的彼岸道场。",
  }),
  Object.freeze({
    q: 4,
    r: -4,
    name: "彼岸渡口",
    kind: "harbor",
    risk: 4,
    anchorRequirement: 8,
    description: "先秦炼气士横渡两岸的古渡口，复原渡碑可反向校准灵界裂缝。",
  }),
  Object.freeze({
    q: 2,
    r: -1,
    name: "无相神墟",
    kind: "ruin",
    risk: 3,
    anchorRequirement: 6,
    description: "神形与法则均已磨灭的遗墟。",
  }),
  Object.freeze({
    q: 1,
    r: -1,
    name: "玄阙神炉",
    kind: "forge",
    risk: 4,
    anchorRequirement: 7,
    description: "亦称太初熔星，先秦炼气士曾在此锻造星路阵眼，如今炉心孕育着同源灾核。",
  }),
  Object.freeze({
    q: 1,
    r: 2,
    name: "太初熔星",
    kind: "forge",
    risk: 4,
    anchorRequirement: 7,
    description: "仍在锻造未知物质的燃烧大星。",
  }),
  Object.freeze({
    q: -2,
    r: 3,
    name: "帝落残庭",
    kind: "palace",
    risk: 4,
    anchorRequirement: 8,
    description: "某位古帝最后一座星空王庭。",
  }),
  Object.freeze({
    q: -3,
    r: 1,
    name: "超维观测站",
    kind: "observatory",
    risk: 5,
    anchorRequirement: 9,
    description: "从更高维度记录沧澜界的废弃设施。",
  }),
  Object.freeze({
    q: 1,
    r: -3,
    name: "禁宝司旧都",
    kind: "citadel",
    risk: 5,
    anchorRequirement: 10,
    description: "古文明禁宝司曾经的清算中枢。",
  }),
]);

export const OTHER_SHORE_PROCEDURAL_STAR_POOL = Object.freeze([
  Object.freeze({
    id: "life",
    names: Object.freeze(["青禾大星", "九叶大星", "长生大星"]),
    kind: "life",
    risk: 1,
    anchorRequirement: 3,
  }),
  Object.freeze({
    id: "ruin",
    names: Object.freeze(["断垣大星", "沉碑大星", "灰殿大星"]),
    kind: "ruin",
    risk: 2,
    anchorRequirement: 4,
  }),
  Object.freeze({
    id: "tide",
    names: Object.freeze(["潮鸣大星", "叠浪大星", "回澜大星"]),
    kind: "tide",
    risk: 3,
    anchorRequirement: 5,
  }),
  Object.freeze({
    id: "rift",
    names: Object.freeze(["破界大星", "缝天大星", "裂光大星"]),
    kind: "rift",
    risk: 4,
    anchorRequirement: 6,
  }),
  Object.freeze({
    id: "civilization",
    names: Object.freeze(["古城大星", "铸文大星", "众王大星"]),
    kind: "civilization",
    risk: 2,
    anchorRequirement: 5,
  }),
  Object.freeze({
    id: "dead",
    names: Object.freeze(["寂灭大星", "暗烬大星", "无昼大星"]),
    kind: "dead",
    risk: 3,
    anchorRequirement: 4,
  }),
]);

const PHASE_RANK = Object.fromEntries(
  OTHER_SHORE_PHASES.map((phase, index) => [phase, index])
);

export function otherShoreCoordinateId(coordinateOrQ, maybeR) {
  const { q, r } = normalizeCoordinate(coordinateOrQ, maybeR);
  return `${q},${r}`;
}

export function getOtherShoreHexDistance(left, right) {
  const a = normalizeCoordinate(left);
  const b = normalizeCoordinate(right);
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

function normalizeCoordinate(coordinateOrQ, maybeR) {
  if (typeof coordinateOrQ === "string") {
    const match = coordinateOrQ.match(/^(-?\d+),(-?\d+)$/);
    if (!match) throw new Error(`无效的沧澜界坐标：${coordinateOrQ}`);
    return { q: Number(match[1]), r: Number(match[2]) };
  }
  if (Array.isArray(coordinateOrQ))
    return { q: Number(coordinateOrQ[0]), r: Number(coordinateOrQ[1]) };
  if (coordinateOrQ && typeof coordinateOrQ === "object")
    return { q: Number(coordinateOrQ.q), r: Number(coordinateOrQ.r) };
  return { q: Number(coordinateOrQ), r: Number(maybeR) };
}

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function coordinatesWithinRadius(radius) {
  const coordinates = [];
  for (let q = -radius; q <= radius; q++) {
    const minimumR = Math.max(-radius, -q - radius);
    const maximumR = Math.min(radius, -q + radius);
    for (let r = minimumR; r <= maximumR; r++) coordinates.push({ q, r });
  }
  return coordinates;
}

function proceduralStar(seed, coordinate) {
  const id = otherShoreCoordinateId(coordinate);
  const value = hash(`${seed}:${id}`);
  const template =
    OTHER_SHORE_PROCEDURAL_STAR_POOL[
      value % OTHER_SHORE_PROCEDURAL_STAR_POOL.length
    ];
  const baseName =
    template.names[Math.floor(value / 17) % template.names.length];
  return {
    id,
    ...coordinate,
    keyStar: false,
    templateId: template.id,
    name: `${baseName}·${value.toString(36).slice(0, 3).toUpperCase()}`,
    kind: template.kind,
    risk: template.risk,
    anchorRequirement: template.anchorRequirement,
    description: "尚未录入古星图的沧澜大星。",
  };
}

export function createOtherShoreWorld(seed = "canglan") {
  const keyStars = new Map(
    OTHER_SHORE_KEY_STARS.map((star) => [otherShoreCoordinateId(star), star])
  );
  const stars = coordinatesWithinRadius(OTHER_SHORE_MAP_RADIUS).map(
    (coordinate) => {
      const id = otherShoreCoordinateId(coordinate);
      const keyStar = keyStars.get(id);
      return keyStar
        ? { id, ...keyStar, keyStar: true }
        : proceduralStar(String(seed), coordinate);
    }
  );
  const states = Object.fromEntries(
    stars.map((star) => [
      star.id,
      {
        phase: star.id === "0,0" ? "anchored" : "unobserved",
        contribution: star.id === "0,0" ? star.anchorRequirement : 0,
        contributors: {},
      },
    ])
  );
  return {
    version: 1,
    seed: String(seed),
    radius: OTHER_SHORE_MAP_RADIUS,
    centerId: "0,0",
    stars,
    states,
  };
}

function requireStar(world, coordinate) {
  const id = otherShoreCoordinateId(coordinate);
  const star = world?.stars?.find((current) => current.id === id);
  if (!star) throw new Error(`沧澜界坐标不存在：${id}`);
  return star;
}

function stateFor(world, coordinate) {
  const star = requireStar(world, coordinate);
  const state = world.states?.[star.id];
  if (!state || PHASE_RANK[state.phase] === undefined)
    throw new Error(`沧澜界星辰状态无效：${star.id}`);
  return { star, state };
}

function updateState(world, id, state) {
  return { ...world, states: { ...world.states, [id]: state } };
}

function advancePhase(world, coordinate, targetPhase) {
  const { star, state } = stateFor(world, coordinate);
  if (PHASE_RANK[targetPhase] <= PHASE_RANK[state.phase]) return world;
  return updateState(world, star.id, { ...state, phase: targetPhase });
}

export function getOtherShoreNeighbors(world, coordinate) {
  const origin = normalizeCoordinate(coordinate);
  requireStar(world, origin);
  const byId = new Map(world.stars.map((star) => [star.id, star]));
  return OTHER_SHORE_HEX_DIRECTIONS.map((direction) =>
    byId.get(
      otherShoreCoordinateId(origin.q + direction.q, origin.r + direction.r)
    )
  ).filter(Boolean);
}

export function findOtherShoreShortestPath(world, from, to) {
  const start = requireStar(world, from).id;
  const goal = requireStar(world, to).id;
  if (start === goal) return [start];

  const queue = [start];
  const previous = new Map([[start, null]]);
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const neighbor of getOtherShoreNeighbors(world, current)) {
      if (previous.has(neighbor.id)) continue;
      previous.set(neighbor.id, current);
      if (neighbor.id === goal) {
        const path = [goal];
        while (previous.get(path[0]) !== null)
          path.unshift(previous.get(path[0]));
        return path;
      }
      queue.push(neighbor.id);
    }
  }
  return null;
}

export function observeOtherShoreStars(world, origin, range = 1) {
  const center = normalizeCoordinate(origin);
  requireStar(world, center);
  const distance = Number(range);
  if (!Number.isInteger(distance) || distance < 0)
    throw new Error("观测范围必须是非负整数");

  let next = world;
  for (const star of world.stars) {
    if (getOtherShoreHexDistance(center, star) <= distance)
      next = advancePhase(next, star.id, "sensed");
  }
  return next;
}

export function visitOtherShoreStar(world, coordinate) {
  const { state } = stateFor(world, coordinate);
  if (state.phase === "unobserved") throw new Error("需先观测该大星才能踏足");
  return advancePhase(world, coordinate, "visited");
}

export function contributeOtherShoreExploration(
  world,
  coordinate,
  contributorId,
  amount = 1
) {
  const { star, state } = stateFor(world, coordinate);
  if (PHASE_RANK[state.phase] < PHASE_RANK.visited)
    throw new Error("踏足该大星后才能贡献探索度");
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0)
    throw new Error("探索贡献必须大于0");
  const contributor = String(contributorId || "").trim();
  if (!contributor) throw new Error("探索贡献者不能为空");
  const existing = Math.max(0, Number(state.contributors?.[contributor]) || 0);
  const remaining = Math.max(
    0,
    Number(star.anchorRequirement || 0) - Number(state.contribution || 0)
  );
  const granted = Math.min(value, Math.max(0, 1 - existing), remaining);
  if (granted <= 0) return world;
  const contributors = {
    ...(state.contributors || {}),
    [contributor]: existing + granted,
  };
  return updateState(world, star.id, {
    ...state,
    contribution: Number(state.contribution || 0) + granted,
    contributors,
  });
}

export function anchorOtherShoreStar(world, coordinate) {
  const { star, state } = stateFor(world, coordinate);
  if (PHASE_RANK[state.phase] < PHASE_RANK.visited)
    throw new Error("踏足该大星后才能建立道标");
  if (Number(state.contribution || 0) < star.anchorRequirement)
    throw new Error(
      `探索贡献不足：${state.contribution || 0}/${star.anchorRequirement}`
    );
  return advancePhase(world, star.id, "anchored");
}

export function clearOtherShoreStar(world, coordinate) {
  const { state } = stateFor(world, coordinate);
  if (PHASE_RANK[state.phase] < PHASE_RANK.anchored)
    throw new Error("建立道标后才能完成该大星");
  return advancePhase(world, coordinate, "cleared");
}

export function clearOtherShoreCampaignStar(world, coordinate) {
  const { star, state } = stateFor(world, coordinate);
  if (PHASE_RANK[state.phase] < PHASE_RANK.visited)
    throw new Error("踏足该大星后才能完成战役");
  if (PHASE_RANK[state.phase] >= PHASE_RANK.anchored)
    return clearOtherShoreStar(world, star.id);
  const contributed = updateState(world, star.id, {
    ...state,
    contribution: Math.max(Number(state.contribution || 0), star.anchorRequirement),
  });
  return clearOtherShoreStar(anchorOtherShoreStar(contributed, star.id), star.id);
}

export function calculateOtherShoreTravel(
  world,
  path,
  playerOrRealm,
  remainder = 0
) {
  if (!Array.isArray(path) || path.length < 1)
    throw new Error("移动路径不能为空");
  const ids = path.map((coordinate) => requireStar(world, coordinate).id);
  for (let index = 1; index < ids.length; index++) {
    if (getOtherShoreHexDistance(ids[index - 1], ids[index]) !== 1)
      throw new Error("移动路径必须由相邻大星组成");
  }
  const entered = ids.slice(1);
  const unanchoredSteps = entered.filter(
    (id) => !["anchored", "cleared"].includes(world.states[id].phase)
  ).length;
  return {
    path: ids,
    totalSteps: entered.length,
    anchoredSteps: entered.length - unanchoredSteps,
    ...calculateOtherShoreMindCost(playerOrRealm, unanchoredSteps, remainder),
  };
}

export function serializeOtherShoreWorld(world) {
  return {
    version: world.version,
    seed: world.seed,
    radius: world.radius,
    centerId: world.centerId,
    stars: world.stars.map((star) => {
      const state = world.states[star.id];
      const discovered = state.phase !== "unobserved";
      return {
        id: star.id,
        q: star.q,
        r: star.r,
        phase: state.phase,
        discovered,
        visited: PHASE_RANK[state.phase] >= PHASE_RANK.visited,
        anchored: PHASE_RANK[state.phase] >= PHASE_RANK.anchored,
        cleared: state.phase === "cleared",
        contribution: state.contribution,
        contributors: { ...(state.contributors || {}) },
        ...(discovered
          ? {
              name: star.name,
              kind: star.kind,
              risk: star.risk,
              keyStar: star.keyStar,
              anchorRequirement: star.anchorRequirement,
              description: star.description,
            }
          : {}),
      };
    }),
  };
}
