import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as core from '../model/selfDaoDeduction.js';
import {
  getRealmAuthorityLevel, hasReachedImmortalEmperor, lowerRealmAuthority, rememberImmortalEmperorHistory,
} from '../model/realmAuthority.js';
import { isShapeSpiritDestroyed } from '../model/worldlineAuthority.js';
import { getActiveZhutianAvatarName } from '../model/zhutianMirror.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const clone = structuredClone;
const routes = { mijing: ['mijinglevel_id', 21], xiangu: ['xiangulevel_id', 22], huafen: ['huafenlevel_id', 22] };
function player(route = 'mijing') {
  const [field, emperor] = routes[route];
  return { id: 'fixture-reproof', 名号: '昔日仙帝', 额外体系: route,
    mijinglevel_id: 1, xiangulevel_id: 1, huafenlevel_id: 1, [field]: emperor - 1,
    修为: 123456, 血气: 654321, 元神: 300, 仙道潜力: 12, 心神: 50, 寿元: 456, 纪元积累: 67,
    当前血量: 800, 血量上限: 1000, 修仙状态: '空闲', 曾达路尽级仙帝: true };
}

test('三体系昔日路尽仙帝重证只恢复主修并清空修血，不再要求推演或其他资粮', () => {
  for (const [route, [field, emperor]] of Object.entries(routes)) {
    const p = player(route), before = clone(p);
    p.自创修炼体系 = { name: '旧道统', route: route === 'xiangu' ? 'mijing' : route };
    assert.equal(core.canReproveImmortalEmperor(p), true);
    assert.equal(core.reproveImmortalEmperor(p, 1234).ok, true);
    assert.equal(p[field], emperor);
    assert.equal(getRealmAuthorityLevel(p), 21);
    assert.equal(p.修为, 0);
    assert.equal(p.血气, 0);
    assert.equal(p.己道推演.completed, true);
    for (const key of ['元神', '仙道潜力', '心神', '寿元', '纪元积累']) assert.equal(p[key], before[key]);
    for (const [other, [otherField]] of Object.entries(routes)) if (other !== route) assert.equal(p[otherField], 1);
    p.修为 = 20;
    assert.equal(core.reproveImmortalEmperor(p).ok, false);
    assert.equal(p.修为, 20);
  }
});

test('普通准仙帝、半步仙帝或只有神胎和二十层推演者均没有重证资格，跌境历史永久保留', () => {
  for (const extra of [
    {}, { 自身之道境界: '半步仙帝·神胎圆满', 境界称号: '路尽级仙帝' },
    { 己道推演: { attempts: 20, halfImmortalEmperor: true, divineEmbryo: '已结出' } },
  ]) {
    const p = { ...player(), ...extra };
    delete p.曾达路尽级仙帝;
    const before = clone(p);
    assert.equal(hasReachedImmortalEmperor(p), false);
    assert.equal(core.reproveImmortalEmperor(p).ok, false);
    assert.deepEqual(p, before);
  }
  for (const [route, [field, emperor]] of Object.entries(routes)) {
    const p = player(route);
    delete p.曾达路尽级仙帝;
    p[field] = emperor;
    lowerRealmAuthority(p);
    assert.equal(p.曾达路尽级仙帝, true);
    assert.equal(core.reproveImmortalEmperor(p).ok, true);
  }
});

test('旧档成帝完成、时间戳和已被古史改写的仙帝道果事实均能认回历史，化身不冒领', () => {
  for (const proof of [
    { 己道推演: { completed: true } }, { 己道推演: { completedAt: 123 } },
    { 自创修炼体系: { emperorAt: 123 } },
    { 时间线权能: { facts: [{ type: '证道', name: '仙帝道果', state: 'erased' }] } },
  ]) {
    const p = { ...player(), ...proof };
    delete p.曾达路尽级仙帝;
    assert.equal(core.canReproveImmortalEmperor(p), true);
    assert.equal(core.reproveImmortalEmperor(p).ok, true);
    assert.equal(p.曾达路尽级仙帝, true);
  }
  const target = player();
  delete target.曾达路尽级仙帝;
  rememberImmortalEmperorHistory(target, { mijinglevel_id: 21 });
  assert.equal(target.曾达路尽级仙帝, true);
  assert.equal(rememberImmortalEmperorHistory({}, { 己道推演: { halfImmortalEmperor: true } }), false);
  const avatar = { ...player(), 诸天镜系统: { 当前化身: '测试化身' } };
  assert.equal(core.canReproveImmortalEmperor(avatar), false);
  for (const blocked of [{ 修仙状态: '身灭道消' }, { 修仙状态: '形神俱灭' }, { 当前血量: 0 }, { 始祖永祭: { status: 'bubble' } }]) {
    const p = { ...player(), ...blocked }, before = clone(p);
    assert.equal(core.reproveImmortalEmperor(p).ok, false);
    assert.deepEqual(p, before);
  }
});

function commandFixture(route = 'mijing') {
  const state = { stored: player(route), equipment: { 帝兵: { name: '旧帝兵' } }, writes: 0, refreshes: 0, invalidations: 0 };
  const deps = {
    ...core, path, withPlayerMutationLock, isShapeSpiritDestroyed, getActiveZhutianAvatarName,
    verc: () => true, Go: async () => !state.busy, existplayer: async () => true,
    Read_player: async () => clone(state.stored), Read_equipment: async () => clone(state.equipment),
    Write_player: async (_id, p) => { state.stored = clone(p); state.writes++; if (state.failPlayer) throw new Error('fixture-player-write'); },
    Write_equipment: async (_id, equipment) => {
      state.equipment = { ...equipment, rebuilt: true }; state.refreshes++;
      if (state.failEquipment) throw new Error('fixture-equipment-write');
    },
    player_efficiency: async () => {},
    invalidateBattleEquipmentCache: () => { state.invalidations++; },
    __PATH: { player_path: '/fixture/player', equipment_path: '/fixture/equipment' },
    FileRollbackTransaction: class {
      constructor() { this.before = clone({ stored: state.stored, equipment: state.equipment }); }
      capture() {} commit() {} rollback() { Object.assign(state, clone(this.before)); }
    },
  };
  const source = read('apps/User/SelfDaoDeduction.js');
  const from = source.indexOf('  async reproveEmperor('), end = source.indexOf('  gateMessage(', from);
  const method = new Function(...Object.keys(deps), `return ({${source.slice(from, end)}}).reproveEmperor;`)(...Object.values(deps));
  state.app = { playerId: async () => state.stored.id, reproveEmperor: method };
  state.event = { isGroup: true, user_id: state.stored.id, msg: '#证道', reply: async text => text };
  return state;
}

test('真实证道分派三体系都可重证，并发与重复请求不二次清血，普通角色交回原指令', async () => {
  for (const route of Object.keys(routes)) {
    const f = commandFixture(route);
    const replies = await Promise.all([f.app.reproveEmperor(f.event), f.app.reproveEmperor(f.event)]);
    assert.ok(replies.some(reply => /已重登/.test(reply)));
    assert.ok(replies.includes(false));
    assert.equal(f.writes, 1);
    assert.equal(f.refreshes, 1);
    assert.equal(f.stored.修为, 0);
    f.stored.修为 = 100;
    assert.equal(await f.app.reproveEmperor(f.event), false);
    assert.equal(f.stored.修为, 100);
  }
  const ordinary = commandFixture();
  delete ordinary.stored.曾达路尽级仙帝;
  assert.equal(await ordinary.app.reproveEmperor(ordinary.event), false);
  assert.equal(ordinary.writes, 0);
});

test('真实重证保留忙碌与身亡门禁，玩家或装备写入异常回滚境界和全部修血', async () => {
  for (const failure of ['failPlayer', 'failEquipment']) {
    const f = commandFixture();
    const before = clone(f.stored), equipment = clone(f.equipment);
    f[failure] = true;
    await assert.rejects(f.app.reproveEmperor(f.event), /fixture-/);
    assert.deepEqual(f.stored, before);
    assert.deepEqual(f.equipment, equipment);
    assert.equal(f.invalidations, 1);
  }
  for (const blocked of ['busy', 'dead', 'bubble', 'private']) {
    const f = commandFixture();
    if (blocked === 'busy') f.busy = true;
    if (blocked === 'dead') f.stored.修仙状态 = '形神俱灭';
    if (blocked === 'bubble') f.stored.始祖永祭 = { status: 'bubble' };
    if (blocked === 'private') f.event.isGroup = false;
    await f.app.reproveEmperor(f.event);
    assert.equal(f.writes, 0);
    assert.equal(f.stored.修为, 123456);
  }
});

test('两个真实玩家保存入口均在从仙帝跌落的写入中保留历史，第二次保存也不丢失', async () => {
  for (const direct of [false, true]) {
    let disk = { ...player(), mijinglevel_id: 21 };
    delete disk.曾达路尽级仙帝;
    const noop = () => {};
    const deps = {
      path, rememberImmortalEmperorHistory, withPlayerMutationLock,
      fs: { existsSync: file => !file.endsWith('strange_sacrifice_state.json'), readFileSync: () => JSON.stringify(disk) },
      __PATH: { player_path: '/fixture/player', data_path: '/fixture/data' },
      assertGlobalInitIdle: noop, assertTribulationWriteAllowed: noop, assertTribulationSnapshotCurrentSync: noop,
      assertZhutianMirrorWriteCurrent: noop, assertZhutianAvatarRootWriteAllowed: noop,
      updateDailyTaskLingshiProgress: noop, assertSacrificeBubbleWrite: noop,
      ensureStrangeSacrificeState: () => ({}), getRealmEventWorldYear: () => 0,
      applyHeavenWillSlashOnAdvancement: () => ({ triggered: false }),
      isTianmoHuashengPhysique: () => false, releaseJuelingLifespanForAuthority: noop,
      syncSuiyunLuckyBonus: noop, markZhutianMirrorSnapshot: noop,
      config: { getConfig: () => ({}) }, console: { warn: noop },
      writeJsonAtomically: (_file, next) => { disk = clone(next); },
    };
    const source = read(direct ? 'model/XiuxianData.js' : 'model/xiuxian.js');
    const from = source.indexOf(direct ? '  setData(file_name, user_qq, data) {' : 'export async function Write_player(');
    const to = direct ? source.indexOf('\n  }', from) + '\n  }'.length : source.indexOf('\nfunction normalizeEquipmentSlot(', from);
    const write = new Function(...Object.keys(deps), direct
      ? `return ({${source.slice(from, to)}}).setData;`
      : `${source.slice(from, to).replace('export ', '')}; return Write_player;`)(...Object.values(deps));
    const save = next => direct
      ? write.call({ filePathMap: { player: '/fixture/player' } }, 'player', 'owner', next)
      : write('owner', next);
    const fallen = { ...clone(disk), mijinglevel_id: 20 };
    await save(fallen);
    assert.equal(disk.曾达路尽级仙帝, true);
    assert.equal(core.canReproveImmortalEmperor(disk), true);
    const staleHistory = clone(disk);
    delete staleHistory.曾达路尽级仙帝;
    await save(staleHistory);
    assert.equal(disk.曾达路尽级仙帝, true);
  }
  assert.match(read('apps/User/SelfDaoDeduction.js'), /reg: '\^#证道\$'.*fnc: 'reproveEmperor'/);
});
