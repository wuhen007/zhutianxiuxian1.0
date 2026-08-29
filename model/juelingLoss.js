/**
 * 绝灵损失 · 纯计算工具（无 IO，调用方负责 Read_najie / Write_najie）。
 * 供两类场景复用：
 *   1. 时代绝灵（EraChangeTask）：全服绝灵时代到来的物品损失；
 *   2. 因果绝灵（worldlineAuthority 联动）：因果债多次触发雷劫后引来的
 *      11000~13000 年个人绝灵侵蚀（星宇护身符 / 仙王豁免均无法抵挡）。
 * 损失规则与 EraChangeTask 时代绝灵一致：基础 3~5 组 + 每千年额外 2 组，
 * 每组随机类目随机物品，损失该物品数量的 10%（至少 1 个），跳过已锁定物品。
 */

const LOSS_CATEGORIES = Object.freeze([
  '丹药', '道具', '功法', '草药', '材料', '食材', '仙宠', '仙宠口粮', '盒子',
]);

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * 计算绝灵损失并直接扣减传入的 najie 对象（就地修改）。
 * @param {object} najie 玩家纳戒对象（会被就地修改）
 * @param {number} eraYears 绝灵持续年份（决定额外损失组数）
 * @param {object} [options] { random, maxGroups }
 * @returns {{ items: Array<{name, category, amount}>, groups: number }}
 */
export function computeJuelingErasure(najie, eraYears, options = {}) {
  const random = options.random || Math.random;
  const years = Math.max(0, number(eraYears));
  const extraGroups = Math.floor(years / 1000) * 2;
  const baseGroups = 3 + Math.floor(random() * 3);
  const maxGroups = options.maxGroups === undefined
    ? 9999
    : Math.max(0, number(options.maxGroups));
  const totalGroups = Math.max(0, Math.min(maxGroups, baseGroups + extraGroups));

  const lossCategories = LOSS_CATEGORIES.filter(category => najie?.[category]?.length > 0);
  const items = [];

  for (let index = 0; index < totalGroups && lossCategories.length > 0; index++) {
    const categoryIndex = Math.floor(random() * lossCategories.length);
    const category = lossCategories[categoryIndex];
    const list = najie[category];
    if (!list?.length) {
      lossCategories.splice(categoryIndex, 1);
      continue;
    }
    const itemIndex = Math.floor(random() * list.length);
    const item = list[itemIndex];
    if (!item || item.islockd === 1) continue;

    const owned = Math.max(1, number(item.数量, 1));
    const lossAmount = Math.max(1, Math.min(Math.floor(owned * 0.1), owned));
    item.数量 = owned - lossAmount;
    if (item.数量 <= 0) list.splice(itemIndex, 1);
    if (!list.length) lossCategories.splice(categoryIndex, 1);
    items.push({ name: item.name, category, amount: lossAmount });
  }

  return { items, groups: totalGroups };
}
