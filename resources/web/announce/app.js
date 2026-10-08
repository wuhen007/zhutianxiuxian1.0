const $ = (selector) => document.querySelector(selector);
const UPDATE_PAGE_SIZE = 2;
const HISTORY_PAGE_SIZE = 4;
const desktop = window.matchMedia('(min-width: 1024px)');
let announcement = null;
let updatePages = [];
let archivePages = [];
let historyItems = [];
let route = { mode: 'overview', page: 1 };
let loading = false;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function displayDate(value) {
  const date = text(value).match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  return date ? `${date[1]} 年 ${Number(date[2])} 月 ${Number(date[3])} 日` : text(value, '发布日期待更新');
}

function normalize(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('公告数据格式有误');
  const updates = Array.isArray(payload.updates) ? payload.updates : [];
  const count = Number.isInteger(payload.currentUpdateCount) ? Math.max(0, Math.min(updates.length, payload.currentUpdateCount)) : updates.length;
  const modules = (items) => items.filter((item) => item && typeof item === 'object').map((item) => ({
    tag: text(item.tag, '体验更新'),
    title: text(item.title, '更新内容'),
    summary: text(item.summary),
    points: (Array.isArray(item.points) ? item.points : []).map((point) => text(point)).filter(Boolean),
  }));
  return {
    version: text(payload.version, '本期版本'),
    date: text(payload.date),
    edition: text(payload.edition, '本期更新公告'),
    intro: text(payload.intro, '这里汇总本期玩法更新与体验调整，点击目录即可分章查看。'),
    updates: modules(updates.slice(0, count)),
    archive: modules(updates.slice(count)),
    changelog: (Array.isArray(payload.changelog) ? payload.changelog : []).filter((group) => group && typeof group === 'object'),
  };
}

function chapterTitle(items) {
  return items.map((item) => item.title.split(/[：:]/, 1)[0]).join(' · ');
}

function pageHash(mode, page = 1) {
  return mode === 'overview' ? '#overview' : `#${mode}/${page}`;
}

function readRoute() {
  const match = location.hash.match(/^#(updates|archive|history)\/(\d+)$/);
  if (!match) return { mode: 'overview', page: 1 };
  const maxPage = match[1] === 'updates' ? updatePages.length : match[1] === 'archive' ? archivePages.length : Math.ceil(historyItems.length / HISTORY_PAGE_SIZE);
  return { mode: match[1], page: Math.max(1, Math.min(Number(match[2]) || 1, maxPage || 1)) };
}

function chapterLink(hash, number, title) {
  const link = node('a', 'chapter-link');
  link.href = hash;
  link.append(node('span', 'chapter-number', number), node('span', '', title));
  return link;
}

function renderContents() {
  $('#sidebar-version').textContent = announcement.version;
  $('#sidebar-date').textContent = displayDate(announcement.date);
  const nav = $('#chapter-nav');
  nav.replaceChildren(chapterLink('#overview', '序', '本期概览'));
  updatePages.forEach((items, index) => {
    const link = chapterLink(pageHash('updates', index + 1), String(index + 1).padStart(2, '0'), chapterTitle(items));
    link.title = items.map((item) => item.title).join(' / ');
    nav.append(link);
  });
  const archive = chapterLink('#archive/1', '往', '往期玩法');
  archive.classList.add('is-history');
  nav.append(archive, chapterLink('#history/1', '记', '更新记录'));
  $('#sidebar').hidden = false;
  $('#contents').open = desktop.matches;
}

function pageHeader(title, description, label, current = true) {
  const header = node('header', 'page-header');
  header.append(node('p', 'eyebrow', label));
  const meta = node('p', 'page-meta');
  meta.append(node('span', '', announcement.version), node('span', '', displayDate(announcement.date)));
  const heading = node('h1', '', title);
  heading.id = 'page-title';
  heading.tabIndex = -1;
  if (current) header.append(meta);
  header.append(heading);
  if (description) header.append(node('p', 'page-lead', description));
  return header;
}

function renderOverview(content) {
  content.append(pageHeader(announcement.edition, announcement.intro, '诸天修仙 · 本期更新'));
  if (!announcement.updates.length) {
    content.append(node('p', 'overview-note', '本期公告尚未发布，过往内容可在「往期玩法」与「更新记录」中查看。'));
    return;
  }
  content.append(node('h2', 'section-label', '本期内容，先睹为快'));
  const list = node('ol', 'overview-list');
  announcement.updates.slice(0, 3).forEach((item, index) => {
    const entry = node('li', 'overview-item');
    const link = node('a', 'overview-link');
    link.href = pageHash('updates', Math.floor(index / UPDATE_PAGE_SIZE) + 1);
    const copy = node('div');
    copy.append(node('h3', '', item.title));
    if (item.summary) copy.append(node('p', '', item.summary));
    const arrow = node('span', 'overview-arrow', '↗');
    arrow.setAttribute('aria-hidden', 'true');
    link.append(node('span', 'overview-number', String(index + 1).padStart(2, '0')), copy, arrow);
    entry.append(link);
    list.append(entry);
  });
  content.append(list, node('p', 'overview-note', `本期共 ${announcement.updates.length} 个更新模块，分为 ${updatePages.length} 章。翻到下一页，查看完整调整。`));
}

function renderUpdates(content) {
  const archived = route.mode === 'archive';
  const items = (archived ? archivePages : updatePages)[route.page - 1] || [];
  const label = archived ? `往期玩法 / 第 ${route.page} 页` : `${announcement.edition} / 第 ${route.page} 章`;
  const note = archived ? '以下为往期公告存档，具体规则请以本期说明和游戏内实际提示为准。' : '';
  content.append(pageHeader(chapterTitle(items) || (archived ? '往期玩法' : '更新内容'), note, label, !archived));
  if (!items.length) content.append(node('p', 'overview-note', archived ? '暂无往期玩法存档，本期内容可在目录中查看。' : '本期更新内容仍在整理中，请稍后再来。'));
  items.forEach((item) => {
    const section = node('section', 'update-section');
    section.append(node('p', 'update-tag', item.tag), node('h2', '', item.title));
    if (item.summary) section.append(node('p', 'update-summary', item.summary));
    const points = node('ul', 'update-points');
    item.points.forEach((point) => points.append(node('li', '', point)));
    if (item.points.length) section.append(points);
    content.append(section);
  });
}

function renderHistory(content) {
  content.append(pageHeader('更新记录', '按时间翻阅过往调整。较长的说明收在条目内，展开即可查看。', '诸天修仙 · 更新档案', false));
  const items = historyItems.slice((route.page - 1) * HISTORY_PAGE_SIZE, route.page * HISTORY_PAGE_SIZE);
  if (!items.length) content.append(node('p', 'overview-note', '暂无历史更新记录，本期内容可在目录中查看。'));
  items.forEach((item) => {
    const entry = node('article', 'history-entry');
    entry.append(node('span', 'history-date', displayDate(item.date)), node('h2', '', item.msg));
    if (item.detail) {
      const detail = node('details', 'history-detail');
      detail.append(node('summary', '', '展开完整说明'), node('p', '', item.detail));
      entry.append(detail);
    }
    content.append(entry);
  });
}

function setPageLink(selector, hash) {
  const link = $(selector);
  link.setAttribute('aria-disabled', String(!hash));
  if (hash) {
    link.href = hash;
    link.removeAttribute('tabindex');
  } else {
    link.removeAttribute('href');
    link.tabIndex = -1;
  }
}

function renderPagination() {
  let previous = null;
  let next = null;
  let position = '本期概览';
  if (route.mode === 'history') {
    const total = Math.max(1, Math.ceil(historyItems.length / HISTORY_PAGE_SIZE));
    previous = route.page > 1 ? pageHash('history', route.page - 1) : '#overview';
    next = route.page < total ? pageHash('history', route.page + 1) : null;
    position = `历史 ${route.page} / ${total}`;
  } else if (route.mode === 'updates' || route.mode === 'archive') {
    const total = Math.max(1, (route.mode === 'archive' ? archivePages : updatePages).length);
    previous = route.page > 1 ? pageHash(route.mode, route.page - 1) : '#overview';
    next = route.page < total ? pageHash(route.mode, route.page + 1) : null;
    position = route.mode === 'archive' ? `往期 ${route.page} / ${total}` : `第 ${route.page} / ${total} 章`;
  } else {
    next = updatePages.length ? '#updates/1' : archivePages.length ? '#archive/1' : '#history/1';
  }
  setPageLink('#previous-page', previous);
  setPageLink('#next-page', next);
  $('#page-position').textContent = position;
  $('#pagination').hidden = false;
}

function render(focus = false) {
  if (!announcement) return;
  route = readRoute();
  const canonical = pageHash(route.mode, route.page);
  if (location.hash !== canonical) history.replaceState(null, '', canonical);
  const content = $('#reader-content');
  content.replaceChildren();
  if (route.mode === 'updates' || route.mode === 'archive') renderUpdates(content);
  else if (route.mode === 'history') renderHistory(content);
  else renderOverview(content);
  document.querySelectorAll('.chapter-link').forEach((link) => {
    const active = link.hash === canonical || (['history', 'archive'].includes(route.mode) && link.hash === pageHash(route.mode));
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  renderPagination();
  const title = $('#page-title').textContent;
  document.title = `${title} · 诸天修仙更新公告`;
  $('#reader-status').textContent = `${title}，${$('#page-position').textContent}`;
  if (focus) {
    if (!desktop.matches) $('#contents').open = false;
    $('#page-title').focus({ preventScroll: true });
    $('#reader').scrollIntoView({ block: 'start', behavior: 'auto' });
  }
}

function renderState(error = false) {
  const panel = node('div', 'state-panel');
  panel.setAttribute('role', error ? 'alert' : 'status');
  panel.append(node('p', 'eyebrow', '诸天修仙 · 更新公告'), node('h1', '', error ? '公告暂时未能载入' : '正在展开本期公告'));
  panel.append(node('p', '', error ? '请检查网络连接，或稍后重新读取。阅读进度会保留。' : '内容即将呈现，请稍候。'));
  if (error) {
    const retry = node('button', 'retry-button', '重新读取');
    retry.type = 'button';
    retry.addEventListener('click', load);
    panel.append(retry);
  } else {
    const lines = node('div', 'loading-lines');
    lines.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i += 1) lines.append(node('span'));
    panel.append(lines);
  }
  $('#reader-content').replaceChildren(panel);
}

async function load() {
  if (loading) return;
  loading = true;
  $('#reader').setAttribute('aria-busy', 'true');
  $('#pagination').hidden = true;
  renderState();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/api/announce', { headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    announcement = normalize(await response.json());
    updatePages = [];
    for (let index = 0; index < announcement.updates.length; index += UPDATE_PAGE_SIZE) updatePages.push(announcement.updates.slice(index, index + UPDATE_PAGE_SIZE));
    archivePages = [];
    for (let index = 0; index < announcement.archive.length; index += UPDATE_PAGE_SIZE) archivePages.push(announcement.archive.slice(index, index + UPDATE_PAGE_SIZE));
    historyItems = announcement.changelog.flatMap((group) => (Array.isArray(group.items) ? group.items : []).filter((item) => item && typeof item === 'object').map((item) => ({ date: text(group.date), msg: text(item.msg, '体验优化'), detail: text(item.detail) })));
    renderContents();
    render();
  } catch {
    announcement = null;
    $('#sidebar').hidden = true;
    renderState(true);
  } finally {
    clearTimeout(timeout);
    loading = false;
    $('#reader').setAttribute('aria-busy', 'false');
  }
}

desktop.addEventListener('change', () => { $('#contents').open = desktop.matches; });
$('.skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  $('#reader').focus({ preventScroll: true });
  $('#reader').scrollIntoView({ block: 'start', behavior: 'auto' });
});
window.addEventListener('hashchange', () => render(true));
document.addEventListener('keydown', (event) => {
  if (!announcement || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.target.closest('input, textarea, select, button, summary, [contenteditable="true"]') || window.getSelection()?.toString()) return;
  const selector = event.key === 'ArrowLeft' ? '#previous-page' : event.key === 'ArrowRight' ? '#next-page' : null;
  if (!selector) return;
  const link = $(selector);
  if (link.getAttribute('aria-disabled') === 'true') return;
  event.preventDefault();
  location.hash = link.hash;
});

load();
