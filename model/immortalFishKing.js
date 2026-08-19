import { createFishKingRelic } from './relicSystem.js';

export const FISH_KING_MAX_MEMBERS = 5;
export const FISH_KING_TTL_SECONDS = 24 * 60 * 60;
export const FISH_KING_BATTLE_CD_SECONDS = 30 * 60;
export const FISH_KING_DAO_ART_REDUCTION_SECONDS = 10 * 60;
export const FISH_KING_DAMAGE_CAP_RATIO = 0.2;
export const FISH_KING_RESCUE_CHANCE = 0.03;

/* ===== 击杀奖励（每人必得） ===== */
/** 每人从下方奖池中不放回抽取的奖励组数 */
export const FISH_KING_KILL_GROUPS = 3;
/** 击杀奖励池：每个抽中的条目算一组奖励 */
export const FISH_KING_KILL_REWARD_ITEMS = Object.freeze([
  Object.freeze({ name: '遣龙令', class: '道具', min: 1, max: 5 }),
  Object.freeze({ name: '超越宝盒', class: '盒子', min: 1, max: 5 }),
  Object.freeze({ name: '遣虎令', class: '道具', min: 1, max: 5 }),
  Object.freeze({ name: '遗珍', special: 'relic', amount: 1 }),
  Object.freeze({ name: '随机饵料', special: 'bait', min: 1, max: 3 }),
  Object.freeze({ name: '一叶轻舟', class: '道具', amount: 1 }),
  Object.freeze({ name: '群星秘钥', class: '道具', min: 1, max: 3 }),
  Object.freeze({ name: '仙舟', class: '道具', min: 1, max: 5 }),
]);
/** 击杀奖励货币：每人灵石/源石 */
export const FISH_KING_KILL_LINGSHI = 25_000_000;
export const FISH_KING_KILL_SOURCE_STONE = 25_000_000;
/** 击杀奖励修为/血气：2000万 × 五维等级乘积 */
export const FISH_KING_KILL_CULTIVATION_BASE = 20_000_000;

/* ===== 鱼王宝箱（概率触发五组奖励 + 愿鳞保底） ===== */
/** 宝箱额外奖池的触发概率 */
export const FISH_KING_CHEST_REWARD_CHANCE = 0.55;
/** 触发后从奖池中不放回抽取的奖励组数 */
export const FISH_KING_CHEST_GROUPS = 5;
export const FISH_KING_CHEST_ITEMS = Object.freeze([
  Object.freeze({ name: '无尽扫荡券', class: '道具', min: 1, max: 3 }),
  Object.freeze({ name: '定神丹', class: '丹药', min: 1, max: 5 }),
  Object.freeze({ name: '群星秘钥', class: '道具', min: 1, max: 6 }),
  Object.freeze({ name: '超越宝盒', class: '盒子', min: 3, max: 10 }),
  Object.freeze({ name: '众生仙钓', class: '道具', min: 2, max: 10 }),
  Object.freeze({ name: '随机饵料', special: 'bait', min: 2, max: 10 }),
  Object.freeze({ name: '一叶轻舟', class: '道具', min: 1, max: 3 }),
  Object.freeze({ name: '界河灵舟', class: '道具', amount: 1 }),
  Object.freeze({ name: '仙舟', class: '道具', min: 3, max: 5 }),
]);
/** 宝箱保底：众生愿鳞 15~30 */
export const FISH_KING_CHEST_WISH_SCALE = Object.freeze({ min: 15, max: 30 });
/** 随机饵料池（位面仙饵） */
export const FISH_KING_BAIT_POOL = Object.freeze([
  '神藏仙饵',
  '矿髓沉饵',
  '百草香饵',
  '因果道饵',
  '轮回冥饵',
]);

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

/** 闭区间随机整数 [min, max]，random() 归一到 [0,1) */
function randInt(min, max, random) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return low + Math.floor(Math.max(0, Math.min(0.999999999, random())) * (high - low + 1));
}

function sampleWithoutReplacement(items, count, random) {
  const pool = [...items];
  const selected = [];
  while (pool.length > 0 && selected.length < count) {
    selected.push(pool.splice(boundedIndex(pool.length, random), 1)[0]);
  }
  return selected;
}

/** 每名成员从击杀奖池不放回抽 3 组；遗珍和普通物品共用同一次抽取结果。 */
export function createFishKingKillRewardBundle(state, random = Math.random) {
  const members = Array.isArray(state?.members) ? state.members : [];
  const assignments = [];
  const relicRewards = [];
  let dropIndex = 0;
  for (const member of members) {
    const selected = sampleWithoutReplacement(
      FISH_KING_KILL_REWARD_ITEMS,
      FISH_KING_KILL_GROUPS,
      random
    );
    for (let group = 0; group < selected.length; group++) {
      const item = selected[group];
      if (item.special === 'relic') {
        relicRewards.push({
          recipient: { ...member },
          group,
          relic: createFishKingRelic({
            plane: state?.plane,
            id: `fish-king-relic:${state?.id}:${member.id}:${group}`,
            random,
          }),
        });
        continue;
      }
      if (item.special === 'bait') {
        assignments.push({
          dropIndex: dropIndex++,
          recipient: { ...member },
          name: FISH_KING_BAIT_POOL[boundedIndex(FISH_KING_BAIT_POOL.length, random)],
          class: '道具',
          amount: randInt(item.min, item.max, random),
        });
        continue;
      }
      assignments.push({
        dropIndex: dropIndex++,
        recipient: { ...member },
        name: item.name,
        class: item.class,
        amount: item.amount ?? randInt(item.min, item.max, random),
      });
    }
  }
  return { assignments, relicRewards };
}

/** 兼容旧调用：仅返回本次抽取中的普通物品。 */
export function createFishKingRewardAssignments(members, random = Math.random) {
  return createFishKingKillRewardBundle({ members }, random).assignments;
}

/** 兼容旧调用：仅返回本次抽取中的遗珍。 */
export function createFishKingRelicRewards(state, random = Math.random) {
  return createFishKingKillRewardBundle(state, random).relicRewards;
}

/**
 * 鱼王宝箱：额外奖池触发后不放回抽 5 组，保底【众生愿鳞】15~30 必出。
 */
export function rollFishKingChestReward(random = Math.random) {
  const rewards = [];
  const selected = random() < FISH_KING_CHEST_REWARD_CHANCE
    ? sampleWithoutReplacement(FISH_KING_CHEST_ITEMS, FISH_KING_CHEST_GROUPS, random)
    : [];
  for (const item of selected) {
    if (item.special === 'bait') {
      rewards.push({
        name: FISH_KING_BAIT_POOL[boundedIndex(FISH_KING_BAIT_POOL.length, random)],
        class: '道具',
        amount: randInt(item.min, item.max, random),
      });
      continue;
    }
    rewards.push({
      name: item.name,
      class: item.class,
      amount: item.amount ?? randInt(item.min, item.max, random),
    });
  }
  rewards.push({
    name: '众生愿鳞',
    class: '道具',
    amount: randInt(FISH_KING_CHEST_WISH_SCALE.min, FISH_KING_CHEST_WISH_SCALE.max, random),
  });
  return rewards;
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
    speed: Number(king.speed) || 100,
    灵根: king.灵根 || null,
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
    relicRewards: null,
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

export async function listActiveFishKings(now = Date.now()) {
  const pattern = statePrefix + "*";
  let keys = [];
  if (typeof redis.scanIterator === "function") {
    for await (const page of redis.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      if (Array.isArray(page)) keys.push(...page.map(String));
      else keys.push(String(page));
    }
  } else if (typeof redis.keys === "function") {
    keys = (await redis.keys(pattern)).map(String);
  }
  const states = await Promise.all(
    [...new Set(keys)].map(key => readActiveFishKing(key.slice(statePrefix.length), now))
  );
  return states
    .filter(Boolean)
    .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
}

export async function findFishKingByMemberId(memberId, now = Date.now()) {
  const id = String(memberId || "");
  if (!id) return null;
  const states = await listActiveFishKings(now);
  return states.find(state =>
    state.members.some(member => String(member.id) === id)
  ) || null;
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
  const kingRoot = (state && typeof state.灵根 === "object" && state.灵根) || {
    type: "真灵根",
    name: "水灵根",
    法球倍率: 1,
    攻击: 0,
    防御: 0,
    生命: 0,
  };
  const skills = Array.isArray(state?.skills) ? state.skills : [];
  const health = ruotuoScale(player.血量上限);
  return {
    名号: `${state?.name || "鱼王"}·潮汐化身`,
    boss: true,
    type: "boss",
    攻击: ruotuoScale(player.攻击),
    防御: ruotuoScale(player.防御),
    当前血量: health,
    血量上限: health,
    速度: Math.max(1, Math.trunc(Number(state?.speed) || 100)),
    暴击率: 0.1,
    暴击伤害: 1.5,
    灵根: kingRoot,
    法球倍率: Number(kingRoot.法球倍率) || 1,
    学习的功法: [...skills],
    功法熟练度: Object.fromEntries(skills.map(name => [name, 200])),
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

export function rollFishKingRescue(random = Math.random) {
  const roll = Math.max(0, Math.min(0.999999999, Number(random()) || 0));
  if (roll < FISH_KING_RESCUE_CHANCE / 2) {
    return { id: "rumeng", name: "如梦", damageRatio: FISH_KING_DAMAGE_CAP_RATIO };
  }
  if (roll < FISH_KING_RESCUE_CHANCE) {
    return { id: "moxiaoyu", name: "莫晓羽", damageRatio: FISH_KING_DAMAGE_CAP_RATIO };
  }
  return null;
}

export function calculateFishKingRescueDamage(state, rescue) {
  const healthMax = Math.max(1, Number(state?.healthMax) || 1);
  const ratio = Math.max(0, Number(rescue?.damageRatio) || FISH_KING_DAMAGE_CAP_RATIO);
  return Math.min(
    Math.max(0, Number(state?.health) || 0),
    Math.max(1, Math.trunc(healthMax * ratio))
  );
}

/** 修为/血气奖励：2000万 × 练气 × 炼体 × 秘境 × 仙古 × 花粉 */
export function calculateFishKingCultivationReward(player) {
  const multiplier =
    Math.max(1, Math.trunc(Number(player?.level_id) || 1)) *
    Math.max(1, Math.trunc(Number(player?.Physique_id) || 1)) *
    Math.max(1, Math.trunc(Number(player?.mijinglevel_id) || 1)) *
    Math.max(1, Math.trunc(Number(player?.xiangulevel_id) || 1)) *
    Math.max(1, Math.trunc(Number(player?.huafenlevel_id) || 1));
  return Math.max(1, Math.trunc(FISH_KING_KILL_CULTIVATION_BASE * multiplier));
}
