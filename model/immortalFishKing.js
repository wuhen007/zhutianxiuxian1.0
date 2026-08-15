export const FISH_KING_MAX_MEMBERS = 5;
export const FISH_KING_TTL_SECONDS = 24 * 60 * 60;
export const FISH_KING_BATTLE_CD_SECONDS = 30 * 60;
export const FISH_KING_DAO_ART_REDUCTION_SECONDS = 10 * 60;
export const FISH_KING_DAMAGE_CAP_RATIO = 0.2;

const statePrefix = "xiuxian:immortal-fish-king:active:";
const lockPrefix = "xiuxian:immortal-fish-king:lock:";
const teamPrefix = "xiuxian:immortal-fish-king:team:";

function stateKey(groupId) {
  return `${statePrefix}${String(groupId)}`;
}

function lockKey(groupId) {
  return `${lockPrefix}${String(groupId)}`;
}

function teamIndexKey(teamId) {
  return `${teamPrefix}${String(teamId)}`;
}

function boundedIndex(length, random) {
  return Math.min(length - 1, Math.floor(Math.max(0, Math.min(0.999999999, random())) * length));
}

export function createFishKingState({
  groupId,
  ownerId,
  ownerName,
  plane,
  king,
  ownerPower,
  now = Date.now(),
}) {
  const healthMax = Math.max(1_000_000, Math.trunc((Number(ownerPower) || 0) * 20));
  return {
    id: `${now}-${ownerId}`,
    teamId: null,
    groupId: String(groupId),
    ownerId: String(ownerId),
    ownerName,
    plane,
    name: king.name,
    speedMultiplier: Number(king.speedMultiplier) || 1,
    skills: Array.isArray(king.skills) ? [...king.skills] : [],
    health: healthMax,
    healthMax,
    members: [{ id: String(ownerId), name: ownerName }],
    damage: {},
    status: "active",
    createdAt: now,
    expiresAt: now + FISH_KING_TTL_SECONDS * 1000,
    rewardAssignments: null,
    relicReward: null,
  };
}

export async function readActiveFishKing(groupId, now = Date.now()) {
  if (groupId === undefined || groupId === null) return null;
  const key = stateKey(groupId);
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    const state = JSON.parse(raw);
    const expiresAt = Number(state?.expiresAt);
    const valid = state && Number.isFinite(expiresAt)
      && expiresAt > now
      && Array.isArray(state.members)
      && state.members.length > 0
      && state.damage && typeof state.damage === "object";
    if (!valid) {
      if (state?.teamId) await redis.del(teamIndexKey(state.teamId));
      await redis.del(key);
      return null;
    }
    state.groupId = String(state.groupId);
    state.ownerId = String(state.ownerId);
    state.health = Math.max(0, Number(state.health) || 0);
    state.healthMax = Math.max(1, Number(state.healthMax) || 1);
    state.status = state.status === "settling" ? "settling" : "active";
    return state;
  } catch {
    await redis.del(key);
    return null;
  }
}

async function generateUniqueTeamId(groupId) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = String(Math.floor(100000 + Math.random() * 900000));
    const token = "pending:" + String(groupId) + ":" + Date.now() + ":" + Math.random();
    const reserved = await redis.set(teamIndexKey(candidate), token, {
      EX: FISH_KING_TTL_SECONDS,
      NX: true,
    });
    if (reserved) return { id: candidate, token };
  }
  return null;
}

export async function tryCreateFishKing(input) {
  if (input.groupId === undefined || input.groupId === null) return null;
  const state = createFishKingState(input);
  const team = await generateUniqueTeamId(input.groupId);
  if (!team) return null;
  state.teamId = team.id;
  const created = await redis.set(stateKey(input.groupId), JSON.stringify(state), {
    EX: FISH_KING_TTL_SECONDS,
    NX: true,
  });
  if (!created) {
    if (await redis.get(teamIndexKey(team.id)) === team.token) {
      await redis.del(teamIndexKey(team.id));
    }
    return null;
  }
  await redis.set(teamIndexKey(team.id), String(state.groupId), {
    EX: FISH_KING_TTL_SECONDS,
  });
  return state;
}

export async function saveActiveFishKing(state, now = Date.now()) {
  if (!state || state.groupId === undefined || state.groupId === null) return null;
  const expiresAt = Number(state.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    await deleteActiveFishKing(state.groupId);
    return null;
  }
  const ttl = Math.max(1, Math.ceil((expiresAt - now) / 1000));
  await redis.set(stateKey(state.groupId), JSON.stringify(state), { EX: ttl });
  if (state.teamId) {
    await redis.set(teamIndexKey(state.teamId), String(state.groupId), { EX: ttl });
  }
  return state;
}

export async function deleteActiveFishKing(groupId) {
  const state = await readActiveFishKing(groupId);
  if (state?.teamId) await redis.del(teamIndexKey(state.teamId));
  await redis.del(stateKey(groupId));
}

export async function findFishKingByTeamId(teamId) {
  const id = String(teamId || "");
  if (!/^\d{3,6}$/.test(id)) return null;
  const groupId = await redis.get(teamIndexKey(id));
  if (!groupId) return null;
  return readActiveFishKing(groupId);
}

export async function withFishKingLock(groupId, task) {
  const key = lockKey(groupId);
  const token = `${process.pid}:${Date.now()}:${Math.random()}`;
  if (!await redis.set(key, token, { EX: 300, NX: true })) return { busy: true };
  try {
    return await task();
  } finally {
    if (await redis.get(key) === token) await redis.del(key);
  }
}

export function getFishKingBattleCooldown({ hasDaoArt = false } = {}) {
  return FISH_KING_BATTLE_CD_SECONDS
    - (hasDaoArt ? FISH_KING_DAO_ART_REDUCTION_SECONDS : 0);
}

export function createFishKingBattleAvatar(player, state, random = Math.random) {
  const ruotuoScale = value => Math.max(
    1,
    Math.trunc((Number(value) || 1) * (0.8 + 0.6 * random()))
  );
  const playerSpeed = (Number(player.速度) || 100)
    + (Number(player.mijinglevel_id) || 0) * 50
    + (Number(player.xiangulevel_id) || 0) * 50
    + Math.max(0, (Number(player.huafenlevel_id) || 1) - 1) * 50;
  const skills = Array.isArray(state.skills) ? state.skills : [];
  const health = ruotuoScale(player.血量上限);
  return {
    名号: `${state.name}·潮汐化身`,
    boss: true,
    type: "boss",
    攻击: ruotuoScale(player.攻击),
    防御: ruotuoScale(player.防御),
    当前血量: health,
    血量上限: health,
    速度: Math.max(1, Math.trunc(playerSpeed * (Number(state.speedMultiplier) || 1))),
    暴击率: Number(player.暴击率) || 0,
    暴击伤害: Number(player.暴击伤害) || 1.5,
    灵根: player.灵根,
    法球倍率: Number(player?.灵根?.法球倍率) || 1,
    学习的功法: [...skills],
    功法熟练度: Object.fromEntries(skills.map(name => [name, 1000])),
    hun_Num: 5,
  };
}

export function calculateFishKingDamage(state, won, bonusDamage = 0) {
  const healthMax = Math.max(1, Number(state.healthMax) || 1);
  const base = healthMax * (won ? 0.15 : 0.05);
  const damage = Math.max(1, Math.trunc(base + Math.max(0, Number(bonusDamage) || 0)));
  const cap = Math.max(1, Math.trunc(healthMax * FISH_KING_DAMAGE_CAP_RATIO));
  return Math.min(cap, damage);
}

export function createFishKingRewardAssignments(members, random = Math.random) {
  if (!Array.isArray(members) || members.length === 0) return [];
  const drops = [
    { name: "遣龙令", class: "道具", amount: 10 },
    { name: "遣虎令", class: "道具", amount: 10 },
    { name: "超越宝盒", class: "盒子", amount: 1 + boundedIndex(10, random) },
  ];
  return drops.map((drop, index) => ({
    ...drop,
    dropIndex: index,
    recipient: { ...members[boundedIndex(members.length, random)] },
  }));
}

export function rollFishKingChestReward(random = Math.random) {
  const roll = random();
  if (roll < 0.8) {
    return { name: "众生愿鳞", class: "道具", amount: 1 + boundedIndex(10, random) };
  }
  if (roll < 0.95) {
    return { name: "众生仙钓", class: "道具", amount: 5 };
  }
  return { name: "众生愿鳞", class: "道具", amount: 10 + boundedIndex(11, random) };
}
