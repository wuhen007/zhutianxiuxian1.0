export const XIANWU_COORD_CHANCE = 0.025;
export const OTHER_SHORE_FRUIT_CHANCE = 0.001;
export const IMMORTAL_FISHING_EVENT_CHANCE = 0.08;
export const FISH_KING_CHANCE = 0.01;
export const TIDE_INTERVAL_YEARS = 5000;
export const TIDE_DURATION_YEARS = 2000;
export const FISHING_EVENT_CHOICE_MS = 10 * 60 * 1000;

const planeFishConfigs = {
  凡间: {
    fish: [
      { name: "青灵鲤", weight: 60 },
      { name: "赤鳞妖鲫", weight: 30 },
      { name: "天南玉龙鱼", weight: 10 },
    ],
    king: {
      name: "吞舟玄龟",
      speedMultiplier: 0.75,
      skills: ["真龙宝术", "不灭经"],
    },
  },
  仙界: {
    fish: [
      { name: "洗仙池锦鲤", weight: 60 },
      { name: "长生银鳐", weight: 30 },
      { name: "九窍仙鱼", weight: 10 },
    ],
    king: {
      name: "沧溟仙鲲",
      speedMultiplier: 0.95,
      skills: ["鲲鹏宝术", "不灭经"],
    },
  },
  遮天位面: {
    fish: [
      { name: "北斗龙鳅", weight: 60 },
      { name: "神泉金鲤", weight: 30 },
      { name: "葬帝星鱼", weight: 10 },
    ],
    king: {
      name: "葬帝星龙鳅",
      speedMultiplier: 1.15,
      skills: ["行字秘", "吞天魔功"],
    },
  },
  下界八域: {
    fish: [
      { name: "祭灵青鱼", weight: 60 },
      { name: "太古宝鳞鱼", weight: 30 },
      { name: "虚神界骨鱼", weight: 10 },
    ],
    king: {
      name: "纯血太古鱼龙",
      speedMultiplier: 1.05,
      skills: ["真龙宝术", "六道轮回天功"],
    },
  },
  九天十地: {
    fish: [
      { name: "帝关战鲟", weight: 60 },
      { name: "仙古道鱼", weight: 30 },
      { name: "界河鲲鱼", weight: 10 },
    ],
    king: {
      name: "界河鲲鹏残灵",
      speedMultiplier: 1.25,
      skills: ["鲲鹏宝术", "六道轮回天功"],
    },
  },
  太初星墟: {
    fish: [
      { name: "星骸游鱼", weight: 60 },
      { name: "吞光晶鳐", weight: 30 },
      { name: "宇宙胎鱼", weight: 10 },
    ],
    king: {
      name: "噬界星鲸",
      speedMultiplier: 1.4,
      skills: ["吞天魔功", "六道轮回天功"],
    },
  },
  仙域: {
    fish: [
      { name: "界海银鱼", weight: 60 },
      { name: "仙王道鲤", weight: 30 },
      { name: "岁月舟鱼", weight: 10 },
    ],
    king: {
      name: "界海古鲲",
      speedMultiplier: 1.6,
      skills: ["鲲鹏宝术", "不灭经", "行字秘"],
    },
  },
};

export const FISHING_PLANE_NAMES = Object.freeze(Object.keys(planeFishConfigs));

const TIDE_NAMES = Object.freeze([
  "万灵归海",
  "星墟涌流",
  "轮回暗潮",
  "界海大潮",
]);

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
    title: "凡间奇遇·护众道友",
    intro: "你循水声发现一位将众人护至身前的道友，他被大妖追杀，已然重伤。",
    choices: [
      {
        label: "救起道友",
        playerAdds: { 高级传送次数: 1 },
        message: "你替他稳住伤势。他醒后以残血刻阵，高级位面传送阵次数+1。",
      },
      {
        label: "引走大妖",
        items: [{ name: "遣虎令", class: "道具", amount: 2 }],
        message: "你将大妖引入群山，反夺其御兽法印，获得遣虎令x2。",
      },
      {
        label: "守护众人",
        sourceStone: 3000000,
        message: "你留下护住众人，百姓献出珍藏的古矿，获得源石300万。",
      },
    ],
  },
  仙界: {
    id: "immortal-old-man",
    title: "仙界奇遇·老壁灯",
    intro: "一位怎么看都不靠谱的老者说你天资尚可，非要收你做关门弟子。",
    choices: [
      {
        label: "婉言拒绝",
        items: [{ name: "功法参悟丹", class: "丹药", amount: 1 }],
        sourceStone: 12000000,
        message: "老者叹了声可惜，留下功法参悟丹x1与源石1200万。",
      },
      {
        label: "请他演法",
        items: [{ name: "心神丹", class: "丹药", amount: 2 }],
        message: "老者随手演化一段残法，你勉强跟上，获得心神丹x2。",
      },
      {
        label: "追问来历",
        items: [{ name: "潜力丹", class: "丹药", amount: 1 }],
        sourceStone: 6000000,
        message: "老者笑而不答，只留下一枚潜力丹与源石600万。",
      },
    ],
  },
  遮天位面: {
    id: "duan-de",
    title: "遮天奇遇·段德",
    intro: "水下钻出个胖道士，嘴上喊着无量天尊，问你要不要合伙探一处阴坟。",
    choices: [
      {
        label: "交换秘辛",
        items: [{ name: "渡劫天功残页", class: "材料", amount: 1 }],
        playerFlags: { 古地府秘辛: true },
        message: "段德给你渡劫天功残页x1，并留下探索古地府的秘辛。十页可合成《渡劫天功》。",
      },
      {
        label: "合力破阵",
        items: [{ name: "欺天石", class: "材料", amount: 1 }],
        message: "你与段德合力破去欺天阵纹，分得欺天石x1。",
      },
      {
        label: "趁机夺图",
        items: [{ name: "世界石", class: "材料", amount: 1 }],
        message: "你夺到半角残图，图卷迎风化去，只剩世界石x1。",
      },
    ],
  },
  九天十地: {
    id: "academy-warship",
    title: "九天十地奇遇·书院巡河",
    intro: "一艘天神书院战船遭异域风暴冲击，正在界河中倾覆。",
    choices: [
      {
        label: "扶正战船",
        items: [{ name: "功法参悟丹", class: "丹药", amount: 1 }],
        sourceStone: 5000000,
        message: "船上长老赠你功法参悟丹x1与源石500万。",
      },
      {
        label: "打捞船舱",
        items: [{ name: "彼岸星砂", class: "材料", amount: 1 }],
        message: "你从破损船舱中打捞出彼岸星砂x1。",
      },
      {
        label: "追击异域生灵",
        items: [{ name: "遣龙令", class: "道具", amount: 3 }],
        message: "你追击异域生灵，夺得遣龙令x3。",
      },
    ],
  },
  下界八域: {
    id: "willow-waterway",
    title: "下界八域奇遇·柳叶定脉",
    intro: "一片焦黑柳叶落在钓线上，前方水脉随之剧烈暴动。",
    choices: [
      {
        label: "借柳叶定脉",
        items: [{ name: "九转天药幼苗", class: "草药", amount: 1 }],
        message: "潮退之后，你寻得九转天药幼苗x1。",
      },
      {
        label: "追寻水脉源头",
        items: [{ name: "悟道古茶树幼苗", class: "草药", amount: 1 }],
        message: "你在水脉源头发现悟道古茶树幼苗x1。",
      },
      {
        label: "放生受困生灵",
        items: [{ name: "众生愿鳞", class: "道具", amount: 5 }],
        message: "受困生灵重归大泽，众生愿力凝成愿鳞x5。",
      },
    ],
  },
  太初星墟: {
    id: "primordial-tide",
    title: "太初星墟奇遇·残界潮汐",
    intro: "钓线牵动一片破碎宇宙，残界正在星墟潮汐中解体。",
    choices: [
      {
        label: "凝聚残界",
        playerAdds: { 太初界源: 5 },
        message: "星骸凝为五缕太初界源，太初界源+5。",
      },
      {
        label: "打捞星骸",
        items: [{ name: "万古虚空铁", class: "材料", amount: 1 }],
        message: "你从星骸深处取得万古虚空铁x1。",
      },
      {
        label: "稳住宇宙胎膜",
        items: [{ name: "世界石", class: "材料", amount: 1 }],
        message: "残界最终没有彻底崩碎，回赠你世界石x1。",
      },
    ],
  },
  仙域: {
    id: "immortal-king-boat",
    title: "仙域奇遇·仙王旧舟",
    intro: "一叶残舟自界海归来，舟上古老剑痕仍在发光。",
    choices: [
      {
        label: "登舟探查",
        items: [
          { name: "彼岸星砂", class: "材料", amount: 1 },
          { name: "纪元之力", class: "材料", amount: 1 },
        ],
        message: "船舱只余彼岸星砂x1与纪元之力x1。",
      },
      {
        label: "参悟剑痕",
        items: [{ name: "功法参悟丹", class: "丹药", amount: 2 }],
        message: "剑痕中残留的仙王道韵凝成功法参悟丹x2。",
      },
      {
        label: "打捞船底星砂",
        items: [{ name: "群星之沙", class: "道具", amount: 10 }],
        message: "你从船底打捞出群星之沙x10。",
      },
    ],
  },
};

const genericPlaneFishingEvent = {
  id: "realm-drift",
  title: "诸天奇遇·界潮漂流物",
  intro: "未知位面的潮声掠过钓线，一件漂流物在浪间沉浮。",
  choices: [
    {
      label: "立即打捞",
      items: [{ name: "众生愿鳞", class: "道具", amount: 1 }],
      message: "你从浪间拾得众生愿鳞x1。",
    },
    {
      label: "追踪来处",
      items: [{ name: "群星之沙", class: "道具", amount: 3 }],
      message: "你沿界潮追索，获得群星之沙x3。",
    },
    {
      label: "任其远去",
      sourceStone: 1000000,
      message: "漂流物远去后，一小片源矿搁浅岸边，获得源石100万。",
    },
  ],
};

function seededTideRandom(seed) {
  let value = (Math.trunc(seed) + 1) * 2654435761;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function getFishingTide(worldYear) {
  const year = Math.max(0, Math.trunc(Number(worldYear) || 0));
  const cycle = Math.floor(year / TIDE_INTERVAL_YEARS);
  const startYear = cycle * TIDE_INTERVAL_YEARS;
  const elapsed = year - startYear;
  const active = elapsed < TIDE_DURATION_YEARS;
  const random = seededTideRandom(cycle);
  const planes = [...FISHING_PLANE_NAMES];
  const first = planes.splice(Math.floor(random() * planes.length), 1)[0];
  const second = planes.splice(Math.floor(random() * planes.length), 1)[0];
  return {
    active,
    cycle,
    name: TIDE_NAMES[Math.floor(random() * TIDE_NAMES.length)],
    planes: [first, second],
    startYear,
    endYear: startYear + TIDE_DURATION_YEARS,
    nextStartYear: startYear + TIDE_INTERVAL_YEARS,
    remainingYears: active
      ? TIDE_DURATION_YEARS - elapsed
      : TIDE_INTERVAL_YEARS - elapsed,
  };
}

export function getPlaneFishConfig(planeName) {
  return planeFishConfigs[planeName] || null;
}

export function rollPlaneFish(
  planeName,
  { tide = null, allowFishKing = true } = {},
  random = Math.random
) {
  const config = getPlaneFishConfig(planeName);
  if (!config) return null;
  const tideBoosted = Boolean(tide?.active && tide.planes?.includes(planeName));
  const kingChance = tideBoosted ? FISH_KING_CHANCE * 2 : FISH_KING_CHANCE;
  if (allowFishKing && random() < kingChance) {
    return { type: "king", plane: planeName, tideBoosted, ...config.king };
  }

  let roll = random() * 100;
  const weights = tideBoosted ? [50, 30, 20] : config.fish.map(fish => fish.weight);
  for (let index = 0; index < config.fish.length; index++) {
    roll -= weights[index];
    if (roll < 0) {
      return { type: "fish", plane: planeName, tideBoosted, name: config.fish[index].name };
    }
  }
  return { type: "fish", plane: planeName, tideBoosted, name: config.fish.at(-1).name };
}

export function recordFishCatch(player, planeName, fishName, amount = 1) {
  if (!player || !planeName || !fishName) return 0;
  player.众生鱼图鉴 ||= {};
  player.众生鱼图鉴[planeName] ||= {};
  const current = Number(player.众生鱼图鉴[planeName][fishName]) || 0;
  player.众生鱼图鉴[planeName][fishName] = current + Math.max(1, Math.trunc(amount));
  return player.众生鱼图鉴[planeName][fishName];
}

export function getPlaneFishAtlas(player, planeName) {
  const config = getPlaneFishConfig(planeName);
  if (!config) return null;
  const records = player?.众生鱼图鉴?.[planeName] || {};
  const entries = [...config.fish, config.king].map(fish => ({
    name: fish.name,
    count: Number(records[fish.name]) || 0,
    king: fish.name === config.king.name,
  }));
  return {
    plane: planeName,
    entries,
    collected: entries.filter(entry => entry.count > 0).length,
    total: entries.length,
  };
}

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
  let minutes = 40;
  if (hasTideLamp) minutes /= 2;
  if (hasDaoArt) minutes -= 10;
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
    choices: event.choices.map(choice => ({
      ...choice,
      items: choice.items?.map(item => ({ ...item })),
      playerAdds: choice.playerAdds ? { ...choice.playerAdds } : undefined,
      playerFlags: choice.playerFlags ? { ...choice.playerFlags } : undefined,
    })),
  };
}

export function getPlaneFishingEventById(eventId) {
  const event = [...Object.values(planeFishingEvents), genericPlaneFishingEvent]
    .find(candidate => candidate.id === eventId);
  if (!event) return null;
  return rollPlaneFishingEventFromConfig(event);
}

export function getPlaneFishingEventChoice(eventId, choiceNumber) {
  const event = getPlaneFishingEventById(eventId);
  const index = Math.trunc(Number(choiceNumber)) - 1;
  if (!event || index < 0 || index >= event.choices.length) return null;
  return event.choices[index];
}

function rollPlaneFishingEventFromConfig(event) {
  return {
    ...event,
    choices: event.choices.map(choice => ({
      ...choice,
      items: choice.items?.map(item => ({ ...item })),
      playerAdds: choice.playerAdds ? { ...choice.playerAdds } : undefined,
      playerFlags: choice.playerFlags ? { ...choice.playerFlags } : undefined,
    })),
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
