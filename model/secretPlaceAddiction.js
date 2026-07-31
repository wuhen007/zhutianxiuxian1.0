const MINUTE_MS = 60 * 1000;

export function createSecretPlaceAddictionAction({
  durationMinutes,
  totalCount,
  place,
  xf,
  now = Date.now(),
}) {
  const interval = durationMinutes * MINUTE_MS / totalCount;

  return {
    action: '秘境历练',
    start_time: now,
    total_time: durationMinutes,
    remaining_time: durationMinutes,
    total_count: totalCount,
    settled_count: 0,
    interval,
    next_settle_time: now + interval,
    shutup: '1',
    working: '1',
    Place_action: '1',
    Place_actionplus: '0',
    power_up: '1',
    mojie: '1',
    xijie: '1',
    plant: '1',
    mine: '1',
    Place_address: place,
    XF: xf,
  };
}

export function normalizeLegacySecretPlaceAddictionAction(action) {
  if (!action || action.Place_actionplus != '0' || action.next_settle_time != null) {
    return action;
  }

  const totalCount = Number(action.total_count ?? action.cishu);
  const settledCount = Number(action.settled_count ?? 0);
  const durationMs = action.total_time != null
    ? Number(action.total_time) * MINUTE_MS
    : Number(action.time);
  const startTime = action.start_time != null
    ? Number(action.start_time)
    : Number(action.end_time) - durationMs;

  if (
    !Number.isFinite(totalCount) || totalCount <= 0 ||
    !Number.isFinite(settledCount) || settledCount < 0 ||
    !Number.isFinite(durationMs) || durationMs <= 0 ||
    !Number.isFinite(startTime)
  ) {
    return action;
  }

  const interval = durationMs / totalCount;
  return {
    ...action,
    start_time: startTime,
    total_time: durationMs / MINUTE_MS,
    remaining_time: Math.max(0, (totalCount - settledCount) * interval / MINUTE_MS),
    total_count: totalCount,
    settled_count: settledCount,
    interval,
    next_settle_time: startTime + interval * (settledCount + 1),
  };
}
