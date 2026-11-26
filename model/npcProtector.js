import { SUPREME_MARK_ERASERS } from './weimianTravel.js';

export const NPC_PROTECTOR_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const NPC_PROTECTORS = Object.freeze({
  苏灵: {
    name: '苏灵',
    requirement: '与苏灵好感度达到480（生死同命）',
    intro: '命运轮盘跨越诸天降临，万千败亡之果同时消散。苏灵自星辉中走出，挡在你身前。',
    combatant: {
      名号: '苏灵·命运至尊帝',
      level_id: 64,
      Physique_id: 64,
      mijinglevel_id: 24,
      xiangulevel_id: 23,
      攻击: 40_000_000_000_000_000,
      防御: 40_000_000_000_000_000,
      当前血量: 40_000_000_000_000_000,
      血量上限: 40_000_000_000_000_000,
      暴击率: 1,
      暴击伤害: 4,
      速度: 1200,
      灵根: { name: '命运神道体', type: '命运', 法球倍率: 4, 攻击: 10, 防御: 10, 生命: 10 },
      法球倍率: 4,
      本命帝兵: { name: '命运轮盘', 全属性: 120 },
      学习的功法: ['命运终章·移劫夺运', '命运轮盘·万果归一', '命运神道体'],
    },
  },
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
    requirement: '与狠人大帝好感度达到480（护道之约）',
    intro: '青铜面具自时间长河尽头浮现，万千仙葩同时绽放。狠人大帝一步落在你身前。',
    combatant: {
      名号: '狠人大帝·红尘仙身',
      level_id: 64,
      Physique_id: 64,
      mijinglevel_id: 20,
      xiangulevel_id: 16,
      攻击: 1_500_000_000_000_000_000_000,
      防御: 1_500_000_000_000_000_000_000,
      当前血量: 1_500_000_000_000_000_000_000,
      血量上限: 1_500_000_000_000_000_000_000,
      暴击率: 1,
      暴击伤害: 3.5,
      速度: 1800,
      灵根: { name: '混沌吞天仙体', type: '红尘仙体', 法球倍率: 3.2, 攻击: 8, 防御: 5.5, 生命: 7 },
      法球倍率: 3.2,
      学习的功法: ['不灭天功', '万化圣诀', '吞天魔功', '飞仙', '飞仙诀', '一念花开，君临天下'],
      功法熟练度: {
        不灭天功: 1000,
        万化圣诀: 1000,
        吞天魔功: 1000,
        飞仙: 1000,
        飞仙诀: 1000,
        '一念花开，君临天下': 1000,
      },
    },
  },
});

export function isNpcProtector(name) {
  return Object.hasOwn(NPC_PROTECTORS, name);
}

export function getNpcProtectorEligibility(player, najie, name) {
  if (name === '苏灵') {
    const relation = Array.isArray(player?.剧情人物)
      ? player.剧情人物.find(character => character?.苏灵)
      : null;
    const favor = Math.max(0, Number(relation?.好感度) || 0);
    return {
      ok: favor >= 480,
      progress: `${favor}/480好感度`,
      missing: favor >= 480 ? [] : [`还需${480 - favor}好感度`],
    };
  }

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
    const relation = Array.isArray(player?.剧情人物)
      ? player.剧情人物.find(character => character?.狠人大帝)
      : null;
    const favor = Math.max(0, Number(relation?.好感度) || 0);
    return {
      ok: favor >= 480,
      progress: `${favor}/480好感度`,
      missing: favor >= 480 ? [] : [`还需${480 - favor}好感度`],
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

export async function tryNpcProtectorIntervention(player, enemy, battle, now = Date.now(), options = {}) {
  const name = player?.护道人;
  if (player?.大帝庇护 !== 1 || !isNpcProtector(name)) return { triggered: false, reason: 'none' };
  const cooldown = getProtectorCooldown(player, now);
  if (!cooldown.ready) return { triggered: false, reason: 'cooldown', remaining: cooldown.remaining };

  const config = NPC_PROTECTORS[name];
  const protector = buildNpcProtector(name);
  consumeProtectorIntervention(player, now);
  const messages = [config.intro, `${name}淡然开口：“既已应下护道之约，此劫便不该落在你身上。”`];
  let won = false;

  if (!options.forceBattle && (Number(protector.mijinglevel_id) || 0) >= 19) {
    enemy.当前血量 = 0;
    won = true;
    messages.push(name === '苏灵'
      ? `命运轮盘转过一格，${enemy.名号}所有能够伤及你的未来同时被删去。`
      : `${protector.名号}一念落下，${enemy.名号}的攻势随因果一同消散。`);
  } else if (typeof battle === 'function') {
    const result = await battle(protector, enemy);
    won = result?.winner === 'A' || Number(result?.B_hp) <= 0;
    if (Array.isArray(result?.msg)) messages.push(...result.msg);
  }

  if (won) {
    player.当前血量 = Math.max(1, Number(player.血量上限) || 1);
    messages.push(`${name}替你平复伤势，随后收起法相。护道神念进入24小时休养。`);
  } else {
    messages.push(options.forceBattle
      ? `${name}的护道法相在交战中败退，来敌仍未收手。`
      : `${name}的护道法相未能彻底镇住来敌，只得先护送你脱离险境。`);
  }
  return { triggered: true, won, name, messages, protector };
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
