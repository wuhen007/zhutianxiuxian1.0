import { hasRealmAuthority } from './realmAuthority.js';

export const ZHETIAN_INHERITANCE_REQUIRED_LEVEL = 12;
export const ZHETIAN_INHERITANCE_TARGET = 5;
export const HUOYU_FOUR_POLE_PITY = 10;

export const ZHETIAN_INHERITANCE_ROUTES = Object.freeze({
  姬家祖地: Object.freeze({
    scripture: '虚空经',
    stateKey: '虚空经',
    trial: '虚空镜神祇念',
  }),
  姜家祖地: Object.freeze({
    scripture: '恒宇经',
    stateKey: '恒宇经',
    prerequisite: '恒宇经·四极卷',
    trial: '恒宇炉神祇念',
  }),
});

function learnedGongfa(player, name) {
  return Array.isArray(player?.学习的功法) && player.学习的功法.includes(name);
}

function dateKey(now) {
  const date = new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ensureState(player) {
  if (!player.遮天帝经传承 || typeof player.遮天帝经传承 !== 'object') {
    player.遮天帝经传承 = {};
  }
  return player.遮天帝经传承;
}

export function getZhetianInheritanceEntryBlock(player, dungeon) {
  const route = ZHETIAN_INHERITANCE_ROUTES[dungeon];
  if (!route) return null;
  if (!hasRealmAuthority(player, ZHETIAN_INHERITANCE_REQUIRED_LEVEL)) {
    return `${dungeon}帝威笼罩，至少达到仙台秘境——圣人方可进入。`;
  }
  if (
    route.prerequisite &&
    !learnedGongfa(player, route.prerequisite) &&
    !learnedGongfa(player, route.scripture)
  ) {
    return `姜家祖地的恒宇道火不认外人，需先在火域参悟《${route.prerequisite}》。`;
  }
  return null;
}

export function advanceZhetianInheritance(
  player,
  { dungeon, victory = true, now = Date.now() } = {}
) {
  const route = ZHETIAN_INHERITANCE_ROUTES[dungeon];
  if (!route || !victory) return { handled: false, changed: false };

  const blocked = getZhetianInheritanceEntryBlock(player, dungeon);
  if (blocked) {
    return { handled: true, changed: false, reason: 'blocked', message: blocked };
  }

  player.学习的功法 = Array.isArray(player.学习的功法) ? player.学习的功法 : [];
  const allState = ensureState(player);
  const state = allState[route.stateKey] || { progress: 0 };
  allState[route.stateKey] = state;

  if (learnedGongfa(player, route.scripture)) {
    state.completed = true;
    state.progress = Math.max(Number(state.progress) || 0, ZHETIAN_INHERITANCE_TARGET);
    return { handled: true, changed: false, reason: 'learned' };
  }

  const today = dateKey(now);
  if (state.lastDate === today) {
    return {
      handled: true,
      changed: false,
      reason: 'daily-limit',
      progress: Number(state.progress) || 0,
      target: ZHETIAN_INHERITANCE_TARGET,
    };
  }

  state.lastDate = today;
  state.progress = Math.min(
    ZHETIAN_INHERITANCE_TARGET,
    (Number(state.progress) || 0) + 1
  );

  if (state.progress >= ZHETIAN_INHERITANCE_TARGET) {
    state.completed = true;
    player.学习的功法.push(route.scripture);
    return {
      handled: true,
      changed: true,
      learned: route.scripture,
      progress: state.progress,
      target: ZHETIAN_INHERITANCE_TARGET,
      message: `【祖地终试】${route.trial}显化，你历经五日道痕试炼，完整《${route.scripture}》烙入识海！`,
    };
  }

  return {
    handled: true,
    changed: true,
    progress: state.progress,
    target: ZHETIAN_INHERITANCE_TARGET,
    message: `【祖地传承】你参悟了一道帝痕，《${route.scripture}》传承进度 ${state.progress}/${ZHETIAN_INHERITANCE_TARGET}（每日首次胜利计一次）。`,
  };
}

export function advanceHuoyuFourPole(
  player,
  { dungeon, victory = true, hasCrystal = false, random = Math.random } = {}
) {
  if (dungeon !== '火域' || !victory) return { handled: false, changed: false };
  if (learnedGongfa(player, '恒宇经·四极卷') || learnedGongfa(player, '恒宇经')) {
    return { handled: true, changed: false, reason: 'learned' };
  }
  if (!hasCrystal) {
    return {
      handled: true,
      changed: false,
      reason: 'missing-crystal',
      message: '火域石壁帝痕沉寂，需持有七彩火晶方可参悟《恒宇经·四极卷》。',
    };
  }

  player.学习的功法 = Array.isArray(player.学习的功法) ? player.学习的功法 : [];
  const allState = ensureState(player);
  const state = allState.恒宇经四极卷 || { attempts: 0 };
  allState.恒宇经四极卷 = state;
  state.attempts = (Number(state.attempts) || 0) + 1;

  const success = state.attempts >= HUOYU_FOUR_POLE_PITY || Number(random()) < 0.1;
  if (success) {
    state.completed = true;
    player.学习的功法.push('恒宇经·四极卷');
    return {
      handled: true,
      changed: true,
      learned: '恒宇经·四极卷',
      consumeCrystal: true,
      attempts: state.attempts,
      message: '【火域悟经】七彩火晶引动混沌火，恒宇大帝四极道图烙入识海，你悟得《恒宇经·四极卷》！',
    };
  }

  return {
    handled: true,
    changed: true,
    attempts: state.attempts,
    message: `【火域参悟】七彩火晶照亮一道帝痕，本次未能贯通四极，保底进度 ${state.attempts}/${HUOYU_FOUR_POLE_PITY}。`,
  };
}

export function resolveZhetianDungeonVictory(
  player,
  { dungeon, hasCrystal = false, now = Date.now(), random = Math.random } = {}
) {
  const fourPole = advanceHuoyuFourPole(player, {
    dungeon,
    victory: true,
    hasCrystal,
    random,
  });
  const inheritance = advanceZhetianInheritance(player, {
    dungeon,
    victory: true,
    now,
  });
  const messages = [fourPole.message, inheritance.message].filter(Boolean);
  const learned = [fourPole.learned, inheritance.learned].filter(Boolean);

  return {
    changed: Boolean(fourPole.changed || inheritance.changed),
    consumeCrystal: Boolean(fourPole.consumeCrystal),
    learned,
    message: messages.join('\n'),
  };
}
