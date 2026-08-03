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
    type: 'battle',
    description: '下次副本遮蔽天机，使敌方攻击降低30%、暴击率降低15%',
  },
  {
    name: '山河困龙阵',
    favor: 100,
    cost: 30_000_000,
    type: 'battle',
    description: '下次副本封锁山河，使敌方防御降低45%、攻击降低15%',
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
    description: '下次副本引动帝阵一角，攻击翻倍、暴击率提高20%',
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

function recordEvent(character, event) {
  if (!Array.isArray(character.事件记录)) character.事件记录 = [];
  character.事件记录.push(event);
  if (character.事件记录.length > 20) character.事件记录.splice(0, character.事件记录.length - 20);
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

export function consumeBlackEmperorBattleFormation(player, attacker, defender) {
  const name = player?.黑皇待用阵纹;
  if (!name || !attacker || !defender) return { consumed: false, name: null, message: '' };

  if (name === '欺天阵纹') {
    defender.攻击 = Math.max(1, Math.floor((Number(defender.攻击) || 0) * 0.7));
    defender.暴击率 = Math.max(0, Number(((Number(defender.暴击率) || 0) - 0.15).toFixed(4)));
  } else if (name === '山河困龙阵') {
    defender.攻击 = Math.max(1, Math.floor((Number(defender.攻击) || 0) * 0.85));
    defender.防御 = Math.max(0, Math.floor((Number(defender.防御) || 0) * 0.55));
  } else if (name === '无始杀阵') {
    attacker.攻击 = Math.max(1, Math.floor((Number(attacker.攻击) || 0) * 2));
    attacker.暴击率 = Math.min(1, Number(((Number(attacker.暴击率) || 0) + 0.2).toFixed(4)));
  } else {
    return { consumed: false, name, message: '' };
  }

  delete player.黑皇待用阵纹;
  const character = getBlackEmperorData(player);
  if (character) recordEvent(character, `副本激活${name}`);
  return {
    consumed: true,
    name,
    message: ` 黑皇预先刻下的「${name}」骤然复苏，阵纹覆盖战场！`,
  };
}
