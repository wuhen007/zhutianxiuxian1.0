import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as access from '../model/endlessAccess.js';
import { createSuiyunRoot } from '../model/suiyun.js';
import { getSpiritHeartCost } from '../model/spiritUniverse.js';
import { calculateMinggeSourceGain } from '../model/mingge.js';
import { createMemoryRoot, recordMemoryDungeon } from '../model/memoryPath.js';

const source = fs.readFileSync(new URL('../apps/EndlessRealm.js', import.meta.url), 'utf8');
const copy = structuredClone;
const nextMethod = {
  startRun: 'issueEndlessWebLink', consumeCrossEndlessEntry: 'refundCrossEndlessEntry',
  refundCrossEndlessEntry: 'publishCrossEndless', sweepEndlessRealm: 'withdrawRun',
};
function fixture(stage = 1) {
  const state = {
    players: {
      owner: { id: 'owner', 名号: '岁云修士', 灵根: createSuiyunRoot(stage), 心神: 0, 无尽劫境最高层: 10 },
      ordinary: { id: 'ordinary', 名号: '普通修士', 灵根: { name: '凡体' }, 心神: 100 },
    },
    tokens: { owner: { 无尽秘钥: 0, 无尽扫荡券: 1 }, ordinary: { 无尽秘钥: 1, 无尽扫荡券: 1 } },
    team: { id: '123456', leader: 'owner', groupId: 'group', members: ['owner'], memberNames: { owner: '岁云修士', ordinary: '普通修士' }, status: 'lobby' },
    costs: [], heartCalls: 0, writes: 0, rewardCalls: 0,
  };
  const deps = {
    ...access, logger: { error() {} }, STATE_TTL_SECONDS: 100, ENDLESS_TOKEN: '劫境道痕', ENDLESS_TIER_MAX_LAYER: 150,
    data: { minggeList: [] }, isWeekendNow: () => Boolean(state.weekend), getWeekendFreeWeekKey: () => 'fixture-week',
    Read_player: async id => copy(state.players[id]),
    Write_player: async (id, p) => {
      if (state.failWrite) { state.failWrite = false; throw new Error('fixture-player-write'); }
      state.players[id] = copy(p); state.writes++;
    },
    existplayer: async id => Boolean(state.players[id]),
    exist_najie_thing: async (id, name) => state.tokens[id][name] || 0,
    Add_najie_thing: async (id, name, _category, amount) => {
      if (state.failItem === name && amount < 0) throw new Error('fixture-item-write');
      state.tokens[id][name] = (state.tokens[id][name] || 0) + amount;
      state.costs.push([id, name, amount]);
      assert.ok(state.tokens[id][name] >= 0);
    },
    refreshSpiritHeart: p => ({ current: p.心神, max: 100 }),
    getSpiritHeartMax: () => 100, getSpiritHeartCost,
    consumeSpiritHeart: (p, cost, _now, effects) => {
      state.heartCalls++;
      if (state.failHeartAt === state.heartCalls) return { ok: false };
      cost = getSpiritHeartCost(cost, effects);
      if (p.心神 < cost) return { ok: false };
      p.心神 -= cost; return { ok: true, cost };
    },
    getMinggeEffects: () => state.effects || {},
    normalizeEndlessDifficultyTier: () => 1, canEnterEndlessDifficulty: () => !state.locked,
    formatEndlessDifficulty: () => 'A1', getDailyEndlessCelestial: () => ({ name: '天象', description: '测试' }),
    createEndlessRun: options => ({ id: 'test-run', lifeFire: 3, maxLifeFire: 3, difficultyTier: 1, celestialPhenomenon: options.celestialPhenomenon }),
    getWorldForLayer: () => ({ name: '测试世界', rule: '测试规则' }),
    getEndlessWebConfig: () => ({ enabled: false }), shouldAutoIssueEndlessWebTicket: () => false,
    getEndlessSweepReward: () => ({ startLayer: 1, endLayer: 10, layers: 10, cultivation: 100 * ++state.rewardCalls, blood: 100, lingshi: 100, sourceStone: 10, tokens: 1 }),
    calculateMinggeSourceGain, recordMemoryDungeon,
    redis: { del: async () => {} },
  };
  const app = {
    checkPlayer: async () => 'owner', getPlayerTeam: async () => state.team,
    getTeam: async () => copy(state.team), isTeamGroup: () => true,
    withLock: async (_event, _key, fn) => fn(),
    saveRun: async run => { if (state.failRun) throw new Error('fixture-run-write'); state.run = copy(run); },
    saveTeam: async team => { state.team = copy(team); },
    formatAllChoices: () => [], formatStarPrompt: () => [], formatAmount: String,
    crossRaidMemberKey: id => id, writeCrossJson: async (_key, value) => { state.ledger = copy(value); },
  };
  for (const [name, next] of Object.entries(nextMethod)) {
    const from = source.indexOf(`  async ${name}(`), to = source.indexOf(`  async ${next}(`, from);
    assert.ok(from >= 0 && to > from, name);
    app[name] = new Function(...Object.keys(deps), `return ({${source.slice(from, to)}}).${name};`)(...Object.values(deps));
  }
  state.app = app;
  state.event = { user_id: 'owner', isGroup: true, group_id: 'group', reply: async text => text };
  return state;
}

test('无尽入场全五阶段无秘钥、零心神也可开启，不占周末额度、不扩大到普通队友', async () => {
  for (let stage = 1; stage <= 5; stage++) {
    const f = fixture(stage);
    f.weekend = true;
    const reply = await f.app.startRun(f.event);
    assert.match(reply, /月华通行/);
    assert.equal(f.costs.length, 0);
    assert.equal(f.heartCalls, 0);
    assert.equal(f.players.owner.心神, 0);
    assert.equal(f.players.owner[access.WEEKEND_FREE_FIELD], undefined);
    assert.equal(f.team.status, 'running');
  }
  const mixed = fixture();
  mixed.team.members.push('ordinary');
  await mixed.app.startRun(mixed.event);
  assert.deepEqual(mixed.costs, [['ordinary', '无尽秘钥', -1]]);
  assert.equal(mixed.players.ordinary.心神, 70);
  assert.equal(mixed.players.owner.心神, 0);
});

test('岁云无尽免票覆盖跨服加入，退出退款不凭空增加秘钥心神或周末次数', async () => {
  const f = fixture();
  f.weekend = true;
  const entry = await f.app.consumeCrossEndlessEntry('owner');
  assert.equal(entry.ok, true);
  assert.equal(entry.charge.suiyunFree, true);
  assert.equal(entry.charge.freeAvailable, false);
  assert.equal(entry.charge.keyDeducted, false);
  assert.equal(entry.charge.heartCost, 0);
  const ledger = { userId: 'owner', charge: entry.charge };
  await f.app.refundCrossEndlessEntry(ledger);
  await f.app.refundCrossEndlessEntry(ledger);
  assert.equal(f.tokens.owner.无尽秘钥, 0);
  assert.equal(f.players.owner.心神, 0);
  assert.equal(f.players.owner[access.WEEKEND_FREE_FIELD], undefined);
  assert.deepEqual(f.costs, []);
  assert.equal(f.heartCalls, 0);
});

test('普通角色和月华受赐者保留门票心神成本，周末免费仍仅用一次', async () => {
  const f = fixture();
  f.players.owner.灵根 = { name: '凡体' };
  f.players.owner.月华传承 = { 技能: ['霜剑入月', '岁云归一', '白云苍狗'] };
  assert.equal(access.hasSuiyunFreeEndlessEntry(f.players.owner), false);
  assert.equal((await f.app.consumeCrossEndlessEntry('owner')).ok, false);
  f.weekend = true;
  assert.equal((await f.app.consumeCrossEndlessEntry('owner')).ok, true);
  assert.equal(f.players.owner[access.WEEKEND_FREE_FIELD], 'fixture-week');
  assert.equal((await f.app.consumeCrossEndlessEntry('owner')).ok, false);
  f.tokens.owner.无尽秘钥 = 1;
  f.players.owner.心神 = 30;
  const charged = await f.app.consumeCrossEndlessEntry('owner');
  assert.equal(charged.ok, true);
  assert.equal(charged.charge.keyDeducted, true);
  assert.equal(f.players.owner.心神, 0);
});

test('无尽开局失败只退实扣费用；门槛未满足不因岁云免票而跳过', async () => {
  const f = fixture();
  f.team.members.push('ordinary');
  f.failRun = true;
  assert.match(await f.app.startRun(f.event), /开启失败/);
  assert.equal(f.players.owner.心神, 0);
  assert.equal(f.players.ordinary.心神, 100);
  assert.equal(f.tokens.ordinary.无尽秘钥, 1);
  assert.equal(f.tokens.owner.无尽秘钥, 0);
  const locked = fixture();
  locked.locked = true;
  assert.match(await locked.app.startRun(locked.event), /尚未解锁/);
  assert.equal(locked.costs.length, 0);
});

test('岁云扫荡免秘钥心神但仍需扫荡券；扫荡写入异常按实际扣费回滚', async () => {
  for (const fail of [false, true]) {
    const f = fixture();
    f.failWrite = fail;
    const reply = await f.app.sweepEndlessRealm(f.event);
    assert.equal(f.tokens.owner.无尽秘钥, 0);
    assert.equal(f.players.owner.心神, 0);
    assert.equal(f.heartCalls, 0);
    assert.equal(f.tokens.owner.无尽扫荡券, fail ? 1 : 0);
    assert.match(reply, fail ? /扫荡失败/ : /仅消耗【无尽扫荡券】/);
  }
  const f = fixture();
  f.tokens.owner.无尽扫荡券 = 0;
  assert.match(await f.app.sweepEndlessRealm(f.event), /扫荡券/);
  assert.equal(f.writes, 0);
});

test('批量扫荡和使用券入口兼容原单次指令，每张独立结算并汇总一条消息', async () => {
  const rule = source.match(/\{ reg: '([^']+)', fnc: 'sweepEndlessRealm' \}/)[1];
  for (const [msg, count] of [
    ['#扫荡无尽劫境', 1], ['#使用无尽扫荡券', 1],
    ['#扫荡无尽劫境*3', 3], ['#使用无尽扫荡券*3', 3],
    ['#扫荡无尽劫境 3', 3], ['#使用无尽扫荡券×3', 3],
  ]) {
    assert.ok(new RegExp(rule).test(msg), msg);
    const f = fixture();
    f.tokens.owner.无尽扫荡券 = 5;
    const reply = await f.app.sweepEndlessRealm({ ...f.event, msg });
    assert.match(reply, new RegExp(`扫荡次数：${count}次`));
    assert.equal(f.tokens.owner.无尽扫荡券, 5 - count);
    assert.equal(f.tokens.owner.无尽秘钥, 0);
    assert.equal(f.players.owner.心神, 0);
    assert.equal(f.heartCalls, 0);
    assert.equal(f.players.owner.无尽劫境扫荡次数, count);
    assert.equal(f.rewardCalls, count);
    assert.equal(f.players.owner.修为, 100 * count * (count + 1) / 2);
    assert.equal(f.players.owner.血气, 100 * count);
    assert.equal(f.players.owner.灵石, 100 * count);
    assert.equal(f.players.owner.源石, 10 * count);
    assert.equal(f.players.owner.劫境道痕, count);
    assert.equal(f.writes, 1);
  }
});

test('普通修士批量按次扣除秘钥和折后心神，源石按次取整，记忆模拟值按实际趟数结算', async () => {
  const f = fixture();
  Object.assign(f.players.owner, { 灵根: createMemoryRoot(1), 心神: 100, 模拟值: 0, 无尽劫境扫荡次数: 7 });
  f.effects = { 心神消耗减少: .15, 源石收益: .15 };
  f.tokens.owner = { 无尽秘钥: 5, 无尽扫荡券: 5 };
  const reply = await f.app.sweepEndlessRealm({ ...f.event, msg: '#扫荡无尽劫境*3' });
  assert.match(reply, /心神75点/);
  assert.equal(f.players.owner.心神, 25);
  assert.equal(f.heartCalls, 3);
  assert.equal(f.tokens.owner.无尽秘钥, 2);
  assert.equal(f.tokens.owner.无尽扫荡券, 2);
  assert.equal(f.players.owner.源石, 33);
  assert.equal(f.players.owner.模拟值, 6);
  assert.equal(f.players.owner.无尽劫境扫荡次数, 10);
  assert.deepEqual(f.players.owner.记忆命途.秘境记录, ['endless-sweep:owner:10']);
});

test('批量资源不足、无通关记录和正在闯关均在扣费前返回', async () => {
  for (const missing of ['key', 'ticket', 'heart', 'record', 'running']) {
    const f = fixture();
    Object.assign(f.players.owner, { 灵根: { name: '凡体' }, 心神: 100 });
    f.tokens.owner = { 无尽秘钥: 3, 无尽扫荡券: 3 };
    if (missing === 'key') f.tokens.owner.无尽秘钥 = 2;
    if (missing === 'ticket') f.tokens.owner.无尽扫荡券 = 2;
    if (missing === 'heart') f.players.owner.心神 = 89;
    if (missing === 'record') f.players.owner.无尽劫境最高层 = 0;
    if (missing === 'running') f.team.status = 'running';
    const before = copy({ players: f.players, tokens: f.tokens });
    const reply = await f.app.sweepEndlessRealm({ ...f.event, msg: '#扫荡无尽劫境*3' });
    assert.doesNotMatch(reply, /扫荡完成/);
    assert.deepEqual({ players: f.players, tokens: f.tokens }, before);
    assert.equal(f.costs.length, 0);
    assert.equal(f.writes, 0);
    assert.equal(f.rewardCalls, 0);
  }
});

test('批量输入验证及1000张边界，不接受零数、小数、负数和超大数量', async () => {
  for (const suffix of ['*0', '*-1', '*1.5', '*', '*abc', '*1001', '*9007199254740992', '*2*3', '*1e2']) {
    const f = fixture();
    const reply = await f.app.sweepEndlessRealm({ ...f.event, msg: `#使用无尽扫荡券${suffix}` });
    assert.match(reply, /用法/);
    assert.equal(f.costs.length, 0);
    assert.equal(f.writes, 0);
  }
  const f = fixture();
  f.tokens.owner.无尽扫荡券 = 1000;
  assert.match(await f.app.sweepEndlessRealm({ ...f.event, msg: '#使用无尽扫荡券*1000' }), /扫荡次数：1000次/);
  assert.equal(f.tokens.owner.无尽扫荡券, 0);
  assert.equal(f.rewardCalls, 1000);
});

test('批量扣券、心神中断或写入失败时全量退还实扣资源，奖励与计数恢复', async () => {
  for (const mode of ['ticket', 'heart', 'write', 'suiyun-write']) {
    const f = fixture();
    if (mode !== 'suiyun-write')
      Object.assign(f.players.owner, { 灵根: createMemoryRoot(1), 心神: 100, 模拟值: 0 });
    f.tokens.owner = { 无尽秘钥: 5, 无尽扫荡券: 5 };
    f.players.owner.无尽劫境扫荡次数 = 7;
    const before = copy({ players: f.players, tokens: f.tokens });
    if (mode === 'ticket') f.failItem = '无尽扫荡券';
    if (mode === 'heart') f.failHeartAt = 2;
    if (mode.endsWith('write')) f.failWrite = true;
    assert.match(await f.app.sweepEndlessRealm({ ...f.event, msg: '#扫荡无尽劫境*3' }), /扫荡失败，消耗已全部回滚/);
    assert.deepEqual({ players: f.players, tokens: f.tokens }, before);
  }
});
