import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../resources/web/world/app.js', import.meta.url), 'utf8');
const definitions = source.slice(0, source.indexOf("document.querySelectorAll('[data-view-target]').forEach((button) => button.addEventListener"));

test('世界导航同步桌面与手机选中态，返回聊天时继续跟随最新', () => {
  const buttons = ['chat', 'market', 'inventory', 'realms', 'chat', 'market', 'inventory', 'realms'].map(view => ({
    dataset: { viewTarget: view }, active: false,
    classList: { toggle(_name, active) { this.owner.active = active; } },
    hasAttribute: () => true,
    setAttribute(name, value) { this[name] = value; },
  }));
  for (const button of buttons) button.classList.owner = button;
  const body = { dataset: {} };
  const frames = [];
  const context = vm.createContext({
    document: { body, querySelectorAll: () => buttons },
    requestAnimationFrame: callback => frames.push(callback),
  });
  vm.runInContext(definitions, context);
  for (const view of ['market', 'inventory', 'realms', 'chat']) {
    vm.runInContext(`selectView('${view}')`, context);
    assert.equal(body.dataset.view, view);
    for (const button of buttons) {
      assert.equal(button.active, button.dataset.viewTarget === view);
      assert.equal(button['aria-pressed'], String(button.active));
    }
  }
  assert.equal(frames.length, 1);
});

test('纳戒搜索忽略大小写和首尾空格，清空后还原列表，无结果时显示提示', () => {
  const search = { value: '  灵晶  ' };
  const empty = { hidden: true };
  const items = ['玄天灵晶', '悟道茶', 'Spirit Stone'].map(name => ({ dataset: { name } }));
  const context = vm.createContext({
    document: {
      querySelector: selector => selector === '#inventory-search' ? search : empty,
      querySelectorAll: () => items,
    },
  });
  vm.runInContext(definitions, context);
  vm.runInContext('filterInventory()', context);
  assert.deepEqual(items.map(item => item.hidden), [false, true, true]);
  search.value = 'spirit';
  vm.runInContext('filterInventory()', context);
  assert.deepEqual(items.map(item => item.hidden), [true, true, false]);
  search.value = '不存在的藏品';
  vm.runInContext('filterInventory()', context);
  assert.equal(empty.hidden, false);
  search.value = '';
  vm.runInContext('filterInventory()', context);
  assert.deepEqual(items.map(item => item.hidden), [false, false, false]);
  assert.equal(empty.hidden, true);
});

test('最近的图片立即加载，历史图片继续按需加载', () => {
  const images = [];
  const context = vm.createContext({
    document: {
      createElement(tag) {
        const element = { dataset: {}, setAttribute() {}, append() {}, addEventListener() {} };
        if (tag === 'img') images.push(element);
        return element;
      },
    },
  });
  vm.runInContext(definitions, context);
  for (const recent of [false, true]) {
    vm.runInContext(`messageElement({ sender_name: '道友', ts: 0, images: ['/image.jpg'] }, ${recent})`, context);
  }
  assert.deepEqual(images.map(image => image.loading), ['lazy', 'eager']);
});
