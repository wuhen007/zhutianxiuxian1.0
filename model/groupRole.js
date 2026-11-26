/**
 * 群内身份判断。
 *
 * 不同适配器给的字段不一样：
 *   ICQQ / OneBot  → e.member.is_owner / e.member.is_admin
 *   QQ 官方通道    → 同上
 *   Milky          → 不给 e.member，只把群成员信息并进 e.sender（含 role）
 *
 * 只认 e.member 的话，切到 Milky 后群主/管理员会「凭空失去权限」，
 * 表现为「只有群主能用的指令，群主发了没反应」。
 */
export function groupRole(e) {
  if (e?.member?.is_owner) return 'owner'
  if (e?.member?.is_admin) return 'admin'
  const role = String(e?.sender?.role || '').toLowerCase()
  if (role === 'owner' || role === 'admin') return role
  return 'member'
}

export function isGroupOwner(e) {
  return groupRole(e) === 'owner'
}

export function isGroupAdmin(e) {
  return groupRole(e) !== 'member'
}
