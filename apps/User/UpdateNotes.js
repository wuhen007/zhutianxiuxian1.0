/**
 * 游戏更新内容指令
 *
 *   #更新内容            所有人都能看，返回最近 10 条调整记录
 *   #添加更新 <标题换行条目>  仅作者（云崽 master）追加一条
 *
 * 与已有指令的关系（已核对，不冲突）：
 *   #更新公告  → ShowImeg/Showningmeng，发更新说明长图
 *   #查看日志  → AdminSuper，管理员读 vertion.txt 开发流水账
 *   #更新内容  → 本文件，面向玩家的简版调整记录
 */
import cfg from '../../../../lib/config/config.js'
import { plugin } from '../../api/api.js'
import { addNote, formatNotes, readNotes, MAX_ENTRIES } from '../../model/updateNotes.js'

/** 没有配置 master 时的兜底作者号 */
const FALLBACK_MASTER = '504010020'

export class UpdateNotes extends plugin {
  constructor() {
    super({
      name: 'UpdateNotes',
      dsc: '查看最近 10 条游戏调整内容，作者可追加',
      event: 'message',
      priority: 480,
      rule: [
        { reg: '^#更新内容$', fnc: 'listNotes' },
        { reg: '^#添加更新\\s*([\\s\\S]+)$', fnc: 'addUpdate' },
      ],
    })
  }

  async listNotes(e) {
    return e.reply(formatNotes(readNotes()))
  }

  async addUpdate(e) {
    if (!this.masters().includes(String(e.user_id))) {
      return e.reply('只有作者可以添加更新内容。')
    }

    const raw = String(e.msg || '').replace(/^#添加更新\s*/, '').trim()
    const lines = raw.split('\n').map(s => s.trim()).filter(Boolean)
    const title = lines.shift() || ''
    if (!title) return e.reply('格式：\n#添加更新 标题\n条目1\n条目2')

    let list
    try {
      list = addNote({ title, items: lines })
    } catch (err) {
      return e.reply(`添加失败：${err.message}`)
    }

    // 回执里带上最新一条，避免打错了却看不出来
    const latest = list[0]
    return e.reply([
      `✅ 已添加更新：${latest.date} ${latest.title}`,
      ...latest.items.map(item => `   · ${item}`),
      '',
      `当前共 ${list.length}/${MAX_ENTRIES} 条，玩家可发送「#更新内容」查看。`,
    ].join('\n'))
  }

  /** 作者列表：other.yaml 的 masterQQ / master，过滤掉非 QQ 项 */
  masters() {
    const set = new Set()
    const push = qq => {
      const id = String(qq ?? '').trim()
      if (/^\d{5,12}$/.test(id)) set.add(id)
    }
    try {
      for (const qq of cfg.masterQQ || []) push(qq)
      for (const list of Object.values(cfg.master || {})) for (const qq of list || []) push(qq)
    } catch { /* 配置异常时用兜底作者 */ }
    if (!set.size) set.add(FALLBACK_MASTER)
    return [...set]
  }
}
