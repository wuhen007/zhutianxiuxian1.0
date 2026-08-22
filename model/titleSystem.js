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
  '世外逍遥客': Object.freeze({
    id: '世外逍遥客',
    name: '世外逍遥客',
    rarity: 'legendary',
    source: '支线任务·天地无拘',
    desc: '循无拘仙印横渡诸天、走出自身逍遥路的永久纪念称号。',
    effects: Object.freeze({}),
  }),
  '问仙者': Object.freeze({
    id: '问仙者',
    name: '问仙者',
    rarity: 'legendary',
    source: '问仙令·问仙者归途',
    desc: '问仙令达到第六十级、走完问仙者归途的限定纪念称号。',
    effects: Object.freeze({}),
  }),
  '神火境修士': Object.freeze({
    id: '神火境修士',
    name: '神火境修士',
    rarity: 'epic',
    source: '仙古秘境·道种融合',
    desc: '借助道种成功点燃神火、踏入神火境的纪念称号。',
    effects: Object.freeze({}),
  }),
  '祭炼真我': Object.freeze({
    id: '祭炼真我',
    name: '祭炼真我',
    rarity: 'legendary',
    source: '仙古秘境·祭炼真我',
    desc: '以三千道火祭炼真我、开创自身道路的唯一神火纪念称号。',
    effects: Object.freeze({}),
  }),
  '仙古第一': Object.freeze({
    id: '仙古第一',
    name: '仙古第一',
    rarity: 'legendary',
    source: '仙古秘境·仙古擂台',
    desc: '在仙古擂台结算时以最高胜场夺得头名的永久纪念称号。',
    effects: Object.freeze({}),
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

/** 按旧存档中已经完成的里程碑补发称号。 */
export function recoverEarnedTitles(player) {
  if (!player || typeof player !== 'object') return [];
  const shenhuo = player.xiangu_shenhuo || {};
  const candidates = [
    [Boolean(player.支线任务完成记录?.[4]), '世外逍遥客'],
    [Array.isArray(player.问仙令?.claimed) && player.问仙令.claimed.some(level => Number(level) === 60), '问仙者'],
    [shenhuo.已点燃 && shenhuo.点燃方式 === '道种孕育', '神火境修士'],
    [shenhuo.已点燃 && (shenhuo.路线 === '祭炼真我' || shenhuo.点燃方式 === '祭炼真我'), '祭炼真我'],
    [Number(player.xiangu_legacy?.crowns) > 0, '仙古第一'],
  ];
  return candidates
    .filter(([earned]) => earned)
    .map(([, titleId]) => titleId)
    .filter(titleId => grantTitle(player, titleId));
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

/** 当前佩戴称号的通用悟道加成；未配置时仍为纯荣誉称号。 */
export function getTitleWudaoBonus(player) {
  const effects = getEquippedTitle(player)?.effects || {};
  const raw = asNumber(effects.悟道加成 ?? effects.wudaoPct);
  return Math.max(-0.5, Math.min(0.5, Math.abs(raw) > 1 ? raw / 100 : raw));
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
