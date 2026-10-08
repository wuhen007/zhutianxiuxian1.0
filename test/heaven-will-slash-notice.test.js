import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import {
  applyHeavenWillSlashOnAdvancement,
  assertSacrificeBubbleWrite,
  ensureStrangeSacrificeState,
  formatHeavenWillSlashImpact,
  formatHeavenWillSlashStatus,
} from '../model/strangeSacrifice.js';
import {
  flushHeavenWillSlashNotice,
  queueHeavenWillSlashNotice,
} from '../model/heavenWillSlashNotice.js';
import * as extra from '../model/extraCultivation.js';
import * as heart from '../model/daoHeart.js';
import * as dust from '../model/redDustPath.js';
import * as tribulationRules from '../apps/User/zhetianTribulationRules.js';
import { completeDaoByNineLives } from '../apps/User/wudaoRules.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const data = {
  Levelmijing_list: JSON.parse(read('resources/data/Level/秘境体系.json')),
  xiangujinshi_list: JSON.parse(read('resources/data/Level/仙古今世法.json')),
  huafen_list: JSON.parse(read('resources/data/Level/花粉进化路体系.json')),
};
const between = (file, start, end) => {
  const source = read(file);
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
};

function slashRecord(count = 1) {
  const previous = { mijinglevel_id: 16, xiangulevel_id: 15, huafenlevel_id: 1 };
  const next = {
    ...previous,
    名号: '测试道友',
    mijinglevel_id: 17,
    修为: 1000,
    血气: 2000,
    当前血量: 10000,
    血量上限: 10000,
    道伤: 0,
    天意一刀斩道次数: count - 1,
  };
  return applyHeavenWillSlashOnAdvancement(previous, next, {
    heavenSlashUntilWorldYear: 534000,
  }, 527000);
}

test('全局文案明确影响范围、处罚、世界年期限及到期不自动修复', () => {
  const active = formatHeavenWillSlashStatus({ heavenSlashUntilWorldYear: 534000 }, 527000);
  for (const phrase of ['尚余7000个世界年', '至534000年解除', '修为、血气清零', '道伤取整后+3', '并不等于渡劫次数']) {
    assert.ok(active.includes(phrase), phrase);
  }
  const expired = formatHeavenWillSlashStatus({ heavenSlashUntilWorldYear: 534000 }, 534000);
  assert.match(expired, /未生效/);
  assert.match(expired, /不会随期限结束自动复原/);
  assert.doesNotMatch(expired, /尚余|仙路横断/);
  assert.match(formatHeavenWillSlashStatus(null, 0), /天门尚开/);
});

test('个人斩道文案使用实际前后快照和境界名称，不更改处罚数值', () => {
  const record = slashRecord(16);
  const message = formatHeavenWillSlashImpact(record, data);
  assert.equal(record.before.mijinglevel_id, 17);
  assert.equal(record.after.mijinglevel_id, 16);
  assert.equal(record.after.修为, 0);
  assert.equal(record.after.血气, 0);
  assert.equal(record.after.当前血量, 1);
  assert.equal(record.after.道伤, 3);
  assert.match(message, /人体秘境：.*红尘仙.*→.*大帝/);
  assert.match(message, /修为：1,000 → 0｜血气：2,000 → 0/);
  assert.match(message, /当前血量：10,000 → 1｜道伤：0 → 3/);
  assert.match(message, /累计被斩16次/);
  assert.match(message, /回血或开启内景/);
});

test('同一玩家短时连续斩道只输出一条，保留首次资源和最终道伤次数', async () => {
  const sent = [];
  const event = { reply: async (message) => sent.push(message) };
  queueHeavenWillSlashNotice('notice-merge', slashRecord(1), data, event);
  queueHeavenWillSlashNotice('notice-merge', {
    ...slashRecord(2),
    before: { ...slashRecord(2).before, 修为: 0, 血气: 0, 道伤: 3 },
    after: { ...slashRecord(2).after, 道伤: 6 },
  }, data);
  assert.equal(await flushHeavenWillSlashNotice('notice-merge'), true);
  assert.equal(await flushHeavenWillSlashNotice('notice-merge'), false);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /修为：1,000 → 0/);
  assert.match(sent[0], /道伤：0 → 6/);
  assert.match(sent[0], /连续结算触发2次｜累计被斩2次/);
});

test('不同玩家的斩道通知分别投递，后台触发使用现有私聊发送器', async () => {
  const previousBot = globalThis.Bot;
  const sent = [];
  globalThis.Bot = {
    pickUser: (id) => ({ sendMsg: async (message) => sent.push({ id, message }) }),
  };
  try {
    queueHeavenWillSlashNotice('notice-a', slashRecord(2), data);
    queueHeavenWillSlashNotice('notice-b', slashRecord(7), data);
    await flushHeavenWillSlashNotice('notice-b');
    await flushHeavenWillSlashNotice('notice-a');
    assert.deepEqual(sent.map((item) => item.id), ['notice-b', 'notice-a']);
    assert.match(sent[0].message, /累计被斩7次/);
    assert.match(sent[1].message, /累计被斩2次/);
  } finally {
    globalThis.Bot = previousBot;
  }
});

test('消息发送失败不抛入存档流程，也不重新触发处罚', async () => {
  const previousWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    queueHeavenWillSlashNotice('notice-failure', slashRecord(), data, {
      reply: async () => ({ retcode: -1, status: 'failed' }),
    });
    assert.equal(await flushHeavenWillSlashNotice('notice-failure'), false);
    assert.equal(await flushHeavenWillSlashNotice('notice-failure'), false);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = previousWarn;
  }
});

test('后台通知即使没有手动flush也会在合并窗口结束后输出', async () => {
  const sent = [];
  queueHeavenWillSlashNotice('notice-timer', slashRecord(), data, {
    reply: async (message) => sent.push(message),
  });
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(sent.length, 1);
  assert.equal(await flushHeavenWillSlashNotice('notice-timer'), false);
});

function reverseLifeFixture(active, failWrite = false) {
  let disk = {
    id: active ? 'reverse-active' : 'reverse-inactive',
    名号: '逆活测试',
    额外体系: 'xiangu',
    mijinglevel_id: 16,
    xiangulevel_id: 15,
    huafenlevel_id: 1,
    nihuo_count: 9,
    修为: 1e16,
    血气: 1e16,
    元神: 1e16,
    寿元: 1e9,
    仙道潜力: 1e6,
    当前血量: 1e12,
    血量上限: 1e12,
    道心: 500,
    攻击加成: 0,
    防御加成: 0,
    生命加成: 0,
    红尘仙路: {
      unlocked: true, life: 9, vow: '化凡', ashes: 0,
      seals: Array.from({ length: 8 }, (_, i) => ({ life: i + 1, vow: '化凡' })),
    },
  };
  const state = { heavenSlashUntilWorldYear: active ? 534000 : 0 };
  const replies = [];
  let writes = 0;
  const noop = () => {};
  const context = {
    ...extra, ...heart, ...dust, ...tribulationRules,
    completeDaoByNineLives, applyHeavenWillSlashOnAdvancement, assertSacrificeBubbleWrite,
    ensureStrangeSacrificeState, formatHeavenWillSlashImpact,
    queueHeavenWillSlashNotice, flushHeavenWillSlashNotice,
    data, path,
    __PATH: { player_path: 'memory/players', data_path: 'memory/data' },
    fs: {
      existsSync: () => true,
      readFileSync: (file) => JSON.stringify(file.endsWith('strange_sacrifice_state.json') ? state : disk),
    },
    config: { getConfig: () => ({ Era: { current: { index: 2, years: 7000, epoch: 11, totalYears: 527000 } } }) },
    getRealmEventWorldYear: () => 527000,
    Read_player: async () => extra.ensureExtraCultivationState(structuredClone(disk)),
    withPlayerMutationLock: (_id, fn) => fn(),
    assertGlobalInitIdle: noop,
    assertTribulationWriteAllowed: noop,
    assertZhutianMirrorWriteCurrent: noop,
    assertZhutianAvatarRootWriteAllowed: noop,
    updateDailyTaskLingshiProgress: noop,
    isTianmoHuashengPhysique: () => false,
    releaseJuelingLifespanForAuthority: noop,
    markZhutianMirrorSnapshot: noop,
    writeJsonAtomically: (_file, player) => {
      if (failWrite) throw new Error('disk fixture failure');
      disk = JSON.parse(JSON.stringify(player));
      writes++;
    },
    console: { warn: noop },
    channel: async (id) => id,
    sleep: async () => {},
    battleDemon: async () => ({ success: true }),
    Read_equipment: async () => ({}),
    applyQuestionFortuneCost: (_player, value) => value,
    bigNumberTransform: String,
    ForwardMsg: async () => {},
    zhetiandujie: class {
      enterTribulationState() {}
      calcMaxTheoreticalAtk() { return 1; }
      clearTempEffects() {}
      applyGongfaEffects() { return { damage: 1, messages: [] }; }
      updateCooldowns() {}
    },
  };
  vm.createContext(context);
  const writeCode = between('model/xiuxian.js', 'export async function Write_player(', '\nfunction normalizeEquipmentSlot(');
  const hpCode = between('model/xiuxian.js', 'export async function Add_HP(', '\nexport async function Set_HP(');
  vm.runInContext(`${writeCode.replace('export ', '')}\n${hpCode.replace('export ', '')}`, context);
  // 只替代装备属性计算，保留其 Write_player → Add_HP(0) 两次实际保存链。
  context.Write_equipment = async (id) => {
    await context.Write_player(id, await context.Read_player(id));
    await context.Add_HP(id, 0);
  };
  const method = between('apps/User/Level.js', 'async nihuojiushi(e)', 'async zhengdao(e)');
  const level = vm.runInContext(`({${method}})`, context);
  const event = {
    isGroup: true,
    user_id: disk.id,
    reply: async (message) => replies.push({ message: String(message), writes }),
  };
  return { level, event, replies, context, get disk() { return disk; }, get writes() { return writes; } };
}

test('真实逆活成功与保存函数在四次斩道后只报受损结局，不先宣布成仙', async () => {
  const fixture = reverseLifeFixture(true);
  await fixture.level.nihuojiushi(fixture.event);
  assert.equal(fixture.writes, 4);
  assert.equal(fixture.disk.天意一刀斩道次数, 4);
  assert.equal(fixture.disk.道伤, 12);
  assert.equal(fixture.disk.当前血量, 1);
  assert.equal(fixture.disk.mijinglevel_id, 16);
  assert.match(fixture.disk.天意一刀提示, /累计被斩4次/);
  const notices = fixture.replies.filter(({ message }) => message.includes('【天意一刀·仙基被斩】'));
  assert.equal(notices.length, 1);
  assert.equal(notices[0].writes, 4);
  assert.match(notices[0].message, /连续结算触发4次｜累计被斩4次/);
  assert.match(notices[0].message, /道伤：0 → 12/);
  assert.ok(fixture.replies.every(({ message }) => !message.includes('九世圆满！红尘为仙！')));
});

test('未触发斩道的第九世仍正常晋升，并在全部保存完成后输出成功', async () => {
  const fixture = reverseLifeFixture(false);
  await fixture.level.nihuojiushi(fixture.event);
  assert.equal(fixture.disk.mijinglevel_id, 17);
  assert.equal(fixture.disk.nihuo_count, 10);
  assert.equal(fixture.disk.长生特性, true);
  assert.equal(fixture.disk.天意一刀提示, undefined);
  assert.equal(fixture.replies.at(-1).writes, 4);
  assert.match(fixture.replies.at(-1).message, /九世圆满！红尘为仙！/);
});

test('存档失败时不发送斩道通知或提前宣布逆活成功', async () => {
  const fixture = reverseLifeFixture(true, true);
  await assert.rejects(fixture.level.nihuojiushi(fixture.event), /disk fixture failure/);
  assert.equal(await flushHeavenWillSlashNotice(fixture.event.user_id, fixture.event), false);
  assert.ok(fixture.replies.every(({ message }) => !message.includes('九世圆满！红尘为仙！')));
});

test('个人状态查询只读落盘数据，区分当前期限与旧斩道提示', async () => {
  const replies = [];
  const player = { 名号: '旧档', 天意一刀斩道次数: 16, 当前血量: 1, 道伤: 27.3, 天意一刀提示: '旧版提示：本次仙道进阶已被斩断。' };
  const method = between('apps/Boss/StrangeSacrifice.js', 'async showHeavenWillSlash(e)', 'async fightSmall(e)');
  const handler = vm.runInNewContext(`({${method}})`, {
    channel: async (id) => { assert.equal(id, 'player'); return 'mapped-player'; },
    existplayer: async (id) => { assert.equal(id, 'mapped-player'); return true; },
    fs: { readFileSync: (file) => {
      assert.ok(file.endsWith('mapped-player.json'));
      return JSON.stringify(player);
    } },
    path,
    __PATH: { player_path: 'memory/players' },
    readState: () => ({ heavenSlashUntilWorldYear: 534000 }),
    worldYear: () => 534000,
    formatHeavenWillSlashStatus,
  });
  await handler.showHeavenWillSlash({ user_id: 'qg_player', reply: async (message) => replies.push(message) });
  assert.equal(replies.length, 1);
  assert.match(replies[0], /仙路封锁未生效/);
  assert.match(replies[0], /累计被斩16次/);
  assert.match(replies[0], /当前道伤：27.3/);
  assert.match(replies[0], /最近一次斩道记录·非当前状态/);
});

test('小祭和大祭的每种尾声广播均带完整天意一刀影响', async () => {
  const method = between('apps/Boss/StrangeSacrifice.js', 'async applyEvent(state, event, currentWorldYear)', 'async settlePlayers(state, event)');
  const handler = vm.runInNewContext(`({${method}})`, {
    formatHeavenWillSlashStatus,
    settlePlanes: () => {},
  });
  handler.settlePlayers = async () => {};
  for (const type of ['small_ended', 'big_ended']) {
    for (const firstRound of [true, false]) {
      const sent = [];
      handler.broadcast = async (message) => sent.push(message);
      await handler.applyEvent({ heavenSlashUntilWorldYear: 534000 }, { type, firstRound, defended: true }, 504000);
      assert.equal(sent.length, 1);
      assert.match(sent[0], /尚余30000个世界年/);
      assert.match(sent[0], /修为、血气清零/);
    }
  }
});
