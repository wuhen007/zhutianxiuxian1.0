export function findTalentSynchronizationMatch(talentList, currentTalent) {
  if (!Array.isArray(talentList) || !currentTalent) return null;

  const currentName = String(currentTalent.name || '').trim();
  if (currentName) {
    const nameMatch = talentList.find(item => String(item?.name || '').trim() === currentName);
    if (nameMatch) return nameMatch;
  }

  if (currentTalent.id === undefined || currentTalent.id === null) return null;
  const currentId = String(currentTalent.id);
  const idMatches = talentList.filter(item => String(item?.id) === currentId);
  return idMatches.length === 1 ? idMatches[0] : null;
}
