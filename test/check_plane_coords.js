/**
 * 位面坐标数据校验脚本
 * 校验 位面坐标.json：
 *   1. JSON 语法可解析
 *   2. 坐标范围 0-999，x1<x2, y1<y2
 *   3. 同级（同 parent）区域 bounds 不重叠
 *   4. 子区域必须完全落在父区域内
 * 用法: node test/check_plane_coords.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'resources', 'data', '位面坐标.json');

const raw = fs.readFileSync(FILE, 'utf8');
const data = JSON.parse(raw);
const meta = data._meta;
const MAX = meta?.coordRange?.maxX ?? 999;

let errors = 0;
let warnings = 0;
let total = 0;

function err(msg) { errors++; console.error('  ❌ ' + msg); }
function warn(msg) { warnings++; console.warn('  ⚠️  ' + msg); }

const overlap = (a, b) =>
  a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

for (const [planeName, plane] of Object.entries(data)) {
  if (planeName === '_meta') continue;
  console.log(`\n=== ${planeName} (planeId: ${plane.planeId}) ===`);
  const locs = plane.locations || [];
  const byId = new Map();
  total += locs.length;

  // 第一遍：范围与 id 唯一性
  for (const loc of locs) {
    if (byId.has(loc.id)) err(`[${loc.id}] id 重复`);
    byId.set(loc.id, loc);
    const b = loc.bounds;
    if (!b) { err(`[${loc.id}] 缺少 bounds`); continue; }
    if (!(b.x1 < b.x2 && b.y1 < b.y2)) err(`[${loc.id}] bounds 方向错误`);
    if (b.x1 < 0 || b.y1 < 0 || b.x2 > MAX || b.y2 > MAX)
      err(`[${loc.id}] bounds 越界 (${b.x1},${b.y1})-(${b.x2},${b.y2})`);
  }

  // 第二遍：parent 存在性 + 子在父内 + 同级不重叠
  for (const loc of locs) {
    if (loc.parent) {
      const p = byId.get(loc.parent);
      if (!p) { err(`[${loc.id}] parent「${loc.parent}」不存在`); continue; }
      const pb = p.bounds, b = loc.bounds;
      if (!(b.x1 >= pb.x1 && b.x2 <= pb.x2 && b.y1 >= pb.y1 && b.y2 <= pb.y2))
        err(`[${loc.id}] 未完全落在父区域「${p.name}」内`);
    }
  }
  const groups = new Map();
  for (const loc of locs) {
    const key = loc.parent ?? '__root__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(loc);
  }
  for (const [key, group] of groups) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (overlap(group[i].bounds, group[j].bounds))
          warn(`[${group[i].name}] 与 [${group[j].name}] 同级重叠（parent: ${key}）`);
      }
    }
  }
  console.log(`  ${locs.length} 个地点已检查`);
}

console.log(`\n========================================`);
console.log(`共 ${total} 个地点 | 错误 ${errors} | 警告 ${warnings}`);
if (errors > 0) { console.error('校验未通过'); process.exit(1); }
console.log('✅ 校验通过');
