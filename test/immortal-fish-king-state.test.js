import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateFishKingCultivationReward,
  calculateFishKingRescueDamage,
  createFishKingKillRewardBundle,
  FISH_KING_CHEST_GROUPS,
  FISH_KING_CHEST_ITEMS,
  FISH_KING_CHEST_REWARD_CHANCE,
  FISH_KING_CHEST_WISH_SCALE,
  FISH_KING_KILL_CULTIVATION_BASE,
  FISH_KING_KILL_LINGSHI,
  FISH_KING_KILL_REWARD_ITEMS,
  FISH_KING_KILL_SOURCE_STONE,
  FISH_KING_RESCUE_CHANCE,
  rollFishKingChestReward,
  rollFishKingRescue,
  deleteActiveFishKing,
  findFishKingByMemberId,
  listActiveFishKings,
  findFishKingByTeamId,
  readActiveFishKing,
  tryCreateFishKing,
} from '../model/immortalFishKing.js';

test('鱼王击杀与宝箱奖励配置符合设定', () => {
  assert.equal(FISH_KING_KILL_LINGSHI, 25_000_000);
  assert.equal(FISH_KING_KILL_SOURCE_STONE, 25_000_000);
  assert.equal(FISH_KING_KILL_CULTIVATION_BASE, 20_000_000);
  assert.deepEqual(FISH_KING_KILL_REWARD_ITEMS, [
    { name: '遣龙令', class: '道具', min: 1, max: 5 },
    { name: '超越宝盒', class: '盒子', min: 1, max: 5 },
    { name: '遣虎令', class: '道具', min: 1, max: 5 },
    { name: '遗珍', special: 'relic', amount: 1 },
    { name: '随机饵料', special: 'bait', min: 1, max: 3 },
    { name: '一叶轻舟', class: '道具', amount: 1 },
    { name: '群星秘钥', class: '道具', min: 1, max: 3 },
    { name: '仙舟', class: '道具', min: 1, max: 5 },
  ]);
  assert.equal(FISH_KING_CHEST_REWARD_CHANCE, 0.55);
  assert.deepEqual(FISH_KING_CHEST_ITEMS, [
    { name: '无尽扫荡券', class: '道具', min: 1, max: 3 },
    { name: '定神丹', class: '丹药', min: 1, max: 5 },
    { name: '群星秘钥', class: '道具', min: 1, max: 6 },
    { name: '超越宝盒', class: '盒子', min: 3, max: 10 },
    { name: '众生仙钓', class: '道具', min: 2, max: 10 },
    { name: '随机饵料', special: 'bait', min: 2, max: 10 },
    { name: '一叶轻舟', class: '道具', min: 1, max: 3 },
    { name: '界河灵舟', class: '道具', amount: 1 },
    { name: '仙舟', class: '道具', min: 3, max: 5 },
  ]);
  assert.deepEqual(FISH_KING_CHEST_WISH_SCALE, { min: 15, max: 30 });
});

test('鱼王击杀奖池为每人不放回抽取三组', () => {
  const state = {
    id: 'reward-test',
    plane: '凡间',
    members: [{ id: '1', name: '甲' }, { id: '2', name: '乙' }],
  };
  const rewards = createFishKingKillRewardBundle(state, () => 0);
  assert.equal(rewards.assignments.length + rewards.relicRewards.length, 6);
  assert.deepEqual(
    rewards.assignments.map(item => [item.recipient.id, item.name, item.amount]),
    [
      ['1', '遣龙令', 1],
      ['1', '超越宝盒', 1],
      ['1', '遣虎令', 1],
      ['2', '遣龙令', 1],
      ['2', '超越宝盒', 1],
      ['2', '遣虎令', 1],
    ]
  );
});

test('鱼王击杀抽到遗珍时仍只占一组奖励', () => {
  const rewards = createFishKingKillRewardBundle({
    id: 'relic-test',
    plane: '仙域',
    members: [{ id: '1', name: '甲' }],
  }, () => 0.45);
  assert.equal(rewards.assignments.length + rewards.relicRewards.length, 3);
  assert.equal(rewards.relicRewards.length, 1);
  assert.match(rewards.relicRewards[0].relic.id, /^fish-king-relic:relic-test:1:/);
});

test('鱼王宝箱触发时抽五组且愿鳞保底，未触发时仍有愿鳞', () => {
  const hit = rollFishKingChestReward(() => 0);
  assert.equal(hit.length, FISH_KING_CHEST_GROUPS + 1);
  assert.deepEqual(hit.slice(0, 5).map(item => item.name), [
    '无尽扫荡券', '定神丹', '群星秘钥', '超越宝盒', '众生仙钓',
  ]);
  assert.deepEqual(hit.at(-1), { name: '众生愿鳞', class: '道具', amount: 15 });

  const miss = rollFishKingChestReward(() => 1);
  assert.deepEqual(miss, [{ name: '众生愿鳞', class: '道具', amount: 30 }]);
});

test('鱼王修为血气奖励按五体系等级乘积计算且缺失等级按一计算', () => {
  assert.equal(calculateFishKingCultivationReward({
    level_id: 2,
    Physique_id: 3,
    mijinglevel_id: 4,
    xiangulevel_id: 5,
    huafenlevel_id: 6,
  }), 14_400_000_000);
  assert.equal(calculateFishKingCultivationReward({}), 20_000_000);
});

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
