import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyLegacyShengxuPlane, migrateShengxuPlayer } from '../model/shengxuPlaneMigration.js';

test('legacy coord classification follows region bounds', () => {
  assert.equal(classifyLegacyShengxuPlane({ x: 100, y: 100 }), '小阴间'); // 地球
  assert.equal(classifyLegacyShengxuPlane({ x: 600, y: 100 }), '小阴间'); // 荧惑古星
  assert.equal(classifyLegacyShengxuPlane({ x: 200, y: 700 }), '小阴间'); // 小阴间星路
  assert.equal(classifyLegacyShengxuPlane({ x: 600, y: 700 }), '阳间'); // 阳间名山
  assert.equal(classifyLegacyShengxuPlane({ x: 850, y: 300 }), '阳间'); // 魂河古地
  assert.equal(classifyLegacyShengxuPlane(null), '小阴间');
  assert.equal(classifyLegacyShengxuPlane({}), '小阴间');
});

test('migrate moves power_place 7 to xiaoyinjian or yangjian with coord preserved', () => {
  const player = {
    power_place: 7,
    '圣墟位面坐标': { x: 120, y: 80 },
    记忆坐标: ['凡间', '圣墟位面'],
  };
  assert.equal(migrateShengxuPlayer(player), true);
  assert.equal(player.power_place, 4);
  assert.deepEqual(player['小阴间坐标'], { x: 120, y: 80 });
  assert.equal(player['圣墟位面坐标'], undefined);
  assert.deepEqual(player.记忆坐标, ['凡间', '小阴间']);
});

test('migrate routes yangjian coords to plane 7', () => {
  const player = {
    power_place: 7,
    '圣墟位面坐标': { x: 620, y: 700 },
    记忆坐标: ['圣墟位面'],
  };
  assert.equal(migrateShengxuPlayer(player), true);
  assert.equal(player.power_place, 7);
  assert.deepEqual(player['阳间坐标'], { x: 620, y: 700 });
  assert.deepEqual(player.记忆坐标, ['阳间']);
});

test('migrate is idempotent and ignores non-legacy players', () => {
  const normal = { power_place: 2, '遮天位面坐标': { x: 1, y: 1 } };
  assert.equal(migrateShengxuPlayer(normal), false);
  assert.equal(normal.power_place, 2);

  const player = { power_place: 7, '圣墟位面坐标': { x: 10, y: 10 } };
  assert.equal(migrateShengxuPlayer(player), true);
  assert.equal(migrateShengxuPlayer(player), false); // 已迁移，不再命中
});

test('migrate falls back to default coord when missing', () => {
  const player = { power_place: 7 };
  assert.equal(migrateShengxuPlayer(player), true);
  assert.equal(player.power_place, 4);
  assert.deepEqual(player['小阴间坐标'], { x: 250, y: 250 });
});
