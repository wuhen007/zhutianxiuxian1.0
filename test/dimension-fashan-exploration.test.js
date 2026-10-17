import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import * as planes from '../model/planeDestruction.js';
import * as locations from '../model/weimianTravel.js';
import * as fashan from '../model/fashanProxy.js';
import * as realms from '../model/realmAuthority.js';
import * as river from '../model/timeRiverAdversary.js';
import { DIMENSION_CALAMITY_TARGETS } from '../model/dimensionGuard.js';
import { addCappedEraAccumulation } from '../model/selfDaoDeduction.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import { applySecretPlaceNotificationContext } from '../model/secretPlaceNotification.js';
import { consumeBlackEmperorBattleFormation } from '../model/blackEmperor.js';
import { awardDungeonGongfaProficiency } from '../model/gongfaProficiency.js';
import { getSuiyunDungeonEntryPlace, hasSuiyunFreeDungeonEntry } from '../model/suiyun.js';
import { getMemoryEffects, getMemoryStage, recordMemoryDungeon } from '../model/memoryPath.js';

const source = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const copy = value => JSON.parse(JSON.stringify(value));
const bodyKey = 'xiuxian:player:42:action';
const proxyKey = fashan.getFashanActionKey('42');
const activeKey = 'xiuxian:time_river:active_players:fashan';

function between(text, start, end) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `production section: ${start}`);
  return text.slice(from, to);
}

// Execute production methods; only bot I/O is replaced, never real player saves.
function loadClass(file, name, bindings) {
  const code = source(file).replace(/^import\s[\s\S]*?;\s*$/gm, '').replace(/^export /gm, '');
  return vm.runInNewContext(`${code}\n${name}`, bindings, { filename: file });
}

function fixture(t, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dimension-fashan-'));
  const planeFile = path.join(dir, 'planes.json');
  fs.writeFileSync(planeFile, JSON.stringify(Object.fromEntries(locations.PLACE_LOCATION_NAMES.map(name => [name, 1]))));
  t.after(() => { fs.unlinkSync(planeFile); fs.rmdirSync(dir); });
  const players = new Map([['42', {
    名号: '测试仙帝', 法身: 1, 法身位置: locations.PLACE_LOCATION_MAP.时间长河,
    法身状态: '空闲中', 法身行动: '无行动', 法身当前血量: 800,
    power_place: locations.PLACE_LOCATION_MAP.永恒未知之地,
    当前血量: 123, 血量上限: 1000, 攻击: 100, 防御: 50,
    mijinglevel_id: 21, 纪元积累: 10, 学习的功法: [],
    修为: 2e12, 血气: 2e12, 寿元: 1e8, 灵石: 1e10,
    破王成帝: 2, 界海历练次数: 0, ...overrides,
  }]]);
  const values = new Map([[bodyKey, JSON.stringify({ action: '永恒镇守', end_time: Date.now() + 1e9 })]]);
  const messages = [];
  const costs = [];
  const redis = {
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, String(value)); },
    async del(...keys) { for (const key of keys) values.delete(key); },
    async expire() {},
  };
  const data = {
    filePathMap: { weimianList: planeFile },
    jiehai_list: JSON.parse(source('resources/data/item/副本/界海列表.json')),
  };
  const bindings = {
    ...planes, ...locations, ...fashan, ...realms, ...river,
    DIMENSION_CALAMITY_TARGETS, addCappedEraAccumulation,
    withPlayerMutationLock, applySecretPlaceNotificationContext,
    getSuiyunDungeonEntryPlace, hasSuiyunFreeDungeonEntry,
    getMemoryEffects, getMemoryStage, recordMemoryDungeon,
    structuredClone, Date, Math, console, redis, data,
    plugin: class { constructor(options) { Object.assign(this, options); } },
    verc: () => true,
    channel: async id => String(id),
    existplayer: async id => players.has(String(id)),
    Read_player: async id => copy(players.get(String(id))),
    Write_player: async (id, player) => players.set(String(id), copy(player)),
    Add_najie_thing: async (...args) => costs.push(args),
    exist_najie_thing: async () => 0,
    Add_renwu_progress: async () => {},
    Go: () => { throw new Error('法身入口不应检查/占用真身动作'); },
    bigNumberTransform: String,
    SHANGCANG_PLANE_ID: locations.PLACE_LOCATION_MAP.上苍之上,
    getDungeonGongfaReduction: () => ({ rate: 0 }),
    isDaofaActive: () => false,
    getMinggeEffects: () => ({}),
    getMinggeSecretPlaceReductionMs: () => 0,
    ensureTimeRiverSkills: () => {},
  };
  const e = {
    user_id: '42', isGroup: true, group_id: '100', message: [],
    reply: async message => { messages.push(message); return true; },
  };
  return { dir, planeFile, players, values, messages, costs, redis, bindings, e };
}

function yingzhaoHarness(h, total = 0) {
  const text = source('apps/User/zhengdaotixi.js');
  const repairText = between(source('apps/Boss/WeimianDestruction.js'),
    'export async function repairAllDestroyedPlanes', '/**\n * 修复单个').replace('export ', '');
  const destroyedPlanes = new Set([1]);
  const protectedPlanes = new Set([2]);
  const repair = vm.runInNewContext(`
    let nextDestructionWorldYear = 123;
    ${repairText}
    ({ repairAllDestroyedPlanes, next: () => nextDestructionWorldYear });
  `, {
    ...h.bindings, destroyedPlanes, protectedPlanes,
    currentWorldYear: () => 100, destructionWorldYearInterval: () => 2000,
    DESTRUCTION_REDIS_KEYS: { destroyed: 'destroyed', protected: 'protected',
      rescueUsed: 'rescueUsed', currentTargets: 'targets', nextWorldYear: 'next', lastRepairWorldYear: 'last' },
    logger: { info() {} },
  });
  const bindings = {
    ...h.bindings,
    repairAllDestroyedPlanes: repair.repairAllDestroyedPlanes,
    repairSinglePlane: async id => planes.repairPlane(h.planeFile, locations.getLocationName(id)),
    reviveAllFromYongJi: async () => ({ total, byPlane: total ? [{ planeName: '凡间', count: total }] : [] }),
  };
  const methods = between(text, 'async handlePlaneYingzhao', '/** 检查映照CD');
  const dispatch = between(text, 'async yingzhao(e)', '    // 检查是否有艾特信息') + '\nreturn false;\n}';
  const api = vm.runInNewContext(`new (class { ${methods}\n${dispatch} })()`, bindings);
  api._checkYingZhaoCD = async () => false;
  api._broadcastYingZhaoSimple = async () => {};
  return { api, repair, protectedPlanes, destroyedPlanes };
}

test('维度灾厄毁界且无永寂者：映照诸天修复全部目标，保留分层消耗/CD', async t => {
  for (const [level, cost, hours, minutes] of [[21, 1e12, 24, 360], [22, 5e11, 12, 180], [23, 0, 0, 0]]) {
    const h = fixture(t, { mijinglevel_id: level });
    planes.markPlanesDestroyed(h.planeFile, DIMENSION_CALAMITY_TARGETS);
    const { api } = yingzhaoHarness(h);
    await api.yingzhao({ ...h.e, msg: '#映照诸天' });
    for (const name of DIMENSION_CALAMITY_TARGETS) {
      assert.equal(planes.getPlaneDestructionInfo(h.planeFile, name).destroyed, false, name);
    }
    assert.equal(JSON.parse(fs.readFileSync(h.planeFile)).位面毁灭记录, undefined);
    const player = h.players.get('42');
    assert.equal(player.修为, 2e12 - cost);
    assert.equal(player.血气, 2e12 - cost);
    const cd = h.values.get('xiuxian:player:42:yingzhao_cd');
    assert.equal(Boolean(cd), hours > 0);
    if (hours) {
      assert.equal(JSON.parse(cd).endTime - player.不念不想.startTime, hours * 3600000);
      assert.equal(player.不念不想.endTime - player.不念不想.startTime, minutes * 60000);
    }
    assert.ok(h.messages.join('\n').includes(`【位面修复】${DIMENSION_CALAMITY_TARGETS.length}处`));
    assert.match(h.messages.join('\n'), /上苍之上/);
  }
});

test('映照虚发退款，不设CD、不重置大祭计时或清保护；原复活流程仍生效', async t => {
  const h = fixture(t);
  const { api, repair, protectedPlanes } = yingzhaoHarness(h);
  await api.yingzhao({ ...h.e, msg: '#映照诸天' });
  assert.equal(h.players.get('42').修为, 2e12);
  assert.equal(h.values.has('xiuxian:player:42:yingzhao_cd'), false);
  assert.equal(repair.next(), 123);
  assert.equal(protectedPlanes.has(2), true);
  assert.match(h.messages.join('\n'), /资源已归还/);
  const revival = yingzhaoHarness(h, 2);
  await revival.api.yingzhao({ ...h.e, msg: '#映照诸天' });
  assert.equal(h.players.get('42').修为, 1e12);
  assert.equal(revival.repair.next(), 2100);
});

test('单界映照入口支持灾厄新增目标上苍之上', async t => {
  const h = fixture(t);
  planes.markPlanesDestroyed(h.planeFile, ['上苍之上', '小阴间']);
  await yingzhaoHarness(h).api.yingzhao({ ...h.e, msg: '#映照上苍之上' });
  assert.equal(planes.getPlaneDestructionInfo(h.planeFile, '上苍之上').destroyed, false);
  assert.equal(planes.getPlaneDestructionInfo(h.planeFile, '小阴间').destroyed, true);
  assert.equal(h.players.get('42').修为, 1.9e12);
});

function dungeon(h) {
  const Entry = loadClass('apps/SecretPlace/SecretPlaceplus.js', 'SecretPlaceplus', h.bindings);
  return new Entry();
}

test('法身穿梭两种新玩法所在位面时提示正确单次指令', async t => {
  const h = fixture(t);
  const entry = dungeon(h);
  for (const [place, command] of [['界海', '#法身探索界海'], ['时间长河', '#法身遨游时间长河']]) {
    await entry.fashanTravel({ ...h.e, msg: `#法身穿梭 ${place}` });
    assert.equal(h.players.get('42').法身位置, locations.PLACE_LOCATION_MAP[place]);
    assert.ok(h.messages.at(-1).includes(command));
    assert.equal(h.players.get('42').power_place, locations.PLACE_LOCATION_MAP.永恒未知之地);
  }
});

test('法身单次界海：两地点正确扣费和计数，独立任务不影响真身', async t => {
  for (const name of ['接引古殿', '终极古地']) {
    const h = fixture(t, { 法身位置: locations.PLACE_LOCATION_MAP.界海 });
    const before = copy(h.players.get('42'));
    const originalAction = h.values.get(bodyKey);
    const entry = dungeon(h);
    await entry.fashanExplore({ ...h.e, msg: `#法身探索界海 ${name}` });
    const action = JSON.parse(h.values.get(proxyKey));
    const history = JSON.parse(h.values.get(fashan.getFashanHistoryKey('42')));
    assert.equal(action.total_count, 1);
    assert.equal(history.total_count, 1);
    assert.equal(action.total_time, 30);
    assert.equal(action.Place_actionplus, '0');
    assert.equal(action.actorPlane, locations.PLACE_LOCATION_MAP.界海);
    const after = h.players.get('42');
    assert.equal(after.灵石, before.灵石 - h.bindings.data.jiehai_list.find(p => p.name === name).Price);
    for (const field of ['当前血量', 'power_place', '修为', '血气', '寿元']) assert.equal(after[field], before[field], field);
    assert.equal(after.界海历练次数, 1);
    assert.equal(after.破王成帝, 1);
    assert.equal(h.costs.length, 0, '单次探索不扣沉迷钥匙');
    assert.equal(h.values.get(bodyKey), originalAction);
    await entry.fashanExplore({ ...h.e, msg: `#法身探索界海 ${name}` });
    assert.equal(h.players.get('42').灵石, after.灵石, '重复出发不重复扣费');
  }
});

test('法身界海入口校验境界、位置、恢复、毁界、忙碌与沉迷限制', async t => {
  for (const options of [
    { player: { mijinglevel_id: 17 } },
    { player: { mijinglevel_id: 20 }, name: '终极古地' },
    { player: { 法身位置: locations.PLACE_LOCATION_MAP.仙界 } },
    { player: { 法身恢复时间: Date.now() + 1e6 } },
    { destroyed: true },
    { pending: true },
    { message: '#法身探索界海 接引古殿*2' },
    { message: '#法身沉迷界海 接引古殿*2', fn: 'fashanAddiction' },
    { message: '#法身沉迷时间长河', fn: 'fashanSingleExploreOnly' },
  ]) {
    const h = fixture(t, { 法身位置: locations.PLACE_LOCATION_MAP.界海, ...options.player });
    if (options.destroyed) planes.markPlaneDestroyed(h.planeFile, '界海');
    if (options.pending) await h.redis.set(proxyKey, JSON.stringify({ time_river: '0', end_time: 1 }));
    const before = h.values.get(proxyKey);
    const player = copy(h.players.get('42'));
    await dungeon(h)[options.fn || 'fashanExplore']({
      ...h.e, msg: options.message || `#法身探索界海 ${options.name || '接引古殿'}`,
    });
    assert.equal(h.values.get(proxyKey), before);
    assert.deepEqual(h.players.get('42'), player);
    assert.ok(h.messages.length);
  }
});

function timeRiver(h, battle = {}) {
  let battles = 0;
  const bindings = {
    ...h.bindings,
    consumeBlackEmperorBattleFormation,
    awardDungeonGongfaProficiency,
    zd_battle: async combatant => {
      battles++;
      if (battle.onBattle) battle.onBattle(combatant);
      return { winner: battle.winner || 'A', A_hp: battle.hp ?? 600, msg: [] };
    },
    rollTimeRiverEraReward: () => 5,
    rollDarkTriadContinuation: () => ({ summoned: false }),
  };
  const Entry = loadClass('apps/SecretPlace/shijianchanghe.js', 'shijianchanghe', bindings);
  const Task = loadClass('apps/SecretPlace/shijianchangheTask.js', 'ShijianChangheTask', bindings);
  const entry = new Entry();
  const task = new Task();
  task.buildStageEnemies = () => [{ 名号: battle.enemy || '未来准仙帝', 当前血量: 1000, 血量上限: 1000 }];
  task.generateStageEncounter = () => [];
  task.sendEncounterMessage = async () => {};
  task.generateResultMessage = (_, __, result) => JSON.stringify(result);
  task.sendResultMessage = async (_, __, text) => {
    h.messages.push(text);
    if (battle.messageError) throw new Error('模拟战报发送失败');
  };
  task.notifyPlayer = async (_, __, text) => h.messages.push(text);
  return { entry, task, battles: () => battles };
}

test('法身长河独立入口、活动索引、到期占用和真身镇守共存', async t => {
  const h = fixture(t);
  const { entry } = timeRiver(h);
  const original = h.values.get(bodyKey);
  await entry.roamFashanTimeRiver(h.e);
  const action = JSON.parse(h.values.get(proxyKey));
  assert.equal(action.isFashan, true);
  assert.equal(action.end_time - action.start_time, river.TIME_RIVER_PHASE_DURATION_MS);
  assert.equal(action.time_river, '0');
  assert.equal(action.Place_actionplus, '1');
  assert.equal(action.actorPlane, locations.PLACE_LOCATION_MAP.时间长河);
  assert.deepEqual(JSON.parse(h.values.get(activeKey)), ['42']);
  assert.equal(h.values.has('xiuxian:time_river:active_players'), false);
  assert.equal(h.values.get(bodyKey), original);
  action.end_time = 1;
  await h.redis.set(proxyKey, JSON.stringify(action));
  await entry.roamFashanTimeRiver(h.e);
  assert.equal(JSON.parse(h.values.get(proxyKey)).end_time, 1, '到期未结算的法身保持忙碌');
  assert.match(h.messages.at(-1), /等待结算/);
});

test('法身长河结算只写法身血量与奖励；保留期间更新的真身字段，重复tick不重发', async t => {
  const h = fixture(t);
  const original = h.values.get(bodyKey);
  const { entry, task, battles } = timeRiver(h, {
    messageError: true,
    onBattle: () => {
      const player = h.players.get('42');
      player.当前血量 = 321;
      player.灵石 += 77;
      player.镇守轮数 = 10;
      player.纪元积累 += 2;
    },
  });
  await entry.roamFashanTimeRiver(h.e);
  const action = JSON.parse(h.values.get(proxyKey));
  action.end_time = 1;
  await h.redis.set(proxyKey, JSON.stringify(action));
  await task.checkTimeRiverActions();
  await task.checkTimeRiverActions();
  const player = h.players.get('42');
  assert.equal(player.当前血量, 321);
  assert.equal(player.灵石, 1e10 + 77);
  assert.equal(player.镇守轮数, 10);
  assert.equal(player.法身当前血量, 600);
  assert.equal(player.纪元积累, 17);
  assert.equal(player.法身状态, '空闲中');
  assert.equal(h.values.has(proxyKey), false);
  assert.deepEqual(JSON.parse(h.values.get(activeKey)), []);
  assert.equal(battles(), 1);
  assert.equal(h.values.get(bodyKey), original);
});

test('法身长河战败不牵连真身待援、炼化和过去身', async t => {
  for (const enemy of ['苍帝', '未来准仙帝', '叶天帝']) {
    const h = fixture(t);
    const original = h.values.get(bodyKey);
    const { entry, task } = timeRiver(h, { enemy, winner: 'B', hp: 0 });
    for (const fn of ['openRescueWindow', 'handleDarkSuppression', 'handlePastBodyExposed']) {
      task[fn] = async () => assert.fail(`法身败退不应调用 ${fn}`);
    }
    await entry.roamFashanTimeRiver(h.e);
    const action = JSON.parse(h.values.get(proxyKey));
    action.end_time = 1;
    await h.redis.set(proxyKey, JSON.stringify(action));
    await task.checkTimeRiverActions();
    assert.equal(h.players.get('42').当前血量, 123);
    assert.equal(h.players.get('42').法身当前血量, 0);
    assert.equal(h.players.get('42').法身状态, '空闲中');
    assert.equal(h.values.get(bodyKey), original);
    assert.match(h.messages.join('\n'), /fashanDefeated/);
  }
});

test('法身长河三帝续战只续独立任务，不转为真身任务', async t => {
  const h = fixture(t);
  const original = h.values.get(bodyKey);
  const { entry, task, battles } = timeRiver(h, { enemy: '苍帝' });
  await entry.roamFashanTimeRiver(h.e);
  const action = JSON.parse(h.values.get(proxyKey));
  action.end_time = 1;
  await h.redis.set(proxyKey, JSON.stringify(action));
  await task.checkTimeRiverActions();
  const next = JSON.parse(h.values.get(proxyKey));
  assert.equal(next.timeRiverStage, 'triad');
  assert.equal(next.taskId, action.taskId);
  assert.equal(next.isFashan, true);
  assert.equal(h.players.get('42').法身状态, '行动中');
  assert.equal(h.values.has('xiuxian:time_river:end_time:42'), false);
  assert.equal(h.values.get(bodyKey), original);
  await task.checkTimeRiverActions();
  assert.equal(battles(), 1, '续战等待下一阶段，不即时反复刷取奖励');
  await task.scheduleTimeRiverStage('42', next, 'old_man', { imperialPill: true, oldManReward: 30 });
  const oldMan = JSON.parse(h.values.get(proxyKey));
  assert.equal(oldMan.timeRiverStage, 'old_man');
  assert.equal(oldMan.isFashan, true);
  assert.equal(h.values.get(bodyKey), original);
});

test('法身长河低血量自动用丹，只恢复法身；功法与阵纹消耗正常保存', async t => {
  const h = fixture(t, {
    法身当前血量: 10, 学习的功法: ['行字秘'],
    自刻PVE阵纹: [{ 名称: '无始杀阵', 剩余次数: 2 }],
  });
  h.bindings.exist_najie_thing = async (_, name) => name === '起死回生丹' ? 1 : 0;
  const { entry, task } = timeRiver(h, {
    onBattle: combatant => assert.equal(combatant.当前血量, 1000),
  });
  await entry.roamFashanTimeRiver(h.e);
  const action = JSON.parse(h.values.get(proxyKey));
  action.end_time = 1;
  await h.redis.set(proxyKey, JSON.stringify(action));
  await task.checkTimeRiverActions();
  const player = h.players.get('42');
  assert.deepEqual(h.costs, [['42', '起死回生丹', '丹药', -1]]);
  assert.equal(player.当前血量, 123);
  assert.equal(player.法身当前血量, 600);
  assert.equal(player.自刻PVE阵纹[0].剩余次数, 1);
  assert.equal(player.功法熟练度.行字秘, 2);
});

test('真身长河原有结算仍更新真身血量并清理真身任务', async t => {
  const h = fixture(t, { power_place: locations.PLACE_LOCATION_MAP.时间长河 });
  const { task, battles } = timeRiver(h);
  await h.redis.set(bodyKey, JSON.stringify({ action: '遨游时间长河', time_river: '0', end_time: 1 }));
  await h.redis.set('xiuxian:time_river:active_players', JSON.stringify(['42']));
  await task.checkTimeRiverActions();
  assert.equal(battles(), 1);
  assert.equal(h.players.get('42').当前血量, 600);
  assert.equal(h.players.get('42').法身当前血量, 800);
  assert.equal(h.players.get('42').纪元积累, 15);
  assert.equal(h.values.has(bodyKey), false);
  assert.equal(h.values.has(proxyKey), false);
});

test('法身长河入口拦截低境界、位置错误、恢复和毁界', async t => {
  for (const options of [
    { player: { mijinglevel_id: 19 } },
    { player: { 法身位置: locations.PLACE_LOCATION_MAP.界海 } },
    { player: { 法身恢复时间: Date.now() + 1e6 } },
    { destroyed: true },
  ]) {
    const h = fixture(t, options.player);
    if (options.destroyed) planes.markPlaneDestroyed(h.planeFile, '时间长河');
    await timeRiver(h).entry.roamFashanTimeRiver(h.e);
    assert.equal(h.values.has(proxyKey), false);
    assert.equal(h.values.has(activeKey), false);
  }
});

test('法身离位、任务位置错误会取消结算；普通法身结算器不抢长河任务', async t => {
  for (const mismatch of ['player', 'action']) {
    const h = fixture(t);
    const { entry, task, battles } = timeRiver(h);
    await entry.roamFashanTimeRiver(h.e);
    const action = JSON.parse(h.values.get(proxyKey));
    action.end_time = 1;
    if (mismatch === 'player') h.players.get('42').法身位置 = locations.PLACE_LOCATION_MAP.界海;
    else action.actorPlane = locations.PLACE_LOCATION_MAP.界海;
    await h.redis.set(proxyKey, JSON.stringify(action));
    await task.checkTimeRiverActions();
    assert.equal(battles(), 0);
    assert.equal(h.values.has(proxyKey), false);
  }
  const h = fixture(t);
  await timeRiver(h).entry.roamFashanTimeRiver(h.e);
  const action = h.values.get(proxyKey);
  const method = between(source('apps/SecretPlace/SecretPlaceplusTask.js'),
    '  async settleFashanProxies', '\n}\n   async function checkGongfaInServer');
  const generic = vm.runInNewContext(`({ ${method} })`, {
    ...h.bindings,
    withSecretPlaceSettlementLock: async (_, fn) => fn(),
    isShangcangAction: () => false,
  });
  await generic.settleFashanProxies('42');
  assert.equal(h.values.get(proxyKey), action);
  assert.equal(h.players.get('42').法身状态, '行动中');
});
