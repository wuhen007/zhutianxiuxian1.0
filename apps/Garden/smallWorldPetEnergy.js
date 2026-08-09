export function calculatePetEnergyPeriod(energy, maxEnergy, hours, hourlyCost) {
  const safeMaxEnergy = Math.max(1, Number(maxEnergy) || 100);
  const rawEnergy = Number(energy ?? safeMaxEnergy);
  const startEnergy = Math.max(0, Math.min(safeMaxEnergy, Number.isFinite(rawEnergy) ? rawEnergy : safeMaxEnergy));
  const elapsedHours = Math.max(0, Number(hours) || 0);
  const cost = Number(hourlyCost) || 0;

  if (cost < 0) {
    const endEnergy = Math.min(safeMaxEnergy, startEnergy - cost * elapsedHours);
    return { startEnergy, endEnergy, activeHours: 0, averageEnergy: (startEnergy + endEnergy) / 2, exhausted: false };
  }

  const activeHours = cost > 0
    ? Math.min(elapsedHours, startEnergy / cost)
    : elapsedHours;
  const endEnergy = Math.max(0, startEnergy - cost * activeHours);
  return {
    startEnergy,
    endEnergy,
    activeHours,
    averageEnergy: (startEnergy + endEnergy) / 2,
    exhausted: cost > 0 && endEnergy <= 0,
  };
}
