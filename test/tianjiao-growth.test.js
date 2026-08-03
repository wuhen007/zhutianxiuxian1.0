import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyTianjiaoImprovement,
  attemptTianjiaoBreakthrough,
  buildTianjiaoBattleStats,
  getTianjiaoBreakthroughChance,
  getTianjiaoImprovementChance,
  improveTianjiao,
  isTianjiaoBreakthroughYear,
} from '../model/tianjiaoGrowth.js';

const context = {
  eraIndex: 0,
  cultivationLevels: [
    { level_id: 1, 基础攻击: 10, 基础防御: 10, 基础血量: 10, 基础暴击: 0.01 },
    { level_id: 64, 基础攻击: 100, 基础防御: 200, 基础血量: 300, 基础暴击: 0.2 },
  ],
  physiqueLevels: [
    { level_id: 1, 基础攻击: 5, 基础防御: 5, 基础血量: 5, 基础暴击: 0.01 },
    { level_id: 63, 基础攻击: 50, 基础防御: 60, 基础血量: 70, 基础暴击: 0.1 },
  ],
  secretLevels: [
    { level_id: 10, level: '大能', 基础攻击: 1000, 基础防御: 1000, 基础血量: 1000 },
    { level_id: 11, level: '斩道', 基础攻击: 2000, 基础防御: 2000, 基础血量: 2000 },
    { level_id: 15, level: '准帝', 基础攻击: 5000, 基础防御: 5000, 基础血量: 5000 },
    { level_id: 16, level: '大帝', 基础攻击: 8000, 基础防御: 8000, 基础血量: 8000 },
    { level_id: 17, level: '红尘仙', 基础攻击: 12000, 基础防御: 12000, 基础血量: 12000 },
  ],
  ancientLevels: [{ level_id: 1, level: '普通人', 基础攻击: 0, 基础防御: 0, 基础血量: 0 }],
  equipmentList: [
    { name: '烂铁匕首', type: '武器', atk: 100, def: 0, HP: 0, bao: 0.01 },
    { name: '破铜护具', type: '护具', atk: 0, def: 100, HP: 0, bao: 0.01 },
    { name: '廉价炮仗', type: '法宝', atk: 0, def: 0, HP: 100, bao: 0.01 },
  ],
  specialEquipmentList: [
    { name: '更好的法宝', class: '装备', type: '法宝', atk: 200, def: 200, HP: 200, bao: 0.1 },
  ],
  imperialWeaponList: [
    { name: '废铁', class: '装备', type: '帝兵', atk: 0, def: 0, HP: 0, bao: 0, 全属性: 0 },
  ],
  techniqueList: [{ name: '新功法', class: '功法' }],
};

test('天骄每两千年才尝试突破，时代和关隘会压低概率', () => {
  assert.equal(isTianjiaoBreakthroughYear(1000), false);
  assert.equal(isTianjiaoBreakthroughYear(2000), true);

  const myth = getTianjiaoBreakthroughChance('mijinglevel_id', 9, 0);
  assert.ok(myth > getTianjiaoBreakthroughChance('mijinglevel_id', 9, 1));
  assert.ok(getTianjiaoBreakthroughChance('mijinglevel_id', 9, 1) > getTianjiaoBreakthroughChance('mijinglevel_id', 9, 2));
  assert.ok(getTianjiaoBreakthroughChance('mijinglevel_id', 9, 2) > getTianjiaoBreakthroughChance('mijinglevel_id', 9, 3));
  assert.ok(getTianjiaoBreakthroughChance('mijinglevel_id', 9, 3) > getTianjiaoBreakthroughChance('mijinglevel_id', 9, 4));

  assert.ok(myth > getTianjiaoBreakthroughChance('mijinglevel_id', 10, 0));
  assert.ok(getTianjiaoBreakthroughChance('mijinglevel_id', 10, 0) > getTianjiaoBreakthroughChance('mijinglevel_id', 11, 0));
  assert.ok(getTianjiaoBreakthroughChance('mijinglevel_id', 14, 0) > getTianjiaoBreakthroughChance('mijinglevel_id', 15, 0));
  assert.ok(getTianjiaoBreakthroughChance('mijinglevel_id', 15, 0) > getTianjiaoBreakthroughChance('mijinglevel_id', 16, 0));
  assert.ok(getTianjiaoBreakthroughChance('mijinglevel_id', 16, 3) < 0.001);
  assert.equal(getTianjiaoBreakthroughChance('mijinglevel_id', 16, 4), 0);
  assert.equal(getTianjiaoBreakthroughChance('xiangulevel_id', 15, 4), 0);

  const tianjiao = { 名号: '测试天骄', mijinglevel_id: 15, xiangulevel_id: 1 };
  const result = attemptTianjiaoBreakthrough(tianjiao, context, () => 0);
  assert.equal(result.newRealm, '大帝');
  assert.equal(tianjiao.mijinglevel_id, 16);
});

test('遮天与九天十地天骄按满练气、满炼体和自身境界生成属性', () => {
  const stats = buildTianjiaoBattleStats({
    名号: '测试天骄',
    位面: 2,
    攻击: 999999999,
    防御: 999999999,
    血量上限: 999999999,
    mijinglevel_id: 10,
    xiangulevel_id: 1,
    暴击率: 0.5,
  }, context);

  assert.equal(stats.level_id, 64);
  assert.equal(stats.Physique_id, 63);
  assert.equal(stats.攻击, 1250);
  assert.equal(stats.防御, 1360);
  assert.equal(stats.血量上限, 1470);
  assert.equal(stats.装备.武器.name, '烂铁匕首');
  assert.equal(stats.装备.帝兵.name, '废铁');
});

test('每千年自强保持高概率，单次最多完成四种行为', () => {
  assert.ok(getTianjiaoImprovementChance(0) > getTianjiaoImprovementChance(4));
  assert.ok(getTianjiaoImprovementChance(4) > 0.5);

  const tianjiao = {
    名号: '测试天骄',
    位面: 2,
    mijinglevel_id: 10,
    xiangulevel_id: 1,
    学习的功法: [],
  };
  const reports = improveTianjiao(tianjiao, context, () => 0.99);
  assert.equal(reports.length, 4);
  assert.equal(tianjiao.装备.法宝.name, '更好的法宝');
  assert.equal(tianjiao.装备.帝兵.name, '测试天骄·本命道兵');
  assert.ok(tianjiao.攻击加成 > 0);
  assert.deepEqual(tianjiao.学习的功法, ['新功法']);

  applyTianjiaoImprovement(tianjiao, 'equipment', context, () => 0);
  assert.ok(tianjiao.装备.武器.归一属性.百分比.atk > 0);
});
