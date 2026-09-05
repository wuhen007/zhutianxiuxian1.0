import { getRealmAuthorityLevel } from './realmAuthority.js';
import { getLearnedGongfaNames, scaleDaoBodyStats } from './gongfaProficiency.js';

const REALM_NAMES = {
  20: '准仙帝',
  21: '仙帝',
  22: '祭道',
  23: '祭道之上',
  24: '唯一道之上',
};
const SEALED_ARTS = new Set(['一气化三清', '皆字秘', '临字秘']);
const REALM_VISIONS = {
  20: '帝光初生，诸界的喧嚣一寸寸沉寂。那道身影尚未抬手，横贯古今的长河已在其脚下低伏。',
  21: '路尽之处，一道眸光落下。诸天的日月仍在轮转，此间的岁月却已凝成了一张薄纸。',
  22: '大道燃尽，余烬无声。那人立在法则消逝的地方，连亘古不灭的秩序，也只是一缕将熄的烟。',
  23: '没有帝光，也没有道鸣。那道身影立在那里，过去与未来便失去了距离，诸世因果尽归寂静。',
};

export function getHighRealmBarrier(attacker, defender) {
  const attackerLevel = getRealmAuthorityLevel(attacker);
  const defenderLevel = getRealmAuthorityLevel(defender);
  // 缺失额外体系境界的目标保持原规则，不以基础等级或名字推断道果。
  if (!attackerLevel || !defenderLevel || attackerLevel === defenderLevel
    || Math.max(attackerLevel, defenderLevel) < 20) return null;
  return { attackerLevel, defenderLevel, higherSide: attackerLevel > defenderLevel ? 'A' : 'B' };
}

export function suppressHighRealmCombatant(unit) {
  if (unit._高境界压制) return;
  const criticalDamage = Number(unit.暴击伤害);
  unit._高境界压制前速度 = Number(unit.速度 ?? 100) || 100;
  scaleDaoBodyStats(unit, 0.1);
  // 暴击伤害也按完整属性压制，而非仅压制其超出基础倍率的部分。
  if (Number.isFinite(criticalDamage)) unit.暴击伤害 = criticalDamage * 0.1;
  for (const field of [
    '护盾值', '_护盾值', '减伤比例', '_减伤比例', '反弹比例', '_反弹比例',
    '生命本源', '灵力', '灵力上限', '_speed',
  ]) {
    if (Number.isFinite(Number(unit[field]))) unit[field] *= 0.1;
  }
  unit._高境界压制 = true;
  unit.学习的功法 = getLearnedGongfaNames(unit).filter(name => !SEALED_ARTS.has(name));
  unit.皆字秘触发 = false;
  for (const field of ['皆字秘剩余', '_皆字秘倍率', '_临字秘加成倍率', '_临字秘压制比例']) {
    delete unit[field];
  }
  unit.分身 = [];
}

/**
 * 境界差是先于行动条、技能、反伤与复活的战斗规则，而非可净化的负面效果。
 * 仅改动战斗副本；先由最高道果裁决，已被镇杀者不再释放开场技能。
 */
export function prepareHighRealmBattle(A_input, B_input) {
  const sources = [
    Array.isArray(A_input) ? A_input : [A_input],
    Array.isArray(B_input) ? B_input : [B_input],
  ];
  const clashes = [];
  sources[0].forEach((a, ai) => sources[1].forEach((b, bi) => {
    if (!(a?.当前血量 > 0) || !(b?.当前血量 > 0)) return;
    const rule = getHighRealmBarrier(a, b);
    if (!rule) return;
    const side = rule.higherSide === 'A' ? 0 : 1;
    clashes.push({
      side,
      high: side === 0 ? ai : bi,
      low: side === 0 ? bi : ai,
      level: Math.max(rule.attackerLevel, rule.defenderLevel),
    });
  }));
  if (!clashes.length) return null;

  const teams = sources.map(team => team.map(unit => JSON.parse(JSON.stringify(unit))));
  const msg = [];
  clashes.sort((a, b) => b.level - a.level);
  for (const clash of clashes) {
    const higher = teams[clash.side][clash.high];
    const lower = teams[1 - clash.side][clash.low];
    if (!(higher.当前血量 > 0) || !(lower.当前血量 > 0)) continue;
    const highName = higher.名号 || '高境修士';
    const lowName = lower.名号 || '低境修士';
    const realmName = REALM_NAMES[clash.level] || '超脱道果';
    suppressHighRealmCombatant(lower);
    lower._高境界镇杀 = true;
    lower.不可复活 = true;
    lower.已死亡 = true;
    lower.当前血量 = 0;
    msg.push(
      `【${realmName}·境界天堑】${REALM_VISIONS[Math.min(clash.level, 23)]}`,
      `${highName}的道果横隔在前，${lowName}全战斗属性降低90%；一气化三清、皆字秘、临字秘与全部灵根技能失效。`,
      `那不是力量的多寡，而是天地相隔。纵有倾覆诸世的战力，${lowName}的攻伐也触及不到更高一层的真实。`,
      `${highName}只将目光垂落，${lowName}的护身诸法便连同复生之机一并沉寂。此战已定，低境者气血归零。`,
    );
  }
  const aliveIndices = teams.map(team => team.flatMap((unit, index) => unit.当前血量 > 0 ? [index] : []));
  return {
    sources,
    teams,
    msg,
    aliveIndices,
    survivors: aliveIndices.map((indices, side) => indices.map(index => sources[side][index])),
    ended: aliveIndices.some(indices => indices.length === 0),
  };
}

// 团本保留原队伍顺序与开战前血量，供外层正确回写每位玩家的伤势。
export function mergeHighRealmRaidResult(opening, continued = null) {
  const [players, bosses] = opening.teams;
  const playerChanges = new Map(opening.aliveIndices[0].map((index, position) => [
    index, continued?.players_hp_change?.[position] || 0,
  ]));
  return {
    ...continued,
    msg: [...opening.msg, ...(continued?.msg || [])],
    players_hp_change: players.map((unit, index) => unit._高境界镇杀
      ? -Number(opening.sources[0][index].当前血量)
      : (playerChanges.get(index) || 0)),
    boss_hp_change: bosses[0]._高境界镇杀
      ? -Number(opening.sources[1][0].当前血量)
      : (continued?.boss_hp_change || 0),
    result: continued?.result || (bosses[0].当前血量 <= 0 ? '玩家胜利' : 'BOSS胜利'),
    proficiencyGains: continued?.proficiencyGains || {},
  };
}
