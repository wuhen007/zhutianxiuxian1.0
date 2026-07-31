/**
 * 位面坐标系统 🗺️
 * 数据来源: resources/data/位面坐标.json
 *
 * 每个位面一张 1000×1000 地图（坐标 0-999），
 * x 轴向东递增，y 轴向南递增；(0,0) 西北隅，(999,999) 东南极。
 * 时间长河 / 永恒未知之地超脱坐标之外，不在本系统内。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PLACE_LOCATION_MAP } from './weimianTravel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COORD_FILE = path.join(__dirname, '..', 'resources', 'data', '位面坐标.json');

let _cache = null;

/** 懒加载坐标数据（带缓存） */
export function getCoordData() {
  if (_cache) return _cache;
  try {
    _cache = JSON.parse(fs.readFileSync(COORD_FILE, 'utf8'));
  } catch (e) {
    console.error('[位面坐标] 读取 位面坐标.json 失败:', e.message);
    _cache = { _meta: { coordRange: { maxX: 999, maxY: 999 } } };
  }
  return _cache;
}

/** 获取坐标系上限 */
export function getCoordLimit() {
  const meta = getCoordData()._meta;
  return { maxX: meta?.coordRange?.maxX ?? 999, maxY: meta?.coordRange?.maxY ?? 999 };
}

/** 获取指定位面的全部地点列表；位面不存在返回 [] */
export function getPlaneLocations(planeName) {
  return getCoordData()[planeName]?.locations ?? [];
}

/** 按 id / name 查找地点 */
export function getLocation(planeName, idOrName) {
  return getPlaneLocations(planeName).find(l => l.id === idOrName || l.name === idOrName) ?? null;
}

/** 坐标是否落在 bounds 内 */
export function inBounds(x, y, bounds) {
  return x >= bounds.x1 && x <= bounds.x2 && y >= bounds.y1 && y <= bounds.y2;
}

/**
 * 根据坐标反查地点：返回最深匹配（子地点优先于父区域）
 * @returns {{region: Object|null, site: Object|null, chain: Object[]}}
 *   region=最外层区域, site=最深层地点, chain=从外到内的完整归属链
 */
export function getLocationByCoord(planeName, x, y) {
  const hits = getPlaneLocations(planeName).filter(l => inBounds(x, y, l.bounds));
  if (hits.length === 0) return { region: null, site: null, chain: [] };
  const byId = new Map(hits.map(h => [h.id, h]));
  // 最深者：没有任何命中者以它为 parent
  const leaf = hits.find(h => !hits.some(o => o.parent === h.id)) ?? hits[hits.length - 1];
  // 由 leaf 沿 parent 回溯完整链
  const chain = [leaf];
  let cur = leaf;
  while (cur.parent && byId.has(cur.parent)) {
    cur = byId.get(cur.parent);
    chain.unshift(cur);
  }
  return { region: chain[0], site: leaf, chain };
}

/** 取地点中心坐标 */
export function getCenter(location) {
  const b = location.bounds;
  return { x: Math.floor((b.x1 + b.x2) / 2), y: Math.floor((b.y1 + b.y2) / 2) };
}

/** 在地点 bounds 内取一个随机坐标 */
export function randomCoordIn(location, random = Math.random) {
  const b = location.bounds;
  return {
    x: b.x1 + Math.floor(random() * (b.x2 - b.x1 + 1)),
    y: b.y1 + Math.floor(random() * (b.y2 - b.y1 + 1)),
  };
}

/** 两坐标欧氏距离（单位：坐标格） */
export function calcCoordDistance(c1, c2) {
  return Math.hypot(c1.x - c2.x, c1.y - c2.y);
}

/** 两地点中心点距离 */
export function calcLocationDistance(loc1, loc2) {
  return calcCoordDistance(getCenter(loc1), getCenter(loc2));
}

/** 列出全部有位面坐标的位面名 */
export function listMappedPlanes() {
  return Object.keys(getCoordData()).filter(k => k !== '_meta');
}

/** 根据 power_place 取得正式位面名。 */
export function getPlayerPlaneName(player) {
  const planeId = Number(player?.power_place);
  return Object.entries(PLACE_LOCATION_MAP)
    .find(([, id]) => Number(id) === planeId)?.[0] ?? null;
}

/** 读取玩家在指定（默认当前）位面的坐标。 */
export function getPlayerPlaneCoordinate(player, planeName = getPlayerPlaneName(player)) {
  if (!planeName) return null;
  const coordinate = player?.[`${planeName}坐标`];
  const x = Number(coordinate?.x);
  const y = Number(coordinate?.y);
  const { maxX, maxY } = getCoordLimit();
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > maxX || y > maxY) {
    return null;
  }
  return { x, y };
}

/** 保存玩家在指定（默认当前）位面的坐标。 */
export function setPlayerPlaneCoordinate(player, coordinate, planeName = getPlayerPlaneName(player)) {
  if (!planeName || !listMappedPlanes().includes(planeName)) return false;
  const x = Number(coordinate?.x);
  const y = Number(coordinate?.y);
  const { maxX, maxY } = getCoordLimit();
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > maxX || y > maxY) {
    return false;
  }
  player[`${planeName}坐标`] = { x, y };
  return true;
}
