import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyAncestorCall,
  checkGongfaGate,
  ensureFlowerPollenState,
  getFlowerEvolutionCost,
  getFlowerEraProfile,
  getMutationChance,
  getPollenPollutionState,
  purifyPollution,
  resolveFlowerEvolution,
} from '../model/flowerPollenPath.js';
import {
  PLANE_REALM_LAW,
  checkPlaneRealmLaw,
  getPlaneRealmLaw,
} from '../model/planeRealmLaw.js';

test('evolution cost follows 1250000 × 2^level with era multiplier', () => {
  assert.equal(getFlowerEvolutionCost(1, 2), 2500000); // 125万×2^1×1.0
  assert.equal(getFlowerEvolutionCost(5, 2), 40000000); // 125万×32
  assert.equal(getFlowerEvolutionCost(11, 2), 1250000 * 2048); // 2^11
  assert.equal(getFlowerEvolutionCost(1, 0), 1875000); // 神话 0.75
  assert.equal(getFlowerEvolutionCost(1, 4), 7500000); // 绝灵 3.0
  assert.equal(getFlowerEvolutionCost(0, 2), getFlowerEvolutionCost(1, 2)); // 等级下限 1
});

test('era profile exposes cost rate and chance shift', () => {
  assert.deepEqual(getFlowerEraProfile(0), { index: 0, name: '神话时代', costRate: 0.75, chanceShift: 0.08 });
  assert.equal(getFlowerEraProfile(99).index, 4);
  assert.equal(getFlowerEraProfile(-1).index, 0);
});

test('failed evolution returns failed reason without pollution growth', () => {
  const player = ensureFlowerPollenState({ huafenlevel_id: 5, 进化积淀: 50, 花粉隐患: 0, 学习的功法: ['基础呼吸法'] });
  const result = resolveFlowerEvolution(player, '灵性进化花粉', () => 1, { eraIndex: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'failed'); // random=1 必失败，异变率≤0.25 不会异变
  assert.equal(player.始祖污染度, 0);
});

test('mutation triggers pollution growth on repeated failure', () => {
  const player = ensureFlowerPollenState({ huafenlevel_id: 11, 进化积淀: 300, 花粉隐患: 200, 学习的功法: ['盗引呼吸法'] });
  // 异变率 = 0.03 + 0.15 + 0.04 = 0.22；random 序列 [1(失败), 0.1(<0.22 异变)]
  let calls = 0;
  const seq = () => (calls++ === 0 ? 1 : 0.1);
  const result = resolveFlowerEvolution(player, '神性进化花粉', seq, { eraIndex: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'mutated');
  assert.ok(result.pollutionGain > 0);
  assert.ok(player.始祖污染度 > 0);
  assert.ok(player.始祖污染度 <= 100);
});

test('mutation chance scales with hidden risk and realm', () => {
  const low = ensureFlowerPollenState({ huafenlevel_id: 5, 花粉隐患: 0 });
  const high = ensureFlowerPollenState({ huafenlevel_id: 5, 花粉隐患: 200 });
  const highRealm = ensureFlowerPollenState({ huafenlevel_id: 20, 花粉隐患: 200 });
  assert.ok(getMutationChance(high) > getMutationChance(low));
  assert.ok(getMutationChance(highRealm) > getMutationChance(high));
  assert.ok(getMutationChance(highRealm) <= 0.25);
});

test('ancestor call seizes 50% cultivation/blood and marks player', () => {
  const player = ensureFlowerPollenState({ huafenlevel_id: 12, 修为: 10000, 血气: 8000, 始祖污染度: 100 });
  const call = applyAncestorCall(player);
  assert.equal(player.修为, 5000);
  assert.equal(player.血气, 4000);
  assert.equal(player.始祖污染度, 60);
  assert.ok(player.始祖印记.until > Date.now());
  assert.equal(call.seizedCultivation, 5000);
  assert.equal(call.seizedBlood, 4000);
});

test('purify pollution clears to zero with reward', () => {
  const player = ensureFlowerPollenState({ huafenlevel_id: 10, 进化积淀: 10, 始祖污染度: 30 });
  const result = purifyPollution(player, 30);
  assert.equal(result.cleared, true);
  assert.equal(player.始祖污染度, 0);
  assert.equal(player.进化积淀, 60); // 10 + 50 破而后立
  assert.equal(result.reward, 50);
});

test('pollution state reports polluted threshold and penalties', () => {
  const player = ensureFlowerPollenState({ huafenlevel_id: 10, 始祖污染度: 70 });
  const state = getPollenPollutionState(player);
  assert.equal(state.polluted, true);
  assert.equal(state.attrMultiplier, 0.9);
  assert.equal(state.successPenalty, 0.15);
  assert.equal(state.breathingMultiplier, 0.5);
  assert.equal(state.markSuccessPenalty, 0);
});

test('gongfa gate blocks realm without required breathing method', () => {
  const without = ensureFlowerPollenState({ huafenlevel_id: 4, 学习的功法: ['基础呼吸法'] });
  const gate = checkGongfaGate(without, 5);
  assert.equal(gate.ok, false);
  assert.equal(gate.gate.gongfa, '形意呼吸法');
  const withGongfa = ensureFlowerPollenState({ huafenlevel_id: 4, 学习的功法: ['基础呼吸法', '形意呼吸法'] });
  assert.equal(checkGongfaGate(withGongfa, 5).ok, true);
  assert.equal(checkGongfaGate(withGongfa, 6).ok, true); // 无门槛等级直接放行
  assert.equal(checkGongfaGate(withGongfa, 11).gate.gongfa, '道引呼吸法');
});

test('plane realm law caps pollen path by plane', () => {
  assert.deepEqual(PLANE_REALM_LAW, { 4: 11, 5: 13, 7: 17 });
  assert.equal(getPlaneRealmLaw(4), 11);
  assert.equal(getPlaneRealmLaw(5), 13);
  assert.equal(getPlaneRealmLaw(7), 17);
  assert.equal(getPlaneRealmLaw(0), 25); // 凡间等未列位面不卡
  assert.equal(checkPlaneRealmLaw({ power_place: 4 }, 12).ok, false); // 小阴间 11→12 被卡
  assert.equal(checkPlaneRealmLaw({ power_place: 4 }, 11).ok, true);
  assert.equal(checkPlaneRealmLaw({ power_place: 5 }, 13).ok, true); // 大阴间容到 13
  assert.equal(checkPlaneRealmLaw({ power_place: 5 }, 14).ok, false);
  assert.equal(checkPlaneRealmLaw({ power_place: 7 }, 17).ok, true); // 阳间容到 17
  assert.equal(checkPlaneRealmLaw({ power_place: 7 }, 18).ok, false);
  assert.equal(checkPlaneRealmLaw({ power_place: 2 }, 24).ok, true); // 遮天不卡
});
