import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import * as trial from '../model/trialUniverse.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import {
  getLocationName, getLocationId, getCoordinateLocations, getLocationThreshold,
  hasCoordinate, rememberCoordinate, purchaseCoordinateClue, canImmortalEmperorFreeTravel,
} from '../model/weimianTravel.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const newPlayer = () => ({
  id: 'trial-command', level_id: 1, Physique_id: 1, mijinglevel_id: 1,
  xiangulevel_id: 1, huafenlevel_id: 1, power_place: 0,
  修为: 0, 血气: 0, 灵石: 10_000_000_000,
});
function activePlayer() {
  return { ...newPlayer(), power_place: 0.6, 试炼宇宙: trial.createTrialState(1) };
}

function appFixture(initial, { failWrite = false, pending = null, exists = true, mappedId = initial.id } = {}) {
  let disk = clone(initial);
  let writes = 0;
  const replies = [];
  const accounts = [];
  const actions = [];
  const source = read('apps/User/TrialUniverse.js')
    .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
    .replace('export class', 'class');
  const Constructor = vm.runInNewContext(`${source}\nTrialUniverse`, {
    ...trial, console: { warn() {} }, withPlayerMutationLock,
    plugin: class { constructor(options) { Object.assign(this, options); } },
    verc: () => true, channel: async () => mappedId, existplayer: async () => exists,
    Read_player: async id => { accounts.push(id); return clone(disk); },
    Write_player: async (id, next) => {
      accounts.push(id);
      if (failWrite) throw Error('simulated disk failure');
      trial.assertTrialWriteCurrent(disk, next);
      writes++;
      disk = clone(next);
    },
    redis: { get: async key => { actions.push(key); return pending; } },
  });
  const app = new Constructor();
  const send = (msg, messageId = '', extra = {}) => app.handle({
    user_id: initial.id, msg, ...(messageId ? { message_id: messageId } : {}), ...extra,
    reply: async text => replies.push(text),
  });
  return { app, send, replies, accounts, actions, disk: () => disk, writes: () => writes };
}

test('试炼命令自动发现；空命令和人物别名只查询，普通人物面板继续传递', async () => {
  const app = appFixture(activePlayer());
  for (const command of ['#试炼宇宙', '#试炼宇宙 状态', '#我的练气', '#我']) {
    assert.ok(app.app.rule.some(rule => new RegExp(rule.reg).test(command)), command);
    assert.equal(await app.send(command), true);
    assert.match(app.replies.at(-1), /试炼/);
  }
  assert.equal(app.app.priority, 450);
  assert.equal(app.writes(), 0);
  const ordinary = appFixture(newPlayer());
  assert.equal(await ordinary.send('#我的练气'), false);
  assert.equal(await ordinary.send('#我'), false);
  assert.equal(ordinary.replies.length, 0);
});

test('未建档命令引导踏入仙途与选择降临地，人物别名不截断', async () => {
  const app = appFixture(newPlayer(), { exists: false });
  assert.equal(await app.send('#我'), false);
  assert.equal(await app.send('#试炼宇宙'), true);
  assert.match(app.replies.at(-1), /#踏入仙途/);
  assert.match(app.replies.at(-1), /#降临 试炼宇宙/);
  assert.equal(app.writes(), 0);
});

test('实际命令入口映射频道账号；相同消息并发入界仅保存一次', async () => {
  const app = appFixture(newPlayer(), { mappedId: 'mapped-trial' });
  await Promise.all([
    app.send('#试炼宇宙 入界 确认', 'entry-once'),
    app.send('#试炼宇宙 入界 确认', 'entry-once'),
  ]);
  assert.equal(app.writes(), 1);
  assert.equal(app.disk().power_place, 0.6);
  assert.ok(app.disk().试炼宇宙);
  assert.ok(app.accounts.every(id => id === 'mapped-trial'));
  assert.ok(app.actions.every(key => key === 'xiuxian:player:mapped-trial:action'));
});

test('缺少message_id时沿用群号时间序列去重，不重复创建试炼记录', async () => {
  const app = appFixture(newPlayer());
  const event = { group_id: 'test-group', time: 100, seq: 2 };
  await Promise.all([
    app.send('#试炼宇宙 入界 确认', '', event),
    app.send('#试炼宇宙 入界 确认', '', event),
  ]);
  assert.equal(app.writes(), 1);
});

test('实际试炼进入与行动消息并发去重，结算前保存后才回复', async () => {
  const app = appFixture(activePlayer());
  await Promise.all([
    app.send('#试炼宇宙 进入 末日 确认', 'enter-world'),
    app.send('#试炼宇宙 进入 末日 确认', 'enter-world'),
  ]);
  assert.equal(app.writes(), 1);
  assert.equal(app.disk().试炼宇宙.run.type, '末日');
  const before = clone(app.disk());
  await Promise.all([
    app.send('#试炼宇宙 行动 调查', 'investigate'),
    app.send('#试炼宇宙 行动 调查', 'investigate'),
  ]);
  assert.equal(app.writes(), 2);
  assert.equal(app.disk().试炼宇宙.revision, before.试炼宇宙.revision + 1);
  assert.equal(app.disk().试炼宇宙.run.ticks, before.试炼宇宙.run.ticks + 1);
  const failed = appFixture(before, { failWrite: true });
  await failed.send('#试炼宇宙 行动 调查', 'failed-investigate');
  assert.deepEqual(failed.disk(), before);
  assert.equal(failed.replies.length, 1);
  assert.match(failed.replies[0], /未确认完成/);
});

test('试炼落盘失败只发核对提示，重试沿用原存档；旧行动阻止入界', async () => {
  const player = newPlayer();
  const failed = appFixture(player, { failWrite: true });
  await failed.send('#试炼宇宙 入界 确认', 'entry-fail');
  assert.equal(failed.writes(), 0);
  assert.deepEqual(failed.disk(), player);
  assert.equal(failed.replies.length, 1);
  assert.match(failed.replies[0], /未确认完成/);
  const retry = appFixture(failed.disk());
  await retry.send('#试炼宇宙 入界 确认', 'entry-fail');
  assert.equal(retry.writes(), 1);
  const pending = appFixture(newPlayer(), { pending: '{"action":"闭关"}' });
  await pending.send('#试炼宇宙 入界 确认');
  assert.equal(pending.writes(), 0);
  assert.match(pending.replies.at(-1), /原路线尚有行动记录/);
});

test('实际Go入口在频道映射后阻断普通修炼，避免在原路线发起行动', async () => {
  const source = read('model/xiuxian.js');
  const start = source.indexOf('export async function Go(');
  const end = source.indexOf('// export async function Go(', start);
  const fn = source.slice(start, end).replace('export async function', 'async function');
  const replies = [];
  let account;
  const Go = vm.runInNewContext(`${fn}\nGo`, {
    channel: async () => 'mapped-trial',
    Read_player: async id => { account = id; return activePlayer(); },
    getTrialCommandBlock: trial.getTrialCommandBlock,
  });
  assert.equal(await Go({ user_id: 'qg_origin', msg: '#闭关', reply: text => replies.push(text) }), 0);
  assert.equal(account, 'mapped-trial');
  assert.match(replies[0], /试炼/);
});

test('实际verc入口同步映射绑定账号且放行试炼面板，未绑定的普通人物保持通行', () => {
  const source = read('api/api.js');
  const start = source.indexOf('export const verc =');
  const fn = source.slice(start, source.indexOf('\nexport {', start)).replace('export const', 'const');
  const files = new Map([
    [path.join('channel', 'channel.json'), JSON.stringify([{ 频道_ID: 'origin', QQ_ID: 'mapped' }])],
    [path.join('xiuxian_player', 'mapped.json'), JSON.stringify(activePlayer())],
    [path.join('xiuxian_player', 'ordinary.json'), JSON.stringify(newPlayer())],
  ]);
  const verc = vm.runInNewContext(`${fn}\nverc`, {
    fs: { existsSync: file => files.has(file), readFileSync: file => files.get(file) },
    path, getResourcePath: relative => relative,
    getTrialCommandBlock: trial.getTrialCommandBlock,
    console: { warn() {} },
  });
  const replies = [];
  assert.equal(verc({ e: { user_id: 'qg_origin', msg: '#闭关', reply: text => replies.push(text) } }), false);
  assert.match(replies[0], /试炼/);
  for (const msg of ['#试炼宇宙', '#试炼宇宙 状态', '#我的练气', '#我']) {
    assert.equal(verc({ e: { user_id: 'qg_origin', msg } }), true, msg);
  }
  assert.equal(verc({ e: { user_id: 'ordinary', msg: '#闭关' } }), true);
  files.set(path.join('channel', 'channel.json'), '{broken-channel');
  files.set(path.join('xiuxian_player', 'origin.json'), JSON.stringify(activePlayer()));
  assert.equal(verc({ e: { user_id: 'qg_origin', msg: '#闭关', reply: text => replies.push(text) } }), false);
  assert.match(replies.at(-1), /试炼/);
});

test('试炼宇宙具备显示名称，但不进入购买、记忆、帝级传送与常规出入通道', () => {
  const player = activePlayer();
  assert.equal(getLocationName(0.6), '试炼宇宙');
  assert.equal(getLocationId('试炼宇宙'), 0.6);
  assert.equal(getCoordinateLocations().includes('试炼宇宙'), false);
  assert.equal(hasCoordinate(player, '试炼宇宙'), false);
  assert.equal(rememberCoordinate(player, '试炼宇宙'), false);
  assert.equal(purchaseCoordinateClue(player, '试炼宇宙').ok, false);
  assert.equal(getLocationThreshold(player, '凡间').ok, false);
  assert.equal(getLocationThreshold({ level_id: 100, mijinglevel_id: 25 }, '试炼宇宙').ok, false);
  assert.equal(canImmortalEmperorFreeTravel({ mijinglevel_id: 25 }, '凡间', '试炼宇宙'), false);
  assert.equal(getLocationThreshold({ level_id: 42 }, '仙界').ok, true);
});

test('实际Write_player拒绝试炼旧快照与路线删除，但保留派生属性重算', async () => {
  const source = read('model/xiuxian.js');
  const start = source.indexOf('export async function Write_player(');
  const fn = source.slice(start, source.indexOf('\nfunction normalizeEquipmentSlot(', start))
    .replace('export async function', 'async function');
  let disk = activePlayer();
  let writes = 0;
  const noop = () => {};
  const Write_player = vm.runInNewContext(`${fn}\nWrite_player`, {
    path, withPlayerMutationLock, __PATH: { player_path: 'players', data_path: 'data' },
    fs: { existsSync: file => file === path.join('players', 'trial.json'), readFileSync: () => JSON.stringify(disk) },
    assertGlobalInitIdle: noop, assertTribulationWriteAllowed: noop,
    assertZhutianMirrorWriteCurrent: noop, assertZhutianAvatarRootWriteAllowed: noop,
    updateDailyTaskLingshiProgress: noop, assertTrialWriteCurrent: trial.assertTrialWriteCurrent,
    assertSacrificeBubbleWrite: noop, ensureStrangeSacrificeState: () => ({}),
    config: { getConfig: () => ({}) }, getRealmEventWorldYear: () => 0,
    applyHeavenWillSlashOnAdvancement: () => ({ triggered: false }),
    isTianmoHuashengPhysique: () => false, releaseJuelingLifespanForAuthority: noop,
    writeJsonAtomically: (_file, next) => { writes++; disk = clone(next); },
    markZhutianMirrorSnapshot: noop, console: { warn() {} },
  });
  for (const change of [
    player => { delete player.试炼宇宙; },
    player => { player.power_place = 0; },
    player => { player.试炼宇宙.revision--; },
    player => { player.level_id = 100; },
  ]) {
    const next = clone(disk);
    change(next);
    await assert.rejects(Write_player('trial', next), { code: 'TRIAL_UNIVERSE_STALE_WRITE' });
  }
  assert.equal(writes, 0);
  const recalculated = clone(disk);
  recalculated.攻击 = 300;
  await Write_player('trial', recalculated);
  assert.equal(writes, 1);
  assert.equal(disk.攻击, 300);
});

test('直接XiuxianData.setData同样拒绝过期试炼快照、删档和常规修炼覆盖', () => {
  const source = read('model/XiuxianData.js');
  const start = source.indexOf('  setData(file_name, user_qq, data) {');
  const end = source.indexOf('\n  }', start) + '\n  }'.length;
  let disk = activePlayer();
  let writes = 0;
  const noop = () => {};
  const setData = vm.runInNewContext(`({${source.slice(start, end)}}).setData`, {
    path, fs: { existsSync: () => true, readFileSync: () => JSON.stringify(disk) },
    assertGlobalInitIdle: noop, assertTribulationSnapshotCurrentSync: noop,
    assertZhutianMirrorWriteCurrent: noop, assertZhutianAvatarRootWriteAllowed: noop,
    assertTrialWriteCurrent: trial.assertTrialWriteCurrent,
    writeJsonAtomically: (_file, next) => { writes++; disk = clone(next); },
  }).bind({ filePathMap: { player: 'players' } });
  const stale = clone(disk);
  const result = trial.runTrialCommand(disk, '进入 末日 确认', { now: 100, requestId: 'new-world' });
  assert.equal(result.ok, true, result.message);
  assert.throws(() => setData('player', 'trial', stale), { code: 'TRIAL_UNIVERSE_STALE_WRITE' });
  const removed = clone(disk);
  delete removed.试炼宇宙;
  assert.throws(() => setData('player', 'trial', removed), { code: 'TRIAL_UNIVERSE_STALE_WRITE' });
  const crossed = clone(disk);
  crossed.power_place = 1;
  assert.throws(() => setData('player', 'trial', crossed), { code: 'TRIAL_UNIVERSE_STALE_WRITE' });
  assert.equal(writes, 0);
  const derived = clone(disk);
  derived.当前血量 = 200;
  setData('player', 'trial', derived);
  assert.equal(writes, 1);
  assert.equal(disk.当前血量, 200);
});
