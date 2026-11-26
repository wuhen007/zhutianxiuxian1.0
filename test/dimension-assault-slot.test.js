import assert from 'node:assert/strict'
import test from 'node:test'
import { nextAssaultSlot } from '../model/dimensionGuard.js'

/**
 * 永恒大战的来袭时间固定到每小时第 40 分钟：
 * 时代推进在 :00、裂界在 :20、来袭在 :40，三者错开，播报不再挤在同一分钟。
 */
const at = (hhmm) => new Date(`2026-11-25T${hhmm}:00+08:00`).getTime()

test('整点 → 本小时 :40', () => {
  assert.equal(new Date(nextAssaultSlot(at('14:00'))).getMinutes(), 40)
  assert.equal(new Date(nextAssaultSlot(at('14:00'))).getHours(), 14)
})

test(':39 → 仍是本小时 :40', () => {
  const t = nextAssaultSlot(at('14:39'))
  assert.equal(new Date(t).getHours(), 14)
  assert.equal(new Date(t).getMinutes(), 40)
})

test(':40 及之后 → 顺延到下小时 :40', () => {
  assert.equal(new Date(nextAssaultSlot(at('14:40'))).getHours(), 15)
  assert.equal(new Date(nextAssaultSlot(at('14:41'))).getHours(), 15)
  assert.equal(new Date(nextAssaultSlot(at('23:50'))).getHours(), 0)
})

test('结果一定在未来', () => {
  for (const hhmm of ['00:00', '07:15', '12:39', '18:40', '23:59']) {
    assert.ok(nextAssaultSlot(at(hhmm)) > at(hhmm), `${hhmm} 应晚于当前时刻`)
  }
})
