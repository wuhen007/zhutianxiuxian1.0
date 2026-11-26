/**
 * 花粉路 · 场域支脉（战力增幅系统）
 *
 * 原著依据：楚风主修"以身立道、场域体系"，场域造诣独步天下，以场域控规则。
 * 设计：场域 = 花粉进化路的支脉战力，独立成长线（一重天 → 九重天）。
 *   - 来源：星路/阳间/魂河副本探索胜利必得 1 张「场域残图」
 *   - 成长：集 5 张残图 #参悟场域 升一重天（上限九重天）
 *   - 效果：每重天 = 花粉境界基础三维 +3%（九重天 +27%）
 *   - 联动：场域境界越高，「场域法·镇」领域压制越强（见 flowerPollenSkill.js）
 */

export const FIELD_MAX_STAGE = 9;
export const FIELD_PAGE_REQUIRE = 5;
export const FIELD_ATTR_BONUS_PER_STAGE = 0.03; // 每重天 +3% 花粉基础三维
export const FIELD_WEAKEN_BONUS_PER_STAGE = 0.04; // 每重天强化场域法·镇压制 +4%（九重天 ×1.36）
export const FIELD_DUNGEON_SUPPRESSION_PER_STAGE = 0.02; // 场域破禁：每重天削弱圣墟秘境守卫属性 2%（九重天 -18%）
export const FIELD_FRUIT_BONUS_PER_STAGE = 0.015; // 寻龙探穴：每重天提升圣墟秘境异果掉率 +1.5%（九重天 +13.5%）
export const FIELD_EARTH_FAMOUS_DROP_CHANCE = 0.35; // 地球篇场域重地（昆仑/终南/泰山/顺天）掉残图概率

/** 原著《圣墟》场域九重天名号与代表大阵 */
export const FIELD_STAGE_TITLES = Object.freeze({
  0: Object.freeze({ title: '未入场域', formation: '未布阵', desc: '尚未参透《场域天书》磁石纹路' }),
  1: Object.freeze({ title: '场域学徒', formation: '磁石锁灵阵', desc: '初窥磁石刻纹，可借山川地气护身' }),
  2: Object.freeze({ title: '场域宗师', formation: '八卦火炉场域', desc: '以场域引地火熬炼强敌，可破名山外围禁制' }),
  3: Object.freeze({ title: '场域大宗师', formation: '太上八卦炉场域', desc: '接引天雷地火化炉，寻龙探穴摘取名山异果' }),
  4: Object.freeze({ title: '场域名宿', formation: '天罗伞盖杀场', desc: '翻手布下绝世杀场，困杀高一阶进化者' }),
  5: Object.freeze({ title: '场域圣师', formation: '万星朝宗场域', desc: '沟通域外星斗之力，封山锁界万邪辟易' }),
  6: Object.freeze({ title: '场域神师', formation: '轮回锁魂场域', desc: '触及阴间轮回秩序，镇封神王级生灵血气' }),
  7: Object.freeze({ title: '场域天尊', formation: '阴阳生死大磨盘', desc: '以大天地山河为棋盘，磨灭天尊法则' }),
  8: Object.freeze({ title: '场域大天尊', formation: '诸天星斗杀阵', desc: '一念成阵，借诸天大道纹络镇压万古' }),
  9: Object.freeze({ title: '以身立道·场域仙王', formation: '己身即场域·万道归墟', desc: '摆脱磁石阵旗束缚，举手投足皆是无上场域规则' }),
});

export function getFlowerFieldStageTitle(stage = 0) {
  const s = Math.max(0, Math.min(FIELD_MAX_STAGE, Math.trunc(Number(stage) || 0)));
  return FIELD_STAGE_TITLES[s] || FIELD_STAGE_TITLES[0];
}

export function ensureFlowerFieldState(player) {
  if (!player || typeof player !== 'object') return player;
  player.场域境界 = Math.max(0, Math.min(FIELD_MAX_STAGE, Math.trunc(Number(player.场域境界) || 0)));
  player.场域残图 = Math.max(0, Math.trunc(Number(player.场域残图) || 0));
  return player;
}

/** 场域画像：境界/尊号/代表杀阵/三维加成/场域法·镇强化/秘境破禁与探穴加成 */
export function getFlowerFieldProfile(player) {
  ensureFlowerFieldState(player);
  const stage = player?.场域境界 || 0;
  const attrBonus = stage * FIELD_ATTR_BONUS_PER_STAGE;
  const weakenBonus = stage * FIELD_WEAKEN_BONUS_PER_STAGE;
  const dungeonSuppression = stage * FIELD_DUNGEON_SUPPRESSION_PER_STAGE;
  const fruitBonus = stage * FIELD_FRUIT_BONUS_PER_STAGE;
  const meta = getFlowerFieldStageTitle(stage);
  return {
    stage,
    maxStage: FIELD_MAX_STAGE,
    title: meta.title,
    formation: meta.formation,
    desc: meta.desc,
    attrBonus,
    weakenBonus,
    dungeonSuppression,
    fruitBonus,
    pages: player?.场域残图 || 0,
    pageRequire: FIELD_PAGE_REQUIRE,
  };
}

/** 场域三维加成（基于花粉境界基础属性） */
export function calculateFlowerFieldBonus(player, realm = {}) {
  const { attrBonus } = getFlowerFieldProfile(player);
  return {
    攻击: Math.trunc(Number(realm?.基础攻击 || 0) * attrBonus),
    防御: Math.trunc(Number(realm?.基础防御 || 0) * attrBonus),
    血量: Math.trunc(Number(realm?.基础血量 || 0) * attrBonus),
    rate: attrBonus,
  };
}

/** 拾取场域残图；达到升级所需张数时提示可参悟 */
export function collectFlowerFieldPage(player, amount = 1) {
  ensureFlowerFieldState(player);
  const gained = Math.max(1, Math.trunc(Number(amount) || 1));
  player.场域残图 += gained;
  const { stage, pageRequire } = getFlowerFieldProfile(player);
  const canAdvance = stage < FIELD_MAX_STAGE && player.场域残图 >= pageRequire;
  return { ok: true, gained, pages: player.场域残图, canAdvance, stage, pageRequire };
}

/** 参悟场域：消耗 5 张残图升一重天 */
export function advanceFlowerField(player) {
  ensureFlowerFieldState(player);
  const { stage, pages, pageRequire } = getFlowerFieldProfile(player);
  if (stage >= FIELD_MAX_STAGE) {
    return { ok: false, reason: 'max', stage };
  }
  if (pages < pageRequire) {
    return { ok: false, reason: 'insufficient', pages, need: pageRequire, stage };
  }
  player.场域残图 -= pageRequire;
  player.场域境界 = stage + 1;
  const meta = getFlowerFieldStageTitle(player.场域境界);
  return {
    ok: true,
    stage: player.场域境界,
    remaining: player.场域残图,
    title: meta.title,
    formation: meta.formation,
    desc: meta.desc,
  };
}
