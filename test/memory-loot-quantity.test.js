import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createMemoryRoot, getMemoryEffects, MEMORY_FACTORS } from '../model/memoryPath.js';
import { getSuiyunEffects } from '../model/suiyun.js';
import { addMemoryLootBonus, multiplySuiyunLoot } from '../model/suiyunLoot.js';
import * as rift from '../model/lingjieRift.js';
import { isItemPermanentlyNonTradeable } from '../model/equipmentTransfer.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const player = (count = 6, tier = 1) => ({
  灵根: createMemoryRoot(4), 记忆命途: { 因子: Object.fromEntries(MEMORY_FACTORS.slice(0, count).map(name => [name, tier])) },
  饱食度: 10000, level_id: 41,
});
const evaluate = (source, dependencies) => new Function(...Object.keys(dependencies), source)(...Object.values(dependencies));

test('每六个黄金因子只加最终一件，基础与泰坦倍率仍独立相乘', () => {
  const item = { name: '普通材料' };
  assert.equal(multiplySuiyunLoot(player(5), item, 100), 200);
  assert.equal(multiplySuiyunLoot(player(6), item, 100), 201);
  assert.equal(multiplySuiyunLoot(player(12), item, 100), 202);
  assert.equal(multiplySuiyunLoot(player(6, 3), item, 100), 801);
  assert.equal(addMemoryLootBonus(player(6), item, -1), -1);
  assert.equal(addMemoryLootBonus(player(6), item, 0), 0);
  for (const protectedItem of [{ 全服唯一: true }, { 不可交易: true }, { 大道至宝本体: true }]) {
    assert.equal(addMemoryLootBonus(player(6), protectedItem, 1), 1);
    assert.equal(multiplySuiyunLoot(player(6), protectedItem, 1), 1);
  }
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

test('众生海钓鱼最终100倍基础奖励仅加一件，唯一仙饵奖励与消息数量一致', async () => {
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
  const normal = await run();
  assert.equal(normal.grants.find(item => item.name === '仙晶矿').amount, 201);
  assert.match(normal.message, /仙晶矿】x201/);
  const bait = await run('测试仙饵');
  assert.equal(bait.grants[0].amount, 3);
  assert.match(bait.message, /仙饵奖励】x3/);
  const unique = await run('测试仙饵', '唯一奖励已获');
  assert.equal(unique.grants[0].amount, 1);
  assert.match(unique.message, /仙饵奖励】x1/);
});

test('三处地图钓鱼最终鱼肉与丹药各加一件，工具与地图消耗保持负一', async () => {
  const source = read('apps/User/UserHome.js');
  const start = source.indexOf('            const grantMapFishingLoot =');
  const end = source.indexOf('            if (thing_name == "低语森林")', start);
  assert.ok(start >= 0 && end > start);
  for (const [location, fish, lootName, amount] of [
    ['天臂池', 201, '经验瓶', 3], ['沉沦之海', 1001, '利维坦之心', 21], ['星落湖', 201, '钓鱼掉上来的奇怪盒子', 5],
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

test('结算卡两条物品结算路径都在倍率与扣损后加最终件数', async () => {
  const source = read('apps/User/UserSellAll.js');
  const starts = [...source.matchAll(/            n \*= getSuiyunEffects\(player\)\.lootMultiplier/g)].map(match => match.index);
  assert.equal(starts.length, 2);
  for (const start of starts) {
    const end = source.indexOf('            let xiuwei = 0;', start);
    assert.ok(end > start);
    const result = await evaluate(`return (async () => { let n = 100, m = '', last_msg = ''; ${source.slice(start, end)} return { n, m }; })();`, {
      ...lootFixture().dependencies, thing_name: '普通材料',
    });
    assert.equal(result.n, 201);
    assert.match(result.m, /×201个/);
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
  assert.equal(bonus.lootBonus, 1);
  const main = await methods.grantMainRewards('fixture', bonus, p);
  assert.equal(f.grants.length, 3);
  assert.ok(f.grants.every(item => item.amount === 3));
  assert.ok(main.some(line => line.includes('额外+1件')));
  const corpse = await methods.grantCorpseLoot('fixture', bonus, p);
  assert.equal(f.grants.find(item => item.name === '测试材料').amount, 5);
  assert.ok(corpse.includes('测试材料 ×5'));
});

test('普通与沉迷秘境都在倍率及扣损后加最终件数，唯一与绑定奖励不额外增加', async () => {
  for (const file of ['SecretPlaceTask.js', 'SecretPlaceplusTask.js']) {
    const source = read(`apps/SecretPlace/${file}`);
    const start = source.indexOf('            const redDustDungeonMultiplier =');
    const end = source.indexOf('            let xiuwei = 0;', start);
    assert.ok(start >= 0 && end > start);
    for (const [metadata, stolen, expected] of [
      [{}, false, 201], [{ 全服唯一: true }, false, 200], [{ 不可交易: true }, false, 200],
      [{}, true, 101], [{ 全服唯一: true }, true, 100],
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

test('法身原抽取次数保留，黄金额外一两件仅从普通池抽取，纯唯一池不加抽', async () => {
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
  for (const [count, bonus] of [[5, 0], [6, 1], [12, 2]]) {
    const result = await run(count, [unique, ordinary]);
    assert.equal(result.grants.filter(item => item.name === unique.name).length, 6);
    assert.equal(result.grants.filter(item => item.name === ordinary.name).length, bonus);
    assert.ok(result.grants.every(item => item.amount === 1));
  }
  const onlyUnique = await run(12, [unique]);
  assert.equal(onlyUnique.grants.length, 6);
  const withLaw = await run(6, [ordinary], true);
  assert.equal(withLaw.grants.find(item => item.name === '律法材料').amount, 3);
  assert.match(withLaw.message, /律法材料】×3/);
});

test('普通与沉迷的律法保底每档只加一件，重复结算沿用幂等键', async () => {
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
      { name: '低奖', amount: 3 }, { name: '中奖', amount: 3 }, { name: '高奖', amount: 3 },
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
    { name: '普通材料', amount: 201 }, { name: '唯一奖励', amount: 1 }, { name: '律法材料', amount: 3 },
  ]);
  assert.equal(rewards[0].count, 50);
  assert.equal(lookups.includes('已发隐藏奖励'), false);
});
