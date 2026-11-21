import assert from 'node:assert/strict'
import test from 'node:test'
import { readCommits, formatUpdates, MAX_ENTRIES } from '../model/updateNotes.js'

test('能读到本地 git 提交，且不超过 10 条', () => {
  const list = readCommits()
  assert.ok(list.length > 0, '应该能读到提交')
  assert.ok(list.length <= MAX_ENTRIES)
  assert.match(list[0].date, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(list[0].subject.length > 0)
})

test('同一天的提交合并到同一个日期下', () => {
  const text = formatUpdates([
    { date: '2026-11-21', subject: 'feat(更新内容): 新增 #更新内容' },
    { date: '2026-11-20', subject: 'fix(推送): 熔断期不再逐条刷日志' },
    { date: '2026-11-20', subject: 'feat(道具): 领取改为必须私聊' },
  ])
  assert.match(text, /【修仙更新·最近 3 条】/)
  assert.equal((text.match(/2026-11-20/g) || []).length, 1, '同一天只出现一次日期')
  assert.match(text, /· fix\(推送\): 熔断期不再逐条刷日志\n· feat\(道具\): 领取改为必须私聊/)
})

test('读不到提交时给出明确兜底文案', () => {
  assert.match(formatUpdates([]), /暂时读不到更新记录/)
})
