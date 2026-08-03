export function calculateEquippedStats(baseStats, slots = []) {
  const baseAttack = Number(baseStats?.攻击) || 0;
  const baseDefense = Number(baseStats?.防御) || 0;
  const baseHp = Number(baseStats?.血量上限) || 0;
  let attackBonus = 0;
  let defenseBonus = 0;
  let hpBonus = 0;
  let fixedAttack = 0;
  let fixedDefense = 0;
  let fixedHp = 0;

  for (const slot of slots) {
    const merged = slot?.归一属性?.百分比 || {};
    attackBonus += Number(merged.atk) || 0;
    defenseBonus += Number(merged.def) || 0;
    hpBonus += Number(merged.HP) || 0;
    const atk = Number(slot?.atk) || 0;
    const def = Number(slot?.def) || 0;
    const HP = Number(slot?.HP) || 0;
    if (atk > 99 || def > 99 || HP > 99) {
      fixedAttack += atk;
      fixedDefense += def;
      fixedHp += HP;
      continue;
    }

    attackBonus += atk;
    defenseBonus += def;
    hpBonus += HP;
  }

  return {
    攻击: Math.trunc(baseAttack * (1 + attackBonus) + fixedAttack),
    防御: Math.trunc(baseDefense * (1 + defenseBonus) + fixedDefense),
    血量上限: Math.trunc(baseHp * (1 + hpBonus) + fixedHp),
  };
}
