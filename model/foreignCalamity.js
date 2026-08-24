import { createFishKingRelic } from './relicSystem.js';
import { readPlayerArchives } from './riftGuardian.js';

export const FOREIGN_CALAMITY_INDEX_KEY = 'xiuxian:foreign-calamity:index';
export const FOREIGN_PAGE_REQUIREMENT = 10;

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

export function consumePlaneFavorForWudao(player, rawGain, remaining) {
  const base = Math.min(Math.max(0, Math.floor(finite(rawGain))), Math.max(0, Math.floor(finite(remaining))));
  const favor = Math.max(0, Math.floor(finite(player?.位面青睐)));
  const enhanced = Math.min(Math.floor(finite(rawGain) * 1.2), Math.max(0, Math.floor(finite(remaining))));
  if (favor <= 0 || enhanced <= base) return { gain: base, consumed: 0, bonus: 0, remainingFavor: favor };
  player.位面青睐 = favor - 1;
  return { gain: enhanced, consumed: 1, bonus: enhanced - base, remainingFavor: favor - 1 };
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
  await redis.sAdd(FOREIGN_CALAMITY_INDEX_KEY, entity.id);
  return entity;
}

export async function listForeignCalamities() {
  const ids = await redis.sMembers(FOREIGN_CALAMITY_INDEX_KEY);
  return (await Promise.all(ids.map(readForeignCalamity))).filter(Boolean);
}

export async function withForeignCalamityLock(id, task) {
  const key = `xiuxian:foreign-calamity:lock:${id}`;
  const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
  if (!await redis.set(key, token, { NX: true, EX: 180 })) return { busy: true };
  try {
    return await task();
  } finally {
    if (await redis.get(key) === token) await redis.del(key);
  }
}
