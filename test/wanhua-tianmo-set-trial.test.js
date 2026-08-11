import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WANHUA_SET_ROUTES,
  applyWanhuaSetTrialResult,
  buildWanhuaSetTrialBattle,
  getWanhuaSetEligibility,
  getWanhuaSetPityMultiplier,
} from '../model/wanhuaTianmoSetTrial.js';

function player(overrides = {}) {
  return {
    id: '1',
    名号: '万化魔主',
    灵根: { name: '无相·万化天魔体', type: '天魔', 法球倍率: 5 },
    攻击: 1000,
    防御: 800,
    血量上限: 5000,
    当前血量: 5000,
    法球倍率: 5,
    速度: 100,
    mijinglevel_id: 18,
    xiangulevel_id: 0,
    学习的功法: ['天魔化生功'],
    ...overrides,
  };
}

test('万化套试炼完成九相、七蜕与三祭后依次授予三器', () => {
  const owner = player();
  assert.equal(getWanhuaSetEligibility(owner).ok, true);
  assert.equal(getWanhuaSetEligibility(player({ mijinglevel_id: 17 })).ok, false);

  let result;
  for (let i = 0; i < WANHUA_SET_ROUTES.blade.enemies.length; i++) {
    const battle = buildWanhuaSetTrialBattle(owner, 'blade');
    assert.equal(battle.ok, true);
    result = applyWanhuaSetTrialResult(owner, 'blade', true);
  }
  assert.equal(result.completedItem, '【万化】万相天魔刃');

  const offensive = buildWanhuaSetTrialBattle(owner, 'robe', '化万相');
  const defensive = buildWanhuaSetTrialBattle(owner, 'robe', '归无相');
  assert.ok(offensive.attacker.攻击 > defensive.attacker.攻击);
  assert.ok(defensive.attacker.防御 > offensive.attacker.防御);
  for (let i = 0; i < WANHUA_SET_ROUTES.robe.enemies.length; i++) {
    const choice = i % 2 ? '归无相' : '化万相';
    result = applyWanhuaSetTrialResult(owner, 'robe', true, choice);
  }
  assert.equal(result.completedItem, '【万化】无相魔神袍');
  assert.equal(owner.万化天魔套试炼.化相魔纹, 4);
  assert.equal(owner.万化天魔套试炼.无相道痕, 3);

  for (let i = 0; i < WANHUA_SET_ROUTES.banner.enemies.length; i++) {
    result = applyWanhuaSetTrialResult(owner, 'banner', true);
  }
  assert.equal(result.completedItem, '【万化】万灵魔幡');
  assert.equal(owner.万化天魔套试炼.阶段, 'complete');
});

test('万化试炼失败保留进度并每五败获得10%补正', () => {
  const owner = player();
  for (let i = 0; i < 5; i++) applyWanhuaSetTrialResult(owner, 'blade', false);
  assert.equal(owner.万化天魔套试炼.万相夺道, 0);
  assert.equal(getWanhuaSetPityMultiplier(owner.万化天魔套试炼), 1.1);
  assert.equal(buildWanhuaSetTrialBattle(owner, 'blade').attacker.攻击, 825);
});
