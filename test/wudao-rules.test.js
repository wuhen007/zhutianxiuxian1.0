import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DAO_DAILY_LIMIT,
  DAO_REALM_RULES,
  XIANGU_DAO_REALM_RULES,
  calculateWudaoResult,
  consumePlayerLifespan,
  ensureDaoPath,
  getAvailableLifespan,
  getDaoGateState,
  getDaoStage,
  getTechniqueWudaoProfile,
  getXianguDaoGateState,
  getWudaoResourceCosts,
  recordDaoAttempt,
  refreshDaoDaily,
} from '../apps/User/wudaoRules.js';
import {
  WUDAO_TEA_ITEM,
  findWudaoTeaItem,
  isWudaoTeaItem,
} from '../apps/User/wudaoTea.js';

function sequenceRandom(values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

test('仙古悟道法则与两体系合计成本按配置计算', () => {
  assert.deepEqual(
    XIANGU_DAO_REALM_RULES.map(rule => [rule.realmId, rule.name]),
    [
      [9, '真神法则'],
      [10, '神王道则'],
      [11, '天规'],
      [12, '玄虚'],
      [13, '唯我'],
      [14, '归元'],
      [15, '无上'],
    ],
  );

  assert.deepEqual(getWudaoResourceCosts(11, 1), {
    mijing: 11,
    xiangu: 1,
    levelSum: 12,
    potential: 1200,
    cultivation: 288000000,
    blood: 288000000,
    lifespan: 2400000,
    spirit: 120000000,
  });

  const player = { xiangulevel_id: 9 };
  assert.equal(getXianguDaoGateState(player, 9).ok, false);
  player.仙古道途.stages.trueGodLaw = 600;
  assert.equal(getXianguDaoGateState(player, 9).ok, true);
});

test('五层己道的经验、单次收益与寿元消耗按境界递进', () => {
  assert.deepEqual(
    DAO_REALM_RULES.map(rule => [
      rule.realmId,
      rule.name,
      rule.targetExp,
      rule.baseGain,
      rule.lifespanCost,
    ]),
    [
      [11, '王者道则', 600, 20, 200000],
      [12, '圣道法则', 1200, 40, 5000000],
      [13, '圣王法则', 2400, 80, 10000000],
      [14, '大圣法则', 4800, 160, 20000000],
      [15, '准帝法则', 9600, 320, 150000000],
    ]
  );
});

test('法则阶段按初悟、小成、大成、圆满递进', () => {
  const rule = DAO_REALM_RULES[0];
  assert.equal(getDaoStage(0, rule).name, '初悟');
  assert.equal(getDaoStage(100, rule).name, '小成');
  assert.equal(getDaoStage(300, rule).name, '大成');
  assert.equal(getDaoStage(600, rule).name, '圆满');
});

test('老玩家补齐已走过的道途，当前境界从大成继续', () => {
  const player = { mijinglevel_id: 13 };
  const result = ensureDaoPath(player);

  assert.equal(result.migrated, true);
  assert.equal(player.道途.stages.kingDao, 600);
  assert.equal(player.道途.stages.saintDao, 1200);
  assert.equal(player.道途.stages.saintKingDao, 1200);
  assert.equal(player.道途.stages.greatSaintDao, undefined);
});

test('带有新存档标记的玩家不会获得老玩家回填', () => {
  const player = {
    mijinglevel_id: 13,
    道途: { version: 1, stages: {}, daily: { date: '', count: 0 } },
  };
  const result = ensureDaoPath(player);

  assert.equal(result.migrated, false);
  assert.deepEqual(player.道途.stages, {});
});

test('悟道收益叠加体质、时代、天资、功法和命格并受上限约束', () => {
  const result = calculateWudaoResult({
    rule: DAO_REALM_RULES[0],
    physiqueName: '混沌体',
    eraIndex: 0,
    aptitudeName: '绝世天骄',
    techniqueBonus: 0.2,
    minggeEffects: { 悟道收益: 0.1, 顿悟概率: 0.1 },
    random: sequenceRandom([0.5, 0.99]),
  });

  assert.equal(result.multiplier, 2.15);
  assert.equal(result.gain, 43);
  assert.equal(result.enlightened, false);

  const capped = calculateWudaoResult({
    rule: DAO_REALM_RULES[0],
    physiqueName: '先天混沌圣体道胎',
    eraIndex: 0,
    aptitudeName: '无演无尽',
    techniqueBonus: 0.5,
    minggeEffects: { 悟道收益: 1 },
    useTea: true,
    random: sequenceRandom([0.5, 0.99]),
  });
  assert.equal(capped.multiplier, 2.5);
});

test('顿悟翻倍收益，命格可调整悟道寿元消耗', () => {
  const result = calculateWudaoResult({
    rule: DAO_REALM_RULES[0],
    minggeEffects: { 悟道寿元消耗减少: 0.15 },
    random: sequenceRandom([0.5, 0]),
  });

  assert.equal(result.enlightened, true);
  assert.equal(result.gain, 40);
  assert.equal(result.lifespanCost, 170000);
});

test('功法只采用已学功法中的最高悟道加成', () => {
  const profile = getTechniqueWudaoProfile(['普通功法', '帝经甲'], {
    gongfaList: [
      { name: '普通功法', type: '功法' },
      { name: '帝经甲', type: '帝经' },
      { name: '未学习仙法', type: '仙帝法' },
    ],
  });

  assert.deepEqual(profile, { name: '帝经甲', bonus: 0.2 });
});

test('绝灵压制期间从真实寿元扣除，显示寿元不反向回涨', () => {
  const player = { 寿元: 9999, 压制寿元: 1000000 };
  assert.equal(getAvailableLifespan(player), 1000000);
  assert.equal(consumePlayerLifespan(player, 200000), true);
  assert.equal(player.压制寿元, 800000);
  assert.equal(player.寿元, 9999);
  assert.equal(consumePlayerLifespan(player, 800000), false);
});

test('每日悟道次数按上海日期重置并限制为三次', () => {
  const path = { daily: { date: '2026-07-24', count: DAO_DAILY_LIMIT } };
  assert.equal(refreshDaoDaily(path, '2026-07-25'), true);
  assert.equal(path.daily.count, 0);
  assert.equal(recordDaoAttempt(path, '2026-07-25'), 1);
});

test('渡劫门槛只校验当前法则圆满且不消耗进度', () => {
  const player = { mijinglevel_id: 11 };
  const initial = getDaoGateState(player, 11);
  assert.equal(initial.ok, false);
  assert.equal(initial.exp, 300);

  player.道途.stages.kingDao = 600;
  const complete = getDaoGateState(player, 11);
  assert.equal(complete.ok, true);
  assert.equal(player.道途.stages.kingDao, 600);
});

test('悟道优先消耗正式茶叶并兼容旧版茶树和茶叶名称', async () => {
  const inventory = new Set(['悟道古茶树', '悟道茶叶', WUDAO_TEA_ITEM]);
  assert.equal(await findWudaoTeaItem(name => inventory.has(name)), WUDAO_TEA_ITEM);

  inventory.delete(WUDAO_TEA_ITEM);
  assert.equal(await findWudaoTeaItem(name => inventory.has(name)), '悟道茶叶');
  assert.equal(isWudaoTeaItem('悟道古茶树'), true);

  const itemFile = new URL('../resources/data/item/道具列表.json', import.meta.url);
  const items = JSON.parse(readFileSync(itemFile, 'utf8'));
  const teaLeaf = items.find(item => item.name === WUDAO_TEA_ITEM);
  assert.equal(teaLeaf?.class, '道具');
  assert.equal(teaLeaf?.type, '悟道');
});
