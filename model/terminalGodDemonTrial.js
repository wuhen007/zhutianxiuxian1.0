import { getRealmAuthorityLevel } from './realmAuthority.js';
import { EXCLUSIVE_EQUIPMENT_SETS } from './exclusiveEquipmentSets.js';

export const TERMINAL_GOD_DEMON_PHYSIQUE = '终焉神魔体';
export const TERMINAL_TRIAL_AUTHORITY = 18;

export const TERMINAL_TRIAL_ROUTES = Object.freeze({
  weapon: Object.freeze({
    command: '#黄昏神国',
    item: EXCLUSIVE_EQUIPMENT_SETS.终焉神魔套.weapon,
    enemies: Object.freeze([
      '晨曦古神·阿斯塔', '天火神君·赤曜', '玄冥海神·沧溟', '万象母神·娑罗',
      '战争神王·刑荒', '岁月神祇·无晷', '虚空神主·摩诃', '因果天尊·缚命',
      '众生愿神·弥罗', '寂灭雷神·太苍', '永恒光神·伊始', '旧日神皇·诸曜',
      '最后的神王·黄昏',
    ]),
  }),
  armor: Object.freeze({
    command: '#太古魔土 吞噬魔血/保持本心',
    item: EXCLUSIVE_EQUIPMENT_SETS.终焉神魔套.armor,
    enemies: Object.freeze([
      '太古魔将·噬骨', '葬天魔侯·血狱', '无面魔尊·千相', '九幽魔主·罗刹',
      '裂世魔皇·蚩渊', '大灭魔祖·玄黯', '众生恶念·无量', '神魔尸山·葬界',
      '太古魔土之灵·葬天',
    ]),
  }),
  wheel: Object.freeze({
    command: '#诸世归墟',
    item: EXCLUSIVE_EQUIPMENT_SETS.终焉神魔套.treasure,
    enemies: Object.freeze([
      '神性之我', '魔性之我', '未曾败亡之我', '堕入邪道之我', '被众生遗忘之我', '未来终焉身',
    ]),
  }),
});

const STAGES = new Set(['weapon', 'armor', 'wheel', 'complete']);
const ARMOR_CHOICES = new Set(['吞噬魔血', '保持本心']);

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(value, fallback = 0) {
  return Math.trunc(number(value, fallback));
}

export function ensureTerminalGodDemonTrial(player) {
  if (!player || typeof player !== 'object') throw new TypeError('玩家数据无效');
  if (!player.终焉神魔套试炼 || typeof player.终焉神魔套试炼 !== 'object' || Array.isArray(player.终焉神魔套试炼)) {
    player.终焉神魔套试炼 = {};
  }
  const state = player.终焉神魔套试炼;
  state.version = 1;
  state.阶段 = STAGES.has(state.阶段) ? state.阶段 : 'weapon';
  state.黄昏神国 = Math.min(TERMINAL_TRIAL_ROUTES.weapon.enemies.length, Math.max(0, integer(state.黄昏神国)));
  state.太古魔土 = Math.min(TERMINAL_TRIAL_ROUTES.armor.enemies.length, Math.max(0, integer(state.太古魔土)));
  state.诸世归墟 = Math.min(TERMINAL_TRIAL_ROUTES.wheel.enemies.length, Math.max(0, integer(state.诸世归墟)));
  state.魔土余血 = Math.max(0, integer(state.魔土余血));
  state.魔血侵蚀 = Math.max(0, integer(state.魔血侵蚀));
  state.守心道痕 = Math.max(0, integer(state.守心道痕));
  state.连续失败 = Math.max(0, integer(state.连续失败));
  state.完成装备 = Array.isArray(state.完成装备) ? [...new Set(state.完成装备.map(String))] : [];
  return state;
}

export function getTerminalTrialEligibility(player) {
  if (player?.灵根?.name !== TERMINAL_GOD_DEMON_PHYSIQUE) {
    return { ok: false, reason: '只有终焉神魔体能够踏入诸世终焉路。' };
  }
  const authority = getRealmAuthorityLevel(player);
  if (authority < TERMINAL_TRIAL_AUTHORITY) {
    return { ok: false, reason: '需达到仙王级权柄，才能承受神魔终焉试炼。', authority };
  }
  return { ok: true, authority };
}

export function getTerminalPityMultiplier(state) {
  return 1 + Math.min(0.3, Math.floor(Math.max(0, integer(state?.连续失败)) / 5) * 0.1);
}

function progressField(route) {
  if (route === 'weapon') return '黄昏神国';
  if (route === 'armor') return '太古魔土';
  return '诸世归墟';
}

function routeLabel(route) {
  if (route === 'weapon') return '黄昏神国';
  if (route === 'armor') return '太古魔土';
  return '诸世归墟';
}

function stageIndex(stage) {
  return ['weapon', 'armor', 'wheel', 'complete'].indexOf(stage);
}

export function getTerminalTrialStatus(player) {
  const state = ensureTerminalGodDemonTrial(player);
  const next = state.阶段 === 'complete' ? null : TERMINAL_TRIAL_ROUTES[state.阶段];
  return {
    state,
    nextCommand: next?.command || '',
    lines: [
      '【终焉神魔路·诸世终焉套】',
      `诸神黄昏：${state.黄昏神国}/${TERMINAL_TRIAL_ROUTES.weapon.enemies.length} ${state.完成装备.includes(TERMINAL_TRIAL_ROUTES.weapon.item) ? '〔已铸兵〕' : ''}`,
      `太古魔土：${state.太古魔土}/${TERMINAL_TRIAL_ROUTES.armor.enemies.length} ${state.完成装备.includes(TERMINAL_TRIAL_ROUTES.armor.item) ? '〔已成衣〕' : ''}`,
      `诸世归墟：${state.诸世归墟}/${TERMINAL_TRIAL_ROUTES.wheel.enemies.length} ${state.完成装备.includes(TERMINAL_TRIAL_ROUTES.wheel.item) ? '〔已圆满〕' : ''}`,
      `魔土道痕：守心${state.守心道痕}｜侵蚀${state.魔血侵蚀}`,
      `连续失败：${state.连续失败}${getTerminalPityMultiplier(state) > 1 ? `（下战全属性+${Math.round((getTerminalPityMultiplier(state) - 1) * 100)}%）` : ''}`,
      next ? `下一步：${next.command}` : '终焉三器已经归位。',
    ],
  };
}

export function buildTerminalTrialBattle(player, route, choice = '') {
  const state = ensureTerminalGodDemonTrial(player);
  const eligibility = getTerminalTrialEligibility(player);
  if (!eligibility.ok) return eligibility;
  if (!TERMINAL_TRIAL_ROUTES[route]) return { ok: false, reason: '未知终焉试炼。' };
  if (state.阶段 === 'complete') return { ok: false, reason: '终焉三器已经全部归位。' };
  if (stageIndex(route) !== stageIndex(state.阶段)) {
    return { ok: false, reason: `当前应先完成${routeLabel(state.阶段)}。` };
  }
  if (route === 'armor' && !ARMOR_CHOICES.has(choice)) {
    return { ok: false, reason: '进入太古魔土前需选择：#太古魔土 吞噬魔血 或 #太古魔土 保持本心。' };
  }

  const config = TERMINAL_TRIAL_ROUTES[route];
  const index = state[progressField(route)];
  const enemyName = config.enemies[index];
  if (!enemyName) return { ok: false, reason: '本阶段试炼已经完成。' };

  const attacker = JSON.parse(JSON.stringify(player));
  delete attacker.终焉神魔套试炼;
  const maxHp = Math.max(1, integer(player.血量上限 || player.当前血量, 1));
  const pity = getTerminalPityMultiplier(state);
  attacker.攻击 = Math.max(1, Math.trunc(number(attacker.攻击, 1) * pity));
  attacker.防御 = Math.max(1, Math.trunc(number(attacker.防御, 1) * pity));
  attacker.血量上限 = Math.max(1, Math.trunc(maxHp * pity));
  attacker.当前血量 = route === 'armor' && state.魔土余血 > 0
    ? Math.min(attacker.血量上限, Math.trunc(state.魔土余血 * pity))
    : attacker.血量上限;
  attacker.法球倍率 = number(attacker.法球倍率 || attacker.灵根?.法球倍率, 1);

  let trialText = '';
  if (route === 'weapon') {
    const seal = index % 4;
    if (seal === 0) {
      attacker.吸血率 = 0;
      trialText = '旧神封禁了你的吸血权柄。';
    } else if (seal === 1) {
      attacker.不可复活 = true;
      trialText = '旧神从时间线上抹去了你的复活权柄。';
    } else if (seal === 2) {
      attacker.法球倍率 = Math.max(0.1, attacker.法球倍率 * 0.75);
      trialText = '旧神压制了四分之一法球威能。';
    } else {
      attacker.全类型减免 = 0;
      trialText = '旧神剥离了你的全类型减免。';
    }
  } else if (route === 'armor') {
    if (choice === '吞噬魔血') {
      attacker.当前血量 = Math.min(attacker.血量上限, attacker.当前血量 + Math.trunc(attacker.血量上限 * 0.25));
      trialText = '你吞噬魔血恢复25%生命，但魔土侵蚀又深一重。';
    } else {
      trialText = '你拒绝魔血，以残躯继续前行，守心道痕又深一重。';
    }
  } else {
    trialText = '时间线闭合，你必须亲手否定这个曾经可能成为的自己。';
  }

  const baseScale = route === 'weapon'
    ? 0.72 + index * 0.045
    : route === 'armor'
      ? 0.76 + index * 0.055 + (state.魔血侵蚀 + (choice === '吞噬魔血' ? 1 : 0)) * 0.02
      : 0.95 + index * 0.07;
  const enemyHpScale = route === 'armor' ? baseScale * 1.1 : baseScale;
  const enemy = {
    名号: enemyName,
    攻击: Math.max(1, Math.trunc(number(player.攻击, 1) * baseScale)),
    防御: Math.max(1, Math.trunc(number(player.防御, 1) * baseScale)),
    血量上限: Math.max(1, Math.trunc(maxHp * enemyHpScale)),
    当前血量: Math.max(1, Math.trunc(maxHp * enemyHpScale)),
    暴击率: Math.max(0, number(player.暴击率, 0.1)),
    暴击伤害: Math.max(1.5, number(player.暴击伤害, 1.5)),
    灵根: route === 'wheel'
      ? { ...(player.灵根 || {}), name: enemyName }
      : { name: enemyName, type: '神魔残念', 法球倍率: Math.max(1, number(player.法球倍率, 1) * baseScale) },
    法球倍率: Math.max(1, number(player.法球倍率 || player.灵根?.法球倍率, 1) * baseScale),
    学习的功法: [],
    仙宠: null,
    分身: [],
    速度: Math.max(1, Math.trunc(number(player.速度, 100) * Math.min(1.2, baseScale + 0.1))),
    mijinglevel_id: number(player.mijinglevel_id),
    xiangulevel_id: number(player.xiangulevel_id),
    _万灵魔幡不可炼化: true,
  };
  return { ok: true, state, attacker, enemy, index, choice, trialText, route, config };
}

export function applyTerminalTrialResult(player, route, won, remainingHp = 0, choice = '') {
  const state = ensureTerminalGodDemonTrial(player);
  if (state.阶段 !== route || !TERMINAL_TRIAL_ROUTES[route]) {
    return { ok: false, reason: '试炼阶段已经变化，请重新查看终焉神魔路。' };
  }

  if (!won) {
    state.连续失败 += 1;
    return {
      ok: true,
      won: false,
      completedItem: '',
      message: `本关未破，进度保留。连续失败${state.连续失败}次。`,
    };
  }

  state.连续失败 = 0;
  const field = progressField(route);
  state[field] = Math.min(TERMINAL_TRIAL_ROUTES[route].enemies.length, state[field] + 1);
  if (route === 'armor') {
    state.魔土余血 = Math.max(1, integer(remainingHp, 1));
    if (choice === '吞噬魔血') state.魔血侵蚀 += 1;
    if (choice === '保持本心') state.守心道痕 += 1;
  }

  const completed = state[field] >= TERMINAL_TRIAL_ROUTES[route].enemies.length;
  if (!completed) {
    return {
      ok: true,
      won: true,
      completedItem: '',
      message: `${routeLabel(route)}进度：${state[field]}/${TERMINAL_TRIAL_ROUTES[route].enemies.length}。`,
    };
  }

  const completedItem = TERMINAL_TRIAL_ROUTES[route].item;
  if (!state.完成装备.includes(completedItem)) state.完成装备.push(completedItem);
  state.阶段 = route === 'weapon' ? 'armor' : route === 'armor' ? 'wheel' : 'complete';
  if (route === 'armor') state.魔土余血 = 0;
  return {
    ok: true,
    won: true,
    completedItem,
    message: route === 'weapon'
      ? '十二旧神与最后神王尽数陨落，神血在你掌中凝成诸神黄昏。'
      : route === 'armor'
        ? '九重魔土化作经纬，诸魔遗蜕织成神魔葬天衣。'
        : '六条败亡时间线归于一点，万劫归墟轮自终焉中升起。',
  };
}
