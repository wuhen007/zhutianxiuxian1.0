import assert from 'node:assert/strict';
import test from 'node:test';

import { resetIneligibleShengtiCultivation } from '../model/shengtiCultivation.js';

const normalProgress = { 轮海: 100, 道宫: 50, 四极: 25, 化龙: 5 };
const normalBonus = { 轮海: 40, 道宫: 30, 四极: 20, 化龙: 10 };

function player(overrides = {}) {
  return {
    灵根: { type: '真灵根' },
    学习的功法: ['圣体秘术'],
    圣体秘境完成度: { ...normalProgress },
    圣体秘境加成: { ...normalBonus },
    攻击加成: 1000,
    防御加成: 900,
    生命加成: 800,
    攻击: 1100,
    防御: 1000,
    血量上限: 900,
    当前血量: 850,
    ...overrides,
  };
}

test('小成或大成圣体洗成其他灵根后清除普通秘术加成和进度', () => {
  const target = player();
  const result = resetIneligibleShengtiCultivation(target, {
    攻击: 100,
    防御: 100,
    血量上限: 100,
  });

  assert.equal(result.normalDeduction, 100);
  assert.deepEqual(result.removedTechniques, ['圣体秘术']);
  assert.deepEqual(target.圣体秘境加成, { 轮海: 0, 道宫: 0, 四极: 0, 化龙: 0 });
  assert.deepEqual(target.圣体秘境完成度, { 轮海: 0, 道宫: 0, 四极: 0, 化龙: 0 });
  assert.deepEqual(
    [target.攻击加成, target.防御加成, target.生命加成],
    [900, 800, 700]
  );
  assert.deepEqual([target.攻击, target.防御, target.血量上限], [1000, 900, 800]);
  assert.equal(target.当前血量, 800);
});

test('大成圣体洗根后同时清除终极秘术、仙台加成和圆满奖励', () => {
  const completionRewards = 45_000_000 + 54_000_000;
  const trackedUltimateBonus = 1_000;
  const total = 100 + trackedUltimateBonus + completionRewards;
  const target = player({
    学习的功法: ['圣体秘术', '终极圣体秘术', '其他功法'],
    仙台秘境完成度: {
      仙台一层天: 100,
      仙台二层天: 100,
      仙台三层天: 96,
      仙台四层天: 0,
      仙台五层天: 0,
      仙台六层天: 0,
    },
    仙台秘境加成: trackedUltimateBonus,
    攻击加成: total + 500,
    防御加成: total + 400,
    生命加成: total + 300,
    攻击: total + 200,
    防御: total + 200,
    血量上限: total + 200,
    当前血量: total + 200,
  });
  const result = resetIneligibleShengtiCultivation(target, {
    攻击: 100,
    防御: 100,
    血量上限: 100,
  });

  assert.equal(result.ultimateDeduction, trackedUltimateBonus + completionRewards);
  assert.equal(result.attributeDeduction, total);
  assert.deepEqual(target.学习的功法, ['其他功法']);
  assert.equal(target.仙台秘境加成, 0);
  assert.ok(Object.values(target.仙台秘境完成度).every(value => value === 0));
  assert.deepEqual(
    [target.攻击加成, target.防御加成, target.生命加成],
    [500, 400, 300]
  );
});

test('仍是大成圣体时保留两种秘术，小成圣体只失去终极秘术', () => {
  const dacheng = player({
    灵根: { type: '大成圣体' },
    学习的功法: ['圣体秘术', '终极圣体秘术'],
    仙台秘境完成度: { 仙台一层天: 50 },
    仙台秘境加成: 500,
  });
  assert.equal(resetIneligibleShengtiCultivation(dacheng).changed, false);

  const xiaocheng = structuredClone(dacheng);
  xiaocheng.灵根.type = '小成圣体';
  const result = resetIneligibleShengtiCultivation(xiaocheng);
  assert.deepEqual(result.removedTechniques, ['终极圣体秘术']);
  assert.deepEqual(xiaocheng.学习的功法, ['圣体秘术']);
  assert.deepEqual(xiaocheng.圣体秘境加成, normalBonus);
});
