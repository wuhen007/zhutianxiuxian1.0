export const MAX_WORLD_ACCUMULATION_HOURS = 96;

export function calculateWorldAccumulation(hoursPassed, timeRatio) {
  const safeHours = Math.max(0, Number(hoursPassed) || 0);
  const safeTimeRatio = Math.max(0, Number(timeRatio) || 0);
  const realHours = Math.min(safeHours, MAX_WORLD_ACCUMULATION_HOURS);

  return {
    realHours,
    effectiveHours: realHours * safeTimeRatio,
  };
}

export function settleResourceRemainders(rawAmounts, previousRemainders = {}) {
  const amounts = {};
  const remainders = { ...previousRemainders };
  for (const [name, rawAmount] of Object.entries(rawAmounts || {})) {
    const total = Math.max(0, Number(rawAmount) || 0)
      + Math.max(0, Number(previousRemainders?.[name]) || 0);
    const amount = Math.floor(total + 1e-9);
    amounts[name] = amount;
    const remainder = Math.max(0, total - amount);
    if (remainder > 1e-9) remainders[name] = remainder;
    else delete remainders[name];
  }
  return { amounts, remainders };
}

export function calculateElapsedEventChance(
  elapsedHours,
  periodChance = 0.08,
  periodHours = 24
) {
  const safeHours = Math.max(0, Number(elapsedHours) || 0);
  const safeChance = Math.max(0, Math.min(1, Number(periodChance) || 0));
  const safePeriod = Math.max(Number(periodHours) || 0, Number.EPSILON);

  return 1 - Math.pow(1 - safeChance, safeHours / safePeriod);
}
