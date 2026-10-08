import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildStoryScene, createStoryTheater } from '../resources/web/canglan/story.js';
import { planetMaterial } from '../resources/web/canglan/planets.js';

test('古星材质来自已公开星相，未知古星隐藏实际类别与地貌', () => {
  for (const [kind, expected] of Object.entries({ life: 'life', origin: 'life', tide: 'tide', forge: 'forge', ruin: 'ruin', civilization: 'ruin', rift: 'rift', dead: 'dead', archive: 'ruin' })) {
    assert.equal(planetMaterial({ status: 'explored', kind }).key, expected);
    assert.equal(planetMaterial({ status: 'unseen', kind }).key, 'mystery');
  }
  assert.deepEqual(planetMaterial({ status: 'unseen', kind: 'life' }), planetMaterial({ status: 'unseen', kind: 'forge' }));
  assert.equal(planetMaterial(null).key, 'mystery');
});

test('古星材质只读且相同输入稳定，不改地图坐标或探索状态', () => {
  const node = Object.freeze({ id: '1,-1', status: 'anchored', kind: 'life', q: 1, r: -1, seed: 17 });
  assert.deepEqual(planetMaterial(node), planetMaterial(node));
  const material = planetMaterial(node);
  material.label = '外部修改';
  assert.equal(planetMaterial(node).label, '生命古星');
  assert.equal(node.status, 'anchored');
});

test('剧情保留服务端胜负回执，仅用真实前后状态展示变化', () => {
  const before = { player: { mind: 12 }, pressure: 9 };
  const after = { player: { mind: 8 }, pressure: 12 };
  const scene = buildStoryScene({ action: 'challenge', message: '战败，敌方仍有余力。', before, after, targetName: '玄阙神炉' });
  assert.equal(scene.effect, 'battle');
  assert.equal(scene.beats[1].text, '战败，敌方仍有余力。');
  assert.match(scene.beats[2].text, /心神 12 → 8；界压 9 → 12/);
  assert.doesNotMatch(scene.beats[0].text, /击败|胜利|获得/);
  assert.deepEqual(before, { player: { mind: 12 }, pressure: 9 });
});

test('请求失败或回执成功但刷新失败时不编造状态变化与战果', () => {
  for (const options of [{ failed: true }, { pendingSync: true }]) {
    const scene = buildStoryScene({ action: 'move', message: '请刷新核对。', before: { player: { mind: 9 } }, after: { player: { mind: 0 } }, ...options });
    assert.equal(scene.effect, 'quiet');
    assert.equal(scene.beats.length, 2);
    assert.equal(scene.beats[1].text, '请刷新核对。');
  }
});

test('古史、铸炉、归航及预览都有明确场景，回执不截断', () => {
  const longMessage = '<img src=x onerror=alert(1)>\n' + '古史回声'.repeat(2000);
  for (const [action, effect] of [['ancient_event_contribute', 'ancient'], ['dao_forge_start', 'forge'], ['anchor', 'anchor'], ['evacuation_start', 'travel'], ['true_world_encounter', 'battle']]) {
    const scene = buildStoryScene({ action, message: longMessage, preview: true });
    assert.equal(scene.effect, effect);
    assert.equal(scene.preview, true);
    assert.equal(scene.beats[1].text, longMessage);
  }
});

class Element {
  hidden = false; open = false; disabled = false; textContent = ''; dataset = {}; children = []; attrs = {}; listeners = {};
  classList = { add() {}, remove() {} };
  addEventListener(name, fn) { this.listeners[name] = fn; }
  setAttribute(name, value) { this.attrs[name] = value; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  contains() { return false; }
  focus() {}
  click() { if (!this.disabled) this.listeners.click?.({ target: this }); }
}

test('演绎回看只读、按操作去重、有界记录，并支持关闭演绎和减少动态效果', t => {
  const oldDocument = globalThis.document;
  const oldStorage = globalThis.localStorage;
  t.after(() => {
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = oldStorage;
  });
  const elements = new Map();
  const root = { dataset: {}, querySelector(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); } };
  const listeners = {};
  globalThis.document = { hidden: false, createElement: () => new Element(), createTextNode: text => ({ textContent: text }), addEventListener: (name, fn) => { listeners[name] = fn; } };
  // 浏览器隐私模式中本地设置存储失败不影响玩法。
  globalThis.localStorage = { getItem() { throw new Error('storage blocked'); }, setItem() { throw new Error('storage blocked'); } };
  let effects = 0;
  const controller = createStoryTheater({ root, motionQuery: { matches: true, addEventListener() {} }, onEffect: () => { effects += 1; } });
  const present = id => controller.present({ action: 'observe', message: `真实回执${id}`, operationId: id, targetName: '生命古星' });
  present('same'); present('same');
  assert.equal(root.querySelector('#story-history-count').textContent, '1');
  root.querySelector('#story-next').click();
  assert.equal(root.querySelector('#story-copy').textContent, '真实回执same');
  root.querySelector('#story-replay').click();
  assert.equal(root.querySelector('#story-history-count').textContent, '1');
  assert.equal(effects, 0);
  assert.equal(root.dataset.motion, 'off');
  root.querySelector('#story-auto').click();
  assert.equal(root.querySelector('#story-theater').hidden, true);
  for (let i = 0; i < 12; i += 1) present(String(i));
  assert.equal(root.querySelector('#story-history-count').textContent, '8');
  assert.equal(root.querySelector('#story-history-list').children.length, 8);
  assert.equal(root.querySelector('#story-theater').hidden, true);
  root.querySelector('#story-replay').click();
  assert.equal(root.querySelector('#story-theater').hidden, false);
  listeners.keydown({ key: 'Escape', target: new Element() });
  assert.equal(root.querySelector('#story-theater').hidden, true);
});

test('前端保留真实操作与坐标，演绎使用文本节点，不注入回执HTML或触发请求', () => {
  const read = name => fs.readFileSync(new URL(`../resources/web/canglan/${name}`, import.meta.url), 'utf8');
  const html = read('index.html');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, '页面ID应保持唯一');
  assert.match(html, /<script type="module"/);
  for (const id of ['planet-portrait', 'planet-select', 'planet-focus', 'story-theater', 'story-replay', 'story-motion']) assert.ok(ids.includes(id));
  assert.doesNotMatch(read('story.js'), /innerHTML|fetch\(|requestJson\(/);
  assert.match(read('planets.js'), /textures\.size >= 90/);
  assert.match(read('app.js'), /if \(document.hidden\) return/);
  assert.match(read('app.js'), /const animationTime = reducedMotion\(\) \? 0 : now/);
});
