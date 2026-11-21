import assert from 'node:assert/strict'
import test from 'node:test';
import { MAX_ENTRIES, trimNotes, formatNotes } from '../model/updateNotes.js'

const make = n => ({ date: '2026-11-21', title: `第${n}条`, items: [`条目${n}`] })

test('只保留最近 10 条', () => {
  const list = Array.from({ length: 15 }, (_, i) => make(i + 1))
  const kept = trimNotes(list)
  assert.equal(kept.length, MAX_ENTRIES)
  // 保留的是数组前面的（最新在前的存储约定）
  assert.equal(kept[0].title, '第1条')
  assert.equal(kept.at(-1).title, '第10条')
})

test('渲染带序号、日期和条目', () => {
  const text = formatNotes([make(1), make(2)])
  assert.match(text, /【修仙更新·最近 2 条】/)
  assert.match(text, /1\. 2026-11-21 第1条/)
  assert.match(text, /· 条目1/)
  assert.match(text, /2\. 2026-11-21 第2条/)
})

test('空列表给出明确提示而不是空白', () => {
  assert.match(formatNotes([]), /暂无更新记录/)
})
