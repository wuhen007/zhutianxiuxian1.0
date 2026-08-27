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

export const PET_CARE_CYCLE = Object.freeze({ workHours: 14, restHours: 7, playHours: 3 });

export function calculatePetCarePeriod(energy, maxEnergy, hours, hourlyCost, cycleProgress = 0) {
  const cycleHours = PET_CARE_CYCLE.workHours + PET_CARE_CYCLE.restHours + PET_CARE_CYCLE.playHours;
  const safeHours = Math.max(0, Number(hours) || 0);
  const safeMaxEnergy = Math.max(1, Number(maxEnergy) || 100);
  const rawEnergy = Number(energy ?? safeMaxEnergy);
  const startEnergy = Math.max(0, Math.min(safeMaxEnergy, Number.isFinite(rawEnergy) ? rawEnergy : safeMaxEnergy));
  let progress = ((Number(cycleProgress) || 0) % cycleHours + cycleHours) % cycleHours;
  let remaining = safeHours;
  let currentEnergy = startEnergy;
  let activeHours = 0;
  let weightedWorkHours = 0;
  let restHours = 0;
  let playHours = 0;
  let meals = 0;

  while (remaining > 1e-9) {
    let phaseEnd;
    let phase;
    if (progress < PET_CARE_CYCLE.workHours) {
      phase = 'work';
      phaseEnd = PET_CARE_CYCLE.workHours;
    } else if (progress < PET_CARE_CYCLE.workHours + PET_CARE_CYCLE.restHours) {
      phase = 'rest';
      phaseEnd = PET_CARE_CYCLE.workHours + PET_CARE_CYCLE.restHours;
    } else {
      phase = 'play';
      phaseEnd = cycleHours;
    }

    const phaseHours = Math.min(remaining, phaseEnd - progress);
    if (phase === 'work') {
      const state = calculatePetEnergyPeriod(currentEnergy, maxEnergy, phaseHours, hourlyCost);
      currentEnergy = state.endEnergy;
      activeHours += state.activeHours;
      weightedWorkHours += state.weightedWorkHours;
    } else if (phase === 'rest') {
      const state = calculatePetEnergyPeriod(currentEnergy, maxEnergy, phaseHours, -8);
      currentEnergy = state.endEnergy;
      restHours += phaseHours;
    } else {
      playHours += phaseHours;
    }

    remaining -= phaseHours;
    progress += phaseHours;
    if (progress >= cycleHours - 1e-9) {
      progress = 0;
      meals += 1;
    }
  }

  return {
    startEnergy,
    endEnergy: currentEnergy,
    activeHours,
    weightedWorkHours,
    restHours,
    playHours,
    meals,
    cycleProgress: progress,
  };
}
