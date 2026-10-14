import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMemoryRoot, getMemoryEffects, getMemoryStage, recordMemoryDungeon } from '../model/memoryPath.js';
import { getLifeSourceRepairMaximum } from '../model/lifeSourceRepair.js';
import { getLearningPotentialCost, getTeachingCosts, reserveTeachingCosts } from '../model/gongfaTeaching.js';
import { calculateEquipmentSetBonuses } from '../model/equipmentStats.js';
import { calculateWudaoResult, getAptitudeWudaoBonus, getPhysiqueWudaoBonus } from '../apps/User/wudaoRules.js';
import { calculateCropGrowthState } from '../apps/Garden/smallWorldGrowth.js';
import { getDungeonTimedActionMultiplier } from '../model/innateTreasure.js';
import { multiplySuiyunLoot } from '../model/suiyunLoot.js';
import { isItemPermanentlyNonTradeable } from '../model/equipmentTransfer.js';
import { getRefinementAvailability } from '../model/tianmoHuasheng.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const player = (stage = 2, factors = {}) => ({
  id: 'memory-economy', 灵根: createMemoryRoot(stage), 记忆命途: { 因子: factors },
  学习的功法: [], 仙道潜力: 0, 天资等级: '星神之资',
});

test('悟道使用真实因子上下文，修复本源按总量而非再加100，星神天资等同顶级', () => {
  const p = player(2, { 门径: 1, 浪漫: 2, 理性: 3 });
  assert.ok(Math.abs(getPhysiqueWudaoBonus(p.灵根.name, p) - .29) < 1e-12);
  assert.equal(getLifeSourceRepairMaximum(p), 900);
  assert.equal(getAptitudeWudaoBonus('星神之资'), getAptitudeWudaoBonus('无演无尽'));
  const result = calculateWudaoResult({ player: p, physiqueName: p.灵根.name,
    rule: { baseGain: 100, lifespanCost: 1 }, random: () => .5 });
  assert.ok(Math.abs(result.bonuses.physique - .29) < 1e-12);
  assert.equal(getLifeSourceRepairMaximum(player(3, { 门径: 1, 理性: 3 })), 1400);
  assert.equal(getLifeSourceRepairMaximum({ 灵根: { name: '凡体', 生命本源: 10 } }), 110);
});

test('理性学习半价/免费同时影响传功目标潜力，施法者元神成本保留', () => {
  assert.deepEqual([0, 1, 2, 3].map(tier => getLearningPotentialCost(player(2, { 理性: tier }), 9)), [9, 5, 0, 0]);
  assert.deepEqual(getTeachingCosts(8, player(2, { 理性: 2 })), { potential: 0, spirit: 8100000 });
  assert.equal(reserveTeachingCosts({ remainingPotential: 0, remainingSpirit: 8100000 }, 8, player(2, { 理性: 2 })).ok, true);
  assert.equal(reserveTeachingCosts({ remainingPotential: 0, remainingSpirit: 0 }, 8, player(2, { 理性: 3 })).reason, 'spirit');
  const app = read('apps/User/zhengdaotixi.js');
  assert.match(app, /24 \* getMemoryEffects\(caster\)\.teachCooldownMultiplier/);
});

test('真实一键学习免费时仍保存已学功法，不受星神天资默认低阶限制', async () => {
  const source = read('apps/User/UserSellAll.js');
  const start = source.indexOf('async all_learn(e)');
  const end = source.indexOf('async regressionLegacy(', start);
  let stored = player(3, { 理性: 2 });
  let saved = 0;
  const inventory = [{ name: '记忆测试仙帝法', type: '仙帝法', 数量: 1 }];
  const bindings = { getLearningPotentialCost,
    verc: () => true, channel: async id => id, existplayer: async () => true,
    data: { getData: async () => ({ 功法: inventory }) },
    Read_player: async () => structuredClone(stored),
    Write_player: async (_id, value) => { stored = structuredClone(value); saved++; },
    Add_najie_thing: async (_id, _name, _class, amount) => { inventory[0].数量 += amount; },
    player_efficiency: async () => {},
  };
  const method = new Function(...Object.keys(bindings), `return ({${source.slice(start, end)}}).all_learn;`)(...Object.values(bindings));
  await method({ user_id: 'test', reply: async () => {} });
  assert.equal(saved, 1);
  assert.deepEqual(stored.学习的功法, ['记忆测试仙帝法']);
  assert.equal(stored.仙道潜力, 0);
  assert.equal(inventory[0].数量, 0);
});

test('浪漫三套按完整匹配与因子等级各给一份300/600/1300%加成', () => {
  const sets = [['逐火之刃', '逐火之甲', '逐火圣杖', 9610101, 3], ['泰坦之刃', '泰坦胸甲', '泰坦权杖', 9610104, 6], ['星神长弓', '星神圣衣', '星神权杖', 9610107, 13]];
  sets.forEach(([weapon, armor, treasure, id, bonus], index) => {
    const p = player(4, { 浪漫: index + 1 });
    const equipment = { 武器: { name: weapon, id }, 护具: { name: armor, id: id + 1 }, 法宝: { name: treasure, id: id + 2 } };
    assert.deepEqual(calculateEquipmentSetBonuses(p, equipment), { 攻: bonus, 防: bonus, 血: bonus });
    equipment.法宝.id = -1;
    assert.deepEqual(calculateEquipmentSetBonuses(p, equipment), { 攻: 0, 防: 0, 血: 0 });
  });
});

test('门径正常与沉迷分别除2/3/5，独立于原50%减时上限', () => {
  const source = read('apps/SecretPlace/SecretPlaceplus.js');
  const start = source.indexOf('function applyAddictionGongfaReduction(');
  const end = source.indexOf('/**', start);
  const helper = new Function('getMemoryEffects', 'getDungeonGongfaReduction', `${source.slice(start, end)};return applyAddictionGongfaReduction;`)(getMemoryEffects, () => ({ rate: 0 }));
  for (const [tier, speed] of [[1, 2], [2, 3], [3, 5]]) {
    const p = player(2, { 门径: tier });
    assert.equal(getDungeonTimedActionMultiplier(p), 1 / speed);
    assert.equal(helper(p, 100, 100, []), 100 / speed);
    assert.equal(helper(p, 100, 10, []), 50 / speed);
  }
});

test('总体掉落加成只进入生成物，不复制唯一品；海洋各阶段额外2/3/4倍', () => {
  const p = player(2, { 海洋: 1, 门径: 1, 大地: 1 });
  assert.equal(multiplySuiyunLoot(p, { name: '普通材料' }, 2), 10);
  assert.equal(multiplySuiyunLoot(p, { name: '唯一物', 全服唯一: true }, 1), 1);
  assert.deepEqual([1, 2, 3].map(tier => getMemoryEffects(player(4, { 海洋: tier })).fishingMultiplier), [2, 3, 4]);
  assert.match(read('apps/User/UserHome.js'), /lootMultiplier \* getMemoryEffects\(player\)\.fishingMultiplier/);
});

test('大地播种倍率保留为快照，三档成熟时间与老作物默认不变', () => {
  const world = { attributes: { 灵气浓度: 1000, 时间流速: '1:1' } };
  const seed = { requirements: { 灵气浓度: 1000 } };
  for (const multiplier of [1, 1.5, 2, 3]) {
    const crop = { 种植时间: new Date(0).toISOString(), 记忆生长倍率: multiplier };
    const before = calculateCropGrowthState(crop, seed, world, 14400000 / multiplier - 1);
    const mature = calculateCropGrowthState(crop, seed, world, 14400000 / multiplier);
    assert.equal(before.isMature, false);
    assert.equal(mature.isMature, true);
  }
  assert.equal(calculateCropGrowthState({ 种植时间: new Date(0).toISOString() }, seed, world, 7200000).isMature, false);
});

test('实际收获返种概率按大地倍率提升，最大100%且返1颗', async () => {
  const source = read('apps/Garden/xiaoshijie.js');
  const start = source.indexOf('async harvestCropBonus(');
  const end = source.indexOf('// ═', start);
  for (const [tier, chance, shouldReturn] of [[1, .14, true], [1, .16, false], [2, .19, true], [3, .29, true]]) {
    const awards = [];
    const bindings = { getMemoryEffects, Read_player: async () => player(4, { 大地: tier }),
      getSmallWorldYieldMultiplier: () => 1, isWudaoTeaItem: () => false,
      Add_najie_thing: async (_id, name, kind, amount) => awards.push({ name, kind, amount }),
      Math: Object.assign(Object.create(Math), { random: () => chance }),
    };
    const method = new Function(...Object.keys(bindings), `return ({${source.slice(start, end)}}).harvestCropBonus;`)(...Object.values(bindings));
    const result = await method.call({ calculateHarvestBonuses: () => ({ extraYield: 0, seedReturnChance: 10 }) }, 'fixture', {}, { name: '种子', harvest: '神药' });
    assert.equal(result.seedReturned, shouldReturn);
    assert.equal(awards.filter(item => item.kind === '草药').reduce((sum, item) => sum + item.amount, 0), shouldReturn ? 1 : 0);
  }
});

test('天空护持在真实天魔资格检查前拦截本源炼化，边界为超出3/4/5级才可', () => {
  for (const [tier, gap] of [[1, 3], [2, 4], [3, 5]]) {
    const target = { ...player(4, { 天空: tier }), mijinglevel_id: 12 };
    const caster = { id: 'caster', 灵根: { name: '极道天魔', type: '天魔', 生命本源: 150 }, 学习的功法: ['天魔化生功'], mijinglevel_id: 12 + gap };
    assert.match(getRefinementAvailability(caster, target.id, 1e12, target).reason, /天空因子/);
    caster.mijinglevel_id++;
    assert.equal(getRefinementAvailability(caster, target.id, 1e12, target).ok, true);
  }
});

test('真实单次入场记录并发重试只增5，沉迷记录按实结算轮数去重', async () => {
  const source = read('apps/SecretPlace/SecretPlace.js');
  const start = source.indexOf('async function recordMemoryEntry(');
  const end = source.indexOf('\nasync function replyPlaneDestroyed', start);
  let stored = player();
  const bindings = { getMemoryStage, recordMemoryDungeon, withPlayerMutationLock,
    Read_player: async () => structuredClone(stored), Write_player: async (_id, value) => { stored = structuredClone(value); },
  };
  const helper = new Function(...Object.keys(bindings), `${source.slice(start, end)};return recordMemoryEntry;`)(...Object.values(bindings));
  const action = { taskId: 'entry-proof', Place_address: { name: '测试秘境' } };
  await Promise.all([helper('fixture', action), helper('fixture', action)]);
  assert.equal(stored.模拟值, 5);
  const plus = read('apps/SecretPlace/SecretPlaceplusTask.js');
  const from = plus.indexOf('// 结算后更新动作状态');
  const to = plus.indexOf('if (options.taskId', from);
  const round = new Function('recordMemoryDungeon', 'player', 'action', 'weizhi', plus.slice(from, to));
  const roundAction = { taskId: 'batch-proof', settled_count: 0 };
  round(recordMemoryDungeon, stored, roundAction, { name: '测试秘境' });
  assert.equal(stored.模拟值, 10);
  roundAction.settled_count = 0;
  round(recordMemoryDungeon, stored, roundAction, { name: '测试秘境' });
  assert.equal(stored.模拟值, 10);
});

test('律法真实胜利保底按三档发放，身份相同重试复用物品与幂等键', async () => {
  for (const file of ['SecretPlaceTask.js', 'SecretPlaceplusTask.js']) {
    const source = read(`apps/SecretPlace/${file}`);
    const start = source.indexOf('for (const tier of getMemoryEffects(player).guaranteedDrops)');
    const end = source.indexOf('const zhetianResult', start);
    const sent = [];
    const award = new Function('getMemoryEffects', 'isItemPermanentlyNonTradeable', 'Add_najie_thing', 'recordItemToHistory', 'player', 'action', 'weizhi', 'thing_name', `return (async()=>{let last_msg='';const player_id='law',n=1;${source.slice(start, end)}})();`);
    const args = [getMemoryEffects, isItemPermanentlyNonTradeable, async (...params) => sent.push(params), async () => {}, player(4, { 律法: 3 }), { taskId: 'law-round', settled_count: 0 },
      { name: '测试秘境', one: [{ name: '低奖', class: '材料' }], two: [{ name: '中奖', class: '材料' }], three: [{ name: '唯一', class: '道具', 全服唯一: true }, { name: '高奖', class: '材料' }] }];
    await award(...args); await award(...args);
    assert.deepEqual(sent.slice(0, 3).map(params => params[1]), ['低奖', '中奖', '高奖']);
    assert.deepEqual(sent.slice(0, 3).map(params => params[6].idempotencyKey), sent.slice(3).map(params => params[6].idempotencyKey));
    assert.ok(sent.every(params => params[6].idempotencyKey.startsWith('memory-law:')));
    assert.ok(source.includes('记忆命途: structuredClone(player.记忆命途)'));
    sent.length = 0;
    await award(...args, '低奖');
    assert.deepEqual(sent.map(params => params[1]), ['中奖', '高奖']);
  }
});

test('秘境奇遇认可星神之资为最高天资，不因旧天资兼容逻辑将其降级', async () => {
  for (const file of ['SecretPlaceTask.js', 'SecretPlaceplusTask.js']) {
    const source = read(`apps/SecretPlace/${file}`);
    const start = source.indexOf('aptitudeEncounter: {');
    const end = source.indexOf('if (random > 0.1 && random < 0.1002)', start);
    const p = player();
    p.天资等级 = '星神之资';
    let writes = 0;
    const encounter = new Function('player', 'Write_player', `return (async()=>{let last_msg='';const random=0,usr_qq='fixture',B_player={名号:'试炼投影'};${source.slice(start, end)};return last_msg;})();`);
    const message = await encounter(p, async () => { writes++; });
    assert.equal(p.天资等级, '星神之资');
    assert.equal(writes, 0);
    assert.match(message, /资质已臻至境/);
  }
});
