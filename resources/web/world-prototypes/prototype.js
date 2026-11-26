const themes = new Set(['celestial', 'forge', 'scroll']);
const params = new URLSearchParams(location.search);
const requestedTheme = params.get('theme');
const theme = themes.has(requestedTheme) ? requestedTheme : 'celestial';

document.body.dataset.theme = theme;
document.querySelector('#theme-select').value = theme;

const themeTitles = {
  celestial: '星海天门',
  forge: '玄金界市',
  scroll: '太虚云笺',
};
document.title = `${themeTitles[theme]} · 诸天世界网页原型`;

if (window.lucide) window.lucide.createIcons();

const toast = document.querySelector('#toast');
let toastTimer;

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function selectView(view) {
  document.body.dataset.view = view;
  document.querySelectorAll('[data-view-target]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.viewTarget === view);
  });
  const panel = document.querySelector(`[data-panel="${view}"]`);
  if (matchMedia('(max-width: 960px)').matches) panel?.scrollTo({ top: 0 });
}

document.querySelectorAll('[data-view-target]').forEach((button) => {
  button.addEventListener('click', () => selectView(button.dataset.viewTarget));
});

document.querySelector('#theme-select').addEventListener('change', (event) => {
  const next = new URL(location.href);
  next.searchParams.set('theme', event.target.value);
  location.href = next;
});

document.querySelector('#notification-button').addEventListener('click', () => {
  showToast('两份跨服委托等待处理，葬仙古域还差一位队员。');
});

const chatInput = document.querySelector('#chat-input');
const messageCount = document.querySelector('#message-count');
chatInput.addEventListener('input', () => {
  messageCount.textContent = String(chatInput.value.length);
});

document.querySelector('#chat-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) {
    showToast('传音内容尚未填写。');
    chatInput.focus();
    return;
  }

  const article = document.createElement('article');
  article.className = 'message is-self';
  article.dataset.messageKind = 'all';

  const seal = document.createElement('div');
  seal.className = 'sender-seal seal-gold';
  seal.textContent = '我';

  const body = document.createElement('div');
  body.className = 'message-body';
  const header = document.createElement('header');
  const name = document.createElement('b');
  name.textContent = '本尘&發財';
  const realm = document.createElement('span');
  realm.textContent = '中央大宇宙';
  const time = document.createElement('time');
  time.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const content = document.createElement('p');
  content.textContent = text;

  header.append(name, realm, time);
  body.append(header, content);
  article.append(seal, body);
  document.querySelector('#message-stream').append(article);
  article.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  chatInput.value = '';
  messageCount.textContent = '0';
  showToast('世界传音已送往诸天总机。');
});

document.querySelectorAll('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    const filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('is-active', item === button));
    document.querySelectorAll('[data-message-kind]').forEach((message) => {
      message.hidden = filter !== 'all' && message.dataset.messageKind !== filter;
    });
  });
});

const inventoryItems = [...document.querySelectorAll('.inventory-item:not(.is-locked)')];
const offerName = document.querySelector('#offer-name');
const offerCount = document.querySelector('#offer-count');

function selectInventoryItem(item) {
  inventoryItems.forEach((entry) => entry.classList.toggle('is-selected', entry === item));
  offerName.value = item.dataset.name;
  offerCount.max = item.dataset.count;
  offerCount.value = '1';
}

inventoryItems.forEach((item) => item.addEventListener('click', () => selectInventoryItem(item)));

let wantKind = 'currency';
document.querySelectorAll('[data-want-kind]').forEach((button) => {
  button.addEventListener('click', () => {
    wantKind = button.dataset.wantKind;
    document.querySelectorAll('[data-want-kind]').forEach((item) => item.classList.toggle('is-active', item === button));
    document.querySelector('#currency-want-fields').hidden = wantKind !== 'currency';
    document.querySelector('#item-want-fields').hidden = wantKind !== 'item';
  });
});

document.querySelector('#inventory-search').addEventListener('input', (event) => {
  const query = event.target.value.trim().toLocaleLowerCase('zh-CN');
  document.querySelectorAll('.inventory-item').forEach((item) => {
    item.hidden = Boolean(query) && !item.dataset.name.toLocaleLowerCase('zh-CN').includes(query);
  });
});

document.querySelector('#trade-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const realm = document.querySelector('#trade-realm').value;
  const giveName = offerName.value;
  const giveCount = Number(offerCount.value);
  const wantName = wantKind === 'item'
    ? document.querySelector('#want-item-name').value.trim()
    : document.querySelector('#want-name').value;
  const wantCountInput = document.querySelector(wantKind === 'item' ? '#want-item-count' : '#want-count');
  const wantCount = Number(wantCountInput.value);

  if (!Number.isInteger(giveCount) || giveCount < 1 || giveCount > Number(offerCount.max)) {
    showToast(`纳戒中的${giveName}数量不足。`);
    offerCount.focus();
    return;
  }
  if (!wantName) {
    showToast('请选择希望交换到的物品。');
    document.querySelector('#want-item-name').focus();
    return;
  }
  if (!Number.isInteger(wantCount) || wantCount < 1) {
    showToast('需求数量需要填写正整数。');
    wantCountInput.focus();
    return;
  }

  const card = document.createElement('article');
  card.className = 'trade-card is-new';
  card.innerHTML = `
    <header><span class="realm-glyph">发</span><div><b>${realm}</b><small>本尘&發財 · 刚刚发布</small></div><code>待生成</code></header>
    <div class="exchange-line"><span><small>提供</small><b>${giveName} ×${giveCount}</b></span><i data-lucide="arrow-right-left" aria-hidden="true"></i><span><small>需求</small><b>${wantName} ×${wantCount.toLocaleString('zh-CN')}</b></span></div>
    <footer><span>等待总机确认</span><button type="button">撤回</button></footer>`;
  document.querySelector('#trade-grid').prepend(card);
  if (window.lucide) window.lucide.createIcons({ nodes: [card] });
  selectView('market');
  showToast(`已向${realm}发布交易委托。`);
});

document.querySelectorAll('[data-action="accept"]').forEach((button) => {
  button.addEventListener('click', () => {
    button.textContent = '结算中';
    button.disabled = true;
    showToast('交易已锁定，正在等待双方位面完成结算。');
  });
});

document.querySelectorAll('.market-tabs button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.market-tabs button').forEach((item) => item.classList.toggle('is-active', item === button));
    showToast(button.textContent === '我发布的' ? '已切换到本人的跨服委托。' : '已切换到收到的跨服委托。');
  });
});
