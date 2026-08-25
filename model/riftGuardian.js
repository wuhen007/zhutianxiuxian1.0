/**
 * 裂界守卫 —— 巡界司「裂界探索」外界干扰系统
 *
 * 强攻路线每层强制遭遇一名裂界守卫，守卫的全属性以「全服战力前十玩家的平均值」为基准，
 * 再按层数系数放大。秘境（mijinglevel_id）与仙古（xiangulevel_id）等级同样取前十平均，
 * 速度沿用战斗系统公式：100 + 秘境等级×50 + 仙古等级×50。
 *
 * 本模块不读写玩家存档（只读取归档快照做统计），全部为纯函数 + 只读 IO，便于单测。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MODEL_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLAYER_DIR = path.join(MODEL_DIR, '..', 'resources', 'data', 'xiuxian_player');

/** 取全服战力前十作为守卫基准 */
export const GUARD_TOP_N = 10;
/** 全服平均值缓存时长，避免每次探索都全量扫描存档 */
export const GUARD_AVERAGE_TTL = 5 * 60 * 1000;
/** 速度公式：基础100 + 秘境等级×50 + 仙古等级×50 */
export const GUARD_BASE_SPEED = 100;
export const GUARD_REALM_SPEED_STEP = 50;
/** 险胜阈值：战力达到守卫八成即可惨胜 */
export const GUARD_NARROW_RATIO = 0.8;
/** 守卫临场波动幅度：±10%，避免同一玩家结果永远固定 */
export const GUARD_POWER_SWING = 0.1;

/** 服务器空档或存档损坏时的兜底基准 */
export const GUARD_FALLBACK_AVERAGE = Object.freeze({
  攻击: 5000000,
  防御: 5000000,
  血量上限: 12000000,
  暴击率: 0.2,
  暴击伤害: 1.7,
  mijinglevel_id: 1,
  xiangulevel_id: 1,
  samples: 0,
});

/**
 * 三层守卫档案。
 * 灵根与功法均取自现有技能库（攻击技能/防御技能），
 * 若后续把快速裁决换成真实 zd_battle，可直接触发对应技能。
 */
export const RIFT_GUARDIAN_PROFILES = Object.freeze([
  Object.freeze({
    depth: 1,
    名号: '界隙·蚀骸卫',
    简介: '界潮冲刷千万年的战场残骸自行聚拢，锈甲之下没有魂，只剩“守”这一个念头。',
    系数: Object.freeze({ 攻击: 0.7, 防御: 0.8, 血量: 0.85, 暴击率: 0.6, 暴击伤害: -0.2 }),
    功法威压: 1,
    灵根: Object.freeze({
      name: '界隙蚀骸',
      type: '异种',
      法球倍率: 0.35,
      攻击: 0,
      防御: 0,
      生命: 0,
    }),
    学习的功法: Object.freeze(['斗战金身', '八品·避空']),
    风格: '纯肉盾，不主动进攻，靠减伤磨人',
  }),
  Object.freeze({
    depth: 2,
    名号: '归零·锚灵将',
    简介: '归零舰墓的执法灵体，手中锚链钉着三千条未归的航路，越靠近核心它越亮。',
    系数: Object.freeze({ 攻击: 1, 防御: 1, 血量: 1.05, 暴击率: 0.85, 暴击伤害: 0 }),
    功法威压: 1.1,
    灵根: Object.freeze({
      name: '归零锚灵',
      type: '异种',
      法球倍率: 0.9,
      攻击: 0,
      防御: 0,
      生命: 0,
    }),
    学习的功法: Object.freeze(['雷帝宝术', '真龙宝术', '万法成空']),
    风格: '攻守兼备，开场雷帝爆发，随后零倍率格挡',
  }),
  Object.freeze({
    depth: 3,
    名号: '太初·墟渊主',
    简介: '太初纪元沉底的那点残念。它不守裂界，它就是裂界本身裂开的那道口子。',
    系数: Object.freeze({ 攻击: 1.35, 防御: 1.3, 血量: 1.45, 暴击率: 1, 暴击伤害: 0.3 }),
    功法威压: 1.25,
    灵根: Object.freeze({
      name: '太初墟渊',
      type: '混沌孑遗',
      法球倍率: 1.8,
      攻击: 0,
      防御: 0,
      生命: 0,
    }),
    学习的功法: Object.freeze(['元皇道剑', '虚空永恒放逐', '异域不朽经', '无始钟护体']),
    风格: '高爆发＋硬减伤，只有硬实力能碾过去',
  }),
]);

let averageCache = null;

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * 战力公式与 model/xiuxian.js 的 GetPower 保持一致，
 * 此处内联实现以避免测试时引入庞大的依赖链。
 */
export function getCombatPower(unit) {
  const atk = toNumber(unit?.攻击);
  const def = toNumber(unit?.防御);
  const hp = toNumber(unit?.血量上限 ?? unit?.当前血量);
  const bao = toNumber(unit?.暴击率);
  return Math.trunc((atk + def * 0.8 + hp * 0.6) * (bao + 1));
}

/** 速度 = 100 + 秘境等级×50 + 仙古等级×50 */
export function getUnitSpeed(unit) {
  return (
    toNumber(unit?.速度, GUARD_BASE_SPEED) +
    toNumber(unit?.mijinglevel_id) * GUARD_REALM_SPEED_STEP +
    toNumber(unit?.xiangulevel_id) * GUARD_REALM_SPEED_STEP
  );
}

/** 守卫最终战力 = 属性战力 × 功法威压 */
export function getGuardianPower(guardian) {
  return Math.trunc(getCombatPower(guardian) * toNumber(guardian?.功法威压, 1));
}

/** 只读扫描玩家存档，失败的单个文件直接跳过，不影响整体 */
export function readPlayerArchives(dir = PLAYER_DIR) {
  let files = [];
  try {
    files = fs.readdirSync(dir).filter(file => file.endsWith('.json'));
  } catch {
    return [];
  }
  const archives = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      const player = JSON.parse(raw.replace(/^\uFEFF/, ''));
      if (player && typeof player === 'object') archives.push(player);
    } catch {
      /* 单个存档损坏时忽略 */
    }
  }
  return archives;
}

/** 取战力前 topN 的玩家，对全属性求平均 */
export function averageTopPlayers(players, topN = GUARD_TOP_N) {
  const valid = (Array.isArray(players) ? players : [])
    .filter(player => toNumber(player?.攻击) > 0 && toNumber(player?.血量上限) > 0)
    .map(player => ({ player, power: getCombatPower(player) }))
    .sort((a, b) => b.power - a.power)
    .slice(0, Math.max(1, topN));

  if (!valid.length) return { ...GUARD_FALLBACK_AVERAGE };

  const sum = valid.reduce(
    (acc, { player }) => {
      acc.攻击 += toNumber(player.攻击);
      acc.防御 += toNumber(player.防御);
      acc.血量上限 += toNumber(player.血量上限);
      acc.暴击率 += toNumber(player.暴击率);
      acc.暴击伤害 += toNumber(player.暴击伤害, 1.5);
      acc.mijinglevel_id += toNumber(player.mijinglevel_id);
      acc.xiangulevel_id += toNumber(player.xiangulevel_id);
      return acc;
    },
    { 攻击: 0, 防御: 0, 血量上限: 0, 暴击率: 0, 暴击伤害: 0, mijinglevel_id: 0, xiangulevel_id: 0 }
  );

  const size = valid.length;
  return {
    攻击: Math.round(sum.攻击 / size),
    防御: Math.round(sum.防御 / size),
    血量上限: Math.round(sum.血量上限 / size),
    暴击率: Number((sum.暴击率 / size).toFixed(4)),
    暴击伤害: Number((sum.暴击伤害 / size).toFixed(4)),
    mijinglevel_id: Math.round(sum.mijinglevel_id / size),
    xiangulevel_id: Math.round(sum.xiangulevel_id / size),
    samples: size,
  };
}

/** 带缓存的全服前十平均属性 */
export function getEliteAverage(options = {}) {
  const now = toNumber(options.now, Date.now());
  if (Array.isArray(options.players)) {
    return averageTopPlayers(options.players, options.topN || GUARD_TOP_N);
  }
  if (!options.force && averageCache && now - averageCache.at < GUARD_AVERAGE_TTL) {
    return averageCache.value;
  }
  const value = averageTopPlayers(readPlayerArchives(options.dir), options.topN || GUARD_TOP_N);
  averageCache = { at: now, value };
  return value;
}

export function clearEliteAverageCache() {
  averageCache = null;
}

export function getGuardianProfile(depth) {
  const index = Math.min(RIFT_GUARDIAN_PROFILES.length, Math.max(1, Math.floor(toNumber(depth, 1)))) - 1;
  return RIFT_GUARDIAN_PROFILES[index];
}

/**
 * 按层数生成守卫战斗单位。
 * 返回结构与 model/npcProtector.js 的 combatant 对齐，可直接丢进 zd_battle。
 */
export function createRiftGuardian(depth, average = getEliteAverage()) {
  const profile = getGuardianProfile(depth);
  const base = average || GUARD_FALLBACK_AVERAGE;
  const hp = Math.max(1, Math.round(toNumber(base.血量上限) * profile.系数.血量));
  const mijing = Math.max(0, Math.round(toNumber(base.mijinglevel_id)));
  const xiangu = Math.max(0, Math.round(toNumber(base.xiangulevel_id)));
  const guardian = {
    名号: profile.名号,
    简介: profile.简介,
    风格: profile.风格,
    层数: profile.depth,
    攻击: Math.max(1, Math.round(toNumber(base.攻击) * profile.系数.攻击)),
    防御: Math.max(1, Math.round(toNumber(base.防御) * profile.系数.防御)),
    当前血量: hp,
    血量上限: hp,
    暴击率: Number(Math.min(1, Math.max(0, toNumber(base.暴击率) * profile.系数.暴击率)).toFixed(4)),
    暴击伤害: Number(Math.max(1.2, toNumber(base.暴击伤害, 1.5) + profile.系数.暴击伤害).toFixed(4)),
    速度: GUARD_BASE_SPEED,
    mijinglevel_id: mijing,
    xiangulevel_id: xiangu,
    level_id: Math.max(1, mijing * 2 + 20),
    Physique_id: Math.max(1, xiangu * 2 + 20),
    灵根: { ...profile.灵根 },
    法球倍率: profile.灵根.法球倍率,
    学习的功法: [...profile.学习的功法],
    功法威压: profile.功法威压,
    魔道值: 0,
    仙宠: null,
    神石: {},
    样本数: toNumber(base.samples),
  };
  guardian.战力 = getGuardianPower(guardian);
  guardian.实际速度 = getUnitSpeed(guardian);
  return guardian;
}

/**
 * 快速裁决：胜 / 险胜 / 败。
 * 守卫战力带 ±10% 临场波动，低战力玩家有翻盘余地，高战力也会偶尔翻车。
 */
export function judgeGuardBattle(playerPower, guardian, options = {}) {
  const random = options.random || Math.random;
  const power = Math.max(0, toNumber(playerPower));
  const rawGuardPower = Math.max(1, getGuardianPower(guardian));
  const swing = 1 + (random() * 2 - 1) * GUARD_POWER_SWING;
  const guardPower = Math.max(1, Math.round(rawGuardPower * swing));
  const ratio = Number((power / guardPower).toFixed(4));

  if (ratio >= 1) {
    return {
      outcome: 'win',
      ratio,
      guardPower,
      playerPower: power,
      lootScale: 1.15,
      hpLoss: 0.03,
      contributionBonus: 2,
      summary: '正面击溃守卫',
    };
  }
  if (ratio >= GUARD_NARROW_RATIO) {
    return {
      outcome: 'narrow',
      ratio,
      guardPower,
      playerPower: power,
      lootScale: 0.7,
      hpLoss: 0.12,
      contributionBonus: 1,
      summary: '力战险胜，战利品散落大半',
    };
  }
  return {
    outcome: 'lose',
    ratio,
    guardPower,
    playerPower: power,
    lootScale: 0,
    hpLoss: 0.25,
    contributionBonus: 0,
    summary: '被守卫一击轰出裂界',
  };
}

/** 把 zd_battle 的结果转换为裂界探索裁决。 */
export function resolveGuardBattle(player, guardian, battle) {
  if (!battle || !Number.isFinite(Number(battle.A_hp)) || !Number.isFinite(Number(battle.B_hp))) {
    throw new Error('裂界守卫战斗返回了无效血量');
  }
  const playerStartHp = Math.max(1, toNumber(player?.当前血量, 1));
  const playerBattleHp = Math.max(0, toNumber(battle?.A_hp));
  const guardStartHp = Math.max(1, toNumber(guardian?.血量上限 ?? guardian?.当前血量, 1));
  const guardBattleHp = Math.min(guardStartHp, Math.max(0, toNumber(battle?.B_hp, guardStartHp)));
  const won = battle?.winner === 'A' && guardBattleHp <= 0;
  const remainingRatio = Math.min(1, playerBattleHp / playerStartHp);
  const outcome = won ? (remainingRatio >= 0.5 ? 'win' : 'narrow') : 'lose';
  const rewards = outcome === 'win'
    ? { lootScale: 1.15, contributionBonus: 2, summary: '正面击溃守卫' }
    : outcome === 'narrow'
      ? { lootScale: 0.7, contributionBonus: 1, summary: '力战险胜，战利品散落大半' }
      : { lootScale: 0, contributionBonus: 0, summary: '未能击溃守卫，被轰出裂界' };

  return {
    outcome,
    ...rewards,
    resolution: 'battle',
    hpLoss: 0,
    playerHp: Math.max(1, playerBattleHp),
    guardHp: guardBattleHp,
    damageTaken: Math.max(0, playerStartHp - playerBattleHp),
    damageDealt: Math.max(
      0,
      guardStartHp - guardBattleHp,
      toNumber(battle.totalDamageTaken)
    ),
  };
}
