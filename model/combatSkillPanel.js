import {
  getDefenseSkillMultiplier,
  getGongfaCombatMultiplier,
  getGongfaProficiencyProfile,
  getGongfaTriggerChance,
  getReviveRecoveryRatio,
  getVitalityRecoveryRate,
  getZheziReviveConfig,
} from './gongfaProficiency.js';
import {
  ATTACK_SKILL_LIMIT,
  DEFENSE_SKILL_LIMIT,
  ensureCombatSkillLoadout,
  getCombatSkillOptions,
} from './combatSkillLoadout.js';

function percent(value, digits = 0) {
  return `${(Math.max(0, Number(value) || 0) * 100).toFixed(digits)}%`;
}

function multiplier(value) {
  const number = Number(value);
  return `x${Number.isFinite(number) ? number.toFixed(2) : '1.00'}`;
}

function skillChance(player, skill) {
  return percent(getGongfaTriggerChance(player, skill, skill?.pr, () => 1), 2);
}

function roundTiming(skill, suffix) {
  const round = Number(skill?.cnt);
  return round === -1 || !Number.isFinite(round)
    ? suffix
    : `第${Math.max(0, Math.trunc(round)) + 1}轮${suffix}`;
}

function attackEffects(skill) {
  const effects = [];
  if (skill.攻击类型) effects.push(`${skill.攻击类型}伤害`);
  if (Number(skill.other)) effects.push(`固定伤害+${skill.other}`);
  if (skill.不可防御) effects.push('不可防御');
  if (skill.不可复活) effects.push('禁止复活');
  if (skill.无视减伤) effects.push('无视减伤');
  if (skill.控制) effects.push('控制目标');
  if (skill.群攻) effects.push(`群攻${skill.群攻}目标（${percent(skill.群攻比例 ?? 1)}伤害）`);
  if (skill.斩杀阈值) effects.push(`生命低于${percent(skill.斩杀阈值)}斩杀`);
  if (skill.拉条) effects.push(`自身行动条+${skill.拉条}`);
  if (skill.推条) effects.push(`敌方行动条-${skill.推条}`);
  if (skill.速度加成) effects.push(`速度+${percent(skill.速度加成)}`);
  if (skill.负面效果) effects.push(`${skill.负面类型 || '负面效果'}${skill.负面回合 || 0}回合`);
  return effects.join(' · ') || '强化本次攻击';
}

function defenseEffects(player, skill) {
  const effects = [`承伤倍率${multiplier(getDefenseSkillMultiplier(player, skill))}`];
  if (Number(skill.other)) effects.push(`结算修正${Number(skill.other) > 0 ? '+' : ''}${skill.other}`);
  if (skill.反弹伤害) effects.push(`反弹${percent(skill.反弹伤害)}伤害`);
  if (skill.负面转移) effects.push('转移负面效果');
  if (skill.本源吞噬) effects.push('吞噬攻击本源');
  if (skill.护盾值) effects.push(`生成${percent(skill.护盾值)}最大生命护盾`);
  if (skill.持续减伤) effects.push(`${skill.持续减伤回合 || 1}回合减伤${percent(skill.持续减伤)}`);
  return effects.join(' · ');
}

function reviveEffects(player, skill) {
  if (skill.name === '者字秘') {
    const config = getZheziReviveConfig(player);
    return config.maxRevives > 1
      ? '每局复生2次：首次满血，第二次燃烧精气神恢复55%最大生命'
      : '每局复生1次，恢复100%最大生命';
  }
  const effects = [`恢复${percent(getReviveRecoveryRatio(player, skill))}最大生命`];
  if (skill.免控) effects.push(`免控${Math.round(skill.免控)}回合`);
  if (skill.攻击加成) effects.push(`攻击+${percent(skill.攻击加成)}`);
  if (skill.防御加成) effects.push(`防御+${percent(skill.防御加成)}`);
  if (skill.生命加成) effects.push(`生命上限+${percent(skill.生命加成)}`);
  return effects.join(' · ');
}

function unlockedMoves(profile, skill) {
  if (!Array.isArray(skill?.招式)) return [];
  return skill.招式.filter(move => profile.exp >= Math.max(0, Number(move.最低熟练度) || 0));
}

function buildTriggerRows(player, type, profile, skills) {
  const rows = [];
  for (const skill of skills) {
    if (type === '攻击') {
      const moves = unlockedMoves(profile, skill);
      const moveMultipliers = moves.map(move => multiplier(move.beilv ?? skill.beilv));
      rows.push({
        when: roundTiming(skill, '攻击行动时'),
        chance: skillChance(player, skill),
        effect: moves.length
          ? `随机施展已参悟的${moves.length}式 · ${attackEffects(skill)}`
          : attackEffects(skill),
        multiplier: moves.length
          ? `招式 ${[...new Set(moveMultipliers)].join(' / ')}`
          : `技能 ${multiplier(skill.beilv)}`,
      });
    } else if (type === '防御') {
      rows.push({
        when: roundTiming(skill, '受击时'),
        chance: skillChance(player, skill),
        effect: defenseEffects(player, skill),
        multiplier: `承伤 ${multiplier(getDefenseSkillMultiplier(player, skill))}`,
      });
    } else if (skill.技能分类 === '治疗' || skill.触发时机) {
      const rate = getVitalityRecoveryRate(player, skill.name);
      rows.push({
        when: `${skill.触发时机 || '行动前'}（存活且未满血）`,
        chance: skillChance(player, skill),
        effect: `恢复${percent(rate)}最大生命`,
        multiplier: `恢复 ${multiplier(rate)}`,
      });
    } else if (skill.复活技能) {
      rows.push({
        when: '生命归零时',
        chance: skillChance(player, skill),
        effect: reviveEffects(player, skill),
        multiplier: skill.name === '者字秘'
          ? '复生 x1.00 / x0.55'
          : `复生 ${multiplier(getReviveRecoveryRatio(player, skill))}`,
      });
    }
  }
  return rows;
}

function buildSection(player, pools, loadout, definition) {
  const names = getCombatSkillOptions(player, definition.type, pools);
  const allSkills = definition.type === '攻击'
    ? pools.attack
    : definition.type === '防御'
      ? pools.defense
      : [...(pools.healing || []), ...(pools.revival || [])];
  const equipped = definition.type === '生机'
    ? new Set(loadout.生机 ? [loadout.生机] : [])
    : new Set(loadout[definition.type] || []);
  const items = names.map((name, index) => {
    const skills = (allSkills || []).filter(skill =>
      skill?.class === '功法' && (skill.熟练度归属 || skill.name) === name
    );
    const profile = getGongfaProficiencyProfile(player, name);
    const moveSkill = skills.find(skill => Array.isArray(skill.招式));
    const moves = unlockedMoves(profile, moveSkill);
    return {
      index: index + 1,
      name,
      equipped: equipped.has(name),
      stage: profile.name,
      proficiency: profile.exp,
      progress: Math.max(0, Math.min(100, profile.exp / 10)),
      triggerBoost: multiplier(profile.trigger),
      combatBoost: multiplier(getGongfaCombatMultiplier(player, skills[0])),
      effectBoost: multiplier(profile.numeric),
      moveProgress: moveSkill ? `${moves.length}/${moveSkill.招式.length}式` : '',
      triggers: buildTriggerRows(player, definition.type, profile, skills),
    };
  });
  return {
    key: definition.key,
    label: definition.label,
    note: definition.note,
    limit: definition.limit,
    equippedCount: equipped.size,
    items,
  };
}

export function buildCombatSkillPanel(player, pools = {}) {
  const loadout = ensureCombatSkillLoadout(player, pools);
  const definitions = [
    { key: 'attack', type: '攻击', label: '攻击术式', limit: ATTACK_SKILL_LIMIT, note: '主动出手时判定' },
    { key: 'defense', type: '防御', label: '护道法门', limit: DEFENSE_SKILL_LIMIT, note: '承受攻击时判定' },
    { key: 'vitality', type: '生机', label: '生机秘法', limit: 1, note: '恢复与复活共用一槽' },
  ];
  return {
    playerName: player?.名号 || '无名修士',
    insight: Math.max(0, Math.floor(Number(player?.功法感悟值) || 0)),
    totalEquipped: loadout.攻击.length + loadout.防御.length + (loadout.生机 ? 1 : 0),
    totalLimit: ATTACK_SKILL_LIMIT + DEFENSE_SKILL_LIMIT + 1,
    sections: definitions.map(definition => buildSection(player, pools, loadout, definition)),
  };
}
