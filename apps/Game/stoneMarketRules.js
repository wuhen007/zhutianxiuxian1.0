import { drawSourceStoneForms } from './sourceStoneForms.js';

export const STONE_MARKET_STATE_TTL_SECONDS = 2 * 24 * 60 * 60;
export const SKY_GARDEN_COOLDOWN_MS = 20 * 60 * 60 * 1000;

const FRAGMENTS = [
  { name: '仙泪绿金残块', class: '材料', amount: 1 },
  { name: '龙纹黑金残块', class: '材料', amount: 1 },
  { name: '神痕紫金残块', class: '材料', amount: 1 },
];

const COMMON_OUTCOMES = [
  {
    id: 'empty', name: '空石', tier: 0, weight: 2500, ratio: 0,
    surfaces: ['敲击声发散，石心似有空腔', '源气贴近石皮便悄然消散'],
    clues: ['源气断续，难以深入石心', '石中寂静，没有精气回应'],
  },
  {
    id: 'mixed', name: '杂源', tier: 1, weight: 3500, ratio: 0.5,
    surfaces: ['裂隙凝有零星白霜', '石皮温凉交替，气机驳杂'],
    clues: ['内蕴温热，却有许多杂质阻隔', '可见少量源气，成色不会太高'],
  },
  {
    id: 'pure', name: '纯净源', tier: 2, weight: 2500, ratio: 1,
    surfaces: ['纹理向石心收束', '触手温润，气息绵长'],
    clues: ['源气平稳，应有纯净源凝结', '石心气机内敛，价值接近石价'],
  },
  {
    id: 'different', name: '异种源', tier: 3, weight: 1100, ratio: 2,
    surfaces: ['石皮深处闪过异色霞光', '细纹明灭，隐有道韵流转'],
    clues: ['异色道韵聚而不散，可能蕴有异种源', '石心精气远胜寻常纯净源'],
    anomaly: '石缝中透出一缕异色霞光，围观者纷纷加价。',
  },
  {
    id: 'divine', name: '神源', tier: 4, weight: 350, ratio: 4,
    surfaces: ['靠近时气血微微共鸣', '石纹自行明灭，似有神曦沉浮'],
    clues: ['神性精气不散，石心很不寻常', '源气浓郁如水，可能封有大块神源'],
    anomaly: '一线神曦自石皮下冲出，整座外园骤然安静。',
  },
  {
    id: 'wonder', name: '绝世奇源', tier: 5, weight: 50, ratio: 8,
    surfaces: ['观之竟令神识微痛', '石中传来若有若无的生命律动'],
    clues: ['天机混沌难明，石中可能藏有绝世奇源', '所有源纹都在避开石心，异象极不寻常'],
    anomaly: '刀锋尚未深入，石中已传出大道鸣音。',
  },
];

const GROUND_OUTCOMES = [
  {
    id: 'empty', name: '空石', tier: 0, weight: 2500, ratio: 0,
    surfaces: COMMON_OUTCOMES[0].surfaces, clues: COMMON_OUTCOMES[0].clues,
  },
  {
    id: 'ominous', name: '凶源', tier: 0, weight: 800, ratio: 0, danger: true, sealed: true,
    surfaces: ['石皮存在封合痕迹', '阴气贴地不散'],
    clues: ['源气逆行，石中所封之物带有凶性', '封纹并非天然形成，贸然切开恐有灾祸'],
    anomaly: '裂口渗出黑雾，冰冷杀意令刀师连退数步。',
  },
  {
    id: 'different', name: '异种源', tier: 2, weight: 2700, ratio: 0.6,
    surfaces: COMMON_OUTCOMES[3].surfaces, clues: COMMON_OUTCOMES[3].clues,
  },
  {
    id: 'divine', name: '神源', tier: 3, weight: 2500, ratio: 1.1,
    surfaces: COMMON_OUTCOMES[4].surfaces, clues: COMMON_OUTCOMES[4].clues,
  },
  {
    id: 'divine_liquid', name: '神源液', tier: 4, weight: 1000, ratio: 1.7,
    item: { name: '神源液', class: '丹药', amount: 1 }, fragile: true,
    surfaces: ['石皮湿润，缝隙中凝有金色露珠', '轻晃时石心似有水声'],
    clues: ['生命精气化液，可能孕有神源液', '石心柔软，仙珍极易被粗暴刀法损伤'],
    anomaly: '金色液珠从刀痕中沁出，浓郁生命气息弥漫石园。',
  },
  {
    id: 'immortal_fragment', name: '仙金残块', tier: 5, weight: 400, ratio: 4,
    itemPool: FRAGMENTS,
    surfaces: ['石中偶有金属颤音', '石皮局部坚逾精铁'],
    clues: ['似有金属鸣音，可能封着仙金残块', '五行源气避让石心，内蕴之物极其坚硬'],
    anomaly: '刀锋与石心相触，竟迸出一串大道火花。',
  },
  {
    id: 'scripture_page', name: '羽化仙经残页', tier: 5, weight: 100, ratio: 6,
    item: { name: '羽化仙经残页', class: '材料', amount: 1 }, fragile: true,
    surfaces: ['石纹如羽，似在缓慢舒展', '偶有诵经声从石心传出'],
    clues: ['纸页般的道痕层层叠合，可能封有古经残页', '羽化道韵被石皮遮蔽，切石时须格外谨慎'],
    anomaly: '洁白光羽绕石而生，一角古老经页若隐若现。',
  },
];

const SKY_OUTCOMES = [
  {
    id: 'empty', name: '空石', tier: 0, weight: 2300, ratio: 0,
    surfaces: COMMON_OUTCOMES[0].surfaces, clues: COMMON_OUTCOMES[0].clues,
  },
  {
    id: 'ominous', name: '凶源', tier: 0, weight: 1500, ratio: 0, danger: true, sealed: true,
    surfaces: GROUND_OUTCOMES[1].surfaces, clues: GROUND_OUTCOMES[1].clues,
    anomaly: '血色源气自裂缝喷涌，虚空中响起凄厉哭声。',
  },
  {
    id: 'ancient_creature', name: '封印太古生物', tier: 1, weight: 700, ratio: 0, danger: true, sealed: true,
    surfaces: ['石皮存在细密封纹', '石心传出沉缓搏动'],
    clues: ['生命律动并非仙珍，更像沉眠的太古生灵', '封合痕迹年代久远，石内凶物尚有生机'],
    anomaly: '石皮骤然鼓动，一股太古凶威横扫天字号石园。',
  },
  {
    id: 'divine', name: '大块神源', tier: 3, weight: 3000, ratio: 0.9,
    surfaces: COMMON_OUTCOMES[4].surfaces, clues: COMMON_OUTCOMES[4].clues,
  },
  {
    id: 'divine_liquid', name: '神源液', tier: 4, weight: 1500, ratio: 1.5,
    item: { name: '神源液', class: '丹药', amount: 1 }, fragile: true,
    surfaces: GROUND_OUTCOMES[4].surfaces, clues: GROUND_OUTCOMES[4].clues,
    anomaly: GROUND_OUTCOMES[4].anomaly,
  },
  {
    id: 'herb_king', name: '八万年药王', tier: 5, weight: 600, ratio: 2.5,
    item: { name: '八万年药王', class: '丹药', amount: 1 }, fragile: true,
    surfaces: ['石皮生有根须般的天然细纹', '靠近时可闻到转瞬即逝的药香'],
    clues: ['草木生机被锁在石心，可能封有药王', '石中仙珍枝叶脆弱，不宜一刀剖开'],
    anomaly: '一缕药香冲起，枯萎草叶竟在石旁重新泛青。',
  },
  {
    id: 'immortal_fragment', name: '仙金残块', tier: 5, weight: 300, ratio: 4,
    itemPool: FRAGMENTS,
    surfaces: GROUND_OUTCOMES[5].surfaces, clues: GROUND_OUTCOMES[5].clues,
    anomaly: GROUND_OUTCOMES[5].anomaly,
  },
  {
    id: 'scripture_page', name: '羽化仙经残页', tier: 5, weight: 100, ratio: 6,
    item: { name: '羽化仙经残页', class: '材料', amount: 1 }, fragile: true,
    surfaces: GROUND_OUTCOMES[6].surfaces, clues: GROUND_OUTCOMES[6].clues,
    anomaly: GROUND_OUTCOMES[6].anomaly,
  },
];

export const STONE_GARDENS = [
  {
    id: 'outer', name: '外园', currency: '灵石', basePrice: 50000,
    dailyLimit: 3, sourceExchangeRate: 10, sealCost: 5000, dangerDamage: 0.05,
    outcomes: COMMON_OUTCOMES,
  },
  {
    id: 'ground', name: '地字号', currency: '源石', basePrice: 300000,
    dailyLimit: 2, sourceExchangeRate: 1, sealCost: 100000, dangerDamage: 0.12,
    outcomes: GROUND_OUTCOMES,
  },
  {
    id: 'sky', name: '天字号', currency: '源石', basePrice: 2000000,
    dailyLimit: 1, sourceExchangeRate: 1, sealCost: 500000, dangerDamage: 0.25,
    outcomes: SKY_OUTCOMES,
  },
];

export const STONE_KING_CONFIG = {
  contribution: 300000,
  target: 3,
};

export const STONE_KINGS = [
  { id: 'nine_orifices', name: '九窍石人', omen: '九窍天成，疑有圣灵孕生', item: FRAGMENTS[2] },
  { id: 'immortal_tomb', name: '仙坟', omen: '药香与阴气并存，生死难料', item: { name: '八万年药王', class: '丹药', amount: 1 } },
  { id: 'demon_fetus', name: '魔胎', omen: '石胎搏动，似有古老生命沉眠', item: { name: '上古神源液', class: '丹药', amount: 1 } },
  { id: 'blood_altar', name: '血祭台', omen: '血纹如火，封印下杀机不散', item: { name: '不死神凰血', class: '材料', amount: 1 } },
];

const PRICE_FACTORS = [0.78, 0.9, 1, 1.15, 1.35];
const SURFACE_SIGNALS = {
  promising: ['石皮内蕴温热', '敲击时似有金属鸣音', '纹理向石心缓慢收束'],
  poor: ['源气断续难续', '石皮存在封合痕迹', '阴气贴着石皮不散'],
};
const DEEP_SIGNALS = {
  promising: ['源气内敛而绵长', '石心传来细微回响', '五行精气向内部汇聚'],
  poor: ['源纹在中途断裂', '石心气机外散', '内部波动驳杂而微弱'],
};
const KING_OUTCOMES = [
  { id: 'source', name: '源海', weight: 5500, source: 200000 },
  { id: 'treasure', name: '神华冲霄', weight: 2500, source: 400000 },
  { id: 'jackpot', name: '无价仙珍', weight: 800, source: 900000, grantsItem: true },
  { id: 'danger', name: '绝世凶变', weight: 1200, source: 0, damage: 0.2 },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomIndex(length, random) {
  return Math.min(length - 1, Math.floor(random() * length));
}

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const target = randomIndex(index + 1, random);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function drawWeighted(items, random) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}

function isPromising(outcome) {
  return !outcome.danger && outcome.ratio >= 1;
}

function makeSignal(outcome, accuracy, field, random) {
  const truthful = random() < accuracy;
  const promising = truthful ? isPromising(outcome) : !isPromising(outcome);
  const signals = field === 'surfaces' ? SURFACE_SIGNALS : DEEP_SIGNALS;
  const pool = promising ? signals.promising : signals.poor;
  return { text: pool[randomIndex(pool.length, random)], truthful, promising };
}

function getSourceRank(player) {
  return { 源师: 1, 源地师: 2, 源天师: 3 }[player?.occupation] || 0;
}

function getInsightAccuracy(player, clarityBonus = 0) {
  const base = { 0: 0.55, 1: 0.65, 2: 0.75, 3: 0.8 }[getSourceRank(player)];
  const levelBonus = getSourceRank(player)
    ? Math.min(0.05, Math.max(0, Number(player?.occupation_level) - 1) * 0.001)
    : 0;
  return Math.min(0.85, base + levelBonus + clarityBonus);
}

function generateGarden(garden, clarityBonus, random) {
  const forms = drawSourceStoneForms(5, random);
  const factors = shuffle(PRICE_FACTORS, random);
  return {
    inspectedIds: [],
    purchasedIds: [],
    clarityBonus,
    stones: forms.map((form, index) => {
      const rawOutcome = drawWeighted(garden.outcomes, random);
      const outcome = {
        ...rawOutcome,
        item: rawOutcome.itemPool
          ? rawOutcome.itemPool[randomIndex(rawOutcome.itemPool.length, random)]
          : rawOutcome.item,
      };
      const signal = makeSignal(outcome, 0.52, 'surfaces', random);
      return {
        id: index + 1,
        name: form.name,
        price: Math.round(garden.basePrice * factors[index] / 1000) * 1000,
        surfaces: [
          { text: form.appearance, truthful: null },
          signal,
        ],
        terrainAligned: random() < (outcome.danger ? 0.15 : outcome.ratio >= 1 ? 0.75 : 0.35),
        outcome,
        inspection: null,
        purchased: false,
        cut: false,
      };
    }),
  };
}

export function getShanghaiDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getStoneWeekKey(now = new Date()) {
  const day = Math.floor(Date.parse(`${getShanghaiDateKey(now)}T00:00:00Z`) / 86400000);
  return String(Math.floor((day + 3) / 7));
}

export function getStoneGarden(name = '外园') {
  const aliases = { 外园: 'outer', 地字号: 'ground', 天字号: 'sky', outer: 'outer', ground: 'ground', sky: 'sky' };
  const id = aliases[name];
  return STONE_GARDENS.find(garden => garden.id === id);
}

export function createStoneMarketState(player, options = {}) {
  const random = options.random || Math.random;
  const emptyStreak = Math.max(0, Number(player?.源石坊连续空石) || 0);
  const clarityBonus = emptyStreak >= 5 ? 0.1 : 0;
  return {
    version: 1,
    dateKey: getShanghaiDateKey(options.now),
    activeGarden: 'outer',
    heavenlyCheckUsed: false,
    pending: null,
    gardens: Object.fromEntries(
      STONE_GARDENS.map(garden => [garden.id, generateGarden(garden, clarityBonus, random)])
    ),
  };
}

export function inspectStone(state, gardenId, stoneId, player, options = {}) {
  const random = options.random || Math.random;
  const garden = getStoneGarden(gardenId);
  const batch = state?.gardens?.[garden?.id];
  const stone = batch?.stones?.find(item => item.id === Number(stoneId));
  if (!garden || !batch || !stone) throw new Error('没有这块源石');
  if (stone.purchased || stone.cut) throw new Error('这块源石已经离开石架');
  if (stone.inspection) throw new Error('这块源石今日已经勘验过');
  if (batch.inspectedIds.length >= 2) throw new Error('今日两次勘石机会已经用完');

  const rank = getSourceRank(player);
  const accuracy = getInsightAccuracy(player, batch.clarityBonus);
  const clueCount = rank >= 1 ? 2 : 1;
  const signals = Array.from(
    { length: clueCount },
    () => makeSignal(stone.outcome, accuracy, 'clues', random)
  );
  const lines = signals.map((signal, index) => `线索${index + 1}：${signal.text}`);

  let valueSignal = null;
  if (rank >= 1) {
    const truthful = random() < Math.max(0.55, accuracy - 0.15);
    const promising = truthful ? isPromising(stone.outcome) : !isPromising(stone.outcome);
    valueSignal = {
      text: promising ? '价值约在石价上下，或有溢价' : '价值多半低于石价',
      truthful,
      promising,
    };
    lines.push(`价值判断：${valueSignal.text}`);
  }
  if (rank >= 2) {
    const aligned = random() < accuracy ? stone.terrainAligned : !stone.terrainAligned;
    const dangerous = random() < accuracy ? Boolean(stone.outcome.danger) : !stone.outcome.danger;
    lines.push(`地势判断：${aligned ? '石与本园地势相合' : '石与本园地势相冲'}`);
    lines.push(`凶机判断：${dangerous ? '阴煞不散，须防凶源' : '暂未察觉明显凶机'}`);
  }

  stone.inspection = { signals, valueSignal, lines, accuracy };
  batch.inspectedIds.push(stone.id);
  return { stone, lines, accuracy };
}

export function useHeavenlyCheck(state, gardenId, stoneId, player) {
  if (player?.occupation !== '源天师') throw new Error('只有源天师能够施展辨伪源术');
  if (state?.heavenlyCheckUsed) throw new Error('今日的天师辨石机会已经用过');
  const garden = getStoneGarden(gardenId);
  const stone = state?.gardens?.[garden?.id]?.stones?.find(item => item.id === Number(stoneId));
  if (!garden || !stone) throw new Error('没有这块源石');
  if (stone.purchased || stone.cut) throw new Error('这块源石已经离开石架');

  state.heavenlyCheckUsed = true;
  if (stone.outcome.sealed) {
    return '源天眼示警：石皮确有后天封合，内部生命或凶源尚未寂灭。';
  }
  const signals = [
    ...stone.surfaces,
    ...(stone.inspection?.signals || []),
    stone.inspection?.valueSignal,
  ].filter(Boolean);
  const falseSignal = signals.find(signal => signal.truthful === false);
  return falseSignal
    ? `源天眼辨伪：“${falseSignal.text}”是一条假象。`
    : '源天眼扫过石皮：未见封合，当前所见线索没有作伪。';
}

export function getCutExtraCost(stone, gardenId, method) {
  const garden = getStoneGarden(gardenId);
  if (!garden || !stone) throw new Error('待切源石状态异常');
  if (method === 'layered') return { currency: garden.currency, amount: Math.ceil(stone.price * 0.1) };
  if (method === 'sealed') return { currency: '源石', amount: garden.sealCost };
  return { currency: garden.currency, amount: 0 };
}

export function getLayeredPreview(stone, gardenId) {
  const garden = getStoneGarden(gardenId);
  if (!garden || !stone) throw new Error('待切源石状态异常');
  const needsDecision = Boolean(stone.outcome.danger || stone.outcome.fragile || stone.outcome.ratio >= 2);
  if (!needsDecision) return { needsDecision: false };
  const buybackRate = stone.outcome.danger ? 1.05 : stone.outcome.ratio >= 4 ? 0.95 : 0.8;
  return {
    needsDecision: true,
    anomaly: stone.outcome.anomaly,
    offer: Math.floor(stone.price * buybackRate),
    currency: garden.currency,
  };
}

export function resolveStoneCut(stone, gardenId, method, options = {}) {
  const random = options.random || Math.random;
  const garden = getStoneGarden(gardenId);
  if (!garden || !stone || !['one', 'layered', 'sealed'].includes(method)) {
    throw new Error('切石方式或源石状态异常');
  }
  const outcome = stone.outcome;
  if (outcome.danger) {
    if (method === 'sealed') {
      return {
        outcomeName: outcome.name,
        sourceValue: Math.floor(stone.price * 0.35 / garden.sourceExchangeRate),
        items: [], damageRate: 0, empty: false, suppressed: true, damaged: false,
      };
    }
    return {
      outcomeName: outcome.name,
      sourceValue: 0,
      items: [], damageRate: garden.dangerDamage, empty: false, suppressed: false, damaged: false,
    };
  }
  if (outcome.id === 'empty') {
    return {
      outcomeName: outcome.name,
      sourceValue: 0, items: [], damageRate: 0, empty: true, suppressed: false, damaged: false,
    };
  }
  if (outcome.item) {
    const damaged = method === 'one' && outcome.fragile && random() < 0.35;
    return {
      outcomeName: outcome.name,
      sourceValue: damaged ? Math.floor(stone.price * 0.15 / garden.sourceExchangeRate) : 0,
      items: damaged ? [] : [{ ...outcome.item }],
      damageRate: 0, empty: false, suppressed: false, damaged,
    };
  }
  return {
    outcomeName: outcome.name,
    sourceValue: Math.floor(stone.price * outcome.ratio / garden.sourceExchangeRate),
    items: [], damageRate: 0, empty: false, suppressed: false, damaged: false,
  };
}

export function calculateBlindReturn(gardenId) {
  const garden = getStoneGarden(gardenId);
  const totalWeight = garden.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
  return garden.outcomes.reduce(
    (sum, outcome) => sum + outcome.weight * outcome.ratio / totalWeight,
    0
  );
}

export function getWeeklyStoneKing(now = new Date()) {
  const weekKey = getStoneWeekKey(now);
  const index = Number(weekKey) % STONE_KINGS.length;
  return { weekKey, king: STONE_KINGS[index] };
}

export function createStoneKingState(options = {}) {
  const random = options.random || Math.random;
  const { weekKey, king } = getWeeklyStoneKing(options.now);
  return {
    version: 1,
    weekKey,
    kingId: king.id,
    participants: [],
    opened: false,
    outcome: { ...drawWeighted(KING_OUTCOMES, random) },
  };
}

export function resolveStoneKing(state, options = {}) {
  if (!state || state.opened || state.participants.length < STONE_KING_CONFIG.target) {
    throw new Error('镇园石王尚未达到开切条件');
  }
  const king = STONE_KINGS.find(item => item.id === state.kingId);
  if (!king || !KING_OUTCOMES.some(item => item.id === state.outcome?.id)) {
    throw new Error('镇园石王状态异常');
  }
  const random = options.random || Math.random;
  const itemWinner = state.outcome.grantsItem
    ? state.participants[randomIndex(state.participants.length, random)]
    : null;
  state.opened = true;
  return { king, outcome: state.outcome, itemWinner, item: itemWinner ? king.item : null };
}
