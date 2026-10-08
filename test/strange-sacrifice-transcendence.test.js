import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

import * as sacrifice from '../model/strangeSacrifice.js';
import { getRealmAuthorityLevel } from '../model/realmAuthority.js';
import { resolveFlowerEvolution, resolveFlowerBreakthrough } from '../model/flowerPollenPath.js';
import { repairPlane, repairDestroyedPlanes, repairNaturallyDestroyedPlanes } from '../model/planeDestruction.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const duration = sacrifice.STRANGE_SACRIFICE.bubbleDurationMs;
const routes = { mijing: ['mijinglevel_id', 22], xiangu: ['xiangulevel_id', 23], huafen: ['huafenlevel_id', 23] };
const playerFor = (route = 'mijing', overrides = {}) => ({
  id: 'bubble-fixture', 名号: '测试道友', 额外体系: route,
  [routes[route][0]]: routes[route][1],
  当前血量: 900, 血量上限: 1000, 攻击: 100, 防御: 80,
  修为: 1234, 血气: 2345, 厄土仙帝击杀数: 10,
  测试嵌套状态: { value: 1 },
  ...overrides,
});

test('三体系都须经历始祖彻底永祭，720分钟前后边界精确且重启不重置', () => {
  assert.equal(duration, 720 * 60_000);
  for (const route of Object.keys(routes)) {
    const player = playerFor(route);
    const defeat = sacrifice.applyStrangeSacrificeDefeat(player, { now: 1000, enemyType: 'ancestor' });
    assert.equal(defeat.eternallySacrificed, true);
    assert.equal(player.当前血量, 0);
    assert.equal(player.诡异祭礼身灭道消至, undefined);
    const restarted = JSON.parse(JSON.stringify(player));
    sacrifice.enterSacrificeBubble(restarted, 2000);
    assert.equal(restarted.始祖永祭.startedAt, 1000);
    assert.equal(restarted.始祖永祭.readyAt, 1000 + duration);
    assert.equal(sacrifice.escapeSacrificeBubble(restarted, 1000 + duration - 1).ok, false);
    assert.equal(getRealmAuthorityLevel(restarted), 22);
    const result = sacrifice.escapeSacrificeBubble(restarted, 1000 + duration);
    assert.equal(result.ok, true);
    assert.equal(getRealmAuthorityLevel(restarted), 23);
    assert.equal(restarted[routes[route][0]], routes[route][1] + 1);
    assert.equal(restarted.当前血量, restarted.血量上限);
    assert.equal(sacrifice.getStrangeSacrificeInteractionLock(restarted).active, false);
    assert.equal(sacrifice.escapeSacrificeBubble(restarted, 2000 + duration).ok, false);
  }
});

test('普通战败、低境败北和仙图改命均不冒充始祖彻底永祭', () => {
  for (const [level, enemyType] of [[22, 'immortal_emperor'], [21, 'ancestor'], [23, 'ancestor']]) {
    const player = playerFor('mijing', { mijinglevel_id: level });
    const result = sacrifice.applyStrangeSacrificeDefeat(player, { now: 1000, enemyType, random: () => 0 });
    assert.equal(result.eternallySacrificed, undefined);
    assert.equal(player.始祖永祭, undefined);
    assert.equal(player.诡异祭礼身灭道消至, 1000 + 24 * 60 * 60_000);
  }
  const protectedPlayer = playerFor('mijing', { 当前大道至宝: '永恒仙图' });
  assert.equal(sacrifice.applyStrangeSacrificeDefeat(protectedPlayer, { now: 1000, enemyType: 'ancestor' }).rewritten, true);
  assert.equal(protectedPlayer.始祖永祭, undefined);
});

test('落盘守卫拦截直接晋升和提前脱离，外界映照不清除泡影', () => {
  for (const route of Object.keys(routes)) {
    const previous = playerFor(route);
    const upgraded = structuredClone(previous);
    upgraded[routes[route][0]]++;
    assert.throws(() => sacrifice.assertSacrificeBubbleWrite(previous, upgraded, 1000), { code: 'SACRIFICE_BUBBLE_REQUIRED' });
    sacrifice.enterSacrificeBubble(previous, 1000);
    const rescued = { ...previous, 当前血量: 1000, 修仙状态: '空闲', 始祖永祭: undefined };
    sacrifice.assertSacrificeBubbleWrite(previous, rescued, 1000 + duration);
    assert.equal(rescued.始祖永祭.status, 'bubble');
    assert.equal(rescued.当前血量, 0);
    const completed = structuredClone(previous);
    sacrifice.escapeSacrificeBubble(completed, 1000 + duration);
    assert.throws(() => sacrifice.assertSacrificeBubbleWrite(previous, completed, 999 + duration));
    assert.doesNotThrow(() => sacrifice.assertSacrificeBubbleWrite(previous, completed, 1005 + duration));
    assert.doesNotThrow(() => sacrifice.assertSacrificeBubbleWrite(completed, completed, 1006 + duration));
  }
});

test('篡短就绪时间或伪造普通寂灭记录均不会提前超脱', () => {
  const player = playerFor();
  sacrifice.enterSacrificeBubble(player, 1000);
  player.始祖永祭.readyAt = 1001;
  assert.equal(sacrifice.escapeSacrificeBubble(player, 1002).ok, false);
  player.始祖永祭.source = '普通寂灭';
  assert.equal(sacrifice.escapeSacrificeBubble(player, 1000 + duration).ok, false);
  assert.equal(sacrifice.escapeSacrificeBubble(playerFor(), 1000 + duration).ok, false);
});

test('普通花粉进化和蜕变不消耗资源、不随机跳过永祭门槛', () => {
  for (const resolve of [resolveFlowerEvolution, resolveFlowerBreakthrough]) {
    const player = playerFor('huafen');
    const before = structuredClone(player);
    assert.equal(resolve(player, '祖种花粉', () => { throw new Error('不应抽取概率'); }).reason, 'sacrifice-bubble-required');
    assert.deepEqual(player, before);
  }
});

test('祭道胜利遭回溯；祭道之上永久终结，首轮灭世与后续调度均不覆盖终局', () => {
  for (const first of [true, false]) {
    let { state } = sacrifice.forceStartStrangeSacrifice({ bigCount: first ? 0 : 1 }, 'big', 500_000);
    assert.equal(sacrifice.resolveHighlandFinale(state, playerFor()).rewound, true);
    assert.equal(state.plateauRewinds, 1);
    assert.equal(state.plateauDestroyed, false);
    assert.equal(state.activeEvent.type, 'big');
    assert.equal(sacrifice.resolveHighlandFinale(state, playerFor('mijing', { mijinglevel_id: 23 })).destroyed, true);
    const settled = sacrifice.settleStrangeSacrifice(state, 'big', 500_001);
    state = JSON.parse(JSON.stringify(settled.state));
    assert.equal(settled.event.destroyed, true);
    assert.equal(settled.event.defended, true);
    assert.equal(state.phase, 'destroyed');
    assert.equal(state.heavenSlashUntilWorldYear, 0);
    assert.equal(state.activeEvent, null);
    assert.equal(state.smallDueWorldYear, null);
    assert.equal(state.bigDueWorldYear, null);
    assert.equal(sacrifice.advanceStrangeSacrificeState(state, { worldYear: 1e9, hasImmortalEmperor: true }).event, null);
    assert.equal(sacrifice.forceStartStrangeSacrifice(state, 'big', 1e9).reason, 'destroyed');
  }
});

function fixture({ won = true, route = 'mijing', overrides = {}, storedPlayer, clock = 1_000_000, failEquipment = false } = {}) {
  const disks = { 'bubble-fixture': storedPlayer || playerFor(route, overrides) };
  let state = sacrifice.forceStartStrangeSacrifice(null, 'big', 500_000).state;
  state.planeSnapshot = { 凡间: 1, 仙界: 1 };
  let plane = { 凡间: 0, 仙界: 0, 厄土高原: 1, 位面毁灭记录: { 凡间: { source: 'strange_emperor' }, 仙界: { source: 'strange_emperor' } } };
  let writes = 0;
  let battles = 0;
  const replies = [];
  const broadcasts = [];
  const context = {
    ...sacrifice, getRealmAuthorityLevel, structuredClone, path,
    Date: class extends Date { static now() { return clock; } },
    plugin: class { constructor(options) { Object.assign(this, options); } },
    config: { getConfig: () => ({ Era: { current: { totalYears: 500_000 } } }) },
    data: { filePathMap: { weimianList: 'memory/plane.json' } },
    __PATH: { data_path: 'memory/data', player_path: 'memory/players', equipment_path: 'memory/equipment' },
    redis: { set: async () => {}, del: async () => {} },
    FileRollbackTransaction: class {
      capture(file) {
        if (file.includes('players')) this.player = structuredClone(disks['bubble-fixture']);
      }
      rollback() { disks['bubble-fixture'] = this.player; }
      commit() {}
    },
    fs: {
      readdirSync: () => Object.keys(disks).map(id => `${id}.json`),
      readFileSync: file => {
        if (file.endsWith('strange_sacrifice_state.json')) return JSON.stringify(state);
        if (file.endsWith('plane.json')) return JSON.stringify(plane);
        return JSON.stringify(disks[path.basename(file, '.json')]);
      },
    },
    writeJsonAtomically: (file, value) => {
      if (file.endsWith('strange_sacrifice_state.json')) state = structuredClone(value);
      else plane = structuredClone(value);
    },
    getRealmEventWorldYear: () => 500_000,
    channel: async id => id,
    existplayer: async id => Boolean(disks[id]),
    Read_player: async id => structuredClone(disks[id]),
    Write_player: async (id, value) => {
      sacrifice.assertSacrificeBubbleWrite(disks[id], value, clock);
      disks[id] = structuredClone(value);
      writes++;
    },
    Read_equipment: async () => ({}),
    Write_equipment: async id => {
      if (failEquipment) throw new Error('equipment fixture failure');
      disks[id].血量上限 = 2000;
    },
    withPlayerMutationLock,
    verc: () => true,
    ensureTimeRiverSkills() {},
    suppressJuelingLifespan: () => false,
    restoreJuelingLifespan() {},
    logger: { warn() {} },
    ForwardMsg: async (_e, messages) => replies.push(messages.join('\n')),
    applyStrangeSacrificeDefeat: (player, options) => sacrifice.applyStrangeSacrificeDefeat(player, { ...options, now: clock, random: () => 0 }),
    escapeSacrificeBubble: player => sacrifice.escapeSacrificeBubble(player, clock),
    getStrangeSacrificeInteractionLock: player => sacrifice.getStrangeSacrificeInteractionLock(player, clock),
    resolveHighlandFinale: (state, player) => sacrifice.resolveHighlandFinale(state, player, clock),
    zd_battle: async (team, enemies) => {
      battles++;
      team[0].测试嵌套状态.value = 999;
      return {
        A_team: [{ 当前血量: won ? 100 : 0 }],
        B_team: enemies.map(enemy => ({ ...enemy, 当前血量: won ? 0 : 100 })),
        B_hp: won ? 0 : 1000, msg: [],
      };
    },
  };
  const code = read('apps/Boss/StrangeSacrifice.js')
    .replace(/^import[\s\S]*?;\s*/gm, '')
    .replace(/export class /g, 'class ');
  const classes = vm.runInNewContext(`${code}\n({ StrangeSacrifice, StrangeSacrificeDeathLock })`, context);
  const boss = new classes.StrangeSacrifice();
  boss.broadcast = async message => broadcasts.push(message);
  const guard = new classes.StrangeSacrificeDeathLock();
  const event = { user_id: 'bubble-fixture', msg: '#迎战诡异大祭', reply: async message => replies.push(message) };
  return {
    boss, guard, event, replies, broadcasts,
    get player() { return disks['bubble-fixture']; }, get state() { return state; },
    get plane() { return plane; }, get writes() { return writes; }, get battles() { return battles; },
    setClock(value) { clock = value; },
  };
}

test('真实大祭祭道胜利仅回溯，不奖励击杀；同轮可再次迎战且恢复战前状态', async () => {
  const f = fixture();
  const before = structuredClone(f.player);
  await f.boss.fight(f.event, 'big');
  assert.deepEqual(f.player, before);
  assert.equal(f.state.successfulDefenders, 0);
  assert.equal(f.state.participants['bubble-fixture'].result, 'rewound');
  assert.equal(f.state.plateauRewinds, 1);
  assert.match(f.replies.at(-1), /高原意志复苏/);
  await f.boss.fight(f.event, 'big');
  assert.equal(f.state.plateauRewinds, 2);
  assert.equal(f.battles, 2);
  assert.deepEqual(f.player, before);
});

test('真实始祖败北进入泡影，719分59秒仍封锁，满720分钟仅晋升一次并刷新属性', async () => {
  const f = fixture({ won: false });
  await f.boss.fight(f.event, 'big');
  assert.equal(f.player.始祖永祭.status, 'bubble');
  assert.match(f.replies.at(-1), /空间泡影/);
  f.setClock(1_000_000 + duration - 1);
  f.event.msg = '#挣脱空间泡影';
  await f.guard.guard(f.event);
  assert.equal(getRealmAuthorityLevel(f.player), 22);
  assert.match(f.replies.at(-1), /尚余1分钟/);
  f.setClock(1_000_000 + duration);
  await Promise.all([f.guard.guard(f.event), f.boss.tick()]);
  assert.equal(getRealmAuthorityLevel(f.player), 23);
  assert.equal(f.player.始祖永祭.status, 'transcended');
  assert.equal(f.player.当前血量, 2000);
  const writes = f.writes;
  await f.guard.guard(f.event);
  await f.boss.tick();
  assert.equal(f.writes, writes);
});

test('离线泡影记录在进程重启后的定时巡查完成，不依赖旧内存计时器', async () => {
  const player = playerFor('xiangu');
  sacrifice.enterSacrificeBubble(player, 1000);
  const f = fixture({ storedPlayer: JSON.parse(JSON.stringify(player)), clock: 1000 + duration });
  await f.boss.tick();
  assert.equal(f.player.xiangulevel_id, 24);
  assert.equal(f.broadcasts.filter(message => message.includes('挣脱泡影')).length, 1);
  await f.boss.tick();
  assert.equal(f.broadcasts.filter(message => message.includes('挣脱泡影')).length, 1);
});

test('祭道之上真实胜利立即永久覆灭，首轮不再灭世，后续迎战与强开均失效', async () => {
  const f = fixture({ overrides: { mijinglevel_id: 23 } });
  await f.boss.fight(f.event, 'big');
  assert.equal(f.state.phase, 'destroyed');
  assert.equal(f.state.plateauDestroyed, true);
  assert.equal(f.state.activeEvent, null);
  assert.equal(f.plane.厄土高原, 0);
  assert.equal(f.plane.高原彻底覆灭, true);
  assert.equal(f.plane.凡间, 1);
  assert.equal(f.plane.仙界, 1);
  assert.equal(f.plane.诡异祭礼绝灵时代, 0);
  assert.equal(f.state.heavenSlashUntilWorldYear, 0);
  assert.ok(f.broadcasts.some(message => message.includes('高原永灭')));
  await f.boss.fight(f.event, 'big');
  await f.boss.forceOpen(f.event, 'big');
  assert.equal(f.battles, 1);
  assert.equal(f.state.activeEvent, null);
});

test('永久覆灭高原不被单体、批量或自然修复复活', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sacrifice-plateau-'));
  const file = path.join(dir, 'planes.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ 厄土高原: 0, 凡间: 0, 高原彻底覆灭: true }));
    assert.equal(repairPlane(file, '厄土高原'), false);
    assert.deepEqual(repairDestroyedPlanes(file), ['凡间']);
    repairNaturallyDestroyedPlanes(file, { worldYear: 1e9 });
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).厄土高原, 0);
  } finally {
    fs.unlinkSync(file);
    fs.rmdirSync(dir);
  }
});

test('超脱后的装备属性刷新失败会回滚晋升，保留原720分钟计时供下次结算', async () => {
  const player = playerFor();
  sacrifice.enterSacrificeBubble(player, 1000);
  const f = fixture({ storedPlayer: structuredClone(player), clock: 1000 + duration, failEquipment: true });
  await assert.rejects(f.guard.guard(f.event), /equipment fixture failure/);
  assert.deepEqual(f.player, player);
  assert.equal(f.replies.length, 0);
  const restarted = fixture({ storedPlayer: structuredClone(f.player), clock: 1000 + duration + 1 });
  await restarted.guard.guard(restarted.event);
  assert.equal(getRealmAuthorityLevel(restarted.player), 23);
});

test('旧大祭入口也使用720分钟泡影与高原回溯，不保留短时直接晋升', () => {
  const source = read('apps/Boss/BOSS3.js');
  assert.match(source, /enterSacrificeBubble\(sacrificedPlayer, now\)/);
  assert.doesNotMatch(source, /checkPlayer\.mijinglevel_id = 23/);
  assert.equal((source.match(/this\.rewindHighland\(e, player, WorldBossStatus, plateauPlayerSnapshot\)/g) || []).length, 2);
  assert.match(source, /this\.rewindHighland\(e, killerPlayer, WorldBossStatus\)/);
  const snapshot = source.indexOf('const plateauPlayerSnapshot = structuredClone(player)');
  assert.ok(snapshot > source.indexOf('async WorldBossBattle(e)'));
  assert.ok(snapshot < source.indexOf('async rewindHighland(e, player, status'));
});
