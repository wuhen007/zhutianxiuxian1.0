import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DAO_HEART_FRUITS,
  DAO_HEART_MAX,
  DAO_HEART_RECOVERY_INTERVAL_MS,
  applyDaoHeartFruit,
  adjustDaoHeart,
  ensureDaoHeart,
  getDaoHeartDamageMultiplier,
  getDaoHeartLearningChanceMultiplier,
  getDaoHeartStage,
  getReverseLifeCostProfile,
} from '../model/daoHeart.js';

test('道心默认100、旧字段同步、自然恢复每30分钟一点', () => {
  const player = { 道心值: 100, 道心上次恢复时间: DAO_HEART_RECOVERY_INTERVAL_MS };
  assert.equal(ensureDaoHeart(player, DAO_HEART_RECOVERY_INTERVAL_MS * 3), 102);
  assert.equal(player.道心, 102);
  assert.equal(player.道心值, 102);
});

test('道心调整会限制在0到500并记录原因', () => {
  const player = {};
  assert.equal(ensureDaoHeart(player), 100);
  assert.equal(adjustDaoHeart(player, 999, '战胜天骄').after, DAO_HEART_MAX);
  assert.equal(getDaoHeartStage(player).key, '圆满');
  assert.equal(adjustDaoHeart(player, -999, '渡劫失败').after, 0);
  assert.equal(player.道心变动记录.at(-1).reason, '渡劫失败');
});

test('低道心会提高承劫伤害、降低学习成功率', () => {
  const full = { 道心: 500 };
  const damaged = { 道心: 0 };
  assert.equal(getDaoHeartDamageMultiplier(full), 1);
  assert.equal(getDaoHeartDamageMultiplier(damaged), 1.8);
  assert.ok(getDaoHeartLearningChanceMultiplier(damaged) < getDaoHeartLearningChanceMultiplier(full));
});

test('逆活九世成本随世数、时代阶段和低道心递增', () => {
  const player = { 道心: 100 };
  const first = getReverseLifeCostProfile(player, 1, 0);
  const later = getReverseLifeCostProfile(player, 3, 2);
  assert.ok(later.stageCount > first.stageCount);
  assert.ok(later.multiplier > first.multiplier);
  assert.ok(later.potential > first.potential);
  assert.ok(later.spirit > first.spirit);
  assert.ok(later.lifespan > first.lifespan);
});

test('道心果品阶数值与上限一致', () => {
  assert.deepEqual(DAO_HEART_FRUITS, {
    凡品道心果: 3,
    玄品道心果: 8,
    灵品道心果: 15,
    仙品道心果: 25,
    圣品道心果: 40,
    帝品道心果: 100,
  });
});

test('服用道心果只消耗达到上限所需数量', () => {
  const now = 123456;
  const player = { 道心: 480, 道心上次恢复时间: now };
  const result = applyDaoHeartFruit(player, { name: '灵品道心果' }, 5, now);

  assert.equal(result.useCount, 2);
  assert.equal(result.change, 20);
  assert.equal(player.道心, DAO_HEART_MAX);
  assert.equal(applyDaoHeartFruit(player, { name: '帝品道心果' }, 1, now).useCount, 0);
});
