/**
 * 游戏更新内容指令
 *
 *   #更新内容   所有人都能看，返回最近 10 条 git 提交（同一天会合并到日期下）
 *
 * 数据来自插件仓库的提交记录，改完代码 commit 一次即可，不再手工维护清单。
 *
 * 与已有指令的关系（已核对，不冲突）：
 *   #更新公告  → ShowImeg/Showningmeng，发更新说明长图
 *   #查看日志  → AdminSuper，管理员读 vertion.txt 开发流水账
 *   #更新内容  → 本文件，面向玩家的提交记录
 */
import { plugin } from '../../api/api.js'
import { formatUpdates, readCommits } from '../../model/updateNotes.js'

export class UpdateNotes extends plugin {
  constructor() {
    super({
      name: 'UpdateNotes',
      dsc: '查看最近 10 条游戏调整内容',
      event: 'message',
      priority: 480,
      rule: [{ reg: '^#更新内容$', fnc: 'listNotes' }],
    })
  }

  async listNotes(e) {
    return e.reply(formatUpdates(readCommits()))
  }
}
