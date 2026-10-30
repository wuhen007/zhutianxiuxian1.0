import { randomInt } from 'node:crypto';

export const MARKET_RULES = Object.freeze({
  tickMs: 600_000, feeBps: 30, maxShares: 100_000,
  maxHoldingCost: 1_000_000_000, tipCost: 1_000, auditCost: 5_000,
  cooldownMs: 30_000, maxReplay: 1008,
  loanMin: 10_000, loanMax: 50_000_000, loanAssetMultiple: 2,
  loanDailyBps: 10, loanTermMs: 7 * 86_400_000,
});

export const MARKET_STOCKS = Object.freeze([
  { id: '1', name: '丹鼎阁', sector: '丹药', risk: '低', limitBps: 500, volatility: 65 },
  { id: '2', name: '天工坊', sector: '炼器', risk: '低', limitBps: 500, volatility: 75 },
  { id: '3', name: '灵矿商会', sector: '矿脉', risk: '中', limitBps: 1000, volatility: 120 },
  { id: '4', name: '万兽山', sector: '灵兽', risk: '中', limitBps: 1000, volatility: 130 },
  { id: '5', name: '四海商盟', sector: '商路', risk: '中', limitBps: 1000, volatility: 110 },
  { id: '6', name: '太虚符行', sector: '符箓', risk: '中', limitBps: 1000, volatility: 130 },
  { id: '7', name: '问天秘境', sector: '秘境', risk: '高', limitBps: 1500, volatility: 210 },
  { id: '8', name: '渡劫仙舟', sector: '仙舟', risk: '高', limitBps: 1500, volatility: 200 },
]);

export const MARKET_NPCS = Object.freeze([
  { id: 'qian', name: '钱万三', title: '四海掌柜', style: 'value', bio: '精于算账，偏爱低估商会；也会看错基本面。' },
  { id: 'bai', name: '白知微', title: '丹道客卿', style: 'value', bio: '熟悉丹药供需，对秘境与仙舟常常判断失准。' },
  { id: 'lu', name: '陆听风', title: '百晓消息贩', style: 'broker', bio: '消息灵通，真话与传闻混着卖，收钱也不保证兑现。' },
  { id: 'mo', name: '墨九', title: '黑金操盘客', style: 'operator', bio: '擅长聚拢人气，尤其喜欢邀请持仓者一起“护盘”。' },
  { id: 'shen', name: '沈红绫', title: '逐浪游资', style: 'momentum', bio: '追逐强势板块，撤退很快，也常被假突破套牢。' },
  { id: 'han', name: '韩小满', title: '散修新客', style: 'retail', bio: '追涨时壮志凌云，下跌时心惊胆战。' },
  { id: 'ning', name: '宁不争', title: '逆势老修', style: 'contrarian', bio: '越跌越想买，遇到连续下跌也会深套。' },
  { id: 'yan', name: '燕归鸿', title: '商路行脚客', style: 'broker', bio: '带来各地商路见闻，消息可能已经过时。' },
]);

const EVENTS = [
  ['新矿脉现世，商会组织勘探', 1],
  ['宗门采购增加，订单传来利好', 1],
  ['护送商队遇袭，货物损失待核', -1],
  ['炼制失手，交货延期引来质疑', -1],
  ['大宗订单流言四起，尚待商会证实', 1],
  ['账目争议发酵，几家客商暂缓合作', -1],
];
const fmt = value => Number(value).toLocaleString('zh-CN');
const signed = value => `${value > 0 ? '+' : ''}${fmt(value)}`;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const slotOf = now => Math.floor(now / MARKET_RULES.tickMs);
const dateOf = slot => new Date(slot * MARKET_RULES.tickMs + 8 * 3_600_000).toISOString().slice(0, 10);
const hourOf = slot => new Date(slot * MARKET_RULES.tickMs + 8 * 3_600_000).getUTCHours();
const tradingSlot = slot => hourOf(slot) >= 8;
export const marketTime = now => new Date(now).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
export const marketOpen = now => tradingSlot(slotOf(now));

function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('灵市数值超出有效范围。');
  return value;
}

function random(state) {
  let x = state.rng >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.rng = x >>> 0;
  return state.rng / 0x100000000;
}

function choose(state, values) {
  return values[Math.floor(random(state) * values.length)];
}

export function marketLimits(stock) {
  if (stock.delistedAt !== undefined) return { lower: 0, upper: 0 };
  return {
    lower: Math.max(1, Math.ceil(stock.close * (10000 - stock.limitBps) / 10000)),
    upper: Math.max(1, Math.floor(stock.close * (10000 + stock.limitBps) / 10000)),
  };
}

function fee(value) {
  return Math.ceil(integer(value) * MARKET_RULES.feeBps / 10000);
}

function addNews(state, text, stockId = null, speaker = null) {
  state.news.push({ slot: state.slot, text, stockId, speaker });
  state.news = state.news.slice(-80);
}

export function createMarket(now = Date.now(), seed = randomInt(1, 0xffffffff)) {
  integer(now); integer(seed, 1, 0xffffffff);
  const slot = slotOf(now);
  const stocks = MARKET_STOCKS.map(item => ({
    ...item, price: 10000, close: 10000, day: dateOf(slot), changeBps: 0,
    volume: 0, netVolume: 0, history: [{ slot, price: 10000, netVolume: 0 }],
  }));
  const npcs = MARKET_NPCS.map((item, index) => ({
    ...item, cash: item.style === 'operator' ? 100_000_000 : 20_000_000,
    holdings: Object.fromEntries(stocks.map(stock => [stock.id, { shares: 100 + index * 20, cost: (100 + index * 20) * stock.price }])),
    realized: 0, fees: 0, trades: [], plan: null,
  }));
  const state = { version: 1, slot, rng: seed, stocks, npcs, news: [] };
  addNews(state, '万界灵市开张。初始每股一万灵石；消息与邀约皆含交易对手的立场。');
  return state;
}

export function validateMarket(state) {
  if (state?.version !== 1 || !Array.isArray(state.stocks) || !Array.isArray(state.npcs) || !Array.isArray(state.news)) {
    throw new Error('灵市存档格式异常，已暂停结算，请检查 data/lingshi-market.json。');
  }
  integer(state.slot); integer(state.rng, 1, 0xffffffff);
  if (state.stocks.length !== MARKET_STOCKS.length || state.npcs.length !== MARKET_NPCS.length) throw new Error('灵市商会或人物记录缺失。');
  for (const definition of MARKET_STOCKS) {
    const stock = state.stocks.find(item => item.id === definition.id);
    if (!stock || stock.name !== definition.name || stock.limitBps !== definition.limitBps ||
      stock.volatility !== definition.volatility || !Array.isArray(stock.history) || !stock.history.length ||
      !/^\d{4}-\d{2}-\d{2}$/.test(stock.day)) throw new Error('灵市报价记录异常。');
    const delisted = stock.delistedAt !== undefined;
    integer(stock.price, delisted ? 0 : 1, delisted ? 0 : 1_000_000_000);
    if (delisted) integer(stock.delistedAt);
    integer(stock.close, 1, 1_000_000_000);
    integer(stock.volume); integer(stock.netVolume, -Number.MAX_SAFE_INTEGER);
    if (!Number.isFinite(stock.changeBps)) throw new Error('灵市涨跌记录异常。');
    for (const point of stock.history) {
      integer(point.slot); integer(point.price, 0, 1_000_000_000);
    }
    if (stock.cycle) {
      const cycle = stock.cycle;
      if (!['boom', 'slump', 'crisis'].includes(cycle.type) || !['recovery', 'bankruptcy'].includes(cycle.outcome)) throw new Error('灵市商会事件记录异常。');
      integer(cycle.startSlot); integer(cycle.endSlot, cycle.startSlot + 1);
      integer(cycle.driftBps, -1000, 1000);
    }
  }
  for (const definition of MARKET_NPCS) {
    const npc = state.npcs.find(item => item.id === definition.id);
    if (!npc || npc.style !== definition.style || !Array.isArray(npc.trades)) throw new Error('灵市人物记录异常。');
    integer(npc.cash); integer(npc.realized, -Number.MAX_SAFE_INTEGER); integer(npc.fees);
    for (const stock of state.stocks) {
      const holding = npc.holdings?.[stock.id];
      if (!holding) throw new Error('灵市人物持仓缺失。');
      integer(holding.shares); integer(holding.cost);
    }
    if (npc.plan && (!state.stocks.some(stock => stock.id === npc.plan.stockId) ||
      !['accumulate', 'pump', 'distribute', 'cooldown'].includes(npc.plan.phase) ||
      !Number.isSafeInteger(npc.plan.left) || npc.plan.left < 1)) throw new Error('灵市人物行动记录异常。');
  }
  return state;
}

function npcTrade(state, npc, stock, side, wanted) {
  if (stock.delistedAt !== undefined) return 0;
  const holding = npc.holdings[stock.id];
  let shares = Math.max(0, Math.floor(wanted));
  if (side === 'buy') {
    shares = Math.min(shares, Math.floor(npc.cash / (stock.price * 1.003 + 1)));
  } else shares = Math.min(shares, holding.shares);
  if (!shares) return 0;
  const amount = stock.price * shares;
  const charge = fee(amount);
  if (side === 'buy') {
    npc.cash -= amount + charge;
    holding.shares += shares;
    holding.cost += amount + charge;
  } else {
    const basis = shares === holding.shares ? holding.cost : Math.floor(holding.cost * shares / holding.shares);
    npc.cash += amount - charge;
    npc.realized += amount - charge - basis;
    holding.shares -= shares;
    holding.cost -= basis;
  }
  npc.fees += charge;
  npc.trades.push({ slot: state.slot, stockId: stock.id, side, shares, price: stock.price });
  npc.trades = npc.trades.slice(-24);
  stock.volume += shares;
  return side === 'buy' ? shares : -shares;
}

function operatorAction(state, npc, flows) {
  const activeStocks = state.stocks.filter(stock => stock.delistedAt === undefined);
  if (npc.plan && state.stocks.find(stock => stock.id === npc.plan.stockId).delistedAt !== undefined) npc.plan = null;
  if (!activeStocks.length) return;
  if (!npc.plan) npc.plan = { stockId: choose(state, activeStocks).id, phase: 'accumulate', left: 4 + Math.floor(random(state) * 4) };
  const plan = npc.plan;
  const stock = state.stocks.find(item => item.id === plan.stockId);
  const holding = npc.holdings[stock.id];
  const size = 250 + Math.floor(random(state) * 250);
  if (plan.phase === 'accumulate') flows[stock.id] += npcTrade(state, npc, stock, 'buy', size);
  if (plan.phase === 'pump') {
    flows[stock.id] += npcTrade(state, npc, stock, 'buy', size);
    const words = ['大订单就快有消息了！', '前景正好，我愿以身家担保！', '我已经上船，熟人可别错过这阵风。'];
    addNews(state, `墨九谈起${stock.name}，在茶楼拍桌：“${words[plan.left % words.length]}”`, stock.id, npc.id);
  }
  if (plan.phase === 'distribute') {
    const flow = npcTrade(state, npc, stock, 'sell', Math.max(size, Math.ceil(holding.shares / plan.left)));
    flows[stock.id] += flow;
    plan.sold = (plan.sold || 0) - flow;
    const words = ['只是一时洗盘，道友可别轻易交出筹码。', '这阵波动接得住，后面才吃得到肉。',
      '你先拿稳，我替你盯着盘面。', '筹码的事晚点再说，先陪我喝盏茶。'];
    addNews(state, `墨九谈起${stock.name}：“${words[plan.left % words.length]}”`, stock.id, npc.id);
  }
  plan.left -= 1;
  if (plan.left > 0) return;
  const next = { accumulate: 'pump', pump: 'distribute', distribute: 'cooldown', cooldown: null }[plan.phase];
  if (plan.phase === 'distribute') {
    addNews(state, plan.sold
      ? `大宗成交回报：墨九本轮减持${stock.name}${fmt(plan.sold)}股，茶楼里有人高呼“主力跑路”，也有人仍在接盘。`
      : `墨九对${stock.name}的造势未能聚起筹码，这一轮空手收场。`, stock.id);
  }
  npc.plan = next ? { ...plan, phase: next, left: next === 'pump' ? 3 : 4 } : null;
}

function updateCompanyCycle(state, stock) {
  if (stock.delistedAt !== undefined) return;
  const cycle = stock.cycle;
  if (cycle && state.slot >= cycle.endSlot) {
    stock.cycle = null;
    stock.eventDay = dateOf(state.slot);
    if (cycle.type === 'crisis' && cycle.outcome === 'bankruptcy') {
      stock.price = 0;
      stock.changeBps = -10000;
      stock.delistedAt = state.slot;
      stock.history.push({ slot: state.slot, price: 0, netVolume: 0 });
      stock.history = stock.history.slice(-160);
      for (const npc of state.npcs) {
        const holding = npc.holdings[stock.id];
        npc.realized -= holding.cost;
        holding.shares = 0; holding.cost = 0;
        if (npc.plan?.stockId === stock.id) npc.plan = null;
      }
      addNews(state, `【退市清算】${stock.name}资不抵债，救援告败，股权清偿价值为0。全部持有人承担该股剩余本金损失；退市清算不受每日跌停限制。`, stock.id);
      return;
    }
    addNews(state, cycle.type === 'crisis'
      ? `【危机复核】${stock.name}获得援助，暂时保住商号。恢复经营仍需时日，股价继续由市场决定。`
      : `【事件落幕】${stock.name}的${cycle.type === 'boom' ? '扩张利好' : '经营逆风'}影响告一段落，接下来仍可能上涨或下跌。`, stock.id);
    return;
  }
  if (stock.eventDay === dateOf(state.slot)) return;
  stock.eventDay = dateOf(state.slot);
  if (stock.cycle) return;
  const probability = { 低: .06, 中: .12, 高: .20 }[stock.risk];
  if (random(state) >= probability) return;
  const roll = random(state);
  const type = roll < .5 ? 'boom' : roll < .8 ? 'slump' : 'crisis';
  const days = type === 'crisis' ? 3 + Math.floor(random(state) * 3) : 4 + Math.floor(random(state) * 6);
  const bankruptcy = type === 'crisis' && random(state) < { 低: .10, 中: .25, 高: .45 }[stock.risk];
  stock.cycle = { type, startSlot: state.slot, endSlot: state.slot + days * 144,
    driftBps: Math.round(stock.limitBps * .3) * (type === 'boom' ? 1 : -1),
    outcome: bankruptcy ? 'bankruptcy' : 'recovery' };
  const text = type === 'boom' ? `【重大利好】${stock.name}突破生产瓶颈，获得跨界长约，进入持续扩张期。利好也可能已被抢先交易。`
    : type === 'slump' ? `【经营逆风】${stock.name}订单锐减、资金回笼放缓，未来数日经营承压。`
      : `【退市风险预警】${stock.name}发现巨额亏空，进入救援复核，预计${marketTime(stock.cycle.endSlot * MARKET_RULES.tickMs)}公布结果。救援成功可继续经营，失败则退市，股权可能归零。`;
  addNews(state, text, stock.id);
}

function tickMarket(state) {
  for (const stock of state.stocks) {
    if (stock.delistedAt !== undefined) continue;
    if (stock.day !== dateOf(state.slot)) {
      stock.close = stock.price;
      stock.day = dateOf(state.slot);
      stock.volume = 0;
    }
  }
  if (!tradingSlot(state.slot)) return;
  for (const stock of state.stocks) updateCompanyCycle(state, stock);
  const activeStocks = state.stocks.filter(stock => stock.delistedAt === undefined);
  if (!activeStocks.length) return;
  const flows = Object.fromEntries(state.stocks.map(stock => [stock.id, 0]));
  const shocks = Object.fromEntries(state.stocks.map(stock => [stock.id, 0]));
  if (random(state) < .24) {
    const stock = choose(state, activeStocks);
    const [text, direction] = choose(state, EVENTS);
    shocks[stock.id] = direction * (70 + Math.floor(random(state) * 180));
    addNews(state, `${stock.name}：${text}。`, stock.id);
  }
  for (const npc of state.npcs) {
    if (npc.style === 'operator') { operatorAction(state, npc, flows); continue; }
    if (random(state) < .28) continue;
    const stock = npc.id === 'bai' && state.stocks[0].delistedAt === undefined && random(state) < .65
      ? state.stocks[0] : choose(state, activeStocks);
    const trend = stock.changeBps;
    const offset = (stock.price / stock.close - 1) * 10000;
    let buying = random(state) < .5;
    if (npc.style === 'value') buying = offset < -50 || (offset < 80 && random(state) < .55);
    if (npc.style === 'contrarian') buying = trend < 0;
    if (npc.style === 'momentum' || npc.style === 'retail') buying = trend >= 0;
    const shares = 30 + Math.floor(random(state) * (npc.style === 'momentum' ? 400 : 150));
    flows[stock.id] += npcTrade(state, npc, stock, buying ? 'buy' : 'sell', shares);
  }
  const common = Math.round((random(state) - .5) * 60);
  for (const stock of activeStocks) {
    const previous = stock.price;
    const { lower, upper } = marketLimits(stock);
    const pressure = clamp(flows[stock.id] / 4, -180, 180);
    const stepBps = Math.round((random(state) - .5) * stock.volatility * 2 + common + shocks[stock.id] + pressure + (stock.cycle?.driftBps || 0));
    stock.price = clamp(Math.round(previous * (10000 + stepBps) / 10000), lower, Math.min(upper, 1_000_000_000));
    stock.changeBps = Math.round((stock.price / previous - 1) * 10000);
    stock.netVolume = flows[stock.id];
    stock.history.push({ slot: state.slot, price: stock.price, netVolume: stock.netVolume });
    stock.history = stock.history.slice(-160);
  }
}

export function advanceMarket(market, now = Date.now()) {
  validateMarket(market); integer(now);
  const state = structuredClone(market);
  const target = slotOf(now);
  let steps = 0;
  while (state.slot < target && steps < MARKET_RULES.maxReplay) {
    state.slot += 1;
    tickMarket(state);
    steps += 1;
  }
  return { state, changed: steps > 0, catchingUp: state.slot < target };
}

function findStock(market, value) {
  return market.stocks.find(stock => stock.id === value || stock.name === value);
}

function findNpc(market, value) {
  return market.npcs.find(npc => npc.id === value || npc.name === value);
}

function newAccount() {
  return { version: 1, holdings: {}, invested: 0, realized: 0, intelCost: 0, fees: 0, lastTradeAt: null,
    contacts: {}, tips: [], chats: {}, receipts: [], trades: [], financeCost: 0, loan: null };
}

function readAccount(player) {
  const account = structuredClone(player.灵市 || newAccount());
  if (account.version !== 1 || !account.holdings || !account.contacts ||
    !account.chats || !Array.isArray(account.tips) || !Array.isArray(account.receipts) || !Array.isArray(account.trades)) {
    throw new Error('个人灵市存档异常，请联系管理员核对。');
  }
  for (const key of ['invested', 'intelCost', 'fees']) integer(account[key]);
  account.financeCost ??= 0;
  account.loan ??= null;
  integer(account.financeCost);
  if (account.loan !== null) {
    const loan = account.loan;
    if (typeof loan !== 'object') throw new Error('灵市借据格式异常。');
    integer(loan.initialPrincipal, MARKET_RULES.loanMin, MARKET_RULES.loanMax);
    integer(loan.principal, 1, loan.initialPrincipal);
    integer(loan.interestCharged, 1, loan.initialPrincipal);
    integer(loan.interest, 0, loan.interestCharged);
    integer(loan.openedAt); integer(loan.accruedDays);
    if (loan.dueAt !== loan.openedAt + MARKET_RULES.loanTermMs || account.financeCost < loan.interestCharged) {
      throw new Error('灵市借据账目异常。');
    }
  }
  integer(account.realized, -Number.MAX_SAFE_INTEGER);
  if (account.lastTradeAt !== null) integer(account.lastTradeAt);
  for (const [id, holding] of Object.entries(account.holdings)) {
    if (!MARKET_STOCKS.some(stock => stock.id === id)) throw new Error('个人灵市持仓编号异常。');
    integer(holding.shares, 1, MARKET_RULES.maxShares); integer(holding.cost);
  }
  for (const [id, relation] of Object.entries(account.contacts)) {
    if (!MARKET_NPCS.some(npc => npc.id === id)) throw new Error('灵市往来人物记录异常。');
    integer(relation.favor, 0, 100); integer(relation.verified); integer(relation.wrong);
  }
  for (const tip of account.tips) {
    integer(tip.slot); integer(tip.at);
    if (!MARKET_NPCS.some(npc => npc.id === tip.npcId) || !MARKET_STOCKS.some(stock => stock.id === tip.stockId) ||
      typeof tip.resolved !== 'boolean' || typeof tip.message !== 'string') throw new Error('灵市消息记录异常。');
    if (tip.kind !== 'audit') { integer(tip.price, 1); if (![1, -1].includes(tip.direction)) throw new Error('灵市消息方向记录异常。'); }
  }
  return account;
}

function accrueLoan(account, now) {
  if (!account.loan) return { changed: false, charge: 0 };
  integer(now);
  const loan = account.loan;
  const days = Math.floor(Math.max(0, now - loan.openedAt) / 86_400_000);
  if (days <= loan.accruedDays) return { changed: false, charge: 0 };
  const daily = Math.ceil(loan.principal * MARKET_RULES.loanDailyBps / 10000);
  const charge = Math.min(daily * (days - loan.accruedDays), loan.initialPrincipal - loan.interestCharged);
  const financeCost = integer(account.financeCost + charge);
  loan.interest += charge;
  loan.interestCharged += charge;
  loan.accruedDays = days;
  account.financeCost = financeCost;
  return { changed: true, charge };
}

export function getMarketPortfolio(player, market, { now = Date.now() } = {}) {
  const account = readAccount(player);
  accrueLoan(account, now);
  const rows = Object.entries(account.holdings).map(([id, holding]) => {
    const stock = findStock(market, id);
    const value = integer(stock.price * holding.shares);
    return { id, name: stock.name, shares: holding.shares, cost: holding.cost, value,
      profit: value - fee(value) - holding.cost, price: stock.price };
  });
  const value = rows.reduce((sum, row) => integer(sum + row.value), 0);
  const floating = rows.reduce((sum, row) => integer(sum + row.profit, -Number.MAX_SAFE_INTEGER), 0);
  const profit = integer(account.realized + floating - account.intelCost - account.financeCost, -Number.MAX_SAFE_INTEGER);
  const invested = integer(account.invested + account.intelCost);
  const liquidation = rows.reduce((sum, row) => integer(sum + row.value - fee(row.value)), 0);
  const debt = account.loan ? integer(account.loan.principal + account.loan.interest) : 0;
  const netAssets = integer(Number(player.灵石 || 0) + liquidation - debt, -Number.MAX_SAFE_INTEGER);
  return { rows, value, profit, floating, realized: account.realized, intelCost: account.intelCost,
    invested, rate: invested ? profit / invested * 100 : 0, liquidation, debt, netAssets,
    financeCost: account.financeCost, principal: account.loan?.principal || 0, interest: account.loan?.interest || 0,
    dueAt: account.loan?.dueAt, overdue: Boolean(account.loan && now >= account.loan.dueAt), insolvent: netAssets < 0 };
}

function debtStatus(player, market, now) {
  const stats = getMarketPortfolio(player, market, { now });
  if (!stats.debt) return `【四海钱庄·债务】当前无欠款。累计借款利息${fmt(stats.financeCost)}灵石。`;
  return [
    `【四海钱庄·债务】${stats.insolvent ? '资不抵债' : stats.overdue ? '借据逾期' : '借据履行中'}`,
    `剩余本金${fmt(stats.principal)}｜未还利息${fmt(stats.interest)}｜本息合计${fmt(stats.debt)}灵石`,
    `到期：${marketTime(stats.dueAt)}｜净资产${signed(stats.netAssets)}灵石`,
    stats.overdue ? '钱万三叩了叩借据：“期限已过，先把账结了。股票亏掉，借据可不会跟着消失。”'
      : stats.insolvent ? '钱万三收起笑容：“现有资产已经抵不过欠款，先卖出余仓，慢慢还账。”'
        : '钱万三：“先看清借据，涨跌是你的，本息也得由你来还。”',
    '逾期或资不抵债时暂停新买入；仍可卖股、还款和修炼赚灵石。',
    '#灵市还款 数量 / #灵市还款 全部（尽现有灵石偿还）',
  ].join('\n');
}

function loanCommand(player, account, market, command, text, confirmation, now) {
  const balance = integer(Number(player.灵石 || 0));
  const stats = getMarketPortfolio(player, market, { now });
  if (command === '灵市借款') {
    if (account.loan) return { ok: false, message: `钱万三：“旧账${fmt(stats.debt)}灵石尚未结清，先还这一笔。”` };
    const amount = /^\d+$/.test(text || '') ? Number(text) : NaN;
    const limit = Math.min(MARKET_RULES.loanMax, Math.max(0, balance + stats.liquidation) * MARKET_RULES.loanAssetMultiple);
    if (!Number.isSafeInteger(amount) || amount < MARKET_RULES.loanMin || amount > limit) {
      return { ok: false, message: `借款需填写整数，至少${fmt(MARKET_RULES.loanMin)}灵石；按当前现金和持仓预估卖出净额，额度为${fmt(limit)}灵石，最高${fmt(MARKET_RULES.loanMax)}。` };
    }
    const interest = Math.ceil(amount * MARKET_RULES.loanDailyBps / 10000);
    const dueAt = now + MARKET_RULES.loanTermMs;
    const terms = [
      `【四海钱庄借据】本金${fmt(amount)}灵石｜期限7天｜日息0.1%（单利）`,
      `借出先计首日利息${fmt(interest)}灵石，此后每满24小时按剩余本金计息，逐日向上取整。累计利息最高为本笔初始本金。`,
      `到期：${marketTime(dueAt)}。股票亏损或退市仍需还本付息，净资产可能跌为负数。`,
    ].join('\n');
    if (confirmation !== '确认') return { ok: true, changed: false, message: `${terms}\n签借据并到账：#灵市借款 ${amount} 确认` };
    const nextBalance = integer(balance + amount);
    const financeCost = integer(account.financeCost + interest);
    account.loan = { initialPrincipal: amount, principal: amount, interest, interestCharged: interest,
      openedAt: now, dueAt, accruedDays: 0 };
    account.financeCost = financeCost;
    return { ok: true, balance: nextBalance, message: `${terms}\n【借款到账】随身灵石${fmt(nextBalance)}；当前欠款${fmt(amount + interest)}灵石。` };
  }
  if (!account.loan) return { ok: false, message: '四海钱庄账上没有你的欠款。' };
  const amount = text === '全部' ? Math.min(balance, stats.debt) : /^\d+$/.test(text || '') ? Number(text) : NaN;
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > balance || amount > stats.debt) {
    return { ok: false, message: `请输入正整数还款额；当前灵石${fmt(balance)}，本息${fmt(stats.debt)}。也可 #灵市还款 全部，尽现有灵石偿还。` };
  }
  const interestPaid = Math.min(amount, account.loan.interest);
  account.loan.interest -= interestPaid;
  account.loan.principal -= amount - interestPaid;
  const remaining = account.loan.principal + account.loan.interest;
  if (!remaining) account.loan = null;
  return { ok: true, balance: balance - amount, message: [
    `【钱庄还款】本次${fmt(amount)}灵石，其中利息${fmt(interestPaid)}、本金${fmt(amount - interestPaid)}。`,
    `剩余欠款${fmt(remaining)}｜随身灵石${fmt(balance - amount)}`,
    remaining ? '钱万三将这笔收款记在借据上：“还差这些，慢慢结。”' : '钱万三划去借据：“本息两清，道友可以重新开张了。”',
  ].join('\n') };
}

function contact(account, npc) {
  return account.contacts[npc.id] ||= { favor: 0, verified: 0, wrong: 0 };
}

function hash(text) {
  let result = 2166136261;
  for (const char of text) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

function makeTip(account, market, npc, stock, now) {
  const relation = contact(account, npc);
  const recent = stock.history.slice(-4);
  const trend = stock.price >= recent[0].price ? 1 : -1;
  const adverse = npc.style === 'operator' && npc.plan?.stockId === stock.id &&
    ['pump', 'distribute'].includes(npc.plan.phase) && npc.holdings[stock.id].shares > 0;
  const roll = hash(`${market.slot}:${npc.id}:${stock.id}:tip`) / 0x100000000;
  // 消息依据当前可见趋势和立场生成；未来行情不参与回答。
  const direction = adverse ? 1 : roll < .6 + Math.min(relation.favor, 40) / 400 ? trend : -trend;
  const clue = adverse
    ? `“${stock.name}的大行情才开始。${account.holdings[stock.id] ? '你手上的筹码要拿稳，最好再补一些' : '现在上船，还能坐在前排'}。”`
    : direction > 0 ? `“${stock.name}这阵子有客商照应，我偏向看涨。风向一变，我也会走。”`
      : `“${stock.name}的盘面让我不安，我宁愿先收回些灵石。”`;
  const message = [
    `【向${npc.name}打听·花费${fmt(MARKET_RULES.tipCost)}灵石】`,
    `${npc.name}压低声音：${clue}`,
    account.holdings[stock.id] ? '他留意到你也是这家商会的持有人，特意与你攀起交情。' : '他说这是熟人间的消息，你尚不清楚他的真实仓位。',
    `这是交易对手的判断；30分钟后可 #灵市追问 ${npc.name} 核验后续方向。`,
    `查实近期成交：#灵市查账 ${npc.name} ${stock.name}`,
  ].join('\n');
  return { id: `${market.slot}:${npc.id}`, slot: market.slot, at: now, npcId: npc.id,
    stockId: stock.id, price: stock.price, direction, resolved: false, message };
}

function tradePlayer(player, account, market, side, stock, text, now) {
  if (stock.delistedAt !== undefined) return { ok: false, message: `${stock.name}已退市，股权清偿价值为0，交易已终止。` };
  if (!marketOpen(now)) return { ok: false, message: '灵市已休市，交易时段为北京时间08:00—24:00。持仓、消息和旧账仍可查看。' };
  const balance = integer(Number(player.灵石 || 0));
  const holding = account.holdings[stock.id];
  const quantity = side === 'sell' && text === '全部' ? holding?.shares : /^\d+$/.test(text || '') ? Number(text) : NaN;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MARKET_RULES.maxShares) {
    return { ok: false, message: `股数请输入1—${fmt(MARKET_RULES.maxShares)}的整数；卖出可填“全部”。` };
  }
  if (account.lastTradeAt !== null && now - account.lastTradeAt < MARKET_RULES.cooldownMs) {
    return { ok: false, message: '交易间隔为30秒，请稍后再下单。' };
  }
  const amount = integer(stock.price * quantity);
  const charge = fee(amount);
  let nextBalance;
  if (side === 'buy') {
    const stats = getMarketPortfolio(player, market, { now });
    if (stats.overdue || stats.insolvent) return { ok: false, message: `${debtStatus(player, market, now)}\n当前暂停新买入，请先处理欠款。` };
    const heldCost = Object.values(account.holdings).reduce((sum, item) => sum + item.cost, 0);
    if ((holding?.shares || 0) + quantity > MARKET_RULES.maxShares || heldCost + amount + charge > MARKET_RULES.maxHoldingCost) {
      return { ok: false, message: `单股最多${fmt(MARKET_RULES.maxShares)}股，持仓总成本上限${fmt(MARKET_RULES.maxHoldingCost)}灵石。` };
    }
    if (balance < amount + charge) return { ok: false, message: `买入需${fmt(amount + charge)}灵石（含手续费${fmt(charge)}），当前${fmt(balance)}。` };
    integer(account.invested + amount + charge);
    nextBalance = balance - amount - charge;
    const next = holding || { shares: 0, cost: 0 };
    next.shares += quantity; next.cost += amount + charge;
    account.holdings[stock.id] = next;
    account.invested += amount + charge;
  } else {
    if (!holding || quantity > holding.shares) return { ok: false, message: `${stock.name}可卖${fmt(holding?.shares || 0)}股，持仓不足。` };
    nextBalance = integer(balance + amount - charge);
    const basis = quantity === holding.shares ? holding.cost : Math.floor(holding.cost * quantity / holding.shares);
    integer(account.realized + amount - charge - basis, -Number.MAX_SAFE_INTEGER);
    account.realized += amount - charge - basis;
    holding.shares -= quantity; holding.cost -= basis;
    if (!holding.shares) delete account.holdings[stock.id];
  }
  account.fees = integer(account.fees + charge);
  account.lastTradeAt = now;
  account.trades.push({ at: now, stockId: stock.id, side, shares: quantity, price: stock.price });
  account.trades = account.trades.slice(-40);
  return { ok: true, balance: nextBalance, message: [
    `【${side === 'buy' ? '买入' : '卖出'}成功】${stock.name} × ${fmt(quantity)}股`,
    `成交价：${fmt(stock.price)}灵石/股｜成交额：${fmt(amount)}`,
    `手续费：${fmt(charge)}｜${side === 'buy' ? '支出' : '到手'}：${fmt(side === 'buy' ? amount + charge : amount - charge)}灵石`,
    `剩余灵石：${fmt(nextBalance)}`,
    stock.cycle?.type === 'crisis' ? '该商会处于退市风险复核期：救援失败，剩余股权可能全部归零。'
      : '买卖以本次报价成交；持仓随全服行情一起涨跌，商会可能出现重大利好或经营危机。',
  ].join('\n') };
}

export const MARKET_HELP = [
  '【万界灵市】北京时间08:00—24:00交易，每10分钟更新行情。',
  '#灵市 / #股市：行情图；#股票详情 丹鼎阁：走势与消息',
  '#买入 丹鼎阁 100 / #卖出 丹鼎阁 50（支持编号，卖出可填全部）',
  '#我的股票 / #灵市排行榜 / #灵市收益榜',
  '#灵市借款 2000000：查看借据；加“确认”签约到账；#灵市债务：查看本息与净资产',
  '#灵市还款 数量 / #灵市还款 全部：先还利息，再还本金，全天可还',
  '#灵市人物：认识八位客商；#灵市交谈 墨九：免费交谈',
  '#灵市打听 墨九 丹鼎阁：1000灵石/条；省略商会时优先聊你的持仓',
  '#灵市查账 墨九 丹鼎阁：5000灵石/次，查最近成交和当下持仓',
  '#灵市追问 墨九：30分钟后核验消息方向，留下往来记录',
  '#灵市消息 / #灵市帮助',
  '初价10000灵石/股；每日涨跌停按昨收±5%/10%/15%；买卖各收0.3%，手续费向上取整。',
  '股数为整数；30秒交易间隔；单股最多10万股，持仓总成本最多10亿灵石。',
  '重大利好可推动跨日连续上涨；持续利空可导致大幅回撤。',
  '商会危机会提前公开预警，复核失败退市归零，亏完该股投入；退市清算不受每日跌停限制。',
  '自有灵石现货最多亏完投入；主动借款后仍需还本付息，净资产可能为负。',
  '钱庄额度为现有现金及持仓预估卖出净额的2倍、最高5000万；每次仅一笔借据，7天到期，日息0.1%单利。',
  '借出先计首日息，此后每满24小时计息；累计利息封顶初始本金。逾期或资不抵债暂停新买入，仍可卖股还债。',
].join('\n');

export function runMarketCommand(player, market, input, { now = Date.now(), requestId = '' } = {}) {
  try {
    integer(now);
    const account = readAccount(player);
    const accrued = accrueLoan(account, now);
    const losses = [];
    for (const [id, holding] of Object.entries(account.holdings)) {
      const stock = findStock(market, id);
      if (stock.delistedAt === undefined) continue;
      account.realized = integer(account.realized - holding.cost, -Number.MAX_SAFE_INTEGER);
      account.trades.push({ at: stock.delistedAt * MARKET_RULES.tickMs, stockId: id,
        side: 'writeoff', shares: holding.shares, price: 0 });
      account.trades = account.trades.slice(-40);
      losses.push(`${stock.name}${fmt(holding.shares)}股退市清算，回收0灵石，确认本金及买入费用损失${fmt(holding.cost)}灵石。`);
      delete account.holdings[id];
    }
    const result = runMarketRequest({ ...player, 灵市: account }, market, input, { now, requestId });
    const notices = [];
    if (losses.length) notices.push(`【股权归零结算】${losses.join('\n')}`);
    if (accrued.charge) notices.push(`【钱庄计息】新增利息${fmt(accrued.charge)}灵石，已记入借据。`);
    const nextAccount = result.account || account;
    if (nextAccount.loan) {
      const stats = getMarketPortfolio({ ...player, 灵市: nextAccount, 灵石: result.balance ?? player.灵石 }, market, { now });
      if (stats.overdue || stats.insolvent) notices.push(
        `【${stats.overdue ? '钱万三催债' : '资不抵债'}】尚欠${fmt(stats.debt)}灵石，净资产${signed(stats.netAssets)}。暂停新买入，可卖股或 #灵市还款。`);
    }
    const changed = Boolean(result.changed || losses.length || accrued.changed);
    const notice = notices.join('\n');
    return { ...result, changed, ...(changed ? { account: nextAccount } : {}), notice,
      message: [notice, result.message].filter(Boolean).join('\n') };
  } catch (error) {
    return { ok: false, changed: false, message: error.message };
  }
}

function runMarketRequest(player, market, input, { now, requestId }) {
  try {
    integer(now);
    const tokens = String(input).trim().replace(/^#/, '').split(/\s+/);
    const [command, target, arg] = tokens;
    const account = readAccount(player);
    const mutating = ['买入', '卖出', '灵市打听', '灵市查账', '灵市交谈', '灵市追问', '灵市借款', '灵市还款'].includes(command);
    const key = requestId ? String(requestId).slice(0, 160) : '';
    const receipt = mutating && key && account.receipts.find(item => item.id === key);
    if (receipt) return { ok: true, changed: false, message: receipt.message };
    if (market.slot !== slotOf(now) && mutating && command !== '灵市还款') return { ok: false, changed: false, message: '灵市正在补算行情，稍后再试；当前暂停新交易和收费互动，还款仍可进行。' };
    if (tokens.length > (['买入', '卖出', '灵市打听', '灵市查账', '灵市借款'].includes(command) ? 3 : 2)) return { ok: false, changed: false, message: MARKET_HELP };
    let result;
    if (['灵市', '股市'].includes(command)) return { ok: true, changed: false, panel: 'market', message: MARKET_HELP };
    if (['股票详情', '股票走势'].includes(command)) {
      const stock = findStock(market, target);
      return stock ? { ok: true, changed: false, panel: 'stock', stockId: stock.id } : { ok: false, changed: false, message: '请填写商会名称或编号，如 #股票详情 丹鼎阁。' };
    }
    if (command === '我的股票') return { ok: true, changed: false, panel: 'portfolio', portfolio: getMarketPortfolio(player, market, { now }) };
    if (command === '灵市债务') return { ok: true, changed: false, message: debtStatus(player, market, now) };
    if (command === '灵市帮助') return { ok: true, changed: false, message: MARKET_HELP };
    if (command === '灵市消息') return { ok: true, changed: false, message: ['【灵市风声·公开传闻】', ...market.news.slice(-10).map(item => `${marketTime(item.slot * MARKET_RULES.tickMs)}\n${item.text}`)].join('\n') };
    if (command === '灵市人物') return { ok: true, changed: false, message: ['【灵市人物】', ...market.npcs.map(npc => {
      const relation = account.contacts[npc.id] || { favor: 0, verified: 0, wrong: 0 };
      return `${npc.name}｜${npc.title}\n${npc.bio}\n熟悉度${relation.favor}｜消息事后方向兑现${relation.verified}，未兑现${relation.wrong}`;
    }), '发送 #灵市交谈 人名 / #灵市打听 人名 商会名'].join('\n\n') };
    if (command === '灵市借款' || command === '灵市还款') {
      result = loanCommand(player, account, market, command, target, arg, now);
    } else if (command === '买入' || command === '卖出') {
      const stock = findStock(market, target);
      if (!stock) return { ok: false, changed: false, message: '请填写商会名称或编号，如 #买入 丹鼎阁 100。' };
      result = tradePlayer(player, account, market, command === '买入' ? 'buy' : 'sell', stock, arg, now);
    } else {
      const npc = findNpc(market, target);
      if (!npc) return { ok: false, changed: false, message: '请先用 #灵市人物 查看客商名号。' };
      const relation = contact(account, npc);
      const preferred = Object.keys(account.holdings).find(id => id === npc.plan?.stockId) || Object.keys(account.holdings)[0];
      const stock = findStock(market, arg || preferred || npc.plan?.stockId || '1');
      if (['灵市打听', '灵市查账', '灵市交谈'].includes(command) && !stock) return { ok: false, changed: false, message: '商会名称或编号有误。' };
      if (command === '灵市交谈') {
        const cached = account.chats[npc.id];
        if (cached?.slot === market.slot) return { ok: true, changed: false, message: cached.message };
        relation.favor = Math.min(100, relation.favor + 1);
        const owned = npc.holdings[stock.id].shares > 0;
        const recent = npc.trades.at(-1);
        const words = {
          operator: owned ? `“${stock.name}我也有份。你若愿意同行，咱们就是自己人。”` : '“灵石落袋才踏实。道友，改日我再带你看新机会。”',
          value: '“账目、供需、成交都要看。好商会也有买贵的时候。”',
          broker: '“茶楼里九分消息一分酒，转过三条街，味道早变了。”',
          momentum: '“强势我就跟，转弱我就撤；上次撤慢一步，赔了不少。”',
          retail: recent?.side === 'sell' ? '“我刚割了肉，它可千万别立刻涨回来……”' : '“大家都说要涨，我是不是该再买一点？”',
          contrarian: '“人人害怕时我想买，可底下还有没有底，我也吃不准。”',
        };
        const mood = npc.realized < 0 ? '提到前次亏损，他的神色有些不自然。'
          : npc.realized > 0 ? '他掂着刚回笼的灵石，谈兴正浓。' : '他不时望向茶楼里的行情牌。';
        const history = relation.wrong ? `你提起上次没有兑现的消息，他与你说话时多了几分小心。` : '';
        const credit = npc.id === 'qian' && account.loan ? `\n${debtStatus(player, market, now)}` : '';
        const message = `${npc.name}看着${player.名号 || '道友'}：${words[npc.style]}\n${mood}${history}\n熟悉度${relation.favor}。熟悉度影响交流，不代表消息必定正确。${credit}`;
        account.chats[npc.id] = { slot: market.slot, message };
        result = { ok: true, message };
      } else if (command === '灵市打听' || command === '灵市查账') {
        const kind = command === '灵市查账' ? 'audit' : 'tip';
        if (kind === 'tip' && stock.delistedAt !== undefined) {
          return { ok: false, changed: false, message: `${stock.name}已经退市归零，客商也没有继续交易该股的机会。可查账查看持仓损失。` };
        }
        const cacheId = `${market.slot}:${npc.id}:${kind}`;
        const cached = account.tips.find(item => item.cacheId === cacheId);
        if (cached) return { ok: true, changed: false, message: cached.message };
        const balance = integer(Number(player.灵石 || 0));
        const cost = kind === 'audit' ? MARKET_RULES.auditCost : MARKET_RULES.tipCost;
        if (balance < cost) return { ok: false, changed: false, message: `本次需要${fmt(cost)}灵石，当前余额不足。` };
        integer(account.intelCost + cost);
        let tip;
        if (kind === 'tip') tip = makeTip(account, market, npc, stock, now);
        else {
          const trades = npc.trades.filter(trade => trade.stockId === stock.id).slice(-4);
          const holding = npc.holdings[stock.id];
          const message = [
            `【成交查账·${npc.name} / ${stock.name}】花费${fmt(cost)}灵石`,
            ...trades.map(trade => `${marketTime(trade.slot * MARKET_RULES.tickMs)}：${trade.side === 'buy' ? '买入' : '卖出'}${fmt(trade.shares)}股，单价${fmt(trade.price)}`),
            trades.length ? '' : '近期暂无该商会成交记录。',
            `当前持仓${fmt(holding.shares)}股；本人可用灵石${fmt(npc.cash)}；历史已实现盈亏${signed(npc.realized)}。`,
            '查账披露已发生的成交，不包含下一步计划。',
          ].filter(Boolean).join('\n');
          tip = { slot: market.slot, at: now, npcId: npc.id, stockId: stock.id, kind, resolved: true, message };
        }
        tip.cacheId = cacheId;
        account.tips.push(tip);
        account.tips = account.tips.slice(-64);
        account.intelCost += cost;
        result = { ok: true, balance: balance - cost, message: tip.message };
      } else if (command === '灵市追问') {
        const tips = account.tips.filter(tip => tip.npcId === npc.id && !tip.resolved && now - tip.at >= 1_800_000);
        if (!tips.length) return { ok: true, changed: false, message: `${npc.name}：“等盘面多走几步，再来对账。”\n尚无满30分钟且未核验的消息。` };
        const lines = [];
        for (const tip of tips) {
          const advised = findStock(market, tip.stockId);
          if (advised.history[0].slot > tip.slot) {
            tip.resolved = true;
            lines.push(`${advised.name}：核验行情已过保存期，本条不计兑现次数。`);
            continue;
          }
          // 固定采用消息发布后30分钟的首次盘面；晚追问不改变历史结论。
          const referenceSlot = Math.ceil((tip.at + 1_800_000) / MARKET_RULES.tickMs);
          const point = advised.history.find(item => item.slot >= referenceSlot) ||
            (advised.delistedAt !== undefined && market.slot >= referenceSlot ? { price: 0 } : null);
          if (!point) {
            if (market.slot - tip.slot > 160) { tip.resolved = true; lines.push(`${advised.name}：核验行情已过保存期，本条不计兑现次数。`); }
            else lines.push(`${advised.name}：30分钟后的首个报价尚未生成，继续等待下一次开市行情。`);
            continue;
          }
          const correct = (point.price - tip.price) * tip.direction > 0;
          tip.resolved = true;
          relation[correct ? 'verified' : 'wrong'] += 1;
          relation.favor = clamp(relation.favor + (correct ? 1 : -3), 0, 100);
          lines.push(`${advised.name}：打听时${fmt(tip.price)} → 核验时${fmt(point.price)}，当时看${tip.direction > 0 ? '涨' : '跌'}，${correct ? '方向兑现' : '方向未兑现'}。`);
        }
        const changed = tips.some(tip => tip.resolved);
        return { ok: true, changed, account: changed ? account : undefined, message: [
          `【找${npc.name}对账】`, ...lines,
          relation.wrong ? (npc.style === 'operator'
            ? `${npc.name}：“那会儿我急着落袋，话没说全。你往后多看成交，少听我吹。”`
            : `${npc.name}：“风向变得比我快，是我话说满了。往后你多对几家消息。”`)
            : `${npc.name}：“这次说中了，往后也别全押在我的消息上。”`,
          `累计方向兑现${relation.verified}次，未兑现${relation.wrong}次；熟悉度${relation.favor}。`,
        ].join('\n') };
      } else return { ok: false, changed: false, message: MARKET_HELP };
    }
    if (!result.ok || result.changed === false) return { ...result, changed: false };
    if (key) {
      account.receipts.push({ id: key, message: result.message });
      account.receipts = account.receipts.slice(-40);
    }
    return { ...result, changed: true, account };
  } catch (error) {
    return { ok: false, changed: false, message: error.message };
  }
}

export function buildMarketPanel(market, player, { kind = 'market', stockId, notice = '', now = Date.now() } = {}) {
  const portfolio = getMarketPortfolio(player, market, { now });
  const selected = stockId ? findStock(market, stockId) : null;
  const stocks = selected ? [selected] : market.stocks;
  const rows = stocks.map(stock => {
    const limits = marketLimits(stock);
    const movement = (stock.price / stock.close - 1) * 100;
    return { id: stock.id, name: stock.name, sector: stock.sector, price: fmt(stock.price),
      upper: fmt(limits.upper), lower: fmt(limits.lower), change: `${movement > 0 ? '+' : ''}${movement.toFixed(2)}%`,
      step: `${stock.changeBps > 0 ? '+' : ''}${(stock.changeBps / 100).toFixed(2)}%`,
      up: movement >= 0, risk: stock.risk,
      status: stock.delistedAt !== undefined ? '退市归零' : stock.cycle?.type === 'crisis' ? '退市预警'
        : stock.price >= limits.upper ? '涨停' : stock.price <= limits.lower ? '跌停' : '交易中',
      warning: stock.cycle?.type === 'crisis'
        ? `${stock.name}：${marketTime(stock.cycle.endSlot * MARKET_RULES.tickMs)}复核，失败可能退市归零。` : '' };
  });
  let chart = null;
  if (selected) {
    const points = selected.history.slice(-60);
    const low = Math.min(...points.map(point => point.price));
    const high = Math.max(...points.map(point => point.price));
    const span = high - low || Math.max(10, low * .01);
    chart = { points: points.map((point, index) =>
      `${(30 + index / Math.max(1, points.length - 1) * 700).toFixed(1)},${(170 - (point.price - low) / span * 125).toFixed(1)}`).join(' '),
    low: fmt(low), high: fmt(high), start: marketTime(points[0].slot * MARKET_RULES.tickMs),
    end: marketTime(points.at(-1).slot * MARKET_RULES.tickMs) };
  }
  return {
    kind, title: kind === 'portfolio' ? `${player.名号 || '道友'}的持仓` : selected ? `${selected.name} · 行情与风声` : '万界灵市',
    time: marketTime(market.slot * MARKET_RULES.tickMs),
    status: market.slot < slotOf(now) ? '行情补算中' : marketOpen(now) ? '开市中' : '休市中',
    rows, chart, notice,
    tradingRestricted: portfolio.overdue || portfolio.insolvent,
    warnings: rows.filter(row => row.warning).map(row => row.warning),
    portfolio: portfolio.rows.map(row => ({ ...row, shares: fmt(row.shares), cost: fmt(row.cost),
      value: fmt(row.value), profit: signed(row.profit), up: row.profit >= 0 })),
    summary: `持仓市值 ${fmt(portfolio.value)}｜净盈亏 ${signed(portfolio.profit)}｜收益率 ${portfolio.rate.toFixed(2)}%`,
    balance: fmt(Number(player.灵石 || 0)),
    debtSummary: portfolio.debt ? `钱庄欠款 ${fmt(portfolio.debt)}（本金 ${fmt(portfolio.principal)}＋利息 ${fmt(portfolio.interest)}）` : '',
    netAssets: portfolio.debt ? `净资产 ${signed(portfolio.netAssets)}｜${portfolio.insolvent ? '资不抵债' : portfolio.overdue ? '借据逾期' : '借据履行中'}｜到期 ${marketTime(portfolio.dueAt)}` : '',
    news: market.news.filter(item => !selected || item.stockId === selected.id).slice(-5).reverse().map(item => ({
      time: marketTime(item.slot * MARKET_RULES.tickMs), text: item.text,
    })),
    footer: '08:00—24:00开市 · 每10分钟更新 · 买卖各收0.3% · 退市可能亏完该股投入',
  };
}
