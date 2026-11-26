import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import template from 'art-template';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import {
  MARKET_HELP, MARKET_RULES, createMarket, advanceMarket, marketLimits, marketOpen,
  validateMarket, runMarketCommand, getMarketPortfolio, buildMarketPanel,
} from '../model/lingshiMarket.js';

const opening = Date.parse('2026-10-29T08:00:00+08:00');
const step = MARKET_RULES.tickMs;
const player = () => ({ 名号: '测试修士', 灵石: 20_000_000 });
function act(person, market, command, options = {}) {
  const result = runMarketCommand(person, market, command, { now: market.slot * step, ...options });
  if (result.changed) {
    person.灵市 = result.account;
    if (result.balance !== undefined) person.灵石 = result.balance;
  }
  return result;
}

test('按整数股扣费，部分卖出按成本分摊，清仓后账目可核对', () => {
  const market = createMarket(opening, 123);
  const person = player();
  assert.equal(act(person, market, '#买入 丹鼎阁 100').ok, true);
  assert.equal(person.灵石, 18_997_000);
  assert.deepEqual(person.灵市.holdings['1'], { shares: 100, cost: 1_003_000 });
  assert.equal(getMarketPortfolio(person, market).profit, -6000);
  assert.equal(act(person, market, '#卖出 1 40', { now: opening + 30_000 }).ok, true);
  assert.equal(person.灵市.holdings['1'].cost, 601800);
  assert.equal(person.灵市.realized, -2400);
  assert.equal(act(person, market, '#卖出 丹鼎阁 全部', { now: opening + 60_000 }).ok, true);
  assert.deepEqual(person.灵市.holdings, {});
  assert.equal(person.灵石, 19_994_000);
  assert.equal(getMarketPortfolio(person, market).profit, -6000);
});

test('坏输入、超额持仓、余额不足、休市和行情未补完均不扣灵石', () => {
  const market = createMarket(opening, 123);
  const person = player();
  for (const command of [
    '#买入 丹鼎阁 -1', '#买入 丹鼎阁 1.5', '#买入 丹鼎阁 1e4',
    '#买入 __proto__ 1', '#买入 1 100001', '#买入 1 0', '#买入 1 100000',
    '#卖出 1 全部', '#买入 丹鼎阁 1 多余参数', '#灵市查账 墨九 __proto__',
  ]) {
    const before = structuredClone(person);
    assert.equal(act(person, market, command).ok, false, command);
    assert.deepEqual(person, before, command);
  }
  assert.equal(act(person, market, '#买入 1 1', { now: opening + step }).ok, false);
  const night = createMarket(Date.parse('2026-10-29T02:00:00+08:00'), 1);
  assert.equal(marketOpen(night.slot * step), false);
  assert.equal(act(person, night, '#买入 1 1').ok, false);
  assert.equal(act({ 灵石: Number.MAX_SAFE_INTEGER + 1 }, market, '#买入 1 1').changed, false);
});

test('重复消息回执与30秒冷却避免重复扣款，失败下单保持存档原样', () => {
  const market = createMarket(opening, 99);
  const person = player();
  const first = act(person, market, '#买入 1 10', { requestId: 'message-1' });
  const saved = structuredClone(person);
  const again = act(person, market, '#买入 1 10', { requestId: 'message-1' });
  assert.equal(again.message, first.message);
  assert.equal(again.changed, false);
  assert.deepEqual(person, saved);
  assert.equal(act(person, market, '#买入 1 1', { now: opening + 29_999, requestId: 'message-2' }).ok, false);
  assert.deepEqual(person, saved);
});

test('行情保存后重启与连续推进一致，同一时段刷新不重掷价格', () => {
  const initial = createMarket(opening, 9876);
  const direct = advanceMarket(initial, opening + step * 72).state;
  const first = advanceMarket(initial, opening + step * 36).state;
  const restarted = JSON.parse(JSON.stringify(first));
  const second = advanceMarket(restarted, opening + step * 72).state;
  assert.deepEqual(second, direct);
  assert.equal(advanceMarket(second, opening + step * 72).changed, false);
  assert.deepEqual(initial, createMarket(opening, 9876));
  const delayed = advanceMarket(initial, opening + step * (MARKET_RULES.maxReplay + 10));
  assert.equal(delayed.catchingUp, true);
  assert.equal(advanceMarket(delayed.state, opening + step * (MARKET_RULES.maxReplay + 10)).catchingUp, false);
});

test('NPC真买真卖、资金与份额守恒，操盘客按有限持仓出货', () => {
  let market = createMarket(opening, 42);
  const startShares = market.npcs.find(npc => npc.id === 'mo').holdings;
  let bought = 0, sold = 0;
  for (let index = 1; index <= 92; index += 1) {
    const before = market;
    market = advanceMarket(market, opening + index * step).state;
    for (const oldNpc of before.npcs) {
      const npc = market.npcs.find(item => item.id === oldNpc.id);
      const valuation = candidate => candidate.cash + before.stocks.reduce((total, stock) =>
        total + candidate.holdings[stock.id].shares * stock.price, 0);
      assert.equal(valuation(npc), valuation(oldNpc) - (npc.fees - oldNpc.fees));
      assert.ok(npc.cash >= 0);
      for (const holding of Object.values(npc.holdings)) assert.ok(holding.shares >= 0);
    }
    for (const stock of market.stocks) {
      const bounds = marketLimits(stock);
      assert.ok(stock.price >= bounds.lower && stock.price <= bounds.upper);
    }
    const operator = market.npcs.find(npc => npc.id === 'mo');
    for (const trade of operator.trades.filter(item => item.slot === market.slot)) {
      if (trade.side === 'buy') bought += trade.shares;
      else sold += trade.shares;
    }
  }
  assert.ok(bought > 0 && sold > 0);
  assert.ok(sold <= bought + Object.values(startShares).reduce((sum, holding) => sum + holding.shares, 0));
  assert.ok(market.news.some(item => /主力跑路/.test(item.text)));
});

test('午夜收盘基准重设，夜间不交易，次日8点恢复', () => {
  let market = createMarket(Date.parse('2026-10-29T23:50:00+08:00'), 42);
  market.stocks[0].price = 10400;
  const midnight = Date.parse('2026-10-30T00:00:00+08:00');
  market = advanceMarket(market, midnight).state;
  assert.equal(market.stocks[0].close, 10400);
  const night = advanceMarket(market, midnight + 7 * 3_600_000).state;
  assert.equal(night.stocks[0].price, 10400);
  const nextMorning = advanceMarket(night, midnight + 8 * 3_600_000).state;
  assert.equal(nextMorning.stocks[0].close, 10400);
  assert.equal(nextMorning.stocks[0].history.at(-1).slot, nextMorning.slot);
});

test('消息贩按时段缓存，闲聊熟悉度每时段只加一次，查账可见实盘减持', () => {
  let market = createMarket(opening, 77);
  const person = player();
  act(person, market, '#灵市交谈 墨九');
  const favor = person.灵市.contacts.mo.favor;
  act(person, market, '#灵市交谈 墨九');
  assert.equal(person.灵市.contacts.mo.favor, favor);
  const first = act(person, market, '#灵市打听 墨九 丹鼎阁');
  const balance = person.灵石;
  assert.equal(first.ok, true);
  const cached = act(person, market, '#灵市打听 墨九 天工坊');
  assert.equal(cached.message, first.message);
  assert.equal(person.灵石, balance);
  assert.equal(person.灵市.intelCost, 1000);

  market = advanceMarket(market, opening + 14 * step).state;
  const npc = market.npcs.find(item => item.id === 'mo');
  const last = npc.trades.at(-1);
  const audited = act(person, market, `#灵市查账 墨九 ${last.stockId}`);
  assert.match(audited.message, /当前持仓/);
  assert.match(audited.message, /历史已实现盈亏/);
  assert.equal(person.灵市.intelCost, 6000);
  assert.equal(getMarketPortfolio(person, market).profit, -6000);
});

test('有仓位时会收到操盘客的护盘邀约，后续行情仍不受打听行为改写', () => {
  const market = createMarket(opening, 77);
  const npc = market.npcs.find(item => item.id === 'mo');
  npc.plan = { stockId: '1', phase: 'distribute', left: 3 };
  const person = player();
  act(person, market, '#买入 1 10');
  const before = structuredClone(market);
  const tip = act(person, market, '#灵市打听 墨九');
  assert.match(tip.message, /你手上的筹码/);
  assert.deepEqual(market, before);
  assert.deepEqual(advanceMarket(market, opening + 6 * step), advanceMarket(before, opening + 6 * step));
});

test('追问采用30分钟后的固定行情，反复追问不刷计数，过期记录不冒用新报价', () => {
  const market = createMarket(opening, 21);
  const person = player();
  act(person, market, '#灵市打听 陆听风 丹鼎阁');
  let later = advanceMarket(market, opening + 10 * step).state;
  const tip = person.灵市.tips[0];
  const reference = later.stocks[0].history.find(point => point.slot >= tip.slot + 3);
  const expected = (reference.price - tip.price) * tip.direction > 0;
  assert.equal(act(person, later, '#灵市追问 陆听风').changed, true);
  assert.equal(person.灵市.contacts.lu[expected ? 'verified' : 'wrong'], 1);
  assert.equal(act(person, later, '#灵市追问 陆听风').changed, false);
  assert.equal(person.灵市.contacts.lu.verified + person.灵市.contacts.lu.wrong, 1);
  const another = player();
  act(another, market, '#灵市打听 陆听风 丹鼎阁');
  later = advanceMarket(market, opening + 500 * step).state;
  const expired = act(another, later, '#灵市追问 陆听风');
  assert.match(expired.message, /保存期/);
  assert.equal(another.灵市.contacts.lu.verified + another.灵市.contacts.lu.wrong, 0);
});

test('损坏存档拒绝继续结算，非法资产不会被默认初始化冲掉', () => {
  const market = createMarket(opening, 1);
  const bad = structuredClone(market);
  bad.npcs[0].cash = -1;
  assert.throws(() => validateMarket(bad));
  const person = { ...player(), 灵市: { version: 999 } };
  const before = structuredClone(person);
  assert.equal(act(person, market, '#买入 1 1').changed, false);
  assert.deepEqual(person, before);
});

test('非整十分钟发布消息，核验采用实际发布满30分钟后的首个报价', () => {
  const market = createMarket(opening, 21);
  const person = player();
  act(person, market, '#灵市打听 陆听风 丹鼎阁', { now: opening + 9 * 60_000 });
  const later = advanceMarket(market, opening + 4 * step).state;
  later.stocks[0].history.find(point => point.slot === market.slot + 3).price = 11111;
  later.stocks[0].history.find(point => point.slot === market.slot + 4).price = 8888;
  const result = act(person, later, '#灵市追问 陆听风');
  assert.match(result.message, /核验时8,888/);
  assert.ok(!result.message.includes('11,111'));
});

test('行情、持仓和单股走势图模板可渲染，名称与消息经过转义', () => {
  const market = advanceMarket(createMarket(opening, 10), opening + 6 * step).state;
  const person = player();
  act(person, market, '#买入 1 100');
  person.名号 = '<script>bad()</script>';
  const file = new URL('../resources/html/lingshi_market/lingshi_market.html', import.meta.url);
  const render = template.compile(fs.readFileSync(file, 'utf8'));
  for (const [kind, stockId] of [['market'], ['portfolio'], ['stock', '1']]) {
    const panel = buildMarketPanel(market, person, { kind, stockId, now: market.slot * step });
    const html = render({ panel });
    assert.match(html, /万界|行情|持仓/);
    assert.ok(!html.includes('<script>bad()</script>'));
    if (kind === 'stock') assert.match(html, /polyline points="[0-9., ]+"/);
  }
  assert.match(MARKET_HELP, /灵市追问/);
});

function loadIsolatedModule(file, dependencies, exported) {
  const source = fs.readFileSync(file, 'utf8')
    .replace(/^import[\s\S]*?;\r?\n/gm, '')
    .replace(/^export /gm, '')
    .replaceAll('import.meta.url', JSON.stringify(file.href));
  return new Function(...Object.keys(dependencies), `${source}\nreturn ${exported};`)(...Object.values(dependencies));
}

test('机器人入口并发重放仅扣一次，写盘失败后重试，图片缺失时可回文字行情', async () => {
  let saved = player();
  let writes = 0, failWrite = true;
  const replies = [];
  const market = createMarket(opening, 1);
  const Constructor = loadIsolatedModule(new URL('../apps/User/LingshiMarket.js', import.meta.url), {
    plugin: class { constructor(options) { Object.assign(this, options); } },
    puppeteer: { screenshot: async () => false },
    verc: () => true, channel: async id => id, existplayer: async () => true,
    Read_player: async () => structuredClone(saved),
    Write_player: async (id, next, options) => withPlayerMutationLock(id, async () => {
      assert.equal(options.trackDailyTask, false);
      if (failWrite) throw new Error('模拟写盘失败');
      saved = structuredClone(next); writes += 1;
    }),
    __PATH: {}, fileURLToPath, URL, console: { error() {}, warn() {} },
    Date: class extends Date { static now() { return opening; } },
    withPlayerMutationLock,
    withLingshiMarket: async task => withPlayerMutationLock('test:market-adapter', () => task(market)),
    buildMarketPanel, getMarketPortfolio, runMarketCommand,
  }, 'LingshiMarket');
  const app = new Constructor();
  const event = { isGroup: true, user_id: 'market-fixture', self_id: 'bot', group_id: 'group',
    message_id: 'buy-1', msg: '#买入 1 100', reply: async message => replies.push(message) };
  await app.market(event);
  assert.equal(saved.灵石, 20_000_000);
  assert.equal(saved.灵市, undefined);
  assert.match(replies.at(-1), /未完成/);
  failWrite = false;
  await Promise.all([app.market(event), app.market(event)]);
  assert.equal(writes, 1);
  assert.equal(saved.灵石, 18_997_000);
  assert.equal(saved.灵市.holdings['1'].shares, 100);
  await app.market({ ...event, message_id: 'quote', msg: '#灵市' });
  assert.match(replies.at(-1), /丹鼎阁/);
  assert.equal(writes, 1);
  const borrowing = { ...event, message_id: 'borrow-1', msg: '#灵市借款 2000000 确认' };
  failWrite = true;
  await app.market(borrowing);
  assert.equal(saved.灵石, 18_997_000);
  assert.equal(saved.灵市.loan, null);
  failWrite = false;
  await Promise.all([app.market(borrowing), app.market(borrowing)]);
  assert.equal(writes, 2);
  assert.equal(saved.灵石, 20_997_000);
  assert.equal(saved.灵市.loan.principal, 2_000_000);
  const repayment = { ...event, message_id: 'repay-1', msg: '#灵市还款 全部' };
  await Promise.all([app.market(repayment), app.market(repayment)]);
  assert.equal(writes, 3);
  assert.equal(saved.灵石, 18_995_000);
  assert.equal(saved.灵市.loan, null);
  assert.equal(app.task.cron, '0 */10 * * * *');
  for (const command of ['#灵市', '#买入 1 100', '#灵市交谈 墨九', '#灵市收益榜', '#灵市借款 2000000 确认', '#灵市债务', '#灵市还款 全部']) {
    assert.ok(new RegExp(app.rule[0].reg).test(command));
  }
});

test('全服存储先保存报价才接受交易，读写失败不重建行情，不触碰真实存档', async () => {
  let encoded = null, writes = 0, failWrite = false, failRead = false;
  const withMarket = loadIsolatedModule(new URL('../model/lingshiMarketStore.js', import.meta.url), {
    fs: {
      readFileSync() {
        if (failRead) throw Object.assign(new Error('模拟读取失败'), { code: 'EIO' });
        if (encoded === null) throw Object.assign(new Error('尚无行情'), { code: 'ENOENT' });
        return encoded;
      },
      mkdirSync() {},
    },
    fileURLToPath, URL, Date, withPlayerMutationLock, createMarket, advanceMarket, validateMarket,
    writeJsonAtomically(file, state) {
      if (failWrite) throw new Error('模拟报价持久化失败');
      encoded = JSON.stringify(state); writes += 1;
    },
  }, 'withLingshiMarket');
  assert.equal(await withMarket(() => true, { now: opening, create: false }), null);
  assert.equal(writes, 0);
  await withMarket(state => assert.equal(state.slot, opening / step), { now: opening });
  assert.equal(writes, 1);
  failWrite = true;
  let called = false;
  await assert.rejects(withMarket(() => { called = true; }, { now: opening + step }), /持久化/);
  assert.equal(called, false);
  assert.equal(writes, 1);
  failWrite = false;
  await withMarket(state => {
    assert.equal(JSON.parse(encoded).slot, state.slot);
    assert.equal(state.slot, opening / step + 1);
  }, { now: opening + step });
  assert.equal(writes, 2);
  failRead = true;
  await assert.rejects(withMarket(() => true, { now: opening + step }), /读取失败/);
  assert.equal(writes, 2);
});

function companyCycle(market, id, type, days, outcome = 'recovery') {
  const stock = market.stocks.find(item => item.id === id);
  stock.cycle = { type, startSlot: market.slot, endSlot: market.slot + days * 144,
    driftBps: Math.round(stock.limitBps * .3) * (type === 'boom' ? 1 : -1), outcome };
  return stock;
}

test('重大利好可跨日翻倍并实际卖出获利，常规报价始终受每日涨停约束', () => {
  let market = createMarket(opening, 42);
  const person = player();
  const startBalance = person.灵石;
  act(person, market, '#买入 7 100');
  const cost = person.灵市.invested;
  companyCycle(market, '7', 'boom', 9);
  for (let day = 1; day <= 9; day += 1) {
    market = advanceMarket(market, opening + day * 86_400_000).state;
    const stock = market.stocks[6];
    const limits = marketLimits(stock);
    assert.ok(stock.price >= limits.lower && stock.price <= limits.upper);
  }
  assert.ok(market.stocks[6].price > 20000);
  assert.equal(act(person, market, '#卖出 7 全部').ok, true);
  assert.ok(person.灵市.realized > cost);
  assert.equal(person.灵石 - startBalance, person.灵市.realized);
});

test('危机复核失败全额归零，玩家清算一次，未投入灵石保持原额', () => {
  let market = createMarket(opening, 77);
  const person = player();
  act(person, market, '#买入 7 100');
  const cost = person.灵市.invested;
  const cash = person.灵石;
  companyCycle(market, '7', 'crisis', 3, 'bankruptcy');
  market = advanceMarket(market, opening + 3 * 86_400_000).state;
  assert.equal(market.stocks[6].price, 0);
  assert.equal(getMarketPortfolio(person, market).rate, -100);
  assert.equal(getMarketPortfolio(person, market).profit, -cost);
  assert.match(market.news.map(item => item.text).join('\n'), /退市清算/);
  const quoted = act(person, market, '#我的股票', { requestId: 'writeoff-1' });
  assert.equal(quoted.changed, true);
  assert.match(quoted.notice, /回收0灵石/);
  assert.equal(person.灵市.realized, -cost);
  assert.deepEqual(person.灵市.holdings, {});
  assert.equal(person.灵石, cash);
  assert.equal(act(person, market, '#我的股票', { requestId: 'writeoff-1' }).changed, false);
  assert.equal(person.灵市.trades.filter(trade => trade.side === 'writeoff').length, 1);
  assert.equal(getMarketPortfolio(person, market).rate, -100);
  for (const command of ['#买入 7 1', '#卖出 7 全部', '#灵市打听 墨九 7']) {
    assert.equal(act(person, market, command).ok, false);
    assert.equal(person.灵石, cash);
  }
});

test('同股NPC也确认本金损失，停牌归零后无新交易，重启不再扣一次', () => {
  let market = createMarket(opening, 123);
  companyCycle(market, '7', 'crisis', 3, 'bankruptcy');
  const expiry = opening + 3 * 86_400_000;
  const previous = advanceMarket(market, expiry - step).state;
  market = advanceMarket(previous, expiry).state;
  for (const old of previous.npcs) {
    const npc = market.npcs.find(item => item.id === old.id);
    const otherTradeProfit = npc.trades.filter(trade => trade.slot === market.slot && trade.side === 'sell')
      .reduce((sum, trade) => {
        const holding = old.holdings[trade.stockId];
        const basis = trade.shares === holding.shares ? holding.cost : Math.floor(holding.cost * trade.shares / holding.shares);
        const amount = trade.price * trade.shares;
        return sum + amount - Math.ceil(amount * MARKET_RULES.feeBps / 10000) - basis;
      }, 0);
    assert.equal(npc.realized, old.realized - old.holdings['7'].cost + otherTradeProfit);
    assert.deepEqual(npc.holdings['7'], { shares: 0, cost: 0 });
    assert.ok(!npc.trades.some(trade => trade.stockId === '7' && trade.slot === market.slot));
  }
  const again = advanceMarket(JSON.parse(JSON.stringify(market)), expiry);
  assert.equal(again.changed, false);
  assert.deepEqual(again.state, market);
  const next = advanceMarket(market, expiry + 3 * step).state;
  for (const npc of next.npcs) assert.equal(npc.holdings['7'].shares, 0);
  assert.equal(validateMarket(next), next);
});

test('危机也能救援成功，低价不代表必定反弹，预警与复核日期常驻行情图', () => {
  let market = createMarket(opening, 12);
  companyCycle(market, '7', 'crisis', 3, 'recovery');
  const warning = buildMarketPanel(market, player(), { now: opening });
  assert.equal(warning.rows[6].status, '退市预警');
  assert.match(warning.warnings.join('\n'), /失败可能退市归零/);
  market = advanceMarket(market, opening + 3 * 86_400_000).state;
  assert.ok(market.stocks[6].price > 0);
  assert.equal(market.stocks[6].delistedAt, undefined);
  assert.equal(market.stocks[6].cycle, null);
  assert.ok(market.news.some(item => /危机复核/.test(item.text)));
});

test('退市后的消息核验使用归零结果，榜单提前计入尚未登录玩家的全部亏损', () => {
  let market = createMarket(opening, 21);
  const person = player();
  act(person, market, '#买入 7 100');
  act(person, market, '#灵市打听 陆听风 7', { now: opening + 9 * 60_000 });
  const stock = companyCycle(market, '7', 'crisis', 3, 'bankruptcy');
  stock.cycle.endSlot = market.slot + 2;
  market = advanceMarket(market, opening + 4 * step).state;
  assert.equal(getMarketPortfolio(person, market).rate, -100);
  const result = act(person, market, '#灵市追问 陆听风');
  assert.match(result.message, /核验时0/);
  assert.match(result.notice, /股权归零/);
});

test('旧版行情兼容，固定种子60天自然行情同时出现翻倍与退市', () => {
  let market = createMarket(opening, 42);
  assert.equal(market.stocks[0].cycle, undefined);
  let peak = 10000;
  for (let day = 1; day <= 60; day += 1) {
    market = advanceMarket(market, opening + day * 86_400_000).state;
    peak = Math.max(peak, ...market.stocks.map(stock => stock.price));
    assert.ok(market.npcs.every(npc => Number.isSafeInteger(npc.cash) && npc.cash >= 0));
  }
  assert.ok(peak > 20000);
  assert.ok(market.stocks.some(stock => stock.delistedAt !== undefined && stock.price === 0));
  assert.ok(market.stocks.some(stock => stock.price > 0));
  assert.equal(validateMarket(market), market);
});

test('借据先展示条款，签约后到账，借入本金不计利润，未借款不会自动负债', () => {
  const market = createMarket(opening, 42);
  const person = { 名号: '钱庄客户', 灵石: 1_000_000 };
  const original = structuredClone(person);
  const terms = act(person, market, '#灵市借款 2000000');
  assert.equal(terms.changed, false);
  assert.match(terms.message, /日息0.1%/);
  assert.match(terms.message, /确认/);
  assert.deepEqual(person, original);
  assert.equal(act(person, market, '#灵市借款 2000000 确认', { requestId: 'credit' }).changed, true);
  assert.equal(person.灵石, 3_000_000);
  assert.equal(person.灵市.loan.principal, 2_000_000);
  const stats = getMarketPortfolio(person, market, { now: opening });
  assert.equal(stats.profit, -2000);
  assert.equal(stats.debt, 2_002_000);
  assert.equal(stats.netAssets, 998_000);
  assert.equal(stats.invested, 0);
  const saved = structuredClone(person);
  assert.equal(act(person, market, '#灵市借款 2000000 确认', { requestId: 'credit' }).changed, false);
  assert.deepEqual(person, saved);
  const noCredit = { 灵石: 1000 };
  assert.equal(act(noCredit, market, '#买入 1 1').ok, false);
  assert.deepEqual(noCredit, { 灵石: 1000 });
});

test('借款上限、正整数、旧账与还款余额检查，失败操作不会增加余额或抹除借据', () => {
  const market = createMarket(opening, 1);
  const person = { 灵石: 100_000 };
  for (const message of ['#灵市借款 -1 确认', '#灵市借款 1.5 确认', '#灵市借款 1e5 确认',
    '#灵市借款 9999 确认', '#灵市借款 200001 确认', '#灵市还款 全部']) {
    const before = structuredClone(person);
    assert.equal(act(person, market, message).ok, false, message);
    assert.deepEqual(person, before);
  }
  act(person, market, '#灵市借款 200000 确认');
  for (const message of ['#灵市借款 10000 确认', '#灵市还款 -1', '#灵市还款 1.5',
    '#灵市还款 200201', '#灵市还款 9999999999999999999999999']) {
    const before = structuredClone(person);
    assert.equal(act(person, market, message).ok, false);
    assert.deepEqual(person, before);
  }
  const rich = { 灵石: 100_000_000 };
  assert.equal(act(rich, market, '#灵市借款 50000001 确认').ok, false);
  assert.equal(act(rich, market, '#灵市借款 50000000 确认').ok, true);
});

test('借据按满24小时补息，离线预估不改存档，查询重启不重复计息', () => {
  const market = createMarket(opening, 1);
  const person = player();
  act(person, market, '#灵市借款 10001 确认');
  assert.equal(person.灵市.loan.interest, 11);
  const saved = structuredClone(person);
  assert.equal(getMarketPortfolio(person, market, { now: opening + 86_400_000 - 1 }).debt, 10012);
  assert.equal(getMarketPortfolio(person, market, { now: opening + 86_400_000 }).debt, 10023);
  assert.deepEqual(person, saved);
  assert.equal(act(person, market, '#灵市债务', { now: opening + 86_400_000 }).changed, true);
  assert.equal(person.灵市.financeCost, 22);
  const restarted = JSON.parse(JSON.stringify(person));
  assert.equal(act(restarted, market, '#灵市债务', { now: opening + 86_400_000 }).changed, false);
  assert.deepEqual(restarted, person);
  act(person, market, '#灵市债务', { now: opening + 10_000 * 86_400_000 });
  assert.equal(person.灵市.loan.interestCharged, 10001);
  assert.equal(person.灵市.loan.interest, 10001);
  assert.equal(person.灵市.financeCost, 10001);
  assert.equal(getMarketPortfolio(person, market, { now: opening + 20_000 * 86_400_000 }).debt, 20002);
});

test('部分还款先息后本，后续日息按剩余本金，重复还款回执不重复扣款', () => {
  const market = createMarket(opening, 1);
  const person = player();
  act(person, market, '#灵市借款 200000 确认');
  act(person, market, '#灵市还款 100', { requestId: 'partial-1' });
  assert.equal(person.灵市.loan.interest, 100);
  assert.equal(person.灵市.loan.principal, 200000);
  const saved = structuredClone(person);
  assert.equal(act(person, market, '#灵市还款 100', { requestId: 'partial-1' }).changed, false);
  assert.deepEqual(person, saved);
  act(person, market, '#灵市还款 10100', { requestId: 'partial-2' });
  assert.equal(person.灵市.loan.interest, 0);
  assert.equal(person.灵市.loan.principal, 190000);
  act(person, market, '#灵市债务', { now: opening + 86_400_000 });
  assert.equal(person.灵市.loan.interest, 190);
  assert.equal(person.灵市.financeCost, 390);
});

test('借款买股退市后仍欠本金和利息，净资产为负，资不抵债暂停新买入', () => {
  let market = createMarket(opening, 21);
  const person = { 名号: '满仓客户', 灵石: 1_000_000 };
  act(person, market, '#灵市借款 2000000 确认');
  act(person, market, '#买入 7 299');
  companyCycle(market, '7', 'crisis', 3, 'bankruptcy');
  market = advanceMarket(market, opening + 3 * 86_400_000).state;
  const query = act(person, market, '#我的股票');
  assert.match(query.notice, /资不抵债/);
  assert.equal(person.灵石, 1030);
  assert.equal(person.灵市.loan.principal, 2_000_000);
  assert.equal(person.灵市.loan.interest, 8000);
  const stats = getMarketPortfolio(person, market, { now: market.slot * step });
  assert.equal(stats.debt, 2_008_000);
  assert.equal(stats.netAssets, -2_006_970);
  assert.equal(stats.insolvent, true);
  assert.equal(act(person, market, '#买入 1 1').ok, false);
  act(person, market, '#灵市还款 全部');
  assert.equal(person.灵石, 0);
  assert.equal(person.灵市.loan.principal, 2_000_000);
  assert.equal(person.灵市.loan.interest, 6970);
});

test('逾期借据会催债，仍可卖出和夜间还款，清偿后恢复交易', () => {
  let market = createMarket(opening, 77);
  const person = player();
  act(person, market, '#灵市借款 200000 确认');
  act(person, market, '#买入 1 10');
  market = advanceMarket(market, opening + MARKET_RULES.loanTermMs).state;
  const now = market.slot * step;
  const notice = act(person, market, '#灵市债务');
  assert.match(notice.message, /催债/);
  assert.equal(act(person, market, '#买入 1 1').ok, false);
  assert.equal(act(person, market, '#卖出 1 全部').ok, true);
  const night = Date.parse('2026-11-06T02:00:00+08:00');
  assert.equal(marketOpen(night), false);
  assert.equal(act(person, market, '#灵市还款 全部', { now: night }).ok, true);
  assert.equal(person.灵市.loan, null);
  assert.ok(person.灵石 >= 0);
  market = advanceMarket(market, opening + 8 * 86_400_000).state;
  assert.equal(act(person, market, '#买入 1 1').ok, true);
});

test('还本不被算成亏损，两清只损失利息，旧存档无借据仍兼容', () => {
  const market = createMarket(opening, 123);
  const person = player();
  act(person, market, '#灵市交谈 钱万三');
  delete person.灵市.loan;
  delete person.灵市.financeCost;
  assert.equal(getMarketPortfolio(person, market, { now: opening }).debt, 0);
  const initial = person.灵石;
  act(person, market, '#灵市借款 200000 确认');
  act(person, market, '#灵市还款 全部');
  assert.equal(person.灵石, initial - 200);
  const stats = getMarketPortfolio(person, market, { now: opening });
  assert.equal(stats.debt, 0);
  assert.equal(stats.profit, -200);
  assert.equal(stats.netAssets, initial - 200);
});

test('借款买股上涨后可以卖股还清本息，剩余净利润与现金增量一致', () => {
  let market = createMarket(opening, 42);
  const person = { 名号: '还清借据', 灵石: 1_000_000 };
  const start = person.灵石;
  act(person, market, '#灵市借款 2000000 确认');
  act(person, market, '#买入 7 299');
  companyCycle(market, '7', 'boom', 9);
  for (let day = 1; day <= 9; day += 1) {
    market = advanceMarket(market, opening + day * 86_400_000).state;
  }
  assert.equal(act(person, market, '#卖出 7 全部').ok, true);
  assert.equal(act(person, market, '#灵市还款 全部').ok, true);
  assert.equal(person.灵市.loan, null);
  assert.ok(person.灵石 > start);
  const stats = getMarketPortfolio(person, market, { now: market.slot * step });
  assert.equal(stats.profit, person.灵石 - start);
  assert.equal(stats.netAssets, person.灵石);
});

test('损坏借据停止结算，负债和负净资产可在行情与持仓模板中展示', () => {
  const market = createMarket(opening, 1);
  const person = player();
  act(person, market, '#灵市借款 200000 确认');
  for (const mutate of [
    loan => { loan.principal = -1; },
    loan => { loan.interestCharged = loan.initialPrincipal + 1; },
    loan => { loan.dueAt += 1; },
  ]) {
    const invalid = structuredClone(person);
    mutate(invalid.灵市.loan);
    const before = structuredClone(invalid);
    assert.equal(act(invalid, market, '#灵市还款 全部').changed, false);
    assert.deepEqual(invalid, before);
  }
  person.灵石 = 0;
  const panel = buildMarketPanel(market, person, { kind: 'portfolio', now: opening });
  assert.match(panel.debtSummary, /200,200/);
  assert.match(panel.netAssets, /-200,200/);
  assert.match(panel.netAssets, /资不抵债/);
  const render = template.compile(fs.readFileSync(new URL('../resources/html/lingshi_market/lingshi_market.html', import.meta.url), 'utf8'));
  assert.match(render({ panel }), /钱庄欠款/);
  assert.match(render({ panel }), /当前暂无持仓，请先处理欠款/);
});
