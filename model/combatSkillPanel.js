import {
  getDefenseSkillMultiplier,
  getGongfaCombatMultiplier,
  getGongfaProficiencyProfile,
  getGongfaTriggerChance,
  getJieziDurationRounds,
  getJieziExhaustionRounds,
  getLearnedGongfaNames,
  getMijueTriggerChance,
  getNumberSecretConfig,
  getNumberSecretTriggerChance,
  getReviveRecoveryRatio,
  getVitalityRecoveryRate,
  getYiqihuaConfig,
  getYiqihuaTriggerChance,
  getZheziReviveConfig,
} from './gongfaProficiency.js';
import {
  ATTACK_SKILL_LIMIT,
  DEFENSE_SKILL_LIMIT,
  ensureCombatSkillLoadout,
  getCombatSkillOptions,
} from './combatSkillLoadout.js';
import { getSuiyunStage, hasSuiyunSkills } from './suiyun.js';
import { SUIYUN_COMBAT, SUIYUN_TIANJIAO_PROGRESS } from './suiyunCombat.js';

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
      (skill?.熟练度归属 || skill?.name) === name
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
    summary: `${equipped.size} / ${definition.limit}`,
    items,
  };
}

function buildSpecialSection(player) {
  const learned = new Set(getLearnedGongfaNames(player));
  const names = ['数字秘', '一气化三清', '皆字秘', '临字秘', '组字秘'].filter(name => learned.has(name));
  const items = names.map((name, index) => {
    const profile = getGongfaProficiencyProfile(player, name);
    let trigger;
    if (name === '数字秘') {
      const config = getNumberSecretConfig(player);
      trigger = {
        when: '行动后判定（每局成功1次）',
        chance: percent(getNumberSecretTriggerChance(player), 2),
        effect: `化出${config.count}道道身 · 全属性含速度${percent(config.ratio)} · 存续${config.duration}回合${config.combo ? ' · 已与一气化三清共鸣' : ''}`,
        multiplier: `道身 ${multiplier(config.ratio)}`,
      };
    } else if (name === '一气化三清') {
      const config = getYiqihuaConfig(player);
      const duration = config.duration < 0 ? '永驻，直至被击杀' : `存续${config.duration}回合`;
      trigger = {
        when: '行动后判定（每局成功1次）',
        chance: percent(getYiqihuaTriggerChance(player, () => 1), 2),
        effect: `化出${config.count}道道身 · 全属性${percent(config.ratio)} · ${duration}`,
        multiplier: `道身 ${multiplier(config.ratio)}`,
      };
    } else if (name === '皆字秘') {
      const duration = getJieziDurationRounds(player);
      const exhaustion = getJieziExhaustionRounds(player);
      trigger = {
        when: '攻击行动时自动判定',
        chance: percent(getMijueTriggerChance(player, name, () => 1), 2),
        effect: exhaustion > 0
          ? `攻击、防御提升至10倍，持续${duration}回合；结束后力竭${exhaustion}回合（攻防-30%）`
          : `攻击、防御提升至10倍，持续${duration}回合；结束后无力竭`,
        multiplier: '攻防 x10.00',
      };
    } else if (name === '组字秘') {
      trigger = {
        when: 'PVE战斗阵法激活时',
        chance: '100%',
        effect: '阵法数值额外增强15%；山河困龙阵进一步削弱敌方攻防，无始杀阵同步增强杀伐加持',
        multiplier: '阵威 +15%',
      };
    } else {
      const realm = profile.index >= 5 ? '必定神禁' : profile.index >= 3 ? '最低四禁' : '随机一至神禁';
      trigger = {
        when: '攻击行动时自动判定（每局成功1次）',
        chance: percent(getMijueTriggerChance(player, name, () => 1), 2),
        effect: `${realm}；一至六禁1回合，七至八禁2回合，神禁3回合`,
        multiplier: '领域 x1.00 - x9.00',
      };
    }
    return {
      index: index + 1,
      name,
      equipped: true,
      automatic: true,
      stage: profile.name,
      proficiency: profile.exp,
      progress: Math.max(0, Math.min(100, profile.exp / 10)),
      triggerBoost: multiplier(profile.trigger),
      combatBoost: '专属规则',
      effectBoost: '档位成长',
      moveProgress: '',
      triggers: [trigger],
    };
  });
  if (hasSuiyunSkills(player)) {
    const inherited = !getSuiyunStage(player);
    const sourceLabel = inherited ? '月华赐予' : '灵根自带';
    const skills = [
      {
        name: '霜剑入月',
        when: '攻击行动时',
        effect: `最多${SUIYUN_COMBAT.targets}名敌人，每目标${SUIYUN_COMBAT.hits}击，不衰减、不可防御；绝对控制${SUIYUN_COMBAT.controlTurns}次行动，推条${SUIYUN_COMBAT.pushback}（每次施展一次）；霜寒每全局回合使当前生命、攻击、防御和速度降低${percent(SUIYUN_COMBAT.frostRatio)}，不降低生命上限；生命低于${percent(SUIYUN_COMBAT.executionThreshold)}直接斩杀并禁止复活`,
        multiplier: `每击 ${multiplier(SUIYUN_COMBAT.multiplier)}`,
      },
      {
        name: '岁云归一',
        when: '承受攻击时',
        effect: `减伤${percent(SUIYUN_COMBAT.defenseReduction)}，反弹实际承伤的${percent(SUIYUN_COMBAT.reflectionRatio)}；反伤不连锁`,
        multiplier: `承伤 ${multiplier(1 - SUIYUN_COMBAT.defenseReduction)}`,
      },
      {
        name: '白云苍狗',
        when: `生命归零时（每战最多${SUIYUN_COMBAT.revives}次）`,
        effect: '每次复活攻击、防御、生命上限和速度各乘1.5；三次累计复活增幅×3.375，不改变其他资源与永久属性',
        multiplier: `每次 ${multiplier(SUIYUN_COMBAT.reviveMultiplier)}`,
      },
      ...(getSuiyunStage(player) ? [{
        name: '岁云常青', when: '受到即死、禁复活或禁疗时',
        effect: `常驻基础速度+${SUIYUN_COMBAT.evergreenSpeed}；免疫即死裁决、禁止复活与禁疗；悟道、推演己道不消耗寿元，自然流逝照常；普通伤害仍结算，白云苍狗仍每战最多三次；讨伐天骄时与诛仙四剑被动同级，单次至多斩落${SUIYUN_TIANJIAO_PROGRESS.win}%气血（两者并存不叠加，亦不继承降仇恨与畏惧）`,
        multiplier: '常驻免疫',
      }] : []),
    ];
    for (const skill of skills) items.push({
      index: items.length + 1, name: skill.name,
      equipped: true, automatic: true, innate: true,
      sourceLabel,
      stage: inherited ? `月华传承 · 第${player.月华传承.名额}位受赐者` : '岁云五阶段共有 · 灵根自带', proficiency: 0, progress: 0,
      triggerBoost: '自动', combatBoost: '固定规则', effectBoost: '无需修炼', moveProgress: '',
      triggers: [{ when: skill.when, chance: '100%', effect: skill.effect, multiplier: skill.multiplier }],
    });
  }
  return {
    key: 'special',
    label: '特殊秘法',
    note: '无需占用技能槽，功法掌握、灵根自带或月华赐予后自动参与战斗',
    limit: 3,
    equippedCount: items.length,
    summary: `${items.length} 门`,
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
    sections: [
      ...definitions.map(definition => buildSection(player, pools, loadout, definition)),
      buildSpecialSection(player),
    ],
  };
}
