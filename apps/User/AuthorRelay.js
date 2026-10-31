/**
 * 群消息 ⇄ 主人 双向传音
 *
 * 流程：
 *   1. 群成员发 `#传音给作者 内容`
 *      → 机器人把内容私聊转发给主人，附带群名、群号、发送者昵称与 QQ
 *      → 转发消息的 message_id 写入映射表（relayStore）
 *   2. 主人在 QQ 里「引用」那条转发消息回复
 *      → 事件带 reply_id，映射表反查出原群与原发送者
 *      → 机器人回到原群，@ 发送者并转达主人的回复
 *
 * 与旧实现的区别：旧版是单向「发到作者私聊」，失败后 @ 作者本人；
 * 现在改成「发给主人 + 引用回传」，主人不必在那个群里，也不需要是好友
 * （只要机器人能给主人发私聊）。
 */
import fs from 'node:fs'
import { plugin } from '../../api/api.js'
import cfg from '../../../../lib/config/config.js'
import { buildAt, __PATH } from '../../model/xiuxian.js'
import { relayStore } from '../../model/relayStore.js'

/** 主人列表取不到时的兜底接收人 */
const FALLBACK_MASTER = '504010020'
/** 单条内容上限，避免把超长文本塞进私聊 */
const MAX_CONTENT = 800
/** 同一群同一人两次传音的最小间隔 */
const COOLDOWN_MS = 15_000
const COOLDOWN = new Map()

export class AuthorRelay extends plugin {
  constructor() {
    super({
      name: 'AuthorRelay',
      dsc: '群内传音转发给主人，主人引用回复后 @ 转达回群',
      event: 'message',
      priority: 550,
      rule: [
        { reg: '^#传音给作者\\s*([\\s\\S]*)$', fnc: 'forwardToMaster' },
        { reg: '^#传音(状态|帮助)$', fnc: 'relayHelp' },
        // 没有 reg，等于匹配所有私聊消息；不满足条件时 return false 交还给其它插件
        { event: 'message.private', fnc: 'replyFromMaster' },
      ],
    })
  }

  /** 主人列表：云崽 other.yaml 的 master / masterQQ，过滤掉 stdin 之类非 QQ 项 */
  masters() {
    const set = new Set()
    const push = qq => {
      const id = String(qq ?? '').trim()
      if (/^\d{5,12}$/.test(id)) set.add(id)
    }
    try {
      for (const qq of cfg.masterQQ || []) push(qq)
      for (const list of Object.values(cfg.master || {})) for (const qq of list || []) push(qq)
    } catch {}
    if (!set.size) set.add(FALLBACK_MASTER)
    return [...set]
  }

  /** ① 群内传音 → 转发给主人 */
  async forwardToMaster(e) {
    if (!e.isGroup) {
      return e.reply('【传音】请在群聊里使用，这样回音才能带回群里。')
    }

    const content = String(e.msg || '')
      .replace(/^#传音给作者\s*/, '')
      .trim()
    if (!content) {
      return e.reply(
        ['【传音】内容不能为空。', '格式：#传音给作者 你想说的话', '示例：#传音给作者 建议增加一键扫荡'].join('\n'),
      )
    }
    if (content.length > MAX_CONTENT) {
      return e.reply(`【传音】内容太长（上限 ${MAX_CONTENT} 字），请分段发送。`)
    }

    const masters = this.masters()
    if (masters.includes(String(e.user_id))) {
      return e.reply('【传音】你自己就是主人，不用传音给自己。')
    }

    const cooldownKey = `${e.group_id}:${e.user_id}`
    const now = Date.now()
    const last = COOLDOWN.get(cooldownKey) || 0
    if (now - last < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (now - last)) / 1000)
      return e.reply(`【传音】刚发过啦，${wait} 秒后再试。`)
    }
    COOLDOWN.set(cooldownKey, now)

    const origin = {
      groupId: String(e.group_id),
      groupName: e.group_name || '',
      userId: String(e.user_id),
      nickname: e.sender?.card || e.sender?.nickname || String(e.user_id),
      content,
      createdAt: now,
    }

    const text = this.buildForwardText(origin)
    const errors = []
    let delivered = 0

    for (const qq of masters) {
      try {
        const res = await this.sendPrivate(qq, text)
        const messageId = res?.message_id ?? res?.data?.message_id ?? res?.messageId
        if (relayStore.set(messageId, origin)) delivered++
        else errors.push(`${qq}: 已发出但没取到消息ID，无法引用回复`)
      } catch (err) {
        errors.push(`${qq}: ${err.message}`)
      }
    }

    if (delivered) {
      return e.reply(
        [
          '【传音成功】',
          `已送达 ${delivered} 位主人，等待回音。`,
          '（主人「引用」那条转发消息回复，即可把回音 @ 给你）',
        ].join('\n'),
      )
    }

    this.writeFallback(origin, errors)
    return e.reply(
      [
        '【传音失败】',
        errors.join('；') || '没有可用的主人',
        '',
        '内容已记录到本地，管理员可稍后在 resources/data/chuanYin_log 查看。',
      ].join('\n'),
    )
  }

  /** ② 主人引用转发消息 → 回原群 @ 发送者 */
  async replyFromMaster(e) {
    if (!e.isPrivate) return false
    if (!this.masters().includes(String(e.user_id))) return false
    if (!e.reply_id) return false

    const origin = relayStore.get(e.reply_id)
    if (!origin) return false // 引用的不是转发消息，交还给其它插件

    const text = String(e.msg || '').trim()
    const images = Array.isArray(e.img) ? e.img.length : 0
    if (!text && !images) return e.reply('【回音】回复内容为空，已忽略。')
    if (text.length > MAX_CONTENT) return e.reply(`【回音】内容太长（上限 ${MAX_CONTENT} 字）。`)

    const body = this.buildReplyText(origin, text, images)
    try {
      const group = Bot.pickGroup(origin.groupId)
      // 用数组而不是 join，否则 at 段会被字符串化成 [object Object]
      await group.sendMsg([buildAt(origin.userId), '\n', body])
      return e.reply(`【回音】已转达到「${origin.groupName || origin.groupId}」的 ${origin.nickname}。`)
    } catch (err) {
      return e.reply(`【回音】转达失败：${err.message}\n（可能是机器人已不在该群）`)
    }
  }

  /** 使用说明 / 状态 */
  async relayHelp() {
    const masters = this.masters()
      .map(qq => `${qq.slice(0, 3)}***${qq.slice(-2)}`)
      .join('、')
    const latest = relayStore.latest()
    const lines = [
      '【传音 · 使用说明】',
      '群成员：#传音给作者 想说的话',
      '  → 自动私聊转发给主人，附带群名/群号/发送者昵称与 QQ',
      '主人：直接「引用」那条转发消息回复',
      '  → 机器人回到原群，@ 发送者并转达你的回复',
      '',
      `接收主人：${masters}`,
      `有效转发记录：${relayStore.size} 条（7 天过期）`,
    ]
    if (latest) {
      lines.push(
        `最近一条：${latest.nickname} @ ${latest.groupName || latest.groupId}，${new Date(latest.createdAt).toLocaleString('zh-CN')}`,
      )
    }
    return this.reply(lines.join('\n'))
  }

  // ─────────────────────────── 内部方法 ───────────────────────────

  buildForwardText(o) {
    const time = new Date(o.createdAt || Date.now()).toLocaleString('zh-CN')
    return [
      '【诸天传音】',
      `群聊：${o.groupName || '未知群名'}（${o.groupId}）`,
      `发送者：${o.nickname}（${o.userId}）`,
      `时间：${time}`,
      '────────────',
      o.content,
      '────────────',
      '↑ 引用本条消息回复，我会把回音 @ 给发送者。',
    ].join('\n')
  }

  buildReplyText(o, text, images) {
    const preview = String(o.content || '').replace(/\s+/g, ' ')
    const clipped = preview.length > 60 ? `${preview.slice(0, 60)}…` : preview
    const lines = [
      '【作者回音】',
      `回应 ${o.nickname} 的传音：`,
      `> ${clipped}`,
      '────────────',
      text || '（无文字内容）',
    ]
    if (images) lines.push(`（附 ${images} 张图片，暂不支持转达）`)
    return lines.join('\n')
  }

  /**
   * 私聊发送。TRSS 里 Bot.pickFriend(uid) 拿到的对象带 sendMsg。
   * 失败最常见原因：机器人不在对方好友列表。
   */
  async sendPrivate(qq, msg) {
    const id = /^\d+$/.test(qq) ? Number(qq) : qq
    const target = Bot.pickFriend(id)
    if (!target?.sendMsg) throw new Error('无法定位私聊对象')
    return target.sendMsg(msg)
  }

  /** 所有主人都不通时落本地日志，至少不丢内容 */
  writeFallback(origin, errors) {
    try {
      const dir = `${__PATH.data_path}/chuanYin_log`
      fs.mkdirSync(dir, { recursive: true })
      const file = `${dir}/chuanYin_${new Date().toISOString().slice(0, 10)}.log`
      const entry = [
        `[${new Date().toLocaleString('zh-CN')}]`,
        `发送者: ${origin.nickname}(${origin.userId})`,
        `来源群: ${origin.groupName || '未知'}(${origin.groupId})`,
        `内容: ${origin.content}`,
        `失败原因: ${errors.join('；') || '未知'}`,
        '---',
      ].join('\n')
      fs.appendFileSync(file, `${entry}\n`)
    } catch (err) {
      globalThis.logger?.warn?.(`[传音] 兜底日志写入失败：${err.message}`)
    }
  }
}

export default AuthorRelay
