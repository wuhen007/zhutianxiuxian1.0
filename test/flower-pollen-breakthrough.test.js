import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateFlowerDaoGain,
  calculateFlowerExtremeBonus,
  ensureFlowerPollenState,
  getFlowerDaoAttemptCost,
  getFlowerDaoEquipmentBonuses,
  getFlowerDaoGateState,
  getFlowerDaoWoundState,
  getFlowerEvolutionChance,
  getFlowerPathAttributeMultiplier,
  recordFlowerDaoAttempt,
  resolveFlowerBreakthrough,
} from '../model/flowerPollenPath.js';

test('花粉道则使用独立状态并限制每日悟道次数', () => {
  const player = ensureFlowerPollenState({ huafenlevel_id: 9, 修为: 1e12, 血气: 1e12 });
  const initial = getFlowerDaoGateState(player, 9);
  assert.equal(initial.ok, false);
  assert.equal(initial.rule.name, '圣者花粉道则');
  assert.deepEqual(player.花粉道途.daily, { date: '', count: 0 });

  const cost = getFlowerDaoAttemptCost(player, 9, 2);
  assert.deepEqual(
    {
      potential: cost.potential,
      cultivation: cost.cultivation,
      blood: cost.blood,
      lifespan: cost.lifespan,
      spirit: cost.spirit,
    },
    {
      potential: 900,
      cultivation: 4096000000,
      blood: 4096000000,
      lifespan: 1800000,
      spirit: 90000000,
    }
  );
  const gain = calculateFlowerDaoGain(player, 9, () => 0.5, { eraIndex: 2 });
  assert.ok(gain.gain > 0);

  for (let i = 0; i < 3; i += 1) {
    const result = recordFlowerDaoAttempt(player, 9, 10, '2026-08-16');
    assert.equal(result.ok, true);
  }
  const blocked = recordFlowerDaoAttempt(player, 9, 10, '2026-08-16');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'daily');

  const nextDay = recordFlowerDaoAttempt(player, 9, 10, '2026-08-17');
  assert.equal(nextDay.ok, true);
  assert.equal(player.花粉道途.daily.count, 1);
});

test('花粉悟道五资源成本统一受到时代影响', () => {
  const player = ensureFlowerPollenState({ huafenlevel_id: 9 });
  const normal = getFlowerDaoAttemptCost(player, 9, 2);
  const spiritless = getFlowerDaoAttemptCost(player, 9, 4);
  for (const key of ['potential', 'cultivation', 'blood', 'lifespan', 'spirit']) {
    assert.equal(spiritless[key], normal[key] * 3, `${key}应受到绝灵时代三倍消耗影响`);
  }
});

test('花粉悟道接入完整收益因子并正确处理污染与根基隐患', () => {
  const base = ensureFlowerPollenState({
    huafenlevel_id: 9,
    学习的功法: ['基础呼吸法'],
    进化积淀: 0,
    花粉隐患: 0,
    始祖污染度: 0,
  });
  const enhanced = structuredClone(base);
  enhanced.进化积淀 = 200;
  const baseGain = calculateFlowerDaoGain(base, 9, () => 0.5, { eraIndex: 2 });
  const enhancedGain = calculateFlowerDaoGain(enhanced, 9, () => 0.5, {
    eraIndex: 2,
    ancestorSeed: true,
    stoneJar: true,
    physiqueBonus: 0.1,
    aptitudeBonus: 0.1,
    techniqueBonus: 0.1,
    minggeBonus: 0.1,
    titleBonus: 0.05,
    equipmentBonus: 0.05,
    treasureBonus: 0.1,
    worldBonus: 0.1,
    daoHeartMultiplier: 1,
  });
  assert.ok(enhancedGain.gain > baseGain.gain);
  assert.equal(enhancedGain.bonuses.ancestorSeed, 0.08);
  assert.equal(enhancedGain.bonuses.stoneJar, 0.1);

  const polluted = structuredClone(enhanced);
  polluted.始祖污染度 = 70;
  polluted.花粉隐患 = 100;
  polluted.花粉根基.损伤 = 40;
  const pollutedGain = calculateFlowerDaoGain(polluted, 9, () => 0.5, { eraIndex: 2 });
  assert.equal(pollutedGain.bonuses.breathing, baseGain.bonuses.breathing / 2);
  assert.ok(pollutedGain.bonuses.pollution < 0);
  assert.ok(pollutedGain.bonuses.risk < 0);
  assert.ok(pollutedGain.bonuses.root < 0);
  assert.ok(pollutedGain.gain < baseGain.gain);
});

test('祖种将花粉悟道每日上限提高到四次', () => {
  const player = ensureFlowerPollenState({ huafenlevel_id: 9 });
  for (let i = 0; i < 4; i += 1) {
    assert.equal(recordFlowerDaoAttempt(player, 9, 1, '2026-08-22', 4).ok, true);
  }
  const blocked = recordFlowerDaoAttempt(player, 9, 1, '2026-08-22', 4);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'daily');
});

test('装备与至宝只读取显式悟道词条并兼容百分数写法', () => {
  assert.deepEqual(getFlowerDaoEquipmentBonuses({
    武器: { name: '悟道剑', 悟道加成: 0.08 },
    护具: { name: '普通护具', atk: 999999 },
    法宝: { name: '蒲团', 悟道收益: 5 },
    帝兵: { name: '道钟', 悟道加成: 0.12 },
    至宝: { name: '石书', 悟道收益: 10 },
  }), {
    equipment: 0.13,
    treasure: 0.22,
  });
});

test('花粉高阶节点进入多阶段蜕变劫', () => {
  const player = ensureFlowerPollenState({
    huafenlevel_id: 9,
    进化积淀: 0,
    花粉隐患: 0,
    花粉极境: [],
  });
  const result = resolveFlowerBreakthrough(player, '无暇进化花粉', () => 0, { eraIndex: 2 });
  assert.equal(result.ok, true);
  assert.equal(result.breakthrough, true);
  assert.equal(result.targetLevelId, 10);
  assert.equal(result.stages.length, 3);
  assert.ok(result.stages.every(stage => stage.ok));
  assert.equal(player.huafenlevel_id, 10);
});

test('花粉蜕变劫失败会记录失败阶段但不误升境界', () => {
  const player = ensureFlowerPollenState({ huafenlevel_id: 9, 进化积淀: 0, 花粉隐患: 0 });
  const result = resolveFlowerBreakthrough(player, '无暇进化花粉', () => 1, { eraIndex: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'breakthrough-failed');
  assert.equal(result.breakthrough, true);
  assert.equal(result.failedStage, '圣域显化');
  assert.equal(player.huafenlevel_id, 9);
  assert.equal(player.进化积淀, 44);
  assert.equal(player.花粉隐患, 11);
});

test('大宇与究极分支提供不同战斗侧重点，污染只压低花粉属性', () => {
  const neutral = ensureFlowerPollenState({ huafenlevel_id: 17, 始祖污染度: 0 });
  const greatUniverse = ensureFlowerPollenState({ huafenlevel_id: 17, 花粉路分支: '大宇', 始祖污染度: 0 });
  const ultimate = ensureFlowerPollenState({ huafenlevel_id: 17, 花粉路分支: '究极', 始祖污染度: 0 });
  const neutralBonus = calculateFlowerExtremeBonus(neutral, { 基础攻击: 1000, 基础防御: 1000, 基础血量: 1000 });
  const greatBonus = calculateFlowerExtremeBonus(greatUniverse, { 基础攻击: 1000, 基础防御: 1000, 基础血量: 1000 });
  const ultimateBonus = calculateFlowerExtremeBonus(ultimate, { 基础攻击: 1000, 基础防御: 1000, 基础血量: 1000 });

  assert.ok(greatBonus.攻击 > neutralBonus.攻击);
  assert.ok(ultimateBonus.防御 > neutralBonus.防御);
  assert.ok(greatBonus.攻击 > ultimateBonus.攻击);
  assert.equal(getFlowerPathAttributeMultiplier(neutral), 1);
  const polluted = ensureFlowerPollenState({ huafenlevel_id: 17, 花粉路分支: '大宇', 始祖污染度: 70 });
  assert.equal(getFlowerPathAttributeMultiplier(polluted), 0.9);
});

test('道伤同时压低花粉属性、悟道与进化稳定性', () => {
  const healthy = ensureFlowerPollenState({ huafenlevel_id: 9, 道伤: 0 });
  const wounded = ensureFlowerPollenState({ huafenlevel_id: 9, 道伤: 2 });
  assert.deepEqual(getFlowerDaoWoundState(wounded), {
    wounds: 2,
    chancePenalty: 0.16,
    daoMultiplier: 0.8,
    attrMultiplier: 0.9,
  });
  assert.ok(getFlowerPathAttributeMultiplier(wounded) < getFlowerPathAttributeMultiplier(healthy));
  assert.ok(
    calculateFlowerDaoGain(wounded, 9, () => 0.5, { eraIndex: 2 }).gain
      < calculateFlowerDaoGain(healthy, 9, () => 0.5, { eraIndex: 2 }).gain
  );
  assert.ok(
    getFlowerEvolutionChance(wounded, '无暇进化花粉', { eraIndex: 2 })
      < getFlowerEvolutionChance(healthy, '无暇进化花粉', { eraIndex: 2 })
  );
});
