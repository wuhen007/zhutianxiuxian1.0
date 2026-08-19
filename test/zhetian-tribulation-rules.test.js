import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  calculateXianguHorrorWavePower,
  calcXianguTribulationPower,
  canUseClowWish,
  getXianguUpperTribulationHorrorMultiplier,
  getReverseLifeTribulationWaves,
  XIANGU_UPPER_TRIBULATION_HORROR_MULTIPLIERS,
  XIANGU_TRIBULATION_BASE_ATK_SCALE,
  LEIDI_TRIBULATION_CONVERSION_RATE,
  LEIDI_TRIBULATION_CONVERSION_WAVES,
  resetTribulationGongfaCooldowns,
  ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS,
} from '../apps/User/zhetianTribulationRules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readLevelData(name) {
  return JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'resources', 'data', 'Level', name),
    'utf8',
  ));
}

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
  assert.equal(XIANGU_TRIBULATION_BASE_ATK_SCALE, 10);
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
    attack: 110000,
    equipmentMultiplier: 15,
    imperialMultiplier: 20,
  });
  assert.deepEqual(calcXianguTribulationPower({ xiangulevel_id: 9, mijinglevel_id: 5 }, levels), {
    attack: 234000,
    equipmentMultiplier: 30,
    imperialMultiplier: 40,
  });
  assert.deepEqual(calcXianguTribulationPower({ xiangulevel_id: 14, mijinglevel_id: 5 }, levels), {
    attack: 1064000,
    equipmentMultiplier: 105,
    imperialMultiplier: 140,
  });
});

test('天神破虚道起的仙古雷劫逐境叠加15至30倍恐怖威能', () => {
  assert.deepEqual(XIANGU_UPPER_TRIBULATION_HORROR_MULTIPLIERS, {
    11: 15,
    12: 20,
    13: 25,
    14: 30,
  });
  assert.deepEqual(
    [10, 11, 12, 13, 14, 15].map(getXianguUpperTribulationHorrorMultiplier),
    [1, 15, 20, 25, 30, 30],
  );
});

test('恐怖劫威按血量软限形成险死承压，终结道与后续境界更凶', () => {
  const ordinary = calculateXianguHorrorWavePower({
    baseDamage: 1_000_000,
    maxHp: 1_000,
    multiplier: 15,
  });
  const final = calculateXianguHorrorWavePower({
    baseDamage: 1_000_000,
    maxHp: 1_000,
    multiplier: 30,
    finalWave: true,
  });
  const legacy = calculateXianguHorrorWavePower({
    baseDamage: 123,
    maxHp: 1_000,
    multiplier: 1,
  });

  assert.equal(ordinary.rawDamage, 15_000_000);
  assert.equal(ordinary.capRate, 0.18);
  assert.ok(ordinary.damage > 179 && ordinary.damage <= 180);
  assert.equal(final.rawDamage, 30_000_000);
  assert.ok(Math.abs(final.capRate - 0.85) < 1e-12);
  assert.ok(Math.abs(final.damage - 850) < 1e-9);
  assert.ok(final.damage > ordinary.damage);
  assert.deepEqual(legacy, {
    multiplier: 1,
    rawDamage: 123,
    damage: 123,
    capRate: null,
    capped: false,
  });
});

test('生产数据下仙古上位劫原始峰值不低于遮天对标境界', () => {
  const levels = {
    Level_list: readLevelData('练气境界.json'),
    LevelMax_list: readLevelData('炼体境界.json'),
    Levelmijing_list: readLevelData('秘境体系.json'),
    xiangujinshi_list: readLevelData('仙古今世法.json'),
  };
  const maxAttack = list => Math.max(...list.map(level => Number(level.基础攻击) || 0));
  const commonBase = maxAttack(levels.Level_list) + maxAttack(levels.LevelMax_list);
  const profiles = [
    { from: 11, companion: 1, xianguPeak: 0.1452, zhetian: 11, zhetianPeak: 9.525 },
    { from: 12, companion: 5, xianguPeak: 0.0975, zhetian: 12, zhetianPeak: 53.1 },
    { from: 13, companion: 6, xianguPeak: 0.10795, zhetian: 13, zhetianPeak: 182.88 },
    { from: 14, companion: 7, xianguPeak: 0.142, zhetian: 14, zhetianPeak: 945 },
  ];

  for (const profile of profiles) {
    const xianguPower = calcXianguTribulationPower({
      xiangulevel_id: profile.from,
      mijinglevel_id: profile.companion,
    }, levels).attack;
    const zhetianRealm = levels.Levelmijing_list.find(
      level => Number(level.level_id) === profile.zhetian
    );
    const xianguRawPeak = xianguPower
      * profile.xianguPeak
      * getXianguUpperTribulationHorrorMultiplier(profile.from);
    const zhetianRawPeak = (commonBase + Number(zhetianRealm.基础攻击))
      * profile.zhetianPeak;

    assert.ok(
      xianguRawPeak >= zhetianRawPeak,
      `仙古${profile.from}级峰值 ${xianguRawPeak} 低于遮天${profile.zhetian}级 ${zhetianRawPeak}`,
    );
  }
});

test('生产配置下神火档最弱时代的第一道雷劫也达到千亿', () => {
  const power = calcXianguTribulationPower({ xiangulevel_id: 8, mijinglevel_id: 1 }, {
    Level_list: readLevelData('练气境界.json'),
    LevelMax_list: readLevelData('炼体境界.json'),
    Levelmijing_list: readLevelData('秘境体系.json'),
    xiangujinshi_list: readLevelData('仙古今世法.json'),
  });
  const mythEraFirstWave = Math.floor(power.attack * 0.07 * 1.03 * 0.8);
  const spiritlessFirstWave = Math.floor(power.attack * 0.07 * 1.03 * 1.5);

  assert.ok(mythEraFirstWave >= 100_000_000_000);
  assert.ok(spiritlessFirstWave > mythEraFirstWave);
});

test('雷帝宝术转化率降至四成并延长到四道雷劫', () => {
  assert.equal(LEIDI_TRIBULATION_CONVERSION_RATE, 0.4);
  assert.equal(LEIDI_TRIBULATION_CONVERSION_WAVES, 4);
});
