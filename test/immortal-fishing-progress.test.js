import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FISHING_PLANE_NAMES,
  getPlaneFishConfig,
  getPlaneFishAtlas,
  recordFishCatch,
} from '../model/immortalFishing.js';
import {
  claimImmortalFishingSign,
  consumeFishAtlasSets,
  getFishAtlasSetRewardBundle,
  getImmortalFishingDate,
  getPendingFishAtlasRewards,
  IMMORTAL_FISHING_SIGN_BAIT_POOL,
  markFishAtlasRewardsClaimed,
  rollSignBait,
} from '../model/immortalFishingProgress.js';

const sequence = values => () => values.shift();

test('垂纶签到按中国自然日幂等并在第七天潮头加赠', () => {
  const player = {};
  const first = Date.UTC(2026, 7, 1, 15, 59, 0);
  assert.equal(getImmortalFishingDate(first), '2026-08-01');
  assert.deepEqual(claimImmortalFishingSign(player, first, sequence([0, 0.4])), {
    claimed: true,
    alreadyClaimed: false,
    date: '2026-08-01',
    streak: 1,
    amount: 1,
    rewards: { hookAmount: 1, baits: [{ name: '神藏仙饵', amount: 1 }] },
  });
  assert.equal(claimImmortalFishingSign(player, first + 30 * 1000).alreadyClaimed, true);

  for (let day = 1; day <= 6; day++) {
    const result = claimImmortalFishingSign(player, first + day * 24 * 60 * 60 * 1000, sequence([0, 0.4]));
    assert.equal(result.streak, day + 1);
    assert.equal(result.amount, day === 6 ? 2 : 1);
    assert.equal(result.rewards.hookAmount, result.amount);
  }
  assert.equal(player.众生仙钓签到.total, 7);
});

test('众生仙钓断签后连续天数重置', () => {
  const player = {};
  const start = Date.UTC(2026, 7, 1, 16, 0, 0);
  claimImmortalFishingSign(player, start);
  const result = claimImmortalFishingSign(player, start + 2 * 24 * 60 * 60 * 1000);
  assert.equal(result.streak, 1);
  assert.equal(result.amount, 1);
  assert.equal(player.众生仙钓签到.total, 2);
});

test('旧鱼谱记录可以补领首次发现奖励且标记后不重复', () => {
  const player = {};
  recordFishCatch(player, '凡间', '青灵鲤', 3);
  recordFishCatch(player, '凡间', '吞舟玄龟');
  const pending = getPendingFishAtlasRewards(player);
  assert.deepEqual(pending.map(reward => [reward.key, reward.name, reward.amount]), [
    ['discovery:凡间:青灵鲤', '众生愿鳞', 1],
    ['discovery:凡间:吞舟玄龟', '众生愿鳞', 3],
  ]);
  markFishAtlasRewardsClaimed(player, pending);
  assert.deepEqual(getPendingFishAtlasRewards(player), []);
});

test('单个位面集齐一套兑换5仙钓+10愿鳞+2位面仙饵', () => {
  const player = {};
  for (const plane of FISHING_PLANE_NAMES) {
    const config = getPlaneFishConfig(plane);
    for (const fish of [...config.fish, config.king]) {
      recordFishCatch(player, plane, fish.name);
    }
  }
  const rewards = getPendingFishAtlasRewards(player);
  assert.equal(rewards.filter(reward => reward.key.startsWith('discovery:')).length, 28);
  const setRewards = rewards.filter(reward => reward.key.startsWith('set:'));
  assert.equal(setRewards.length, FISHING_PLANE_NAMES.length * 3); // 每套3项：5仙钓+10愿鳞+2位面饵
  for (const plane of FISHING_PLANE_NAMES) {
    const bundle = setRewards.filter(reward => reward.key === 'set:' + plane + ':1');
    assert.deepEqual(
      bundle.map(reward => [reward.name, reward.amount]).sort(),
      getFishAtlasSetRewardBundle(plane).map(reward => [reward.name, reward.amount]).sort()
    );
    assert.ok(bundle.every(reward => reward.consume === undefined
      || (reward.consume.plane === plane && reward.consume.amount === 1)));
    assert.equal(bundle.filter(reward => reward.consume).length, 1, '每套仅在首个奖励项上标记消耗');
  }
});

test('兑换套装消耗每种渔获各1条并记录次数，防止无限重复领取', () => {
  const player = {};
  const config = getPlaneFishConfig('凡间');
  for (const fish of [...config.fish, config.king]) {
    recordFishCatch(player, '凡间', fish.name, 3); // 每种3条 → 3套可用
  }
  const rewards = getPendingFishAtlasRewards(player);
  assert.equal(rewards.filter(reward => reward.key.startsWith('set:凡间:')).length, 9); // 3套×3项
  consumeFishAtlasSets(player, rewards);
  const atlas = getPlaneFishAtlas(player, '凡间');
  assert.ok(atlas.entries.every(entry => entry.count === 0), '兑换后每种渔获应各减3');
  assert.equal(player.众生鱼图鉴套装兑换.凡间, 3);
  assert.equal(
    getPendingFishAtlasRewards(player).filter(reward => reward.key.startsWith('set:')).length,
    0,
    '渔获耗尽后不再产生可领取套装'
  );
});

test('垂纶签到随机仙饵按权重抽取且数量在1~3之间', () => {
  assert.equal(rollSignBait(() => 0), '百草香饵');
  assert.equal(rollSignBait(() => 0.4), '神藏仙饵');
  assert.equal(rollSignBait(() => 0.99), '轮回冥饵');
  for (const bait of IMMORTAL_FISHING_SIGN_BAIT_POOL) {
    assert.ok(['百草香饵', '神藏仙饵', '矿髓沉饵', '因果道饵', '轮回冥饵'].includes(bait.name));
    assert.ok(bait.weight > 0);
  }
  // 数量区间：随机值0 → 1个；0.99 → 3个；同类合并
  const player = {};
  const first = Date.UTC(2026, 7, 1, 15, 59, 0);
  assert.deepEqual(claimImmortalFishingSign(player, first, sequence([0.99, 0.99, 0.99, 0.99])).rewards, {
    hookAmount: 1,
    baits: [{ name: '轮回冥饵', amount: 3 }],
  });
});

test('垂纶签到第7日潮头额外加赠仙钓与仙饵', () => {
  const player = {};
  const first = Date.UTC(2026, 7, 1, 15, 59, 0);
  for (let day = 0; day <= 5; day++) {
    claimImmortalFishingSign(player, first + day * 24 * 60 * 60 * 1000, sequence([0, 0.4]));
  }
  const seventh = claimImmortalFishingSign(player, first + 6 * 24 * 60 * 60 * 1000, sequence([0, 0.4]));
  assert.equal(seventh.streak, 7);
  assert.equal(seventh.amount, 2);
  assert.equal(seventh.rewards.hookAmount, 2);
  assert.equal(
    seventh.rewards.baits.reduce((sum, bait) => sum + bait.amount, 0),
    2,
    '第7日随机饵料数量额外+1'
  );
});