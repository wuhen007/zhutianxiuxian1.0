import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deleteActiveFishKing,
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
      king: { name: '吞舟玄龟', speedMultiplier: 0.75, skills: ['真龙宝术', '不灭经'] },
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