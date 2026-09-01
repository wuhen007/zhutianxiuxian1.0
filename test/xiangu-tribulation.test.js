import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  applyXianguImperialWeaponDefense,
  canBreakthroughXianguRealmHere,
  XIANGU_REALM_ROUTES,
  hasXianguGongfa,
  resolveXianguBreakthroughCommand,
  settleXianguWaveDamage,
} from '../apps/SecretPlace/xianguTribulationSettlement.js';

test('仙古真仙至帝光仙王必须身处仙域', () => {
  assert.equal(canBreakthroughXianguRealmHere({ power_place: 5 }, 15), true);
  assert.equal(canBreakthroughXianguRealmHere({ power_place: 5 }, 16), false);
  assert.equal(canBreakthroughXianguRealmHere({ power_place: '6' }, 16), true);
  assert.equal(canBreakthroughXianguRealmHere({ power_place: 5 }, 20), false);
  assert.equal(canBreakthroughXianguRealmHere({ power_place: 5 }, 21), true);
});

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

test('仙古渡劫首次致死前不触发功法被动，复活后避开当道雷劫', async () => {
  const player = makePlayer();
  const calls = [];

  const result = await settleXianguWaveDamage({
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

test('成功复活后的后续雷劫才触发功法被动', async () => {
  const player = makePlayer({ 当前血量: 50 });
  const calls = [];

  const result = await settleXianguWaveDamage({
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

test('没有复活资源时不能靠未激活的功法被动避免死亡', async () => {
  const player = makePlayer({ 生命本源: 0 });
  const calls = [];

  const result = await settleXianguWaveDamage({
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

test('遁一境的冲关与冲关极境都进入至尊路并在写档前升至15级', () => {
  for (const command of ['#冲关', '#冲关极境']) {
    const resolved = resolveXianguBreakthroughCommand(14, command.includes('极境'));
    assert.equal(resolved.type, 'realm');
    assert.equal(resolved.method, 'breakthroughUpperRealm');
    assert.equal(resolved.route.targetLevelId, 15);
    assert.equal(resolved.route.targetName, '至尊境');
  }

  assert.equal(resolveXianguBreakthroughCommand(12, true).method, 'breakthroughJiutianShidiExtreme');
  assert.equal(resolveXianguBreakthroughCommand(13, true).method, 'breakthroughZhanxianExtreme');

  const source = readFileSync(new URL('../apps/User/xiangujinshi.js', import.meta.url), 'utf8');
  const emperorGate = source.indexOf("canEnterQuasiEmperor(player, 'xiangu')");
  const routeDispatch = source.indexOf('const commandRoute = resolveXianguBreakthroughCommand');
  const start = source.indexOf('async breakthroughUpperRealm');
  const assignment = source.indexOf('player.xiangulevel_id = breakthrough.targetLevelId;', start);
  const persistence = source.indexOf('await Write_player(usr_qq, player);', assignment);
  assert.ok(emperorGate >= 0 && routeDispatch > emperorGate);
  assert.ok(start >= 0 && assignment > start && persistence > assignment);
});
