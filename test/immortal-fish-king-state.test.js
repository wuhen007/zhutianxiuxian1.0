import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateFishKingRescueDamage,
  FISH_KING_RESCUE_CHANCE,
  rollFishKingRescue,
  deleteActiveFishKing,
  findFishKingByMemberId,
  listActiveFishKings,
  findFishKingByTeamId,
  readActiveFishKing,
  tryCreateFishKing,
} from '../model/immortalFishKing.js';

function createRedisMock() {
  const values = new Map();
  return {
    values,
    async get(key) {
      return values.get(String(key)) ?? null;
    },
    async set(key, value, options = {}) {
      key = String(key);
      if (options.NX && values.has(key)) return null;
      values.set(key, String(value));
      return 'OK';
    },
    async keys(pattern) {
      const prefix = String(pattern).replace(/\*$/, "");
      return [...values.keys()].filter(key => key.startsWith(prefix));
    },
    async del(key) {
      return values.delete(String(key)) ? 1 : 0;
    },
  };
}

test('鱼王队伍编号原子预占且创建失败不会遗留索引', async () => {
  const previousRedis = globalThis.redis;
  const mock = createRedisMock();
  globalThis.redis = mock;
  try {
    const input = {
      groupId: '10001',
      ownerId: '20001',
      ownerName: '垂钓者',
      plane: '凡间',
      king: { name: '吞舟玄龟', speed: 150, skills: ['真龙宝术', '不灭经'] },
      ownerPower: 100000,
    };
    const created = await tryCreateFishKing(input);
    assert.match(created.teamId, /^\d{6}$/);
    assert.equal((await findFishKingByTeamId(created.teamId)).id, created.id);

    assert.equal(await tryCreateFishKing(input), null);
    const teamKeys = [...mock.values.keys()].filter(key => key.startsWith('xiuxian:immortal-fish-king:team:'));
    assert.deepEqual(teamKeys, ['xiuxian:immortal-fish-king:team:' + created.teamId]);

    await deleteActiveFishKing(input.groupId);
    assert.equal(await findFishKingByTeamId(created.teamId), null);
  } finally {
    globalThis.redis = previousRedis;
  }
});

test('损坏或缺少有效期的鱼王状态会连同队伍索引一起清理', async () => {
  const previousRedis = globalThis.redis;
  const mock = createRedisMock();
  globalThis.redis = mock;
  try {
    const stateKey = 'xiuxian:immortal-fish-king:active:bad-group';
    const teamKey = 'xiuxian:immortal-fish-king:team:123456';
    await mock.set(stateKey, JSON.stringify({
      teamId: '123456',
      expiresAt: 'invalid',
      members: [{ id: '1', name: '测试' }],
      damage: {},
    }));
    await mock.set(teamKey, 'bad-group');
    assert.equal(await readActiveFishKing('bad-group'), null);
    assert.equal(await mock.get(stateKey), null);
    assert.equal(await mock.get(teamKey), null);
  } finally {
    globalThis.redis = previousRedis;
  }
});
test('鱼王列表可以枚举跨群队伍并按队员定位', async () => {
  const previousRedis = globalThis.redis;
  const mock = createRedisMock();
  globalThis.redis = mock;
  try {
    const first = await tryCreateFishKing({
      groupId: '10001',
      ownerId: '20001',
      ownerName: '甲',
      plane: '凡间',
      king: { name: '甲鱼王' },
      ownerPower: 100000,
    });
    const second = await tryCreateFishKing({
      groupId: '10002',
      ownerId: '20002',
      ownerName: '乙',
      plane: '仙界',
      king: { name: '乙鱼王' },
      ownerPower: 100000,
    });
    second.members.push({ id: '30001', name: '队员' });
    await mock.set('xiuxian:immortal-fish-king:active:10002', JSON.stringify(second));

    const states = await listActiveFishKings();
    assert.deepEqual(states.map(state => state.groupId).sort(), ['10001', '10002']);
    assert.equal((await findFishKingByMemberId('30001')).teamId, second.teamId);
    assert.equal((await findFishKingByMemberId('99999')), null);
  } finally {
    globalThis.redis = previousRedis;
  }
});

test('讨伐失败救场合计3%且两人各占一半，伤害为最大生命20%', () => {
  assert.equal(FISH_KING_RESCUE_CHANCE, 0.03);
  assert.equal(rollFishKingRescue(() => 0).id, 'rumeng');
  assert.equal(rollFishKingRescue(() => 0.014999).id, 'rumeng');
  assert.equal(rollFishKingRescue(() => 0.015).id, 'moxiaoyu');
  assert.equal(rollFishKingRescue(() => 0.029999).id, 'moxiaoyu');
  assert.equal(rollFishKingRescue(() => 0.03), null);

  const state = { health: 900000, healthMax: 1000000 };
  assert.equal(calculateFishKingRescueDamage(state, rollFishKingRescue(() => 0)), 200000);
  assert.equal(calculateFishKingRescueDamage({ health: 50000, healthMax: 1000000 }, { damageRatio: 0.2 }), 50000);
});
