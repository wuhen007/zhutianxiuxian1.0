export const BLACK_EMPEROR_ENCOUNTER_CHANCE = 0.03;
export const BLACK_EMPEROR_TEACHING_FAVOR = 80;

export const BLACK_EMPEROR_FORMATIONS = Object.freeze([
  {
    name: '聚灵道阵',
    favor: 30,
    cost: 5_000_000,
    type: 'training',
    description: '聚拢天地精气，阵法师获得1000点职业经验',
  },
  {
    name: '欺天阵纹',
    favor: 60,
    cost: 15_000_000,
    type: 'tribulation',
    description: '下次渡劫偏移天机区间，阵纹随机向安全或凶险端偏移',
    costMaterials: [
      { name: '混沌源石', count: 5 },
      { name: '欺天石', count: 1 },
    ],
  },
  {
    name: '山河困龙阵',
    favor: 100,
    cost: 30_000_000,
    type: 'battle',
    charges: 1,
    engraveCost: 30_000_000,
    engraveMaterial: { name: '五行神石', count: 1 },
    description: '下一次PVE开局困住敌方一回合，并降低敌方攻击15%、防御45%',
  },
  {
    name: '位面传送阵',
    favor: 160,
    cost: 50_000_000,
    type: 'travel',
    uses: 1,
    description: '获得1次位面传送阵使用次数',
  },
  {
    name: '无始杀阵',
    favor: 240,
    cost: 100_000_000,
    type: 'battle',
    charges: 5,
    engraveCost: 100_000_000,
    engraveMaterial: { name: '五行神石', count: 3 },
    description: '接下来5次PVE攻击翻倍、暴击率提高20%',
  },
  {
    name: '高级位面传送阵',
    favor: 360,
    cost: 300_000_000,
    type: 'travel-high',
    uses: 3,
    description: '获得3次高级位面传送阵使用次数',
  },
]);

const RELATIONSHIPS = Object.freeze([
  { favor: 360, level: 5, name: '帝阵传人' },
  { favor: 240, level: 4, name: '生死之交' },
  { favor: 120, level: 3, name: '自己人' },
  { favor: 40, level: 2, name: '熟人' },
  { favor: 0, level: 1, name: '初识' },
]);

export function getBlackEmperorData(player) {
  if (!Array.isArray(player?.剧情人物)) return null;
  return player.剧情人物.find(character => character?.黑皇) || null;
}

export function getBlackEmperorRelation(favor = 0) {
  const value = Math.max(0, Number(favor) || 0);
  return RELATIONSHIPS.find(relation => value >= relation.favor);
}

export function getUnlockedBlackEmperorFormations(favor = 0) {
  const value = Math.max(0, Number(favor) || 0);
  return BLACK_EMPEROR_FORMATIONS.filter(formation => value >= formation.favor);
}

export function parseBlackEmperorFormationRequest(content) {
  const compact = String(content || '').replace(/\s+/g, '');
  const formation = BLACK_EMPEROR_FORMATIONS.find(item =>
    compact === item.name || compact.startsWith(item.name)
  );
  return {
    formation,
    target: formation ? compact.slice(formation.name.length) : '',
  };
}

function recordEvent(character, event) {
  if (!Array.isArray(character.事件记录)) character.事件记录 = [];
  character.事件记录.push(event);
  if (character.事件记录.length > 20) character.事件记录.splice(0, character.事件记录.length - 20);
}

// 段德遭遇：遮天位面下本时 0.1% 概率遇到盗墓被雷劈的段德，捡到欺天石
// 纯逻辑：仅返回结果，掉落物品由调用方 Add_najie_thing 发放
export function rollDuanDeEncounter(player, options = {}) {
  if (!player || typeof player !== 'object') return { encountered: false };
  const plane = options.plane ?? player.power_place;
  if (Number(plane) !== 2) return { encountered: false }; // 仅遮天位面
  const random = options.random || Math.random;
  const chance = options.chance ?? 0.001; // 0.1%
  if (random() >= chance) return { encountered: false };
  return {
    encountered: true,
    item: { name: '欺天石', class: '材料', amount: 1 },
    message: ' 一声惊天雷响，前方坟丘炸出焦黑大坑，一个灰头土脸的身影被天雷劈得骂骂咧咧——正是盗墓狂人段德！他怀里滚落一块奇石，恰好滚到你脚下。你顺手捡起【欺天石】×1，段德骂骂咧咧扒开焦土，头也不回地跑了。',
  };
}

export function rollBlackEmperorDungeonEncounter(player, options = {}) {
  if (!player || typeof player !== 'object') return { encountered: false, changed: false };
  const random = options.random || Math.random;
  const chance = Math.min(1, Math.max(0, options.chance ?? BLACK_EMPEROR_ENCOUNTER_CHANCE));
  if (random() >= chance) return { encountered: false, changed: false };

  if (!Array.isArray(player.剧情人物)) player.剧情人物 = [];
  let character = getBlackEmperorData(player);
  const place = options.dungeon || options.plane || '位面副本';

  if (!character) {
    character = {
      黑皇: 1,
      关系: 1,
      好感度: 5,
      解锁时间: Date.now(),
      事件记录: [`${place}初遇`],
    };
    player.剧情人物.push(character);
    return {
      encountered: true,
      changed: true,
      firstMeeting: true,
      favorGain: 5,
      relation: getBlackEmperorRelation(5),
      message: ' 副本深处忽然传来金属碰撞声，一条壮硕黑犬正蹲在残阵前研究道纹。它以阵纹替你封住退路上的虚空裂隙，却顺手收走几块边角料。剧情人物「黑皇」关系已建立，好感度+5。',
    };
  }

  const oldRelation = getBlackEmperorRelation(character.好感度);
  const favorGain = options.favorGain ?? 3 + Math.floor(random() * 4);
  character.好感度 = Math.max(0, Number(character.好感度) || 0) + favorGain;
  const relation = getBlackEmperorRelation(character.好感度);
  character.关系 = relation.level;
  recordEvent(character, `${place}再遇，好感度+${favorGain}`);

  return {
    encountered: true,
    changed: true,
    firstMeeting: false,
    favorGain,
    relation,
    relationUp: relation.level > oldRelation.level,
    message: ` 你又在副本里撞见黑皇。它点评了几处阵纹，临走还惦记着你的珍藏，好感度+${favorGain}${relation.level > oldRelation.level ? `，关系提升为「${relation.name}」` : ''}。`,
  };
}

function ensureBattleFormations(player) {
  if (!Array.isArray(player.黑皇PVE阵纹)) player.黑皇PVE阵纹 = [];
  if (!Array.isArray(player.自刻PVE阵纹)) player.自刻PVE阵纹 = [];
}

function pickActiveFormation(player) {
  ensureBattleFormations(player);
  if (player.PVE阵法停用) return null;
  if (player.当前PVE阵法) {
    const selected = [...player.自刻PVE阵纹, ...player.黑皇PVE阵纹]
      .find(item => item?.名称 === player.当前PVE阵法 && item?.剩余次数 > 0);
    if (selected) {
      return {
        source: player.自刻PVE阵纹.includes(selected) ? 'self' : 'emperor',
        item: selected,
      };
    }
    delete player.当前PVE阵法;
  }
  const self = player.自刻PVE阵纹.find(item => item?.剩余次数 > 0);
  if (self) return { source: 'self', item: self };
  const emperor = player.黑皇PVE阵纹.find(item => item?.剩余次数 > 0);
  if (emperor) return { source: 'emperor', item: emperor };
  return null;
}

export function consumeBlackEmperorBattleFormation(player, attacker, defender, options = {}) {
  if (!player || typeof player !== 'object') return { consumed: false, name: null, message: '' };
  const active = pickActiveFormation(player);
  if (!active || !attacker || !defender) return { consumed: false, name: null, message: '' };

  const { source, item } = active;
  const name = item.名称;
  const remaining = Math.max(0, Number(item.剩余次数) || 0);
  const targets = Array.isArray(defender) ? defender : [defender];
  const terrainBoost = options.sourceField?.consumed ? 0.1 : 0;

  if (name === '山河困龙阵') {
    targets.forEach(target => {
      target.攻击 = Math.max(1, Math.floor((Number(target.攻击) || 0) * (0.85 - terrainBoost)));
      target.防御 = Math.max(0, Math.floor((Number(target.防御) || 0) * (0.55 - terrainBoost)));
      target._困龙封印 = true;
    });
  } else if (name === '无始杀阵') {
    attacker.攻击 = Math.max(1, Math.floor((Number(attacker.攻击) || 0) * (2 + terrainBoost * 2)));
    attacker.暴击率 = Math.min(1, Number(((Number(attacker.暴击率) || 0) + 0.2 + terrainBoost / 2).toFixed(4)));
  } else {
    return { consumed: false, name, message: '' };
  }

  item.剩余次数 = remaining - 1;
  if (item.剩余次数 <= 0) {
    if (source === 'self') {
      player.自刻PVE阵纹 = player.自刻PVE阵纹.filter(entry => entry !== item);
    } else {
      player.黑皇PVE阵纹 = player.黑皇PVE阵纹.filter(entry => entry !== item);
    }
  }

  const character = getBlackEmperorData(player);
  if (character) recordEvent(character, `${source === 'self' ? '自刻' : '黑皇'}${name}激活（剩${remaining - 1}次）`);
  return {
    consumed: true,
    source,
    name,
    remaining: remaining - 1,
    seal: name === '山河困龙阵',
    terrainBoost: terrainBoost > 0,
    message: `${source === 'self' ? '你亲手刻下的' : '黑皇预先刻下的'}「${name}」骤然复苏，阵纹覆盖战场！${
      name === '山河困龙阵'
        ? ' 山河大势倒卷，敌方被大阵困住，一回合内难以出手！'
        : ` 杀伐道则加持，剩余${remaining - 1}次生效机会。`
    }${terrainBoost ? ' 源石场接引山川龙脉，阵威再涨！' : ''}`,
  };
}

export function consumeBlackEmperorTribulationFormation(player, options = {}) {
  if (!player || typeof player !== 'object') {
    return { consumed: false, success: false, rangeShift: 0, message: '' };
  }
  if (player._欺天阵纹渡劫) return player._欺天阵纹渡劫;

  const pending = player.黑皇待用阵纹 === '欺天阵纹';
  const random = options.random || Math.random;
  const successChance = options.successChance ?? 0.25;
  const success = pending && random() < successChance;
  const rangeShift = success ? Math.floor(random() * 31) - 15 : 0;
  const result = {
    consumed: pending,
    success,
    rangeShift,
    damageMultiplier: success ? 0.75 : 1,
    announced: false,
    message: pending
      ? success
        ? rangeShift < 0
          ? `【欺天阵纹·天机偏正】阵纹遮蔽天机，本场雷劫随机区间向安全端偏移 ${Math.abs(rangeShift)} 点！`
          : rangeShift > 0
          ? `【欺天阵纹·阵纹反噬】阵纹失稳反向引动天机，本场雷劫随机区间向凶险端偏移 ${rangeShift} 点！`
          : '【欺天阵纹·阵纹中和】偏移归零，本场雷劫区间随机不变。'
        : '【欺天阵纹·天机未蔽】阵纹未能瞒过天劫，悄然化入雷海。'
      : '',
  };

  if (pending) {
    delete player.黑皇待用阵纹;
    const character = getBlackEmperorData(player);
    if (character) recordEvent(character, `渡劫激活欺天阵纹（${success ? `偏移 ${rangeShift > 0 ? '+' : ''}${rangeShift}` : '失败'}）`);
  }
  Object.defineProperty(player, '_欺天阵纹渡劫', {
    value: result,
    configurable: true,
  });
  return result;
}

export function getSelfEngraveChance(level = 0, failures = 0) {
  const value = Math.max(1, Number(level) || 0);
  const pity = Math.min(0.2, Math.max(0, Number(failures) || 0) * 0.05);
  return Number(Math.min(0.95, 0.25 + value * 0.02 + pity).toFixed(4));
}

export function selfEngraveFormation(player, formationName, options = {}) {
  const result = { ok: false, name: formationName, reason: '', chance: 0 };
  const formation = BLACK_EMPEROR_FORMATIONS.find(item => item.name === formationName);
  if (!formation?.engraveCost) {
    result.reason = '该阵只能由黑皇亲手刻画';
    return result;
  }
  if (!Array.isArray(player.自刻PVE阵纹)) player.自刻PVE阵纹 = [];
  if (player.自刻PVE阵纹.some(item => item.名称 === formationName)) {
    result.reason = '已有同名的自刻阵纹在身';
    return result;
  }
  const material = formation.engraveMaterial;
  const materialCount = options.materialCount ?? (options.hasMaterial ? 999 : 0);
  if ((Number(player.灵石) || 0) < formation.engraveCost) {
    result.reason = `灵石不足，需要${formation.engraveCost.toLocaleString()}灵石`;
    return result;
  }
  if (material && materialCount < material.count) {
    result.reason = `缺少材料【${material.name}】x${material.count}`;
    return result;
  }

  const level = Number(player.occupation_level) || 0;
  const failures = Math.max(0, Number(player.自刻阵法连续失败) || 0);
  const chance = getSelfEngraveChance(level, failures);
  result.chance = chance;
  const random = options.random || Math.random;
  const success = random() < chance;

  if (success) {
    player.自刻PVE阵纹.push({ 名称: formation.name, 剩余次数: formation.charges || 1 });
    player.自刻阵法连续失败 = 0;
    player.当前PVE阵法 = formation.name;
    delete player.PVE阵法停用;
  } else {
    player.自刻阵法连续失败 = failures + 1;
  }
  result.nextChance = getSelfEngraveChance(level, player.自刻阵法连续失败);
  result.ok = success;
  result.message = success
    ? `阵纹成！【${formation.name}】已收入自刻阵纹，剩余${formation.charges || 1}次`
    : '阵纹崩散，材料与灵石化为飞灰。';
  return result;
}

export function addBlackEmperorBattleFormation(player, formationName) {
  const formation = BLACK_EMPEROR_FORMATIONS.find(item => item.name === formationName);
  if (!formation?.charges) return false;
  if (!Array.isArray(player.黑皇PVE阵纹)) player.黑皇PVE阵纹 = [];
  const stored = player.黑皇PVE阵纹.find(item => item?.名称 === formation.name);
  if (stored) stored.剩余次数 = Math.max(0, Number(stored.剩余次数) || 0) + formation.charges;
  else player.黑皇PVE阵纹.push({ 名称: formation.name, 剩余次数: formation.charges });
  player.当前PVE阵法 = formation.name;
  delete player.PVE阵法停用;
  return true;
}

export function selectBlackEmperorBattleFormation(player, formationName) {
  ensureBattleFormations(player);
  if (formationName === '自动') {
    delete player.当前PVE阵法;
    delete player.PVE阵法停用;
    return { ok: true, name: '自动' };
  }
  const stored = [...player.自刻PVE阵纹, ...player.黑皇PVE阵纹]
    .find(item => item?.名称 === formationName && Number(item?.剩余次数) > 0);
  if (!stored) return { ok: false, reason: '没有可用的该阵纹' };
  player.当前PVE阵法 = formationName;
  delete player.PVE阵法停用;
  return { ok: true, name: formationName, remaining: stored.剩余次数 };
}

export function pauseBlackEmperorBattleFormation(player) {
  player.PVE阵法停用 = true;
  return true;
}
