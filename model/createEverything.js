const QUANTITY_STEPS = Object.freeze([
  [10, 2],
  [100, 2],
  [300, 2],
  [500, 2],
  [700, 2],
  [999, 2],
  [1200, 3],
]);

export function getCreationQuantityMultiplier(amount) {
  const count = Math.max(1, Math.trunc(Number(amount) || 1));
  return QUANTITY_STEPS.reduce(
    (multiplier, [threshold, step]) => count > threshold ? multiplier * step : multiplier,
    1,
  );
}

export function calculateCreationEverything(authorityLevel, rarity, amount) {
  const level = Math.max(0, Math.trunc(Number(authorityLevel) || 0));
  const normalizedRarity = Math.max(1, Math.ceil(Number(rarity) || 1));
  const normalizedAmount = Math.max(1, Math.trunc(Number(amount) || 1));
  const minutesPerRarity = level >= 23 ? 1 : level === 22 ? 3 : 5;
  const quantityMultiplier = getCreationQuantityMultiplier(normalizedAmount);
  const minutes = Math.ceil(normalizedRarity * minutesPerRarity * quantityMultiplier);

  return {
    rarity: normalizedRarity,
    amount: normalizedAmount,
    minutesPerRarity,
    quantityMultiplier,
    minutes,
    durationMs: minutes * 60_000,
    causalDebt: level >= 23 ? 0 : minutes,
  };
}

export function formatCreationDuration(minutes) {
  const total = Math.max(1, Math.ceil(Number(minutes) || 1));
  const days = Math.floor(total / 1440);
  const hours = Math.floor(total % 1440 / 60);
  const remainingMinutes = total % 60;
  return [days ? `${days}天` : '', hours ? `${hours}小时` : '', remainingMinutes ? `${remainingMinutes}分钟` : '']
    .filter(Boolean)
    .join('');
}
