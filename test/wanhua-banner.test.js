import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WANHUA_BANNER_NAME,
  WANHUA_MAIN_SOUL_CAP,
  WANHUA_SOUL_CAP,
  applyWanhuaBannerOpening,
  ensureWanhuaBannerState,
  recordWanhuaKill,
  rollWanhuaBannerActiveAttack,
} from '../model/wanhuaBanner.js';

function player(overrides = {}) {
  return {
    id: '1',
    名号: '万化魔主',
    灵根: { name: '无相·万化天魔体', type: '天魔' },
    攻击: 100,
    防御: 80,
    血量上限: 1000,
    当前血量: 1000,
    速度: 100,
    法球倍率: 5,
    吸血率: 0,
    穿透: 0,
    分身: [],
    ...overrides,
  };
}

const equipment = { 法宝: { name: WANHUA_BANNER_NAME } };

test('万灵魔幡状态会迁移并限制生魂与主魂上限', () => {
  const owner = player({ 万灵魔幡: { 生魂: 20000, 主魂: Array(15).fill({ sourceName: '天骄' }) } });
  const state = ensureWanhuaBannerState(owner);
  assert.equal(state.生魂, WANHUA_SOUL_CAP);
  assert.equal(state.主魂.length, WANHUA_MAIN_SOUL_CAP);
});

test('击杀生灵增加生魂，天骄额外炼为主魂且同一人不可重复', () => {
  const owner = player();
  const target = player({ id: '2', 名号: '绝世天骄', 攻击: 1000, 血量上限: 5000 });
  const first = recordWanhuaKill(owner, target, { now: 100 });
  const second = recordWanhuaKill(owner, target, { now: 200 });
  assert.equal(first.addedSoul, 1);
  assert.equal(first.addedMainSoul.sourceName, '绝世天骄');
  assert.equal(second.addedMainSoul, null);
  assert.equal(owner.万灵魔幡.生魂, 2);
  assert.equal(owner.万灵魔幡.主魂.length, 1);
});

test('9999魂和10主魂在开场完整生效', () => {
  const mainSouls = Array.from({ length: 10 }, (_, index) => ({
    sourceId: String(index + 2),
    sourceName: `天骄${index + 1}`,
    attack: 1000,
    defense: 800,
    hp: 5000,
    speed: 100,
    spellMultiplier: 3,
  }));
  const owner = player({ 万灵魔幡: { 生魂: 9999, 主魂: mainSouls } });
  const enemy = player({ id: 'enemy', 名号: '敌手' });
  const result = applyWanhuaBannerOpening(owner, enemy, equipment, { random: () => 0 });

  assert.equal(owner.攻击, 100 + 9999 * 20_000_000);
  assert.equal(owner.吸血率, 0.3);
  assert.equal(owner.穿透, 0.3);
  assert.equal(owner.神通伤害减免, 0.3);
  assert.equal(owner.元神伤害减免, 0.3);
  assert.equal(enemy.攻击, 75);
  assert.equal(result.companions.length, 1);
  assert.equal(result.companions[0].攻击, 350);
  assert.equal(result.companions[0].血量上限, 1750);
});

test('四千魂后主动元神攻击每场至多触发一次', () => {
  const owner = player({ 万灵魔幡: { 生魂: 4000, 主魂: [] } });
  const enemy = player({ id: 'enemy' });
  applyWanhuaBannerOpening(owner, enemy, equipment, { random: () => 0.9 });

  const active = rollWanhuaBannerActiveAttack(owner, enemy, { random: () => 0 });
  assert.ok(active.rawDamage > 0);
  assert.ok(active.actionBarReduction > 0);
  assert.equal(rollWanhuaBannerActiveAttack(owner, enemy, { random: () => 0 }), null);
});
