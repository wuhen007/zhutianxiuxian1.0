import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function fixture() {
  const elements = new Map();
  const query = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, hidden: false, textContent: '',
    });
    return elements.get(selector);
  };
  const requests = [];
  const timers = new Map();
  let nextTimer = 0;
  const context = vm.createContext({
    document: { querySelector: query, querySelectorAll: () => [], addEventListener() {} },
    window: { addEventListener() {} },
    location: { href: 'https://example.com/endless' },
    history: { replaceState() {} }, URL, AbortSignal, console,
    fetch: async (_url, options) => new Promise(resolve => requests.push({ resolve, options })),
    setTimeout(callback, ms) { const id = ++nextTimer; timers.set(id, { callback, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval() { assert.fail('overlapping interval polling must not be used'); },
    clearInterval(id) { timers.delete(id); },
  });
  const script = fs.readFileSync(new URL('../resources/web/endless/app.js', import.meta.url), 'utf8');
  vm.runInContext(script, context);
  vm.runInContext('render = value => { currentState = value; gate.hidden = true; };', context);
  return { context, requests, timers };
}

test('endless state polls are single-flight and wait until the previous response settles', async () => {
  const { context, requests, timers } = fixture();
  assert.equal(requests.length, 1);
  await vm.runInContext('refresh()', context);
  await vm.runInContext('refresh()', context);
  assert.equal(requests.length, 1);
  requests[0].resolve({ ok: true, json: async () => ({ state: { test: true } }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal([...timers.values()].filter(timer => timer.ms === 2500).length, 1);
});

test('transient timeouts back off while expired sessions stop automatic polling', async () => {
  const { context, requests, timers } = fixture();
  requests[0].resolve({ ok: false, status: 400, json: async () => ({ error: 'timeout' }) });
  await new Promise(resolve => setImmediate(resolve));
  const retry = [...timers.values()].find(timer => timer.ms === 5000);
  assert.ok(retry);
  assert.equal(vm.runInContext('pollingStopped', context), false);
  const pending = retry.callback();
  assert.equal(requests.length, 2);
  requests[1].resolve({ ok: false, status: 401, json: async () => ({ error: 'expired' }) });
  await pending;
  assert.equal(vm.runInContext('pollingStopped', context), true);
  assert.equal(timers.size, 0);
});
