const $ = (selector) => document.querySelector(selector);
const number = new Intl.NumberFormat('zh-CN');
const themes = new Set(['celestial', 'forge', 'scroll']);
let state = null;
let selectedOffer = null;
let wantKind = 'currency';
let tradeView = 'incoming';
let messageFilter = 'all';
let loading = false;
let toastTimer;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function icon(name) {
  const element = node('i');
  element.dataset.lucide = name;
  element.setAttribute('aria-hidden', 'true');
  return element;
}

function refreshIcons(root = document) {
  window.lucide?.createIcons({ nodes: [root] });
}

function showToast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('is-visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('is-visible'), 3000);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.reason || `请求失败 (${response.status})`);
  return payload;
}

function selectView(view) {
  document.body.dataset.view = view;
  document.querySelectorAll('[data-view-target]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.viewTarget === view);
  });
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--:--' : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function formatAssets(items = []) {
  return items.map((item) => `${item.name} ×${number.format(item.amount)}`).join('、') || '未注明';
}

function tradePersonName(trade, role) {
  return trade[`${role}_player_name`] || '匿名道友';
}

function realmLevel(stats = {}) {
  if (Number(stats.max_huafen)) return `花粉路 ${stats.max_huafen}`;
  if (Number(stats.max_xiangu)) return `仙古 ${stats.max_xiangu}`;
  return `秘境 ${Number(stats.max_mijing) || 0}`;
}

function renderStatus() {
  const online = state.status.connected;
  $('#current-realm').textContent = state.status.realmName || '未知位面';
  $('#connection-copy').textContent = online ? `${state.viewer.name} · 已连接` : '总机重连中';
  $('#connection-copy').classList.toggle('is-offline', !online);
  $('#lingshi').textContent = number.format(state.currencies.灵石);
  $('#source-stone').textContent = number.format(state.currencies.源石);
  $('#last-sync').textContent = formatTime(Date.now());
  const errors = [...state.errors];
  if (!online && state.status.lastError && state.status.lastError !== '无') errors.unshift(state.status.lastError);
  const box = $('#world-errors');
  box.replaceChildren(...errors.map((message) => node('p', 'world-error', message)));
  box.hidden = errors.length === 0;
}

function renderRealms() {
  const list = $('#realm-list');
  list.replaceChildren();
  $('#realm-count').textContent = String(state.realms.length).padStart(2, '0');
  $('#realm-summary').textContent = state.realms.length ? '总机在线位面实时名录' : '暂无在线位面';
  const select = $('#trade-realm');
  select.replaceChildren();
  for (const realm of state.realms) {
    const row = node('button', `realm-row${realm.server_id === state.status.realmId ? ' is-current' : ''}`);
    row.type = 'button';
    row.append(node('span', 'realm-glyph', String(realm.name || '界').slice(0, 1)));
    const copy = node('span');
    copy.append(node('b', '', realm.name || realm.server_id), node('small', '', `${realm.realm_stats?.players ?? 0} 人 · ${realmLevel(realm.realm_stats)}`));
    row.append(copy, node('i', `status-beacon${realm.connected === false ? ' is-idle' : ''}`));
    list.append(row);
    if (realm.server_id !== state.status.realmId && realm.trade_enabled) {
      const option = node('option', '', realm.name || realm.server_id);
      option.value = realm.server_id;
      select.append(option);
    }
  }
  if (!list.children.length) list.append(node('div', 'empty-state', '诸天总机暂未发现其他在线位面'));
  if (!select.children.length) {
    const option = node('option', '', '暂无可交易位面');
    option.value = '';
    select.append(option);
  }
}

function messageElement(message) {
  const hasImages = Array.isArray(message.images) && message.images.length > 0;
  const article = node('article', 'message');
  article.dataset.messageKind = hasImages ? 'image' : 'all';
  article.hidden = messageFilter !== 'all' && article.dataset.messageKind !== messageFilter;
  article.append(node('div', 'sender-seal seal-jade', String(message.sender_name || '道').slice(0, 1)));
  const body = node('div', 'message-body');
  const head = node('header');
  head.append(node('b', '', message.sender_name || '无名道友'), node('span', '', message.name || '未知位面'), node('time', '', formatTime(message.ts)));
  body.append(head);
  if (message.msg) body.append(node('p', '', message.msg));
  if (hasImages) {
    const images = node('div', 'message-image-list');
    for (const source of message.images.slice(0, 4)) {
      const image = node('img');
      image.src = source;
      image.alt = `${message.sender_name || '道友'}的世界传音图片`;
      image.loading = 'lazy';
      images.append(image);
    }
    body.append(images);
  }
  article.append(body);
  return article;
}

function renderMessages() {
  const stream = $('#message-stream');
  const messages = state.messages.slice().sort((left, right) => Number(left.seq || left.ts) - Number(right.seq || right.ts));
  stream.replaceChildren(...messages.map(messageElement));
  if (!messages.length) stream.append(node('div', 'empty-state', '世界频道尚无传音，来留下第一道诸天回响吧'));
}

function chooseOffer(asset, button) {
  selectedOffer = asset;
  document.querySelectorAll('.inventory-item, [data-currency]').forEach((entry) => entry.classList.toggle('is-selected', entry === button));
  $('#offer-name').value = asset.name;
  $('#offer-count').max = String(asset.kind === 'currency' ? asset.count : Math.min(asset.count, 20));
  $('#offer-count').value = '1';
}

function renderInventory() {
  const list = $('#inventory-list');
  list.replaceChildren();
  $('#inventory-count').textContent = `${state.inventory.length} 类`;
  for (const item of state.inventory) {
    const button = node('button', `inventory-item${item.locked ? ' is-locked' : ''}`);
    button.type = 'button';
    button.dataset.name = item.name;
    button.disabled = item.locked;
    button.append(node('span', 'item-rune', item.locked ? '禁' : item.name.slice(0, 1)));
    const copy = node('span');
    copy.append(node('b', '', item.name), node('small', '', item.locked ? '世界规则封禁或本地锁定' : `${item.type} · 可跨服`));
    button.append(copy, node('strong', '', number.format(item.count)));
    if (!item.locked) button.addEventListener('click', () => chooseOffer({ kind: 'item', name: item.name, type: item.type, count: item.count }, button));
    list.append(button);
  }
  if (!list.children.length) list.append(node('div', 'empty-state', '纳戒中暂无可展示物品'));
  document.querySelectorAll('[data-currency]').forEach((button) => {
    const name = button.dataset.currency;
    button.onclick = () => chooseOffer({ kind: 'currency', name, count: state.currencies[name] || 0 }, button);
  });
  const catalog = $('#tradeable-items');
  catalog.replaceChildren(...state.catalog.map((item) => {
    const option = node('option');
    option.value = item.name;
    return option;
  }));
}

function tradeCard(trade, outgoing) {
  const card = node('article', `trade-card${outgoing ? ' is-outgoing' : ''}`);
  const realmName = outgoing ? trade.target_name || trade.target_server_id || '目标位面' : trade.seller_name || trade.seller_server_id || '未知位面';
  const head = node('header');
  head.append(node('span', 'realm-glyph', String(realmName).slice(0, 1)));
  const copy = node('div');
  copy.append(node('b', '', realmName), node('small', '', outgoing ? '我发布的跨服委托' : '来自其他位面的委托'));
  head.append(copy, node('code', '', trade.code));
  const people = node('div', 'trade-people');
  people.append(
    node('span', '', `卖家：${tradePersonName(trade, 'seller')}`),
    node('span', '', `买家：${trade.buyer_player_name ? tradePersonName(trade, 'buyer') : (trade.status === 'open' ? '待购买' : '匿名道友')}`)
  );
  const exchange = node('div', 'exchange-line');
  const give = node('span');
  const want = node('span');
  give.append(node('small', '', outgoing ? '提供' : '获得'), node('b', '', formatAssets(trade.give)));
  want.append(node('small', '', outgoing ? '需求' : '支付'), node('b', '', formatAssets(trade.want)));
  exchange.append(give, icon('arrow-right-left'), want);
  const footer = node('footer');
  const statusText = (() => {
    if (trade.status === 'open' || trade.status === 'pending') return '诸天规则校验通过';
    if (trade.status === 'settling') {
      const waiting = [];
      if (!trade.settlement?.seller) waiting.push('卖方');
      if (!trade.settlement?.buyer) waiting.push('买方');
      return waiting.length ? `结算中，等待${waiting.join('与')}确认` : '结算完成确认中';
    }
    return {
      completed: '交易已完成',
      cancelled: '交易已撤销',
      failed: '结算失败，资产已回滚',
      expired: '交易已过期',
    }[trade.status] || `状态：${trade.status}`;
  })();
  footer.append(node('span', '', statusText));
  if (['open', 'pending'].includes(trade.status)) {
    const actions = node('div', 'trade-actions');
    if (outgoing) {
      const action = node('button', '', '撤回委托');
      action.type = 'button';
      action.addEventListener('click', () => runTradeAction(action, 'cancel', trade.code));
      actions.append(action);
    } else {
      for (const option of [{ label: '实名购买', anonymous: false }, { label: '匿名购买', anonymous: true }]) {
        const action = node('button', '', option.label);
        action.type = 'button';
        action.addEventListener('click', () => runTradeAction(action, 'accept', trade.code, { anonymous: option.anonymous }));
        actions.append(action);
      }
    }
    footer.append(actions);
  }
  card.append(head, people, exchange, footer);
  return card;
}

function renderTrades() {
  const grid = $('#trade-grid');
  const trades = state.trades[tradeView] || [];
  grid.replaceChildren(...trades.map((trade) => tradeCard(trade, tradeView === 'outgoing')));
  if (!trades.length) grid.append(node('div', 'empty-state', tradeView === 'incoming' ? '当前没有发往本位面的交易委托' : '你还没有发布跨服交易'));
  refreshIcons(grid);
}

function render() {
  renderStatus();
  renderRealms();
  renderMessages();
  renderInventory();
  renderTrades();
  refreshIcons();
}

async function loadState({ quiet = false } = {}) {
  if (loading) return;
  loading = true;
  $('#refresh-button').disabled = true;
  try {
    state = (await api('/api/world/state')).state;
    render();
  } catch (error) {
    if (!quiet) showToast(error.message);
    if (!state) $('#message-stream').replaceChildren(node('div', 'empty-state', `${error.message}\n请返回群聊重新发送 #世界网页`));
  } finally {
    loading = false;
    $('#refresh-button').disabled = false;
  }
}

async function runTradeAction(button, action, code, options = {}) {
  button.disabled = true;
  button.textContent = action === 'accept' ? '结算中' : '撤回中';
  try {
    const result = await api(`/api/world/trade/${action}`, { method: 'POST', body: JSON.stringify({ code, ...options }) });
    showToast(result.message || '交易状态已更新');
    await loadState();
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
    button.textContent = action === 'accept' ? (options.anonymous ? '匿名购买' : '实名购买') : '撤回委托';
  }
}

document.querySelectorAll('[data-view-target]').forEach((button) => button.addEventListener('click', () => selectView(button.dataset.viewTarget)));
document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
  messageFilter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach((entry) => entry.classList.toggle('is-active', entry === button));
  if (state) renderMessages();
}));
document.querySelectorAll('[data-trade-view]').forEach((button) => button.addEventListener('click', () => {
  tradeView = button.dataset.tradeView;
  document.querySelectorAll('[data-trade-view]').forEach((entry) => entry.classList.toggle('is-active', entry === button));
  if (state) renderTrades();
}));
document.querySelectorAll('[data-want-kind]').forEach((button) => button.addEventListener('click', () => {
  wantKind = button.dataset.wantKind;
  document.querySelectorAll('[data-want-kind]').forEach((entry) => entry.classList.toggle('is-active', entry === button));
  $('#currency-want-fields').hidden = wantKind !== 'currency';
  $('#item-want-fields').hidden = wantKind !== 'item';
}));

$('#chat-input').addEventListener('input', (event) => $('#message-count').textContent = String(event.target.value.length));
$('#chat-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text) return showToast('请输入世界发言内容');
  const button = event.submitter;
  button.disabled = true;
  try {
    const result = await api('/api/world/message', { method: 'POST', body: JSON.stringify({ text }) });
    input.value = '';
    $('#message-count').textContent = '0';
    showToast(result.message);
    await loadState();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

$('#inventory-search').addEventListener('input', (event) => {
  const query = event.target.value.trim().toLocaleLowerCase('zh-CN');
  document.querySelectorAll('.inventory-item').forEach((item) => item.hidden = Boolean(query) && !item.dataset.name.toLocaleLowerCase('zh-CN').includes(query));
});

$('#trade-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedOffer) return showToast('请先从纳戒或灵石栏选择我方提供的资产');
  const giveAmount = Math.trunc(Number($('#offer-count').value));
  const targetServerId = $('#trade-realm').value;
  const wantName = wantKind === 'item' ? $('#want-item-name').value.trim() : $('#want-name').value;
  const wantAmount = Math.trunc(Number($(wantKind === 'item' ? '#want-item-count' : '#want-count').value));
  if (!targetServerId) return showToast('当前没有可发布交易的目标位面');
  if (!giveAmount || giveAmount > selectedOffer.count) return showToast(`${selectedOffer.name}数量不足`);
  if (!wantName || !wantAmount) return showToast('请完整填写希望交换到的资产');
  const button = event.submitter;
  button.disabled = true;
  try {
    const result = await api('/api/world/trade', {
      method: 'POST',
      body: JSON.stringify({
        targetServerId,
        anonymous: $('#anonymous-publish').checked,
        give: [{ kind: selectedOffer.kind, name: selectedOffer.name, type: selectedOffer.type, amount: giveAmount }],
        want: [{ kind: wantKind, name: wantName, amount: wantAmount }],
      }),
    });
    showToast(result.message);
    tradeView = 'outgoing';
    document.querySelectorAll('[data-trade-view]').forEach((entry) => entry.classList.toggle('is-active', entry.dataset.tradeView === tradeView));
    selectView('market');
    await loadState();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

$('#refresh-button').addEventListener('click', () => loadState());
$('#image-help').addEventListener('click', () => showToast('图片传音请回到群聊，发送“#世界发言”并附带图片。'));
const savedTheme = localStorage.getItem('world-theme');
const initialTheme = themes.has(savedTheme) ? savedTheme : 'celestial';
document.body.dataset.theme = initialTheme;
$('#theme-select').value = initialTheme;
$('#theme-select').addEventListener('change', (event) => {
  document.body.dataset.theme = event.target.value;
  localStorage.setItem('world-theme', event.target.value);
});

async function start() {
  refreshIcons();
  const url = new URL(location.href);
  const token = url.searchParams.get('t');
  if (token) {
    try {
      await api('/api/world/session', { method: 'POST', body: JSON.stringify({ token }) });
      url.searchParams.delete('t');
      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch (error) {
      showToast(error.message);
    }
  }
  await loadState();
  setInterval(() => loadState({ quiet: true }), 5000);
}

start();
