/**
 * 修仙公告（作者/群主 → 游戏群）
 *
 * 用法：
 *   #修仙公告 内容                 发到当前群（作者、本群群主均可用）
 *   #修仙公告 全部 内容            发到机器人所在的所有群（仅作者）
 *   #修仙公告 群123456789 内容      指定单个群（仅作者）
 *
 * 权限：
 *   - 作者：云崽 master（other.yaml 的 masterQQ/master），兜底 504010020
 *   - 群主：e.member.is_owner（由适配器提供）
 *   群主只能在自己的群发；跨群/全量只有作者能做。
 *
 * 图片：从触发消息里提取 image 段，统一落盘到 resources/data/announce/，
 * 再以本地文件发送 —— 原图 URL 有有效期，直接转发很容易在其它群变成裂图。
 */
import fs from 'node:fs'
import path from 'node:path'
import { plugin } from '../../api/api.js'
import cfg from '../../../../lib/config/config.js'
import { __PATH } from '../../model/xiuxian.js'

/** 接收者兜底（作者号） */
const FALLBACK_AUTHOR = '504010020'
/** 单条公告文字上限 */
const MAX_TEXT = 1000
/** 单次公告最多带几张图 */
const MAX_IMAGES = 9
/** 单张图片大小上限 */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
/** 全量发送时的群数上限，避免一次打爆风控 */
const MAX_TARGETS = 100
/** 手动指定群时一次最多填几个 */
const MAX_SPECIFIED_GROUPS = 20
/** 群发间隔，单位毫秒 */
const SEND_INTERVAL = 800
/** 图片落盘目录 */
const IMAGE_DIR = path.join(__PATH.data_path, 'announce')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * 解析「群」开头的多群参数。
 *   #修仙公告 群123456789 内容
 *   #修仙公告 群123456789 987654321 内容
 *   #修仙公告 群123456789,987654321 内容
 *   #修仙公告 群123456789、987654321 内容
 *   #修仙公告 群123456789 群987654321 内容
 *
 * 只把「整个 token 都是 5~12 位数字」的片段当群号，遇到「8点停服」这类
 * 数字开头的正文会停下来，避免把正文首数字误当成群号。
 * @returns {{ids: string[], text: string} | null}
 */
function parseGroupScope(raw) {
  const head = /^群\s*([\s\S]*)$/.exec(raw)
  if (!head) return null

  // 群号后面必须是分隔符、空格、另一个「群」字或结束，且不能是更长数字的一部分
  const idRe = /^(?:群\s*)?(\d{5,12})(?!\d)(?=\s*[,，、;；]|\s+|\s*群|$)\s*[,，、;；]?\s*/
  const ids = []
  let rest = head[1]

  while (rest) {
    const match = idRe.exec(rest)
    if (!match) break
    ids.push(match[1])
    rest = rest.slice(match[0].length)
  }

  if (!ids.length) return null
  return { ids: [...new Set(ids)], text: rest.trim() }
}

export class AuthorAnnounce extends plugin {
  constructor() {
    super({
      name: 'AuthorAnnounce',
      dsc: '作者/群主向游戏群下发公告，支持文字与图片、单群与全量',
      event: 'message',
      priority: 540,
      rule: [{ reg: '^#修仙公告\\s*([\\s\\S]*)$', fnc: 'announce' }],
    })
  }

  async announce(e) {
    const raw = String(e.msg || '')
      .replace(/^#修仙公告\s*/, '')
      .trim()

    // ── 解析范围 ──────────────────────────────────────────
    let scope = 'current' // current | all | groups
    let groupIds = []
    let text = raw

    const allMatch = /^(?:全部群|全部|所有群|全服|all)\s*([\s\S]*)$/i.exec(raw)
    const groupScope = parseGroupScope(raw)

    if (allMatch) {
      scope = 'all'
      text = allMatch[1].trim()
    } else if (groupScope) {
      scope = 'groups'
      groupIds = groupScope.ids
      text = groupScope.text
    } else if (/^群/.test(raw)) {
      return e.reply(
        [
          '【修仙公告】群号格式不对。',
          '示例：`#修仙公告 群123456789 内容`',
          '多个群：`#修仙公告 群123456789,987654321 内容`（逗号或空格分隔，最多 20 个）',
        ].join('\n'),
      )
    }

    // ── 收集图片（同一条消息里携带的）────────────────────
    const imageSegs = (e.message || []).filter(item => item?.type === 'image')
    if (!text && !imageSegs.length) return e.reply(this.usage(e))

    if (text.length > MAX_TEXT) return e.reply(`【修仙公告】文字太长（上限 ${MAX_TEXT} 字）。`)
    if (imageSegs.length > MAX_IMAGES) return e.reply(`【修仙公告】一次最多带 ${MAX_IMAGES} 张图。`)

    // ── 权限校验 ──────────────────────────────────────────
    const isAuthor = this.isAuthor(e.user_id)
    const isOwner = this.isGroupOwner(e)

    if (scope === 'current' && !e.isGroup) {
      return e.reply('【修仙公告】「指定当前群」只能在群里使用；跨群请用 `#修仙公告 全部 内容`。')
    }
    if (scope !== 'current' && !isAuthor) {
      return e.reply('【修仙公告】只有作者可以跨群发布公告；群主只能发到自己所在的群。')
    }
    if (scope === 'current' && !isAuthor && !isOwner) {
      return e.reply('【修仙公告】仅作者或本群群主可以使用。')
    }

    // ── 目标群 ────────────────────────────────────────────
    let targets
    if (scope === 'current') targets = [String(e.group_id)]
    else if (scope === 'groups') {
      if (groupIds.length > MAX_SPECIFIED_GROUPS) {
        return e.reply(`【修仙公告】一次最多指定 ${MAX_SPECIFIED_GROUPS} 个群，请分批发送。`)
      }
      targets = groupIds
    } else {
      targets = await this.listGroups()
      if (!targets.length) return e.reply('【修仙公告】没能拿到群列表（可能是适配器未拉取），请稍后再试或改用指定群号。')
      if (targets.length > MAX_TARGETS) {
        return e.reply(`【修仙公告】当前在 ${targets.length} 个群，超过单次上限 ${MAX_TARGETS}，请改用指定群号分批发送。`)
      }
    }

    // ── 图片落盘 ──────────────────────────────────────────
    let imageFiles = []
    if (imageSegs.length) {
      try {
        imageFiles = await this.persistImages(imageSegs, e.user_id)
      } catch (err) {
        return e.reply(`【修仙公告】图片保存失败：${err.message}`)
      }
    }

    // ── 组装消息体 ────────────────────────────────────────
    const header = this.buildHeader(text, e)
    const payload = [header]
    for (const file of imageFiles) payload.push(segment.image(file))

    // 全量发送先给个回执，避免用户以为没反应
    if (targets.length > 1) {
      await e.reply(`【修仙公告】开始发送到 ${targets.length} 个群…`)
    }

    const ok = []
    const failed = []
    for (const groupId of targets) {
      try {
        await Bot.pickGroup(Number(groupId) || groupId).sendMsg(payload)
        ok.push(groupId)
      } catch (err) {
        failed.push(`${groupId}（${err.message}）`)
      }
      if (targets.length > 1) await sleep(SEND_INTERVAL)
    }

    this.writeLog({ e, scope, text, images: imageFiles, ok, failed })

    // ── 回执 ──────────────────────────────────────────────
    if (targets.length === 1) {
      if (ok.length) return e.reply(`【修仙公告】已发送到 ${scope === 'current' ? '本群' : `群 ${targets[0]}`}。`)
      return e.reply(`【修仙公告】发送失败：${failed[0] || '未知错误'}`)
    }

    const lines = [`【修仙公告】发送完成：成功 ${ok.length} / 失败 ${failed.length}`]
    if (failed.length) lines.push(`失败列表（前 5）：\n${failed.slice(0, 5).join('\n')}`)
    return e.reply(lines.join('\n'))
  }

  // ─────────────────────────── 权限 ───────────────────────────

  /** 作者：云崽主人列表（过滤 stdin 等非数字项） */
  isAuthor(userId) {
    const id = String(userId ?? '').trim()
    const set = new Set()
    const push = qq => {
      const v = String(qq ?? '').trim()
      if (/^\d{5,12}$/.test(v)) set.add(v)
    }
    try {
      for (const qq of cfg.masterQQ || []) push(qq)
      for (const list of Object.values(cfg.master || {})) for (const qq of list || []) push(qq)
    } catch {}
    if (!set.size) set.add(FALLBACK_AUTHOR)
    return set.has(id)
  }

  /** 群主：适配器提供的 member.is_owner，缺失时降级为 false */
  isGroupOwner(e) {
    if (!e.isGroup) return false
    try {
      return Boolean(e.member?.is_owner) || e.sender?.role === 'owner'
    } catch {
      return false
    }
  }

  // ─────────────────────────── 群列表 ───────────────────────────

  async listGroups() {
    let list = []
    try {
      list = Bot.getGroupList?.() || []
    } catch {}

    // 适配器可能还没拉过群列表，主动触发一次（OneBot 的 get_group_list）
    if (!list.length) {
      for (const uin of Bot.uin || []) {
        try {
          await Bot.bots?.[uin]?.getGroupList?.()
        } catch {}
      }
      try {
        list = Bot.getGroupList?.() || []
      } catch {}
    }

    return [...new Set(list.map(String).filter(id => /^\d{5,12}$/.test(id)))]
  }

  // ─────────────────────────── 图片 ───────────────────────────

  /**
   * 把图片段统一落盘，返回本地路径数组。
   * 支持 Buffer / http 直链 / base64 / 本地文件，覆盖常见适配器的差异。
   */
  async persistImages(segments, userId) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true })
    const stamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, '')
      .slice(0, 14)
    const saved = []

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const base = `${stamp}_${userId}_${i}`

      const buffer = await this.loadImageBuffer(seg)
      if (!buffer?.length) throw new Error(`第 ${i + 1} 张图片为空`)
      if (buffer.length > MAX_IMAGE_BYTES) {
        throw new Error(`第 ${i + 1} 张图片超过 ${MAX_IMAGE_BYTES / 1024 / 1024}MB`)
      }

      const ext = this.guessExt(seg, buffer)
      const file = path.join(IMAGE_DIR, `${base}${ext}`)
      fs.writeFileSync(file, buffer)
      saved.push(file)
    }
    return saved
  }

  async loadImageBuffer(seg) {
    const file = seg.file
    const url = seg.url

    // 1. Buffer（截图/canvas 常见）
    if (Buffer.isBuffer(file) || file instanceof Uint8Array) {
      return Buffer.isBuffer(file) ? file : Buffer.from(file)
    }

    // 2. http 直链：优先 seg.url，其次 seg.file
    const httpUrl = [url, file].find(v => typeof v === 'string' && /^https?:\/\//i.test(v))
    if (httpUrl) {
      const res = await fetch(httpUrl, { signal: AbortSignal.timeout(20_000) })
      if (!res.ok) throw new Error(`下载图片失败 HTTP ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    }

    const text = typeof file === 'string' ? file.trim() : ''

    // 3. base64
    if (text.startsWith('base64://')) return Buffer.from(text.slice(9), 'base64')
    if (/^data:[^;]+;base64,/.test(text)) return Buffer.from(text.split(',')[1], 'base64')

    // 4. 本地路径
    if (text) {
      const localPath = text.startsWith('file://')
        ? decodeURIComponent(text.slice(7)).replace(/^\/[A-Za-z]:/, m => m.slice(1))
        : text
      try {
        const stat = fs.statSync(path.resolve(localPath))
        if (stat.isFile()) return fs.readFileSync(path.resolve(localPath))
      } catch {}
    }

    throw new Error('无法识别的图片数据')
  }

  guessExt(seg, buffer) {
    // 先看文件头，比后缀可靠
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return '.png'
    if (buffer[0] === 0x47 && buffer[1] === 0x49) return '.gif'
    if (buffer[8] === 0x57 && buffer[9] === 0x45) return '.webp'
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return '.jpg'
    const name = String(seg.file || seg.url || '')
    const match = /\.(png|jpe?g|gif|webp)$/i.exec(name)
    return match ? `.${match[1].toLowerCase().replace('jpeg', 'jpg')}` : '.jpg'
  }

  // ─────────────────────────── 文案 ───────────────────────────

  buildHeader(text, e) {
    const who = this.isAuthor(e.user_id) ? '作者' : '群主'
    const body = String(text || '').trim()
    return body ? `【修仙公告 · ${who}】\n${body}` : `【修仙公告 · ${who}】`
  }

  usage(e) {
    const inGroup = Boolean(e.isGroup)
    return [
      '【修仙公告 · 用法】',
      '#修仙公告 内容                        → 发到当前群' + (inGroup ? '' : '（需在群里使用）'),
      '#修仙公告 全部 内容                   → 发到机器人所在的所有群（仅作者）',
      '#修仙公告 群123456789 内容            → 指定 1 个群（仅作者）',
      '#修仙公告 群123456789,987654321 内容  → 指定多个群，逗号/顿号/空格分隔，最多 20 个',
      '',
      '· 文字与图片可同时发送，图片直接跟着指令一起发即可（最多 9 张，单张 ≤ 8MB）',
      '· 权限：作者（云崽主人）可全量或跨群；群主只能发自己所在的群',
      '· 正文以纯数字开头时，请在群号后留一个空格，或把数字写在第二行',
      '',
      `当前群：${inGroup ? e.group_id : '（非群聊）'}`,
    ].join('\n')
  }

  /** 审计日志：谁在什么时候发了什么、成功失败多少 */
  writeLog({ e, scope, text, images, ok, failed }) {
    try {
      const dir = path.join(__PATH.data_path, 'announce_log')
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, `announce_${new Date().toISOString().slice(0, 10)}.log`)
      const entry = [
        `[${new Date().toLocaleString('zh-CN')}]`,
        `发送者: ${e.sender?.card || e.sender?.nickname || e.user_id}(${e.user_id})`,
        `来源群: ${e.group_id || '私聊'}`,
        `范围: ${scope}`,
        `图片: ${images.length} 张`,
        `内容: ${String(text).slice(0, 200)}`,
        `成功: ${ok.length} 失败: ${failed.length}`,
        '---',
      ].join('\n')
      fs.appendFileSync(file, `${entry}\n`)
    } catch (err) {
      globalThis.logger?.warn?.(`[修仙公告] 审计日志写入失败：${err.message}`)
    }
  }
}

export default AuthorAnnounce
