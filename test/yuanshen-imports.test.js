import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '../apps/User/yuanshen.js')

/**
 * 内景地批量修炼会调用 ForwardMsg(e, msgs) 发合并转发。
 * 之前这个函数没在 import 里，运行到批量修炼就 ReferenceError，
 * 单测又只覆盖纯逻辑，所以漏了。这里用静态检查兜住同一类问题。
 */
test('yuanshen.js 用到的 ForwardMsg 必须已导入', () => {
  const src = fs.readFileSync(APP, 'utf8')
  const usesIt = /\bForwardMsg\s*\(/.test(src)
  assert.ok(usesIt, '如果不再使用 ForwardMsg，可以删掉这个测试')
  const imports = [...src.matchAll(/import[\s\S]*?from\s*['"][^'"]+['"];?/g)].map(m => m[0]).join('\n')
  assert.match(imports, /\bForwardMsg\b/, 'ForwardMsg 未在 import 中声明')
})
