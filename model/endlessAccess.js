import { getSuiyunStage } from './suiyun.js';

export const ENDLESS_ENTRY_ITEM = '无尽秘钥';
export const ENDLESS_SWEEP_ITEM = '无尽扫荡券';
export const ENDLESS_KEY_RECIPE_ITEM = '无尽秘钥配方';
export const ENDLESS_KEY_RECIPE_FLAG = '无尽秘钥配方';
export const ENDLESS_SPIRIT_HEART_COST = 30;
export const ENDLESS_SWEEP_MAX_LAYERS = 10;
/** 周末免费入场标记字段：记录已使用免费额度的周末周键 */
export const WEEKEND_FREE_FIELD = '无尽劫境免费周';

/** 岁云五阶本人免秘钥与心神，受赐三战技不获得该入境特权。 */
export function hasSuiyunFreeEndlessEntry(player) {
  return getSuiyunStage(player) > 0;
}

/**
 * 判断当前是否为周末（周六/周日）。
 * getDay(): 0=周日 6=周六
 */
export function isWeekendNow(date = new Date()) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * 计算当前周末的周键（如 2026-W33）。
 * 同一周末内任意时刻（周六/周日）返回相同键，用于「每周末免费一次」去重。
 */
export function getWeekendFreeWeekKey(date = new Date()) {
  const day = date.getDay();
  const saturday = new Date(date);
  if (day === 0) saturday.setDate(saturday.getDate() - 6);
  else if (day !== 6) return null;
  const year = saturday.getFullYear();
  const janFirst = new Date(year, 0, 1);
  const week = Math.ceil(
    ((saturday - janFirst) / 86400000 + janFirst.getDay() + 1) / 7
  );
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export const WENXIAN_ENDLESS_REWARDS = Object.freeze({
  10: Object.freeze([
    Object.freeze({
      kind: '道具',
      name: ENDLESS_ENTRY_ITEM,
      class: '道具',
      count: 1,
      label: `${ENDLESS_ENTRY_ITEM}x1`,
    }),
  ]),
  15: Object.freeze([
    Object.freeze({
      kind: '道具',
      name: '定神丹',
      class: '丹药',
      count: 3,
      label: '定神丹x3',
    }),
  ]),
  20: Object.freeze([
    Object.freeze({
      kind: '道具',
      name: ENDLESS_SWEEP_ITEM,
      class: '道具',
      count: 1,
      label: `${ENDLESS_SWEEP_ITEM}x1`,
    }),
  ]),
  30: Object.freeze([
    Object.freeze({
      kind: '道具',
      name: ENDLESS_ENTRY_ITEM,
      class: '道具',
      count: 1,
      label: `${ENDLESS_ENTRY_ITEM}x1`,
    }),
  ]),
  35: Object.freeze([
    Object.freeze({
      kind: '道具',
      name: '定神丹',
      class: '丹药',
      count: 5,
      label: '定神丹x5',
    }),
  ]),
  40: Object.freeze([
    Object.freeze({
      kind: '道具',
      name: ENDLESS_SWEEP_ITEM,
      class: '道具',
      count: 1,
      label: `${ENDLESS_SWEEP_ITEM}x1`,
    }),
  ]),
  50: Object.freeze([
    Object.freeze({
      kind: '道具',
      name: ENDLESS_ENTRY_ITEM,
      class: '道具',
      count: 1,
      label: `${ENDLESS_ENTRY_ITEM}x1`,
    }),
  ]),
  55: Object.freeze([
    Object.freeze({
      kind: '道具',
      name: '太虚养神丹',
      class: '丹药',
      count: 2,
      label: '太虚养神丹x2',
    }),
  ]),
  60: Object.freeze([
    Object.freeze({
      kind: '道具',
      name: ENDLESS_SWEEP_ITEM,
      class: '道具',
      count: 1,
      label: `${ENDLESS_SWEEP_ITEM}x1`,
    }),
  ]),
});

export function getWenXianEndlessRewards(level) {
  return (WENXIAN_ENDLESS_REWARDS[Number(level)] || []).map((reward) => ({
    ...reward,
  }));
}
