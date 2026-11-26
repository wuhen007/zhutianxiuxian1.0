/**
 * 位面天骄数据：内置原著天骄 + 玩家晋升的天骄
 *
 * 背景：`item/位面boss列表.json` 原本同时放原著角色和「玩家被推上天骄榜」的记录，
 * 每次血量/夺宝/轮回都整份回写 —— 玩家名号就这样被推到公开仓库，
 * 而且每个人拉下来都带着你这台服的天骄状态。
 *
 * 现在拆成两份：
 *   item/位面boss列表.json     原著天骄，只读，随代码发布
 *   data/位面天骄玩家.json      玩家晋升记录，运行时写入，不入库
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../resources/data')
const PRESET_FILE = path.join(ROOT, 'item/位面boss列表.json')
const RUNTIME_FILE = path.join(ROOT, '位面天骄玩家.json')

function readArray(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/** 原著天骄（只读） */
export function readPresetTianjiao() {
  return readArray(PRESET_FILE)
}

/** 玩家晋升的天骄 */
export function readRuntimeTianjiao() {
  return readArray(RUNTIME_FILE)
}

/** 合并：原著在前，玩家在后，同名以原著为准 */
export function readAllTianjiao() {
  const preset = readPresetTianjiao()
  const names = new Set(preset.map(t => t?.名号).filter(Boolean))
  return [...preset, ...readRuntimeTianjiao().filter(t => t?.名号 && !names.has(t.名号))]
}

/** 只写玩家晋升那份；原著列表保持只读 */
export function writeRuntimeTianjiao(list) {
  const presetNames = new Set(readPresetTianjiao().map(t => t?.名号).filter(Boolean))
  const seen = new Set()
  const kept = []
  for (const item of Array.isArray(list) ? list : []) {
    const name = item?.名号
    if (!name || presetNames.has(name) || seen.has(name)) continue
    seen.add(name)
    kept.push(item)
  }
  fs.mkdirSync(path.dirname(RUNTIME_FILE), { recursive: true })
  fs.writeFileSync(RUNTIME_FILE, JSON.stringify(kept, null, 2), 'utf8')
  return kept
}
