export const ENDLESS_ENTRY_ITEM = '无尽秘钥';
export const ENDLESS_SWEEP_ITEM = '无尽扫荡券';
export const ENDLESS_KEY_RECIPE_ITEM = '无尽秘钥配方';
export const ENDLESS_KEY_RECIPE_FLAG = '无尽秘钥配方';
export const ENDLESS_SPIRIT_HEART_COST = 30;
export const ENDLESS_SWEEP_MAX_LAYERS = 10;

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
