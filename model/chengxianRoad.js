export const CHENGXIAN_ROAD_LIFECYCLE = Object.freeze({
  CHECK_INTERVAL_YEARS: 2000,
  OPEN_DURATION_YEARS: 1000,
  REOPEN_COOLDOWN_YEARS: 10000,
});

function toWorldYear(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.trunc(numeric) : fallback;
}

function crossedMilestone(previousWorldYear, worldYear, interval) {
  const previous = toWorldYear(previousWorldYear);
  const current = toWorldYear(worldYear);
  return current >= interval && Math.floor(current / interval) > Math.floor(previous / interval);
}

/** The road is eligible for a new roll only after its persistent cooldown. */
export function isChengxianRoadCheckDue(data, previousWorldYear, worldYear) {
  if (Number(data?.成仙路) === 1) return false;

  const current = toWorldYear(worldYear);
  const nextCheckWorldYear = toWorldYear(data?.成仙路下次判定总年份, -1);
  if (nextCheckWorldYear > 0) return current >= nextCheckWorldYear;
  return crossedMilestone(
    previousWorldYear,
    current,
    CHENGXIAN_ROAD_LIFECYCLE.CHECK_INTERVAL_YEARS,
  );
}

export function isChengxianRoadCloseDue(data, worldYear) {
  if (Number(data?.成仙路) !== 1) return false;

  const openedAt = toWorldYear(data?.成仙路开启总年份, -1);
  if (openedAt < 0) return true;
  return toWorldYear(worldYear) >= openedAt + CHENGXIAN_ROAD_LIFECYCLE.OPEN_DURATION_YEARS;
}

export function markChengxianRoadOpened(data, worldYear) {
  const openedAt = toWorldYear(worldYear);
  data.成仙路 = 1;
  data.成仙路开启总年份 = openedAt;
  data.成仙路下次判定总年份 = openedAt + CHENGXIAN_ROAD_LIFECYCLE.REOPEN_COOLDOWN_YEARS;
}

export function markChengxianRoadCheckFailed(data, worldYear) {
  data.成仙路下次判定总年份 =
    toWorldYear(worldYear) + CHENGXIAN_ROAD_LIFECYCLE.CHECK_INTERVAL_YEARS;
}

export function closeChengxianRoad(data) {
  data.成仙路 = 0;
  data.成仙路开启总年份 = 0;
}
