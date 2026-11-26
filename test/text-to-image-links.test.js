import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldKeepAsText } from '../model/textToImage.js'

/**
 * 带链接的回复必须保持文本，否则玩家点不开。
 * #无尽网页 / #无尽问道 的入口就是这种情况：多行说明里夹一条 URL。
 */
test('#无尽网页 这类含链接的回复保持文本', () => {
  const msg = [
    '【无痕的无尽劫境网页入口】',
    'http://1.2.3.4:8080/endless/abc?t=123',
    '专属入口两分钟内有效，仅限本人首次打开。',
  ].join('\n')
  assert.equal(shouldKeepAsText(msg), true)
})

test('纯链接同样保持文本', () => {
  assert.equal(shouldKeepAsText('https://example.com/a'), true)
})

test('普通长文仍然可以转图', () => {
  const msg = '【修仙状态】\n' + '修为：练气三层\n'.repeat(20)
  assert.equal(shouldKeepAsText(msg), false)
})

test('带 CQ 码 / at 标签保持文本', () => {
  assert.equal(shouldKeepAsText('[CQ:at,qq=123] 看这里'), true)
  assert.equal(shouldKeepAsText('<qqbot-at-user id="x" /> 看这里'), true)
})
