export const SHENGFA_FRAGMENT = '圣法碎片';
export const SHENGFA_REFINING = '炼化超脱至宝中';
export const SHENGFA_REFINE_MS = 480 * 60 * 1000;
export const SUPERDIMENSIONAL_POWER_COST = 5;
export const SHENGFA_DUNGEON_CHANCE = 1 / 1_000_000;

export const SHENGFA_GONGFA = ['星指维宇崩', '击宇碎维', '维宙星灭诀'];

export const SHENHUI_LINGGEN = {
  id: 7010015,
  name: '神慧者',
  type: '神慧者',
  eff: 300,
  法球倍率: 4,
  攻击: 5,
  防御: 5,
  生命: 5,
  生命本源: 150,
  稀有度: 10,
  超维之光: true,
};

const HOUR_MS = 60 * 60 * 1000;

export function hasShengfaPower(player) {
  const learned = Array.isArray(player?.学习的功法) ? player.学习的功法 : [];
  return Number(player?.神慧) >= 1 ||
    player?.圣法碎片?.状态 === '已炼化' ||
    player?.灵根?.超维之光 === true ||
    (player?.灵根?.type === '神慧者' && SHENGFA_GONGFA.every(name => learned.includes(name)));
}

export function isShengfaClaimed(player) {
  return hasShengfaPower(player) || player?.圣法碎片?.状态 === '炼化中';
}

export function startShengfaRefinement(player, { now = Date.now(), groupId = '' } = {}) {
  if (!player) return { ok: false, message: '玩家数据不存在' };
  if (isShengfaClaimed(player)) return { ok: false, message: '你已炼化或正在炼化圣法碎片' };

  const endTime = now + SHENGFA_REFINE_MS;
  player.圣法碎片 = {
    状态: '炼化中',
    开始时间: now,
    完成时间: endTime,
    群号: String(groupId || ''),
  };
  return { ok: true, endTime };
}

export function completeShengfaRefinement(player, now = Date.now()) {
  const state = player?.圣法碎片;
  if (!player || state?.状态 !== '炼化中' || Number(state.完成时间) > now) return { ok: false };

  player.学习的功法 = Array.isArray(player.学习的功法) ? player.学习的功法 : [];
  for (const name of SHENGFA_GONGFA) {
    if (!player.学习的功法.includes(name)) player.学习的功法.push(name);
  }
  player.天资等级 = '无演无尽';
  player.天资评价 = '亘古绝今从未有，演尽诸天万界，此等天资已超脱天道束缚';
  player.灵根 = { ...SHENHUI_LINGGEN };
  player.生命本源 = 100 + SHENHUI_LINGGEN.生命本源;
  player.神慧 = 1;
  player.神魔修炼法已解锁 = true;
  player.神慧体系已解锁 = true;
  player.神魔修炼法 ||= { 已解锁: true, 境界: 1 };
  player.神慧境界 = Math.max(1, Number(player.神慧境界) || 0);
  player.超维星界悟道加成 = 0.5;
  player.超维之力 = Math.max(0, Number(player.超维之力) || 0);
  player.圣法碎片 = { ...state, 状态: '已炼化', 炼化完成时间: now };

  return { ok: true, gongfa: [...SHENGFA_GONGFA] };
}

export function rollShengfaDungeonEncounter(
  player,
  { random = Math.random, chance = SHENGFA_DUNGEON_CHANCE } = {},
) {
  if (!player || player.天资等级 !== '无化如是' || isShengfaClaimed(player) || player.圣法碎片机缘已得) {
    return { encountered: false };
  }
  if (random() >= chance) return { encountered: false };

  player.圣法碎片机缘已得 = true;
  return {
    encountered: true,
    message: '你误入一片超维空间，在万千维度叠映之处结识了莫晓羽。她将唯一的超脱至宝【圣法碎片】交予了你。',
  };
}

export function ascendSuperdimensionalStarRealm(world, now = Date.now()) {
  if (!world) return false;
  let changed = false;
  if (!world.超维星界) {
    world.原世界名 ||= world.world_name;
    world.world_name = '超维星界';
    world.超维星界 = true;
    world.悟道加成 = 0.5;
    world.超维星界上次结算时间 = now;
    changed = true;
  }
  world.attributes ||= {};
  world.attributes.特殊资源 = Array.isArray(world.attributes.特殊资源) ? world.attributes.特殊资源 : [];
  if (!world.attributes.特殊资源.includes('超维之光')) {
    world.attributes.特殊资源.push('超维之光');
    changed = true;
  }
  return changed;
}

function treasureFormula(player, usePhysique = false, random = Math.random) {
  const realm = Math.max(1, Number(usePhysique ? player?.Physique_id : player?.level_id) || 1);
  const mijing = Math.max(1, Number(player?.mijinglevel_id) || 1);
  const xiangu = Math.max(1, Number(player?.xiangulevel_id) || 1);
  return Math.trunc(2000 + 10000 * realm * realm * mijing * xiangu * (2 + random()));
}

export function settleSuperdimensionalStarRealm(player, world, { now = Date.now(), maxHours = Infinity, random = Math.random } = {}) {
  if (!player || !world?.超维星界 || !hasShengfaPower(player)) return { hours: 0 };
  const last = Number(world.超维星界上次结算时间) || now;
  const hours = Math.min(maxHours, Math.floor(Math.max(0, now - last) / HOUR_MS));
  if (hours <= 0) return { hours: 0 };

  const cultivation = treasureFormula(player, false, random) * 120 * hours;
  const blood = treasureFormula(player, true, random) * 120 * hours;
  const power = Math.round(hours * 0.01 * 100) / 100;
  player.修为 = Number(player.修为 || 0) + cultivation;
  player.血气 = Number(player.血气 || 0) + blood;
  player.超维之力 = Math.round((Number(player.超维之力 || 0) + power) * 100) / 100;
  world.超维星界上次结算时间 = last + hours * HOUR_MS;
  return { hours, cultivation, blood, power };
}

export function isBelowImmortalEmperor(player) {
  if (/仙帝|帝尊|祭道|始祖|路尽|主帝/.test(String(player?.名号 || player?.name || ''))) return false;
  return (Number(player?.mijinglevel_id) || 0) < 21 && (Number(player?.xiangulevel_id) || 0) < 21;
}

export function suppressLinggenInBattle(player) {
  const root = player?.灵根 || {};
  const oldMax = Math.max(1, Number(player?.血量上限) || Number(player?.当前血量) || 1);
  const removeMultiplier = (field, rate) => {
    if (Number(player?.[field]) > 0 && Number(rate) > 0) {
      player[field] = Math.max(1, Math.trunc(Number(player[field]) / (1 + Number(rate))));
    }
  };
  removeMultiplier('攻击', root.攻击);
  removeMultiplier('防御', root.防御);
  removeMultiplier('血量上限', root.生命);
  const newMax = Math.max(1, Number(player.血量上限) || oldMax);
  player.当前血量 = Math.min(newMax, Math.max(1, Math.trunc((Number(player.当前血量) || oldMax) * newMax / oldMax)));
  player.灵根 = { name: '灵根已被超维之光削除', type: '无', 攻击: 0, 防御: 0, 生命: 0, eff: 0, 法球倍率: 0 };
  player.法球倍率 = 0;
  player._超维灵根压制 = true;
}

export function applySuperdimensionalOpening(holder, opponents = []) {
  if (!hasShengfaPower(holder)) return { active: false, suppressed: [] };
  holder._超维绝对先手 = true;
  holder.超维之光 = true;
  const suppressed = [];
  for (const opponent of opponents) {
    if (!opponent || !isBelowImmortalEmperor(opponent)) continue;
    suppressLinggenInBattle(opponent);
    opponent._帝兵失效 = true;
    opponent._功法压制概率 = Math.max(0.5, Number(opponent._功法压制概率) || 0);
    suppressed.push(opponent);
  }
  return { active: true, suppressed };
}

export function suppressEmperorWeaponInBattle(player, equipment, { mijingList = [], xianguList = [] } = {}) {
  const weapon = equipment?.帝兵;
  if (!player || !weapon) return false;
  const direct = [
    ['攻击', 'atk'],
    ['防御', 'def'],
    ['血量上限', 'HP'],
  ];
  for (const [field, source] of direct) {
    const value = Number(weapon[source]) || 0;
    if (value > 99) player[field] = Math.max(1, Number(player[field] || 0) - value);
    else if (value > 0) player[field] = Math.max(1, Math.trunc(Number(player[field] || 0) / (1 + value)));
  }

  const mijing = mijingList.find(item => item.level_id == player.mijinglevel_id) || {};
  const xiangu = xianguList.find(item => item.level_id == player.xiangulevel_id) || {};
  let scale = weapon.author_name == player.id ? 1 : 0;
  if (['封神榜', '神女炉', '天庭权杖'].includes(weapon.name) && player.mijinglevel_id < 12 && player.xiangulevel_id < 12) scale += 0.1;
  else if (!weapon.author_name) scale += 1;
  const all = (Number(weapon.全属性) || 0) * scale;
  player.攻击 = Math.max(1, Number(player.攻击 || 0) - Math.trunc(all * ((Number(mijing.基础攻击) || 0) + (Number(xiangu.基础攻击) || 0))));
  player.防御 = Math.max(1, Number(player.防御 || 0) - Math.trunc(all * ((Number(mijing.基础防御) || 0) + (Number(xiangu.基础防御) || 0))));
  player.血量上限 = Math.max(1, Number(player.血量上限 || 0) - Math.trunc(all * ((Number(mijing.基础血量) || 0) + (Number(xiangu.基础血量) || 0))));
  player.当前血量 = Math.min(Number(player.当前血量) || player.血量上限, player.血量上限);
  player.暴击率 = Math.max(0, (Number(player.暴击率) || 0) - (Number(weapon.bao) || 0));
  return true;
}

export function getSuperdimensionalPower(player) {
  return Math.round(Math.max(0, Number(player?.超维之力) || 0) * 100) / 100;
}

export function spendSuperdimensionalPower(player, cost = SUPERDIMENSIONAL_POWER_COST) {
  const current = getSuperdimensionalPower(player);
  if (current < cost) return false;
  player.超维之力 = Math.round((current - cost) * 100) / 100;
  return true;
}

export function canCreateWithSuperdimensionalPower(item) {
  return Boolean(item && Number(item.稀有度) < 8);
}

export function getSuperdimensionalRewriteTarget(e, selfQQ) {
  const raw = e?.at && e.at !== 'all'
    ? e.at
    : e?.message?.find?.(item => item.type === 'at' && item.qq !== 'all')?.qq;
  return String(raw || selfQQ).replace('qg_', '');
}

export function getSuperdimensionalRewriteName(e, kind) {
  const text = e?.message?.filter?.(item => item.type === 'text')
    .map(item => item.text || '')
    .join(' ') || e?.msg || '';
  return String(text)
    .replace(new RegExp(`^#超维改写${kind}\\s*`), '')
    .trim()
    .split(/\s+/)
    .find(part => part && !part.startsWith('@') && !part.startsWith('[CQ:at')) || '';
}
