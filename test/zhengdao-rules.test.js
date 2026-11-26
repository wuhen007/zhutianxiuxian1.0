import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ABOVE_ALL_DAOS_DIFFICULTY_MULTIPLIER,
  ABOVE_ALL_DAOS_PHYSIQUES,
  ZHENGDAO_ROUTES,
  getZhengdaoSuccessState,
  hasActiveZhengdaoProtection,
  resolveZhengdaoRoute,
} from '../apps/User/zhengdaoRules.js';

function playerWithPhysique(name, extra = {}) {
  return { 灵根: { name }, ...extra };
}

test('当世无天心印记时所有体质均走天心合道', () => {
  for (const name of [...Object.keys(ABOVE_ALL_DAOS_PHYSIQUES), '普通灵根']) {
    const result = resolveZhengdaoRoute(playerWithPhysique(name), false, 1000);
    assert.equal(result.route, ZHENGDAO_ROUTES.HEAVEN_HEART);
    assert.equal(result.difficultyMultiplier, 1);
  }
});

test('五种指定体质可在已有大帝时凌驾万道', () => {
  assert.deepEqual(Object.keys(ABOVE_ALL_DAOS_PHYSIQUES), [
    '大成·荒古圣体',
    '大成·苍天霸体',
    '先天圣体道胎',
    '混沌体',
    '先天混沌圣体道胎',
  ]);

  for (const name of Object.keys(ABOVE_ALL_DAOS_PHYSIQUES)) {
    const result = resolveZhengdaoRoute(playerWithPhysique(name), true, 1000);
    assert.equal(result.route, ZHENGDAO_ROUTES.ABOVE_ALL_DAOS);
    assert.equal(result.physique.name, name);
    assert.equal(
      result.difficultyMultiplier,
      ABOVE_ALL_DAOS_DIFFICULTY_MULTIPLIER
    );
  }
});

test('荒古圣体大成前不能自行凌驾万道', () => {
  for (const name of ['荒古圣体', '小成·荒古圣体']) {
    const result = resolveZhengdaoRoute(playerWithPhysique(name), true, 1000);
    assert.equal(result.route, ZHENGDAO_ROUTES.BLOCKED);
  }
});

test('有效护道状态允许普通体质成帝，过期状态无效', () => {
  const protectedPlayer = playerWithPhysique('普通灵根', { 护道状态: 2000 });
  assert.equal(hasActiveZhengdaoProtection(protectedPlayer, 1000), true);
  assert.equal(
    resolveZhengdaoRoute(protectedPlayer, true, 1000).route,
    ZHENGDAO_ROUTES.PROTECTED
  );

  const expiredPlayer = playerWithPhysique('普通灵根', { 护道状态: 1000 });
  assert.equal(hasActiveZhengdaoProtection(expiredPlayer, 1000), false);
  assert.equal(
    resolveZhengdaoRoute(expiredPlayer, true, 1000).route,
    ZHENGDAO_ROUTES.BLOCKED
  );
});

test('只有天心合道路线上授予天心印记', () => {
  assert.deepEqual(getZhengdaoSuccessState(ZHENGDAO_ROUTES.HEAVEN_HEART), {
    zhengdaoMethod: ZHENGDAO_ROUTES.HEAVEN_HEART,
    heavenHeartMark: 1,
  });
  assert.equal(
    getZhengdaoSuccessState(ZHENGDAO_ROUTES.ABOVE_ALL_DAOS).heavenHeartMark,
    0
  );
  assert.equal(
    getZhengdaoSuccessState(ZHENGDAO_ROUTES.PROTECTED).heavenHeartMark,
    0
  );
});
