import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  applyInitialMinggeEffects,
  applyMinggeFourRealmMultipliers,
  buildMinggeAtlasData,
  calculateMinggeChance,
  calculateMinggeCost,
  calculateMinggeFourRealmBonus,
  calculateMinggeGain,
  calculateMinggePotentialCost,
  calculateMinggeSourceGain,
  calculateMinggeYield,
  drawMingge,
  formatMinggeDrawMessage,
  getMinggeBonusMultiplier,
  getMinggeDirectMultiplier,
  getMinggeEffects,
  getMinggeSecretPlaceReductionMs,
  hasPlayerMingge,
  MINGGE_EFFECT_REGISTRY,
} from '../model/mingge.js';

const configuredMinggeList = JSON.parse(
  fs.readFileSync(new URL('../resources/data/item/命格词条.json', import.meta.url), 'utf8')
);

function sequenceRandom(values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

const minggeList = [
  {
    id: 'positive_normal',
    name: '凡星照命',
    rarity: 1,
    rarityName: '普通',
    category: '战斗',
    desc: '凡星亦可照亮前路。',
    effects: { 攻击加成: 0.1 },
  },
  {
    id: 'positive_legendary',
    name: '万古唯一',
    rarity: 3,
    rarityName: '传说',
    category: '特殊',
    desc: '诸天唯一的命数。',
    effects: { 生命加成: 0.2 },
  },
  {
    id: 'negative_rare',
    name: '道厄缠身',
    rarity: 2,
    rarityName: '稀有',
    category: '修炼',
    isNegative: true,
    severity: 2,
    desc: '大道有缺，前路多劫。',
    effects: { 修炼加成: -0.2 },
  },
];

test('命格抽取先判定正负面，再按稀有度权重选择', () => {
  const legendary = drawMingge(minggeList, {
    random: sequenceRandom([0.5, 0.99, 0]),
  });
  assert.equal(legendary.id, 'positive_legendary');

  const negative = drawMingge(minggeList, {
    random: sequenceRandom([0.01, 0.5, 0]),
  });
  assert.equal(negative.id, 'negative_rare');
});

test('命格身份写入存档且一次性效果不会重复叠加', () => {
  const player = {
    仙道潜力: 0,
    生命本源: 100,
    寿元: 99,
    速度: 100,
    心神: 30,
    心神额外上限: 0,
  };
  const mingge = {
    ...minggeList[0],
    effects: {
      仙道潜力额外: 50,
      生命本源额外: 20,
      寿元额外: -10,
      速度: 30,
      心神额外上限: 5,
    },
  };

  applyInitialMinggeEffects(player, mingge, 1000);
  applyInitialMinggeEffects(player, mingge, 2000);

  assert.equal(player.命格.id, mingge.id);
  assert.equal(player.命格.obtainedAt, 1000);
  assert.equal(player.命格.初始效果已应用, true);
  assert.equal(player.仙道潜力, 50);
  assert.equal(player.生命本源, 120);
  assert.equal(player.寿元, 89);
  assert.equal(player.速度, 130);
  assert.equal(player.心神额外上限, 5);
  assert.equal(player.心神, 35);
  assert.deepEqual(getMinggeEffects(player, [mingge]), mingge.effects);
});

test('心神与源石命格配置完整，源石收益只放大正向奖励', () => {
  const byId = new Map(configuredMinggeList.map(item => [item.id, item]));
  for (const id of [
    'calm_spirit',
    'glazed_spirit_platform',
    'immortal_divine_will',
    'source_affinity',
    'earth_vein_favored',
    'source_heaven_eye',
    'fractured_spirit',
    'source_cursed',
  ]) {
    assert.ok(byId.has(id), `缺少命格：${id}`);
  }

  assert.equal(calculateMinggeSourceGain(1000, { 源石收益: 0.5 }), 1500);
  assert.equal(calculateMinggeSourceGain(1000, { 源石收益: -0.2 }), 800);
  assert.equal(calculateMinggeSourceGain(-1000, { 源石收益: 0.5 }), -1000);
});

test('独立抽取命格时兼容识别新旧存档且空存档允许抽取', () => {
  assert.equal(hasPlayerMingge({}), false);
  assert.equal(hasPlayerMingge({ 命格: '' }), false);
  assert.equal(hasPlayerMingge({ 命格: '凡星照命' }), true);
  assert.equal(hasPlayerMingge({ 命格: { id: 'positive_normal' } }), true);
});

test('命格图鉴完整分组配置并标记玩家当前命格', () => {
  const current = configuredMinggeList[0];
  const additional = configuredMinggeList[1];
  const atlas = buildMinggeAtlasData(configuredMinggeList, {
    命格: { id: current.id, name: current.name },
    附加命格: [{ id: additional.id, name: additional.name }],
    命格词条上限: 3,
  });
  const entries = atlas.groups.flatMap(group => group.items);

  assert.equal(atlas.summary.total, configuredMinggeList.length);
  assert.equal(entries.length, configuredMinggeList.length);
  assert.deepEqual(entries.filter(item => item.isCurrent).map(item => item.id), [current.id, additional.id]);
  assert.equal(atlas.currentCount, 2);
  assert.equal(atlas.fateLimit, 3);
  assert.match(atlas.currentName, new RegExp(`${current.name}.*${additional.name}`));
  assert.equal(atlas.summary.negative, configuredMinggeList.filter(item => item.isNegative).length);
  assert.equal(buildMinggeAtlasData(configuredMinggeList).currentName, '尚未显化');
});

test('攻防生命命格只按四体系基础总和计算独立增量', () => {
  const fourRealmBase = { 攻击: 1000, 防御: 800, 血量: 5000 };
  const effects = { 攻击加成: 0.2, 防御加成: -0.1, 生命加成: 0.15 };

  assert.deepEqual(calculateMinggeFourRealmBonus(fourRealmBase, effects), {
    攻击: 200,
    防御: -80,
    血量: 750,
  });
  assert.deepEqual(applyMinggeFourRealmMultipliers(fourRealmBase, effects), {
    攻击: 1200,
    防御: 720,
    血量: 5750,
  });

  const fixedAttack = 500;
  assert.equal(fourRealmBase.攻击 + fixedAttack + 200, 1700);
  assert.notEqual((fourRealmBase.攻击 + fixedAttack) * 1.2, 1700);
});

test('开局文案区分传说命格与负面厄命', () => {
  const positiveMessage = formatMinggeDrawMessage(minggeList[1], '无名');
  assert.match(positiveMessage, /诸天星海骤然黯淡/);
  assert.match(positiveMessage, /命格：【万古唯一】/);
  assert.match(positiveMessage, /生命加成：\+20%/);

  const negativeMessage = formatMinggeDrawMessage(minggeList[2], '无名');
  assert.match(negativeMessage, /命宫染煞/);
  assert.match(negativeMessage, /厄命深重/);
  assert.match(negativeMessage, /修炼加成：-20%/);
});

test('签到采用直接倍率，炼器采用增减倍率', () => {
  const positive = {
    签到奖励倍率: 2,
    炼器成功率: 0.35,
    炼制装备加成: 0.25,
  };
  const negative = {
    签到奖励倍率: 0.5,
    炼器成功率: -0.1,
  };

  assert.equal(getMinggeDirectMultiplier(positive, '签到奖励倍率'), 2);
  assert.equal(getMinggeDirectMultiplier(negative, '签到奖励倍率'), 0.5);
  assert.equal(getMinggeDirectMultiplier({}, '签到奖励倍率'), 1);
  assert.equal(getMinggeBonusMultiplier(positive, '炼器成功率'), 1.35);
  assert.equal(getMinggeBonusMultiplier(positive, '炼制装备加成'), 1.25);
  assert.equal(getMinggeBonusMultiplier(negative, '炼器成功率'), 0.9);
});

test('悟道命格覆盖普通、稀有、传说和负面效果', () => {
  const byId = new Map(configuredMinggeList.map(item => [item.id, item]));
  const common = byId.get('wisdom_awakening');
  const rare = byId.get('clear_dao_mind');
  const legendary = byId.get('born_close_to_dao');
  const negative = byId.get('clouded_spiritual_mind');

  assert.equal(common?.effects?.悟道收益, 0.1);
  assert.equal(rare?.effects?.顿悟概率, 0.05);
  assert.equal(legendary?.effects?.悟道寿元消耗减少, 0.15);
  assert.equal(negative?.isNegative, true);
  assert.equal(negative?.effects?.悟道寿元消耗增加, 0.15);
  assert.equal(getMinggeBonusMultiplier(negative.effects, '悟道收益'), 0.8);
});

test('配置中的每个命格效果都有消费契约', () => {
  const configuredKeys = new Set(
    configuredMinggeList.flatMap(item => Object.keys(item.effects || {}))
  );
  assert.deepEqual(
    [...configuredKeys].filter(key => !MINGGE_EFFECT_REGISTRY[key]),
    []
  );
});

test('通用消费原语支持收益、概率、产出和正负面成本', () => {
  assert.equal(calculateMinggeGain(100, { 修炼加成: 0.25 }, '修炼加成'), 125);
  assert.equal(calculateMinggeGain(-100, { 修炼加成: 0.25 }, '修炼加成'), -100);
  assert.ok(
    Math.abs(calculateMinggeChance(0.7, { 境界突破成功率: 0.2 }, '境界突破成功率') - 0.9) < Number.EPSILON
  );
  assert.equal(calculateMinggeChance(0.9, { 境界突破成功率: 0.2 }, '境界突破成功率'), 1);
  assert.equal(calculateMinggeYield(1, { 制符加成: 0.15 }, '制符加成', () => 0.1), 2);
  assert.equal(calculateMinggeYield(1, { 制符加成: 0.15 }, '制符加成', () => 0.2), 1);
  assert.equal(
    calculateMinggeCost(100, { 修复道伤代价减少: 0.35 }, '修复道伤代价减少', '修复道伤代价增加'),
    65
  );
  assert.equal(
    calculateMinggeCost(100, { 修复道伤代价增加: 0.25 }, '修复道伤代价减少', '修复道伤代价增加'),
    125
  );
  assert.equal(calculateMinggePotentialCost(8, { 仙道潜力消耗减少: 0.1 }), 7);
});

test('内景地消费层：彼岸教祖提供 开启概率+40% / 收益+0.3 / 消耗倍率0.8', () => {
  // 1) 普通命格（无内景地相关词条）→ 三项均为默认
  const commonPlayer = { 命格: { id: 'positive_normal', name: '凡星照命' } };
  const commonEffect = getMinggeEffects(commonPlayer, minggeList);
  assert.ok(Math.abs(calculateMinggeChance(0.1, commonEffect, '内景地开启概率', { max: 1 }) - 0.1) < 1e-9, '普通命格开启概率不应被加成');
  assert.equal(getMinggeBonusMultiplier(commonEffect, '内景地收益'), 1, '普通命格收益倍率应为 1');
  assert.equal(getMinggeDirectMultiplier(commonEffect, '内景地消耗倍率'), 1, '普通命格消耗倍率应为 1');

  // 2) 玩家有「彼岸教祖」(传说·特殊)
  const shorePlayer = {
    命格: {
      id: 'shore_patriarch',
      name: '彼岸教祖',
      rarity: 3,
      rarityName: '传说',
      category: '特殊',
    },
  };
  const shoreMinggeList = [
    ...minggeList,
    {
      id: 'shore_patriarch',
      name: '彼岸教祖',
      rarity: 3,
      rarityName: '传说',
      category: '特殊',
      desc: '前世乃彼岸大教之教祖，可开启内景地，自成一界修行。',
      effects: {
        内景地开启概率: 0.40,
        内景地收益: 0.3,
        内景地消耗倍率: 0.80,
        修炼加成: 0.20,
        生命加成: 0.15,
        境界突破成功率: 0.10,
      },
    },
  ];
  const shoreEffect = getMinggeEffects(shorePlayer, shoreMinggeList);
  // 开启概率：基础 0.1 + 命格 0.4 = 0.5
  assert.ok(Math.abs(calculateMinggeChance(0.1, shoreEffect, '内景地开启概率', { max: 1 }) - 0.5) < 1e-9, '开启概率应 +0.4（0.1→0.5）');
  // 收益：×(1+0.3)=1.3
  assert.ok(Math.abs(getMinggeBonusMultiplier(shoreEffect, '内景地收益') - 1.3) < 1e-9, '收益应 ×1.3');
  // 消耗倍率：0.8
  assert.equal(getMinggeDirectMultiplier(shoreEffect, '内景地消耗倍率'), 0.8, '消耗倍率应为 0.8');
  // 其它词条保持
  assert.equal(shoreEffect.修炼加成, 0.20);
  assert.equal(shoreEffect.生命加成, 0.15);
  assert.equal(shoreEffect.境界突破成功率, 0.10);
});

test('拓展命宫后，多条命格的持续效果会合并生效', () => {
  const player = {
    命格: { id: 'positive_normal' },
    附加命格: [{ id: 'positive_legendary' }],
    命格词条上限: 2,
  };
  const effects = getMinggeEffects(player, minggeList);
  assert.equal(effects.攻击加成, 0.1);
  assert.equal(effects.生命加成, 0.2);
});

test('配置中「彼岸教祖」命格词条具备内景地三项消费词条（开启概率/收益/消耗倍率）', () => {
  const shore = configuredMinggeList.find(item => item.id === 'shore_patriarch');
  assert.ok(shore, '「彼岸教祖」命格词条应存在于配置表');
  assert.equal(shore?.rarity, 3, '内景地开启命格应为传说级');
  assert.equal(shore?.effects?.内景地开启概率, 0.40, '必带「内景地开启概率」词条(0.40)');
  assert.equal(shore?.effects?.内景地收益, 0.3, '必带「内景地收益」词条(0.3)');
  assert.equal(shore?.effects?.内景地消耗倍率, 0.80, '必带「内景地消耗倍率」词条(0.80)');
  assert.match(shore?.desc || '', /彼岸/, '描述应点出「彼岸」之缘');
});

test('采矿/采药消费层：配置中的「采矿加成」「采药加成」词条能被 calculateMinggeYield 放大产出', () => {
  // 1) 配置表真实存在这两个 consumer 对应的词条
  const allEffectKeys = configuredMinggeList.flatMap(item => Object.keys(item.effects || {}));
  assert.ok(allEffectKeys.includes('采矿加成'), '配置表应存在「采矿加成」词条');
  assert.ok(allEffectKeys.includes('采药加成'), '配置表应存在「采药加成」词条');

  // 2) 带词条的玩家产出 > 无词条玩家（同基础量，数学期望）
  const noMingge = {};
  // 用高频多次采样抵消随机波动，验证期望确实提升
  let sumNoMingge = 0, sumWithMine = 0, sumWithHerb = 0;
  const baseAmount = 100;
  const withMine = { 采矿加成: 0.20 };
  const withHerb = { 采药加成: 0.20 };
  for (let i = 0; i < 5000; i++) {
    sumNoMingge += calculateMinggeYield(baseAmount, noMingge, '采矿加成');
    sumWithMine += calculateMinggeYield(baseAmount, withMine, '采矿加成');
    sumWithHerb += calculateMinggeYield(baseAmount, withHerb, '采药加成');
  }
  assert.ok(sumWithMine > sumNoMingge, '带采矿加成时期望产出应更高');
  assert.ok(sumWithHerb > sumNoMingge, '带采药加成时期望产出应更高');

  // 3) 倍率数值正确：理论期望 = base * (1 + 0.2) = 120（5000 次采样容差 ±3）
  assert.ok(Math.abs(sumWithMine / 5000 - 120) < 3, '采矿加成 +20% 期望应≈120');
  assert.ok(Math.abs(sumWithHerb / 5000 - 120) < 3, '采药加成 +20% 期望应≈120');
});

test('采矿/采药消费层：无对应命格词条时产出不被改动', () => {
  const noMingge = {};
  // 无词条时 getMinggeBonusMultiplier 应为 1，calculateMinggeYield 退化为 floor(amount)
  assert.equal(getMinggeBonusMultiplier(noMingge, '采矿加成'), 1);
  assert.equal(getMinggeBonusMultiplier(noMingge, '采药加成'), 1);
  let s = 0;
  for (let i = 0; i < 5000; i++) s += calculateMinggeYield(98.7, noMingge, '采矿加成');
  assert.ok(Math.abs(s / 5000 - 98) < 1, '无词条时期望应≈floor(98.7)=98');
});

test('炼丹消费层：命格降低凡品阈值、提升仙品概率（含正负值与 clamp）', () => {
  // 复刻 liandan 的品质判定阈值逻辑（与 apps/Occupation/Occupation.js 保持一致）
  const replicate = (minggeEffects, occupation_level) => {
    const danSuccess = minggeEffects?.['炼丹成功率'] || 0; // 可正可负
    const danQuality = minggeEffects?.['炼丹品质'] || 0;   // 可正可负
    const fanpinThreshold = Math.max(0, Math.min(0.95, 0.1 + (occupation_level * 3) / 100 - danSuccess));
    const xianpinChance = Math.max(0, Math.min(0.95, 0.4 + danQuality));
    return { fanpinThreshold, xianpinChance };
  };

  // 1) 配置表真实存在这两个词条
  const allKeys = configuredMinggeList.flatMap(m => Object.keys(m.effects || {}));
  assert.ok(allKeys.includes('炼丹成功率'), '配置表应存在「炼丹成功率」词条');
  assert.ok(allKeys.includes('炼丹品质'), '配置表应存在「炼丹品质」词条');

  // 2) 无命格：阈值等于原公式
  const base = replicate({}, 10);
  assert.ok(Math.abs(base.fanpinThreshold - (0.1 + 0.3)) < 1e-9, '无命格凡品阈值应为 0.4');
  assert.ok(Math.abs(base.xianpinChance - 0.4) < 1e-9, '无命格仙品概率应为 0.4');

  // 3) 正面命格：凡品阈值降低、仙品概率提升
  const buffed = replicate({ '炼丹成功率': 0.3, '炼丹品质': 0.2 }, 10);
  assert.ok(buffed.fanpinThreshold < base.fanpinThreshold, '炼丹成功率应降低凡品阈值');
  assert.ok(buffed.xianpinChance > base.xianpinChance, '炼丹品质应提升仙品概率');

  // 4) 负面命格（如「丹火暴烈」）：凡品阈值升高、仙品概率降低
  const debuffed = replicate({ '炼丹成功率': -0.2, '炼丹品质': -0.1 }, 10);
  assert.ok(debuffed.fanpinThreshold > base.fanpinThreshold, '负面炼丹成功率应升高凡品阈值');
  assert.ok(debuffed.xianpinChance < base.xianpinChance, '负面炼丹品质应降低仙品概率');

  // 5) clamp：极端值不越界
  const clamped = replicate({ '炼丹成功率': 5, '炼丹品质': 5 }, 10);
  assert.ok(clamped.fanpinThreshold <= 0.95 && clamped.xianpinChance <= 0.95, '阈值应被 clamp 在 [0,0.95]');
});

test('制符消费层：calculateMinggeYield 对「制符加成」放大产出，倍率正确', () => {
  const allKeys = configuredMinggeList.flatMap(m => Object.keys(m.effects || {}));
  assert.ok(allKeys.includes('制符加成'), '配置表应存在「制符加成」词条');

  const noMingge = {};
  const withFu = { '制符加成': 0.3 };
  const base = 100;
  let s0 = 0, s1 = 0;
  for (let i = 0; i < 5000; i++) {
    s0 += calculateMinggeYield(base, noMingge, '制符加成');
    s1 += calculateMinggeYield(base, withFu, '制符加成');
  }
  assert.ok(s1 > s0, '带制符加成时期望产出应更高');
  assert.ok(Math.abs(s1 / 5000 - 130) < 4, '制符加成 +30% 期望应≈130');
  assert.equal(getMinggeBonusMultiplier(noMingge, '制符加成'), 1);
  assert.ok(Math.abs(getMinggeBonusMultiplier(withFu, '制符加成') - 1.3) < 1e-9, '制符加成倍率应为 1.3');
});

test('境界突破消费层：命格「境界突破成功率」影响突破概率（可正可负可零）', () => {
  // 配置表真实存在该词条
  const allKeys = configuredMinggeList.flatMap(m => Object.keys(m.effects || {}));
  assert.ok(allKeys.includes('境界突破成功率'), '配置表应存在「境界突破成功率」词条');

  // 复刻 Level.js 一键突破的 prob 计算逻辑（与 apps/User/Level.js 保持一致）
  const replicateProb = (minggeEffects, level_id, eraRate, probBonus = 0) => {
    const baseProb = Math.max(0.01, 1 - level_id / 60);
    const eraBaseProb = eraRate / 100;
    const breakthroughBonus = minggeEffects?.['境界突破成功率'] || 0; // 可正可负
    let prob = baseProb + eraBaseProb + probBonus + breakthroughBonus;
    if (prob < 0.01) prob = 0.01;
    return prob;
  };

  const base = replicateProb({}, 10, 0, 0);
  const buffed = replicateProb({ '境界突破成功率': 0.10 }, 10, 0, 0);
  const debuffed = replicateProb({ '境界突破成功率': -0.05 }, 10, 0, 0);

  assert.ok(buffed > base, '带正面命格时突破概率应更高');
  assert.ok(debuffed < base, '带负面命格时突破概率应更低');
  assert.ok(Math.abs(buffed - (base + 0.10)) < 1e-9, '正面 +10% 应精确 +0.1');
  assert.ok(Math.abs(debuffed - (base - 0.05)) < 1e-9, '负面 -5% 应精确 -0.05');
});

test('寻宝消费层：命格「寻宝加成」通过赐福倍率 n 放大产出（保整数、下限1、可正负）', () => {
  const allKeys = configuredMinggeList.flatMap(m => Object.keys(m.effects || {}));
  assert.ok(allKeys.includes('寻宝加成'), '配置表应存在「寻宝加成」词条');

  // 复刻 UserHome 寻宝分支的 n 倍率逻辑（与 apps/User/UserHome.js 保持一致）
  const replicateN = (n, treasureBonus) => {
    if (treasureBonus === 0) return n;
    // 注意：calculateMinggeYield 内部已按 (1+bonus) 放大，传入基础 n 即可，勿重复乘
    return Math.max(1, calculateMinggeYield(n, { '寻宝加成': treasureBonus }, '寻宝加成'));
  };

  // 无命格：n 不变
  assert.equal(replicateN(2, 0), 2);
  assert.equal(replicateN(4, 0), 4);

  // 带命格：期望应提升（多次采样抵消随机）
  let sumNo = 0, sumBuff = 0;
  for (let i = 0; i < 5000; i++) {
    sumNo += replicateN(1, 0);
    sumBuff += replicateN(1, 0.2); // 期望 1*1.2=1.2 → 整数 1 或 2
  }
  assert.ok(sumBuff > sumNo, '带寻宝加成时期望 n 应更高');
  // 1*(1.2)=1.2 期望，5000 次采样均值应≈1.2（容差 ±0.1）
  assert.ok(Math.abs(sumBuff / 5000 - 1.2) < 0.1, '寻宝加成 +20% 期望 n 应≈1.2');

  // 下限保护：负面命格不会让 n < 1（否则所有产出归零）
  for (let i = 0; i < 5000; i++) {
    const val = replicateN(1, -0.5); // 1*0.5=0.5 期望 → 0 或 1，但 Math.max(1,...) 保证 1
    assert.ok(val >= 1, '负面命格时 n 不应低于 1');
  }
  // 整数性：所有结果应为整数
  for (let i = 0; i < 2000; i++) {
    const val = replicateN(2, 0.5);
    assert.equal(val, Math.floor(val), '命格倍率后的 n 应为整数');
  }
});

test('元神修炼消费层：命格「元神修炼加成」放大元神恢复（保整数、可正负）', () => {
  const allKeys = configuredMinggeList.flatMap(m => Object.keys(m.effects || {}));
  assert.ok(allKeys.includes('元神修炼加成'), '配置表应存在「元神修炼加成」词条');

  // 复刻 yuanshen.js xiulianyuanshen 的恢复逻辑（与 apps/User/yuanshen.js 保持一致）
  const replicateAdd = (上限, ratio, yuanshenBonus) => {
    let add = Math.ceil(上限 * ratio);
    if (yuanshenBonus === 0) return add;
    // calculateMinggeYield 内部已按 (1+bonus) 放大，传入基础 add 即可，勿重复乘
    return calculateMinggeYield(add, { '元神修炼加成': yuanshenBonus }, '元神修炼加成');
  };

  // 无命格：add 不变
  assert.equal(replicateAdd(100000, 0.10, 0), Math.ceil(100000 * 0.10));

  // 带命格：期望应提升（多次采样抵消随机）
  const base = 100000, ratio = 0.10;
  const baseAdd = Math.ceil(base * ratio);
  let sumNo = 0, sumBuff = 0;
  for (let i = 0; i < 5000; i++) {
    sumNo += replicateAdd(base, ratio, 0);
    sumBuff += replicateAdd(base, ratio, 0.2); // 期望 baseAdd*1.2
  }
  assert.ok(sumBuff > sumNo, '带元神修炼加成时元神恢复应更高');
  assert.ok(Math.abs(sumBuff / 5000 - baseAdd * 1.2) < baseAdd * 0.1, '元神修炼加成 +20% 期望恢复应≈baseAdd*1.2');

  // 整数性：所有结果应为整数
  for (let i = 0; i < 2000; i++) {
    const val = replicateAdd(base, ratio, 0.5);
    assert.equal(val, Math.floor(val), '命格倍率后的元神恢复应为整数');
  }
});

test('出售消费层：命格「出售价格倍率」直接放大灵石收益（缺词条时倍率=1）', () => {
  const allKeys = configuredMinggeList.flatMap(m => Object.keys(m.effects || {}));
  assert.ok(allKeys.includes('出售价格倍率'), '配置表应存在「出售价格倍率」词条');

  // 复刻出售结算点的倍率逻辑（与 apps/User/UserHome.js / UserSellAll.js 保持一致）
  const replicatePrice = (basePrice, sellEffects) => {
    const sellMult = getMinggeDirectMultiplier(sellEffects, '出售价格倍率');
    if (sellMult === 1) return basePrice;
    return Math.floor(basePrice * sellMult);
  };

  // 无命格：倍率回退为 1，价格不变
  assert.equal(replicatePrice(10000, {}), 10000);
  assert.equal(getMinggeDirectMultiplier({}, '出售价格倍率'), 1, '缺词条时倍率应为 1');

  // 带命格：数据示例为 2.0（即 2 倍售价）
  assert.equal(getMinggeDirectMultiplier({ '出售价格倍率': 2.0 }, '出售价格倍率'), 2.0);
  assert.equal(replicatePrice(10000, { '出售价格倍率': 2.0 }), 20000, '售价应翻倍');

  // 非有限/负数倍率安全：应被夹紧为 1，绝不让售价变成 0 或负数
  assert.equal(getMinggeDirectMultiplier({ '出售价格倍率': -5 }, '出售价格倍率'), 1, '负倍率应被夹紧为 1');
  assert.equal(getMinggeDirectMultiplier({ '出售价格倍率': NaN }, '出售价格倍率'), 1, '非有限倍率应回退为 1');
});

test('秘境加速消费层：命格「秘境加速」(flat-seconds) 由原语层解析并换算为分钟', () => {
  // 1) 配置表真实存在「秘境加速」词条（数据示例值为 60 秒）
  const allKeys = configuredMinggeList.flatMap(m => Object.keys(m.effects || {}));
  assert.ok(allKeys.includes('秘境加速'), '配置表应存在「秘境加速」词条');

  // 内联命格列表，覆盖单个/附加合并两种情形
  const secretList = [
    { id: 'sp_single', name: '秘境游身', rarity: 2, rarityName: '稀有', category: '秘境',
      desc: '出入秘境如闲庭信步。', effects: { 秘境加速: 60 } }, // 60 秒
    { id: 'sp_extra', name: '缩地真解', rarity: 2, rarityName: '稀有', category: '秘境',
      desc: '缩地成寸，秘境无滞。', effects: { 秘境加速: 60 } }, // 附加命格 60 秒
  ];

  // 2) 单条命格：原语层返回 60 秒 -> 60000 毫秒
  const p1 = { 命格: { id: 'sp_single' } };
  const e1 = getMinggeEffects(p1, secretList);
  assert.equal(getMinggeSecretPlaceReductionMs(e1), 60000, '单条秘境加速应解析为 60000 毫秒');

  // 3) 无命格 / 无关命格：返回 0 毫秒（不影响耗时）
  assert.equal(getMinggeSecretPlaceReductionMs(getMinggeEffects({}, secretList)), 0, '无命格时不减少');
  assert.equal(
    getMinggeSecretPlaceReductionMs(getMinggeEffects({ 命格: { id: 'positive_normal' } }, minggeList)),
    0,
    '无关命格不应误触秘境加速'
  );

  // 4) 复刻 SecretPlace.js / SecretPlaceplus.js 中的消费公式：秒 -> 分钟并入 timeReduction
  const replicateReduction = (player, list) => {
    const effects = getMinggeEffects(player, list);
    const ms = getMinggeSecretPlaceReductionMs(effects);
    let timeReduction = 0; // 此处仅验证秘境加速部分，行字秘等其它来源忽略
    if (ms > 0) timeReduction += ms / 60000;
    return { timeReduction, secs: ms > 0 ? Math.round(ms / 1000) : 0 };
  };

  const r1 = replicateReduction(p1, secretList);
  assert.ok(Math.abs(r1.timeReduction - 1) < 1e-9, '60 秒应换算为 1 分钟');
  assert.equal(r1.secs, 60, '文案应展示 60 秒');

  // 5) 附加命格合并：60 + 60 = 120 秒 -> 2 分钟
  const p2 = { 命格: { id: 'sp_single' }, 附加命格: [{ id: 'sp_extra' }] };
  const r2 = replicateReduction(p2, secretList);
  assert.ok(Math.abs(r2.timeReduction - 2) < 1e-9, '两条秘境加速应合并为 2 分钟');
  assert.equal(r2.secs, 120, '文案应展示 120 秒');
});
