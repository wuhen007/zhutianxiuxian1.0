/**
 * 从 sendMsg 的返回值里取消息ID。
 *
 * 各通道字段不同，取不到就没法把「主人引用回复」映射回原群：
 *   协议号 Milky  → { retcode, data: { message_seq } }   ← 不是 message_id
 *   ICQQ/OneBot   → { message_id }
 *   QQ 官方通道   → { id } 或 { data: { id } }
 *   广播发送      → 数组，取第一个带 id 的
 */
export function extractMessageId(res) {
  if (!res) return null
  const list = Array.isArray(res) ? res : [res]
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const id = item.message_id ?? item.messageId ?? item.id ?? item.message_seq
      ?? item.data?.message_id ?? item.data?.id ?? item.data?.message_seq
    if (id !== undefined && id !== null && String(id) !== '') return String(id)
  }
  return null
}
