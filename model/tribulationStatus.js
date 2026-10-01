export function formatTribulationStatus(lock, { detail = false } = {}) {
  const elapsed = Number.isFinite(lock.elapsedSeconds) ? `已运行${lock.elapsedSeconds}秒` : '耗时未知';
  const lease = Number.isFinite(lock.ttlSeconds) ? `当前租约剩余约${lock.ttlSeconds}秒` : '租约时长待确认';
  const guidance = '可发送 #渡劫状态 查看进度；#恢复渡劫 仅处理已中断且释放锁的检查点，不会强制解锁。';
  if (lock.local) {
    const lines = [`【渡劫中】${lock.kind || '本机渡劫流程'}仍在运行，${elapsed}。`];
    if (lock.replySuppressed) lines.push('本次播报发送异常，已跳过等待；后台仍在结算，并非一直等待发消息。');
    if (detail) {
      lines.push(lease + '；正常运行会自动续期，剩余秒数不是渡劫倒计时。');
      if (Number.isFinite(lock.idleSeconds)) lines.push(`距最近流程推进${lock.idleSeconds}秒。`);
      if (lock.leaseLost) lines.push('租约续期异常，已阻止旧流程继续写档；请联系管理员核对，暂不强制释放。');
      else if (lock.idleSeconds >= 180) lines.push('较长时间未推进，请联系管理员检查日志；不直接回档，以免重复结算。');
    }
    lines.push(guidance);
    return lines.join('\n');
  }
  return [
    `【渡劫保护】本机没有运行中的渡劫，但仍有远端租约：${lease}。`,
    detail ? '可能是其他实例仍在执行，也可能是重启后尚未过期的租约；仅凭此状态不删除它。' : '如果刚重启过机器人，请等租约自然到期后再试。',
    '新版进程中断后，未续期租约通常在2分钟内到期；升级前的旧租约仍按原期限自然到期。',
    guidance,
  ].join('\n');
}
