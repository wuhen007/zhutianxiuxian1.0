/**
 * 游戏更新内容（给玩家看的调整记录）
 *
 * 只保留最近 MAX_ENTRIES 条，写入时自动裁剪；文件是纯 JSON，出问题可以直接改。
 *   resources/data/update_notes.json
 *
 * 结构：
 *   [{ "date": "2026-11-21", "title": "修复与优化", "items": ["修了 A", "优化了 B"] }]
 *
 * 和 vertion.txt 的区别：那份是开发期的流水账（#查看日志，仅管理员），
 * 这份是面向玩家的简版调整说明，由 #添加更新 追加。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const MAX_ENTRIES = 10
// 相对本文件定位，不依赖 process.cwd()，也不 import xiuxian.js（避免拖起渲染器/Redis）
const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../resources/data/update_notes.json')

/** 读取全部条目（最多 10 条，文件被手工改坏时返回空数组而不是抛错） */
export function readNotes() {
  try {
    const list = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    if (!Array.isArray(list)) return []
    return list
      .filter(n => n && String(n.title || '').trim())
      .map(n => ({
        date: String(n.date || '').trim(),
        title: String(n.title).trim().slice(0, 40),
        items: (Array.isArray(n.items) ? n.items : []).map(s => String(s).trim()).filter(Boolean),
      }))
      .slice(0, MAX_ENTRIES)
  } catch {
    return []
  }
}

/** 只保留最近 MAX_ENTRIES 条 */
export function trimNotes(list) {
  return (Array.isArray(list) ? list : []).slice(0, MAX_ENTRIES)
}

export function writeNotes(list) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(trimNotes(list), null, 2), 'utf8')
}

/** 新增一条，插到最前面；返回写入后的全部条目 */
export function addNote({ title, items = [], date = '' }) {
  const entry = {
    date: String(date || '').trim() || new Date().toISOString().slice(0, 10),
    title: String(title || '').trim().slice(0, 40),
    items: (Array.isArray(items) ? items : [])
      .map(s => String(s).trim().replace(/^[-·•*]\s*/, ''))
      .filter(Boolean)
      .slice(0, 10),
  }
  if (!entry.title) throw new Error('更新标题不能为空')
  const list = trimNotes([entry, ...readNotes()])
  writeNotes(list)
  return list
}

/** 渲染成给玩家看的文本 */
export function formatNotes(list = readNotes()) {
  const notes = trimNotes(list)
  if (!notes.length) return '【修仙更新】暂无更新记录。'
  const lines = [`【修仙更新·最近 ${notes.length} 条】`]
  notes.forEach((n, i) => {
    lines.push('')
    lines.push(`${i + 1}. ${n.date ? `${n.date} ` : ''}${n.title}`)
    for (const item of n.items) lines.push(`   · ${item}`)
  })
  return lines.join('\n')
}
