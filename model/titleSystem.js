/**
 * 称号系统
 * --------
 * 玩家拥有「称号列表」（字符串数组），可自由查看、佩戴/更换。
 * 当前佩戴称号存于 player.当前称号；佩戴的称号可提供全局或玩法内加成。
 * 无尽劫境天尊：打穿第30关且全服排名第一的队伍成员专属称号。
 *   无尽劫境内全属性+25%、劫境道痕收益+25%。
 */
export const TITLE_LIST_FIELD = '称号列表';
export const TITLE_EQUIPPED_FIELD = '当前称号';

export const TITLES = Object.freeze({
  '无尽劫境天尊': Object.freeze({
    id: '无尽劫境天尊',
    name: '无尽劫境天尊',
    rarity: 'legendary',
    source: '无尽劫境',
    desc: '打穿第三十关且关卡排名全服第一的无尽劫境至尊。佩戴后在无尽劫境内全属性+25%、劫境道痕收益+25%。',
    effects: Object.freeze({
      endlessAllAttrPct: 0.25,
      endlessTokenPct: 0.25,
    }),
  }),
});

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getTitleById(titleId) {
  return TITLES[titleId] || null;
}

/** 归一化玩家称号列表（懒初始化） */
export function normalizeTitles(player) {
  if (!player) return [];
  if (!Array.isArray(player[TITLE_LIST_FIELD])) player[TITLE_LIST_FIELD] = [];
  const unique = [];
  for (const title of player[TITLE_LIST_FIELD]) {
    if (typeof title === 'string' && TITLES[title] && !unique.includes(title))
      unique.push(title);
  }
  return unique;
}

/** 发放称号；已拥有返回 false */
export function grantTitle(player, titleId) {
  const title = TITLES[titleId];
  if (!title) return false;
  const list = normalizeTitles(player);
  if (list.includes(titleId)) return false;
  list.push(titleId);
  player[TITLE_LIST_FIELD] = list;
  return true;
}

/** 当前佩戴的称号（校验存在性，未佩戴返回 null） */
export function getEquippedTitle(player) {
  const equipped = player?.[TITLE_EQUIPPED_FIELD];
  if (!equipped) return null;
  const list = normalizeTitles(player);
  return list.includes(equipped) ? TITLES[equipped] : null;
}

/** 佩戴/更换称号；未拥有返回 false */
export function equipTitle(player, titleId) {
  const title = TITLES[titleId];
  if (!title) return false;
  const list = normalizeTitles(player);
  if (!list.includes(titleId)) return false;
  player[TITLE_EQUIPPED_FIELD] = titleId;
  return true;
}

export function unequipTitle(player) {
  delete player[TITLE_EQUIPPED_FIELD];
}

/** 当前称号在无尽劫境内的加成 */
export function getTitleEffects(player) {
  const title = getEquippedTitle(player);
  const effects = title?.effects || {};
  return {
    attrPct: asNumber(effects.endlessAllAttrPct),
    tokenPct: asNumber(effects.endlessTokenPct),
  };
}

/** 玩家面板数据：称号列表 + 当前佩戴 */
export function getTitleViews(player) {
  const list = normalizeTitles(player);
  const equipped = player?.[TITLE_EQUIPPED_FIELD] || null;
  return {
    equipped,
    equippedTitle: getEquippedTitle(player),
    list: list.map((titleId) => {
      const title = TITLES[titleId];
      return {
        id: titleId,
        name: title.name,
        rarity: title.rarity,
        source: title.source,
        desc: title.desc,
        equipped: titleId === equipped,
      };
    }),
  };
}
