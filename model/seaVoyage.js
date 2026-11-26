/**
 * 舟出海探险（万舟争渡）—— 数据与纯逻辑层
 *
 * 玩法骨架：造舟（3 阶）→ 每日出海（挂机）→ 结算基础收益 + 60% 海域事件三选一
 *           → 海域见闻录收集 → 集齐航线兑换套装（消耗见闻条目）
 * 世界观：凡间河 / 遮天渊 / 界海 三条航线，对应现有位面分组；潮汐旺潮位面航线收益提升。
 */

/** 舟品阶：multiplier 收益倍率；统一 120 分钟出海，舟越好收益越高 */
export const SEA_BOAT_TIERS = Object.freeze([
  {
    name: '一叶轻舟',
    multiplier: 1,
    voyageMinutes: 120,
    upgrade: {
      name: '界河灵舟',
      materials: [
        { name: '一叶轻舟', class: '道具', amount: 1 },
        { name: '彼岸星砂', class: '材料', amount: 10 },
        { name: '众生愿鳞', class: '道具', amount: 100 },
      ],
    },
  },
  {
    name: '界河灵舟',
    multiplier: 1.5,
    voyageMinutes: 120,
    upgrade: {
      name: '诸天仙舟',
      materials: [
        { name: '界河灵舟', class: '道具', amount: 1 },
        { name: '纪元之力', class: '材料', amount: 5 },
        { name: '众生愿鳞', class: '道具', amount: 200 },
      ],
    },
  },
  {
    name: '诸天仙舟',
    multiplier: 2,
    voyageMinutes: 120,
    upgrade: null,
  },
]);

export const SEA_BOAT_NAMES = Object.freeze(SEA_BOAT_TIERS.map(tier => tier.name));

/** 一叶轻舟的初始铸造配方（首舟） */
export const SEA_FIRST_BOAT_MATERIALS = Object.freeze([
  { name: '群星之沙', class: '道具', amount: 20 },
  { name: '众生愿鳞', class: '道具', amount: 50 },
]);

/** 出海消耗：1 众生仙钓 + 10 愿鳞（或指定 1 枚仙饵替代愿鳞） */
export const SEA_VOYAGE_COST = Object.freeze({
  fishingRod: { name: '众生仙钓', class: '道具', amount: 1 },
  wishScales: { name: '众生愿鳞', class: '道具', amount: 10 },
});

/** 每日出海次数上限 */
export const SEA_DAILY_VOYAGE_LIMIT = 3;

/** 航线：按现有位面分组，bait 为集齐兑换特产 */
export const SEA_ROUTES = Object.freeze([
  { name: '凡间河', planes: ['凡间', '仙界'], bait: '百草香饵' },
  { name: '遮天渊', planes: ['遮天位面', '下界八域', '九天十地'], bait: '神藏仙饵' },
  { name: '界海', planes: ['太初星墟', '仙域'], bait: '矿髓沉饵' },
]);

export const SEA_ROUTE_NAMES = Object.freeze(SEA_ROUTES.map(route => route.name));

/** 海域见闻录：每航线 3 条（2 普通 + 1 传说） */
export const SEA_ATLAS = Object.freeze({
  凡间河: [
    { name: '渔火渡口', kind: 'common' },
    { name: '浣纱水府', kind: 'common' },
    { name: '龙门浮影', kind: 'legend' },
  ],
  遮天渊: [
    { name: '帝路残碑', kind: 'common' },
    { name: '沉棺渊涡', kind: 'common' },
    { name: '星空古殿', kind: 'legend' },
  ],
  界海: [
    { name: '界潮白浪', kind: 'common' },
    { name: '星骸浮岛', kind: 'common' },
    { name: '仙王旧舟', kind: 'legend' },
  ],
});

/** 海域事件：出海结算时 60% 触发，三选一 */
export const SEA_EVENT_CHANCE = 0.6;
export const SEA_EVENTS = Object.freeze([
  {
    id: 'sea-treasure',
    title: '海域奇遇·浮金宝箱',
    intro: '浪尖浮起一只缠绕海藻的宝箱，锁扣锈迹斑斑，四周灵气氤氲。',
    choices: [
      {
        label: '开箱取宝',
        items: [{ name: '众生愿鳞', class: '道具', amount: 8 }],
        message: '宝箱里躺着八枚众生愿鳞，正适合换些仙饵。',
      },
      {
        label: '拆下沉木',
        items: [{ name: '群星之沙', class: '道具', amount: 5 }],
        message: '你拆下箱板，竟是星墟沉木，可作群星之沙。',
      },
      {
        label: '任其漂流',
        sighting: 'legend',
        message: '你不愿扰动此物，反而望见远处一道奇异水光，记下一段传说见闻。',
      },
    ],
  },
  {
    id: 'sea-storm',
    title: '海域奇遇·风暴压境',
    intro: '乌云压顶，巨浪如山，你的舟在风暴眼里打转。',
    choices: [
      {
        label: '全力破浪',
        message: '你以法力破开浪墙，有惊无险地穿过风暴，货物无损。',
      },
      {
        label: '降帆漂流',
        loseCargoRatio: 0.3,
        message: '风暴卷走三成货物，但舟与人都安然无恙。',
      },
      {
        label: '观望潮眼',
        sighting: 'legend',
        message: '你盯着潮眼深处，隐约望见不该存在之物，记下一段传说见闻。',
      },
    ],
  },
  {
    id: 'sea-beast',
    title: '海域奇遇·异兽拦舟',
    intro: '一道黑影绕着舟底游弋，水面泛起诡异磷光。',
    choices: [
      {
        label: '投饵引开',
        items: [{ name: '神藏仙饵', class: '道具', amount: 1 }],
        message: '你投下一枚神藏仙饵，黑影满意地沉入水底。',
      },
      {
        label: '出手驱逐',
        gamble: {
          win: { items: [{ name: '彼岸星砂', class: '材料', amount: 1 }], message: '你击退异兽，拾得一片彼岸星砂。' },
          lose: { loseCargoRatio: 0.2, message: '异兽凶猛，你弃下两成货物才脱身。' },
        },
        message: '你与异兽缠斗一番……',
      },
      {
        label: '跟随踪迹',
        sighting: 'common',
        message: '你循着磷光追去，记下一段寻常见闻。',
      },
    ],
  },
]);

export const SEA_EVENT_IDS = Object.freeze(SEA_EVENTS.map(event => event.id));

/* ---------------------------------- 取值函数 ---------------------------------- */

export function getBoatTier(boatName) {
  return SEA_BOAT_TIERS.find(tier => tier.name === boatName) || null;
}

export function getBoatTierIndex(boatName) {
  return SEA_BOAT_TIERS.findIndex(tier => tier.name === boatName);
}

/**
 * 确定玩家当前生效的舟（取阶位最高者）：
 * - 当前出海舟有效 + 纳戒舟道具 → 取两者中阶位最高者
 * - 使奖励获得的舟（含高于当前舟的）即时生效；拆解后取现存最高阶
 * @param {string|null} currentBoat player.出海舟
 * @param {string[]} ownedBoatNames 纳戒中持有的舟道具名（一叶轻舟/界河灵舟/诸天仙舟）
 * @returns {string|null} 应生效的舟名
 */
export function resolveEffectiveBoat(currentBoat, ownedBoatNames = []) {
  let best = currentBoat && getBoatTierIndex(currentBoat) >= 0 ? currentBoat : null;
  let bestIndex = best ? getBoatTierIndex(best) : -1;
  for (const name of ownedBoatNames) {
    const index = getBoatTierIndex(name);
    if (index >= 0 && index > bestIndex) {
      best = name;
      bestIndex = index;
    }
  }
  return best;
}

/* ===== 出海恶性事件：舟体损坏 ===== */

/** 回港时遭遇恶性事件的概率 */
export const SEA_DISASTER_CHANCE = 0.12;

/** 恶性事件池（舟体损坏，不进入正事件三选一） */
export const SEA_DISASTERS = Object.freeze([
  Object.freeze({
    id: 'disaster-storm',
    title: '灭世风暴',
    intro: '回港途中天穹骤然压黑，灭世风暴拔海而起，浪墙如山，雷霆劈碎桅杆。',
  }),
  Object.freeze({
    id: 'disaster-behemoth',
    title: '海渊巨兽',
    intro: '一头沉睡万古的海渊巨兽被舟影惊醒，怒尾横扫，整艘舟被掀入浪底又抛回天际。',
  }),
  Object.freeze({
    id: 'disaster-riptide',
    title: '界潮倒卷',
    intro: '界海潮汐毫无征兆地倒卷，暗流绞缠舟身，龙骨发出濒临断裂的呻吟。',
  }),
]);

/**
 * 回港判定：是否遭遇恶性事件（舟体损坏）。
 * @returns {object|null} { id, title, intro } 或 null
 */
export function rollSeaDisaster(random = Math.random) {
  const roll = Math.max(0, Math.min(0.999999999, Number(random()) || 0));
  if (roll >= SEA_DISASTER_CHANCE) return null;
  const index = Math.min(
    SEA_DISASTERS.length - 1,
    Math.floor((roll / SEA_DISASTER_CHANCE) * SEA_DISASTERS.length)
  );
  return SEA_DISASTERS[index];
}

/**
 * 舟体受损结算：
 * - 仙舟/灵舟 → 残骸重组为低一阶的舟（damaged.demoted）
 * - 一叶轻舟 → 沉没（sunk），返还首舟材料 70% 作为残骸保底
 * @param {string} currentBoat 当前出海舟（须为有效三阶舟名）
 * @returns {object|null} { boat, demoted, sunk, refunds }
 */
export function damagePlayerBoat(currentBoat) {
  const index = getBoatTierIndex(currentBoat);
  if (index < 0) return null;
  if (index === 0) {
    return {
      boat: SEA_BOAT_TIERS[0].name,
      demoted: null,
      sunk: true,
      refunds: SEA_FIRST_BOAT_MATERIALS.map(material => ({
        name: material.name,
        class: material.class,
        amount: Math.max(1, Math.trunc(material.amount * 0.7)),
      })),
    };
  }
  return {
    boat: SEA_BOAT_TIERS[index].name,
    demoted: SEA_BOAT_TIERS[index - 1].name,
    sunk: false,
    refunds: [],
  };
}

export function getSeaRoute(routeName) {
  return SEA_ROUTES.find(route => route.name === routeName) || null;
}

export function getSeaAtlasEntries(routeName) {
  return SEA_ATLAS[routeName] || null;
}

export function getSeaEventById(eventId) {
  return SEA_EVENTS.find(event => event.id === eventId) || null;
}

export function getSeaEventChoice(eventId, choiceNumber) {
  const event = getSeaEventById(eventId);
  const index = Math.trunc(Number(choiceNumber)) - 1;
  if (!event || index < 0 || index >= event.choices.length) return null;
  return event.choices[index];
}

/** 航线是否处于旺潮位面（潮汐判定） */
export function isSeaRouteTideBoosted(routeName, tide) {
  if (!tide?.active) return false;
  const route = getSeaRoute(routeName);
  if (!route) return false;
  return route.planes.some(plane => tide.planes?.includes(plane));
}

/* ---------------------------------- 随机结算 ---------------------------------- */

function clamp01(value) {
  return Math.max(0, Math.min(0.999999999, value));
}

function rollWeighted(entries, randomValue) {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = clamp01(randomValue) * totalWeight;
  for (const entry of entries) {
    cursor -= entry.weight;
    if (cursor < 0) return entry;
  }
  return entries[entries.length - 1];
}

/**
 * 出海基础收益：
 * - wishScales：10~20 × 舟倍率（旺潮 ×1.5，向下取整），满级仙舟均值≈投入2倍
 * - materials：按权重掉材料（旺潮概率翻倍）
 * - sighting：50% 记一条见闻（传说概率旺潮 30% / 平时 15%）
 */
export function rollSeaVoyageBaseReward(
  routeName,
  { boatMultiplier = 1, tideBoosted = false, random = Math.random } = {}
) {
  const scales = Math.max(
    1,
    Math.trunc((10 + Math.floor(clamp01(random()) * 11)) * boatMultiplier * (tideBoosted ? 1.5 : 1))
  );
  const materialRoll = random();
  const route = getSeaRoute(routeName);
  const baitName = route?.bait || null;
  const materialTable = tideBoosted
    ? [
        { name: null, weight: 20 },
        { name: '群星之沙', class: '道具', weight: 30 },
        { name: '彼岸星砂', class: '材料', weight: 25 },
        { name: '纪元之力', class: '材料', weight: 15 },
        { name: baitName, class: '道具', weight: 10 },
      ]
    : [
        { name: null, weight: 40 },
        { name: '群星之沙', class: '道具', weight: 25 },
        { name: '彼岸星砂', class: '材料', weight: 20 },
        { name: '纪元之力', class: '材料', weight: 10 },
        { name: baitName, class: '道具', weight: 5 },
      ];
  const material = rollWeighted(materialTable, materialRoll);
  const sighting = random() < 0.5 ? rollSeaSighting(routeName, { tideBoosted, random }) : null;
  return {
    wishScales: scales,
    materials: material?.name ? [{ name: material.name, class: material.class, amount: 1 }] : [],
    sighting,
  };
}

/** 记录见闻条目：触发后按 legend 概率挑一条（普通/传说） */
export function rollSeaSighting(routeName, { tideBoosted = false, random = Math.random } = {}) {
  const entries = getSeaAtlasEntries(routeName);
  if (!entries || entries.length === 0) return null;
  const legendChance = tideBoosted ? 0.3 : 0.15;
  const wantLegend = random() < legendChance;
  const pool = entries.filter(entry => entry.kind === (wantLegend ? 'legend' : 'common'));
  if (pool.length === 0) return entries[0].name;
  return pool[Math.floor(clamp01(random()) * pool.length)].name;
}

/** 出海结算时 60% 触发海域事件 */
export function rollSeaEvent(random = Math.random) {
  if (random() >= SEA_EVENT_CHANCE) return null;
  return SEA_EVENTS[Math.floor(clamp01(random()) * SEA_EVENTS.length)];
}
