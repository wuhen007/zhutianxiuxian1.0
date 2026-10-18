import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as access from '../model/endlessAccess.js';
import { createSuiyunRoot } from '../model/suiyun.js';

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
    costs: [], heartCalls: 0, writes: 0,
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
      state.tokens[id][name] = (state.tokens[id][name] || 0) + amount;
      state.costs.push([id, name, amount]);
      assert.ok(state.tokens[id][name] >= 0);
    },
    refreshSpiritHeart: p => ({ current: p.心神, max: 100 }),
    getSpiritHeartMax: () => 100, getSpiritHeartCost: cost => cost,
    consumeSpiritHeart: (p, cost) => {
      state.heartCalls++;
      if (p.心神 < cost) return { ok: false };
      p.心神 -= cost; return { ok: true, cost };
    },
    getMinggeEffects: () => ({}),
    normalizeEndlessDifficultyTier: () => 1, canEnterEndlessDifficulty: () => !state.locked,
    formatEndlessDifficulty: () => 'A1', getDailyEndlessCelestial: () => ({ name: '天象', description: '测试' }),
    createEndlessRun: options => ({ id: 'test-run', lifeFire: 3, maxLifeFire: 3, difficultyTier: 1, celestialPhenomenon: options.celestialPhenomenon }),
    getWorldForLayer: () => ({ name: '测试世界', rule: '测试规则' }),
    getEndlessWebConfig: () => ({ enabled: false }), shouldAutoIssueEndlessWebTicket: () => false,
    getEndlessSweepReward: () => ({ startLayer: 1, endLayer: 10, layers: 10, cultivation: 100, blood: 100, lingshi: 100, sourceStone: 10, tokens: 1 }),
    calculateMinggeSourceGain: value => value, recordMemoryDungeon() {},
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
