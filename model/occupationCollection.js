function normalizeOccupation(record) {
  const name = String(record?.职业名 || '').trim();
  if (!name) return null;
  return {
    职业名: name,
    职业等级: Math.max(1, Math.trunc(Number(record.职业等级) || 1)),
    职业经验: Math.max(0, Math.trunc(Number(record.职业经验) || 0)),
  };
}

export function normalizeOccupationCollection(raw) {
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  const occupations = new Map();
  for (const record of Array.isArray(raw) ? raw : raw ? [raw] : []) {
    const occupation = normalizeOccupation(record);
    if (occupation) occupations.set(occupation.职业名, occupation);
  }
  return [...occupations.values()];
}

export function snapshotOccupation(player) {
  return normalizeOccupation({
    职业名: player?.occupation,
    职业等级: player?.occupation_level,
    职业经验: player?.occupation_exp,
  });
}

export function saveOccupation(collection, occupation) {
  const occupations = normalizeOccupationCollection(collection);
  const normalized = normalizeOccupation(occupation);
  if (!normalized) return occupations;
  return [...occupations.filter(item => item.职业名 !== normalized.职业名), normalized];
}

export function takeOccupation(collection, name) {
  const occupations = normalizeOccupationCollection(collection);
  const index = occupations.findIndex(item => item.职业名 === name);
  if (index < 0) return { occupation: null, remaining: occupations };
  return {
    occupation: occupations[index],
    remaining: occupations.filter((_, itemIndex) => itemIndex !== index),
  };
}
