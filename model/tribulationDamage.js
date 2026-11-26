export function reduceTribulationDamageByDefense(damage, defense) {
  const incoming = Math.max(1, Number(damage) || 0);
  const reduction = Math.min(incoming - 1, Math.max(0, Number(defense) || 0) * 0.3);
  return {
    damage: incoming - reduction,
    reduction,
  };
}
