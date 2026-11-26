/**
 * 传音映射表
 *
 * 主人收到的每条转发消息都有一个 message_id，这里把 message_id → 来源（群/发送者/原文）
 * 存起来。主人用 QQ 的「引用回复」回复那条消息时，事件里会带 reply_id，
 * 用它反查就能知道该把回音发到哪个群、@ 谁。
 *
 * 落盘到 resources/data/relay_map.json，重启后引用仍然有效。
 * 7 天过期、最多 2000 条，避免无限膨胀。
 */
import fs from 'node:fs'
import path from 'node:path'
import { __PATH } from './xiuxian.js'

const STORE_FILE = path.join(__PATH.data_path, 'relay_map.json')
const MAX_ENTRIES = 2000
const TTL_MS = 7 * 24 * 60 * 60 * 1000
/** 写盘防抖：连续转发多条时只落一次 */
const FLUSH_DELAY = 500

class RelayStore {
  #map = new Map()
  #timer = null

  constructor() {
    this.load()
  }

  load() {
    try {
      if (!fs.existsSync(STORE_FILE)) return
      const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'))
      const items = raw?.items && typeof raw.items === 'object' ? raw.items : {}
      for (const [key, value] of Object.entries(items)) {
        if (value && typeof value === 'object' && value.groupId && value.userId) {
          this.#map.set(String(key), value)
        }
      }
      this.#prune()
    } catch (err) {
      // 文件损坏不应该影响插件启动，直接当空表用
      logger?.warn?.(`[传音] 映射表读取失败，已忽略：${err.message}`)
      this.#map.clear()
    }
  }

  /**
   * @param {string|number} messageId 转发给主人那条消息的 message_id
   * @param {{groupId:string, groupName:string, userId:string, nickname:string, content:string}} origin
   */
  set(messageId, origin) {
    const key = String(messageId || '').trim()
    if (!key || key === 'undefined' || key === 'null') return false
    this.#map.set(key, { ...origin, createdAt: origin.createdAt || Date.now() })
    this.#prune()
    this.#schedule()
    return true
  }

  get(messageId) {
    const key = String(messageId || '').trim()
    if (!key) return null
    const item = this.#map.get(key)
    if (!item) return null
    if (Date.now() - (item.createdAt || 0) > TTL_MS) {
      this.#map.delete(key)
      this.#schedule()
      return null
    }
    return item
  }

  get size() {
    return this.#map.size
  }

  /** 取最近一条，用于状态展示 */
  latest() {
    let latest = null
    for (const item of this.#map.values()) {
      if (!latest || (item.createdAt || 0) > (latest.createdAt || 0)) latest = item
    }
    return latest
  }

  #prune() {
    const now = Date.now()
    for (const [key, item] of this.#map) {
      if (now - (item.createdAt || 0) > TTL_MS) this.#map.delete(key)
    }
    if (this.#map.size <= MAX_ENTRIES) return
    // 超量时按时间淘汰最旧的
    const sorted = [...this.#map.entries()].sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0))
    for (const [key] of sorted.slice(0, this.#map.size - MAX_ENTRIES)) this.#map.delete(key)
  }

  #schedule() {
    if (this.#timer) return
    this.#timer = setTimeout(() => {
      this.#timer = null
      this.flush()
    }, FLUSH_DELAY)
    this.#timer.unref?.()
  }

  flush() {
    try {
      fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true })
      const items = Object.fromEntries(this.#map)
      fs.writeFileSync(STORE_FILE, JSON.stringify({ version: 1, items }, null, 2), 'utf8')
    } catch (err) {
      logger?.warn?.(`[传音] 映射表写入失败：${err.message}`)
    }
  }
}

export const relayStore = new RelayStore()
export default relayStore
