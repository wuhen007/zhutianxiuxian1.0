/**
 * 花粉路 · 神术/异术技能树（圣墟原著）
 *
 * 获得途径：圣墟副本探索胜利概率参悟（副本数据 skills 池）。
 * 战斗生效：zd_battle 主循环触发（handleFlowerPollenSkills，见 model/xiuxian.js）。
 *
 * 技能谱系（原著考据）：
 *   - 大力牛魔拳：黄牛（金牛）所传拳法，楚风好友的标志技
 *   - 闪电拳 / 大日如来拳：少女曦所授；大日如来拳为残缺禁忌妙术
 *   - 终极拳：楚风自创（人人可学的大路货，但可随境界升华）
 *   - 火眼金睛 / 金色符文秘术：楚风招数；金色符文秘术"无物不破"
 *   - 七妙宝术·金木水火土阴阳：楚风压箱底绝学，需七道天地奇珍（对应七宝），
 *     七宝俱全 ≈ 仙王级宝术，无物不刷（类似叶凡五色神光）；动画版作"十一宝妙术"
 *   - 场域法·镇：楚风主修"以身立道、场域体系"的场域秘术
 *   - 不灭经：基础经文，被楚风化用于战斗
 *   - 寒霜覆地：斗篷秘术，可反弹伤害
 *   - 一身化七圣：化身妙术，一身分化七圣
 *   - 时间妙术：武疯子一脉秘术，与时光术同源
 *   - 时光术：圣墟十大顶级功法之一
 */

export const FLOWER_POLLEN_SKILLS = Object.freeze([
  // —— 地球篇 · 神术（低阶）——
  Object.freeze({ name: '大力牛魔拳', realm: 2, pr: 0.18, effect: 'attack', multiplier: 1.8, desc: '黄牛所传金牛拳法，蛮力破敌，同阶难挡' }),
  Object.freeze({ name: '终极拳', realm: 3, pr: 0.16, effect: 'attack', multiplier: 1.6, desc: '楚风自创拳法，人人可学，随境界升华' }),
  Object.freeze({ name: '闪电拳', realm: 4, pr: 0.16, effect: 'attack', multiplier: 1.5, desc: '少女曦所授神技，快如电光神霞' }),
  Object.freeze({ name: '火眼金睛', realm: 5, pr: 0.14, effect: 'attack', multiplier: 1.9, desc: '神目洞悉破绽，一击致命' }),
  Object.freeze({ name: '不灭经·护身', realm: 6, pr: 0.14, effect: 'heal', multiplier: 0.15, desc: '天地至高经文化用，肉身不灭，生机不绝' }),
  Object.freeze({ name: '大日如来拳', realm: 7, pr: 0.14, effect: 'attack', multiplier: 2.2, desc: '残缺禁忌妙术，完整版为阳间最强神技之一' }),
  // —— 星路篇 · 异术（中阶）——
  Object.freeze({ name: '寒霜覆地', realm: 8, pr: 0.13, effect: 'weaken', multiplier: 0.08, desc: '斗篷秘术，寒霜领域压制对手气机' }),
  Object.freeze({ name: '七妙宝术·土', realm: 9, pr: 0.14, effect: 'heal', multiplier: 0.12, desc: '七宝之一·土行，凝聚土墙护体，汲取大地生机' }),
  Object.freeze({ name: '七妙宝术·金', realm: 10, pr: 0.12, effect: 'attack', multiplier: 2.0, desc: '七宝之一·金行，庚金锋锐，无坚不摧' }),
  Object.freeze({ name: '七妙宝术·火', realm: 11, pr: 0.12, effect: 'attack', multiplier: 2.2, desc: '七宝之一·火行，离火燎原，焚尽诸敌' }),
  // —— 阳间篇 · 宝术（高阶）——
  Object.freeze({ name: '七妙宝术·水', realm: 12, pr: 0.12, effect: 'attack', multiplier: 2.2, desc: '七宝之一·水行，癸水滔天，蚀骨消魂' }),
  Object.freeze({ name: '场域法·镇', realm: 13, pr: 0.12, effect: 'weaken', multiplier: 0.12, desc: '以身立道、场域体系的镇封秘术，压敌战力' }),
  Object.freeze({ name: '七妙宝术·木', realm: 14, pr: 0.12, effect: 'attack', multiplier: 2.4, desc: '七宝之一·木行，乙木生发，困敌绞杀' }),
  Object.freeze({ name: '一身化七圣', realm: 15, pr: 0.1, effect: 'multi', multiplier: 0.7, hits: 3, desc: '化身妙术，一身分化七圣，群起攻之' }),
  // —— 诡异篇 · 禁忌（绝顶）——
  Object.freeze({ name: '七妙宝术·阴', realm: 16, pr: 0.1, effect: 'attack', multiplier: 2.6, desc: '七宝之一·阴行，太阴化育，吞噬生机' }),
  Object.freeze({ name: '金色符文秘术', realm: 17, pr: 0.08, effect: 'attack', multiplier: 2.6, desc: '金色符文流转，无物不破' }),
  Object.freeze({ name: '七妙宝术·阳', realm: 18, pr: 0.1, effect: 'attack', multiplier: 2.8, desc: '七宝之一·阳行，太阳神光，焚尽万法' }),
  Object.freeze({ name: '时间妙术', realm: 19, pr: 0.08, effect: 'time', multiplier: 2.8, desc: '武疯子一脉秘术，时光锁敌，定身斩魂' }),
  Object.freeze({ name: '时光术', realm: 20, pr: 0.08, effect: 'attack', multiplier: 3.0, desc: '触及时光之力，一念之间岁月成刃' }),
]);

const SEVEN_TREASURES = Object.freeze(['七妙宝术·土', '七妙宝术·金', '七妙宝术·火', '七妙宝术·水', '七妙宝术·木', '七妙宝术·阴', '七妙宝术·阳']);
// 七宝每多参悟一宝，攻击类七妙伤害 +15%，七宝圆满 +60%
const SEVEN_TREASURE_PER_BONUS = 0.15;
const SEVEN_TREASURE_FULL_BONUS = 0.6;

export function getFlowerPollenSkill(name) {
  return FLOWER_POLLEN_SKILLS.find(skill => skill.name === String(name || '').trim()) || null;
}

/** 已参悟的神术列表（学习功法中匹配神术表） */
export function getLearnedFlowerPollenSkills(player) {
  const learned = Array.isArray(player?.学习的功法) ? player.学习的功法 : [];
  if (!learned.length) return [];
  return FLOWER_POLLEN_SKILLS.filter(skill => learned.includes(skill.name));
}

/** 七妙宝术参悟进度（0-7） */
export function getSevenTreasureProgress(player) {
  const learned = Array.isArray(player?.学习的功法) ? player.学习的功法 : [];
  return SEVEN_TREASURES.filter(name => learned.includes(name)).length;
}

function formatNum(value) {
  const n = Math.max(0, Math.trunc(Number(value) || 0));
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}兆`;
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(2)}万`;
  return String(n);
}

/**
 * 战斗触发：已学神术按 pr 概率触发一个（每回合至多一个），七宝联动加成
 * @param {object} attacker 攻击方（含 学习的功法）
 * @param {object} defender 防守方
 * @param {string[]} msg 战斗消息数组
 * @param {function} random 随机源（默认 Math.random，可注入便于测试）
 */
export function handleFlowerPollenSkills(attacker, defender, msg, random = Math.random) {
  const learned = getLearnedFlowerPollenSkills(attacker);
  if (!learned.length) return false;
  const seven = getSevenTreasureProgress(attacker);
  for (const skill of learned) {
    if (Number(random()) >= skill.pr) continue;
    const sevenBonus = SEVEN_TREASURES.includes(skill.name)
      ? 1 + Math.min(SEVEN_TREASURE_FULL_BONUS, seven * SEVEN_TREASURE_PER_BONUS)
      : 1;
    applySkillEffect(attacker, defender, msg, skill, sevenBonus);
    return true;
  }
  return false;
}

function applySkillEffect(attacker, defender, msg, skill, sevenBonus) {
  if (skill.effect === 'heal') {
    const heal = Math.floor((attacker.攻击 || 0) * skill.multiplier);
    const maxHp = Number(attacker.血量上限) || Number(attacker.当前血量) || 1;
    attacker.当前血量 = Math.min(maxHp, (Number(attacker.当前血量) || 0) + heal);
    msg.push(`【${skill.name}】${attacker.名号}周身宝光流转，汲取生机，恢复${formatNum(heal)}点生命！`);
    return;
  }
  if (skill.effect === 'weaken') {
    // 场域支脉联动：场域境界越高，领域压制越强（每重天 +4%）
    const stage = Math.max(0, Math.min(9, Math.trunc(Number(attacker.场域境界) || 0)));
    const multiplier = (skill.multiplier || 0.1) * (1 + stage * 0.04);
    const reduced = Math.floor((defender.攻击 || 0) * multiplier);
    defender.攻击 = Math.max(0, (defender.攻击 || 0) - reduced);
    msg.push(`【${skill.name}】${attacker.名号}以场域镇压${defender.名号}（场域${stage}重天），其攻击降低${formatNum(reduced)}！`);
    return;
  }
  if (skill.effect === 'multi') {
    const hits = Math.max(2, Math.trunc(skill.hits || 2));
    let total = 0;
    for (let i = 0; i < hits; i++) {
      total += Math.floor((attacker.攻击 || 0) * (skill.multiplier || 0.5) * sevenBonus);
    }
    defender.当前血量 = Math.max(0, (Number(defender.当前血量) || 0) - total);
    const bonusText = sevenBonus > 1 ? `（七妙加成×${sevenBonus.toFixed(2)}）` : '';
    msg.push(`【${skill.name}】${attacker.名号}化身${hits}道神影轮番轰击，对${defender.名号}共造成${formatNum(total)}点伤害${bonusText}！`);
    return;
  }
  if (skill.effect === 'time') {
    const dmg = Math.floor((attacker.攻击 || 0) * (skill.multiplier || 2.5) * sevenBonus);
    defender.当前血量 = Math.max(0, (Number(defender.当前血量) || 0) - dmg);
    defender.dongjie = true; // 时光锁敌，下一击无法行动
    msg.push(`【${skill.name}】时光之力禁锢${defender.名号}，造成${formatNum(dmg)}点伤害并定身一瞬！`);
    return;
  }
  // attack：直接造成伤害（扣除防守方当前血量）
  const dmg = Math.floor((attacker.攻击 || 0) * skill.multiplier * sevenBonus);
  defender.当前血量 = Math.max(0, (Number(defender.当前血量) || 0) - dmg);
  const bonusText = sevenBonus > 1 ? `（七妙加成×${sevenBonus.toFixed(2)}）` : '';
  msg.push(`【${skill.name}】${attacker.名号}施展神术，对${defender.名号}造成${formatNum(dmg)}点伤害${bonusText}！`);
}

/** 副本探索胜利掉落判定：从副本技能池按概率 roll 出一个神术 */
export function rollFlowerPollenSkill(dungeon, random = Math.random) {
  const pool = Array.isArray(dungeon?.skills) ? dungeon.skills : [];
  for (const entry of pool) {
    if (Number(random()) < (entry.chance || 0)) return entry.name;
  }
  return '';
}
