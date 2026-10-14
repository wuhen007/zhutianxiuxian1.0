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
  return { players, values, app: new Constructor() };
}

test('独立时间长河单人和法身实际入场各+5，忙碌重入及后续阶段不重复计数', async () => {
  const f = riverFixture();
  await f.app.roamTimeRiver(event('owner'));
  assert.equal(f.players.get('owner').模拟值, 5);
  await f.app.roamTimeRiver(event('owner'));
  assert.equal(f.players.get('owner').模拟值, 5);
  const bodyAction = f.values.get('xiuxian:player:owner:action');
  await f.app.roamFashanTimeRiver(event('owner'));
  assert.equal(f.players.get('owner').模拟值, 10);
  assert.equal(f.values.get('xiuxian:player:owner:action'), bodyAction);
  await f.app.roamFashanTimeRiver(event('owner'));
  assert.equal(f.players.get('owner').模拟值, 10);
  assert.equal(f.players.get('owner').记忆命途.秘境记录.length, 2);
});

test('组队长河对本次真正入场的每位玩家分别+5，已开局或境界不足无增量', async () => {
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
    assert.equal(f.players.get(id).模拟值, 5);
    assert.equal(f.players.get(id).记忆命途.秘境记录.length, 1);
    assert.ok(f.values.has(`xiuxian:player:${id}:action`));
  }
});

function endlessFixture() {
  const players = new Map(['owner', 'other'].map(id => [id, memoryPlayer(id)]));
  const f = { players, failRun: false, failPlayer: false, savedRun: null };
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
    Add_najie_thing: async () => {}, ENDLESS_ENTRY_ITEM: '无尽秘钥', ENDLESS_SWEEP_ITEM: '扫荡券',
    ENDLESS_SPIRIT_HEART_COST: 10, ENDLESS_TOKEN: '劫境道痕', WEEKEND_FREE_FIELD: '周末免费', ENDLESS_TIER_MAX_LAYER: 10,
    calculateMinggeSourceGain: amount => amount,
    getEndlessSweepReward: () => ({ startLayer: 1, endLayer: 10, layers: 10, cultivation: 1, blood: 1, lingshi: 1, sourceStone: 1, tokens: 1 }),
    redis: { del: async () => {} }, logger: { error() {} },
  };
  const app = {
    checkPlayer: async e => e.user_id, getPlayerTeam: async () => team, getTeam: async () => team,
    isTeamGroup: () => true, withLock: (_e, scope, action) => withPlayerMutationLock(`endless:${scope}`, action),
    saveRun: async run => { if (f.failRun) throw new Error('run-save-failed'); f.savedRun = copy(run); },
    saveTeam: async () => {}, runKey: () => 'run', formatAllChoices: () => [], formatStarPrompt: () => [], formatAmount: String,
  };
  app.startRun = method('apps/EndlessRealm.js', 'startRun', 'issueEndlessWebLink', deps);
  app.sweepEndlessRealm = method('apps/EndlessRealm.js', 'sweepEndlessRealm', 'withdrawRun', deps);
  return { ...f, app, team, state: f };
}

test('无尽真实开局每本地成员+5，整局建立失败回滚模拟；一次付费扫荡只计一趟', async () => {
  const f = endlessFixture();
  f.state.failRun = true;
  await f.app.startRun(event('owner'));
  assert.equal(f.players.get('owner').模拟值, 0);
  assert.equal(f.players.get('other').模拟值, 0);
  f.state.failRun = false;
  await f.app.startRun(event('owner'));
  await f.app.startRun(event('owner'));
  assert.equal(f.players.get('owner').模拟值, 5);
  assert.equal(f.players.get('other').模拟值, 5);
  f.app.getPlayerTeam = async () => null;
  await f.app.sweepEndlessRealm(event('owner'));
  assert.equal(f.players.get('owner').模拟值, 10, '十层奖励不冒充十次入场');
  f.state.failPlayer = true;
  await f.app.sweepEndlessRealm(event('owner'));
  assert.equal(f.players.get('owner').模拟值, 10);
  await f.app.sweepEndlessRealm(event('owner'));
  assert.equal(f.players.get('owner').模拟值, 15);
});

test('限时裂界付费入场后+5，缺凭证或已在同次裂界时不增加模拟', async () => {
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
  assert.equal(player.模拟值, 5);
  assert.equal(tickets, 0);
  await app.enterRift(event('owner'));
  assert.equal(player.模拟值, 5);
});
