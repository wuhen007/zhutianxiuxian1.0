import { getRealmEventWorldYear } from '../../model/realmEventClock.js';

export const XIANGU_STAGE = Object.freeze({
  CLOSED: 'closed',
  PREPARING: 'preparing',
  OPEN: 'open',
});

export const XIANGU_LIFECYCLE = Object.freeze({
  BLOOM_CHECK_INTERVAL_YEARS: 2000,
  PREPARATION_YEARS: 1000,
  OPEN_DURATION_YEARS: 10000,
});

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toWorldYear(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0
    ? Math.trunc(numeric)
    : fallback;
}

function getStoredLifecycleWorldYear(value, currentWorldYear, { allowZero = false } = {}) {
  const saved = toWorldYear(value, -1);
  // The reset/default value is 0. It is only a real timestamp at world year 0.
  return saved > 0 || (saved === 0 && (allowZero || currentWorldYear === 0)) ? saved : -1;
}

function assignIfChanged(target, key, value, changes) {
  if (target[key] !== value) {
    target[key] = value;
    changes.changed = true;
  }
}

function makeSessionId(worldYear) {
  return `xiangu-${worldYear}`;
}

function normalizeOpenState(data, worldYear, openDurationYears, changes) {
  const savedOpeningYear = getStoredLifecycleWorldYear(data.仙古秘境开启总年份, worldYear, {
    allowZero: data.仙古秘境阶段 === XIANGU_STAGE.OPEN,
  });
  // Old saves only had a local opening year. Start their remaining lifecycle now
  // instead of immediately closing a live manually-opened instance.
  const openingWorldYear = savedOpeningYear >= 0 ? savedOpeningYear : worldYear;
  const savedClosingYear = getStoredLifecycleWorldYear(data.仙古秘境关闭总年份, worldYear);
  const closingWorldYear = savedClosingYear >= openingWorldYear
    ? savedClosingYear
    : openingWorldYear + openDurationYears;

  assignIfChanged(data, '仙古秘境', 1, changes);
  assignIfChanged(data, '仙古秘境阶段', XIANGU_STAGE.OPEN, changes);
  assignIfChanged(data, '仙古秘境开启时间', openingWorldYear, changes);
  assignIfChanged(data, '仙古秘境开启总年份', openingWorldYear, changes);
  assignIfChanged(data, '仙古秘境关闭总年份', closingWorldYear, changes);
  if (!data.仙古秘境会话ID) {
    assignIfChanged(data, '仙古秘境会话ID', makeSessionId(openingWorldYear), changes);
  }

  return { openingWorldYear, closingWorldYear };
}

function closeXiangu(data, changes) {
  assignIfChanged(data, '仙古秘境', 0, changes);
  assignIfChanged(data, '仙古秘境阶段', XIANGU_STAGE.CLOSED, changes);
  assignIfChanged(data, '仙古秘境开启时间', 0, changes);
  assignIfChanged(data, '仙古秘境会话ID', '', changes);
  assignIfChanged(data, '仙古秘境花蕾现世总年份', 0, changes);
  assignIfChanged(data, '仙古秘境准备结束总年份', 0, changes);
  assignIfChanged(data, '仙古秘境开启总年份', 0, changes);
  assignIfChanged(data, '仙古秘境关闭总年份', 0, changes);
}

function openXiangu(data, worldYear, openDurationYears, changes) {
  assignIfChanged(data, '仙古秘境', 1, changes);
  assignIfChanged(data, '仙古秘境阶段', XIANGU_STAGE.OPEN, changes);
  // Keep the legacy field globally unique too: xianguPlace uses it as a map seed.
  assignIfChanged(data, '仙古秘境开启时间', worldYear, changes);
  assignIfChanged(data, '仙古秘境开启总年份', worldYear, changes);
  assignIfChanged(data, '仙古秘境关闭总年份', worldYear + openDurationYears, changes);
  assignIfChanged(data, '仙古秘境会话ID', makeSessionId(worldYear), changes);
}

/** Return an absolute year that survives era and epoch rollover. */
export function getXianguWorldYear(eraIndex, years, epoch = 1) {
  return getRealmEventWorldYear(eraIndex, years, epoch);
}

/** Legacy `仙古秘境 === 1` remains the source of truth for entry permission. */
export function getXianguLifecycleStage(data) {
  if (!isRecord(data)) return XIANGU_STAGE.CLOSED;
  if (Number(data.仙古秘境) === 1) return XIANGU_STAGE.OPEN;
  return data.仙古秘境阶段 === XIANGU_STAGE.PREPARING
    ? XIANGU_STAGE.PREPARING
    : XIANGU_STAGE.CLOSED;
}

/**
 * Runtime action gate. A player can remain persisted as `in_xiangu` after a
 * round closes, so the player flag alone is not enough to authorize actions.
 * Legacy records without a stored round identifier remain valid while the
 * current round is open.
 */
export function isXianguPlayerRoundCurrent(player, data) {
  if (!isRecord(player) || !player.in_xiangu) return false;
  if (getXianguLifecycleStage(data) !== XIANGU_STAGE.OPEN) return false;

  const currentSessions = [
    data.仙古秘境会话ID,
    data.仙古秘境开启时间,
    data.仙古秘境开启总年份,
  ]
    .map(value => String(value ?? '').trim())
    .filter(Boolean);
  const playerSession = String(player.xiangu_world_seed ?? '').trim();

  // These markers predate the persistent round id and must not be mistaken
  // for a stale round when the first lifecycle fields are introduced.
  if (['legacy', 'manual-open', 'recovery'].includes(playerSession)) return true;

  // Missing identifiers are valid for pre-lifecycle/legacy saves. Once both
  // sides have an identifier, a different round must not reuse the old map.
  return currentSessions.length === 0 || !playerSession || currentSessions.includes(playerSession);
}

/** A check is due when a tick crosses a 2,000-year world milestone. */
export function shouldCheckXianguBloom(previousWorldYear, worldYear, interval = XIANGU_LIFECYCLE.BLOOM_CHECK_INTERVAL_YEARS) {
  const safeInterval = Math.max(1, toWorldYear(interval, XIANGU_LIFECYCLE.BLOOM_CHECK_INTERVAL_YEARS));
  const previous = toWorldYear(previousWorldYear);
  const current = toWorldYear(worldYear);
  return current >= safeInterval && Math.floor(current / safeInterval) > Math.floor(previous / safeInterval);
}

/** Preserve the historic first attempt rate (5% base + 10% per failed milestone). */
export function getXianguOpeningAttemptProbability(data) {
  const stored = Number(data?.仙古秘境开启概率);
  const previous = Number.isFinite(stored) && stored > 0 ? stored : 0.05;
  return Math.min(1, Number((previous + 0.1).toFixed(2)));
}

export function setXianguOpeningProbability(data, probability) {
  if (!isRecord(data)) throw new TypeError('仙古秘境位面数据无效');
  data.仙古秘境开启概率 = Math.max(0, Math.min(1, Number(probability) || 0));
}

/** Announce a flower bud. Entry remains closed until `准备结束总年份`. */
export function startXianguPreparation(data, {
  worldYear,
  preparationYears = XIANGU_LIFECYCLE.PREPARATION_YEARS,
} = {}) {
  if (!isRecord(data)) throw new TypeError('仙古秘境位面数据无效');

  const changes = { changed: false };
  const startsAt = toWorldYear(worldYear);
  const duration = Math.max(1, toWorldYear(preparationYears, XIANGU_LIFECYCLE.PREPARATION_YEARS));

  assignIfChanged(data, '仙古秘境', 0, changes);
  assignIfChanged(data, '仙古秘境阶段', XIANGU_STAGE.PREPARING, changes);
  assignIfChanged(data, '仙古秘境花蕾现世总年份', startsAt, changes);
  assignIfChanged(data, '仙古秘境准备结束总年份', startsAt + duration, changes);
  assignIfChanged(data, '仙古秘境开启时间', 0, changes);
  assignIfChanged(data, '仙古秘境开启总年份', 0, changes);
  assignIfChanged(data, '仙古秘境关闭总年份', 0, changes);
  assignIfChanged(data, '仙古秘境会话ID', '', changes);

  return {
    ...changes,
    transition: 'preparing',
    stage: XIANGU_STAGE.PREPARING,
    preparationEndsAt: startsAt + duration,
  };
}

/**
 * Advance the persistent lifecycle once. The function is deliberately pure
 * with respect to I/O so a failed broadcast cannot leave a half-written round.
 */
export function advanceXianguLifecycle(data, {
  worldYear,
  preparationYears = XIANGU_LIFECYCLE.PREPARATION_YEARS,
  openDurationYears = XIANGU_LIFECYCLE.OPEN_DURATION_YEARS,
} = {}) {
  if (!isRecord(data)) throw new TypeError('仙古秘境位面数据无效');

  const currentWorldYear = toWorldYear(worldYear);
  const preparationDuration = Math.max(1, toWorldYear(preparationYears, XIANGU_LIFECYCLE.PREPARATION_YEARS));
  const openDuration = Math.max(1, toWorldYear(openDurationYears, XIANGU_LIFECYCLE.OPEN_DURATION_YEARS));
  const changes = { changed: false };
  const stage = getXianguLifecycleStage(data);

  if (stage === XIANGU_STAGE.PREPARING) {
    const announcedAt = getStoredLifecycleWorldYear(
      data.仙古秘境花蕾现世总年份,
      currentWorldYear,
      { allowZero: true },
    );
    const safeAnnouncedAt = announcedAt >= 0 ? announcedAt : currentWorldYear;
    const savedPreparationEnd = getStoredLifecycleWorldYear(
      data.仙古秘境准备结束总年份,
      currentWorldYear,
    );
    const preparationEndsAt = savedPreparationEnd >= safeAnnouncedAt
      ? savedPreparationEnd
      : safeAnnouncedAt + preparationDuration;

    assignIfChanged(data, '仙古秘境', 0, changes);
    assignIfChanged(data, '仙古秘境阶段', XIANGU_STAGE.PREPARING, changes);
    assignIfChanged(data, '仙古秘境花蕾现世总年份', safeAnnouncedAt, changes);
    assignIfChanged(data, '仙古秘境准备结束总年份', preparationEndsAt, changes);

    if (currentWorldYear < preparationEndsAt) {
      return { ...changes, transition: null, stage: XIANGU_STAGE.PREPARING, preparationEndsAt };
    }

    openXiangu(data, currentWorldYear, openDuration, changes);
    return {
      ...changes,
      transition: 'opened',
      stage: XIANGU_STAGE.OPEN,
      openingWorldYear: currentWorldYear,
      closingWorldYear: currentWorldYear + openDuration,
    };
  }

  if (stage === XIANGU_STAGE.OPEN) {
    const { openingWorldYear, closingWorldYear } = normalizeOpenState(
      data,
      currentWorldYear,
      openDuration,
      changes,
    );

    if (currentWorldYear < closingWorldYear) {
      return { ...changes, transition: null, stage: XIANGU_STAGE.OPEN, openingWorldYear, closingWorldYear };
    }

    closeXiangu(data, changes);
    return {
      ...changes,
      transition: 'closed',
      stage: XIANGU_STAGE.CLOSED,
      openingWorldYear,
      closingWorldYear,
      clearManualRound: true,
    };
  }

  return { changed: false, transition: null, stage: XIANGU_STAGE.CLOSED };
}
