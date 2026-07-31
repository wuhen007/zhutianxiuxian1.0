export const REALM_EVENT_YEARS_PER_ERA = 10000;
export const REALM_EVENT_ERAS_PER_EPOCH = 5;

export function getRealmEventWorldYear(eraIndex, years, epoch = 1) {
  const safeEpoch = Math.max(1, Math.trunc(Number(epoch) || 1));
  const safeEraIndex = Math.max(0, Math.trunc(Number(eraIndex) || 0));
  const safeYears = Math.max(0, Number(years) || 0);
  return (
    ((safeEpoch - 1) * REALM_EVENT_ERAS_PER_EPOCH + safeEraIndex) *
      REALM_EVENT_YEARS_PER_ERA +
    safeYears
  );
}

export function getLastRealmEventWorldYear(
  config,
  currentWorldYear,
  currentYears
) {
  if (
    config.lastEventWorldYear !== null &&
    config.lastEventWorldYear !== undefined
  ) {
    const savedWorldYear = Number(config.lastEventWorldYear);
    if (Number.isFinite(savedWorldYear)) return savedWorldYear;
  }

  const legacyYear = Math.max(0, Number(config.lastEventTime) || 0);
  const eraYears = Math.max(0, Number(currentYears) || 0);
  const eraStart = currentWorldYear - eraYears;
  return legacyYear <= eraYears
    ? eraStart + legacyYear
    : eraStart - REALM_EVENT_YEARS_PER_ERA + legacyYear;
}

export function isRealmEventCooldownReady(
  config,
  currentWorldYear,
  currentYears
) {
  if (!config.enableEvents) return false;
  const lastWorldYear = getLastRealmEventWorldYear(
    config,
    currentWorldYear,
    currentYears
  );
  const cooldown = Math.max(0, Number(config.eventCooldown) || 0);
  return currentWorldYear - lastWorldYear >= cooldown;
}
