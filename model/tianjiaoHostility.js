const HATRED_LEVELS = Object.freeze([
  Object.freeze({ name: '陌生', min: 0, max: 10 }),
  Object.freeze({ name: '注意', min: 11, max: 30 }),
  Object.freeze({ name: '敌视', min: 31, max: 60 }),
  Object.freeze({ name: '仇恨', min: 61, max: 100 }),
  Object.freeze({ name: '死敌', min: 101, max: 200 }),
  Object.freeze({ name: '不死不休', min: 201, max: Infinity }),
]);

const LEVEL_RANK = Object.freeze(Object.fromEntries(HATRED_LEVELS.map((level, index) => [level.name, index])));

export const TIANJIAO_EVENT_CHANCES = Object.freeze({
  dungeon: Object.freeze({ 仇恨: 0.18, 死敌: 0.28, 不死不休: 0.4 }),
  auction: Object.freeze({ 仇恨: 0.25, 死敌: 0.35, 不死不休: 0.5 }),
  forge: Object.freeze({ 死敌: 0.22, 不死不休: 0.38 }),
  proxy: Object.freeze({ 死敌: 0.2, 不死不休: 0.35 }),
  tribulation: Object.freeze({ 不死不休: 0.55 }),
});

const SURRENDER_POOL_SOURCES = Object.freeze([
  ['cailiao_list', '材料'],
  ['danyao_list', '丹药'],
  ['newdanyao_list', '丹药'],
  ['timedanyao_list', '丹药'],
  ['daoju_list', '道具'],
  ['caoyao_list', '草药'],
  ['shicai_list', '食材'],
  ['baoshi_list', '宝石'],
]);

const FORBIDDEN_ESCAPE_METHODS = Object.freeze([
  '燃烧本源精血，施展血遁横渡虚空',
  '祭碎本命法宝，借毁灭道光撕开退路',
  '引爆禁忌阵旗，以空间乱流遮断追击',
  '斩去一截道基，换来刹那极速遁走',
  '唤醒轮回替死符，让一道假身承受杀劫',
]);

function clampProbability(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function clone(value) {
  return structuredClone(value);
}

async function listRedisKeys(redis, pattern) {
  if (typeof redis.scanIterator !== 'function') return redis.keys(pattern);
  const keys = [];
  for await (const page of redis.scanIterator({ MATCH: pattern, COUNT: 200 })) {
    if (Array.isArray(page)) keys.push(...page);
    else keys.push(page);
  }
  return keys;
}

function realmScore(entity) {
  return Math.max(0, Number(entity?.level_id) || 0)
    + Math.max(0, Number(entity?.Physique_id) || 0)
    + Math.max(0, Number(entity?.mijinglevel_id) || 0) * 3
    + Math.max(0, Number(entity?.xiangulevel_id) || 0) * 3
    + Math.max(0, Number(entity?.huafenlevel_id) || 0) * 3;
}

export function getTianjiaoHatredLevel(value) {
  const hatred = Math.max(0, Math.floor(Number(value) || 0));
  return HATRED_LEVELS.find(level => hatred >= level.min && hatred <= level.max)?.name || '陌生';
}

export function isHatredAtLeast(level, minimum) {
  return (LEVEL_RANK[level] ?? 0) >= (LEVEL_RANK[minimum] ?? 0);
}

export function isTianjiaoAvailable(status, worldYear = 0, now = Date.now()) {
  if (!status || typeof status !== 'object') return true;
  if (status.isAlive === false) return false;
  if (Object.hasOwn(status, 'currentHP') && Number(status.currentHP) <= 0) return false;
  if (Number(status.unavailableUntil) > Number(now)) return false;
  if (status.isHealing) {
    const healingUntil = Number(status.养伤?.untilWorldYear);
    if (!Number.isFinite(healingUntil) || healingUntil > Number(worldYear)) return false;
  }
  return true;
}

export async function selectHostileTianjiao({
  redis,
  tianjiaoList,
  playerId,
  minimumLevel = '仇恨',
  event,
  worldYear = 0,
  now = Date.now(),
  random = Math.random,
}) {
  const candidates = (await Promise.all((tianjiaoList || []).map(async tianjiao => {
    const name = tianjiao?.名号;
    if (!name) return null;
    const [hatredRaw, statusRaw, reviveRaw, escapeRaw] = await Promise.all([
      redis.get(`tianjiao:hatred:${name}:${playerId}`),
      redis.get(`tianjiao:status:${name}`),
      redis.get(`tianjiao:global:revive:${name}`),
      redis.get(`tianjiao:global:escape:${name}`),
    ]);
    const hatred = Math.max(0, Math.floor(Number(hatredRaw) || 0));
    const level = getTianjiaoHatredLevel(hatred);
    if (!isHatredAtLeast(level, minimumLevel)) return null;
    if (Math.max(Number(reviveRaw) || 0, Number(escapeRaw) || 0) > Number(now)) return null;
    let status = null;
    try {
      status = statusRaw ? JSON.parse(statusRaw) : null;
    } catch {
      return null;
    }
    if (!isTianjiaoAvailable(status, worldYear, now)) return null;
    return { tianjiao, name, hatred, level, status };
  }))).filter(Boolean);

  if (candidates.length === 0) return null;
  const totalWeight = candidates.reduce((sum, candidate) => sum + Math.max(1, candidate.hatred), 0);
  let roll = clampProbability(random()) * totalWeight;
  const selected = candidates.find(candidate => (roll -= Math.max(1, candidate.hatred)) <= 0)
    || candidates[candidates.length - 1];
  const chance = event ? Number(TIANJIAO_EVENT_CHANCES[event]?.[selected.level]) || 0 : 1;
  if (event && clampProbability(random()) >= chance) return null;
  return { ...selected, chance, candidateCount: candidates.length };
}

function normalizeReward(item, fallbackClass) {
  const name = String(item?.name || '').trim();
  const rarity = Math.floor(Number(item?.稀有度) || 0);
  const itemClass = String(item?.class || fallbackClass || '').trim();
  if (!name || !itemClass || rarity < 1 || rarity > 5) return null;
  return { name, class: itemClass, rarity };
}

function pickDistinct(pool, count, usedNames, random) {
  const available = pool.filter(item => !usedNames.has(item.name));
  const picked = [];
  while (picked.length < count && available.length > 0) {
    const index = Math.min(available.length - 1, Math.floor(clampProbability(random()) * available.length));
    const item = available.splice(index, 1)[0];
    if (usedNames.has(item.name)) continue;
    usedNames.add(item.name);
    const maxAmount = item.class === '装备' ? 1 : Math.max(1, (6 - item.rarity) * 4);
    picked.push({
      ...item,
      amount: 1 + Math.min(maxAmount - 1, Math.floor(clampProbability(random()) * maxAmount)),
    });
  }
  return picked;
}

export function buildTianjiaoSurrenderOffer(tianjiao, gameData, random = Math.random) {
  const drops = Array.isArray(tianjiao?.掉落物) ? tianjiao.掉落物 : [];
  const normal = drops
    .filter(item => clampProbability(random()) < clampProbability(item?.概率))
    .map(item => ({
      name: String(item.name),
      class: String(item.class),
      amount: Math.max(1, Math.min(20, Math.floor(Number(item.数量) || 1))),
      rarity: Math.max(0, Math.floor(Number(item.稀有度) || 0)),
    }));
  if (normal.length === 0 && drops.length > 0) {
    const fallback = [...drops].sort((left, right) => Number(right?.概率 || 0) - Number(left?.概率 || 0))[0];
    normal.push({
      name: String(fallback.name),
      class: String(fallback.class),
      amount: Math.max(1, Math.min(20, Math.floor(Number(fallback.数量) || 1))),
      rarity: Math.max(0, Math.floor(Number(fallback.稀有度) || 0)),
    });
  }

  const pool = SURRENDER_POOL_SOURCES.flatMap(([key, fallbackClass]) =>
    (Array.isArray(gameData?.[key]) ? gameData[key] : [])
      .map(item => normalizeReward(item, fallbackClass))
      .filter(Boolean)
  );
  const usedNames = new Set(normal.map(item => item.name));
  const extras = pickDistinct(pool, 5, usedNames, random);
  return { normal, extras, all: [...normal, ...extras] };
}

export function rollIndependentTianjiaoEscape(random = Math.random) {
  const chance = clampProbability(random());
  const roll = clampProbability(random());
  return { chance, roll, escaped: roll < chance };
}

export function getForbiddenEscapeMethod(random = Math.random) {
  const index = Math.min(
    FORBIDDEN_ESCAPE_METHODS.length - 1,
    Math.floor(clampProbability(random()) * FORBIDDEN_ESCAPE_METHODS.length),
  );
  return FORBIDDEN_ESCAPE_METHODS[index];
}

export function buildRelativeTianjiaoCombatant(player, tianjiao, multiplier = 1) {
  const scale = Math.max(0.1, Number(multiplier) || 1);
  const maxHp = Math.max(1, Math.floor((Number(player?.血量上限) || 1) * scale));
  return {
    ...clone(tianjiao || {}),
    名号: tianjiao?.名号 || '位面天骄',
    攻击: Math.max(1, Math.floor((Number(player?.攻击) || 1) * scale)),
    防御: Math.max(1, Math.floor((Number(player?.防御) || 1) * scale)),
    当前血量: maxHp,
    血量上限: maxHp,
    暴击率: Number(tianjiao?.暴击率) || Number(player?.暴击率) || 0,
    暴击伤害: Number(tianjiao?.暴击伤害) || Number(player?.暴击伤害) || 1.5,
    灵根: clone(tianjiao?.灵根 || { name: '天骄道胎', 法球倍率: 1 }),
    法球倍率: Number(tianjiao?.灵根?.法球倍率) || 1,
    学习的功法: clone(tianjiao?.学习的功法 || []),
  };
}

export function applyTianjiaoAuctionCounterbid(auction, retaliation, playerId, random = Math.random) {
  if (!auction || !retaliation?.name) return { auction, countered: false };
  const targeted = Array.isArray(auction.tianjiaoCounteredPlayers)
    ? auction.tianjiaoCounteredPlayers.map(String)
    : [];
  if (targeted.includes(String(playerId))) return { auction, countered: false };
  const multiplier = 1.1 + clampProbability(random()) * 0.25;
  const price = Math.max(1, Math.ceil((Number(auction.last_price) || 0) * multiplier));
  return {
    countered: true,
    price,
    auction: {
      ...auction,
      last_price: price,
      last_offer_player: -1,
      last_offer_price: Date.now(),
      tianjiaoBidder: retaliation.name,
      tianjiaoTarget: String(playerId),
      tianjiaoCounteredPlayers: [...targeted, String(playerId)],
    },
  };
}

export function applyTianjiaoDungeonSneakAttack(player, random = Math.random) {
  const maxHp = Math.max(1, Number(player?.血量上限) || Number(player?.当前血量) || 1);
  const rate = 0.25 + clampProbability(random()) * 0.3;
  const damage = Math.max(1, Math.floor(maxHp * rate));
  player.当前血量 = Math.max(1, (Number(player.当前血量) || maxHp) - damage);
  return { damage, rate, remainingHp: player.当前血量 };
}

export function buildProxyPlunder(items, random = Math.random) {
  const rateBasisPoints = Math.min(6500, 3500 + Math.floor(clampProbability(random()) * 3001));
  const rate = rateBasisPoints / 10000;
  const stolen = (Array.isArray(items) ? items : []).map(item => {
    const available = Math.max(0, Math.floor(Number(item?.count) || 0));
    if (available <= 0 || !item?.name) return null;
    return {
      name: String(item.name),
      class: String(item.type || item.class || ''),
      amount: Math.max(1, Math.min(available, Math.floor(available * rateBasisPoints / 10000))),
    };
  }).filter(item => item?.class);
  return { rate, stolen };
}

export function isEvilCultivator(player) {
  return Number(player?.魔道值) >= 1000 || ['魔头', '天魔'].includes(player?.灵根?.type);
}

export function hasSoulSearchTechnique(player) {
  return Array.isArray(player?.学习的功法) && player.学习的功法.includes('搜魂大法');
}

export function resolveTianjiaoSoulBacklash(player, tianjiao, random = Math.random) {
  const gap = realmScore(tianjiao) - realmScore(player);
  const chance = Math.min(0.8, Math.max(0.08, 0.18 + gap * 0.012));
  const selfDestructed = clampProbability(random()) < chance;
  if (!selfDestructed) return { selfDestructed: false, chance, gap };

  const severity = Math.min(0.85, Math.max(0.2, 0.35 + gap * 0.01));
  const maxHp = Math.max(1, Number(player?.血量上限) || Number(player?.当前血量) || 1);
  const maxSoul = Math.max(1, Number(player?.元神上限) || Number(player?.元神) || maxHp * 0.2);
  const bodyDamage = Math.max(1, Math.floor(maxHp * severity));
  const soulDamage = Math.max(1, Math.floor(maxSoul * severity));
  const daoInjury = gap >= 20 ? 3 : gap >= 5 ? 2 : 1;
  player.当前血量 = Math.max(1, (Number(player.当前血量) || maxHp) - bodyDamage);
  player.元神 = Math.max(0, (Number(player.元神) || maxSoul) - soulDamage);
  player.道伤 = Math.max(0, Math.floor(Number(player.道伤) || 0)) + daoInjury;
  return { selfDestructed: true, chance, gap, severity, bodyDamage, soulDamage, daoInjury };
}

export function parseTribulationLocation(message) {
  return /偏僻(?:无人)?(?:的)?星系|无人星系|荒芜星域|偏僻无人/.test(String(message || ''))
    ? 'remote'
    : 'visible';
}

export function getTribulationAmbushChance(location, protectorCount = 0, enemyCount = 1) {
  const base = location === 'remote' ? 0.16 : 0.55;
  const crowd = Math.max(0, Math.floor(Number(enemyCount) || 1) - 1) * 0.08;
  const guard = Math.max(0, Math.floor(Number(protectorCount) || 0)) * 0.12;
  return Math.min(0.9, Math.max(0.05, base + crowd - guard));
}

export async function clearTianjiaoHatred(redis, tianjiaoName) {
  const [hatredKeys, fearKeys] = await Promise.all([
    listRedisKeys(redis, `tianjiao:hatred:${tianjiaoName}:*`),
    listRedisKeys(redis, `tianjiao:fear:${tianjiaoName}:*`),
  ]);
  const keys = [
    ...hatredKeys,
    ...fearKeys,
    `tianjiao:hatred_status:${tianjiaoName}`,
  ];
  await Promise.all([...new Set(keys)].map(key => redis.del(key)));
  return { cleared: hatredKeys.length, fearCleared: fearKeys.length };
}
