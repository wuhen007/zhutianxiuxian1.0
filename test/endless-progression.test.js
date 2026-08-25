import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ENDLESS_DIFFICULTIES,
  canEnterEndlessDifficulty,
  formatEndlessDifficulty,
  getEndlessLimitedPurchaseLimit,
  normalizeEndlessDifficultyProgress,
  recordEndlessDifficultyProgress,
} from '../model/endlessDifficulty.js';
import {
  getDailyEndlessCelestial,
  getEndlessCelestialPrice,
} from '../model/endlessCelestial.js';
import {
  createEndlessEnemy,
  createEndlessRun,
  getMemberStats,
  resolveEndlessLayer,
} from '../model/endlessRealm.js';
import {
  ENDLESS_TREASURES,
  getTreasureRunSummary,
} from '../model/endlessTreasure.js';

function player(name = '测试者') {
  return { 名号: name };
}

function runOptions(overrides = {}) {
  return {
    teamId: '100001',
    groupId: '200001',
    players: [{ id: '1', player: player() }],
    seed: 20260825,
    ...overrides,
  };
}

test('A1至A9采用确定命名且每阶固定150层', () => {
  assert.equal(ENDLESS_DIFFICULTIES.length, 9);
  assert.equal(formatEndlessDifficulty(1), 'A1·本初劫境');
  assert.equal(formatEndlessDifficulty(6), 'A6·轮回劫境');
  assert.equal(formatEndlessDifficulty(9), 'A9·彼岸劫境');
});

test('每阶首通只结算一次限购加成并解锁下一阶', () => {
  const account = player();
  const first = recordEndlessDifficultyProgress(account, 1, 150, { cleared: true });
  assert.equal(first.firstClear, true);
  assert.equal(first.unlockedTier, 2);
  assert.equal(canEnterEndlessDifficulty(account, 2), true);
  assert.equal(getEndlessLimitedPurchaseLimit(account, 3), 4);
  assert.equal(getEndlessLimitedPurchaseLimit(account, 20), 22);

  const repeat = recordEndlessDifficultyProgress(account, 1, 150, { cleared: true });
  assert.equal(repeat.firstClear, false);
  assert.equal(getEndlessLimitedPurchaseLimit(account, 3), 4);

  recordEndlessDifficultyProgress(account, 2, 150, { cleared: true });
  assert.equal(account.无尽劫境进阶.unlockedTier, 3);
  assert.equal(getEndlessLimitedPurchaseLimit(account, 3), 5);
  assert.equal(getEndlessLimitedPurchaseLimit(account, 20), 24);
});

test('旧累计层数会迁移为对应A阶进度', () => {
  const account = { 名号: '旧档', 无尽劫境最高层: 451 };
  const progress = normalizeEndlessDifficultyProgress(account);
  assert.deepEqual(progress.clearedTiers, [1, 2, 3]);
  assert.equal(progress.unlockedTier, 4);
  assert.equal(progress.highestLayers[4], 1);
});

test('每日天象全服确定且覆盖至宝、能力、道痕与商店规则', () => {
  const seen = new Map();
  for (let day = 1; day <= 365; day++) {
    const current = getDailyEndlessCelestial(new Date(Date.UTC(2026, 0, day, 4)));
    seen.set(current.id, current);
    const repeat = getDailyEndlessCelestial(new Date(Date.UTC(2026, 0, day, 4)));
    assert.deepEqual(current, repeat);
  }
  assert.deepEqual(
    [...seen.keys()].sort(),
    [
      'ability_ebb',
      'ability_surge',
      'sealed_treasures',
      'shop_discount',
      'shop_expansion',
      'shop_inflation',
      'trace_drought',
    ].sort()
  );
  assert.equal(getEndlessCelestialPrice(100, seen.get('shop_inflation')), 125);
  assert.equal(getEndlessCelestialPrice(100, seen.get('shop_discount')), 80);
  assert.equal(
    getEndlessLimitedPurchaseLimit(player(), 3, seen.get('shop_expansion')),
    4
  );
  assert.equal(seen.get('trace_drought').tokenMultiplier, 0.7);
  assert.equal(seen.get('sealed_treasures').disabledTreasureIds.length, 2);
});

test('天象会实际禁用至宝并修改对应标签能力面板', () => {
  const treasure = ENDLESS_TREASURES[0];
  const sealedRun = createEndlessRun(runOptions({
    players: [{
      id: '1',
      player: {
        ...player(),
        无尽劫境最高层: 25,
        无尽至宝槽位: 1,
        无尽至宝列表: [{ id: treasure.id, level: 3 }],
        无尽至宝装配: [treasure.id],
      },
    }],
    celestialPhenomenon: {
      id: 'sealed_treasures',
      disabledTreasureIds: [treasure.id],
    },
  }));
  assert.equal(sealedRun.members['1'].abilities[treasure.baseAbility], undefined);
  assert.deepEqual(getTreasureRunSummary(sealedRun.members['1'], sealedRun), []);

  const normal = createEndlessRun(runOptions({ seed: 10 }));
  normal.members['1'].abilities.zhetian_fight_secret = 1;
  const weakened = structuredClone(normal);
  weakened.celestialPhenomenon = {
    id: 'ability_ebb',
    abilityTag: '爆发',
    abilityMultiplier: 0.75,
  };
  assert.ok(getMemberStats(weakened, '1').attack < getMemberStats(normal, '1').attack);
});

test('高阶敌人真实增强且轮回劫境小队拥有独立构筑', () => {
  const a1 = createEndlessRun(runOptions({ seed: 77, difficultyTier: 1 }));
  const a2 = createEndlessRun(runOptions({ seed: 77, difficultyTier: 2 }));
  a1.rivalEncounterChance = 0;
  a2.rivalEncounterChance = 0;
  const enemyA1 = createEndlessEnemy(a1, 1);
  const enemyA2 = createEndlessEnemy(a2, 1);
  assert.ok(enemyA2.maxHp > enemyA1.maxHp);
  assert.ok(enemyA2.attack > enemyA1.attack);
  assert.ok(enemyA2.defense > enemyA1.defense);

  const rivalRun = createEndlessRun(runOptions({ seed: 88, difficultyTier: 4 }));
  rivalRun.rivalEncounterChance = 1;
  const rival = createEndlessEnemy(rivalRun, 1);
  assert.equal(rival.rivalTeam, true);
  assert.match(rival.name, /轮回劫境小队/);
  assert.ok(rival.rivalBuild.length >= 2);
  assert.ok(rival.rewardMultiplier >= 1.35);
});

test('高阶奖励与道痕天象都会进入实际战斗结算', () => {
  const prepare = (run) => {
    const member = run.members['1'];
    member.base = { hp: 1e12, attack: 1e12, defense: 1e12, speed: 100 };
    member.hp = 1e12;
    member.maxHp = 1e12;
    run.phase = 'ready';
    run.pendingChoices = {};
    run.rivalEncounterChance = 0;
    return run;
  };
  const a1 = prepare(createEndlessRun(runOptions({ seed: 120, difficultyTier: 1 })));
  const a2 = prepare(createEndlessRun(runOptions({ seed: 120, difficultyTier: 2 })));
  const drought = prepare(createEndlessRun(runOptions({
    seed: 120,
    difficultyTier: 1,
    celestialPhenomenon: { id: 'trace_drought', tokenMultiplier: 0.7 },
  })));
  const rewardA1 = resolveEndlessLayer(a1).layerReward;
  const rewardA2 = resolveEndlessLayer(a2).layerReward;
  const droughtReward = resolveEndlessLayer(drought).layerReward;
  assert.ok(rewardA2.lingshi > rewardA1.lingshi);
  assert.equal(droughtReward.tokens, Math.round(rewardA1.tokens * 0.7));
});

test('打穿第150层会结束本阶而不是继续生成第151层', () => {
  const run = createEndlessRun(runOptions({ seed: 99 }));
  const member = run.members['1'];
  member.base = { hp: 1e30, attack: 1e30, defense: 1e30, speed: 100 };
  member.hp = 1e30;
  member.maxHp = 1e30;
  run.layer = 149;
  run.highestClearedLayer = 149;
  run.phase = 'ready';
  run.pendingChoices = {};
  run.rivalEncounterChance = 0;
  const result = resolveEndlessLayer(run);
  assert.equal(result.victory, true);
  assert.equal(result.completed, true);
  assert.equal(run.phase, 'completed');
  assert.equal(run.layer, 150);
});
