export const XIANGU_HEAVY_INJURY_MS = 30 * 60 * 1000;

function normalizeHp(source = {}) {
  const maxHp = Number(source.血量上限 ?? source.血气上限 ?? source.当前血量) || 1;
  const currentHp = Number(source.当前血量 ?? maxHp) || maxHp;
  return {
    currentHp: Math.max(1, Math.trunc(currentHp)),
    maxHp: Math.max(1, Math.trunc(maxHp)),
  };
}

export function buildXianguCombatant(source = {}, id) {
  const { currentHp, maxHp } = normalizeHp(source);
  const learnedSkills = Array.isArray(source.学习的功法)
    ? source.学习的功法
    : Object.keys(source.学习的功法 || {});
  return {
    ...source,
    ...(id !== undefined && id !== null ? { id } : {}),
    当前血量: currentHp,
    血量上限: maxHp,
    速度: Number(source.速度) || 100,
    暴击率: Number(source.暴击率) || 0.05,
    暴击伤害: Number(source.暴击伤害) || 2,
    法球倍率: Number(source.法球倍率 ?? source.灵根?.法球倍率) || 0.1,
    灵根: source.灵根 || {},
    学习的功法: learnedSkills,
  };
}

function consumeTeammate(owner, allies, enemies, random) {
  if (!owner?.xiangu_teammate) return null;

  const name = owner.xiangu_teammate_name || owner.xiangu_teammate;
  const teammateData = owner.xiangu_teammate_data;
  const betrayChance = Math.min(1, Math.max(0, Number(owner.xiangu_teammate_betray_chance) || 0));

  owner.xiangu_teammate = null;
  owner.xiangu_teammate_name = null;
  owner.xiangu_teammate_data = null;
  owner.xiangu_teammate_betray_chance = 0;

  if (!teammateData) {
    return { name, betrayed: false, missing: true };
  }

  const teammate = buildXianguCombatant({ ...teammateData, 名号: teammateData.名号 || name });
  const betrayed = Number(random()) < betrayChance;
  (betrayed ? enemies : allies).push(teammate);
  return { name, betrayed, missing: false };
}

export function buildXianguBattleSides(
  attacker,
  defender,
  { attackerId, defenderId, random = Math.random } = {},
) {
  const defenders = Array.isArray(defender) ? defender : [defender];
  const attackerTeam = [buildXianguCombatant(attacker, attackerId)];
  const defenderTeam = defenders.map((unit, index) =>
    buildXianguCombatant(unit, index === 0 && !Array.isArray(defender) ? defenderId : undefined)
  );
  const messages = [];

  const attackerMate = consumeTeammate(attacker, attackerTeam, defenderTeam, random);
  if (attackerMate?.missing) messages.push(`${attackerMate.name}失去联络，未能赶来助战。`);
  else if (attackerMate?.betrayed) messages.push(`【临阵倒戈】${attackerMate.name}突然反戈，加入敌方围攻！`);
  else if (attackerMate) messages.push(`【并肩而战】${attackerMate.name}赶来助战！`);

  if (!Array.isArray(defender)) {
    const defenderMate = consumeTeammate(defender, defenderTeam, attackerTeam, random);
    if (defenderMate?.missing) messages.push(`${defenderMate.name}失去联络，未能赶来助战。`);
    else if (defenderMate?.betrayed) messages.push(`【临阵倒戈】${defenderMate.name}背叛防守方，转投攻击方！`);
    else if (defenderMate) messages.push(`【并肩而战】${defenderMate.name}赶来协助防守！`);
  }

  return {
    A: attackerTeam.length === 1 ? attackerTeam[0] : attackerTeam,
    B: defenderTeam.length === 1 ? defenderTeam[0] : defenderTeam,
    messages,
  };
}

export function applyXianguHeavyInjury(player, now = Date.now()) {
  player.xiangu_gains ||= {};
  player.xiangu_gains.debuff = {
    type: '重伤',
    expiresAt: now + XIANGU_HEAVY_INJURY_MS,
    exploreEfficiency: 0.5,
  };
  return player.xiangu_gains.debuff;
}

export function getXianguExploreEfficiency(player, now = Date.now()) {
  const gains = player?.xiangu_gains;
  const debuff = gains?.debuff;
  if (debuff === '重伤') {
    applyXianguHeavyInjury(player, now);
    return 0.5;
  }
  if (!debuff || debuff.type !== '重伤') return 1;
  if (Number(debuff.expiresAt) > now) return 0.5;
  delete gains.debuff;
  return 1;
}

export function resolveXianguLeaderWinner(battleResult) {
  const winner = battleResult?.winner ?? 'draw';
  const isTeamBattle = Array.isArray(battleResult?.A_team) || Array.isArray(battleResult?.B_team);
  if (!isTeamBattle) return winner;
  if (winner !== 'A' && winner !== 'B') return 'draw';

  const winningTeam = winner === 'A' ? battleResult.A_team : battleResult.B_team;
  return Number(winningTeam?.[0]?.当前血量) > 0 ? winner : 'draw';
}

export function recordXianguArenaWin(participants, winnerId, loserId) {
  if (!Array.isArray(participants)) return false;
  const winner = participants.find(item => String(item.qq) === String(winnerId));
  const loser = participants.find(item => String(item.qq) === String(loserId));
  if (!winner || !loser || winner === loser) return false;
  winner.defeatedOpponents ||= [];
  if (winner.defeatedOpponents.some(id => String(id) === String(loserId))) return false;
  winner.defeatedOpponents.push(loserId);
  winner.wins = Math.max(0, Number(winner.wins) || 0) + 1;
  return true;
}

export function buildXianguArenaRewardPlan(participants, rewards = {}) {
  if (!Array.isArray(participants)) return [];
  return participants.map((participant, index) => {
    const reward = index === 0
      ? rewards.winner
      : index < 3
        ? rewards.top3
        : rewards.runner;
    return {
      ...participant,
      daoyun: Math.max(0, Number(reward?.daoyun) || 0),
    };
  });
}
