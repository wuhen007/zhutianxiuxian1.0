function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function getPlayerActionEndTime(action) {
  if (!action || typeof action !== 'object') return null;
  if (String(action.Place_actionplus) === '0') {
    const start = finite(action.start_time);
    const totalMinutes = finite(action.total_time);
    if (start !== null && totalMinutes !== null) return start + totalMinutes * 60 * 1000;
  }
  return finite(action.end_time);
}

export function inspectPlayerAction(raw, now = Date.now()) {
  if (!raw) return { active: false, action: null, endTime: null, reason: 'empty' };
  let action;
  try {
    action = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { active: false, action: null, endTime: null, reason: 'invalid' };
  }
  if (!action || typeof action !== 'object') {
    return { active: false, action: null, endTime: null, reason: 'invalid' };
  }
  if (action.action === '投影诸天') {
    return { active: true, action, endTime: null, reason: 'projection' };
  }
  const endTime = getPlayerActionEndTime(action);
  if (endTime === null) return { active: false, action, endTime: null, reason: 'invalid' };
  return {
    active: Number(now) <= endTime,
    action,
    endTime,
    reason: Number(now) <= endTime ? 'timed' : 'expired',
  };
}

export function formatPlayerActionBlock(state) {
  if (state?.reason === 'projection') {
    return '你已经在投影诸天中，请输入 1/2/3/4 继续剧情，或使用 #退出投影';
  }
  const actionName = state?.action?.action || '其他行动';
  const remaining = Math.max(0, Number(state?.endTime) - Date.now());
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor(remaining % 60000 / 1000);
  return `你当前正在${actionName}中，剩余${minutes}分${seconds}秒，结束后才能投影。`;
}
