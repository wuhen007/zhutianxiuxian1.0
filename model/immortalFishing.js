export const XIANWU_COORD_CHANCE = 0.025;
export const OTHER_SHORE_FRUIT_CHANCE = 0.001;
export const IMMORTAL_FISHING_EVENT_CHANCE = 0.08;

const wishScaleExchangeConfigs = {
  众生仙钓: { cost: 5, reward: { name: "众生仙钓", class: "道具", amount: 1 } },
  百草香饵: { cost: 30, reward: { name: "百草香饵", class: "道具", amount: 5 } },
  神藏仙饵: { cost: 30, reward: { name: "神藏仙饵", class: "道具", amount: 5 } },
  矿髓沉饵: { cost: 40, reward: { name: "矿髓沉饵", class: "道具", amount: 5 } },
  因果道饵: { cost: 50, reward: { name: "因果道饵", class: "道具", amount: 5 } },
  轮回冥饵: { cost: 50, reward: { name: "轮回冥饵", class: "道具", amount: 5 } },
  宇宙核心: { cost: 80, reward: { name: "宇宙核心", class: "材料", amount: 5 } },
  界核: { cost: 80, reward: { name: "界核", class: "材料", amount: 5 } },
  鸿蒙道火: { cost: 80, reward: { name: "鸿蒙道火", class: "材料", amount: 5 } },
  三千弱水: { cost: 80, reward: { name: "三千弱水", class: "材料", amount: 5 } },
  万界引潮灯: {
    cost: 120,
    reward: { name: "万界引潮灯", class: "道具", amount: 1 },
    unique: true,
  },
};

const planeFishingEvents = {
  凡间: {
    id: "mortal-rescue",
    playerAdds: { 高级传送次数: 1 },
    message:
      "【凡间奇遇·护众道友】你循水声救下那位将众人护至身前、却被大妖追杀至重伤的道友。他醒后以残血刻阵，为你增加高级位面传送阵次数x1。",
  },
  仙界: {
    id: "immortal-old-man",
    items: [{ name: "功法参悟丹", class: "丹药", amount: 1 }],
    sourceStone: 12000000,
    message:
      "【仙界奇遇·老壁灯】一位怎么看都不靠谱的老者说你天资尚可，要收你做关门弟子。你婉言拒绝，他叹了声可惜，留下功法参悟丹x1与源石1200万。",
  },
  遮天位面: {
    id: "duan-de",
    items: [{ name: "渡劫天功残页", class: "材料", amount: 1 }],
    playerFlags: { 古地府秘辛: true },
    message:
      "【遮天奇遇·段德】水下钻出个胖道士，嘴上喊着无量天尊，塞给你渡劫天功残页x1，又以神念留下探索古地府的秘辛。十页残经可合成帝经《渡劫天功》。",
  },
  九天十地: {
    id: "academy-warship",
    items: [{ name: "功法参悟丹", class: "丹药", amount: 1 }],
    sourceStone: 5000000,
    message:
      "【九天十地奇遇·书院巡河】你在界河中扶正一艘遭异域风暴冲击的书院战船。船上长老赠你功法参悟丹x1与源石500万。",
  },
  下界八域: {
    id: "willow-waterway",
    items: [{ name: "九转天药幼苗", class: "草药", amount: 1 }],
    message:
      "【下界八域奇遇·柳叶定脉】一片焦黑柳叶落在钓线上，顷刻稳住暴乱水脉。潮退之后，你寻得九转天药幼苗x1。",
  },
  太初星墟: {
    id: "primordial-tide",
    playerAdds: { 太初界源: 5 },
    message:
      "【太初星墟奇遇·残界潮汐】钓线牵动一片破碎宇宙，星骸在潮声中凝为五缕太初界源。太初界源+5。",
  },
  仙域: {
    id: "immortal-king-boat",
    items: [
      { name: "彼岸星砂", class: "材料", amount: 1 },
      { name: "纪元之力", class: "材料", amount: 1 },
    ],
    message:
      "【仙域奇遇·仙王旧舟】一叶残舟自界海归来，船舱只余彼岸星砂x1与纪元之力x1，舟上古老剑痕仍在发光。",
  },
};

const genericPlaneFishingEvent = {
  id: "realm-drift",
  items: [{ name: "众生愿鳞", class: "道具", amount: 1 }],
  message: "【诸天奇遇·界潮漂流物】未知位面的潮声掠过钓线，你从浪间拾得众生愿鳞x1。",
};

export const WISH_SCALE_EXCHANGE_NAMES = Object.freeze(
  Object.keys(wishScaleExchangeConfigs)
);

export function getWishScaleExchangeConfig(name) {
  return wishScaleExchangeConfigs[name] || null;
}

export function parseWishScaleExchange(message) {
  const name = String(message || "")
    .replace(/^#愿鳞兑换\s*/, "")
    .trim();
  return name || null;
}

export function getImmortalFishingCooldown({ hasTideLamp = false, hasDaoArt = false } = {}) {
  let minutes = hasTideLamp ? 10 : 20;
  if (hasDaoArt) minutes /= 2;
  return minutes * 60 * 1000;
}

export function rollWishScaleAmount(hasTideLamp = false, random = Math.random) {
  const amount = 1 + Math.floor(Math.max(0, Math.min(0.999999999, random())) * 5);
  return hasTideLamp ? amount * 2 : amount;
}

export function rollPlaneFishingEvent(planeName, random = Math.random) {
  if (random() >= IMMORTAL_FISHING_EVENT_CHANCE) return null;
  const event = planeFishingEvents[planeName] || genericPlaneFishingEvent;
  return {
    ...event,
    items: event.items?.map(item => ({ ...item })),
    playerAdds: event.playerAdds ? { ...event.playerAdds } : undefined,
    playerFlags: event.playerFlags ? { ...event.playerFlags } : undefined,
  };
}

const baitConfigs = {
  神藏仙饵: {
    effect: "专钓神药、潜力、心神与功法参悟类宝物",
    rewards: [
      { name: "天药", class: "丹药", amount: 5, weight: 25, scalable: true },
      { name: "九转天药", class: "丹药", amount: 1, weight: 8 },
      { name: "煌天造化丹", class: "丹药", amount: 1, weight: 4 },
      { name: "潜力丹", class: "丹药", amount: 1, weight: 20 },
      { name: "心神丹", class: "丹药", amount: 1, weight: 20 },
      { name: "功法参悟丹", class: "丹药", amount: 1, weight: 23 },
    ],
  },
  矿髓沉饵: {
    effect: "专钓矿石、神材与沉没遗物",
    rewards: [
      { name: "仙晶矿", class: "道具", amount: 100, weight: 32, scalable: true },
      { name: "七彩流晶矿", class: "道具", amount: 10, weight: 24, scalable: true },
      { name: "欺天石", class: "材料", amount: 1, weight: 10 },
      { name: "时光石", class: "材料", amount: 1, weight: 12 },
      { name: "万古虚空铁", class: "材料", amount: 1, weight: 10 },
      { name: "罗天晶", class: "材料", amount: 1, weight: 5 },
      { name: "道衍晶", class: "材料", amount: 1, weight: 5 },
      { name: "造化仙晶", class: "材料", amount: 1, weight: 2 },
    ],
  },
  百草香饵: {
    effect: "专钓生灵、仙果与珍稀药苗",
    rewards: [
      { name: "鱼肉", class: "食材", amount: 100, weight: 40, scalable: true },
      { name: "仙馐果", class: "食材", amount: 10, weight: 30, scalable: true },
      { name: "悟道古茶树幼苗", class: "草药", amount: 1, weight: 20 },
      { name: "九转天药幼苗", class: "草药", amount: 1, weight: 10 },
    ],
  },
  因果道饵: {
    effect: "排除普通渔获，只钓诸天稀有特产",
    rewards: [
      { name: "群星之沙", class: "道具", amount: 5, weight: 28, scalable: true },
      { name: "世界石", class: "材料", amount: 1, weight: 22 },
      { name: "无尽秘钥", class: "道具", amount: 1, weight: 15 },
      { name: "超越宝盒", class: "盒子", amount: 1, weight: 12 },
      { name: "真我宝盒", class: "盒子", amount: 1, weight: 8 },
      { name: "神主触屏碎片", class: "道具", amount: 1, weight: 15 },
    ],
  },
  轮回冥饵: {
    effect: "专钓炼器传承、轮回奇物与唯一仙武界坐标",
    rewards: [
      { name: "百炼诀残页", class: "材料", amount: 1, weight: 22 },
      { name: "九转炼器诀残页", class: "材料", amount: 1, weight: 15 },
      { name: "乾坤炼器经残页", class: "材料", amount: 1, weight: 9 },
      { name: "无上炼器道残页", class: "材料", amount: 1, weight: 5 },
      { name: "纪元之力", class: "材料", amount: 1, weight: 10 },
      { name: "彼岸星砂", class: "材料", amount: 1, weight: 15 },
      { name: "往世乐土的记忆结晶", class: "道具", amount: 1, weight: 12 },
      { name: "轮回魂晶", class: "材料", amount: 1, weight: 12 },
    ],
  },
};

export const IMMORTAL_BAIT_NAMES = Object.freeze(Object.keys(baitConfigs));

export function getImmortalBaitConfig(name) {
  return baitConfigs[name] || null;
}

export function parseImmortalBait(message) {
  const baitName = String(message || "")
    .replace(/^#垂钓众生\s*/, "")
    .trim();
  return baitName || null;
}

function rollWeighted(rewards, randomValue) {
  const totalWeight = rewards.reduce((sum, reward) => sum + reward.weight, 0);
  let cursor = Math.max(0, Math.min(0.999999999, randomValue)) * totalWeight;
  for (const reward of rewards) {
    cursor -= reward.weight;
    if (cursor < 0) return reward;
  }
  return rewards[rewards.length - 1];
}

export function rollImmortalBaitReward(
  baitName,
  { ownsXianwuCoordinate = false } = {},
  random = Math.random
) {
  const config = getImmortalBaitConfig(baitName);
  if (!config) return null;

  if (baitName !== "轮回冥饵") {
    return { ...rollWeighted(config.rewards, random()) };
  }

  const roll = random();
  if (!ownsXianwuCoordinate && roll < XIANWU_COORD_CHANCE) {
    return {
      name: "仙武界坐标",
      class: "道具",
      amount: 1,
      uniqueFlag: "仙武界坐标已获得",
    };
  }

  const fruitStart = ownsXianwuCoordinate ? 0 : XIANWU_COORD_CHANCE;
  if (roll < fruitStart + OTHER_SHORE_FRUIT_CHANCE) {
    return { name: "彼岸轮回果", class: "材料", amount: 1 };
  }

  const remainingStart = fruitStart + OTHER_SHORE_FRUIT_CHANCE;
  const normalizedRoll = (roll - remainingStart) / (1 - remainingStart);
  return { ...rollWeighted(config.rewards, normalizedRoll) };
}
