import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createMemoryRoot, getMemoryEffects, MEMORY_FACTORS } from '../model/memoryPath.js';
import { createSuiyunRoot, getSuiyunEffects } from '../model/suiyun.js';
import { addMemoryLootBonus, multiplySuiyunLoot } from '../model/suiyunLoot.js';
import * as rift from '../model/lingjieRift.js';
import { isItemPermanentlyNonTradeable } from '../model/equipmentTransfer.js';
import { rollTianjiaoDropAmount } from '../model/tianjiaoHostility.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const player = (count = 6, tier = 1) => ({
  灵根: createMemoryRoot(4), 记忆命途: { 因子: Object.fromEntries(MEMORY_FACTORS.slice(0, count).map(name => [name, tier])) },
  饱食度: 10000, level_id: 41,
});
const evaluate = (source, dependencies) => new Function(...Object.keys(dependencies), source)(...Object.values(dependencies));

test('每六泰坦增加一倍，最多四倍且黄金强化均不再额外加件', () => {
  const item = { name: '普通材料' };
  for (const tier of [1, 2]) for (const count of [5, 6, 12]) {
    assert.equal(multiplySuiyunLoot(player(count, tier), item, 100), 200);
    assert.equal(addMemoryLootBonus(player(count, tier), item, 100), 100);
  }
  for (const [count, expected] of [[0, 200], [5, 200], [6, 300], [11, 300], [12, 400]]) {
    assert.equal(multiplySuiyunLoot(player(count, 3), item, 100), expected);
  }
  assert.equal(multiplySuiyunLoot(player(12, 3), item, 1), 4);
  assert.equal(multiplySuiyunLoot(player(12, 3), item, 10), 40);
  assert.equal(addMemoryLootBonus(player(6), item, -1), -1);
  assert.equal(addMemoryLootBonus(player(6), item, 0), 0);
  for (const protectedItem of [{ 全服唯一: true }, { 不可交易: true }, { 大道至宝本体: true }]) {
    assert.equal(addMemoryLootBonus(player(6), protectedItem, 1), 1);
    assert.equal(multiplySuiyunLoot(player(6), protectedItem, 1), 1);
  }
});

test('天骄普通特殊及贡献掉落跳过记忆加成，保留岁云加成和唯一品幂等', async () => {
  const source = read('apps/Boss/BOSS4.js');
  const from = source.indexOf('  async distributeNormalBattleDrops(');
  const end = source.indexOf('  async AcceptTianjiaoSurrender(', from);
  // 只取发奖方法，避开其后的求饶读写方法。
  const grantEnd = source.indexOf('\n  }', source.indexOf('  async grantTianjiaoDrop(', from)) + '\n  }'.length;
  assert.ok(end > from && grantEnd > from);
  for (const [stage, factors, expected] of [
    [1, {}, 10], [2, {}, 10], [3, {}, 10],
    [4, Object.fromEntries(MEMORY_FACTORS.slice(0, 6).map(name => [name, 1])), 10],
    [4, Object.fromEntries(MEMORY_FACTORS.slice(0, 6).map(name => [name, 3])), 10],
    [4, Object.fromEntries(MEMORY_FACTORS.map(name => [name, 3])), 10],
    ['suiyun', {}, 100],
  ]) {
    const p = { 灵根: stage === 'suiyun' ? createSuiyunRoot(5) : createMemoryRoot(stage), 记忆命途: { 因子: factors } };
    const receipts = new Set(), inventory = new Map();
    let calls = 0;
    const deps = {
      Read_player: async () => p, rollTianjiaoDropAmount, Math: Object.assign(Object.create(Math), { random: () => 0 }),
      multiplySuiyunLoot: (...args) => {
        assert.deepEqual(args[3], { memory: false });
        calls++; return multiplySuiyunLoot(...args);
      },
      Add_najie_thing: async (_id, name, _class, amount, _quality, _bonus, options) => {
        if (receipts.has(options.idempotencyKey)) return 0;
        receipts.add(options.idempotencyKey);
        inventory.set(name, (inventory.get(name) || 0) + amount);
      },
    };
    const body = source.slice(from, grantEnd).replace(/}\r?\n\r?\n  async grantTianjiaoDrop/, '},\n  async grantTianjiaoDrop');
    const app = evaluate(`return ({${body}});`, deps);
    app.getTianjiaoRewardIdempotencyKey = (_name, battleId, _qq, kind, index) => `${battleId}:${kind}:${index}`;
    const target = { 掉落物: [{ name: '普通材料', class: '材料', 数量: 10, 概率: 1 },
      { name: '唯一道具', class: '道具', 全服唯一: true, 数量: 1, 概率: 1 }] };
    await app.distributeNormalBattleDrops({ reply: async () => {} }, '测试天骄', target, 'owner', 1, 'battle');
    assert.equal(inventory.get('普通材料'), expected);
    assert.equal(inventory.get('唯一道具'), 1);
    assert.equal(calls, 2);
    await app.distributeNormalBattleDrops({ reply: async () => {} }, '测试天骄', target, 'owner', 1, 'battle');
    assert.equal(inventory.get('普通材料'), expected);
    assert.equal(inventory.get('唯一道具'), 1);
    await app.grantTianjiaoDrop('owner', { name: '特殊材料', class: '材料' }, 10, 'special-drop');
    await app.grantTianjiaoDrop('owner', { name: '特殊材料', class: '材料' }, 10, 'special-drop');
    assert.equal(inventory.get('特殊材料'), expected);
    const randomStart = source.indexOf('  async giveRandomItems(');
    app.giveRandomItems = evaluate(`return ({${source.slice(randomStart, source.indexOf('  async getPlayerName(', randomStart))}}).giveRandomItems;`, deps);
    for (const kind of ['contribution', 'killer-extra']) {
      const contributionTarget = { 名号: '测试天骄', 掉落物: [target.掉落物[0]] };
      await app.giveRandomItems('owner', contributionTarget, 1, 'battle', kind);
      await app.giveRandomItems('owner', contributionTarget, 1, 'battle', kind);
    }
    assert.equal(inventory.get('普通材料'), expected * 3);
  }
});

test('天骄求饶赔礼跳过记忆加成，保留岁云倍率且重复接受不增发', async () => {
  const source = read('apps/Boss/BOSS4.js');
  const start = source.indexOf('  async AcceptTianjiaoSurrender(');
  const end = source.indexOf('  async RefuseTianjiaoSurrender(', start);
  for (const [p, expected] of [[player(12, 3), 10], [{ 灵根: createSuiyunRoot(5) }, 100]]) {
    const values = new Map([['pending', 'offered'], ['hatred', '60']]);
    const inventory = new Map();
    const pending = { token: 'offer', tianjiaoName: '测试天骄', offer: { all: [
      { name: '赔礼材料', class: '材料', amount: 10 },
      { name: '唯一赔礼', class: '道具', 全服唯一: true, amount: 1 },
    ] } };
    const app = evaluate(`return ({${source.slice(start, end)}});`, {
      withPlayerMutationLock, multiplySuiyunLoot, Read_player: async () => p,
      Add_najie_thing: async (_id, name, _class, amount) => inventory.set(name, (inventory.get(name) || 0) + amount),
      redis: {
        get: async key => values.get(key), set: async (key, value) => values.set(key, value),
        del: async key => values.delete(key),
      },
    });
    Object.assign(app, {
      readPendingEncounter: async () => values.has('pending') ? pending : null,
      claimPendingEncounter: async () => true,
      getHatredKey: () => 'hatred', getPendingEncounterKey: () => 'pending',
      updateTianjiaoHatredStatus: async () => {},
    });
    const event = { user_id: 'owner', reply: async message => message };
    const message = await app.AcceptTianjiaoSurrender(event);
    await app.AcceptTianjiaoSurrender(event);
    assert.equal(inventory.get('赔礼材料'), expected);
    assert.equal(inventory.get('唯一赔礼'), 1);
    assert.ok(message.includes(`赔礼材料x${expected}`));
    assert.equal(values.get('hatred'), '30');
  }
});

test('域外灾厄满泰坦按四倍结算一次，因果奖励与重试不增殖', async () => {
  const source = read('apps/Boss/ForeignCalamity.js');
  const from = source.indexOf('  async grantReward('), to = source.indexOf('  async claimPendingRewards(', from);
  let p = { ...player(12, 3), 业力值: 100, 位面青睐: 0 };
  const inventory = new Map();
  let multiplications = 0;
  const deps = {
    withPlayerMutationLock, Read_player: async () => structuredClone(p),
    Write_player: async (_id, value) => { p = structuredClone(value); },
    multiplySuiyunLoot: (...args) => { multiplications++; return multiplySuiyunLoot(...args); },
    rememberPlayerHistory: (record, key) => { record[key] = Date.now(); },
    saveForeignCalamity: async () => {},
    Add_najie_thing: async (_id, name, _kind, amount) => { inventory.set(name, (inventory.get(name) || 0) + amount); },
    rewardGroupText: group => `${group.name}x${group.amount}`,
  };
  const grant = evaluate(`return ({${source.slice(from, to)}}).grantReward;`, deps);
  const entity = { id: 'memory-calamity-fixture', rewardPlan: {
    id: 'reward', groups: [{ name: '普通丹药', class: '丹药', type: 'item', amount: 2 }],
    karmaReduction: 20, planeFavor: 5,
  } };
  await grant('owner', entity);
  await grant('owner', entity);
  assert.equal(inventory.get('普通丹药'), 8);
  assert.equal(p.业力值, 80);
  assert.equal(p.位面青睐, 5);
  assert.equal(multiplications, 1);
});

function lootFixture(p = player()) {
  const grants = [], messages = [];
  return {
    grants, messages,
    dependencies: {
      player: p, usr_qq: 'fixture', getSuiyunEffects, getMemoryEffects, addMemoryLootBonus,
      foundthing: async name => ({ name }),
      Add_najie_thing: async (_qq, name, itemClass, amount) => grants.push({ name, itemClass, amount }),
      exist_najie_thing: async () => 1,
      e: { reply: message => messages.push(message) },
      redis: { set: async () => {} },
      Add_饱食度: async () => {}, Add_修为: async () => {}, Add_血气: async () => {},
    },
  };
}

test('众生海基础渔获与仙饵保留倍率，但均不再追加件数', async () => {
  const source = read('apps/User/UserHome.js');
  const start = source.indexOf('    n *= getSuiyunEffects(player).lootMultiplier');
  const end = source.indexOf('    const planeName = getPlayerPlaneName(player);', start);
  assert.ok(start >= 0 && end > start);
  const run = async (baitName = '', uniqueFlag = '') => {
    const f = lootFixture();
    const message = await evaluate(`return (async () => {
      let n = 1, rewardMsg = '', playerChanged = false;
      ${source.slice(start, end)}
      return rewardMsg;
    })();`, {
      ...f.dependencies, baitName, hasTideLamp: false, random: 0,
      rollWishScaleAmount: () => 1, rollBaitRewardAmount: () => 1,
      rollImmortalBaitReward: () => ({ name: '仙饵奖励', class: '道具', uniqueFlag }),
    });
    return { ...f, message };
  };
  const amountOf = (result, name) => result.grants.find(item => item.name === name)?.amount;
  const normal = await run();
  assert.equal(amountOf(normal, '仙晶矿'), 200);
  assert.equal(amountOf(normal, '仙饵奖励'), undefined);
  assert.match(normal.message, /仙晶矿】x200/);
  // 使用仙饵时基础产物与仙饵产物同时发放，均不再追加黄金额外件数。
  const bait = await run('测试仙饵');
  assert.equal(amountOf(bait, '仙晶矿'), 200);
  assert.equal(amountOf(bait, '仙饵奖励'), 2);
  assert.match(bait.message, /仙晶矿】x200/);
  assert.match(bait.message, /仙饵奖励】x2/);
  const unique = await run('测试仙饵', '唯一奖励已获');
  assert.equal(amountOf(unique, '仙晶矿'), 200);
  assert.equal(amountOf(unique, '仙饵奖励'), 1);
  assert.match(unique.message, /仙饵奖励】x1/);
});

test('海洋因子只加成基础渔获，仙饵产物不吃海洋垂钓倍率', async () => {
  const source = read('apps/User/UserHome.js');
  const start = source.indexOf('    n *= getSuiyunEffects(player).lootMultiplier');
  const end = source.indexOf('    const planeName = getPlayerPlaneName(player);', start);
  assert.ok(start >= 0 && end > start);
  const run = async oceanTier => {
    const p = player(6);
    if (oceanTier > 0) p.记忆命途.因子.海洋 = oceanTier;
    const f = lootFixture(p);
    const message = await evaluate(`return (async () => {
      let n = 1, rewardMsg = '', playerChanged = false;
      ${source.slice(start, end)}
      return rewardMsg;
    })();`, {
      ...f.dependencies, baitName: '测试仙饵', hasTideLamp: false, random: 0,
      rollWishScaleAmount: () => 1, rollBaitRewardAmount: () => 1,
      rollImmortalBaitReward: () => ({ name: '仙饵奖励', class: '道具' }),
    });
    return { ...f, message };
  };
  const amountOf = (result, name) => result.grants.find(item => item.name === name)?.amount;
  const withoutOcean = await run(0);
  const withOcean = await run(3);
  assert.equal(amountOf(withoutOcean, '仙晶矿'), 200);
  assert.equal(amountOf(withOcean, '仙晶矿'), 800);
  // 仙饵产物恒定，不随海洋因子放大。
  assert.equal(amountOf(withoutOcean, '仙饵奖励'), 2);
  assert.equal(amountOf(withOcean, '仙饵奖励'), 2);
  assert.match(withOcean.message, /仙饵奖励】x2/);
});

test('三处地图钓鱼不再追加件数，工具与地图消耗保持负一', async () => {
  const source = read('apps/User/UserHome.js');
  const start = source.indexOf('            const grantMapFishingLoot =');
  const end = source.indexOf('            if (thing_name == "低语森林")', start);
  assert.ok(start >= 0 && end > start);
  for (const [location, fish, lootName, amount] of [
    ['天臂池', 200, '经验瓶', 2], ['沉沦之海', 1000, '利维坦之心', 20], ['星落湖', 200, '钓鱼掉上来的奇怪盒子', 4],
  ]) {
    const f = lootFixture();
    await evaluate(`return (async () => { let n = 1; ${source.slice(start, end)} })();`, {
      ...f.dependencies, thing_name: location, quantity: 1, math: .95, now_Time: 1,
      xiuwei: 10, xueqi: 20, last_msg: '', fyd_msg: '', now_level_id: 41,
    });
    assert.equal(f.grants.find(item => item.name === '鱼肉').amount, fish, location);
    assert.equal(f.grants.find(item => item.name === lootName).amount, amount, location);
    assert.equal(f.grants.find(item => item.name === '钓鱼竿').amount, -1);
    assert.equal(f.grants.find(item => item.name === location).amount, -1);
    assert.ok(f.messages[0].includes(`鱼肉${fish}`));
    assert.ok(f.messages[0].includes(`${lootName}${amount}个`));
  }
});

test('结算卡两条物品结算路径均保留倍率但不再追加件数', async () => {
  const source = read('apps/User/UserSellAll.js');
  const starts = [...source.matchAll(/            n \*= getSuiyunEffects\(player\)\.lootMultiplier/g)].map(match => match.index);
  assert.equal(starts.length, 2);
  for (const start of starts) {
    const end = source.indexOf('            let xiuwei = 0;', start);
    assert.ok(end > start);
    const result = await evaluate(`return (async () => { let n = 100, m = '', last_msg = ''; ${source.slice(start, end)} return { n, m }; })();`, {
      ...lootFixture().dependencies, thing_name: '普通材料',
    });
    assert.equal(result.n, 200);
    assert.match(result.m, /×200个/);
  }
});

test('灵界裂缝主奖励和遗骸奖励使用最终数量，提示与入库一致', async () => {
  const source = read('apps/SecretPlace/LingjieRift.js');
  const f = lootFixture();
  const methods = {};
  for (const [name, next] of [['grantMainRewards', 'resolveAftermath'], ['grantCorpseLoot', 'pushInfo']]) {
    const start = source.indexOf(`  async ${name}(`);
    const end = source.indexOf(`  async ${next}(`, start);
    assert.ok(start >= 0 && end > start);
    methods[name] = evaluate(`return ({ ${source.slice(start, end)} }).${name};`, {
      ...rift, ...f.dependencies, data: { duanzhaocailiao: [{ name: '测试材料', class: '材料', 出售价: 1 }] },
      Math: Object.assign(Object.create(Math), { random: () => .99 }),
      pickRandom: list => list[0], randomInt: () => 2, rollCorpseExtras: () => ({}),
      Add_源石: async () => {},
    });
  }
  const p = player();
  const bonus = rift.resolveRiftRewardBonus(p, () => 1);
  assert.equal(bonus.multiplier, 2);
  assert.equal(bonus.lootBonus, 0);
  const main = await methods.grantMainRewards('fixture', bonus, p);
  assert.equal(f.grants.length, 3);
  assert.ok(f.grants.every(item => item.amount === 2));
  assert.ok(main.every(line => !line.includes('额外+')));
  const corpse = await methods.grantCorpseLoot('fixture', bonus, p);
  assert.equal(f.grants.find(item => item.name === '测试材料').amount, 4);
  assert.ok(corpse.includes('测试材料 ×4'));
});

test('普通与沉迷秘境保留倍率及扣损，各类奖励均不追加件数', async () => {
  for (const file of ['SecretPlaceTask.js', 'SecretPlaceplusTask.js']) {
    const source = read(`apps/SecretPlace/${file}`);
    const start = source.indexOf('            const redDustDungeonMultiplier =');
    const end = source.indexOf('            let xiuwei = 0;', start);
    assert.ok(start >= 0 && end > start);
    for (const [metadata, stolen, expected] of [
      [{}, false, 200], [{ 全服唯一: true }, false, 200], [{ 不可交易: true }, false, 200],
      [{}, true, 100], [{ 全服唯一: true }, true, 100],
    ]) {
      const p = player();
      if (stolen) Object.assign(p, { level_id: 43, Physique_id: 43, mijinglevel_id: 1, xiangulevel_id: 1 });
      const result = await evaluate(`return (async () => {
        let n = 100, m = '', last_msg = '', dungeonFortuneMultiplier = 1;
        ${source.slice(start, end)} return { n, m };
      })();`, {
        ...lootFixture(p).dependencies, thing_name: '测试奖励',
        foundthing: async (name, options) => {
          assert.equal(options.readOnly, true);
          return { name, ...metadata };
        },
        Math: Object.assign(Object.create(Math), { random: () => 0 }),
        recordWenXianTaskProgress: () => {}, getDungeonFortuneMultiplier: () => 1,
        getInnateDungeonRewardMultiplier: () => 1,
      });
      assert.equal(result.n, expected, `${file}:${JSON.stringify(metadata)}:${stolen}`);
      assert.ok(result.m.includes(`×${expected}个`));
    }
  }
});

test('法身不因黄金数量加抽，律法保底沿用基础倍率', async () => {
  const source = read('apps/SecretPlace/SecretPlaceTask.js');
  const start = source.indexOf('async function handleFashanSecretPlace(');
  const end = source.indexOf('// 辅助函数：获取属性名称', start);
  assert.ok(start >= 0 && end > start);
  const run = async (count, items, law = false) => {
    const p = player(count);
    if (law) p.记忆命途.因子.律法 = 1;
    const f = lootFixture(p);
    const method = evaluate(`${source.slice(start, end)} return handleFashanSecretPlace;`, {
      ...f.dependencies, isItemPermanentlyNonTradeable,
      Math: Object.assign(Object.create(Math), { random: () => 0 }),
      console: { log() {}, warn() {}, error() {} },
      settleSuiyunGiftDrop: async () => '', Write_player: async () => {},
      rollAndGrantSuiyunRemnant: async () => ({ encountered: false }),
      rollAndGrantMemoryData: async () => ({ encountered: false }),
    });
    const message = await method(p, {
      name: '测试法身秘境', level: 1, items,
      one: law ? [{ name: '律法材料', class: '材料' }] : [],
    }, { taskId: 'fixture-fashan' });
    return { ...f, message };
  };
  const unique = { name: '唯一奖励', class: '道具', 全服唯一: true };
  const ordinary = { name: '普通材料', class: '材料' };
  for (const count of [5, 6, 12]) {
    const result = await run(count, [unique, ordinary]);
    assert.equal(result.grants.filter(item => item.name === unique.name).length, 6);
    assert.equal(result.grants.filter(item => item.name === ordinary.name).length, 0);
    assert.ok(result.grants.every(item => item.amount === 1));
  }
  const onlyUnique = await run(12, [unique]);
  assert.equal(onlyUnique.grants.length, 6);
  const withLaw = await run(6, [ordinary], true);
  assert.equal(withLaw.grants.find(item => item.name === '律法材料').amount, 2);
  assert.match(withLaw.message, /律法材料】×2/);
});

test('普通与沉迷的律法保底不追加件数，重复结算沿用幂等键', async () => {
  for (const file of ['SecretPlaceTask.js', 'SecretPlaceplusTask.js']) {
    const source = read(`apps/SecretPlace/${file}`);
    const start = source.indexOf('for (const tier of getMemoryEffects(player).guaranteedDrops)');
    const end = source.indexOf('const zhetianResult', start);
    assert.ok(start >= 0 && end > start);
    const p = player();
    p.记忆命途.因子.律法 = 3;
    const granted = new Map();
    const call = () => evaluate(`return (async () => {
      let last_msg = ''; const player_id = 'fixture', n = 1;
      ${source.slice(start, end)} return last_msg;
    })();`, {
      ...lootFixture(p).dependencies, isItemPermanentlyNonTradeable,
      thing_name: '主奖励', action: { taskId: 'fixture-law', settled_count: 0 },
      weizhi: { name: '测试秘境',
        one: [{ name: '低奖', class: '材料' }], two: [{ name: '中奖', class: '材料' }],
        three: [{ name: '唯一', class: '道具', 全服唯一: true }, { name: '高奖', class: '材料' }],
      },
      Add_najie_thing: async (_id, name, _class, amount, _quality, _lock, options) => {
        if (!granted.has(options.idempotencyKey)) granted.set(options.idempotencyKey, { name, amount });
      },
      recordItemToHistory: async () => {},
    });
    await call(); await call();
    assert.deepEqual([...granted.values()], [
      { name: '低奖', amount: 2 }, { name: '中奖', amount: 2 }, { name: '高奖', amount: 2 },
    ]);
  }
});

test('上苍主奖励与律法只加一次，已发隐藏奖励跳过数量调整和再次发放', async () => {
  const source = read('apps/SecretPlace/ShangcangTask.js');
  const start = source.indexOf("    if (battle.winner === 'A') {", source.indexOf('const hiddenMessage ='));
  const end = source.indexOf('    action.settled_count =', start);
  assert.ok(start >= 0 && end > start);
  const p = player();
  p.记忆命途.因子.律法 = 1;
  const f = lootFixture(p);
  const rewards = [{ name: '已发隐藏奖励', class: '材料', count: 50, alreadyGranted: true }];
  const lookups = [];
  await evaluate(`return (async () => { let era; ${source.slice(start, end)} })();`, {
    ...f.dependencies, rewards, battle: { winner: 'A' }, isItemPermanentlyNonTradeable,
    playerId: 'fixture', settlementId: 'fixture-round', location: '测试上苍', action: {},
    data: { shangcang_list: [{ name: '测试上苍', one: [{ name: '律法材料', class: '材料' }] }] },
    getDungeonFortuneMultiplier: () => 1, getInnateDungeonRewardMultiplier: () => 1,
    recordShangcangVictory: () => ({}),
    rollShangcangRewards: (_place, _random, multiplier) => {
      assert.equal(multiplier, 2);
      return [{ name: '普通材料', class: '材料', count: 100 * multiplier }, { name: '唯一奖励', class: '道具', count: 1 }];
    },
    foundthing: async (name, options) => {
      assert.equal(options.readOnly, true); lookups.push(name);
      return { name, 全服唯一: name === '唯一奖励' };
    },
  });
  assert.deepEqual(f.grants.map(({ name, amount }) => ({ name, amount })), [
    { name: '普通材料', amount: 200 }, { name: '唯一奖励', amount: 1 }, { name: '律法材料', amount: 2 },
  ]);
  assert.equal(rewards[0].count, 50);
  assert.equal(lookups.includes('已发隐藏奖励'), false);
});
