import assert from 'node:assert/strict'
import test from 'node:test'
import { groupRole, isGroupAdmin, isGroupOwner } from '../model/groupRole.js'

test('ICQQ / 官方通道：e.member', () => {
  assert.equal(groupRole({ member: { is_owner: true } }), 'owner')
  assert.equal(groupRole({ member: { is_admin: true } }), 'admin')
  assert.equal(groupRole({ member: {} }), 'member')
})

test('Milky：只有 e.sender.role', () => {
  assert.equal(groupRole({ sender: { role: 'owner' } }), 'owner')
  assert.equal(groupRole({ sender: { role: 'admin' } }), 'admin')
  assert.equal(groupRole({ sender: { role: 'member' } }), 'member')
})

test('两种字段都没有时是普通成员，不能崩', () => {
  assert.equal(groupRole({}), 'member')
  assert.equal(groupRole(null), 'member')
  assert.equal(isGroupOwner({}), false)
  assert.equal(isGroupAdmin({}), false)
})

test('e.member 优先于 sender.role', () => {
  assert.equal(groupRole({ member: { is_owner: true }, sender: { role: 'member' } }), 'owner')
})
