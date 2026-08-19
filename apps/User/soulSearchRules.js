import { resolveReincarnationAptitudeLoss } from '../../model/reincarnationAptitude.js';
import { reduceTribulationDamageByDefense } from '../../model/tribulationDamage.js';
import { getRealmAuthorityLevel } from '../../model/realmAuthority.js';

export const SOUL_SEARCH_KARMA_THRESHOLD = 100;
export const WORLD_ENDING_TRIBULATION_WAVES = 10;
export const WORLD_ENDING_TRIBULATION_DAMAGE = 100_000_000_000_000;

export const SOUL_SEARCH_PROFILES = Object.freeze({
  默认: Object.freeze({ maxGongfa: 5, karmaThreshold: 100 }),
  九重魔功: Object.freeze({ maxGongfa: 9, karmaThreshold: 150 }),
  极道天魔: Object.freeze({ maxGongfa: 10, karmaThreshold: 200 }),
  '无相·万化天魔体': Object.freeze({ maxGongfa: 15, karmaThreshold: 300 }),
});

const APTITUDE_EVALUATIONS = Object.freeze({
  无演无尽: '亘古绝今从未有，演尽诸天万界，此等天资已超脱天道束缚',
  万古无双: '横推古今未来无对手，为修道而生，为应劫而至',
  绝世天骄: '惊才绝艳，具备帝姿，注定为一个时代的天地主角',
  旷世奇才: '万年难遇，此等资质放眼九天十地也是难寻',
  天纵之资: '天赋异禀，媲美上古大教的天才',
  超凡资质: '资质超凡，注定异于常人',
  平庸之资: '资质平平，勉勉强强',
  先天不足: '先天有缺，修炼事倍功半',
  天弃之人: '被天道抛弃，修炼必遭反噬',
  生而愚痴: '天生愚笨，修炼难如登天',
  无化如是: '无用之人，命中注定难有所作为',
});

function pickRandom(items, count, random) {
  const pool = [...items];
  const picked = [];
  while (pool.length > 0 && picked.length < count) {
    const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

export function canUseSoulSearch(player) {
  return getRealmAuthorityLevel(player) >= 11;
}

export function calculateSoulSearchSuccessRate(executor, target) {
  const realmDiff = getRealmAuthorityLevel(executor) - getRealmAuthorityLevel(target);
  const soulDiff = (Number(executor?.yuanshenlevel_id) || 0) - (Number(target?.yuanshenlevel_id) || 0);
  const rate = 0.8 + (realmDiff + soulDiff) * 0.05;
  return Math.round(Math.min(0.95, Math.max(0.1, rate)) * 100) / 100;
}

export function getSoulSearchProfile(player) {
  return SOUL_SEARCH_PROFILES[player?.灵根?.name] || SOUL_SEARCH_PROFILES.默认;
}

export function pickSoulSearchGongfa(gongfa, availableSlots = Infinity, random = Math.random) {
  const candidates = [...new Set((gongfa || []).filter(Boolean))];
  const count = Math.min(
    candidates.length,
    Math.max(0, Number(availableSlots) || 0),
    random() < 0.5 ? 2 : 3
  );
  return pickRandom(candidates, count, random);
}

export function applySoulSearchKarmaTribulation(player, random = Math.random) {
  const karma = Math.max(0, Number(player?.业力值) || 0);
  const karmaThreshold = getSoulSearchProfile(player).karmaThreshold;
  if (karma < karmaThreshold) return { triggered: false, karma, karmaThreshold };

  player.业力值 = karma - karmaThreshold;
  const defended = reduceTribulationDamageByDefense(
    WORLD_ENDING_TRIBULATION_DAMAGE,
    player.防御
  );
  const waves = [];
  let hp = Math.max(0, Number(player.当前血量) || 0);
  for (let wave = 1; wave <= WORLD_ENDING_TRIBULATION_WAVES; wave++) {
    hp = Math.max(0, hp - defended.damage);
    waves.push({ wave, damage: defended.damage, remainingHp: hp });
  }
  player.当前血量 = hp;

  if (hp > 0) {
    return {
      triggered: true,
      survived: true,
      waves,
      karmaThreshold,
      defenseReduction: defended.reduction,
    };
  }

  const oldRealms = {
    level_id: Number(player.level_id) || 1,
    Physique_id: Number(player.Physique_id) || 1,
    mijinglevel_id: Number(player.mijinglevel_id) || 1,
    xiangulevel_id: Number(player.xiangulevel_id) || 1,
  };
  for (const field of Object.keys(oldRealms)) {
    player[field] = Math.max(1, oldRealms[field] - 1);
  }

  const oldSoulLimit = Math.max(0, Number(player.元神上限) || 0);
  player.元神上限 = Math.floor(oldSoulLimit * 0.3);
  player.元神 = Math.min(Math.max(0, Number(player.元神) || 0), player.元神上限);

  const aptitude = resolveReincarnationAptitudeLoss(player.天资等级);
  const newAptitude = aptitude.next || aptitude.current;
  player.天资等级 = newAptitude;
  player.天资评价 = APTITUDE_EVALUATIONS[newAptitude] || player.天资评价;

  const gongfa = Array.isArray(player.学习的功法) ? player.学习的功法 : [];
  const forgetCount = gongfa.length > 0 ? Math.max(1, Math.ceil(gongfa.length * 0.3)) : 0;
  const forgottenGongfa = pickRandom(gongfa, forgetCount, random);
  const forgotten = new Set(forgottenGongfa);
  player.学习的功法 = gongfa.filter(name => !forgotten.has(name));
  if (player.功法 && typeof player.功法 === 'object') {
    for (const name of forgottenGongfa) delete player.功法[name];
  }

  return {
    triggered: true,
    survived: false,
    waves,
    karmaThreshold,
    defenseReduction: defended.reduction,
    penalty: {
      oldRealms,
      newRealms: {
        level_id: player.level_id,
        Physique_id: player.Physique_id,
        mijinglevel_id: player.mijinglevel_id,
        xiangulevel_id: player.xiangulevel_id,
      },
      oldSoulLimit,
      newSoulLimit: player.元神上限,
      oldAptitude: aptitude.current,
      newAptitude,
      forgottenGongfa,
    },
  };
}
