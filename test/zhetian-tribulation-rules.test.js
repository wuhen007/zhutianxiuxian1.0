import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CLOW_WISH_COSTS,
  CLOW_WISH_WEAKNESS_MS,
  calculateEmperorTribulationBaseDamage,
  calculateXianguHorrorWavePower,
  calcXianguTribulationPower,
  canUseClowWish,
  applyKingTribulationClowBacklash,
  consumeClowWishCosts,
  consumeKingTribulationClowWish,
  getClowWishWeaknessRemainingMs,
  getImmortalKingAssaultPlan,
  getKingToEmperorTribulationRatio,
  getXianguStageWaveCapRate,
  getXianguUpperTribulationHorrorMultiplier,
  inspectClowWishCosts,
  getReverseLifeTribulationWaves,
  XIANGU_UPPER_TRIBULATION_HORROR_MULTIPLIERS,
  XIANGU_STAGE_DAMAGE_BUDGET_RATE,
  XIANGU_TRIBULATION_BASE_ATK_SCALE,
  LEIDI_TRIBULATION_CONVERSION_RATE,
  LEIDI_TRIBULATION_CONVERSION_WAVES,
  resetTribulationGongfaCooldowns,
  ZHETIAN_EMPEROR_TRIBULATION_RATIOS,
  ZHETIAN_QUASI_EMPEROR_ERA_DIFFICULTY_RATES,
  ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS,
} from '../apps/User/zhetianTribulationRules.js';
import {
  applyClowWishBattleWeakness,
  CLOW_WISH_BATTLE_MULTIPLIER,
} from '../model/clowWish.js';

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

test('库洛牌祈愿精确扣除六项代价并施加48小时虚弱', () => {
  const now = 1_000_000;
  const player = {
    心神: 35,
    元神: 100_000_007,
    寿元: 9999,
    压制寿元: 1_000_000_123,
    修为: 10_000_000_011,
    血气: 10_000_000_013,
    仙道潜力: 1003,
  };

  assert.deepEqual(CLOW_WISH_COSTS, {
    心神: 30,
    元神: 100_000_000,
    寿元: 1_000_000_000,
    修为: 10_000_000_000,
    血气: 10_000_000_000,
    仙道潜力: 1000,
  });
  assert.equal(CLOW_WISH_WEAKNESS_MS, 48 * 60 * 60 * 1000);
  assert.equal(inspectClowWishCosts(player).ok, true);
  assert.equal(consumeClowWishCosts(player, now).ok, true);
  assert.deepEqual(player, {
    心神: 5,
    元神: 7,
    寿元: 123,
    压制寿元: 123,
    修为: 11,
    血气: 13,
    仙道潜力: 3,
    库洛牌祈愿虚弱至: now + CLOW_WISH_WEAKNESS_MS,
  });
  assert.equal(getClowWishWeaknessRemainingMs(player, now), CLOW_WISH_WEAKNESS_MS);
});

test('库洛牌祈愿资源不足时不扣款，虚弱期攻防速度减半', () => {
  const poor = { 心神: 29, 元神: 1, 寿元: 1, 修为: 1, 血气: 1, 仙道潜力: 1 };
  const snapshot = structuredClone(poor);
  assert.equal(consumeClowWishCosts(poor, 1000).ok, false);
  assert.deepEqual(poor, snapshot);

  const combatant = { 攻击: 101, 防御: 81, 速度: 121, 库洛牌祈愿虚弱至: 2000 };
  const active = applyClowWishBattleWeakness(combatant, 1000);
  assert.equal(CLOW_WISH_BATTLE_MULTIPLIER, 0.5);
  assert.equal(active.active, true);
  assert.deepEqual(combatant, { 攻击: 50, 防御: 40, 速度: 60, 库洛牌祈愿虚弱至: 2000 });

  const recovered = { 攻击: 101, 防御: 81, 速度: 121, 库洛牌祈愿虚弱至: 1000 };
  assert.equal(applyClowWishBattleWeakness(recovered, 1000).active, false);
  assert.equal(recovered.攻击, 101);
});

test('遮天各境界使用独立雷劫倍率', () => {
  assert.deepEqual(ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS, {
    斩道: 30,
    圣人: 45,
    圣人王: 60,
    大圣: 90,
    准帝: 120,
    大帝: 150,
    破王成帝: 320,
    逆活: 180,
  });
  assert.ok(ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.破王成帝 >= ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.大帝);
  assert.ok(getKingToEmperorTribulationRatio() >= 1);
});

test('破王成帝无视全部偏移，库洛牌强行祈愿触发反噬', () => {
  const target = { 库洛牌祈愿: { 来源: '123456', 区间偏移: -5 } };
  assert.deepEqual(consumeKingTribulationClowWish(target), { triggered: true, source: '123456' });
  assert.equal(target.库洛牌祈愿, undefined);

  const caster = { 当前血量: 101, 道伤: 2 };
  applyKingTribulationClowBacklash(caster);
  assert.deepEqual(caster, { 当前血量: 50, 道伤: 7 });

  const source = fs.readFileSync(path.join(__dirname, '..', 'apps', 'User', 'zhetiandujie.js'), 'utf8');
  const start = source.indexOf('async poWangChengDi');
  const end = source.indexOf('// 解除护法双向绑定', start);
  const kingTribulation = source.slice(start, end);
  assert.doesNotMatch(kingTribulation, /calcMaxAtkWithTribulationShifts/);
  assert.match(kingTribulation, /位面偏移、欺天阵纹与库洛牌祈愿均无法改变本次劫数/);
});

test('破王成帝第11道起持续遭遇诸王，第30道固定联手一击', () => {
  assert.deepEqual(getImmortalKingAssaultPlan(10, () => 0), { active: false, joint: false, count: 0 });
  assert.deepEqual(getImmortalKingAssaultPlan(11, () => 0), { active: true, joint: false, count: 1 });
  assert.deepEqual(getImmortalKingAssaultPlan(20, () => 0.999), { active: true, joint: false, count: 4 });
  for (let strike = 11; strike < 30; strike++) {
    const plan = getImmortalKingAssaultPlan(strike, () => (strike % 4) / 4);
    assert.equal(plan.active, true, `第${strike}道不应停歇`);
    assert.equal(plan.joint, false);
    assert.ok(plan.count >= 1 && plan.count <= 4);
  }
  assert.deepEqual(getImmortalKingAssaultPlan(30, () => 0), { active: true, joint: true, count: 8 });

  const source = fs.readFileSync(path.join(__dirname, '..', 'apps', 'User', 'zhetiandujie.js'), 'utf8');
  assert.match(source, /if \(broken > 10\)/);
  assert.match(source, /attackBySupremes\(player, diffRate, broken\)/);
  assert.match(source, /八大不朽之王·联手一击/);
  assert.match(source, /八王各附25%最大生命压制/);
  assert.match(source, /血量上限\)\s*\|\| 0\) \* 0\.25/);
  assert.match(source, /血量上限\)\s*\|\| 0\) \* 2/);
});

test('大帝劫三主阶段按准帝九重劫固定比例缩放', () => {
  assert.deepEqual(ZHETIAN_EMPEROR_TRIBULATION_RATIOS, {
    万道枷锁: 1.5,
    帝兵劫: 1.5,
    天道审判: 2.75,
  });

  const stageFactors = { 万道枷锁: 0.3, 帝兵劫: 2, 天道审判: 5 };
  for (const eraRate of ZHETIAN_QUASI_EMPEROR_ERA_DIFFICULTY_RATES) {
    const quasiDifficultyRate = eraRate * 3;
    for (const [stage, factor] of Object.entries(stageFactors)) {
      const quasiBaseDamage = 100 * factor * quasiDifficultyRate
        * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.准帝;
      assert.equal(calculateEmperorTribulationBaseDamage({
        maxAtk: 100,
        quasiDifficultyRate,
        stage,
      }), quasiBaseDamage * ZHETIAN_EMPEROR_TRIBULATION_RATIOS[stage]);
    }
  }

  assert.equal(calculateEmperorTribulationBaseDamage({
    maxAtk: 100,
    quasiDifficultyRate: 6,
    stage: '帝兵劫',
    routeDifficultyMultiplier: 1.5,
  }), 100 * 2 * 6 * 120 * 1.5 * 1.5);
});

test('七帝连战只在开战前回满一次，并定义恒宇大帝速度与功法', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'apps', 'User', 'zhetiandujie.js'), 'utf8');
  const attackSkills = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'resources', 'data', 'item', '技能组', '攻击技能.json'),
    'utf8',
  ));
  const defenseSkills = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'resources', 'data', 'item', '技能组', '防御技能.json'),
    'utf8',
  ));
  const gauntletStart = source.indexOf('// ==== 大帝意志阵列 ====');
  const loopStart = source.indexOf('for (const emperor of emperors)', gauntletStart);
  const loopEnd = source.indexOf('// 最终证道结果', loopStart);
  const emperorFactoryStart = source.indexOf('function createEmperorPlayer');
  const emperorFactoryEnd = source.indexOf('// 睡眠函数', emperorFactoryStart);
  const emperorFactory = source.slice(emperorFactoryStart, emperorFactoryEnd);

  assert.ok(gauntletStart >= 0 && loopStart > gauntletStart && loopEnd > loopStart);
  assert.match(source.slice(gauntletStart, loopStart), /player\.当前血量 = player\.血量上限;/);
  assert.doesNotMatch(source.slice(loopStart, loopEnd), /player\.当前血量 = player\.血量上限;/);
  assert.match(source, /name: "恒宇大帝"/);
  assert.match(emperorFactory, /速度: 100/);
  assert.match(emperorFactory, /"恒宇经", "恒宇炉·焚尽八荒", "恒宇炉护体"/);
  assert.equal(attackSkills.find(skill => skill.name === '恒宇炉·焚尽八荒')?.beilv, 5.2);
  assert.equal(defenseSkills.find(skill => skill.name === '恒宇炉护体')?.beilv, 0.45);
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

test('仙古连续劫数共享阶段伤害预算且末道保留更高权重', () => {
  assert.equal(XIANGU_STAGE_DAMAGE_BUDGET_RATE, 1.1);
  for (const waveCount of [3, 4, 5, 6]) {
    const rates = Array.from(
      { length: waveCount },
      (_, index) => getXianguStageWaveCapRate(index, waveCount),
    );
    const sum = rates.reduce((total, rate) => total + rate, 0);
    assert.ok(Math.abs(sum - XIANGU_STAGE_DAMAGE_BUDGET_RATE) < 1e-12);
    assert.ok(Math.abs(rates.at(-1) - rates[0] * 1.5) < 1e-12);
  }

  const lowRealmOrdinary = calculateXianguHorrorWavePower({
    baseDamage: 1_000_000,
    maxHp: 1_000,
    multiplier: 15,
    maxDamageRate: getXianguStageWaveCapRate(0, 3),
  });
  assert.equal(lowRealmOrdinary.capRate, 0.18);
});

test('至尊五道阶段在常驻减伤准备后存在完整生存路径', () => {
  const maxHp = 1_000_000;
  const waveCount = 5;
  const damages = Array.from({ length: waveCount }, (_, index) => {
    const wave = calculateXianguHorrorWavePower({
      baseDamage: 1_000_000_000,
      maxHp,
      multiplier: 30,
      finalWave: index === waveCount - 1,
      maxDamageRate: getXianguStageWaveCapRate(index, waveCount),
    });
    return wave.damage;
  });
  const total = damages.reduce((sum, damage) => sum + damage, 0);
  const unpreparedRemaining = maxHp - total;
  const preparedRemaining = maxHp - total * 0.9;

  assert.ok(total <= maxHp * XIANGU_STAGE_DAMAGE_BUDGET_RATE + 1e-6);
  assert.ok(unpreparedRemaining < 0);
  assert.ok(preparedRemaining > 0);
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
