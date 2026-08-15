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
export const FIELD_WEAKEN_BONUS_PER_STAGE = 0.004; // 每重天强化场域法·镇压制 0.4%

export function ensureFlowerFieldState(player) {
  if (!player || typeof player !== 'object') return player;
  player.场域境界 = Math.max(0, Math.min(FIELD_MAX_STAGE, Math.trunc(Number(player.场域境界) || 0)));
  player.场域残图 = Math.max(0, Math.trunc(Number(player.场域残图) || 0));
  return player;
}

/** 场域画像：境界/三维加成/场域法·镇强化 */
export function getFlowerFieldProfile(player) {
  ensureFlowerFieldState(player);
  const stage = player.场域境界;
  const attrBonus = stage * FIELD_ATTR_BONUS_PER_STAGE;
  const weakenBonus = stage * FIELD_WEAKEN_BONUS_PER_STAGE;
  return {
    stage,
    maxStage: FIELD_MAX_STAGE,
    attrBonus,
    weakenBonus,
    pages: player.场域残图,
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
  return { ok: true, stage: player.场域境界, remaining: player.场域残图 };
}
