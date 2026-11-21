/**
 * 仙宠数据：内置仙宠 + 玩家自创仙宠
 *
 * 背景：`item/仙宠列表.json` 原来同时存内置仙宠和玩家创造的仙宠，
 * 结果是玩家造一只宠就把整份文件改写一遍 —— 公开仓库天天被玩家数据污染，
 * 而且会把玩家昵称/创造的宠直接推到远端。
 *
 * 现在拆成两份：
 *   item/仙宠列表.json      内置仙宠，随代码一起发布
 *   item/玩家自创仙宠.json  玩家创造的，运行时写入，不入库
 *
 * 读取统一走 readAllXianchong()，写入只会碰自创那份，内置列表不再被改写。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../resources/data/item')
const PRESET_FILE = path.join(DIR, '仙宠列表.json')
const CUSTOM_FILE = path.join(DIR, '玩家自创仙宠.json')

/** 玩家创造的仙宠：新数据带 custom 标记，老数据靠 13 位时间戳 id / 描述识别 */
export function isCustomXianchong(pet) {
  if (!pet) return false
  if (pet.custom === true) return true
  if (Number(pet.id) >= 1e12) return true
  return typeof pet.desc === 'string' && pet.desc.includes('创造的专属仙宠')
}

function readArray(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/** 内置仙宠（历史数据里混进来的玩家宠会被过滤掉） */
export function readPresetXianchong() {
  return readArray(PRESET_FILE).filter(pet => !isCustomXianchong(pet))
}

/** 玩家自创仙宠 */
export function readCustomXianchong() {
  return readArray(CUSTOM_FILE)
}

/** 全部仙宠：内置 + 自创（同名以内置为准） */
export function readAllXianchong() {
  const presets = readPresetXianchong()
  const names = new Set(presets.map(p => p?.name).filter(Boolean))
  return [...presets, ...readCustomXianchong().filter(p => p?.name && !names.has(p.name))]
}

/** 只写玩家自创那份；内置列表保持只读 */
export function writeCustomXianchong(list) {
  const seen = new Set()
  const kept = []
  for (const pet of Array.isArray(list) ? list : []) {
    if (!pet || !pet.name || seen.has(pet.name)) continue
    seen.add(pet.name)
    kept.push({ ...pet, custom: true })
  }
  fs.mkdirSync(path.dirname(CUSTOM_FILE), { recursive: true })
  fs.writeFileSync(CUSTOM_FILE, JSON.stringify(kept, null, 2), 'utf8')
  return kept
}
