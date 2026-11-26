/**
 * 游戏更新内容（给玩家看的调整记录）
 *
 * 数据直接来自插件仓库的 git 提交，取最近 MAX_ENTRIES 条。
 * 好处：改完代码提交一次，玩家那边就自动是最新的，不用再手工维护一份清单。
 *
 * 只在本地 git 可用时工作；拿不到提交（比如部署目录没有 .git）时返回空数组，
 * 由调用方给出「暂无记录」的兜底文案。
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const MAX_ENTRIES = 10
/** 插件仓库根目录（本文件在 model/ 下） */
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 读取最近 limit 条提交。
 * 用 execFileSync 而不是 exec：提交信息里的括号、# 不会被 shell 解释。
 */
export function readCommits(limit = MAX_ENTRIES) {
  try {
    const out = execFileSync(
      'git',
      ['-C', REPO, 'log', `-${limit}`, '--date=short', '--pretty=format:%ad%x09%s'],
      { encoding: 'utf8', timeout: 5000, windowsHide: true },
    )
    return out
      .split('\n')
      .map(line => line.replace(/\r$/, ''))
      .filter(line => line.includes('\t'))
      .map(line => {
        const [date, ...rest] = line.split('\t')
        return { date: date.trim(), subject: rest.join('\t').trim() }
      })
      .filter(item => item.subject)
      .slice(0, limit)
  } catch {
    return []
  }
}

/** 渲染成给玩家看的文本：同一天的提交合并到同一个日期下面 */
export function formatUpdates(commits = []) {
  const list = Array.isArray(commits) ? commits.filter(c => c && c.subject) : []
  if (!list.length) {
    return '【修仙更新】暂时读不到更新记录（仓库缺少 git 信息）。'
  }

  const lines = [`【修仙更新·最近 ${list.length} 条】`]
  let lastDate = ''
  for (const item of list) {
    if (item.date && item.date !== lastDate) {
      lines.push('', item.date)
      lastDate = item.date
    }
    lines.push(`· ${item.subject}`)
  }
  return lines.join('\n')
}
