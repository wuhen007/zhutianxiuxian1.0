import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyXianguImperialWeaponDefense,
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

test('仙古渡劫只有本命帝兵按品阶概率提供常规减伤', () => {
  const player = { id: '10001' };
  const equipment = {
    帝兵: { name: '荒剑', author_name: '10001', 品阶: '至尊兵' },
  };
  const result = applyXianguImperialWeaponDefense(player, equipment, 100, () => 0);

  assert.equal(result.triggered, true);
  assert.equal(result.reductionRate, 0.51);
  assert.equal(result.rank, '至尊兵');
  assert.ok(Math.abs(result.damage - 49) < 1e-9);
  assert.equal(
    applyXianguImperialWeaponDefense(player, {
      帝兵: { ...equipment.帝兵, author_name: 'other' },
    }, 100, () => 0).triggered,
    false,
  );
});

test('仙古渡劫兼容遮天旧档位帝兵（极道帝兵自动对齐至尊兵）', () => {
  const player = { id: '10001' };
  const legacy = applyXianguImperialWeaponDefense(player, {
    帝兵: { name: '无始钟', author_name: '10001', 品阶: '极道帝兵' },
  }, 100, () => 0);
  assert.equal(legacy.triggered, true);
  assert.equal(legacy.reductionRate, 0.51);
  assert.equal(legacy.rank, '至尊兵');

  const zhanDao = applyXianguImperialWeaponDefense(player, {
    帝兵: { name: '诛仙剑', author_name: '10001', 品阶: '斩道王兵' },
  }, 100, () => 0);
  assert.equal(zhanDao.rank, '真神兵');
  assert.ok(Math.abs(zhanDao.reductionRate - 0.33) < 1e-9); // index 3 → 0.15 + 3*0.06

  const shengBing = applyXianguImperialWeaponDefense(player, {
    帝兵: { name: '玄黄塔', author_name: '10001', 品阶: '圣兵' },
  }, 100, () => 0);
  assert.equal(shengBing.rank, '天神兵');
  assert.ok(Math.abs(shengBing.reductionRate - 0.39) < 1e-9); // index 4 → 0.15 + 4*0.06
});

test('仙古渡劫首次致死前不触发功法被动，复活后避开当道雷劫', () => {
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
  assert.equal(result.avoided, true);
  assert.equal(player.生命本源, 0);
  assert.equal(player.当前血量, 50);
  assert.deepEqual(calls, ['revive']);
});

test('成功复活后的后续雷劫才触发功法被动', () => {
  const player = makePlayer({ 当前血量: 50 });
  const calls = [];

  const result = settleXianguWaveDamage({
    player,
    bodyDamage: 40,
    gongfaActive: true,
    tryRevive: () => null,
    applyGongfaReduction: () => {
      calls.push('reduce');
      return 30;
    },
  });

  assert.equal(result.dead, false);
  assert.equal(player.当前血量, 20);
  assert.deepEqual(calls, ['reduce']);
});

test('没有复活资源时不能靠未激活的功法被动避免死亡', () => {
  const player = makePlayer({ 生命本源: 0 });
  const calls = [];

  const result = settleXianguWaveDamage({
    player,
    bodyDamage: 40,
    tryRevive: () => null,
    applyGongfaReduction: () => {
      calls.push('reduce');
      return 30;
    },
  });

  assert.equal(result.dead, true);
  assert.equal(result.revival, null);
  assert.equal(player.当前血量, 0);
  assert.deepEqual(calls, []);
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
