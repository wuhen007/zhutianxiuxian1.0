import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as core from '../model/suiyun.js';
import * as kings from '../model/immortalFishKing.js';
import * as fishing from '../model/immortalFishing.js';
import * as sacrifice from '../model/strangeSacrifice.js';
import { getPlayerPlaneName } from '../model/planeCoords.js';
import { PLACE_LOCATION_MAP } from '../model/weimianTravel.js';
import { getPlaneDestructionInfo, repairPlane, restoreHighlandForAdmin } from '../model/planeDestruction.js';
import { FileRollbackTransaction } from '../apps/SecretPlace/rebirthTransaction.js';
import { writeJsonAtomically } from '../utils/atomicJson.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const clone = value => structuredClone(value);

function redisFixture() {
  const mock = {
    values: new Map(), failIndex: false, failDelete: false,
    get: async key => mock.values.get(String(key)) ?? null,
    keys: async pattern => [...mock.values.keys()].filter(key => key.startsWith(pattern.replace(/\*$/, ''))),
    set: async (key, value, options = {}) => {
      key = String(key);
      if (mock.failIndex && key.startsWith('xiuxian:immortal-fish-king:team:') && !options.NX) {
        mock.failIndex = false;
        throw new Error('injected-team-index-failed');
      }
      if (options.NX && mock.values.has(key)) return null;
      mock.values.set(key, String(value));
      return 'OK';
    },
    del: async (...keys) => {
      for (const key of keys) {
        mock.values.delete(String(key));
        if (mock.failDelete) { mock.failDelete = false; throw new Error('injected-redis-delete-failed'); }
      }
      return keys.length;
    },
    sMembers: async () => [],
  };
  return mock;
}

function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyun-fish-highland-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function fishFixture(t, stage = 1) {
  const dir = directory(t);
  const file = path.join(dir, 'owner.json');
  const mock = redisFixture();
  const previous = globalThis.redis;
  globalThis.redis = mock;
  t.after(() => { globalThis.redis = previous; });
  writeJsonAtomically(file, {
    id: 'owner', 名号: '月华垂钓者', 灵根: core.createSuiyunRoot(stage), 岁云之力: 6,
    攻击: 10, 防御: 10, 血量上限: 100, 暴击率: 0, power_place: PLACE_LOCATION_MAP.凡间,
  });
  const state = { mock, file, failWrite: false, replies: [] };
  const source = read('apps/User/Suiyun.js');
  const deps = {
    ...core, ...kings, ...fishing, getPlayerPlaneName, path, withPlayerMutationLock, FileRollbackTransaction,
    __PATH: { player_path: dir, najie_path: dir }, GetPower: () => 100,
    Read_player: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
    Write_player: async (_id, player) => {
      writeJsonAtomically(file, player);
      if (state.failWrite) { state.failWrite = false; throw new Error('injected-player-write-failed'); }
    },
  };
  const transactionFrom = source.indexOf('function transactionFor('), transactionTo = source.indexOf('async function savePlayers(', transactionFrom);
  const from = source.indexOf('  async moonFishing('), to = source.indexOf('  async createItem(', from);
  assert.ok(to > from);
  const method = new Function(...Object.keys(deps),
    `${source.slice(transactionFrom, transactionTo)};return ({${source.slice(from, to)}}).moonFishing;`)(...Object.values(deps));
  state.app = {
    context: async () => ({ qq: 'owner' }), settlePalace: async () => {},
    holderError: player => core.getSuiyunStage(player) ? '' : '请先开启岁云传承。',
    moonFishing: method,
  };
  state.event = (extras = {}) => ({
    user_id: 'owner', isGroup: true, group_id: 'group', msg: '#月华垂钓',
    reply: async message => { state.replies.push(message); return message; }, ...extras,
  });
  state.read = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  return state;
}

test('月华垂钓五阶段均扣3点必建真实鱼王并本人入队，当前水域及抽象位面均可用', async t => {
  const f = fishFixture(t);
  for (let stage = 1; stage <= 5; stage++) {
    const p = f.read();
    p.灵根 = core.createSuiyunRoot(stage);
    p.岁云之力 = 6;
    if (stage === 5) p.power_place = PLACE_LOCATION_MAP.永恒未知之地;
    writeJsonAtomically(f.file, p);
    await f.app.moonFishing(f.event());
    const king = await kings.readActiveFishKing('group');
    assert.ok(king);
    assert.equal(f.read().岁云之力, 3);
    assert.equal(king.ownerId, 'owner');
    assert.deepEqual(king.members, [{ id: 'owner', name: '月华垂钓者' }]);
    assert.equal((await kings.findFishKingByTeamId(king.teamId)).id, king.id);
    assert.ok(fishing.FISHING_PLANE_NAMES.includes(king.plane));
    if (stage < 5) assert.equal(king.plane, '凡间');
    assert.equal(king.name, fishing.getPlaneFishConfig(king.plane).king.name);
    assert.match(f.replies.at(-1), /消耗3点.*必定钓起鱼王/);
    await kings.deleteActiveFishKing('group');
  }
});

test('月华垂钓并发/已有鱼王/已在外群队伍不重复扣费，私聊和余额不足无状态写入', async t => {
  const f = fishFixture(t);
  await f.app.moonFishing(f.event({ isGroup: false }));
  assert.equal(f.read().岁云之力, 6);
  assert.equal(f.mock.values.size, 0);
  await Promise.all([f.app.moonFishing(f.event()), f.app.moonFishing(f.event())]);
  assert.equal(f.read().岁云之力, 3);
  assert.equal((await kings.listActiveFishKings()).length, 1);
  await f.app.moonFishing(f.event());
  assert.equal(f.read().岁云之力, 3);
  await f.app.moonFishing(f.event({ group_id: 'another-group' }));
  assert.equal(f.read().岁云之力, 3);
  assert.equal(await kings.readActiveFishKing('another-group'), null);
  await kings.deleteActiveFishKing('group');
  const p = f.read();
  p.岁云之力 = 2.999;
  writeJsonAtomically(f.file, p);
  await f.app.moonFishing(f.event());
  assert.equal(f.read().岁云之力, 2.999);
  assert.equal((await kings.listActiveFishKings()).length, 0);
  p.灵根 = { name: '普通灵根' }; p.岁云之力 = 100;
  writeJsonAtomically(f.file, p);
  await f.app.moonFishing(f.event());
  assert.equal(f.read().岁云之力, 100);
});

test('月华垂钓扣款写入或真实鱼王索引创建失败完整退款且无免费鱼王残留', async t => {
  const f = fishFixture(t);
  const before = fs.readFileSync(f.file, 'utf8');
  f.failWrite = true;
  await assert.rejects(f.app.moonFishing(f.event()), /injected-player-write-failed/);
  assert.equal(fs.readFileSync(f.file, 'utf8'), before);
  assert.equal(f.mock.values.size, 0);
  f.mock.failIndex = true;
  await assert.rejects(f.app.moonFishing(f.event()), /injected-team-index-failed/);
  assert.equal(fs.readFileSync(f.file, 'utf8'), before);
  assert.equal(f.mock.values.size, 0);
  await f.app.moonFishing(f.event());
  assert.equal(f.read().岁云之力, 3);
  assert.ok(await kings.readActiveFishKing('group'));
});

function highlandFixture(t) {
  const dir = directory(t);
  const planeFile = path.join(dir, 'plane.json'), stateFile = path.join(dir, 'strange_sacrifice_state.json');
  const plane = {
    厄土高原: 0, 高原彻底覆灭: true, 凡间: 0, 仙界: 1, 现世承受力: 123,
    位面毁灭记录: { 厄土高原: { source: 'strange_emperor' }, 凡间: { source: 'dark_revolt' } },
    位面损坏记录: { 厄土高原: { damage: 100 }, 仙界: { damage: 30 } },
  };
  const state = sacrifice.ensureStrangeSacrificeState({
    phase: 'destroyed', plateauDestroyed: true, plateauDestroyedAt: 1, plateauDestroyedBy: '祭道之上',
    smallCount: 2, bigCount: 2, plateauRewinds: 7,
  });
  writeJsonAtomically(planeFile, plane);
  writeJsonAtomically(stateFile, state);
  const mock = redisFixture();
  mock.values.set('xiuxian:dajie_eternally_defeated', 'true');
  mock.values.set('xiuxian:epochs_since_dajie', '3');
  mock.values.set('guiyishizu', JSON.stringify({ isEternallyDefeated: true }));
  mock.values.set('gaoyuan', 'ended');
  mock.values.set('guiyishizu_ancestors', 'ended');
  const settings = { Master: ['configured'], Era: { current: { totalYears: 100000, index: 2, epoch: 3, years: 0 } } };
  const source = read('apps/Boss/StrangeSacrifice.js').replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*\r?\n/gm, '').replace(/^export /gm, '');
  const deps = {
    ...sacrifice, fs, path, restoreHighlandForAdmin, writeJsonAtomically, withPlayerMutationLock, FileRollbackTransaction,
    __PATH: { data_path: dir, player_path: dir }, data: { filePathMap: { weimianList: planeFile } },
    config: { getConfig: () => clone(settings) }, getRealmEventWorldYear: () => 100000,
    channel: async value => String(value), redis: mock, verc: () => true,
    plugin: class { constructor(options) { Object.assign(this, options); } },
  };
  const App = new Function(...Object.keys(deps), `${source};return StrangeSacrifice;`)(...Object.values(deps));
  const app = new App();
  app.broadcast = async () => {};
  app.hasImmortalEmperor = async () => false;
  const e = (extras = {}) => ({ user_id: 'master', isMaster: true, msg: '#复苏厄土高原', reply: async message => message, ...extras });
  return { app, mock, plane, state, planeFile, stateFile, e, readPlane: () => JSON.parse(fs.readFileSync(planeFile, 'utf8')),
    readState: () => JSON.parse(fs.readFileSync(stateFile, 'utf8')) };
}

test('管理员无境界要求复苏祭道之上摧毁的高原，清除三类标记并保留其他位面和历史', async t => {
  const f = highlandFixture(t);
  assert.equal(repairPlane(f.planeFile, '厄土高原'), false, '普通映照保留永久限制');
  assert.ok(f.app.rule.some(rule => new RegExp(rule.reg).test('#复苏厄土高原')));
  await f.app.restoreHighland(f.e());
  assert.deepEqual(getPlaneDestructionInfo(f.planeFile, '厄土高原'), {
    destroyed: false, permanent: false, planeName: '厄土高原', source: 'unknown', actor: '', worldYear: null,
  });
  const plane = f.readPlane(), state = f.readState();
  assert.equal(plane.凡间, 0);
  assert.equal(plane.仙界, 1);
  assert.equal(plane.现世承受力, 123);
  assert.deepEqual(plane.位面毁灭记录, { 凡间: { source: 'dark_revolt' } });
  assert.deepEqual(plane.位面损坏记录, { 仙界: { damage: 30 } });
  assert.equal(state.plateauDestroyed, false);
  assert.equal(state.phase, 'dormant');
  assert.equal(state.smallCount, 2);
  assert.equal(state.bigCount, 2);
  assert.equal(state.plateauRewinds, 7);
  assert.equal(state.plateauDestroyedAt, undefined);
  assert.equal(state.smallDueWorldYear, 500000);
  assert.equal(f.mock.values.size, 0);
  const again = clone(state);
  await f.app.restoreHighland(f.e());
  assert.deepEqual(f.readState(), again);
  assert.equal(sacrifice.forceStartStrangeSacrifice(state, 'big', 100000).event.type, 'big_started');
});

test('普通用户无修改权限，修仙配置管理员可恢复；活动中的祭礼不被重复复苏重置', async t => {
  const f = highlandFixture(t);
  const before = fs.readFileSync(f.planeFile, 'utf8');
  assert.match(await f.app.restoreHighland(f.e({ isMaster: false, user_id: 'normal' })), /仅限/);
  assert.equal(fs.readFileSync(f.planeFile, 'utf8'), before);
  await f.app.restoreHighland(f.e({ isMaster: false, user_id: 'configured', msg: '#复苏额土高原' }));
  const running = sacrifice.forceStartStrangeSacrifice(f.readState(), 'small', 100000).state;
  writeJsonAtomically(f.stateFile, running);
  await f.app.restoreHighland(f.e());
  assert.deepEqual(f.readState().activeEvent, running.activeEvent);
  assert.equal(f.readState().smallCount, running.smallCount);
});

test('高原复苏Redis清理中断时两文件和旧标记一起恢复，重试只解除终局', async t => {
  const f = highlandFixture(t);
  const beforePlane = fs.readFileSync(f.planeFile, 'utf8'), beforeState = fs.readFileSync(f.stateFile, 'utf8');
  const beforeRedis = [...f.mock.values.entries()];
  f.mock.failDelete = true;
  await assert.rejects(f.app.restoreHighland(f.e()), /injected-redis-delete-failed/);
  assert.equal(fs.readFileSync(f.planeFile, 'utf8'), beforePlane);
  assert.equal(fs.readFileSync(f.stateFile, 'utf8'), beforeState);
  assert.deepEqual([...f.mock.values.entries()].sort(), beforeRedis.sort());
  await f.app.restoreHighland(f.e());
  assert.equal(f.readPlane().厄土高原, 1);
  assert.equal(f.readState().plateauDestroyed, false);
});

test('复苏与已运行祭礼结算共用锁，结算旧覆灭状态后再恢复且不反覆盖', async t => {
  const f = highlandFixture(t);
  let begin, finish;
  const begun = new Promise(resolve => { begin = resolve; });
  const finished = new Promise(resolve => { finish = resolve; });
  f.app.fightLocked = async () => { begin(); await finished; writeJsonAtomically(f.planeFile, f.plane); writeJsonAtomically(f.stateFile, f.state); };
  const battle = f.app.fight({}, 'big');
  await begun;
  const restored = f.app.restoreHighland(f.e());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.readPlane().厄土高原, 0);
  finish();
  await Promise.all([battle, restored]);
  assert.equal(f.readPlane().厄土高原, 1);
  assert.equal(f.readState().plateauDestroyed, false);
});
