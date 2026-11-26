export function mergeBattleSkillLists(baseSkills = [], customSkills = []) {
  const customByName = new Map();
  for (const skill of customSkills) {
    if (!skill?.name) continue;
    customByName.set(skill.name, skill);
  }
  return [
    ...baseSkills.filter(skill => skill?.name && !customByName.has(skill.name)),
    ...customByName.values(),
  ];
}
