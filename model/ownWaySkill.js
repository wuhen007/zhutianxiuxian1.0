export const OWN_WAY_SKILL_DESCRIPTION_MAX_LENGTH = 20;

export function validateOwnWaySkillDescription(value) {
  const description = String(value ?? '').trim();
  const length = [...description].length;
  if (!description) return { ok: false, reason: 'empty', description, length };
  if (/\r|\n/.test(description)) return { ok: false, reason: 'multiline', description, length };
  if (length > OWN_WAY_SKILL_DESCRIPTION_MAX_LENGTH) {
    return { ok: false, reason: 'too-long', description, length };
  }
  return { ok: true, reason: 'ready', description, length };
}

export function getOwnWaySkillListType(wayType) {
  if (wayType === '护体') return 2;
  if (['涅槃', '轮回'].includes(wayType)) return 3;
  return 1;
}
