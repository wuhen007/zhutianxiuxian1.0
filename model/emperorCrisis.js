export const EMPEROR_CRISIS_KEY = '帝尊危机';
export const EMPEROR_CRISIS_GRACE_YEARS = 10_000;
export const EMPEROR_DEFEAT_SLEEP_MS = 2 * 60 * 60 * 1000;
export const EMPEROR_WORLD_TRIPOD_MULTIPLIER = 1.5;
export const EMPEROR_WEAPON_SUPPRESSION_MULTIPLIER = 0.5;

const IMMORTAL_WEAPON_RANKS = new Set([
  '仙器', '仙王器', '准仙帝器', '仙帝器', '祭道器',
]);
const COMBAT_STATS = ['攻击', '防御', '血量上限', '当前血量', '速度', '暴击率', '暴击伤害', '法球倍率'];

function worldYear(value) {
  const year = Number(value);
  return Number.isFinite(year) ? Math.max(0, Math.trunc(year)) : 0;
}

export function awakenEmperorCrisis(current, currentWorldYear) {
  if (current?.status === 'active' || current?.status === 'defeated' || current?.status === 'refined') {
    return { state: current, awakened: false };
  }
  const appearedAt = worldYear(currentWorldYear);
  return {
    awakened: true,
    state: {
      status: 'active',
      appearedAt,
      lastConfrontedAt: null,
      deadline: appearedAt + EMPEROR_CRISIS_GRACE_YEARS,
      confrontations: 0,
    },
  };
}

export function confrontEmperorCrisis(current, currentWorldYear) {
  if (current?.status !== 'active') return { state: current, confronted: false };
  const confrontedAt = worldYear(currentWorldYear);
  return {
    confronted: true,
    state: {
      ...current,
      lastConfrontedAt: confrontedAt,
      deadline: confrontedAt + EMPEROR_CRISIS_GRACE_YEARS,
      confrontations: Math.max(0, Number(current.confrontations) || 0) + 1,
    },
  };
}

export function resolveEmperorCrisis(current, currentWorldYear) {
  if (current?.status !== 'active') return { state: current, refined: false };
  const now = worldYear(currentWorldYear);
  if (now < worldYear(current.deadline)) {
    return { state: current, refined: false, remainingYears: worldYear(current.deadline) - now };
  }
  return {
    refined: true,
    state: { ...current, status: 'refined', refinedAt: now },
  };
}

export function defeatEmperorCrisis(current, currentWorldYear) {
  return { ...(current || {}), status: 'defeated', defeatedAt: worldYear(currentWorldYear) };
}

export function isImmortalImperialWeapon(weapon) {
  const rank = String(typeof weapon === 'string' ? weapon : weapon?.品阶 || '');
  return IMMORTAL_WEAPON_RANKS.has(rank) || rank.startsWith('道器（') || rank.startsWith('唯一器');
}

function scaleCombatStats(unit, multiplier) {
  for (const field of COMBAT_STATS) {
    if (Number.isFinite(Number(unit[field]))) unit[field] = Math.max(0, Number(unit[field]) * multiplier);
  }
}

export function applyEmperorWorldTripodOpening(boss, players) {
  if (boss?.名号 !== '帝尊' || boss._世界鼎加持已应用) return { active: false, suppressed: [] };
  boss._世界鼎加持已应用 = true;
  boss.世界鼎加持 = true;
  scaleCombatStats(boss, EMPEROR_WORLD_TRIPOD_MULTIPLIER);

  const suppressed = [];
  for (const player of players || []) {
    if (isImmortalImperialWeapon(player?._帝兵品阶)) continue;
    scaleCombatStats(player, EMPEROR_WEAPON_SUPPRESSION_MULTIPLIER);
    suppressed.push(player?.名号 || '无名修士');
  }
  return { active: true, suppressed };
}

export function applyEmperorDefeatPenalty(player, now = Date.now()) {
  player.道伤 = Math.max(0, Number(player.道伤) || 0) + 5;
  player.生命本源 = Math.max(0, Math.floor((Number(player.生命本源) || 0) * 0.5));
  player.元神 = Math.max(0, Math.floor((Number(player.元神) || 0) * 0.5));
  if ((Number(player.压制寿元) || 0) > 0) {
    player.压制寿元 = Math.max(0, Math.floor(Number(player.压制寿元) * 0.5));
    player.寿元 = Math.min(Math.max(0, Number(player.寿元) || 0), player.压制寿元, 9999);
  } else {
    player.寿元 = Math.max(0, Math.floor((Number(player.寿元) || 0) * 0.5));
  }
  player.帝尊虚弱沉眠至 = now + EMPEROR_DEFEAT_SLEEP_MS;
  return player;
}

export function getEmperorSleepRemainingMs(player, now = Date.now()) {
  return Math.max(0, (Number(player?.帝尊虚弱沉眠至) || 0) - now);
}

export function buildEmperorSleepAction(now = Date.now()) {
  return {
    action: '帝尊一战后虚弱沉眠',
    start_time: now,
    end_time: now + EMPEROR_DEFEAT_SLEEP_MS,
    time: EMPEROR_DEFEAT_SLEEP_MS,
    shutup: '1',
    working: '1',
    Place_action: '1',
    Place_actionplus: '1',
    power_up: '1',
    mojie: '1',
    xijie: '1',
    plant: '1',
    mine: '1',
  };
}
