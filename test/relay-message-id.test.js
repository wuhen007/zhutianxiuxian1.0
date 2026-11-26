import assert from 'node:assert/strict'
import test from 'node:test'
import { extractMessageId } from '../model/relayMessageId.js'

test('协议号 Milky：data.message_seq', () => {
  assert.equal(extractMessageId({ retcode: 0, data: { message_seq: 416268001 } }), '416268001')
})

test('协议号 OneBot/ICQQ：message_id', () => {
  assert.equal(extractMessageId({ message_id: 12345 }), '12345')
})

test('官方通道：id / data.id', () => {
  assert.equal(extractMessageId({ id: 'ROBOT1.0_abc' }), 'ROBOT1.0_abc')
  assert.equal(extractMessageId({ data: { id: 'ROBOT1.0_def' } }), 'ROBOT1.0_def')
})

test('广播数组取第一个有 id 的', () => {
  assert.equal(extractMessageId([null, {}, { message_id: 9 }]), '9')
})

test('取不到返回 null', () => {
  assert.equal(extractMessageId({}), null)
  assert.equal(extractMessageId({ retcode: 0, data: {} }), null)
  assert.equal(extractMessageId(null), null)
})
