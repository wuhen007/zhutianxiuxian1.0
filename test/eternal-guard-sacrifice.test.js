import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import * as guard from '../model/dimensionGuard.js';
import * as planes from '../model/planeDestruction.js';
import * as locations from '../model/weimianTravel.js';
import * as fashan from '../model/fashanProxy.js';
import * as dao from '../model/selfDaoDeduction.js';
import { getSacrificePromotionGate } from '../model/strangeSacrifice.js';
import { getSpiritHeartMax, refreshSpiritHeart } from '../model/spiritUniverse.js';
import { writeJsonAtomically } from '../utils/atomicJson.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import { runTaskOnce } from '../utils/taskGuard.js';

const source = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const copy = value => JSON.parse(JSON.stringify(value));
const bodyKey = 'xiuxian:player:42:action';
const proxyKey = fashan.getFashanActionKey('42');

function load(file, name, bindings) {
  const text = source(file).replace(/^import\s[\s\S]*?;\s*$/gm, '').replace(/^export /gm, '');
  const Constructor = vm.runInNewContext(`${text}\n${name}`, { ...bindings }, { filename: file });
  return new Constructor();
}

function emperor(overrides = {}) {
  return {
    名号: '测试仙帝', mijinglevel_id: 21,
    power_place: locations.PLACE_LOCATION_MAP.永恒未知之地,
    法身: 1, 法身位置: locations.PLACE_LOCATION_MAP.永恒未知之地,
    法身状态: '空闲中', 法身行动: '无行动',
    当前血量: 123, 法身当前血量: 700, 血量上限: 1000,
    纪元积累: 10, 心神: 500, 修仙状态: '空闲',
    自身之道阶段: 7, 修炼次数: 400,
    己道推演: { attempts: 20, completed: true, progressionVersion: 2, realms: ['一', '二', '三', '四', '五', '六'] },
    道心: 500, 道心值: 500, 道心上次恢复时间: Date.now(), 厄土仙帝击杀数: 10,
    ...overrides,
  };
}

function fixture(t, player = emperor()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eternal-guard-regression-'));
  const playerDir = path.join(dir, 'players');
  fs.mkdirSync(playerDir);
  const planeFile = path.join(dir, 'planes.json');
  const stateFile = path.join(dir, 'dimension_guard_state.json');
  fs.writeFileSync(planeFile, JSON.stringify({
    ...Object.fromEntries(locations.PLACE_LOCATION_NAMES.map(name => [name, 1])),
    厄土高原: 0,
  }));
  t.after(() => {
    for (const name of fs.readdirSync(playerDir)) fs.unlinkSync(path.join(playerDir, name));
    fs.rmdirSync(playerDir);
    fs.unlinkSync(planeFile);
    if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
    fs.rmdirSync(dir);
  });
  const players = new Map();
  const addPlayer = (id, record) => {
    players.set(String(id), copy(record));
    fs.writeFileSync(path.join(playerDir, `${id}.json`), '{}');
  };
  addPlayer('42', player);
  const values = new Map();
  const messages = [];
  const clock = { now: 1_000_000 };
  const faults = { nextWriteFor: null };
  class Clock extends Date { static now() { return clock.now; } }
  const redis = {
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, String(value)); return 'OK'; },
    async del(...keys) { keys.forEach(key => values.delete(key)); },
    async expire() {},
    async sMembers() { return []; },
  };
  const bindings = {
    ...guard, ...planes, ...locations, ...fashan, ...dao,
    fs, path, Date: Clock, Math, structuredClone, console, redis,
    writeJsonAtomically, withPlayerMutationLock, runTaskOnce,
    plugin: class { constructor(options) { Object.assign(this, options); } },
    __PATH: { data_path: dir, player_path: playerDir },
    data: { filePathMap: { weimianList: planeFile } },
    config: { getConfig: () => ({}) },
    verc: () => true, channel: async id => String(id),
    existplayer: async id => players.has(String(id)),
    Read_player: async id => copy(players.get(String(id))),
    Write_player: async (id, record) => {
      if (faults.nextWriteFor === String(id)) {
        faults.nextWriteFor = null;
        throw new Error('模拟落盘故障');
      }
      players.set(String(id), copy(record));
    },
    logger: { warn() {} },
    bigNumberTransform: String,
  };
  const app = load('apps/Boss/DimensionGuard.js', 'DimensionGuard', bindings);
  app.broadcast = async message => messages.push(message);
  const event = msg => ({
    msg, user_id: '42', isGroup: true, group_id: '100',
    reply: async message => { messages.push(message); return true; },
  });
  return { app, bindings, players, addPlayer, values, redis, messages, clock, faults, event, planeFile, stateFile };
}

test('结束真身镇守保持位置、保留法身行动，巡查不再接管；手动重新开始生效', async t => {
  const h = fixture(t);
  await h.app.tick();
  assert.equal(guard.isEternalGuardAction(JSON.parse(h.values.get(bodyKey))), true);
  const proxy = JSON.stringify({ isFashan: true, time_river: '0', end_time: 1 });
  await h.redis.set(proxyKey, proxy);
  await h.app.stopGuard(h.event('#结束镇守永恒未知之地'));
  assert.equal(h.values.has(bodyKey), false);
  assert.equal(h.values.get(proxyKey), proxy);
  assert.equal(h.players.get('42').power_place, locations.PLACE_LOCATION_MAP.永恒未知之地);
  assert.equal(h.players.get('42').永恒镇守已结束, true);
  h.clock.now += 60000;
  await h.app.tick();
  await h.app.showStatus(h.event('#永恒镇守状态'));
  assert.equal(h.values.has(bodyKey), false);
  await h.app.startGuard(h.event('#镇守永恒未知之地'));
  assert.equal(guard.isEternalGuardAction(JSON.parse(h.values.get(bodyKey))), true);
});

test('法身独立接管永恒镇守并可结束，不改真身探索、位置与血量', async t => {
  const h = fixture(t, emperor({ power_place: locations.PLACE_LOCATION_MAP.界海 }));
  const body = JSON.stringify({ action: '探索界海', end_time: h.clock.now + 1e8 });
  await h.redis.set(bodyKey, body);
  await h.app.startGuard(h.event('#法身镇守永恒未知之地'));
  const action = JSON.parse(h.values.get(proxyKey));
  assert.equal(action.isFashan, true);
  assert.equal(fashan.isFashanActionPending(action, action.end_time + 1), true);
  await h.app.tick();
  assert.equal(h.values.get(bodyKey), body);
  assert.equal(h.players.get('42').当前血量, 123);
  assert.equal(h.players.get('42').法身当前血量, 700);
  assert.equal(h.players.get('42').法身状态, '行动中');
  await h.app.stopGuard(h.event('#结束法身镇守永恒未知之地'));
  await h.app.tick();
  assert.equal(h.values.has(proxyKey), false);
  assert.equal(h.values.get(bodyKey), body);
  assert.equal(h.players.get('42').法身状态, '空闲中');
  assert.equal(h.players.get('42').法身位置, locations.PLACE_LOCATION_MAP.永恒未知之地);
});

test('法身开始镇守校验凝聚、境界、位置、恢复、忙碌和毁界', async t => {
  for (const options of [
    { player: { 法身: 0 } },
    { player: { mijinglevel_id: 20 } },
    { player: { 法身位置: locations.PLACE_LOCATION_MAP.界海 } },
    { player: { 法身恢复时间: 9e12 } },
    { active: { time_river: '0', end_time: 1, isFashan: true } },
    { active: { Place_actionplus: '0', end_time: 1, isFashan: true } },
    { destroyed: true },
  ]) {
    const h = fixture(t, emperor(options.player));
    if (options.active) await h.redis.set(proxyKey, JSON.stringify(options.active));
    if (options.destroyed) planes.markPlaneDestroyed(h.planeFile, '永恒未知之地');
    const before = h.values.get(proxyKey);
    await h.app.startGuard(h.event('#法身镇守永恒未知之地'));
    assert.equal(h.values.get(proxyKey), before);
    assert.notEqual(h.players.get('42').法身永恒镇守, true);
  }
});

test('结束镇守不删除真身或法身的其他任务', async t => {
  const h = fixture(t);
  const body = JSON.stringify({ action: '遨游时间长河' });
  const proxy = JSON.stringify({ action: '法身探索界海', isFashan: true, Place_actionplus: '0' });
  await h.redis.set(bodyKey, body);
  await h.redis.set(proxyKey, proxy);
  Object.assign(h.players.get('42'), { 法身状态: '行动中', 法身行动: '探索界海' });
  await h.app.stopGuard(h.event('#结束镇守永恒未知之地'));
  await h.app.stopGuard(h.event('#法身结束镇守永恒未知之地'));
  assert.equal(h.values.get(bodyKey), body);
  assert.equal(h.values.get(proxyKey), proxy);
  assert.equal(h.players.get('42').法身状态, '行动中');
});

test('法身单独镇守成功挡下灾厄，每轮奖励10纪元，重复巡查和多实例不重发', async t => {
  const h = fixture(t, emperor({ 永恒镇守已结束: true }));
  await h.app.startGuard(h.event('#法身镇守永恒未知之地'));
  await h.app.tick();
  h.clock.now += guard.ETERNAL_GUARD_INTERVAL_MS;
  const second = load('apps/Boss/DimensionGuard.js', 'DimensionGuard', h.bindings);
  second.broadcast = async () => {};
  await Promise.all([h.app.tick(), second.tick()]);
  await h.app.tick();
  assert.equal(h.players.get('42').纪元积累, 20);
  assert.equal(h.values.has(bodyKey), false);
  for (const name of guard.DIMENSION_CALAMITY_TARGETS) {
    assert.equal(planes.getPlaneDestructionInfo(h.planeFile, name).destroyed, false);
  }
  h.clock.now += guard.ETERNAL_GUARD_INTERVAL_MS;
  await h.app.tick();
  assert.equal(h.players.get('42').纪元积累, 30);
  const state = JSON.parse(fs.readFileSync(h.stateFile));
  assert.equal(state.defenseCount, 2);
  assert.equal(state.pendingGuardReward, undefined);
});

test('双身同时镇守按玩家只发一次，奖励遵循纪元容量', async t => {
  for (const [before, after] of [[10, 20], [998, 1000], [1000, 1000]]) {
    const h = fixture(t, emperor({ 纪元积累: before }));
    await h.app.startGuard(h.event('#法身镇守永恒未知之地'));
    await h.app.tick();
    h.clock.now += guard.ETERNAL_GUARD_INTERVAL_MS;
    await h.app.tick();
    assert.equal(h.players.get('42').纪元积累, after);
    assert.equal(h.players.get('42').法身当前血量, 700);
    assert.equal(h.players.get('42').当前血量, 123);
  }
});

test('全部结束镇守后灾厄正常失守，不再发奖', async t => {
  const h = fixture(t);
  await h.app.tick();
  await h.app.stopGuard(h.event('#结束镇守永恒未知之地'));
  h.clock.now += guard.ETERNAL_GUARD_INTERVAL_MS;
  await h.app.tick();
  assert.equal(h.players.get('42').纪元积累, 10);
  assert.equal(planes.getPlaneDestructionInfo(h.planeFile, '上苍之上').destroyed, true);
});

test('奖励部分落盘失败后可补发，已到账玩家不重复领取', async t => {
  const h = fixture(t);
  h.addPlayer('43', emperor({ 名号: '第二位仙帝' }));
  await h.app.tick();
  h.clock.now += guard.ETERNAL_GUARD_INTERVAL_MS;
  h.faults.nextWriteFor = '43';
  await assert.rejects(h.app.tick(), /模拟落盘故障/);
  assert.equal(h.players.get('42').纪元积累, 20);
  assert.equal(h.players.get('43').纪元积累, 10);
  assert.ok(JSON.parse(fs.readFileSync(h.stateFile)).pendingGuardReward);
  await h.app.tick();
  assert.equal(h.players.get('42').纪元积累, 20);
  assert.equal(h.players.get('43').纪元积累, 20);
  assert.equal(JSON.parse(fs.readFileSync(h.stateFile)).pendingGuardReward, undefined);
});

test('通用法身结算器跳过永恒镇守，不将法身状态错误清闲', async t => {
  const h = fixture(t, emperor({ 永恒镇守已结束: true }));
  await h.app.startGuard(h.event('#法身镇守永恒未知之地'));
  const text = source('apps/SecretPlace/SecretPlaceplusTask.js');
  const start = text.indexOf('  async settleFashanProxies');
  const end = text.indexOf('\n}\n   async function checkGongfaInServer', start);
  assert.ok(start > 0 && end > start);
  const api = vm.runInNewContext(`({ ${text.slice(start, end)} })`, {
    ...h.bindings, withSecretPlaceSettlementLock: async (_, fn) => fn(), isShangcangAction: () => false,
  });
  const before = h.values.get(proxyKey);
  await api.settleFashanProxies('42');
  assert.equal(h.values.get(proxyKey), before);
  assert.equal(h.players.get('42').法身状态, '行动中');
  assert.equal(guard.isGuardingEternal(h.players.get('42'), 'fashan'), true);
});

const fields = { era: '纪元积累', mind: '心神', spirit: '元神', potential: '仙道潜力', lifespan: '寿元', cultivation: '修为', blood: '血气' };
function provision(player, times = 1) {
  for (const [key, field] of Object.entries(fields)) player[field] = dao.SACRIFICE_DAO_COSTS[key] * times;
  return player;
}

test('三体系仙帝另计十次祭道推演；七类资粮均为准仙帝基础价十倍', () => {
  for (const route of [{ mijinglevel_id: 21 }, { mijinglevel_id: 1, xiangulevel_id: 22 }, { mijinglevel_id: 1, huafenlevel_id: 22 }]) {
    const player = emperor(route);
    assert.equal(dao.getSacrificeDaoAttempts(player), 0);
    assert.equal(getSacrificePromotionGate(player).ok, false, '旧二十层不抵扣仙帝新阶段');
    for (let attempt = 1; attempt <= 10; attempt++) {
      provision(player);
      const result = dao.consumeSelfDaoDeduction(player, attempt);
      assert.equal(result.ok, true);
      assert.equal(result.reason, 'sacrifice_deduced');
      assert.equal(result.attempt, attempt);
      for (const [key, field] of Object.entries(fields)) {
        assert.equal(result.costs[key], dao.SELF_DAO_COSTS[key] * 10, key);
        assert.equal(player[field], 0, field);
      }
      assert.equal(player.己道推演.attempts, 20);
      assert.equal(player.己道推演.battlePending, false);
      assert.equal(getSacrificePromotionGate(player).ok, attempt === 10);
    }
    provision(player);
    const before = copy(player);
    assert.equal(dao.consumeSelfDaoDeduction(player).reason, 'sacrifice_completed');
    assert.deepEqual(player, before, '第十一次不扣费、不重开尸骸帝战');
  }
});

test('仙帝推演资源不足逐项拦截；压制寿元按真实储备扣除', () => {
  for (const field of Object.values(fields)) {
    const player = provision(emperor());
    player[field] -= 1;
    const before = copy(player);
    const result = dao.consumeSelfDaoDeduction(player);
    assert.equal(result.reason, 'resources');
    assert.equal(dao.getSacrificeDaoAttempts(player), 0);
    for (const resource of Object.values(fields)) assert.equal(player[resource], before[resource]);
  }
  const player = provision(emperor({ 压制寿元: dao.SACRIFICE_DAO_COSTS.lifespan * 2 }));
  player.寿元 = 9999;
  assert.equal(dao.consumeSelfDaoDeduction(player).ok, true);
  assert.equal(player.压制寿元, dao.SACRIFICE_DAO_COSTS.lifespan);
  assert.equal(player.寿元, 9999);
});

test('仙帝心神容量覆盖500消耗，低境界原上限与问道仙宫翻倍保留', () => {
  assert.equal(getSpiritHeartMax({ yuanshenlevel_id: 99 }), 100);
  for (const route of [{ mijinglevel_id: 21 }, { xiangulevel_id: 22 }, { huafenlevel_id: 22 }]) {
    const player = { ...route, 心神: 500, 心神恢复时间: 1000 };
    assert.equal(getSpiritHeartMax(player), 500);
    assert.equal(refreshSpiritHeart(player, 1000).current, 500);
    assert.equal(getSpiritHeartMax({ ...player, 问道仙宫: true }), 1000);
  }
});

test('推演生产命令并发扣费保持准确，十次完成不会进入旧尸骸帝战', async t => {
  const h = fixture(t, provision(emperor(), 2));
  const app = load('apps/User/SelfDaoDeduction.js', 'SelfDaoDeduction', {
    ...h.bindings, zd_battle: async () => assert.fail('祭道前路不应进入准仙帝尸骸帝战'),
  });
  await Promise.all([app.deduceOwnDao(h.event('#推演己道')), app.deduceOwnDao(h.event('#推演己道'))]);
  assert.equal(dao.getSacrificeDaoAttempts(h.players.get('42')), 2);
  for (const field of Object.values(fields)) assert.equal(h.players.get('42')[field], 0);
  h.players.get('42').己道推演.sacrificeAttempts = 9;
  provision(h.players.get('42'));
  await app.deduceOwnDao(h.event('#推演己道'));
  assert.equal(dao.getSacrificeDaoAttempts(h.players.get('42')), 10);
  assert.match(h.messages.at(-1), /十次推演圆满/);
  assert.equal(h.values.has(bodyKey), false);
});

test('祭道指令和仙古、花粉普通突破都接入新门槛提示', () => {
  assert.match(source('apps/User/zhengdaotixi.js'), /promotionGate\.checks\.deduction/);
  assert.match(source('apps/User/FlowerPollenPath.js'), /targetLevelId === 23[\s\S]{0,150}#推演己道[\s\S]{0,50}#祭道/);
  assert.match(source('apps/User/xiangujinshi.js'), /targetXianguLevel === 23[\s\S]{0,150}#推演己道[\s\S]{0,50}#祭道/);
});
