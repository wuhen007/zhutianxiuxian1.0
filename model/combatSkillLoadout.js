export const ATTACK_SKILL_LIMIT = 5;
export const DEFENSE_SKILL_LIMIT = 5;

function skillOwner(skill) {
  return String(skill?.熟练度归属 || skill?.name || '').trim();
}

function learnedNames(player) {
  return new Set(
    (Array.isArray(player?.学习的功法) ? player.学习的功法 : [])
      .map(item => typeof item === 'string' ? item : item?.name)
      .filter(Boolean)
  );
}

function eligibleNames(player, pool) {
  const learned = learnedNames(player);
  return [...new Set(
    (Array.isArray(pool) ? pool : [])
      .filter(skill => learned.has(skillOwner(skill)))
      .map(skillOwner)
      .filter(Boolean)
  )];
}

export function getCombatSkillOptions(player, type, pools = {}) {
  const pool = type === '攻击'
    ? pools.attack
    : type === '防御'
      ? pools.defense
      : [...(pools.healing || []), ...(pools.revival || [])];
  return eligibleNames(player, pool);
}

export function resolveCombatSkillSelection(player, type, selection, pools = {}) {
  const options = getCombatSkillOptions(player, type, pools);
  const input = String(selection || '').trim();
  if (/^\d+$/.test(input)) {
    const index = Number(input) - 1;
    return options[index]
      ? { ok: true, name: options[index], index: index + 1 }
      : { ok: false, reason: 'index', options };
  }
  const index = options.indexOf(input);
  return index >= 0
    ? { ok: true, name: input, index: index + 1 }
    : { ok: false, reason: 'unavailable', options };
}

function normalizeNames(names, allowed, limit) {
  return [...new Set(Array.isArray(names) ? names : [])]
    .filter(name => allowed.includes(name))
    .slice(0, limit);
}

export function ensureCombatSkillLoadout(player, pools = {}) {
  if (!player || typeof player !== 'object') return { 攻击: [], 防御: [], 生机: '' };
  const attack = eligibleNames(player, pools.attack);
  const defense = eligibleNames(player, pools.defense);
  const vitality = eligibleNames(player, [...(pools.healing || []), ...(pools.revival || [])]);
  const current = player.战斗技能配置;

  player.战斗技能配置 = {
    攻击: current ? normalizeNames(current.攻击, attack, ATTACK_SKILL_LIMIT) : attack.slice(0, ATTACK_SKILL_LIMIT),
    防御: current ? normalizeNames(current.防御, defense, DEFENSE_SKILL_LIMIT) : defense.slice(0, DEFENSE_SKILL_LIMIT),
    生机: current && vitality.includes(current.生机) ? current.生机 : (current ? '' : (vitality[0] || '')),
  };
  return player.战斗技能配置;
}

export function filterEquippedCombatSkills(player, pool, type) {
  if (!player?.战斗技能配置) return Array.isArray(pool) ? pool : [];
  const equipped = new Set(player.战斗技能配置[type] || []);
  const learned = learnedNames(player);
  return (Array.isArray(pool) ? pool : []).filter(skill =>
    !learned.has(skillOwner(skill)) || equipped.has(skillOwner(skill))
  );
}

export function getEquippedVitalitySkill(player, pool) {
  const name = player?.战斗技能配置?.生机;
  if (!name) return null;
  return (Array.isArray(pool) ? pool : []).find(skill => skillOwner(skill) === name) || null;
}

export function filterEquippedVitalitySkills(player, pool) {
  if (!player?.战斗技能配置) return Array.isArray(pool) ? pool : [];
  const selected = player.战斗技能配置.生机;
  const learned = learnedNames(player);
  return (Array.isArray(pool) ? pool : []).filter(skill =>
    !learned.has(skillOwner(skill)) || skillOwner(skill) === selected
  );
}

export function equipCombatSkill(player, type, name, pools = {}) {
  const loadout = ensureCombatSkillLoadout(player, pools);
  const key = type === '攻击' ? 'attack' : type === '防御' ? 'defense' : null;
  const allowed = getCombatSkillOptions(player, type, pools);
  if (!allowed.includes(name)) return { ok: false, reason: 'unavailable' };

  if (!key) {
    const replaced = loadout.生机;
    loadout.生机 = name;
    return { ok: true, replaced };
  }

  const slot = type;
  const limit = type === '攻击' ? ATTACK_SKILL_LIMIT : DEFENSE_SKILL_LIMIT;
  if (loadout[slot].includes(name)) return { ok: false, reason: 'equipped' };
  if (loadout[slot].length >= limit) return { ok: false, reason: 'full', limit };
  loadout[slot].push(name);
  return { ok: true };
}

export function unequipCombatSkill(player, type, name, pools = {}) {
  const loadout = ensureCombatSkillLoadout(player, pools);
  if (type === '生机') {
    if (loadout.生机 !== name) return { ok: false, reason: 'unequipped' };
    loadout.生机 = '';
    return { ok: true };
  }
  if (!loadout[type]?.includes(name)) return { ok: false, reason: 'unequipped' };
  loadout[type] = loadout[type].filter(item => item !== name);
  return { ok: true };
}
