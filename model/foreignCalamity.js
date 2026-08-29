import { createFishKingRelic } from './relicSystem.js';
import { readPlayerArchives } from './riftGuardian.js';

export const FOREIGN_CALAMITY_INDEX_KEY = 'xiuxian:foreign-calamity:index';
export const FOREIGN_PAGE_REQUIREMENT = 10;
export const FOREIGN_CALAMITY_BATTLE_COOLDOWN_MS = 15 * 60 * 1000;
export const FOREIGN_OVERLORD_KILLS_REQUIRED = 10;
export const FOREIGN_OVERLORD_MAX_HP = 1_200_000_000_000_000;
export const FOREIGN_OVERLORD_ATTACK = 500_000_000_000_000;
export const FOREIGN_OVERLORD_DEFENSE = 500_000_000_000_000;
export const FOREIGN_OVERLORD_SPEED = 1000;
export const FOREIGN_OVERLORD_REFINEMENT_WEIGHT = 0.5;
export const FOREIGN_OVERLORD_INDEX_KEY = 'xiuxian:foreign-calamity:overlord:index';
export const FOREIGN_OVERLORD_ACTIVE_KEY = 'xiuxian:foreign-calamity:overlord:active';
export const FOREIGN_OVERLORD_KILL_COUNT_KEY = 'xiuxian:foreign-calamity:overlord:kill-count';
export const FOREIGN_OVERLORD_SPAWN_COUNT_KEY = 'xiuxian:foreign-calamity:overlord:spawn-count';
export const FOREIGN_OVERLORD_GLOBAL_LOCK_ID = 'overlord-global';
export const FOREIGN_OVERLORD_PENDING_DEFEATS_KEY = 'xiuxian:foreign-calamity:overlord:pending-defeats';
const FOREIGN_CALAMITY_READ_BATCH_SIZE = 50;

const REGISTER_FOREIGN_KILL_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then return -1 end
redis.call('SET', KEYS[1], '1')
return redis.call('INCR', KEYS[2])
`;

const COMPARE_DELETE_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call('DEL', KEYS[1])
`;

async function compareDeleteRedisKey(key, expected) {
  return redis.eval(COMPARE_DELETE_SCRIPT, {
    keys: [key],
    arguments: [String(expected || '')],
  });
}

export const FOREIGN_TECHNIQUES = Object.freeze([
  { name: '太虚观界经', category: '道与法', desc: '观诸界生灭，于太虚中借来一线不坏界光护持己身。' },
  { name: '万星归墟法', category: '道与法', desc: '牵引万星道轨坠入归墟，磨灭敌手的护体法则。' },
  { name: '彼岸照神典', category: '道与法', desc: '以彼岸神光照见真我，斩出跨越生死迷障的一击。' },
  { name: '无相天罗经', category: '道与法', desc: '万相皆空，天罗自成，使敌手无从辨认真正杀机。' },
  { name: '因果断流法', category: '道与法', desc: '截断一瞬因果长河，让既成防御失去发生的源头。' },
  { name: '葬界指', category: '盖世杀术', desc: '一指落下如葬一界，专破坚甲与护体神光。' },
  { name: '逆星河', category: '盖世杀术', desc: '逆转星河大势，以诸星倒悬之力轰杀强敌。' },
  { name: '斩道天轮', category: '盖世杀术', desc: '凝聚斩道天轮，连肉身、元神与道则一并切开。' },
  { name: '寂灭魔瞳', category: '盖世杀术', desc: '瞳光所至万法寂灭，令对手难以运转防御秘术。' },
  { name: '破纪元枪', category: '盖世杀术', desc: '将一纪元兴衰凝于枪锋，爆发足以贯穿时代壁垒。' },
  { name: '周天噬灵诀', category: '修炼功法', desc: '吞纳周天游离灵机，炼去杂质后反哺自身修行。' },
  { name: '太初锻神录', category: '修炼功法', desc: '追溯太初识海，以原始道音反复锤炼元神。' },
  { name: '九转外道经', category: '修炼功法', desc: '借九种外道路径互证，最终返照自身根本道途。' },
].map(item => Object.freeze({ ...item, page: `${item.name}残页` })));

export const FOREIGN_STRENGTHEN_ITEMS = Object.freeze([
  '大道传承', '不朽传承', '轮回传承', '森罗万象', '天命之力', '纪元加护',
]);

export const FOREIGN_OVERLORD_SKILLS = Object.freeze([
  '灾厄祭世秘法',
  '魔主化外身',
  '魔神斩天诀',
  '万劫魔躯',
  '逆命劫生经',
]);

const FALLBACK_AVERAGE = Object.freeze({
  攻击: 5_000_000,
  防御: 5_000_000,
  血量上限: 15_000_000,
  暴击率: 0.2,
  暴击伤害: 1.7,
  闪避率: 0.05,
  吸血率: 0,
  穿透: 0,
  速度: 100,
  元神: 1_000_000,
  生命本源: 100,
  level_id: 1,
  Physique_id: 1,
  mijinglevel_id: 1,
  xiangulevel_id: 1,
  huafenlevel_id: 1,
  samples: 0,
});

const PROFILES = Object.freeze([
  {
    type: '孽兽', names: ['吞界孽犼', '腐星狰', '噬道天蜈', '血月狻猊'],
    multipliers: { 攻击: 1.05, 防御: 0.95, 血量上限: 1.35, 速度: 0.9 },
    techniques: ['真龙宝术', '鲲鹏宝术'], extraPath: '太古血脉',
  },
  {
    type: '域外邪魔', names: ['无相天魔', '蚀界魔胎', '六欲邪主', '黑日魔君'],
    multipliers: { 攻击: 1.2, 防御: 0.9, 血量上限: 1.1, 速度: 1.08 },
    techniques: ['吞天魔功', '异域不朽经'], extraPath: '域外魔躯',
  },
  {
    type: '外道修士', names: ['逆律道人', '葬星散人', '断因老祖', '无归客'],
    multipliers: { 攻击: 1, 防御: 1.12, 血量上限: 1, 速度: 1.15 },
    techniques: ['万法成空', '雷帝宝术'], extraPath: '外道法身',
  },
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampRandom(random = Math.random) {
  return Math.min(0.999999999, Math.max(0, finite(random(), 0)));
}

function randomInt(min, max, random = Math.random) {
  return min + Math.floor(clampRandom(random) * (max - min + 1));
}

function pick(list, random = Math.random) {
  return list[Math.floor(clampRandom(random) * list.length)];
}

export function averageForeignCalamityPlayers(players) {
  const valid = (Array.isArray(players) ? players : []).filter(player =>
    finite(player?.攻击) > 0 && finite(player?.血量上限) > 0
  );
  if (!valid.length) return { ...FALLBACK_AVERAGE };

  const fields = Object.keys(FALLBACK_AVERAGE).filter(field => field !== 'samples');
  const result = {};
  for (const field of fields) {
    const fallback = FALLBACK_AVERAGE[field];
    result[field] = valid.reduce((sum, player) => sum + finite(player?.[field], fallback), 0) / valid.length;
    if (!['暴击率', '暴击伤害', '闪避率', '吸血率'].includes(field)) result[field] = Math.round(result[field]);
  }
  result.samples = valid.length;
  return result;
}

export function createForeignCalamityWave({ worldYear, players = readPlayerArchives(), random = Math.random } = {}) {
  const year = Math.max(1000, Math.floor(finite(worldYear, 1000) / 1000) * 1000);
  const average = averageForeignCalamityPlayers(players);
  const count = randomInt(1, 10, random);
  return Array.from({ length: count }, (_, index) => {
    const profile = pick(PROFILES, random);
    const swing = 0.9 + clampRandom(random) * 0.2;
    const scaled = field => Math.max(1, Math.round(average[field] * (profile.multipliers[field] || 1) * swing));
    const maxHp = scaled('血量上限');
    const realm = field => Math.max(1, Math.round(finite(average[field], 1) * swing));
    return {
      id: `foreign-${year}-${index + 1}`,
      worldYear: year,
      spawnedAt: Date.now(),
      status: 'active',
      type: profile.type,
      名号: `${pick(profile.names, random)}·${year.toString(36).toUpperCase()}${index + 1}`,
      攻击: scaled('攻击'),
      防御: scaled('防御'),
      当前血量: maxHp,
      血量上限: maxHp,
      暴击率: Math.min(0.95, Math.max(0, average.暴击率 * swing)),
      暴击伤害: Math.max(1.2, average.暴击伤害 * swing),
      闪避率: Math.min(0.65, Math.max(0, average.闪避率 * swing)),
      吸血率: Math.min(0.5, Math.max(0, average.吸血率 * swing)),
      穿透: Math.max(0, Math.round(average.穿透 * swing)),
      速度: scaled('速度'),
      元神: scaled('元神'),
      生命本源: scaled('生命本源'),
      level_id: realm('level_id'),
      Physique_id: realm('Physique_id'),
      mijinglevel_id: realm('mijinglevel_id'),
      xiangulevel_id: realm('xiangulevel_id'),
      huafenlevel_id: realm('huafenlevel_id'),
      额外体系: profile.extraPath,
      灵根: { name: profile.type, type: '域外', 法球倍率: 1 },
      法球倍率: 1,
      学习的功法: [...profile.techniques],
      样本数: average.samples,
    };
  });
}

export function createForeignCalamityRewardPlan(entity, random = Math.random) {
  const technique = pick(FOREIGN_TECHNIQUES, random);
  const groups = [
    { type: 'page', name: technique.page, class: '道具', amount: randomInt(1, 3, random) },
    {
      type: 'relic',
      relic: createFishKingRelic({ plane: '域外', random, id: `foreign-relic:${entity.id}` }),
    },
    { type: 'strengthen', name: pick(FOREIGN_STRENGTHEN_ITEMS, random), class: '道具', amount: randomInt(1, 10, random) },
    { type: 'token', name: pick(['遣龙令', '遣虎令'], random), class: '道具', amount: randomInt(1, 10, random) },
  ];
  const first = groups.splice(randomInt(0, groups.length - 1, random), 1)[0];
  const second = groups.splice(randomInt(0, groups.length - 1, random), 1)[0];
  return {
    id: `foreign-reward:${entity.id}`,
    groups: [first, second],
    karmaReduction: randomInt(5, 10, random),
    planeFavor: randomInt(5, 20, random),
  };
}

export function createForeignOverlord({ sequence = 1, killCount = 0, now = Date.now(), random = Math.random } = {}) {
  const title = pick(['裂界吞星魔主', '万劫覆世魔主', '葬道天渊魔主'], random);
  return {
    id: `foreign-overlord-${Math.max(1, Math.floor(finite(sequence, 1)))}-${Math.max(1, Math.floor(finite(now, 1)))}`,
    sequence: Math.max(1, Math.floor(finite(sequence, 1))),
    triggerKillCount: Math.max(0, Math.floor(finite(killCount))),
    spawnedAt: Math.max(1, Math.floor(finite(now, Date.now()))),
    status: 'active',
    type: '灾厄魔主',
    boss: true,
    名号: title,
    攻击: FOREIGN_OVERLORD_ATTACK,
    防御: FOREIGN_OVERLORD_DEFENSE,
    当前血量: FOREIGN_OVERLORD_MAX_HP,
    血量上限: FOREIGN_OVERLORD_MAX_HP,
    暴击率: 1,
    暴击伤害: 3,
    闪避率: 0,
    吸血率: 0,
    穿透: 0,
    速度: FOREIGN_OVERLORD_SPEED,
    元神: FOREIGN_OVERLORD_ATTACK,
    生命本源: 16,
    level_id: 16,
    Physique_id: 16,
    mijinglevel_id: 16,
    xiangulevel_id: 16,
    huafenlevel_id: 16,
    额外体系: '裂界灾厄道果',
    灵根: { name: '灾厄魔主', type: '域外', 法球倍率: 1 },
    法球倍率: 1,
    revived: false,
    contributions: {},
  };
}

function createOverlordClone(entity, index, combatAttack, combatDefense) {
  const maxHp = Math.max(1, Math.floor(finite(entity.血量上限, FOREIGN_OVERLORD_MAX_HP) * 0.67));
  return {
    名号: `${entity.名号}·化外身${index}`,
    攻击: Math.max(1, Math.floor(combatAttack * 0.67)),
    防御: Math.max(1, Math.floor(combatDefense * 0.67)),
    当前血量: maxHp,
    血量上限: maxHp,
    暴击率: 1,
    暴击伤害: 3,
    闪避率: 0,
    吸血率: 0,
    速度: FOREIGN_OVERLORD_SPEED,
    mijinglevel_id: 16,
    xiangulevel_id: 16,
    huafenlevel_id: 16,
    灵根: { name: '灾厄魔主化外身', type: '域外', 法球倍率: 1 },
    法球倍率: 1,
    学习的功法: [],
    _忽略境界速度加成: true,
  };
}

export function createForeignOverlordCombatant(entity) {
  const combatAttack = Math.max(1, Math.floor(finite(entity?.攻击, FOREIGN_OVERLORD_ATTACK) * 10));
  const combatDefense = Math.max(1, Math.floor(finite(entity?.防御, FOREIGN_OVERLORD_DEFENSE) * 10));
  const learned = entity?.revived
    ? FOREIGN_OVERLORD_SKILLS.filter(name => name !== '逆命劫生经')
    : [...FOREIGN_OVERLORD_SKILLS];
  return {
    ...JSON.parse(JSON.stringify(entity)),
    type: 'boss',
    boss: true,
    攻击: combatAttack,
    防御: combatDefense,
    速度: FOREIGN_OVERLORD_SPEED,
    减伤比例: 0.7,
    _忽略境界速度加成: true,
    学习的功法: learned,
    分身: [
      createOverlordClone(entity, '一', combatAttack, combatDefense),
      createOverlordClone(entity, '二', combatAttack, combatDefense),
    ],
  };
}

export function calculateForeignOverlordContribution({ beforeHp, afterHp, revivedDuringBattle = false, revivedMaxHp } = {}) {
  const before = Math.max(0, finite(beforeHp));
  const after = Math.max(0, finite(afterHp));
  const raw = revivedDuringBattle
    ? before + Math.max(0, finite(revivedMaxHp, FOREIGN_OVERLORD_MAX_HP * 1.25)) - after
    : before - after;
  return Math.max(0, Math.floor(finite(raw)));
}

export function applyForeignOverlordBattleResult(entity, battle, { playerId, playerName, now = Date.now() } = {}) {
  const beforeHp = Math.max(0, finite(entity?.当前血量));
  const revivedDuringBattle = !entity.revived && battle?.B_revived === true;
  if (revivedDuringBattle) {
    entity.revived = true;
    entity.攻击 = Math.floor(FOREIGN_OVERLORD_ATTACK * 1.25);
    entity.防御 = Math.floor(FOREIGN_OVERLORD_DEFENSE * 1.25);
    entity.元神 = Math.floor(FOREIGN_OVERLORD_ATTACK * 1.25);
    entity.血量上限 = Math.floor(FOREIGN_OVERLORD_MAX_HP * 1.25);
    entity.revivedAt = Math.max(1, Math.floor(finite(now, Date.now())));
  }
  const defeated = battle?.winner === 'A' && finite(battle?.B_hp) <= 0;
  entity.当前血量 = defeated
    ? 0
    : Math.min(
        Math.max(1, finite(entity.血量上限, FOREIGN_OVERLORD_MAX_HP)),
        Math.max(1, Math.floor(finite(battle?.B_hp, 1))),
      );
  const damage = calculateForeignOverlordContribution({
    beforeHp,
    afterHp: entity.当前血量,
    revivedDuringBattle,
    revivedMaxHp: entity.血量上限,
  });
  const id = String(playerId || '');
  if (id && damage > 0) {
    entity.contributions ||= {};
    const previous = entity.contributions[id] || {};
    entity.contributions[id] = {
      name: String(playerName || previous.name || id),
      damage: Math.max(0, finite(previous.damage)) + damage,
      challenges: Math.max(0, Math.floor(finite(previous.challenges))) + 1,
      lastAt: Math.max(1, Math.floor(finite(now, Date.now()))),
    };
  }
  if (defeated) {
    entity.status = 'defeated';
    entity.defeatedBy = id;
    entity.defeatedByName = String(playerName || id);
    entity.defeatedAt = Math.max(1, Math.floor(finite(now, Date.now())));
    entity.rewardPlan ||= createForeignOverlordRewardPlan(entity);
  }
  return { entity, damage, revivedDuringBattle };
}

export function createForeignOverlordRewardPlan(entity, random = Math.random) {
  const technique = pick(FOREIGN_TECHNIQUES, random);
  return {
    id: `foreign-overlord-reward:${entity.id}`,
    page: technique.page,
    basePageAmount: 3,
    karmaReduction: 20,
    planeFavor: 50,
  };
}

export function getForeignOverlordRanking(entity) {
  return Object.entries(entity?.contributions || {})
    .map(([id, contribution]) => ({ id, ...contribution, damage: Math.max(0, finite(contribution?.damage)) }))
    .filter(item => item.damage > 0)
    .sort((a, b) => b.damage - a.damage || a.id.localeCompare(b.id));
}

export function getForeignOverlordRewardForPlayer(entity, playerId) {
  const id = String(playerId || '');
  const ranking = getForeignOverlordRanking(entity);
  const rank = ranking.findIndex(item => item.id === id) + 1;
  if (!rank) return null;
  const plan = entity.rewardPlan || createForeignOverlordRewardPlan(entity);
  return {
    rank,
    damage: ranking[rank - 1].damage,
    page: plan.page,
    pageAmount: plan.basePageAmount + (rank === 1 ? 2 : 0) + (entity.defeatedBy === id ? 1 : 0),
    karmaReduction: plan.karmaReduction,
    planeFavor: plan.planeFavor,
  };
}

function deterministicMemoryRoll(bossId, playerId) {
  const input = `${bossId}:${playerId}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
}

export function normalizeRiftMemoryState(value) {
  if (value === true) return { version: 1, unlocked: true, pity: 0 };
  const state = value && typeof value === 'object' ? value : {};
  return {
    version: 1,
    unlocked: state.unlocked === true,
    pity: Math.min(2, Math.max(0, Math.floor(finite(state.pity)))),
    ...(state.sourceBossId ? { sourceBossId: String(state.sourceBossId) } : {}),
    ...(finite(state.unlockedAt) > 0 ? { unlockedAt: Math.floor(finite(state.unlockedAt)) } : {}),
  };
}

export function resolveRiftMemoryReward(current, {
  bossId,
  playerId,
  now = Date.now(),
  chance = 0.35,
  roll = deterministicMemoryRoll(bossId, playerId),
} = {}) {
  const state = normalizeRiftMemoryState(current);
  if (state.unlocked) return { state, granted: false, alreadyUnlocked: true, roll };
  const attempts = state.pity + 1;
  const granted = attempts >= 3 || finite(roll, 1) < Math.min(1, Math.max(0, finite(chance, 0.35)));
  return {
    state: granted
      ? {
          version: 1,
          unlocked: true,
          pity: 0,
          sourceBossId: String(bossId || ''),
          unlockedAt: Math.max(1, Math.floor(finite(now, Date.now()))),
        }
      : { version: 1, unlocked: false, pity: attempts },
    granted,
    alreadyUnlocked: false,
    roll,
  };
}

function foreignOverlordKey(id) {
  return `xiuxian:foreign-calamity:overlord:entity:${id}`;
}

function foreignOverlordDefeatMarkerKey(id) {
  return `xiuxian:foreign-calamity:defeated:${id}`;
}

async function clearActiveForeignOverlord(id) {
  return compareDeleteRedisKey(FOREIGN_OVERLORD_ACTIVE_KEY, id);
}

export const FOREIGN_OVERLORD_NEXT_SPAWN_KEY = 'xiuxian:foreign-calamity:overlord:next-spawn';

export async function readForeignOverlord(id) {
  if (!id) return null;
  const raw = await redis.get(foreignOverlordKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveForeignOverlord(entity) {
  const key = foreignOverlordKey(entity.id);
  await redis.set(key, JSON.stringify(entity));
  if (entity.status === 'active') {
    await redis.set(FOREIGN_OVERLORD_ACTIVE_KEY, entity.id);
    await redis.sAdd(FOREIGN_OVERLORD_INDEX_KEY, entity.id);
    return entity;
  }

  await clearActiveForeignOverlord(entity.id);
  if (isForeignOverlordFullyClaimed(entity)) {
    await redis.sRem(FOREIGN_OVERLORD_INDEX_KEY, entity.id);
    await redis.del(key);
  } else {
    await redis.sAdd(FOREIGN_OVERLORD_INDEX_KEY, entity.id);
  }
  return entity;
}

export async function readActiveForeignOverlord() {
  const id = await redis.get(FOREIGN_OVERLORD_ACTIVE_KEY);
  if (!id) return null;
  const entity = await readForeignOverlord(id);
  if (entity?.status === 'active' && finite(entity.当前血量) > 0) {
    const storedNext = Math.max(0, Math.floor(finite(await redis.get(FOREIGN_OVERLORD_NEXT_SPAWN_KEY))));
    const entityNext = Math.max(0, Math.floor(finite(entity.nextSpawn)));
    if (entityNext > storedNext) await redis.set(FOREIGN_OVERLORD_NEXT_SPAWN_KEY, String(entityNext));
    return entity;
  }
  await clearActiveForeignOverlord(id);
  return null;
}

export async function listForeignOverlords() {
  const ids = await redis.sMembers(FOREIGN_OVERLORD_INDEX_KEY);
  const entities = [];
  for (const id of ids) {
    const entity = await readForeignOverlord(id);
    if (!entity || isForeignOverlordFullyClaimed(entity)) {
      await redis.sRem(FOREIGN_OVERLORD_INDEX_KEY, id);
      if (entity) await redis.del(foreignOverlordKey(id));
      continue;
    }
    entities.push(entity);
  }
  return entities.sort((a, b) => finite(b.spawnedAt) - finite(a.spawnedAt));
}

function isForeignOverlordFullyClaimed(entity) {
  if (entity?.status !== 'defeated') return false;
  const refinementPending = entity.refinement
    && !entity.refinement.claimedAt
    && finite(entity.refinement.expiresAt) > Date.now();
  if (refinementPending) return false;
  const contributorIds = Object.keys(entity.contributions || {})
    .filter(id => finite(entity.contributions[id]?.damage) > 0);
  const claimedIds = new Set(Object.keys(entity.rewardClaims || {}));
  return contributorIds.length > 0 && contributorIds.every(id => claimedIds.has(id));
}

export async function readForeignOverlordProgress() {
  const [killCount, nextSpawn] = await Promise.all([
    redis.get(FOREIGN_OVERLORD_KILL_COUNT_KEY),
    redis.get(FOREIGN_OVERLORD_NEXT_SPAWN_KEY),
  ]);
  return {
    killCount: Math.max(0, Math.floor(finite(killCount))),
    nextSpawn: Math.max(9, Math.floor(finite(nextSpawn, FOREIGN_OVERLORD_KILLS_REQUIRED))),
  };
}

export async function spawnForeignOverlordIfReady({ killCount, random = Math.random, now = Date.now() } = {}) {
  const attemptSpawn = () => withForeignCalamityLock(FOREIGN_OVERLORD_GLOBAL_LOCK_ID, async () => {
    const active = await readActiveForeignOverlord();
    const storedKills = await redis.get(FOREIGN_OVERLORD_KILL_COUNT_KEY);
    const totalKills = Math.max(0, Math.floor(Math.max(finite(killCount), finite(storedKills))));
    if (active) return { spawned: false, active, killCount: totalKills };

    let nextSpawn = Math.max(0, Math.floor(finite(await redis.get(FOREIGN_OVERLORD_NEXT_SPAWN_KEY))));
    if (!nextSpawn) {
      nextSpawn = randomInt(9, 12, random);
      await redis.set(FOREIGN_OVERLORD_NEXT_SPAWN_KEY, String(nextSpawn));
    }
    if (totalKills < nextSpawn) {
      return { spawned: false, killCount: totalKills, nextSpawn };
    }

    const sequence = Math.max(1, Math.floor(finite(await redis.incr(FOREIGN_OVERLORD_SPAWN_COUNT_KEY), 1)));
    const entity = createForeignOverlord({ sequence, killCount: totalKills, now, random });
    const followingSpawn = nextSpawn + randomInt(9, 12, random);
    entity.nextSpawn = followingSpawn;
    await saveForeignOverlord(entity);
    await redis.set(FOREIGN_OVERLORD_NEXT_SPAWN_KEY, String(followingSpawn));
    return { spawned: true, entity, killCount: totalKills, nextSpawn: followingSpawn };
  });

  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await attemptSpawn();
    if (!result?.busy) return result;
    await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 10));
  }
  return { busy: true, spawned: false };
}

export async function registerForeignCalamityDefeat(entityId, options = {}) {
  const count = Number(await redis.eval(REGISTER_FOREIGN_KILL_SCRIPT, {
    keys: [foreignOverlordDefeatMarkerKey(entityId), FOREIGN_OVERLORD_KILL_COUNT_KEY],
    arguments: [],
  }));
  if (count < 0) {
    const result = await spawnForeignOverlordIfReady(options);
    return { duplicate: true, ...result };
  }
  const result = await spawnForeignOverlordIfReady({ ...options, killCount: count });
  return { duplicate: false, ...result };
}

export async function drainPendingForeignCalamityDefeats(options = {}) {
  const ids = await redis.sMembers(FOREIGN_OVERLORD_PENDING_DEFEATS_KEY);
  let processed = 0;
  let spawned = null;
  for (const id of ids) {
    try {
      const outcome = await withForeignCalamityLock(id, async () => {
        const entity = await readForeignCalamity(id);
        if (!entity || entity.status !== 'defeated' || entity.overlordKillRegisteredAt) {
          await redis.sRem(FOREIGN_OVERLORD_PENDING_DEFEATS_KEY, id);
          return { skipped: true };
        }
        const result = await registerForeignCalamityDefeat(id, options);
        if (result?.busy) return { busy: true };
        entity.overlordKillRegisteredAt = Date.now();
        await saveForeignCalamity(entity);
        return { processed: true, spawned: result.spawned ? result.entity : null };
      });
      if (outcome?.processed) processed++;
      if (outcome?.spawned) spawned = outcome.spawned;
    } catch (error) {
      console.error(`[灾厄魔主] 待处理击杀重放失败 entity=${id}`, error);
    }
  }
  return { processed, spawned };
}

export async function withForeignOverlordLock(id, task) {
  return withForeignCalamityLock(`overlord:${id}`, task);
}

export const PLANE_FAVOR_WUDAO_COST = 50;

export function consumePlaneFavorForWudao(player, rawGain, remaining) {
  const base = Math.min(Math.max(0, Math.floor(finite(rawGain))), Math.max(0, Math.floor(finite(remaining))));
  const favor = Math.max(0, Math.floor(finite(player?.位面青睐)));
  const enhanced = Math.min(Math.floor(finite(rawGain) * 1.2), Math.max(0, Math.floor(finite(remaining))));
  if (favor < PLANE_FAVOR_WUDAO_COST || enhanced <= base) {
    return { gain: base, consumed: 0, bonus: 0, remainingFavor: favor };
  }
  player.位面青睐 = favor - PLANE_FAVOR_WUDAO_COST;
  return {
    gain: enhanced,
    consumed: PLANE_FAVOR_WUDAO_COST,
    bonus: enhanced - base,
    remainingFavor: player.位面青睐,
  };
}

export async function spawnForeignCalamities(previousWorldYear, currentWorldYear, options = {}) {
  const before = Math.floor(Math.max(0, finite(previousWorldYear)) / 1000);
  const after = Math.floor(Math.max(0, finite(currentWorldYear)) / 1000);
  const spawned = [];
  for (let step = before + 1; step <= after; step++) {
    const worldYear = step * 1000;
    const markerKey = `xiuxian:foreign-calamity:spawn:${worldYear}`;
    if (await redis.get(markerKey)) continue;
    const wave = createForeignCalamityWave({ worldYear, players: options.players, random: options.random });
    for (const entity of wave) {
      const key = `xiuxian:foreign-calamity:entity:${entity.id}`;
      if (!await redis.get(key)) await redis.set(key, JSON.stringify(entity));
      await redis.sAdd(FOREIGN_CALAMITY_INDEX_KEY, entity.id);
      spawned.push(entity);
    }
    await redis.set(markerKey, '1');
  }
  return spawned;
}

export async function readForeignCalamity(id) {
  const raw = await redis.get(`xiuxian:foreign-calamity:entity:${id}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveForeignCalamity(entity) {
  await redis.set(`xiuxian:foreign-calamity:entity:${entity.id}`, JSON.stringify(entity));
  if (entity.status === 'defeated' && !entity.overlordKillRegisteredAt) {
    await redis.sAdd(FOREIGN_OVERLORD_PENDING_DEFEATS_KEY, entity.id);
  } else {
    await redis.sRem(FOREIGN_OVERLORD_PENDING_DEFEATS_KEY, entity.id);
  }
  if (entity.status === 'defeated' && entity.rewardClaimedAt) {
    await redis.sRem(FOREIGN_CALAMITY_INDEX_KEY, entity.id);
  } else {
    await redis.sAdd(FOREIGN_CALAMITY_INDEX_KEY, entity.id);
  }
  return entity;
}

export async function listForeignCalamities() {
  const ids = await redis.sMembers(FOREIGN_CALAMITY_INDEX_KEY);
  const entities = [];
  for (let offset = 0; offset < ids.length; offset += FOREIGN_CALAMITY_READ_BATCH_SIZE) {
    const batchIds = ids.slice(offset, offset + FOREIGN_CALAMITY_READ_BATCH_SIZE);
    const batch = await Promise.all(batchIds.map(readForeignCalamity));
    for (let index = 0; index < batch.length; index++) {
      const entity = batch[index];
      if (!entity || (entity.status === 'defeated' && entity.rewardClaimedAt)) {
        await redis.sRem(FOREIGN_CALAMITY_INDEX_KEY, batchIds[index]);
      } else {
        entities.push(entity);
      }
    }
  }
  return entities;
}

export async function withForeignCalamityLock(id, task) {
  const key = `xiuxian:foreign-calamity:lock:${id}`;
  const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
  if (!await redis.set(key, token, { NX: true, EX: 180 })) return { busy: true };
  try {
    return await task();
  } finally {
    await compareDeleteRedisKey(key, token);
  }
}
