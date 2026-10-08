import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../resources/web/announce/app.js', import.meta.url), 'utf8').replace(/\nload\(\);\s*$/, '\n');
const fixture = JSON.parse(fs.readFileSync(new URL('../data/announce.json', import.meta.url), 'utf8'));

function browser(payload = fixture, responses = []) {
  const roots = new Map();
  const requests = [];
  const all = (root) => [root, ...root.children.flatMap(all)];
  const location = { hash: '#overview' };
  let document;
  function element(tagName = 'div') {
    let value = '';
    return {
      tagName, children: [], attributes: {}, listeners: {}, className: '',
      get textContent() { return value + this.children.map((child) => child.textContent).join(''); },
      set textContent(text) { value = String(text); this.children = []; },
      get hash() { return (this.href || '').match(/#.*$/)?.[0] || ''; },
      get classList() { return { add: (name) => { this.className += ` ${name}`; } }; },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { value = ''; this.children = children; },
      setAttribute(name, value) { this.attributes[name] = value; },
      getAttribute(name) { return this.attributes[name] ?? null; },
      removeAttribute(name) { delete this.attributes[name]; if (name === 'href') delete this.href; },
      addEventListener(name, callback) { this.listeners[name] = callback; },
      focus() { document.activeElement = this; },
      scrollIntoView() {},
    };
  }
  for (const selector of ['.skip-link', '#sidebar', '#sidebar-version', '#sidebar-date', '#contents', '#chapter-nav', '#reader', '#reader-content', '#reader-status', '#pagination', '#previous-page', '#next-page', '#page-position']) roots.set(selector, element());
  document = {
    createElement: element,
    querySelector(selector) {
      if (roots.has(selector)) return roots.get(selector);
      return [...roots.values()].flatMap(all).find((node) => selector === `#${node.id}`) || null;
    },
    querySelectorAll(selector) {
      return [...roots.values()].flatMap(all).filter((node) => selector.startsWith('.') ? node.className.split(' ').includes(selector.slice(1)) : node.tagName === selector);
    },
    addEventListener() {},
  };
  const context = vm.createContext({
    document, location, setTimeout, clearTimeout, AbortController,
    window: { matchMedia: () => ({ matches: true, addEventListener() {} }), addEventListener() {} },
    history: { replaceState(_state, _title, hash) { location.hash = hash; } },
    async fetch(url, options) {
      requests.push({ url, options });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response || { ok: true, json: async () => payload };
    },
  });
  vm.runInContext(source, context);
  return {
    run: (code) => vm.runInContext(code, context),
    get: (selector) => document.querySelector(selector),
    load: () => vm.runInContext('load()', context),
    children: () => roots.get('#reader-content').children,
    location, document, requests,
  };
}

test('本期和旧玩法完整分为每页两个模块，旧模块不套用本期日期', async () => {
  const ui = browser();
  await ui.load();
  const count = fixture.currentUpdateCount;
  assert.equal(ui.run('announcement.updates.length'), count);
  assert.equal(ui.run('announcement.archive.length'), fixture.updates.length - count);
  assert.equal(ui.run('updatePages.length'), Math.ceil(count / 2));
  assert.equal(ui.run('archivePages.length'), Math.ceil((fixture.updates.length - count) / 2));
  for (const [mode, items] of [['updates', fixture.updates.slice(0, count)], ['archive', fixture.updates.slice(count)]]) {
    const seen = [];
    for (let page = 1; page <= Math.ceil(items.length / 2); page += 1) {
      ui.location.hash = `#${mode}/${page}`;
      ui.run('render()');
      const sections = ui.children().filter((node) => node.tagName === 'section');
      assert.ok(sections.length > 0 && sections.length <= 2);
      seen.push(...sections.map((section) => section.children.find((node) => node.tagName === 'h2').textContent));
      if (mode === 'archive') assert.equal(ui.children()[0].children.some((node) => node.className === 'page-meta'), false);
    }
    assert.deepEqual(seen, items.map((item) => item.title));
  }
});

test('空或非法 hash 回概览，合法越界页夹紧，末页不继续前进', async () => {
  const ui = browser();
  await ui.load();
  for (const hash of ['', '#unknown', '#updates/-1', '#archive/nope', '#history/1/extra']) {
    ui.location.hash = hash;
    ui.run('render()');
    assert.equal(ui.location.hash, '#overview');
  }
  for (const mode of ['updates', 'archive', 'history']) {
    ui.location.hash = `#${mode}/999999999999999999999`;
    ui.run('render()');
    assert.equal(ui.get('#next-page').getAttribute('aria-disabled'), 'true');
    assert.equal(ui.get('#next-page').href, undefined);
    assert.equal(ui.run('route.page'), ui.run(mode === 'history' ? 'Math.max(1, Math.ceil(historyItems.length / 4))' : `Math.max(1, ${mode === 'updates' ? 'updatePages' : 'archivePages'}.length)`));
    ui.location.hash = `#${mode}/0`;
    ui.run('render()');
    assert.equal(ui.run('route.page'), 1);
    assert.equal(ui.get('#previous-page').href, '#overview');
  }
});

test('空公告正常显示空态，非法计数保留全部条目而不丢数据', async () => {
  const ui = browser({ currentUpdateCount: 0, updates: [], changelog: [] });
  await ui.load();
  for (const hash of ['#overview', '#updates/1', '#archive/1', '#history/1']) {
    ui.location.hash = hash;
    ui.run('render()');
    assert.equal(ui.children().filter((node) => ['section', 'article'].includes(node.tagName)).length, 0);
    assert.ok(ui.get('#page-title').textContent);
  }
  assert.equal(ui.run('normalize({currentUpdateCount:-1,updates:[{}]}).archive.length'), 1);
  assert.equal(ui.run('normalize({currentUpdateCount:99,updates:[{}]}).updates.length'), 1);
  assert.equal(ui.run('normalize({currentUpdateCount:"bad",updates:[{}]}).updates.length'), 1);
});

test('历史记录每页四条，所有后端文案以 textContent 渲染', async () => {
  const attack = '<img src=x onerror=alert(1)><script>alert(1)</script>';
  const ui = browser({
    currentUpdateCount: 1,
    updates: [{ title: attack, summary: attack, points: [attack] }, { title: attack, points: [attack] }],
    changelog: [{ date: '2026.10.01', items: Array.from({ length: 9 }, () => ({ msg: attack, detail: attack })) }],
  });
  await ui.load();
  for (const hash of ['#updates/1', '#archive/1', '#history/1', '#history/3']) {
    ui.location.hash = hash;
    ui.run('render()');
    assert.ok(ui.get('#reader-content').textContent.includes(attack));
    assert.equal(ui.document.querySelectorAll('img').length, 0);
    assert.equal(ui.document.querySelectorAll('script').length, 0);
    if (hash === '#history/1') assert.equal(ui.children().filter((node) => node.tagName === 'article').length, 4);
    if (hash === '#history/3') assert.equal(ui.children().filter((node) => node.tagName === 'article').length, 1);
  }
  assert.ok(!source.includes('innerHTML'));
});

test('请求失败显示重试，重试成功保留页码，并正确结束 busy 状态', async () => {
  for (const failure of [new Error('network offline'), { ok: false, status: 503 }]) {
    const ui = browser(fixture, [failure]);
    ui.location.hash = '#updates/2';
    await ui.load();
    assert.equal(ui.get('#reader').getAttribute('aria-busy'), 'false');
    assert.equal(ui.get('#pagination').hidden, true);
    const panel = ui.children()[0];
    assert.equal(panel.getAttribute('role'), 'alert');
    const retry = panel.children.find((node) => node.tagName === 'button');
    assert.ok(retry);
    await retry.listeners.click();
    assert.equal(ui.requests.length, 2);
    assert.equal(ui.requests[1].url, '/api/announce');
    assert.equal(ui.requests[1].options.cache, 'no-store');
    assert.equal(ui.get('#pagination').hidden, false);
    assert.equal(ui.get('#reader').getAttribute('aria-busy'), 'false');
    assert.equal(ui.location.hash, '#updates/2');
  }
});

test('跳过导航只移动焦点，不覆盖当前章节 hash', async () => {
  const ui = browser();
  await ui.load();
  ui.location.hash = '#archive/2';
  ui.run('render()');
  let prevented = false;
  ui.get('.skip-link').listeners.click({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(ui.document.activeElement, ui.get('#reader'));
  assert.equal(ui.location.hash, '#archive/2');
});
