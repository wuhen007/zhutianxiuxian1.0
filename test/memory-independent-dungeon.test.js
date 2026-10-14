import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createMemoryRoot, recordMemoryDungeon } from '../model/memoryPath.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import { hasRealmAuthority } from '../model/realmAuthority.js';
import { isTimeRiverLocation, PLACE_LOCATION_MAP } from '../model/weimianTravel.js';
import * as fashan from '../model/fashanProxy.js';
import { TIME_RIVER_PHASE_DURATION_MS } from '../model/timeRiverAdversary.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const copy = value => structuredClone(value);
const memoryPlayer = id => ({ id, 名号: id, 灵根: createMemoryRoot(1), 记忆命途: {}, 模拟值: 0,
  mijinglevel_id: 20, power_place: PLACE_LOCATION_MAP.时间长河,
  法身: 1, 法身状态: '空闲中', 法身位置: PLACE_LOCATION_MAP.时间长河, 心神: 100, 无尽劫境最高层: 10 });
const event = id => ({ user_id: id, isGroup: true, group_id: 'fixture-group', reply: async message => message });

function method(file, name, next, dependencies) {
  const source = read(file);
  const start = source.indexOf(`  async ${name}(`);
  const end = source.indexOf(`  async ${next}(`, start);
  assert.ok(start >= 0 && end > start);
  return new Function(...Object.keys(dependencies), `return ({${source.slice(start, end)}}).${name};`)(...Object.values(dependencies));
}

function riverFixture() {
  const players = new Map(['owner', 'other'].map(id => [id, memoryPlayer(id)]));
  const values = new Map();
  const dependencies = {
    ...fashan, hasRealmAuthority, isTimeRiverLocation, PLACE_LOCATION_MAP, TIME_RIVER_PHASE_DURATION_MS,
    recordMemoryDungeon, withPlayerMutationLock,
    plugin: class { constructor(options) { Object.assign(this, options); } },
    verc: () => true, channel: async id => String(id), existplayer: async id => players.has(String(id)),
    Read_player: async id => copy(players.get(String(id))), Write_player: async (id, player) => players.set(String(id), copy(player)),
    Go: async e => !values.has(`xiuxian:player:${e.user_id}:action`),
    Add_renwu_progress: async () => {}, data: { filePathMap: { weimianList: '/fixtures/planes' } },
    getPlaneDestructionInfo: () => ({ destroyed: false }), buildPlaneDestroyedMessage: () => '',
    redis: {
      get: async key => values.get(key) ?? null,
      set: async (key, value) => { values.set(key, String(value)); return 'OK'; },
      del: async key => values.delete(key),
    },
  };
  const source = read('apps/SecretPlace/shijianchanghe.js').replace(/^import\s[\s\S]*?;\s*$/gm, '').replace(/^export /gm, '');
  const Constructor = new Function(...Object.keys(dependencies), `${source}; return shijianchanghe;`)(...Object.values(dependencies));
  const taskDependencies = {
    ...dependencies, ensureTimeRiverSkills() {}, hasRealmAuthority: () => true,
    buildTimeRiverTeamBenchmark: members => members[0],
    consumeBlackEmperorBattleFormation: () => ({}),
    awardDungeonGongfaProficiency: () => [], rollTimeRiverEraReward: () => 0,
    getTimeRiverVictoryReward: () => 0, getTimeRiverEnemyNames: name => [name],
    isDarkTriadEmperor: () => false,
    addCappedEraAccumulation: () => ({ gained: 0, cap: 100 }),
    zd_battle: async (_attacker, _enemy) => ({ winner: task.winner || 'A', A_hp: 10, B_hp: 0, msg: [] }),
  };
  const taskSource = read('apps/SecretPlace/shijianchangheTask.js').replace(/^import\s[\s\S]*?;\s*$/gm, '').replace(/^export /gm, '');
  const Task = new Function(...Object.keys(taskDependencies), `${taskSource}; return ShijianChangheTask;`)(...Object.values(taskDependencies));
  const task = new Task();
  task.buildPlayerCombatant = (player, id) => ({ ...player, id });
  task.buildStageEnemies = () => [{ 名号: '试炼对手' }];
  task.sendEncounterMessage = async () => {};
  task.generateStageEncounter = () => [];
  task.generateResultMessage = () => '';
  task.sendResultMessage = async () => {};
  task.notifyPlayer = async () => {};
  return { players, values, app: new Constructor(), task };
}

test('独立时间长河入场不计，单人和法身实际结算各+2，同趟重试不重复', async () => {
  const f = riverFixture();
  await f.app.roamTimeRiver(event('owner'));
  assert.equal(f.players.get('owner').模拟值, 0);
  await f.app.roamTimeRiver(event('owner'));
  assert.equal(f.players.get('owner').模拟值, 0);
  const bodyAction = f.values.get('xiuxian:player:owner:action');
  await f.app.roamFashanTimeRiver(event('owner'));
  assert.equal(f.players.get('owner').模拟值, 0);
  assert.equal(f.values.get('xiuxian:player:owner:action'), bodyAction);
  await f.app.roamFashanTimeRiver(event('owner'));
  assert.equal(f.players.get('owner').模拟值, 0);
  const body = JSON.parse(bodyAction);
  await f.task.handleTimeRiverCompletion('owner', body);
  await f.task.handleTimeRiverCompletion('owner', body);
  assert.equal(f.players.get('owner').模拟值, 2);
  const proxy = JSON.parse(f.values.get(fashan.getFashanActionKey('owner')));
  f.task.winner = 'B';
  await f.task.handleTimeRiverCompletion('owner', proxy);
  assert.equal(f.players.get('owner').模拟值, 4);
  assert.equal(f.players.get('owner').记忆命途.秘境记录.length, 2);
});

test('组队长河境界不足或仅入场无增量，真正战败结算每位玩家各+2', async () => {
  const f = riverFixture();
  const team = { id: '123456', leader: 'owner', members: ['owner', 'other'], status: 'recruiting' };
  await f.app.saveTimeRiverTeam(team);
  f.players.get('other').mijinglevel_id = 1;
  await f.app.startTeamTimeRiver(event('owner'));
  assert.equal(f.players.get('owner').模拟值, 0);
  assert.equal(f.players.get('other').模拟值, 0);
  f.players.get('other').mijinglevel_id = 20;
  await Promise.all([f.app.startTeamTimeRiver(event('owner')), f.app.startTeamTimeRiver(event('owner'))]);
  for (const id of ['owner', 'other']) {
    assert.equal(f.players.get(id).模拟值, 0);
    assert.ok(f.values.has(`xiuxian:player:${id}:action`));
  }
  f.task.winner = 'B';
  await f.task.handleTimeRiverCompletion('owner', JSON.parse(f.values.get('xiuxian:player:owner:action')));
  for (const id of ['owner', 'other']) {
    assert.equal(f.players.get(id).模拟值, 2);
    assert.equal(f.players.get(id).记忆命途.秘境记录.length, 1);
  }
});

test('连续帝战沿用最初会话令牌，行动被逃离清除后不结算', async () => {
  const f = riverFixture();
  await f.app.roamTimeRiver(event('owner'));
  const action = JSON.parse(f.values.get('xiuxian:player:owner:action'));
  await f.task.scheduleTimeRiverStage('owner', action, 'old_man');
  const next = JSON.parse(f.values.get('xiuxian:player:owner:action'));
  assert.equal(next.memoryDungeonToken, action.memoryDungeonToken);
  assert.equal(f.players.get('owner').模拟值, 0);
  f.values.delete('xiuxian:player:owner:action');
  await f.task.checkTimeRiverPlayer('owner', Date.now() + TIME_RIVER_PHASE_DURATION_MS);
  assert.equal(f.players.get('owner').模拟值, 0);
  f.values.set('xiuxian:player:owner:action', JSON.stringify({ ...next, escaped: true, end_time: 1 }));
  await f.task.checkTimeRiverPlayer('owner', Date.now());
  assert.equal(f.players.get('owner').模拟值, 0);
});

function endlessFixture() {
  const players = new Map(['owner', 'other'].map(id => [id, memoryPlayer(id)]));
  const f = { players, failRun: false, failPlayer: false, savedRun: null, charges: [] };
  const team = { id: '123', leader: 'owner', members: ['owner', 'other'], memberNames: { owner: 'owner', other: 'other' }, status: 'lobby' };
  const deps = {
    recordMemoryDungeon, data: { minggeList: [] }, existplayer: async id => players.has(id),
    Read_player: async id => copy(players.get(id)),
    Write_player: async (id, player) => { if (f.failPlayer) { f.failPlayer = false; throw new Error('write-failed'); } players.set(id, copy(player)); },
    normalizeEndlessDifficultyTier: () => 1, isWeekendNow: () => false, getWeekendFreeWeekKey: () => 'week',
    canEnterEndlessDifficulty: () => true, formatEndlessDifficulty: () => 'A1', exist_najie_thing: async () => 5,
    refreshSpiritHeart: () => ({ current: 100, max: 100 }), getSpiritHeartCost: () => 10, getMinggeEffects: () => ({}),
    consumeSpiritHeart: player => { player.心神 -= 10; return { ok: true, cost: 10 }; },
    createEndlessRun: () => ({ id: 'run-fixture', celestialPhenomenon: {}, lifeFire: 2, maxLifeFire: 2 }),
    getDailyEndlessCelestial: () => ({}), getWorldForLayer: () => ({ name: '测试世界', rule: '测试规则' }),
    getEndlessWebConfig: () => ({ enabled: false }), shouldAutoIssueEndlessWebTicket: () => false,
    Add_najie_thing: async (id, name, _kind, amount) => { f.charges.push({ id, name, amount }); }, ENDLESS_ENTRY_ITEM: '无尽秘钥', ENDLESS_SWEEP_ITEM: '扫荡券',
    ENDLESS_SPIRIT_HEART_COST: 10, ENDLESS_TOKEN: '劫境道痕', WEEKEND_FREE_FIELD: '周末免费', ENDLESS_TIER_MAX_LAYER: 10,
    calculateMinggeSourceGain: amount => amount,
    getSettlement: () => ({ cultivation: 0, lingshi: 0, members: {} }),
    recordEndlessDifficultyProgress: () => ({ firstClear: false }),
    ENDLESS_TREASURE_UNLOCK_LAYER: 25,
    getSpiritHeartMax: () => 100,
    getEndlessSweepReward: () => ({ startLayer: 1, endLayer: 10, layers: 10, cultivation: 1, blood: 1, lingshi: 1, sourceStone: 1, tokens: 1 }),
    redis: { del: async () => {} }, logger: { error() {} },
  };
  const app = {
    checkPlayer: async e => e.user_id, getPlayerTeam: async () => team, getTeam: async () => team,
    isTeamGroup: () => true, withLock: (_e, scope, action) => withPlayerMutationLock(`endless:${scope}`, action),
    saveRun: async run => { if (f.failRun) throw new Error('run-save-failed'); f.savedRun = copy(run); },
    saveTeam: async () => {}, runKey: () => 'run', formatAllChoices: () => [], formatStarPrompt: () => [], formatAmount: String,
    getServerMaxEndlessLayer: async () => 0, clearTeam: async () => {},
    writeCrossJson: async () => {}, crossRaidMemberKey: id => `fixture-cross:${id}`,
  };
  app.startRun = method('apps/EndlessRealm.js', 'startRun', 'issueEndlessWebLink', deps);
  app.sweepEndlessRealm = method('apps/EndlessRealm.js', 'sweepEndlessRealm', 'withdrawRun', deps);
  app.settleRun = method('apps/EndlessRealm.js', 'settleRun', 'finishSettlement', deps);
  app.consumeCrossEndlessEntry = method('apps/EndlessRealm.js', 'consumeCrossEndlessEntry', 'refundCrossEndlessEntry', deps);
  app.refundCrossEndlessEntry = method('apps/EndlessRealm.js', 'refundCrossEndlessEntry', 'publishCrossEndless', deps);
  return { ...f, app, team, state: f };
}

test('无尽开局不计，通关结算每人+2；一次付费扫荡只计一趟，写入失败不计', async () => {
  const f = endlessFixture();
  f.state.failRun = true;
  await f.app.startRun(event('owner'));
  assert.equal(f.players.get('owner').模拟值, 0);
  assert.equal(f.players.get('other').模拟值, 0);
  f.state.failRun = false;
  await f.app.startRun(event('owner'));
  await f.app.startRun(event('owner'));
  assert.equal(f.players.get('owner').模拟值, 0);
  assert.equal(f.players.get('other').模拟值, 0);
  await f.app.settleRun(f.team, f.state.savedRun, 1, 'clear');
  await f.app.settleRun(f.team, f.state.savedRun, 1, 'clear');
  assert.equal(f.players.get('owner').模拟值, 2);
  assert.equal(f.players.get('other').模拟值, 2);
  f.app.getPlayerTeam = async () => null;
  await f.app.sweepEndlessRealm(event('owner'));
  assert.equal(f.players.get('owner').模拟值, 4, '十层奖励不冒充十次入场');
  f.state.failPlayer = true;
  await f.app.sweepEndlessRealm(event('owner'));
  assert.equal(f.players.get('owner').模拟值, 4);
  await f.app.sweepEndlessRealm(event('owner'));
  assert.equal(f.players.get('owner').模拟值, 6);
});

test('无尽主动撤离不计，正常团灭计2%，失败重试保持一次', async () => {
  for (const reason of ['withdraw', 'defeat']) {
    const f = endlessFixture();
    await f.app.startRun(event('owner'));
    f.state.failPlayer = true;
    await f.app.settleRun(f.team, f.state.savedRun, .3, reason);
    assert.equal(f.players.get('owner').模拟值, 0);
    await f.app.settleRun(f.team, f.state.savedRun, .3, reason);
    await f.app.settleRun(f.team, f.state.savedRun, .3, reason);
    for (const player of f.players.values()) assert.equal(player.模拟值, reason === 'defeat' ? 2 : 0);
  }
});

test('限时裂界仅付费入场、缺凭证或同次重入均不增加模拟', async () => {
  let player = memoryPlayer('owner');
  let active = false;
  let tickets = 0;
  const deps = {
    recordMemoryDungeon, withPlayerMutationLock, PASS_NAME: '巡界玉符',
    readRiftState: () => ({}), findPlayerExpedition: () => active ? { rift: { expiresAt: Date.now() + 100000 } } : null,
    findPlayerRift: () => ({ id: 'rift-event', name: '测试裂界' }),
    exist_najie_thing: async () => tickets,
    beginRiftExpedition: () => ({ ok: true }),
    Add_najie_thing: async () => { tickets--; }, saveRiftState: () => { active = true; },
    Read_player: async () => copy(player), Write_player: async (_id, next) => { player = copy(next); },
  };
  const app = { getPlayer: async () => ({ qq: 'owner', player: copy(player) }), enterRift: method('apps/PlaneRiftFestival.js', 'enterRift', 'exploreHelp', deps) };
  await app.enterRift(event('owner'));
  assert.equal(player.模拟值, 0);
  tickets = 1;
  await app.enterRift(event('owner'));
  assert.equal(player.模拟值, 0);
  assert.equal(tickets, 0);
  await app.enterRift(event('owner'));
  assert.equal(player.模拟值, 0);
});

test('裂界三层通关或正常失败整趟+2，主动撤离/到期退出无增量', async () => {
  for (const status of ['cleared', 'failed', 'withdrew', 'expired']) {
    let player = memoryPlayer('owner');
    const expedition = { status, secured: 0 };
    const settle = method('apps/PlaneRiftFestival.js', 'settlePayout', 'exchange', {
      recordMemoryDungeon, calculateRiftPayout: () => ({ source: 0, cultivation: 0, blood: 0 }),
      Write_player: async (_id, next) => { player = copy(next); }, readRiftState: () => ({}), saveRiftState: () => {},
    });
    await settle('owner', player, { id: 'fixture-rift' }, expedition);
    await settle('owner', player, { id: 'fixture-rift' }, expedition);
    assert.equal(player.模拟值, ['cleared', 'failed'].includes(status) ? 2 : 0, status);
  }
});

test('仙古核心正常完成与战败送离各计2%，紧急撤离不计，同趟幂等', () => {
  const source = read('apps/SecretPlace/xianguPlace.js');
  const start = source.indexOf('function recordXianguMemoryCompletion(');
  const end = source.indexOf('\nasync function ejectXianguPlayerKilled(', start);
  const settle = new Function('recordMemoryDungeon', `${source.slice(start, end)}; return recordXianguMemoryCompletion;`)(recordMemoryDungeon);
  for (const exitMode of ['normal', 'forced', 'emergency']) {
    const player = memoryPlayer('owner');
    const summary = { exitMode, startedAt: 1000 };
    settle(player, 'owner', summary);
    settle(player, 'owner', summary);
    assert.equal(player.模拟值, exitMode === 'emergency' ? 0 : 2);
  }
});

test('仙古撤离收据与NPC战败送离的真实结算钩子写入模拟值，入场不再结算', async () => {
  const source = read('apps/SecretPlace/xianguPlace.js');
  const helperStart = source.indexOf('function recordXianguMemoryCompletion(');
  const ejectStart = source.indexOf('async function ejectXianguPlayerKilled(', helperStart);
  const ejectEnd = source.indexOf('\nasync function settleXianguDefeatChoice(', ejectStart);
  const applyStart = source.indexOf('async function applyXianguEvacuationSettlement(');
  const applyEnd = source.indexOf('\nfunction getXianguCooldownHours(', applyStart);
  const dependencies = {
    recordMemoryDungeon, cloneXianguSettlementData: copy,
    clearXianguBag() {}, readXianguNajie: async () => ({}),
    buildXianguRunSummary: player => ({ startedAt: player.xiangu_entry_time, lootUnits: 0 }),
    clearXianguSessionState: player => { player.in_xiangu = false; player.xiangu_entry_time = 0; },
    Write_player: async () => {}, clearXianguRedisSession: async () => {}, setXianguCooldown: async () => {},
  };
  const api = new Function(...Object.keys(dependencies), `${source.slice(helperStart, ejectEnd)}\n${source.slice(applyStart, applyEnd)}; return { applyXianguEvacuationSettlement, ejectXianguPlayerKilled };`)(...Object.values(dependencies));
  for (const exitMode of ['normal', 'emergency']) {
    const player = memoryPlayer('owner');
    await api.applyXianguEvacuationSettlement(player, 'owner', { payload: { summary: { exitMode, startedAt: 1000 } } });
    assert.equal(player.模拟值, exitMode === 'normal' ? 2 : 0);
  }
  const victim = { ...memoryPlayer('victim'), xiangu_entry_time: 1000 };
  await api.ejectXianguPlayerKilled(victim, 'victim', 'npc_slaughter');
  assert.equal(victim.模拟值, 2);
  assert.equal(victim.in_xiangu, false);
});

test('门径各阶不改变免费时间长河的四类资源和固定探索时长', async () => {
  for (const tier of [1, 2, 3]) {
    const f = riverFixture();
    Object.assign(f.players.get('owner'), { 修为: 111, 血气: 222, 灵石: 333, 寿元: 444 });
    f.players.get('owner').记忆命途.因子 = { 门径: tier };
    await f.app.roamTimeRiver(event('owner'));
    const player = f.players.get('owner');
    assert.deepEqual([player.修为, player.血气, player.灵石, player.寿元], [111, 222, 333, 444]);
    const action = JSON.parse(f.values.get('xiuxian:player:owner:action'));
    assert.equal(action.time, TIME_RIVER_PHASE_DURATION_MS);
  }
});

test('门径不折扣无尽门票、扫荡券或心神，跨服退款按原扣费幂等退还', async () => {
  const f = endlessFixture();
  for (const player of f.players.values()) player.记忆命途.因子 = { 门径: 3 };
  await f.app.startRun(event('owner'));
  assert.equal(f.players.get('owner').心神, 90);
  assert.equal(f.players.get('other').心神, 90);
  assert.deepEqual(f.state.charges.map(({ name, amount }) => [name, amount]), [['无尽秘钥', -1], ['无尽秘钥', -1]]);
  f.app.getPlayerTeam = async () => null;
  await f.app.sweepEndlessRealm(event('owner'));
  assert.equal(f.players.get('owner').心神, 80);
  assert.deepEqual(f.state.charges.slice(-2).map(({ name, amount }) => [name, amount]), [['无尽秘钥', -1], ['扫荡券', -1]]);

  const cross = endlessFixture();
  cross.players.get('owner').记忆命途.因子 = { 门径: 3 };
  const entered = await cross.app.consumeCrossEndlessEntry('owner');
  assert.equal(entered.charge.heartCost, 10);
  assert.equal(cross.players.get('owner').心神, 90);
  const ledger = { userId: 'owner', charge: entered.charge };
  await cross.app.refundCrossEndlessEntry(ledger);
  await cross.app.refundCrossEndlessEntry(ledger);
  assert.equal(cross.players.get('owner').心神, 100);
  assert.deepEqual(cross.state.charges.map(({ name, amount }) => [name, amount]), [['无尽秘钥', -1], ['无尽秘钥', 1]]);
});
