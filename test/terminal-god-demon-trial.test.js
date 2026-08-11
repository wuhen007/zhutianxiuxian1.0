import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TERMINAL_TRIAL_ROUTES,
  applyTerminalTrialResult,
  buildTerminalTrialBattle,
  ensureTerminalGodDemonTrial,
  getTerminalPityMultiplier,
  getTerminalTrialEligibility,
} from '../model/terminalGodDemonTrial.js';

function player(overrides = {}) {
  return {
    id: '1',
    名号: '终焉之主',
    灵根: { name: '终焉神魔体', type: '神魔体', 法球倍率: 3 },
    攻击: 1000,
    防御: 800,
    血量上限: 5000,
    当前血量: 5000,
    法球倍率: 3,
    速度: 100,
    mijinglevel_id: 18,
    xiangulevel_id: 0,
    学习的功法: [],
    ...overrides,
  };
}

test('终焉试炼只向仙王级终焉神魔体开放', () => {
  assert.equal(getTerminalTrialEligibility(player()).ok, true);
  assert.equal(getTerminalTrialEligibility(player({ mijinglevel_id: 17 })).ok, false);
  assert.equal(getTerminalTrialEligibility(player({ 灵根: { name: '普通灵根' } })).ok, false);
});

test('黄昏神国十三战后授予武器并开启太古魔土', () => {
  const owner = player();
  ensureTerminalGodDemonTrial(owner);
  for (let index = 0; index < TERMINAL_TRIAL_ROUTES.weapon.enemies.length; index++) {
    const battle = buildTerminalTrialBattle(owner, 'weapon');
    assert.equal(battle.ok, true);
    const result = applyTerminalTrialResult(owner, 'weapon', true, 1);
    if (index < TERMINAL_TRIAL_ROUTES.weapon.enemies.length - 1) assert.equal(result.completedItem, '');
    else assert.equal(result.completedItem, '【终焉】诸神黄昏');
  }
  assert.equal(owner.终焉神魔套试炼.阶段, 'armor');
});

test('太古魔土保留连续生命并记录吞血和守心选择', () => {
  const owner = player({ 终焉神魔套试炼: { 阶段: 'armor', 黄昏神国: 13 } });
  const first = buildTerminalTrialBattle(owner, 'armor', '保持本心');
  assert.equal(first.ok, true);
  applyTerminalTrialResult(owner, 'armor', true, 3200, '保持本心');
  assert.equal(owner.终焉神魔套试炼.魔土余血, 3200);
  assert.equal(owner.终焉神魔套试炼.守心道痕, 1);

  const second = buildTerminalTrialBattle(owner, 'armor', '吞噬魔血');
  assert.ok(second.attacker.当前血量 > 3200);
  applyTerminalTrialResult(owner, 'armor', false, 0, '吞噬魔血');
  assert.equal(owner.终焉神魔套试炼.魔土余血, 3200);

  const retry = buildTerminalTrialBattle(owner, 'armor', '吞噬魔血');
  assert.ok(retry.attacker.当前血量 > 3200);
  applyTerminalTrialResult(owner, 'armor', true, 3000, '吞噬魔血');
  assert.equal(owner.终焉神魔套试炼.魔血侵蚀, 1);
});

test('失败不退进度，每五败提供10%保底增幅', () => {
  const owner = player();
  for (let index = 0; index < 5; index++) applyTerminalTrialResult(owner, 'weapon', false);
  assert.equal(owner.终焉神魔套试炼.黄昏神国, 0);
  assert.equal(getTerminalPityMultiplier(owner.终焉神魔套试炼), 1.1);
  const battle = buildTerminalTrialBattle(owner, 'weapon');
  assert.equal(battle.attacker.攻击, 1100);
});

test('诸世归墟六战后终焉三器圆满', () => {
  const owner = player({
    终焉神魔套试炼: {
      阶段: 'wheel',
      黄昏神国: 13,
      太古魔土: 9,
      完成装备: ['【终焉】诸神黄昏', '【终焉】神魔葬天衣'],
    },
  });
  let result;
  for (let index = 0; index < TERMINAL_TRIAL_ROUTES.wheel.enemies.length; index++) {
    result = applyTerminalTrialResult(owner, 'wheel', true, 1);
  }
  assert.equal(result.completedItem, '【终焉】万劫归墟轮');
  assert.equal(owner.终焉神魔套试炼.阶段, 'complete');
});
