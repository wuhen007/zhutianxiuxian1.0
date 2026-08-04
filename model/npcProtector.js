import { SUPREME_MARK_ERASERS } from './weimianTravel.js';

export const NPC_PROTECTOR_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const NPC_PROTECTORS = Object.freeze({
  柳神: {
    name: '柳神',
    requirement: '与柳神好感度达到480（护道者）',
    intro: '一根翠绿柳枝贯穿虚空，三千神国在枝叶间明灭。柳神的法相挡在你身前。',
    combatant: {
      名号: '柳神·祖祭灵法相',
      level_id: 64,
      Physique_id: 64,
      mijinglevel_id: 18,
      xiangulevel_id: 19,
      攻击: 800_000_000_000,
      防御: 950_000_000_000,
      当前血量: 1_400_000_000_000,
      血量上限: 1_400_000_000_000,
      暴击率: 0.9,
      暴击伤害: 3,
      速度: 100,
      灵根: { name: '仙古祖祭灵', type: '仙王巨头', 法球倍率: 3, 攻击: 6, 防御: 7, 生命: 9 },
      法球倍率: 3,
      学习的功法: ['柳神法·万灵归墟', '原始真解终极篇', '柳神法'],
    },
  },
  狠人大帝: {
    name: '狠人大帝',
    requirement: '同时持有或学会不灭天功、万化圣诀、飞仙诀',
    intro: '青铜面具自时间长河尽头浮现，万千仙葩同时绽放。狠人大帝一步落在你身前。',
    combatant: {
      名号: '狠人大帝·红尘仙身',
      level_id: 64,
      Physique_id: 64,
      mijinglevel_id: 17,
      xiangulevel_id: 16,
      攻击: 1_050_000_000_000,
      防御: 800_000_000_000,
      当前血量: 1_100_000_000_000,
      血量上限: 1_100_000_000_000,
      暴击率: 1,
      暴击伤害: 3.5,
      速度: 100,
      灵根: { name: '混沌吞天仙体', type: '红尘仙体', 法球倍率: 3.2, 攻击: 8, 防御: 5.5, 生命: 7 },
      法球倍率: 3.2,
      学习的功法: ['一念花开·君临天下', '飞仙诀', '吞天魔功·魂吞'],
    },
  },
});

const RUTHLESS_INHERITANCE = Object.freeze(['不灭天功', '万化圣诀', '飞仙诀']);

export function isNpcProtector(name) {
  return Object.hasOwn(NPC_PROTECTORS, name);
}

export function getNpcProtectorEligibility(player, najie, name) {
  if (name === '柳神') {
    const relation = Array.isArray(player?.剧情人物)
      ? player.剧情人物.find(character => character?.柳神)
      : null;
    const favor = Math.max(0, Number(relation?.好感度) || 0);
    return {
      ok: favor >= 480,
      progress: `${favor}/480好感度`,
      missing: favor >= 480 ? [] : [`还需${480 - favor}好感度`],
    };
  }

  if (name === '狠人大帝') {
    const owned = new Set(Array.isArray(player?.学习的功法) ? player.学习的功法 : []);
    for (const item of Array.isArray(najie?.功法) ? najie.功法 : []) {
      if ((Number(item?.数量) || 0) > 0 && item?.name) owned.add(item.name);
    }
    const missing = RUTHLESS_INHERITANCE.filter(technique => !owned.has(technique));
    return {
      ok: missing.length === 0,
      progress: `${RUTHLESS_INHERITANCE.length - missing.length}/${RUTHLESS_INHERITANCE.length}部传承`,
      missing,
    };
  }

  return { ok: false, progress: '', missing: ['未知护道人'] };
}

export function assignNpcProtector(player, name) {
  if (!isNpcProtector(name)) return false;
  player.大帝庇护 = 1;
  player.庇护人 = '';
  player.护道人 = name;
  player.护道人下次出手时间 = 0;
  return true;
}

export function clearProtector(player) {
  const previous = player?.护道人 || '无';
  player.大帝庇护 = 0;
  player.庇护人 = '';
  player.护道人 = '无';
  player.护道人下次出手时间 = 0;
  return previous;
}

export function buildNpcProtector(name) {
  const config = NPC_PROTECTORS[name];
  return config ? structuredClone(config.combatant) : null;
}

export function getProtectorCooldown(player, now = Date.now()) {
  const remaining = Math.max(0, (Number(player?.护道人下次出手时间) || 0) - Number(now));
  return { ready: remaining === 0, remaining };
}

export function consumeProtectorIntervention(player, now = Date.now()) {
  player.护道人下次出手时间 = Number(now) + NPC_PROTECTOR_COOLDOWN_MS;
  player.护道人出手次数 = Math.max(0, Math.floor(Number(player.护道人出手次数) || 0)) + 1;
}

// ===== 抹除禁区至尊印记（盖九幽/莫晓羽/苏灵/武祖叶萧/柳神等） =====
export function isSupremeMarkEraser(name) {
  return SUPREME_MARK_ERASERS.includes(name);
}

export function evaluateSupremeMarkErasure(player, name) {
  if (!isSupremeMarkEraser(name)) {
    return { ok: false, reason: 'unknown', missing: ['该NPC无法抹除禁区至尊印记'] };
  }
  const list = Array.isArray(player?.剧情人物) ? player.剧情人物 : [];
  const hasRelation = list.some(entry => entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, name));
  if (!hasRelation) {
    return {
      ok: false,
      reason: 'no-relation',
      progress: '尚未与该NPC结缘',
      missing: [`需先与「${name}」建立羁绊（剧情人物列表中需有对应项）`],
    };
  }
  return { ok: true };
}

export function eraseSupremeMark(player, name) {
  const before = Math.max(0, Math.floor(Number(player?.禁区至尊注视) || 0));
  player.禁区至尊注视 = 0;
  player.抹除至尊印记次数 = Math.max(0, Math.floor(Number(player?.抹除至尊印记次数) || 0)) + 1;
  if (name) player.最后抹除印记NPC = name;
  return { ok: true, erased: before, alreadyClean: before === 0 };
}

export function formatCooldown(milliseconds) {
  const totalMinutes = Math.max(0, Math.ceil((Number(milliseconds) || 0) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}小时${minutes}分钟`;
}
