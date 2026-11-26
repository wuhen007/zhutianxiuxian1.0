export function recordGuidedTalent(candidates, talent, targetType) {
  if (!talent?.name || talent.type !== targetType) return candidates;

  const existing = candidates.find(item => item.talent.name === talent.name);
  if (existing) existing.count += 1;
  else candidates.push({ talent, count: 1 });
  return candidates;
}

export function resolveGuidedTalent(candidates, choice) {
  const value = String(choice ?? '').trim();
  if (/^\d+$/.test(value)) return candidates[Number(value) - 1] || null;
  return candidates.find(item => item.talent?.name === value) || null;
}

export function formatGuidedTalentList(candidates) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((item, index) => `${index + 1}. ${item?.talent?.name || '未知灵根'}（${Number(item?.count) || 0}次）`);
}
