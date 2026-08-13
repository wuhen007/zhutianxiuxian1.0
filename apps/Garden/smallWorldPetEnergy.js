export function calculatePetEnergyPeriod(energy, maxEnergy, hours, hourlyCost) {
  const safeMaxEnergy = Math.max(1, Number(maxEnergy) || 100);
  const rawEnergy = Number(energy ?? safeMaxEnergy);
  const startEnergy = Math.max(0, Math.min(safeMaxEnergy, Number.isFinite(rawEnergy) ? rawEnergy : safeMaxEnergy));
  const elapsedHours = Math.max(0, Number(hours) || 0);
  const cost = Number(hourlyCost) || 0;

  if (cost < 0) {
    const endEnergy = Math.min(safeMaxEnergy, startEnergy - cost * elapsedHours);
    return { startEnergy, endEnergy, activeHours: 0, weightedWorkHours: 0, exhausted: false };
  }

  if (cost === 0) {
    const efficiency = startEnergy >= 30 ? 1 : startEnergy >= 10 ? 0.6 : startEnergy > 0 ? 0.2 : 0;
    return {
      startEnergy,
      endEnergy: startEnergy,
      activeHours: startEnergy > 0 ? elapsedHours : 0,
      weightedWorkHours: elapsedHours * efficiency,
      exhausted: false,
    };
  }

  const activeHours = Math.min(elapsedHours, startEnergy / cost);
  const endEnergy = Math.max(0, startEnergy - cost * activeHours);
  const hoursAbove = threshold => Math.max(0, Math.min(activeHours, (startEnergy - threshold) / cost));
  const highHours = hoursAbove(30);
  const mediumHours = Math.max(0, hoursAbove(10) - highHours);
  const lowHours = Math.max(0, activeHours - highHours - mediumHours);
  return {
    startEnergy,
    endEnergy,
    activeHours,
    weightedWorkHours: highHours + mediumHours * 0.6 + lowHours * 0.2,
    exhausted: cost > 0 && endEnergy <= 0,
  };
}
