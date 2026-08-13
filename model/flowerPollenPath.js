export const FLOWER_POLLEN_MEDIA = Object.freeze({
  普通进化花粉: Object.freeze({ quality: 1, chance: 0.05, risk: 12, accumulation: 10 }),
  灵性进化花粉: Object.freeze({ quality: 2, chance: 0.12, risk: 8, accumulation: 14 }),
  神性进化花粉: Object.freeze({ quality: 3, chance: 0.2, risk: 4, accumulation: 20 }),
  无暇进化花粉: Object.freeze({ quality: 4, chance: 0.3, risk: 1, accumulation: 28 }),
});

const BREATHING_BONUSES = Object.freeze({
  基础呼吸法: 0.03,
  形意呼吸法: 0.06,
  太极呼吸法: 0.08,
  大雷音呼吸法: 0.12,
  道引呼吸法: 0.16,
  盗引呼吸法: 0.2,
});

const EXTREME_TRIALS = Object.freeze({
  2: [{ name: '本源觉醒', accumulation: 40 }],
  3: [
    { name: '十二枷锁尽断', accumulation: 60 },
    { name: '第一隐藏枷锁', accumulation: 80, requires: '十二枷锁尽断' },
    { name: '第二隐藏枷锁', accumulation: 100, requires: '第一隐藏枷锁' },
    { name: '第三隐藏枷锁', accumulation: 120, requires: '第二隐藏枷锁' },
  ],
  4: [{ name: '无敌画卷', accumulation: 100, requires: '十二枷锁尽断' }],
  5: [{ name: '观想真形', accumulation: 120 }],
  10: [{ name: '大圣道果', accumulation: 160, maxRisk: 100 }],
  14: [{ name: '恒王道果', accumulation: 200, maxRisk: 80 }],
  16: [{ name: '究极根基', accumulation: 240, maxRisk: 35 }],
  17: [
    { name: '大宇净化', accumulation: 260, branch: '大宇' },
    { name: '究极道果', accumulation: 260, branch: '究极' },
  ],
  21: [{ name: '道祖道果', accumulation: 320, maxRisk: 70 }],
  22: [{ name: '路尽道果', accumulation: 380, maxRisk: 60 }],
  23: [{ name: '祭道蜕变', accumulation: 450, maxRisk: 50 }],
});

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function ensureFlowerPollenState(player) {
  if (!player || typeof player !== 'object') return player;
  player.huafenlevel_id = Math.max(1, Math.trunc(number(player.huafenlevel_id, 1)));
  player.进化积淀 = Math.max(0, Math.trunc(number(player.进化积淀)));
  player.花粉隐患 = Math.max(0, Math.min(200, Math.trunc(number(player.花粉隐患))));
  if (!Array.isArray(player.花粉极境)) player.花粉极境 = [];
  if (typeof player.花粉路分支 !== 'string') player.花粉路分支 = '';
  return player;
}

export function getRequiredPollenQuality(targetLevelId) {
  const target = Math.max(2, Math.trunc(number(targetLevelId, 2)));
  if (target >= 18) return 4;
  if (target >= 11) return 3;
  if (target >= 6) return 2;
  return 1;
}

export function getFlowerEvolutionCost(currentLevelId) {
  const exponent = Math.max(0, Math.min(23, Math.trunc(number(currentLevelId, 1)) - 1));
  return Math.trunc(500000 * 2 ** exponent);
}

export function getBestBreathingMethod(player) {
  const learned = Array.isArray(player?.学习的功法) ? player.学习的功法 : [];
  return Object.entries(BREATHING_BONUSES)
    .filter(([name]) => learned.includes(name))
    .sort((a, b) => b[1] - a[1])[0] || ['', 0];
}

export function getFlowerEvolutionChance(player, mediumName, options = {}) {
  ensureFlowerPollenState(player);
  const medium = FLOWER_POLLEN_MEDIA[mediumName];
  if (!medium) return 0;
  const base = 0.75 - Math.min(0.35, (player.huafenlevel_id - 1) * 0.018);
  const accumulation = Math.min(0.2, player.进化积淀 / 1000);
  const risk = Math.min(0.35, player.花粉隐患 * 0.0035);
  const ancestorSeed = options.ancestorSeed ? 0.08 : 0;
  const [, breathing] = getBestBreathingMethod(player);
  return Math.max(0.1, Math.min(0.95, base + medium.chance + accumulation + breathing + ancestorSeed - risk));
}

export function resolveFlowerEvolution(player, mediumName, random = Math.random, options = {}) {
  ensureFlowerPollenState(player);
  const medium = FLOWER_POLLEN_MEDIA[mediumName];
  if (!medium) return { ok: false, reason: 'unknown-medium' };
  const targetLevelId = player.huafenlevel_id + 1;
  if (medium.quality < getRequiredPollenQuality(targetLevelId)) {
    return { ok: false, reason: 'quality', requiredQuality: getRequiredPollenQuality(targetLevelId) };
  }

  const chance = getFlowerEvolutionChance(player, mediumName, options);
  player.进化积淀 += medium.accumulation;
  player.花粉隐患 = Math.min(200, player.花粉隐患 + medium.risk);
  if (number(random()) >= chance) {
    player.进化积淀 += 12;
    player.花粉隐患 = Math.min(200, player.花粉隐患 + 6);
    return { ok: false, reason: 'failed', chance };
  }

  player.huafenlevel_id = targetLevelId;
  if (targetLevelId === 17) {
    player.花粉路分支 = player.花粉极境.includes('究极根基') ? '究极' : '大宇';
  } else if (targetLevelId === 18) {
    player.花粉路前身分支 = player.花粉路分支 || (player.花粉极境.includes('究极根基') ? '究极' : '大宇');
    player.花粉路分支 = '宇究';
  }
  return { ok: true, chance, targetLevelId, branch: player.花粉路分支 };
}

export function getNextFlowerExtremeTrial(player) {
  ensureFlowerPollenState(player);
  const formerBranch = player.花粉路前身分支
    || (player.花粉极境.includes('究极根基') ? '究极' : '大宇');
  for (const realmLevel of Object.keys(EXTREME_TRIALS).map(Number).sort((a, b) => a - b)) {
    if (realmLevel > player.huafenlevel_id) break;
    const trial = EXTREME_TRIALS[realmLevel].find(candidate => {
      if (player.花粉极境.includes(candidate.name)) return false;
      if (candidate.requires && !player.花粉极境.includes(candidate.requires)) return false;
      if (candidate.branch && candidate.branch !== formerBranch) return false;
      return true;
    });
    if (trial) return { ...trial, realmLevel };
  }
  return null;
}

export function completeFlowerExtremeTrial(player) {
  const trial = getNextFlowerExtremeTrial(player);
  if (!trial) return { ok: false, reason: 'no-trial' };
  if (player.进化积淀 < trial.accumulation) {
    return { ok: false, reason: 'accumulation', trial };
  }
  if (trial.maxRisk !== undefined && player.花粉隐患 > trial.maxRisk) {
    return { ok: false, reason: 'risk', trial };
  }
  player.进化积淀 -= trial.accumulation;
  player.花粉隐患 = Math.max(0, player.花粉隐患 - (trial.name === '大宇净化' ? 60 : 12));
  player.花粉极境.push(trial.name);
  return { ok: true, trial };
}

export function calculateFlowerExtremeBonus(player, realm = {}) {
  ensureFlowerPollenState(player);
  const rate = Math.min(0.3, player.花粉极境.length * 0.03);
  return {
    攻击: Math.trunc(number(realm.基础攻击) * rate),
    防御: Math.trunc(number(realm.基础防御) * rate),
    血量: Math.trunc(number(realm.基础血量) * rate),
    rate,
  };
}

export { BREATHING_BONUSES };
