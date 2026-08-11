import { getRealmAuthorityLevel } from './realmAuthority.js';
import { EXCLUSIVE_EQUIPMENT_SETS } from './exclusiveEquipmentSets.js';

export const WANHUA_SET_PHYSIQUE = '无相·万化天魔体';
export const WANHUA_SET_AUTHORITY = 18;

export const WANHUA_SET_ROUTES = Object.freeze({
  blade: Object.freeze({
    command: '#万相夺道',
    item: EXCLUSIVE_EQUIPMENT_SETS.万化天魔套.weapon,
    enemies: Object.freeze([
      '赤阳魔相·焚天', '玄阴魔相·葬月', '金刚魔相·不坏',
      '长生魔相·青帝', '虚空魔相·无距', '血海魔相·冥河',
      '杀生魔相·七绝', '万法魔相·道蚀', '无相魔主·万化',
    ]),
  }),
  robe: Object.freeze({
    command: '#无相蜕生 化万相/归无相',
    item: EXCLUSIVE_EQUIPMENT_SETS.万化天魔套.armor,
    enemies: Object.freeze([
      '第一魔蜕·皮相', '第二魔蜕·骨相', '第三魔蜕·血相', '第四魔蜕·魂相',
      '第五魔蜕·法相', '第六魔蜕·众生相', '第七魔蜕·无相',
    ]),
  }),
  banner: Object.freeze({
    command: '#万灵幡祭',
    item: EXCLUSIVE_EQUIPMENT_SETS.万化天魔套.treasure,
    enemies: Object.freeze(['万灵怨海', '十方主魂', '无主魔幡·器灵']),
  }),
});

const STAGES = new Set(['blade', 'robe', 'banner', 'complete']);
const ROBE_CHOICES = new Set(['化万相', '归无相']);
const BLADE_SEALS = Object.freeze([
  ['攻击', 0.75, '赤阳魔相焚去了你四分之一攻击权柄。'],
  ['防御', 0.75, '玄阴魔相冻结了你四分之一防御权柄。'],
  ['血量上限', 0.75, '金刚魔相夺走了你四分之一生命权柄。'],
  ['法球倍率', 0.7, '长生魔相吞去了你三成法球威能。'],
  ['速度', 0.7, '虚空魔相扭曲距离，速度下降三成。'],
  ['吸血率', 0, '血海魔相截断了你的吸血权柄。'],
  ['暴击率', 0, '杀生魔相夺走了你的暴击权柄。'],
  ['全伤害类型加成', 0, '万法魔相将你的全伤害加成化为虚无。'],
  ['全类型减免', 0, '无相魔主剥下了你的全部减免权柄。'],
]);

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(value, fallback = 0) {
  return Math.trunc(number(value, fallback));
}

export function ensureWanhuaSetTrial(player) {
  if (!player || typeof player !== 'object') throw new TypeError('玩家数据无效');
  if (!player.万化天魔套试炼 || typeof player.万化天魔套试炼 !== 'object' || Array.isArray(player.万化天魔套试炼)) {
    player.万化天魔套试炼 = {};
  }
  const state = player.万化天魔套试炼;
  state.version = 1;
  state.阶段 = STAGES.has(state.阶段) ? state.阶段 : 'blade';
  state.万相夺道 = Math.min(WANHUA_SET_ROUTES.blade.enemies.length, Math.max(0, integer(state.万相夺道)));
  state.无相蜕生 = Math.min(WANHUA_SET_ROUTES.robe.enemies.length, Math.max(0, integer(state.无相蜕生)));
  state.万灵幡祭 = Math.min(WANHUA_SET_ROUTES.banner.enemies.length, Math.max(0, integer(state.万灵幡祭)));
  state.化相魔纹 = Math.max(0, integer(state.化相魔纹));
  state.无相道痕 = Math.max(0, integer(state.无相道痕));
  state.连续失败 = Math.max(0, integer(state.连续失败));
  state.完成装备 = Array.isArray(state.完成装备) ? [...new Set(state.完成装备.map(String))] : [];
  return state;
}

export function getWanhuaSetEligibility(player) {
  if (player?.灵根?.name !== WANHUA_SET_PHYSIQUE) {
    return { ok: false, reason: '只有【无相·万化天魔体】能够踏上万相无相路。' };
  }
  const authority = getRealmAuthorityLevel(player);
  if (authority < WANHUA_SET_AUTHORITY) {
    return { ok: false, reason: '需达到仙王级权柄，才能承受万化天魔套试炼。', authority };
  }
  return { ok: true, authority };
}

export function getWanhuaSetPityMultiplier(state) {
  return 1 + Math.min(0.3, Math.floor(Math.max(0, integer(state?.连续失败)) / 5) * 0.1);
}

function progressField(route) {
  if (route === 'blade') return '万相夺道';
  if (route === 'robe') return '无相蜕生';
  return '万灵幡祭';
}

function routeLabel(route) {
  if (route === 'blade') return '万相夺道';
  if (route === 'robe') return '无相蜕生';
  return '万灵幡祭';
}

function stageIndex(stage) {
  return ['blade', 'robe', 'banner', 'complete'].indexOf(stage);
}

export function getWanhuaSetTrialStatus(player) {
  const state = ensureWanhuaSetTrial(player);
  const next = state.阶段 === 'complete' ? null : WANHUA_SET_ROUTES[state.阶段];
  return {
    state,
    nextCommand: next?.command || '',
    lines: [
      '【万化天魔路·万相无相套】',
      `万相夺道：${state.万相夺道}/${WANHUA_SET_ROUTES.blade.enemies.length} ${state.完成装备.includes(WANHUA_SET_ROUTES.blade.item) ? '〔已铸魔刃〕' : ''}`,
      `无相蜕生：${state.无相蜕生}/${WANHUA_SET_ROUTES.robe.enemies.length} ${state.完成装备.includes(WANHUA_SET_ROUTES.robe.item) ? '〔已织魔袍〕' : ''}`,
      `万灵幡祭：${state.万灵幡祭}/${WANHUA_SET_ROUTES.banner.enemies.length} ${state.完成装备.includes(WANHUA_SET_ROUTES.banner.item) ? '〔魔幡认主〕' : ''}`,
      `蜕生道痕：化相${state.化相魔纹}｜无相${state.无相道痕}`,
      `连续失败：${state.连续失败}${getWanhuaSetPityMultiplier(state) > 1 ? `（下战全属性+${Math.round((getWanhuaSetPityMultiplier(state) - 1) * 100)}%）` : ''}`,
      next ? `下一步：${next.command}` : '万化天魔三器已经归位。',
    ],
  };
}

export function buildWanhuaSetTrialBattle(player, route, choice = '') {
  const state = ensureWanhuaSetTrial(player);
  const eligibility = getWanhuaSetEligibility(player);
  if (!eligibility.ok) return eligibility;
  if (!WANHUA_SET_ROUTES[route]) return { ok: false, reason: '未知万化天魔试炼。' };
  if (state.阶段 === 'complete') return { ok: false, reason: '万化天魔三器已经全部归位。' };
  if (stageIndex(route) !== stageIndex(state.阶段)) {
    return { ok: false, reason: `当前应先完成${routeLabel(state.阶段)}。` };
  }
  if (route === 'robe' && !ROBE_CHOICES.has(choice)) {
    return { ok: false, reason: '无相蜕生前需选择：#无相蜕生 化万相 或 #无相蜕生 归无相。' };
  }

  const config = WANHUA_SET_ROUTES[route];
  const index = state[progressField(route)];
  const enemyName = config.enemies[index];
  if (!enemyName) return { ok: false, reason: '本阶段试炼已经完成。' };

  const attacker = JSON.parse(JSON.stringify(player));
  delete attacker.万化天魔套试炼;
  const maxHp = Math.max(1, integer(player.血量上限 || player.当前血量, 1));
  const pity = getWanhuaSetPityMultiplier(state);
  attacker.攻击 = Math.max(1, Math.trunc(number(attacker.攻击, 1) * pity));
  attacker.防御 = Math.max(1, Math.trunc(number(attacker.防御, 1) * pity));
  attacker.血量上限 = Math.max(1, Math.trunc(maxHp * pity));
  attacker.当前血量 = attacker.血量上限;
  attacker.法球倍率 = number(attacker.法球倍率 || attacker.灵根?.法球倍率, 1);

  let trialText = '';
  if (route === 'blade') {
    const [field, factor, text] = BLADE_SEALS[index];
    attacker[field] = Math.max(0, number(attacker[field]) * factor);
    if (field === '血量上限') attacker.当前血量 = Math.max(1, Math.trunc(attacker.血量上限));
    trialText = text;
  } else if (route === 'robe') {
    if (choice === '化万相') {
      attacker.攻击 = Math.max(1, Math.trunc(attacker.攻击 * 1.25));
      attacker.防御 = Math.max(1, Math.trunc(attacker.防御 * 0.85));
      trialText = '你主动化作此世最凶魔相：攻击提升25%，防御下降15%。';
    } else {
      attacker.防御 = Math.max(1, Math.trunc(attacker.防御 * 1.25));
      attacker.攻击 = Math.max(1, Math.trunc(attacker.攻击 * 0.85));
      trialText = '你将形神归于无相：防御提升25%，攻击下降15%。';
    }
  } else if (index === 0) {
    attacker.攻击 = Math.max(1, Math.trunc(attacker.攻击 * 0.9));
    attacker.防御 = Math.max(1, Math.trunc(attacker.防御 * 0.9));
    trialText = '万灵怨海啃噬形神，你献出一成攻防作为第一重幡祭。';
  } else if (index === 1) {
    attacker.吸血率 = 0;
    attacker.法球倍率 = Math.max(0.1, attacker.法球倍率 * 0.75);
    trialText = '十方主魂截断吸血，并压制四分之一法球威能。';
  } else {
    attacker.全类型减免 = 0;
    attacker.不可复活 = true;
    trialText = '无主器灵剥离全部减免与复活权柄，只认胜者为主。';
  }

  const baseScale = route === 'blade'
    ? 0.72 + index * 0.06
    : route === 'robe'
      ? 0.88 + index * 0.065
      : 1.05 + index * 0.13;
  const enemy = {
    名号: enemyName,
    攻击: Math.max(1, Math.trunc(number(player.攻击, 1) * baseScale)),
    防御: Math.max(1, Math.trunc(number(player.防御, 1) * baseScale)),
    血量上限: Math.max(1, Math.trunc(maxHp * baseScale)),
    当前血量: Math.max(1, Math.trunc(maxHp * baseScale)),
    暴击率: Math.max(0, number(player.暴击率, 0.1)),
    暴击伤害: Math.max(1.5, number(player.暴击伤害, 1.5)),
    灵根: { name: enemyName, type: '天魔残相', 法球倍率: Math.max(1, number(player.法球倍率 || player.灵根?.法球倍率, 1) * baseScale) },
    法球倍率: Math.max(1, number(player.法球倍率 || player.灵根?.法球倍率, 1) * baseScale),
    学习的功法: [],
    仙宠: null,
    分身: [],
    速度: Math.max(1, Math.trunc(number(player.速度, 100) * Math.min(1.25, baseScale + 0.1))),
    mijinglevel_id: number(player.mijinglevel_id),
    xiangulevel_id: number(player.xiangulevel_id),
    _万灵魔幡不可炼化: true,
  };
  return { ok: true, state, attacker, enemy, index, choice, trialText, route, config };
}

export function applyWanhuaSetTrialResult(player, route, won, choice = '') {
  const state = ensureWanhuaSetTrial(player);
  if (state.阶段 !== route || !WANHUA_SET_ROUTES[route]) {
    return { ok: false, reason: '试炼阶段已经变化，请重新查看万化天魔路。' };
  }

  if (!won) {
    state.连续失败 += 1;
    return { ok: true, won: false, completedItem: '', message: `本关未破，进度保留。连续失败${state.连续失败}次。` };
  }

  state.连续失败 = 0;
  const field = progressField(route);
  state[field] = Math.min(WANHUA_SET_ROUTES[route].enemies.length, state[field] + 1);
  if (route === 'robe') {
    if (choice === '化万相') state.化相魔纹 += 1;
    if (choice === '归无相') state.无相道痕 += 1;
  }

  if (state[field] < WANHUA_SET_ROUTES[route].enemies.length) {
    return { ok: true, won: true, completedItem: '', message: `${routeLabel(route)}进度：${state[field]}/${WANHUA_SET_ROUTES[route].enemies.length}。` };
  }

  const completedItem = WANHUA_SET_ROUTES[route].item;
  if (!state.完成装备.includes(completedItem)) state.完成装备.push(completedItem);
  state.阶段 = route === 'blade' ? 'robe' : route === 'robe' ? 'banner' : 'complete';
  return {
    ok: true,
    won: true,
    completedItem,
    message: route === 'blade'
      ? '九尊魔相尽数归一，一柄可演诸天万法的万相天魔刃自掌中生出。'
      : route === 'robe'
        ? '七具魔蜕层层交织，无形无相的魔神袍披落你身。'
        : '器灵低首，亿万怨魂噤声。万灵魔幡认你为唯一魔主。',
  };
}
