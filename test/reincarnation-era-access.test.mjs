import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as logic from '../model/reincarnationWay.js';

const patch = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = path.resolve(process.env.REINCARNATION_HOST_PLUGIN || patch);
const locks = await import(pathToFileURL(path.join(host, 'utils/playerMutationLock.js')));
const clock = await import(pathToFileURL(path.join(host, 'model/realmEventClock.js')));
const authority = await import(pathToFileURL(path.join(host, 'model/realmAuthority.js')));
const complete = progress => ({
  轮回大道: { 境界: '岁月境大圆满', 生死境: { 阶段: 3, 进度: 100 }, 岁月境: { 阶段: 3, 进度: progress } },
});

function harness({ player = complete(1), current, master = [], enabled = true, saveFails = false, guarded = true, sourcePath } = {}) {
  const store = {
    Master: master,
    Era: { enabled, current: current || { index: 1, years: 1000, epoch: 2, totalYears: 61000 } },
    OtherCustom: { keep: true },
  };
  const players = new Map([['p', structuredClone(player)]]);
  const messages = [], writes = [], transitions = [];
  let readCount = 0, playerWrites = 0;
  const config = {
    getConfig(app, name) { assert.equal(app, 'xiuxian'); assert.equal(name, 'xiuxian'); return structuredClone(store); },
    setConfig(app, name, value) {
      assert.equal(app, 'xiuxian'); assert.equal(name, 'xiuxian');
      if (saveFails) throw new Error('fake disk full');
      writes.push(structuredClone(value.Era.current));
      Object.assign(store, structuredClone(value));
    },
  };
  const injected = {
    ...logic, ...clock, ...locks, ...authority,
    plugin: class { constructor(options) { Object.assign(this, options); } },
    config, data: {}, fs: {}, path, console: { log() {}, warn() {}, error() {} },
    existplayer: async id => players.has(id),
    Read_player: async id => { readCount++; return structuredClone(players.get(id)); },
    Write_player: async () => { playerWrites++; throw new Error('Unexpected player mutation'); },
    channel: async id => id === 'official-fixture' ? 'p' : id,
    verc: () => guarded,
    ensureDaoPath() {},
    bigNumberTransform: v => String(v),
  };
  const clean = text => text.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export /gm, '');
  const managerText = clean(fs.readFileSync(path.join(patch, 'apps/tasks/EraChangeTask.js'), 'utf8'));
  const Manager = vm.runInNewContext(
    `${managerText}\nprocessEmperorRefinement = async () => '';\n;EraChangeTask`,
    injected, { timeout: 1500, filename: 'isolated-era-manager.js' },
  );
  function manager() {
    const m = Object.create(Manager.prototype);
    m.configKey = 'xiuxian';
    m.loadEraConfig = () => { m.set = config.getConfig('xiuxian', 'xiuxian'); };
    m.loadEraConfig();
    m.eras = ['神话', '太古', '天命', '末法', '绝灵'].map(name => ({ name, icon: '' }));
    m.createProgressBar = years => String(years);
    m.suppressLifespan = async callback => { transitions.push('enter-jueling'); await callback?.(); return 0; };
    m.restoreLifespan = async callback => { transitions.push('leave-jueling'); await callback?.(); return 0; };
    m.processDaoTreasureLifecycle = async () => {};
    m.processDarkRevoltDestruction = async () => '';
    return m;
  }
  const commandText = clean(fs.readFileSync(sourcePath || path.join(patch, 'apps/User/daofa.js'), 'utf8'));
  const Command = vm.runInNewContext(`${commandText}\n;daofa`, injected, { timeout: 1500, filename: 'isolated-era-command.js' });
  const app = new Command();
  app.getReincarnationEraManager = async () => manager();
  const event = (msg = '#推进时代 1000', extra = {}) => ({
    user_id: 'p', msg, isMaster: false, reply: async text => { messages.push(text); return true; }, ...extra,
  });
  return { app, manager, event, store, players, writes, transitions, messages,
    reads: () => readCount, playerWrites: () => playerWrites };
}

test('截图场景：非主人、大圆满1%从命令规则到权威世界配置都成功推进1000年', async () => {
  const h = harness({ player: complete(1) });
  const e = h.event();
  const matched = h.app.rule.find(rule => new RegExp(rule.reg).test(e.msg));
  assert.equal(matched.fnc, 'advanceEra2');
  assert.equal(matched.permission, undefined);
  await h.app[matched.fnc](e);
  assert.equal(h.store.Era.current.years, 2000);
  assert.equal(h.store.Era.current.totalYears, 62000);
  assert.equal(h.writes.length, 1);
  assert.equal(h.playerWrites(), 0);
  assert.equal(e.isMaster, false);
  assert.match(h.messages[0], /轮回大道.*已推进 1000 年/);
  assert.deepEqual(h.store.OtherCustom, { keep: true });
});
test('0%、1%、100%均属于岁月大圆满阶段，非主人均可用', async () => {
  for (const progress of [0, 1, 100]) {
    const h = harness({ player: complete(progress) });
    await h.app.advanceEra2(h.event());
    assert.equal(h.writes.length, 1);
  }
});
test('岁月后期100%以内未到大圆满的角色被拒绝且不写世界', async () => {
  const h = harness({ player: { 轮回大道: { 境界: '岁月境后期', 岁月境: { 阶段: 2, 进度: 99 } } } });
  await h.app.advanceEra2(h.event());
  assert.equal(h.writes.length, 0);
  assert.match(h.messages[0], /需达到岁月境大圆满/);
});
test('主人身份不替代玩家境界要求', async () => {
  const h = harness({ player: { 轮回大道: { 境界: '生死境初期' } } });
  await h.app.advanceEra2(h.event('#推进时代 1000', { isMaster: true }));
  assert.equal(h.writes.length, 0);
});
test('独立服务也重新校验角色境界，直接调用不能跳过门槛', async () => {
  const h = harness({ player: {} });
  await h.manager().advanceReincarnationEra({ playerId: 'p', years: 1, reply: h.event().reply });
  assert.equal(h.writes.length, 0);
});
test('无角色、封锁角色与非法年数均不产生世界变化', async () => {
  for (const msg of ['#推进时代 0', '#推进时代 -1', '#推进时代 10001', '#推进时代 1.5', '#推进时代 999999999999999999']) {
    const h = harness();
    await h.app.advanceEra2(h.event(msg));
    assert.equal(h.writes.length, 0);
  }
  const missing = harness(); missing.players.clear();
  await missing.app.advanceEra2(missing.event()); assert.equal(missing.writes.length, 0);
  const blocked = harness({ guarded: false });
  await blocked.app.advanceEra2(blocked.event()); assert.equal(blocked.reads(), 0);
});
test('角色ID使用已有映射，服务不接受路径型ID', async () => {
  const h = harness();
  await h.app.advanceEra2(h.event('#推进时代 1000', { user_id: 'official-fixture' }));
  assert.equal(h.writes.length, 1);
  await h.manager().advanceReincarnationEra({ playerId: '../someone', years: 1, reply: h.event().reply });
  assert.equal(h.writes.length, 1);
});
test('设置时代、下一千年、下个时代三个管理员入口仍拒绝普通玩家', async () => {
  for (const method of ['setEraProgress', 'advanceOneThousandYears', 'advanceToNextEra']) {
    const h = harness();
    await h.manager()[method](h.event('#设置时代 0 0 1'));
    assert.equal(h.writes.length, 0);
    assert.match(h.messages[0], /没有权限/);
  }
});
test('管理员设置时代仍可使用，配置级修仙管理员兼容', async () => {
  for (const mode of ['owner', 'config-admin']) {
    const h = harness({ master: mode === 'config-admin' ? ['p'] : [] });
    await h.manager().setEraProgress(h.event('#设置时代 2 5000 3', { isMaster: mode === 'owner' }));
    assert.equal(h.writes.length, 1);
    assert.equal(h.store.Era.current.index, 2);
    assert.equal(h.store.Era.current.years, 5000);
    assert.match(h.messages[0], /时代设置成功/);
  }
});
test('掌控生死仍限制主人，面板只修正时代推进的玩家资格描述', async () => {
  const h = harness();
  assert.equal(h.app.rule.find(r => r.fnc === 'controlLifeDeath').permission, 'master');
  await h.app.viewReincarnationWay(h.event('#轮回大道'));
  assert.match(h.messages[0], /已解锁时代推进：你可用/);
  assert.match(h.messages[0], /无需进度100%/);
  assert.match(h.messages[0], /已解锁掌控生死：主人可用/);
});
test('世界时代总开关关闭时玩家技能不写入', async () => {
  const h = harness({ enabled: false });
  await h.app.advanceEra2(h.event());
  assert.equal(h.writes.length, 0);
  assert.match(h.messages[0], /世界时代功能已关闭/);
});
test('跨时代和跨纪元维护累计年数并调用已有寿元过渡', async () => {
  const enter = harness({ current: { index: 3, years: 9500, epoch: 1, totalYears: 39500 } });
  await enter.app.advanceEra2(enter.event());
  assert.equal(enter.store.Era.current.index, 4);
  assert.equal(enter.store.Era.current.years, 500);
  assert.deepEqual(enter.transitions, ['enter-jueling']);
  const leave = harness({ current: { index: 4, years: 9500, epoch: 1, totalYears: 49500 } });
  await leave.app.advanceEra2(leave.event());
  assert.equal(leave.store.Era.current.index, 0);
  assert.equal(leave.store.Era.current.epoch, 2);
  assert.equal(leave.store.Era.current.totalYears, 50500);
  assert.deepEqual(leave.transitions, ['leave-jueling']);
});
test('两个并发玩家推进按最新世界时间顺序叠加，不覆盖其中一次', async () => {
  const h = harness();
  h.players.set('q', complete(1));
  await Promise.all([h.app.advanceEra2(h.event()), h.app.advanceEra2(h.event('#推进时代 1000', { user_id: 'q' }))]);
  assert.equal(h.writes.length, 2);
  assert.deepEqual(h.writes.map(w => w.years), [2000, 3000]);
  assert.equal(h.store.Era.current.totalYears, 63000);
});
test('玩家技能与管理员设置共用队列，等待后使用最新状态', async () => {
  const h = harness();
  let release, entered;
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  const m = h.manager();
  const apply = m.applyEraProgress.bind(m);
  m.applyEraProgress = async (...args) => { entered(); await new Promise(resolve => { release = resolve; }); return apply(...args); };
  const administrative = m.setEraProgress(h.event('#设置时代 2 3000 2', { isMaster: true }));
  await enteredPromise;
  const player = h.app.advanceEra2(h.event());
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(h.writes.length, 0);
  release();
  await Promise.all([administrative, player]);
  assert.deepEqual(h.writes.map(w => [w.index, w.years]), [[2, 3000], [2, 4000]]);
});
test('后台推进包装器与玩家技能共用队列', async () => {
  const h = harness();
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const m = h.manager();
  m.advanceEraLocked = async () => {
    started(); await new Promise(resolve => { release = resolve; });
    // Substitute only game-wide random side effects of the scheduled tick.
    m.loadEraConfig(); m.persistEraCurrent(m.set.Era, { ...m.set.Era.current, years: 4000, totalYears: 64000 });
  };
  const tick = m.advanceEra();
  await ready;
  const skill = h.app.advanceEra2(h.event());
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(h.writes.length, 0);
  release(); await Promise.all([tick, skill]);
  assert.deepEqual(h.writes.map(w => w.years), [4000, 5000]);
});
test('排队中角色境界改变会在服务内复核，而不是凭旧快照放行', async () => {
  const h = harness();
  let release;
  const held = locks.withPlayerMutationLock('zhutian:world:era-progress', () => new Promise(resolve => { release = resolve; }));
  await Promise.resolve(); await Promise.resolve();
  const skill = h.app.advanceEra2(h.event());
  await new Promise(resolve => setTimeout(resolve, 5));
  h.players.set('p', {});
  release(); await Promise.all([held, skill]);
  assert.equal(h.writes.length, 0);
  assert.match(h.messages[0], /需达到岁月境大圆满/);
});
test('世界配置写入失败不发送成功回复，锁释放后后续请求可继续', async () => {
  const failed = harness({ saveFails: true });
  await assert.rejects(failed.app.advanceEra2(failed.event()), /fake disk full/);
  assert.equal(failed.writes.length, 0);
  assert.equal(failed.messages.length, 0);
  const next = harness(); await next.app.advanceEra2(next.event());
  assert.equal(next.writes.length, 1);
});
test('进度结构冲突时不倒退累计年数', async () => {
  const h = harness({ current: { index: 1, years: 1000, epoch: 2, totalYears: 999000 } });
  await h.app.advanceEra2(h.event());
  assert.equal(h.writes.length, 0);
  assert.match(h.messages[0], /不一致/);
});
test('没有伪造e.isMaster或复用主人设置时代入口', () => {
  const text = fs.readFileSync(path.join(patch, 'apps/User/daofa.js'), 'utf8');
  const body = text.slice(text.indexOf('    async advanceEra2(e)'), text.indexOf('async  createOwnWay(e)'));
  assert.doesNotMatch(body, /isMaster\s*[:=]\s*true|setEraProgress\(/);
  assert.match(body, /advanceReincarnationEra\(/);
});
test('部署前版本精确复现：同样大圆满1%非主人被权限拦住', { skip: !process.env.REINCARNATION_ACCESS_BEFORE_DAOFA }, async () => {
  const h = harness({ player: complete(1), sourcePath: process.env.REINCARNATION_ACCESS_BEFORE_DAOFA });
  assert.equal(h.app.rule.find(r => r.fnc === 'advanceEra2').permission, 'master');
  await h.app.advanceEra2(h.event());
  assert.equal(h.writes.length, 0);
  assert.match(h.messages[0], /仅限机器人主人/);
});
