import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calcXianguTribulationPower,
  canUseClowWish,
  getReverseLifeTribulationWaves,
  LEIDI_TRIBULATION_CONVERSION_RATE,
  LEIDI_TRIBULATION_CONVERSION_WAVES,
  resetTribulationGongfaCooldowns,
  ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS,
} from '../apps/User/zhetianTribulationRules.js';

test('库洛牌祈愿仅允许小樱系列灵根', () => {
  for (const name of ['木之本樱', '星之杖·木之本樱', '梦之杖·木之本樱']) {
    assert.equal(canUseClowWish({ 灵根: { name } }), true);
  }
  assert.equal(canUseClowWish({ 灵根: { name: '鹿目圆' } }), false);
  assert.equal(canUseClowWish({}), false);
});

test('遮天各境界使用独立雷劫倍率', () => {
  assert.deepEqual(ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS, {
    斩道: 30,
    圣人: 45,
    圣人王: 60,
    大圣: 90,
    准帝: 120,
    大帝: 150,
    逆活: 180,
  });
});

test('逆活每多一世增加七道雷劫', () => {
  assert.equal(getReverseLifeTribulationWaves(1), 7);
  assert.equal(getReverseLifeTribulationWaves(5), 35);
  assert.equal(getReverseLifeTribulationWaves(9), 63);
});

test('每次重新渡劫时重置功法回合冷却', () => {
  const player = {
    功法: {
      者字秘: { 冷却回合: 7, 已触发次数: 1 },
      柳神法: { 冷却回合: 0 },
      被动功法: { 层数: 3 },
    },
  };

  resetTribulationGongfaCooldowns(player);

  assert.deepEqual(player.功法, {
    者字秘: { 冷却回合: 0, 已触发次数: 1 },
    柳神法: { 冷却回合: 0 },
    被动功法: { 层数: 3 },
  });
});

test('仙古上位雷劫按境界逐级提高装备与帝兵倍率', () => {
  const levels = {
    Level_list: [
      { level_id: 1, 基础攻击: 100 },
      { level_id: 64, 基础攻击: 300 },
    ],
    LevelMax_list: [
      { level_id: 1, 基础攻击: 50 },
      { level_id: 63, 基础攻击: 200 },
    ],
    Levelmijing_list: [{ level_id: 5, 基础攻击: 30 }],
    xiangujinshi_list: [
      { level_id: 8, 基础攻击: 70 },
      { level_id: 9, 基础攻击: 90 },
      { level_id: 14, 基础攻击: 190 },
    ],
  };

  assert.deepEqual(calcXianguTribulationPower({ xiangulevel_id: 8, mijinglevel_id: 5 }, levels), {
    attack: 11000,
    equipmentMultiplier: 15,
    imperialMultiplier: 20,
  });
  assert.deepEqual(calcXianguTribulationPower({ xiangulevel_id: 9, mijinglevel_id: 5 }, levels), {
    attack: 23400,
    equipmentMultiplier: 30,
    imperialMultiplier: 40,
  });
  assert.deepEqual(calcXianguTribulationPower({ xiangulevel_id: 14, mijinglevel_id: 5 }, levels), {
    attack: 106400,
    equipmentMultiplier: 105,
    imperialMultiplier: 140,
  });
});

test('雷帝宝术转化率降至四成并延长到四道雷劫', () => {
  assert.equal(LEIDI_TRIBULATION_CONVERSION_RATE, 0.4);
  assert.equal(LEIDI_TRIBULATION_CONVERSION_WAVES, 4);
});
