import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyEndlessChoice,
  createEndlessRun,
} from '../model/endlessRealm.js';
import {
  consumeEndlessWebTicket,
  createEndlessWebHttpServer,
  issueEndlessWebTicket,
  serializeEndlessWebState,
} from '../model/endlessWebServer.js';

class MemoryRedis {
  data = new Map();

  async set(key, value) {
    this.data.set(key, value);
    return 'OK';
  }

  async get(key) {
    return this.data.get(key) ?? null;
  }

  async getDel(key) {
    const value = await this.get(key);
    this.data.delete(key);
    return value;
  }

  async del(key) {
    return this.data.delete(key) ? 1 : 0;
  }

  async expire() {
    return true;
  }
}

function player(name) {
  return {
    名号: name,
    level_id: 20,
    Physique_id: 20,
    mijinglevel_id: 0,
    xiangulevel_id: 0,
  };
}

function fixture() {
  const run = createEndlessRun({
    teamId: '123456',
    groupId: 'group-1',
    seed: 9527,
    players: [{ id: '10001', player: player('荒古修士') }],
  });
  const team = {
    id: '123456',
    groupId: 'group-1',
    leader: '10001',
    status: 'running',
    members: ['10001'],
    memberNames: { 10001: '荒古修士' },
  };
  const realm = {
    async getTeam(id) {
      return id === team.id ? team : null;
    },
    async getRun(id) {
      return id === team.id ? run : null;
    },
    async chooseAbility(event) {
      const choice = Number(event.msg.match(/[1-4]$/)?.[0]);
      const result = applyEndlessChoice(run, '10001', choice);
      await event.reply(`${result.ability.name} Lv.${result.level}`);
    },
  };
  return { run, team, realm };
}

test('网页票据只能兑换一次', async () => {
  const redis = new MemoryRedis();
  const config = { ticketTtlSeconds: 120 };
  const identity = { rawUserId: '10001', userId: '10001', teamId: '123456', groupId: 'group-1' };
  const token = await issueEndlessWebTicket(redis, config, identity);
  assert.deepEqual(await consumeEndlessWebTicket(redis, token), identity);
  assert.equal(await consumeEndlessWebTicket(redis, token), null);
});

test('网页状态只暴露当前队伍需要的战斗数据', () => {
  const { run, team, realm } = fixture();
  run.members['10001'].bankedRewards = { cultivation: 123000, blood: 456000 };
  run.lastBattle = {
    layer: 1,
    world: '乱古界海',
    stage: 'normal',
    enemy: '搬血凶兽',
    victory: true,
    rounds: 3,
    layerReward: {
      lingshi: 100,
      sourceStone: 50,
      tokens: 10,
      members: { 10001: { cultivation: 3000, blood: 2000 } },
    },
  };
  const state = serializeEndlessWebState(realm, team, run, '10001');
  assert.equal(state.team.id, '123456');
  assert.equal(state.team.isLeader, true);
  assert.equal(state.members[0].name, '荒古修士');
  assert.equal(state.choices.length, 3);
  assert.equal(state.permissions.choose, true);
  assert.equal(state.permissions.advance, false);
  assert.equal(state.run.banked.cultivation, 123000);
  assert.equal(state.run.banked.blood, 456000);
  assert.equal(state.run.unbanked.blood, 0);
  assert.equal(state.battle.reward.cultivation, 3000);
  assert.equal(state.battle.reward.blood, 2000);
});

test('HTTP 会话可读取状态并提交能力选择', async t => {
  const redis = new MemoryRedis();
  const { run, realm } = fixture();
  const config = {
    publicUrl: 'http://127.0.0.1',
    ticketTtlSeconds: 120,
    sessionTtlSeconds: 3600,
  };
  const server = createEndlessWebHttpServer({ realm, redisClient: redis, config });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const token = await issueEndlessWebTicket(redis, config, {
    rawUserId: '10001', userId: '10001', teamId: '123456', groupId: 'group-1',
  });

  const page = await fetch(`${base}/endless`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /诸天无尽劫境/);

  const login = await fetch(`${base}/api/endless/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const replay = await fetch(`${base}/api/endless/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  assert.equal(replay.status, 401);

  const state = await fetch(`${base}/api/endless/state`, { headers: { Cookie: cookie } });
  assert.equal(state.status, 200);
  assert.equal((await state.json()).state.choices.length, 3);

  const action = await fetch(`${base}/api/endless/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ action: 'choose', value: 1 }),
  });
  assert.equal(action.status, 200);
  const result = await action.json();
  assert.match(result.message, /Lv\.1/);
  assert.equal(result.state.choices.length, 0);
  assert.equal(run.phase, 'ready');
});
