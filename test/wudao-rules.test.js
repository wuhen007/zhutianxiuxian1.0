import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DAO_DAILY_LIMIT,
  DAO_REALM_RULES,
  XIANGU_DAO_REALM_RULES,
  completeDaoByNineLives,
  calculateWudaoAttempt,
  calculateWudaoResult,
  createCultivationSystem,
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
    XIANGU_DAO_REALM_RULES.map(rule => [rule.realmId, rule.name, rule.yuanshenLevel]),
    [
      [9, '真神法则', 2],
      [10, '神王道则', 2],
      [11, '天规', 3],
      [12, '玄虚', 4],
      [13, '唯我', 5],
      [14, '归元', 6],
      [15, '无上', 7],
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

test('人道至红尘仙后高境己道的经验、收益与寿元消耗按境界递进', () => {
  assert.deepEqual(
    DAO_REALM_RULES.map(rule => [
      rule.realmId,
      rule.name,
      rule.targetExp,
      rule.baseGain,
      rule.lifespanCost,
      rule.yuanshenLevel,
    ]),
    [
      [11, '王者道则', 600, 20, 200000, 2],
      [12, '圣道法则', 1200, 40, 5000000, 3],
      [13, '圣王法则', 2400, 80, 10000000, 4],
      [14, '大圣法则', 4800, 160, 20000000, 5],
      [15, '准帝法则', 9600, 320, 150000000, 6],
      [17, '红尘仙道', 19200, 640, 300000000, 8],
      [18, '仙王道则', 38400, 1280, 600000000, 9],
      [19, '诸天道则', 76800, 2560, 1200000000, 10],
    ]
  );
});

test('九世圆满自动补齐此前大道，红尘仙后的悟道节点从零开始', () => {
  const player = { mijinglevel_id: 17, 道途: { version: 2, stages: {}, daily: { date: '', count: 0 } } };
  const result = completeDaoByNineLives(player, '羽化道果', 123);
  assert.equal(result.name, '九世圆满·羽化道果');
  assert.equal(player.道途.stages.quasiEmperorDao, 9600);
  assert.equal(player.道途.stages.redDustImmortalDao, undefined);
});

test('仙王巨头圆满诸天道则后才能合道开创体系', () => {
  const player = {
    名号: '测试者',
    mijinglevel_id: 19,
    道途: {
      version: 2,
      stages: { giantDaoPrototype: 76800 },
      daily: { date: '', count: 0 },
    },
  };
  const result = createCultivationSystem(player, '万象', 456);
  assert.equal(result.ok, true);
  assert.equal(result.system.name, '万象体系');
  assert.equal(player.自创修炼体系.name, '万象体系');
  assert.equal(createCultivationSystem(player, '重复').reason, 'exists');
});

test('悟道要求匹配元神境界，失败随机损耗且古茶将损耗减半', () => {
  assert.equal(calculateWudaoAttempt({
    requiredYuanshenLevel: 4,
    currentYuanshenLevel: 3,
  }).allowed, false);

  const success = calculateWudaoAttempt({
    requiredYuanshenLevel: 4,
    currentYuanshenLevel: 4,
    random: sequenceRandom([0.69]),
  });
  assert.equal(success.successChance, 0.7);
  assert.equal(success.success, true);
  assert.equal(success.resourceCostRate, 1);

  const fullLoss = calculateWudaoAttempt({
    requiredYuanshenLevel: 4,
    currentYuanshenLevel: 4,
    random: sequenceRandom([0.7, 0.999]),
  });
  assert.equal(fullLoss.success, false);
  assert.equal(fullLoss.baseLossPercent, 100);
  assert.equal(fullLoss.resourceCostRate, 1);

  const teaLoss = calculateWudaoAttempt({
    requiredYuanshenLevel: 4,
    currentYuanshenLevel: 4,
    useTea: true,
    random: sequenceRandom([0.7, 0.999]),
  });
  assert.equal(teaLoss.baseLossPercent, 100);
  assert.equal(teaLoss.resourceCostRate, 0.5);

  const noLoss = calculateWudaoAttempt({
    requiredYuanshenLevel: 4,
    currentYuanshenLevel: 5,
    random: sequenceRandom([0.75, 0]),
  });
  assert.equal(noLoss.successChance, 0.75);
  assert.equal(noLoss.success, false);
  assert.equal(noLoss.resourceCostRate, 0);
});

test('悟道业务入口执行元神门槛与失败资源扣除', () => {
  const source = readFileSync(new URL('../apps/User/Level.js', import.meta.url), 'utf8');
  assert.match(source, /currentYuanshenLevel < rule\.yuanshenLevel/);
  assert.match(source, /calculateWudaoAttempt\(\{/);
  assert.match(source, /Math\.floor\(potentialCost \* attempt\.resourceCostRate\)/);
  assert.match(source, /if \(!attempt\.success\)/);
  assert.match(source, /古茶庇护，原损失\$\{attempt\.baseLossPercent\}%减半/);
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

test('高境老存档回填已走过节点，当前红尘仙节点不预填半程', () => {
  const player = { mijinglevel_id: 17, 道途: { version: 1, stages: {}, daily: { date: '', count: 0 } } };
  ensureDaoPath(player);
  assert.equal(player.道途.stages.redDustImmortalDao, 0);
  assert.equal(player.道途.stages.giantDaoPrototype, undefined);
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
