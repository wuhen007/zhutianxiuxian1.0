import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as realms from '../model/realmAuthority.js';
import * as extra from '../model/extraCultivation.js';
import { createDaoTreasureItem, isDaoTreasureItem } from '../model/daoTreasure.js';
import { createEternalImmortalMap } from '../model/innateTreasure.js';
import { getFlowerEvolutionCost } from '../model/flowerPollenPath.js';
import { applyQuestionFortuneCost } from '../model/redDustFortune.js';
import { getActiveZhutianAvatarName } from '../model/zhutianMirror.js';
import { isShapeSpiritDestroyed } from '../model/worldlineAuthority.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const clone = structuredClone;
const owner = 'unique-dao-fixture';
const routes = { mijing: ['mijinglevel_id', 23], xiangu: ['xiangulevel_id', 24], huafen: ['huafenlevel_id', 24] };
const rates = [0.75, 0.8, 1, 2, 3];
const branch = {
  ...JSON.parse(read('resources/data/item/特殊装备列表.json')).find(item => item.name === '无上天阙枝'),
  绑定者: owner, author_name: owner, 数量: 1,
};

function fixture(route = 'mijing', { era = 2, item = branch, bag = false } = {}) {
  const [field, level] = routes[route];
  const state = {
    stored: {
      id: owner, 名号: '证道道友', 额外体系: route, level_id: 42, Physique_id: 42,
      mijinglevel_id: 1, xiangulevel_id: 1, huafenlevel_id: 1, [field]: level,
      当前血量: 900, 血量上限: 1000, 修仙状态: '空闲', 仙道潜力: 0,
      修为: 8_000_000_000_000_000, 血气: 8_000_000_000_000_000,
      学习的功法: ['虚空经'], 灵根: { name: '普通灵根', type: '普通' },
    },
    equipment: { 至宝: bag ? {} : clone(item) },
    najie: { 装备: bag ? [clone(item)] : [] },
    writes: 0, refreshes: 0, heals: 0, invalidations: 0, accessedIds: [], replies: [],
  };
  const deps = {
    ...realms, ...extra, path, isDaoTreasureItem, getFlowerEvolutionCost, applyQuestionFortuneCost,
    getActiveZhutianAvatarName, isShapeSpiritDestroyed, withPlayerMutationLock,
    plugin: class { constructor(value) { Object.assign(this, value); } },
    fs: { existsSync: () => true, readFileSync: () => JSON.stringify({ 诸天位面: 10 }) },
    data: {
      filePathMap: { weimianList: '/fixture/weimian.json' }, dijingList: [],
      Levelmijing_list: JSON.parse(read('resources/data/Level/秘境体系.json')),
    },
    config: { getConfig: () => ({ Era: { current: { index: era } } }) },
    redis: { get: async () => state.busy ? '0' : null },
    channel: async id => id === 'fixture-channel' ? owner : id,
    existplayer: async () => true, isNotNull: value => value != null,
    Read_player: async id => { state.accessedIds.push(id); return clone(state.stored); },
    Read_equipment: async () => clone(state.equipment),
    Read_najie: async () => clone(state.najie),
    Write_player: async (_id, player) => {
      state.stored = clone(player); state.writes++;
      if (state.failPlayer) throw new Error('fixture-player-write');
    },
    Write_equipment: async (_id, equipment) => {
      state.equipment = clone(equipment); state.refreshes++;
      if (state.failEquipment) throw new Error('fixture-equipment-write');
    },
    Add_HP: async () => { state.heals++; if (state.failHeal) throw new Error('fixture-heal'); },
    invalidateBattleEquipmentCache: () => { state.invalidations++; },
    __PATH: { player_path: '/fixture/player', equipment_path: '/fixture/equipment' },
    FileRollbackTransaction: class {
      constructor() { this.before = clone({ stored: state.stored, equipment: state.equipment }); }
      capture() {} commit() {} rollback() { Object.assign(state, clone(this.before)); }
    },
  };
  const source = read('apps/User/Level.js').replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  const App = new Function(...Object.keys(deps), `${source}; return Level;`)(...Object.values(deps));
  state.app = new App();
  state.event = { isGroup: true, user_id: owner, msg: '#证道', reply: async text => { state.replies.push(text); return text; } };
  state.prove = event => state.app.zhengdao(event || state.event);
  return state;
}

function originalCost(route, era = 2, fortune = false) {
  const level = routes[route][1];
  if (route === 'huafen') return Math.trunc(100_000_000 * 2 ** level * rates[era]);
  const base = route === 'xiangu' ? 500000 * 2 ** (level - 1) : 250000 * 2 ** level;
  const cost = Math.ceil(base * (route === 'mijing' ? rates[era] : 1));
  return fortune ? Math.ceil(cost * 0.8) : cost;
}

test('三体系祭道之上持有四类认主大道至宝，装备或纳戒均可直接证道，宝物保留', async () => {
  const treasures = [
    branch, createEternalImmortalMap(owner),
    createDaoTreasureItem({ name: '文明至宝', ownerId: owner, integrity: 100 }),
    { ...branch, name: '彼岸至宝', 彼岸大道至宝: true, authorities: [] },
  ];
  for (const route of Object.keys(routes)) for (const item of treasures) for (const bag of [false, true]) {
    const f = fixture(route, { item, bag }), before = clone(f.stored);
    const possessions = clone({ equipment: f.equipment, najie: f.najie });
    assert.match(await f.prove(), /证道成功·唯一道之上/);
    assert.equal(realms.getRealmAuthorityLevel(f.stored), 24);
    for (const [other, [field, level]] of Object.entries(routes)) {
      assert.equal(f.stored[field], other === route ? level + 1 : before[field]);
    }
    assert.equal(f.stored.修为, before.修为 - originalCost(route));
    assert.equal(f.stored.血气, before.血气 - originalCost(route));
    assert.equal(f.stored.仙道潜力, 0);
    assert.equal(f.stored.境界称号, '唯一道之上');
    assert.deepEqual({ equipment: f.equipment, najie: f.najie }, possessions);
    assert.equal(f.writes, 1);
    assert.equal(f.refreshes, 1);
    assert.equal(f.heals, 1);
  }
});

test('各体系原修血公式、五种时代和问道签适用范围保持一致，资源刚好足够也可成功', async () => {
  for (const route of Object.keys(routes)) for (let era = 0; era < 5; era++) for (const fortune of [false, true]) {
    const f = fixture(route, { era }), cost = originalCost(route, era, fortune);
    if (fortune) f.stored.红尘仙缘签 = { type: 'question', expiresAt: Date.now() + 60000 };
    f.stored.修为 = cost;
    f.stored.血气 = cost;
    assert.match(await f.prove(), /证道成功/);
    assert.equal(f.stored.修为, 0, `${route}, era ${era}, fortune ${fortune}`);
    assert.equal(f.stored.血气, 0);
  }
});

test('缺少本体、先天至宝、投影、他人认主、空数量及过期缓存均不满足持有条件', async () => {
  const invalid = [
    {}, { ...branch, 品阶: '先天至宝', 大道至宝本体: false },
    { ...branch, 先天投影截止: Date.now() + 60000 },
    { ...branch, author_name: 'other-owner' }, { ...branch, 绑定者: 'other-owner' },
    { ...branch, 绑定者: '', author_name: '' }, { ...branch, 数量: 0 },
  ];
  for (const item of invalid) for (const bag of [false, true]) {
    const f = fixture('mijing', { item, bag });
    f.stored.当前大道至宝 = branch.name;
    const before = clone(f.stored);
    assert.match(await f.prove(), /需持有已认主的大道至宝本体/);
    assert.deepEqual(f.stored, before);
    assert.equal(f.writes, 0);
  }
});

test('资源少一点或旧档缺少修血均提示缺口且无扣费、升阶', async () => {
  for (const route of Object.keys(routes)) for (const field of ['修为', '血气']) for (const amount of [originalCost(route) - 1, undefined, NaN]) {
    const f = fixture(route);
    f.stored[field] = amount;
    const before = clone(f.stored);
    assert.match(await f.prove(), /资源不足/);
    assert.deepEqual(f.stored, before);
    assert.equal(f.writes, 0);
  }
});

test('重复和频道映射并发证道只升一级、扣一次，已达唯一道之上再次发送保持原状', async () => {
  const f = fixture(), before = clone(f.stored);
  const replies = await Promise.all([
    f.prove(), f.prove({ ...f.event, user_id: 'qg_fixture-channel' }), f.prove(),
  ]);
  assert.equal(replies.filter(reply => /证道成功/.test(reply)).length, 1);
  assert.equal(f.writes, 1);
  assert.equal(f.stored.修为, before.修为 - originalCost('mijing'));
  assert.ok(f.accessedIds.every(id => id === owner));
  const completed = clone(f.stored);
  assert.match(await f.prove(), /无需重复证道/);
  assert.deepEqual(f.stored, completed);
});

test('保留群聊、忙碌、化身、身亡与劫罚门禁；常规低境证道仍走原流程', async () => {
  for (const blocked of ['private', 'busy', 'avatar', 'dead', 'bubble', 'hp', 'tribulation']) {
    const f = fixture();
    if (blocked === 'private') f.event.isGroup = false;
    if (blocked === 'busy') f.busy = true;
    if (blocked === 'avatar') f.stored.诸天镜系统 = { 当前化身: '测试化身' };
    if (blocked === 'dead') f.stored.修仙状态 = '身灭道消';
    if (blocked === 'bubble') f.stored.始祖永祭 = { status: 'bubble' };
    if (blocked === 'hp') f.stored.当前血量 = 0;
    if (blocked === 'tribulation') f.stored.attempting_level_7 = true;
    await f.prove();
    assert.equal(f.writes, 0, blocked);
  }
  const f = fixture();
  f.stored.mijinglevel_id = 8;
  const before = f.stored.修为;
  await f.prove();
  assert.match(f.replies.at(-1), /证道成功/);
  assert.equal(f.stored.mijinglevel_id, 9);
  assert.equal(f.stored.修为, before - 2 ** 8 * 250000);
  assert.equal(f.stored.境界称号, undefined);
  const low = fixture();
  low.stored.mijinglevel_id = 22;
  await low.prove();
  assert.equal(low.writes, 0);
});

test('玩家、装备或气血刷新异常时回滚境界和资源，并清除装备缓存', async () => {
  for (const failure of ['failPlayer', 'failEquipment', 'failHeal']) {
    const f = fixture();
    const before = clone({ stored: f.stored, equipment: f.equipment });
    f[failure] = true;
    await assert.rejects(f.prove(), /fixture-/);
    assert.deepEqual({ stored: f.stored, equipment: f.equipment }, before);
    assert.equal(f.invalidations, 1);
  }
});

test('花粉进化与仙古冲关的最终晋升入口提示统一使用证道，原祭道之上门槛仍保留', async () => {
  for (const [file, method, route] of [
    ['apps/User/FlowerPollenPath.js', 'evolve', 'huafen'],
    ['apps/User/xiangujinshi.js', 'chongguan', 'xiangu'],
  ]) {
    const f = fixture(route), source = read(file), start = source.indexOf(`  async ${method}(e) {`);
    assert.ok(start >= 0);
    const tail = source.slice(start), end = tail.slice(1).search(/\r?\n  async \w+\(/) + 1;
    const deps = {
      withPlayerMutationLock, verc: () => true, resolveUserId: async () => owner,
      channel: async id => id, existplayer: async () => true, Read_player: async () => clone(f.stored),
      redis: { get: async () => null }, selectedFlowerPath: () => true, isNotNull: () => true,
      canCultivateExtraPath: () => true, getFlowerRootState: () => ({ critical: false }),
      data: { huafen_list: Array(25), filePathMap: { weimianList: '/fixture/weimian.json' } },
      fs: { existsSync: () => true, readFileSync: () => JSON.stringify({ 诸天位面: 10 }) },
    };
    const handler = new Function(...Object.keys(deps), `return ({${tail.slice(0, end)}\n}).${method};`)(...Object.values(deps));
    assert.match(await handler.call({}, f.event), /#证道.*唯一道之上/);
    f.stored[routes[route][0]]--;
    assert.match(await handler.call({}, f.event), /720分钟/);
    assert.equal(f.writes, 0);
  }
});
