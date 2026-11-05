import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getRealmAuthorityPath } from '../model/realmAuthority.js';
import { getBreakKingEmperorGate } from '../model/worldlineAuthority.js';
import { createCultivationSystem } from '../apps/User/wudaoRules.js';

function actualMethod(relative, startText, endText, dependencies) {
  const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start);
  assert.ok(start >= 0 && end > start, `method boundary: ${relative}`);
  return new Function(...Object.keys(dependencies), `return ({${source.slice(start, end)}});`)(...Object.values(dependencies));
}

const fixture = () => ({
  id: 'mapped-player', 名号: '花路道者', 额外体系: 'huafen',
  mijinglevel_id: 23, xiangulevel_id: 1, huafenlevel_id: 20,
  修为: 123456, 血气: 654321, 生命本源: 100, 仙道潜力: 72,
  自创修炼体系: { name: '原道', route: 'mijing', source: '旧路道果', createdAt: 123 },
  花粉道途: { version: 1, stages: { immortalKingPrinciple: 9600 }, daily: { date: '', count: 0 } },
  时间线权能: { tribulations: { mijing: { status: 'passed', passedAt: 10 } } },
  成就: ['23', '旧成就'],
});

// The actual domain transition and actual message handler run together;
// only account storage, locks and explicitly injected failure outcomes are mocked.
function harness(player = fixture(), options = {}) {
  let stored = structuredClone(player);
  const calls = [], messages = [];
  const domain = options.domain || createCultivationSystem;
  const deps = {
    channel: async id => { calls.push(['channel', id]); return 'mapped-player'; },
    existplayer: async id => { calls.push(['exists', id]); return options.exists !== false; },
    withPlayerMutationLock: async (id, fn) => { calls.push(['lock', id]); return fn(); },
    redis: { get: async key => { calls.push(['busy', key]); return options.busy ?? null; } },
    isTribulationLocked: async id => { calls.push(['tribulation', id]); return Boolean(options.tribulating); },
    Read_player: async id => { calls.push(['read', id]); return structuredClone(stored); },
    createCultivationSystem: (p, name) => { calls.push(['domain', name]); return domain(p, name); },
    Write_player: async (id, p) => {
      calls.push(['write', id]);
      if (options.writeFailure === 'throw') throw new Error('fixture disk failure');
      if (options.writeFailure === 'false') return false;
      stored = structuredClone(p);
      return options.writeReturn;
    },
    getRealmAuthorityPath,
    console: { error: (...args) => calls.push(['error', args[0]]) },
  };
  const { hedao } = actualMethod('../apps/User/Level.js', '  async hedao(e) {', '  async showDaoPath(e) {', deps);
  return {
    calls, messages, snapshot: () => structuredClone(stored),
    run: async (event = {}) => hedao.call({}, {
      user_id: 'qg_channel-user', isGroup: true, msg: '#合道 原道',
      reply: async message => { messages.push(String(message)); return true; }, ...event,
    }),
  };
}

test('actual hedao maps the channel identity consistently and saves adaptation without fees or duplicate achievements', async () => {
  const before = fixture(), h = harness(before);
  await h.run();
  assert.deepEqual(h.calls.filter(c => ['exists', 'lock', 'tribulation', 'read', 'write'].includes(c[0])), [
    ['exists', 'mapped-player'], ['lock', 'mapped-player'], ['tribulation', 'mapped-player'], ['read', 'mapped-player'], ['write', 'mapped-player'],
  ]);
  assert.deepEqual(h.calls[0], ['channel', 'channel-user']);
  assert.ok(h.calls.some(c => c[0] === 'busy' && c[1] === 'xiuxian:player:mapped-player:game_action'));
  const saved = h.snapshot();
  for (const key of ['修为', '血气', '生命本源', '仙道潜力', '时间线权能', '成就']) assert.deepEqual(saved[key], before[key], key);
  assert.deepEqual(saved.合道续接记录[0].system, before.自创修炼体系);
  assert.equal(saved.自创修炼体系.route, 'huafen');
  assert.match(h.messages[0], /【道统续接】/);
  assert.match(h.messages[0], /原道统：【原道】/);
  assert.match(h.messages[0], /花粉进化路道果合流/);
  assert.match(h.messages[0], /仍须完成本路线的 #破王成帝劫/);
  await h.run();
  assert.equal(h.calls.filter(c => c[0] === 'write').length, 1, 'same-route repeat does not save');
  assert.match(h.messages.at(-1), /重复合道/);
});

test('actual hedao checks active activities and tribulations before reading or mutating a player', async () => {
  for (const options of [{ busy: 0 }, { busy: '0' }, { tribulating: true }]) {
    const before = fixture(), h = harness(before, options);
    await h.run();
    assert.equal(h.calls.some(c => ['read', 'domain', 'write'].includes(c[0])), false);
    assert.deepEqual(h.snapshot(), before);
    assert.match(h.messages[0], /结算/);
  }
});

test('actual hedao route and qualification failures do not save or issue a success message', async () => {
  const cases = [
    ['exists', /重复合道/], ['route_name', /#合道 原道/], ['route_unknown', /核对来源/],
    ['route_progress', /高阶推演进度/], ['name', /一至五个字/], ['realm', /当前主修/],
    ['dao', /#花粉悟道/], ['unexpected', /条件尚未满足/],
  ];
  for (const [reason, expected] of cases) {
    const before = fixture();
    const h = harness(before, { domain: p => ({ ok: false, reason, system: p.自创修炼体系,
      gate: { rule: { name: '仙王道则', targetExp: 9600 }, exp: 320, stage: { name: '初悟' } },
    }) });
    await h.run();
    assert.equal(h.calls.some(c => c[0] === 'write'), false, reason);
    assert.deepEqual(h.snapshot(), before, reason);
    assert.match(h.messages[0], expected);
    assert.doesNotMatch(h.messages[0], /【道统续接】|合道成功/);
  }
});

test('actual adaptation does not add a missing old achievement; original first creation still awards it once', async () => {
  const adapted = fixture(); delete adapted.成就;
  const h = harness(adapted); await h.run(); assert.equal(h.snapshot().成就, undefined);
  const first = fixture(); delete first.自创修炼体系; first.成就 = ['旧成就'];
  const fresh = harness(first);
  await fresh.run({ msg: '#合道 新道' });
  assert.deepEqual(fresh.snapshot().成就, ['旧成就', '23']);
  assert.match(fresh.messages[0], /合道成功/);
});

test('actual hedao reports both false and thrown saves as unconfirmed and leaves persisted fixtures untouched', async () => {
  for (const writeFailure of ['false', 'throw']) {
    const before = fixture(), h = harness(before, { writeFailure });
    await h.run();
    assert.deepEqual(h.snapshot(), before);
    assert.equal(h.calls.filter(c => c[0] === 'write').length, 1);
    assert.match(h.messages[0], /保存失败.*尚未确认成功/);
    assert.doesNotMatch(h.messages[0], /【道统续接】|【合道成功/);
  }
});

test('private messages and absent mapped players stop before domain and persistence', async () => {
  for (const [options, event] of [[{}, { isGroup: false }], [{ exists: false }, {}]]) {
    const h = harness(fixture(), options); await h.run(event);
    assert.equal(h.calls.some(c => ['read', 'domain', 'write'].includes(c[0])), false);
  }
});

function emperorHarness(player) {
  const messages = [], calls = [];
  const deps = {
    verc: () => true, Read_player: async () => structuredClone(player), Read_equipment: async () => ({}),
    getRealmAuthorityPath,
    getBreakKingEmperorGate: (p, route) => { calls.push(route); return getBreakKingEmperorGate(p, route); },
  };
  const { poWangChengDi } = actualMethod('../apps/User/zhetiandujie.js', 'async poWangChengDi(e) {', '// 解除护法双向绑定', deps);
  return { calls, messages, run: () => poWangChengDi.call({}, { user_id: player.id, isGroup: true,
    reply: async m => { messages.push(String(m)); return true; },
  }) };
}

test('actual emperor entrance uses the current flower route and instructs old-name adaptation instead of borrowing the old passed trial', async () => {
  const p = fixture(), before = structuredClone(p), h = emperorHarness(p);
  await h.run();
  assert.deepEqual(h.calls, ['huafen']);
  assert.match(h.messages[0], /#合道 原道/);
  assert.match(h.messages[0], /本路线帝劫/);
  assert.doesNotMatch(h.messages[0], /已渡过破王成帝劫/);
  assert.deepEqual(p, before);
});

test('an adapted flower route still reaches its own original prerequisites; only its own passed trial is accepted', async () => {
  const p = fixture(); p.自创修炼体系.route = 'huafen';
  let h = emperorHarness(p); await h.run(); assert.match(h.messages[0], /界海未渡/);
  p.时间线权能.tribulations.huafen = { status: 'passed', passedAt: 20 };
  h = emperorHarness(p); await h.run(); assert.match(h.messages[0], /已渡过破王成帝劫/);
});
