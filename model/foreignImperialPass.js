export const IMPERIAL_PASS_TRIGGER_CHANCE = 0.25;
export const IMPERIAL_PASS_KILL_TARGET = 100;
export const IMPERIAL_PASS_WAVE_YEARS = 1000;
export const IMPERIAL_PASS_REST_YEARS = 5000;
export const IMPERIAL_PASS_PRISON_MINUTES = 999999;

const WAVE_ENEMY_RANGES = Object.freeze({
  1: [12, 16],
  2: [18, 24],
  3: [26, 32],
});

// Mirrors the full-attribute ranges used by the Zhetian tribulation formula.
const TRIBULATION_ATTRIBUTE_RANGES = Object.freeze({
  10: [14.2, 54.2],
  11: [22.2, 62.2],
  12: [32.2, 72.2],
  13: [47.2, 87.2],
  14: [62.2, 102.2],
  15: [89.2, 129.2],
});

const YUANSHEN_TO_SECRET_REALM = Object.freeze({
  3: 12,
  4: 13,
  5: 14,
  6: 15,
  7: 16,
  8: 17,
  9: 18,
  10: 19,
  11: 20,
  12: 21,
  13: 22,
  14: 23,
});

function highestRealm(list = []) {
  return list.reduce((highest, item) => (
    !highest || Number(item.level_id) > Number(highest.level_id) ? item : highest
  ), null) || {};
}

function realmById(list = [], levelId) {
  return list.find(item => Number(item.level_id) === Number(levelId)) || {};
}

function attributeRange(levelId) {
  if (TRIBULATION_ATTRIBUTE_RANGES[levelId]) {
    return TRIBULATION_ATTRIBUTE_RANGES[levelId];
  }
  const extraTiers = Math.max(0, levelId - 15);
  const minimum = 89.2 + extraTiers * 30;
  return [minimum, minimum + 40];
}

export function isImperialPassThreshold(player) {
  return Number(player?.mijinglevel_id) >= 13 || Number(player?.xiangulevel_id) >= 12;
}

/**
 * 元神表将圣王/虚道、大圣/斩我等两套体系放在同一层级。
 * 异域敌人统一换算成遮天秘境 id，再套用遮天渡劫公式。
 */
export function getEquivalentSecretRealm(player) {
  const secretRealm = Number(player?.mijinglevel_id) || 1;
  const xianguRealm = Number(player?.xiangulevel_id) || 1;
  const yuanshenRealm = Number(player?.yuanshenlevel_id) || 0;
  const xianguEquivalent = xianguRealm >= 11 ? xianguRealm + 1 : 1;
  const yuanshenEquivalent = YUANSHEN_TO_SECRET_REALM[yuanshenRealm] || 1;
  return Math.max(10, secretRealm, xianguEquivalent, yuanshenEquivalent);
}

export function getWaveEnemyCount(wave, random = Math.random) {
  const [minimum, maximum] = WAVE_ENEMY_RANGES[wave] || WAVE_ENEMY_RANGES[3];
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

export function createForeignProdigy(player, levels, options = {}) {
  const random = options.random || Math.random;
  const secretRealm = getEquivalentSecretRealm(player);
  const [minimum, maximum] = attributeRange(secretRealm);
  const span = Math.round(maximum - minimum);
  const fullAttribute = minimum + Math.floor(random() * (span + 1));
  const qi = highestRealm(levels?.Level_list);
  const physique = highestRealm(levels?.LevelMax_list);
  const secret = realmById(levels?.Levelmijing_list, secretRealm);
  const base = key => Number(qi[key] || 0) + Number(physique[key] || 0) + Number(secret[key] || 0);
  const attack = Math.max(1, Math.trunc(base('基础攻击') * fullAttribute));
  const defense = Math.max(1, Math.trunc(base('基础防御') * fullAttribute));
  const hp = Math.max(1, Math.trunc(base('基础血量') * fullAttribute));

  return {
    名号: options.name || '异域无名天骄',
    攻击: attack,
    防御: defense,
    当前血量: hp,
    血量上限: hp,
    暴击率: 0.25,
    暴击伤害: 1.8,
    速度: 800 + secretRealm * 50,
    法球倍率: 0.2,
    灵根: { name: '异域王血', type: '异域', 法球倍率: 0.2 },
    学习的功法: [],
    level_id: 1,
    Physique_id: 1,
    mijinglevel_id: secretRealm,
    xiangulevel_id: 0,
    yuanshenlevel_id: Math.max(0, secretRealm - 9),
    魔道值: 0,
    仙宠: null,
    神石: {},
    异域全属性: fullAttribute,
  };
}

export function createImperialPassWave({ wave, worldYear, eligibleQqs = [], now = Date.now() }) {
  return {
    id: `${worldYear}:${wave}:${now}`,
    wave,
    phase: 'army',
    startedAt: now,
    startedWorldYear: worldYear,
    deadlineWorldYear: worldYear + IMPERIAL_PASS_WAVE_YEARS,
    eligibleQqs: [...new Set(eligibleQqs.map(String))],
    participants: {},
    totalKills: 0,
    morale: IMPERIAL_PASS_KILL_TARGET,
    killTarget: IMPERIAL_PASS_KILL_TARGET,
    mengTianzhengTriggered: false,
    bloodChampion: null,
  };
}

export function applyImperialPassSortie(active, result) {
  const next = structuredClone(active);
  const qq = String(result.qq);
  const kills = Math.max(0, Math.trunc(Number(result.kills) || 0));
  const participant = next.participants[qq] || {
    qq,
    name: result.name || qq,
    sorties: 0,
    kills: 0,
    prestige: 0,
    deaths: 0,
    supported: false,
  };
  participant.name = result.name || participant.name;
  participant.sorties += 1;
  participant.kills += kills;
  participant.prestige += kills;
  participant.deaths += result.defeated ? 1 : 0;
  participant.supported = true;
  participant.lastSortieAt = Number(result.now) || Date.now();
  next.participants[qq] = participant;
  next.totalKills += kills;
  next.morale = Math.max(0, next.killTarget - next.totalKills);
  return next;
}

export function getImperialPassSupport(active) {
  const required = new Set((active?.eligibleQqs || []).map(String));
  const supported = [...required].filter(qq => active?.participants?.[qq]?.supported).length;
  return { supported, required: required.size };
}

export function isImperialPassWaveComplete(active) {
  if (!active || active.phase !== 'army') return false;
  const support = getImperialPassSupport(active);
  return Number(active.totalKills) >= Number(active.killTarget) && support.supported >= support.required;
}

export function rankImperialPassPrestige(prestige = {}) {
  return Object.entries(prestige)
    .map(([qq, entry]) => ({ qq, ...entry }))
    .sort((a, b) => (
      (Number(b.prestige) || 0) - (Number(a.prestige) || 0) ||
      (Number(b.kills) || 0) - (Number(a.kills) || 0)
    ));
}
