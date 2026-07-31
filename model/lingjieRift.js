export const RIFT_DURATION_MS = 6 * 60 * 60 * 1000;
export const RIFT_EXPLORE_MS = 15 * 60 * 1000;
export const RIFT_MIN_EXPLORE_MS = 60 * 1000;
export const RIFT_SPAWN_CHANCE = 0.3;
export const RIFT_COORD_MAX = 999;
export const RIFT_ATTEMPT_MIN = 2;
export const RIFT_ATTEMPT_MAX = 5;
export const RIFT_ANCHOR_DROP_CHANCE = 0.12;
export const RIFT_ANCHOR_ITEM = '界隙锚符';

export const RIFT_XIUWEI_PILLS = Object.freeze([
  '裂隙凝元丹',
  '裂隙化元丹',
  '裂隙天元丹',
]);

export const RIFT_XUEQI_PILLS = Object.freeze([
  '裂隙锻血丹',
  '裂隙血髓丹',
  '裂隙龙髓丹',
]);

export const RIFT_POTENTIAL_PILLS = Object.freeze([
  '叩仙丹',
  '问道丹',
  '化仙丹',
]);

const MONSTER_NAMES = Object.freeze([
  '裂界噬魂兽',
  '虚空魔蜕',
  '失乡界灵',
  '裂隙守门者',
]);

export function randomInt(min, max, random = Math.random) {
  return Math.floor(random() * (max - min + 1)) + min;
}

export function pickRandom(list, random = Math.random) {
  return list[Math.floor(random() * list.length)];
}

export function isRiftMilestone(years) {
  const value = Number(years);
  return value > 0 && value % 2000 === 0;
}

export function createRift(era, random = Math.random, now = Date.now()) {
  return {
    id: `lingjie_${Number(era?.epoch) || 1}_${Number(era?.index) || 0}_${Number(era?.years) || 0}_${now}`,
    x: randomInt(0, RIFT_COORD_MAX, random),
    y: randomInt(0, RIFT_COORD_MAX, random),
    baseAttempts: randomInt(RIFT_ATTEMPT_MIN, RIFT_ATTEMPT_MAX, random),
    createdAt: now,
    expiresAt: now + RIFT_DURATION_MS,
    era: {
      epoch: Number(era?.epoch) || 1,
      index: Number(era?.index) || 0,
      years: Number(era?.years) || 0,
    },
  };
}

export function getRiftBaseAttempts(rift) {
  const attempts = Number(rift?.baseAttempts);
  return Number.isInteger(attempts) && attempts > 0 ? attempts : RIFT_ATTEMPT_MIN;
}

export function parseMortalCoordinate(message) {
  const match = String(message || '').match(/^#(?:前往|探索)\s*(\d{1,3})\s*[,，]\s*(\d{1,3})$/);
  if (!match) return null;
  const x = Number(match[1]);
  const y = Number(match[2]);
  if (x > RIFT_COORD_MAX || y > RIFT_COORD_MAX) return null;
  return { x, y };
}

export function isAtRift(player, rift) {
  const coord = player?.凡间坐标;
  return Number(player?.power_place) === 0 &&
    Number(coord?.x) === Number(rift?.x) &&
    Number(coord?.y) === Number(rift?.y);
}

export function canStartRiftExplore(player, rift, now = Date.now(), requiredMs = RIFT_EXPLORE_MS) {
  if (!rift || Number(rift.expiresAt) <= now) return { ok: false, reason: 'collapsed' };
  if (player?.yuanshenlevel_id == null || Number(player.yuanshenlevel_id) < 0) {
    return { ok: false, reason: 'yuanshen' };
  }
  if (Number(player?.power_place) !== 0) return { ok: false, reason: 'plane' };
  if (!isAtRift(player, rift)) return { ok: false, reason: 'coordinate' };
  if (Number(rift.expiresAt) - now < requiredMs) return { ok: false, reason: 'time' };
  return { ok: true };
}

export function calculateRiftExploreDuration(player, minggeReductionMs = 0) {
  const skills = Array.isArray(player?.学习的功法) ? player.学习的功法 : [];
  const messages = [];
  let reductionMs = 0;

  if (skills.includes('行字秘')) {
    let minutes = 2;
    if (Number(player?.mijinglevel_id) >= 9) minutes++;
    if (Number(player?.mijinglevel_id) >= 16) minutes++;
    reductionMs += minutes * 60 * 1000;
    messages.push(`行字秘贯穿界壁：-${minutes}分钟`);
  } else if (skills.includes('天璇步法')) {
    reductionMs += 60 * 1000;
    messages.push('天璇步法踏过乱流：-1分钟');
  }

  if (Number(player?.daofaxianshu) === 2) {
    reductionMs += 2 * 60 * 1000;
    messages.push('道法仙术梳理空间法则：-2分钟');
  }

  const safeMinggeReductionMs = Math.max(0, Number(minggeReductionMs) || 0);
  if (safeMinggeReductionMs > 0) {
    reductionMs += safeMinggeReductionMs;
    messages.push(`命格·秘境加速：-${Math.round(safeMinggeReductionMs / 1000)}秒`);
  }

  const durationMs = Math.max(RIFT_MIN_EXPLORE_MS, RIFT_EXPLORE_MS - reductionMs);
  return {
    durationMs,
    reductionMs: RIFT_EXPLORE_MS - durationMs,
    messages,
  };
}

export function getEffectiveRiftEndTime(task, action) {
  const taskEndTime = Number(task?.end_time);
  if (
    action?.action !== '探索灵界裂缝' ||
    action?.riftId !== task?.rift?.id ||
    !Number.isFinite(Number(action?.end_time))
  ) {
    return taskEndTime;
  }
  return Math.min(taskEndTime, Number(action.end_time));
}

export function createRiftMonster(random = Math.random) {
  const attack = randomInt(2200000, 4800000, random);
  const defense = randomInt(2000000, 4500000, random);
  const hp = randomInt(3200000, 6500000, random);
  return {
    名号: pickRandom(MONSTER_NAMES, random),
    攻击: attack,
    防御: defense,
    当前血量: hp,
    血量上限: hp,
    暴击率: 0.12,
    暴击伤害: 1.8,
    速度: 900,
    法球倍率: 0.12,
    灵根: { name: '裂界灵核', type: '异种', 法球倍率: 0.12 },
    学习的功法: [],
    level_id: 30,
    Physique_id: 30,
    mijinglevel_id: 0,
    xiangulevel_id: 0,
    魔道值: 0,
    仙宠: null,
    神石: {},
  };
}

export function createLevelThirtyNpc(level, physique, name = '无名修士') {
  const attack = Number(level?.基础攻击 || 0) + Number(physique?.基础攻击 || 0) + 1500000;
  const defense = Number(level?.基础防御 || 0) + Number(physique?.基础防御 || 0) + 1500000;
  const hp = Number(level?.基础血量 || 0) + Number(physique?.基础血量 || 0) + 1500000;
  return {
    名号: name,
    攻击: attack,
    防御: defense,
    当前血量: hp,
    血量上限: hp,
    暴击率: Math.max(Number(level?.基础暴击 || 0), Number(physique?.基础暴击 || 0)),
    暴击伤害: 1.8,
    速度: 100,
    法球倍率: 0.12,
    灵根: { id: 70054, name: '天五灵根', type: '天灵根', 法球倍率: 0.12 },
    学习的功法: [],
    level_id: 30,
    Physique_id: 30,
    mijinglevel_id: 0,
    xiangulevel_id: 0,
    魔道值: 0,
    仙宠: null,
    神石: {},
  };
}

export function rollRiftAftermath(random = Math.random) {
  const roll = random();
  if (roll < 0.18) return 'single_ambush';
  if (roll < 0.26) return 'triple_ambush';
  if (roll < 0.40) return 'corpse';
  return 'none';
}

export function rollCorpseExtras(random = Math.random) {
  return {
    luckyGrass: random() < 0.3,
    rootWater: random() < 0.12,
    fateReroll: random() < 0.005,
    fateSlot: random() < 0.001,
  };
}

export function resolveRiftRewardBonus(player, random = Math.random) {
  const messages = [];
  let multiplier = 1;
  let stateChanged = false;
  const rootType = player?.灵根?.type;

  if (rootType === '魔卡少女') {
    multiplier *= 2;
    messages.push('魔卡少女灵根：物品数量 ×2');
  } else if (rootType === '魔卡少女·觉醒') {
    multiplier *= 2;
    messages.push('星之杖觉醒：物品数量 ×2');
  } else if (rootType === '魔卡少女·完全') {
    multiplier *= 5;
    messages.push('梦之杖完全解放：物品数量 ×5');
  } else if (rootType === '神慧者') {
    multiplier *= 10;
    messages.push('神慧之光：物品数量 ×10');
  }

  const protection = player?.剑云海庇护 || player?.['player.剑云海庇护'];
  if (Number(protection?.副本奖励) > 0) {
    protection.副本奖励--;
    multiplier *= 5;
    stateChanged = true;
    messages.push(`剑云海庇护：物品数量 ×5（剩余${protection.副本奖励}次）`);
  }

  if (player?.天地气运 && random() < 0.5) {
    multiplier *= 2;
    messages.push('天地气运显化：物品数量 ×2');
  }

  const luckRoll = random();
  const luck = Number(player?.幸运) || 0;
  const pillLuck = Number(player?.addluckyNo) || 0;
  if (luckRoll < luck) {
    multiplier *= 2;
    const source = luckRoll < pillLuck
      ? '福源丹'
      : player?.仙宠?.type === '幸运' ? '幸运仙宠' : '幸运';
    messages.push(`${source}触发：物品数量 ×2`);
  }

  if (Number(player?.islucky) > 0) {
    player.islucky = Math.max(0, Math.trunc(Number(player.islucky)) - 1);
    stateChanged = true;
    if (player.islucky > 0) {
      messages.push(`福源丹剩余${player.islucky}次`);
    } else {
      player.幸运 = Math.max(0, luck - pillLuck);
      player.addluckyNo = 0;
      messages.push('福源丹在本次探索后失效');
    }
  }

  return { multiplier, messages, stateChanged };
}

export function pickAffordableForgeMaterial(materials, random = Math.random) {
  const pool = (materials || []).filter(item =>
    item?.class === '材料' &&
    Number.isFinite(Number(item?.出售价)) &&
    Number(item.出售价) <= 10000
  );
  return pool.length ? pickRandom(pool, random) : null;
}
