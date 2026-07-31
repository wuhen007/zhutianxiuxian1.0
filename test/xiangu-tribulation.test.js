import assert from 'node:assert/strict';
import test from 'node:test';

import {
  XIANGU_REALM_ROUTES,
  hasXianguGongfa,
  settleXianguWaveDamage,
} from '../apps/SecretPlace/xianguTribulationSettlement.js';

function makePlayer(extra = {}) {
  return {
    名号: '测试修士',
    血量上限: 100,
    当前血量: 35,
    生命本源: 50,
    功法: { 者字秘: {} },
    ...extra,
  };
}

test('仙古渡劫先复活，再结算功法减伤和本次伤害', () => {
  const player = makePlayer();
  const calls = [];

  const result = settleXianguWaveDamage({
    player,
    bodyDamage: 40,
    tryRevive: () => {
      calls.push('revive');
      player.生命本源 -= 50;
      player.当前血量 = 50;
      return '功法复活·者字秘';
    },
    applyGongfaReduction: () => {
      calls.push('reduce');
      return 30;
    },
  });

  assert.equal(result.dead, false);
  assert.equal(result.revival, '功法复活·者字秘');
  assert.equal(result.revivedHp, 50);
  assert.equal(player.生命本源, 0);
  assert.equal(player.当前血量, 20);
  assert.deepEqual(calls, ['revive', 'reduce']);
});

test('没有复活资源时，功法减伤仍可避免致死', () => {
  const player = makePlayer({ 生命本源: 0 });

  const result = settleXianguWaveDamage({
    player,
    bodyDamage: 40,
    tryRevive: () => null,
    applyGongfaReduction: () => 30,
  });

  assert.equal(result.dead, false);
  assert.equal(result.revival, null);
  assert.equal(player.当前血量, 5);
});

test('仙古渡劫兼容长期存档和战斗态两种功法记录', () => {
  assert.equal(hasXianguGongfa({ 学习的功法: ['柳神法'] }, '柳神法'), true);
  assert.equal(hasXianguGongfa({ 功法: { 者字秘: {} } }, '者字秘'), true);
  assert.equal(hasXianguGongfa({ 学习的功法: [] }, '真凰宝术'), false);
});

test('仙古上位境界路由完整接通斩我、遁一和至尊', () => {
  assert.deepEqual(
    [12, 13, 14].map((levelId) => {
      const route = XIANGU_REALM_ROUTES[levelId];
      return [route.targetLevelId, route.targetName, route.tribulationMethod];
    }),
    [
      [13, '斩我境', '_runZhanwoTribulation'],
      [14, '遁一境', '_runDunyiTribulation'],
      [15, '至尊境', '_runZhizunTribulation'],
    ],
  );
});
