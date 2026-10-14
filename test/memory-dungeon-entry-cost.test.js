import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createMemoryRoot, getMemoryDungeonCost } from '../model/memoryPath.js';
import { createSuiyunRoot, getSuiyunDungeonEntryPlace, getSuiyunStage, hasSuiyunFreeDungeonEntry } from '../model/suiyun.js';
import { getDungeonTimedActionMultiplier } from '../model/innateTreasure.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import * as locations from '../model/weimianTravel.js';
import * as fashan from '../model/fashanProxy.js';
import * as shangcang from '../model/shangcangDungeon.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const singleSource = read('apps/SecretPlace/SecretPlace.js');
const batchSource = read('apps/SecretPlace/SecretPlaceplus.js');
const costFields = ['灵石', '寿元', '修为', '血气'];

function fixture(tier = 3) {
  const state = {
    player: { id: 'cost-owner', 名号: '入场测试', 灵根: createMemoryRoot(4), 记忆命途: { 因子: { 门径: tier } },
      power_place: locations.PLACE_LOCATION_MAP.下界八域, level_id: 55, 魔道值: 0, lunhui: 1, 法身: 0,
      学习的功法: [], 灵石: 1e9, 寿元: 1e9, 修为: 1e9, 血气: 1e9 },
    charges: [], items: [], messages: [], actions: new Map(), inventory: { 秘境之匙: 99 }, random: 0,
  };
  const place = Object.freeze({ name: '测试秘境', Price: 101, shouyuan: 51, experience: 201 });
  const data = { xiajie_list: [place], Fairyrealm_list: [place], timeplace_list: [{ ...place, name: '无欲天仙' }],
    shangcang_list: [{ name: '魂河' }], Level_list: [{ level_id: 55 }], minggeList: [] };
  const bindings = {
    ...locations, ...fashan, ...shangcang, withPlayerMutationLock, getMemoryDungeonCost,
    getSuiyunDungeonEntryPlace, getSuiyunStage, hasSuiyunFreeDungeonEntry, getDungeonTimedActionMultiplier,
    data, verc: () => true, channel: async id => id, Go: async () => true, existplayer: async () => true,
    isWeiMianDestroyed: () => false, isNotNull: value => value != null, sleep: async () => {},
    Read_player: async () => structuredClone(state.player),
    Write_player: async (_id, player) => { state.player = structuredClone(player); },
    Add_renwu_progress: async () => {}, applySecretPlaceNotificationContext: () => {},
    exist_najie_thing: async (_id, name) => state.inventory[name] || 0,
    Add_najie_thing: async (_id, name, _kind, amount) => { state.items.push([name, amount]); },
    calculateTimeReduction: async () => ({ timeReduction: 0, msgs: [] }),
    calculateTimeReductionForAddiction: async () => ({ timeReduction: 0, msgs: [] }),
    config: { getConfig: () => ({ CD: { xiajie: 10, timeplace: 10, secretplace: 10 } }) },
    convert2integer: async value => Number(value || 1),
    Math: Object.assign(Object.create(Math), { random: () => state.random }),
    redis: {
      get: async key => state.actions.get(key) || null,
      set: async (key, value) => { state.actions.set(key, value); return 'OK'; },
      del: async key => state.actions.delete(key),
    },
  };
  for (const field of costFields) bindings[`Add_${field}`] = async (_id, amount) => {
    state.charges.push([field, amount]); state.player[field] += amount;
  };
  const helperStart = batchSource.indexOf('function applyAddictionGongfaReduction(');
  bindings.applyAddictionGongfaReduction = new Function('getDungeonGongfaReduction',
    `${batchSource.slice(helperStart, batchSource.indexOf('/**', helperStart))}; return applyAddictionGongfaReduction;`)(() => ({ rate: 0 }));
  const actorStart = batchSource.indexOf('function parseFashanAddictionMessage(');
  const actorEnd = batchSource.indexOf('function getFashanHistoryKeyForActor(', actorStart);
  Object.assign(bindings, new Function('data', 'PLACE_LOCATION_MAP', 'getLocationId', 'SHANGCANG_PLANE_ID',
    `${batchSource.slice(actorStart, actorEnd)}; return { parseFashanAddictionMessage, parseFashanExploreMessage, getFashanDungeonDefinition };`)(
      data, locations.PLACE_LOCATION_MAP, locations.getLocationId, locations.PLACE_LOCATION_MAP.上苍之上));
  const method = (source, name, next) => {
    const from = source.indexOf(`async ${name}(`), to = source.indexOf(`async ${next}(`, from);
    assert.ok(from >= 0 && to > from);
    return new Function(...Object.keys(bindings), `return ({${source.slice(from, to)}}).${name};`)(...Object.values(bindings));
  };
  return { state, place,
    single: method(singleSource, 'Goxiajie', 'Gojiutianshidi'),
    batch: method(batchSource, 'Goxiajie', 'Gojiutianshidi'),
    fairy: method(singleSource, 'Gofairyrealm', 'Giveup'),
    palace: method(singleSource, 'GoTimeplace', 'Gofairyrealm'),
    shangcang: method(singleSource, 'GoShangcang', 'xiajie'),
    proxy: method(batchSource, 'startFashanDungeon', 'startFashanShangcang'),
    event: msg => ({ user_id: 'cost-owner', msg, reply: async message => { state.messages.push(message); return message; } }),
  };
}

for (const [tier, price, life, experience] of [[1, 81, 41, 161], [2, 71, 36, 141], [3, 61, 31, 121]]) {
  test(`门径${tier}层普通与20轮沉迷按单轮折后价扣四项资源，耗时与凭证不减`, async () => {
    for (const rounds of [1, 20]) {
      const f = fixture(tier);
      const expected = [price, life, experience, experience].map(value => value * rounds);
      for (const [index, field] of costFields.entries()) f.state.player[field] = expected[index];
      await f[rounds === 1 ? 'single' : 'batch'](f.event(rounds === 1 ? '#前往下界八域测试秘境' : '#沉迷下界八域测试秘境*2'));
      assert.deepEqual(costFields.map(field => f.state.player[field]), [0, 0, 0, 0]);
      assert.deepEqual(Object.fromEntries(f.state.charges), Object.fromEntries(costFields.map((field, index) => [field, -expected[index]])));
      const action = JSON.parse(f.state.actions.get('xiuxian:player:cost-owner:action'));
      assert.equal(action.Place_address.Price, price);
      assert.equal(rounds === 1 ? action.time : action.interval, 10 * 60_000);
      assert.deepEqual(f.state.items, rounds === 1 ? [] : [['秘境之匙', -2]]);
      assert.ok(f.state.messages.join('\n').includes(`${price * rounds}灵石`));
      assert.deepEqual(f.place, { name: '测试秘境', Price: 101, shouyuan: 51, experience: 201 });
    }
  });
}

test('折后任一资源差1即拒绝，失败不扣费、不建立任务', async () => {
  for (const [index, field] of costFields.entries()) {
    const f = fixture();
    f.state.player[field] = [61, 31, 121, 121][index] - 1;
    await f.single(f.event('#前往下界八域测试秘境'));
    assert.deepEqual(f.state.charges, []);
    assert.equal(f.state.actions.size, 0);
  }
});

test('法身单次与沉迷只折一次入场价，保持完整轮数、耗时和秘境钥匙', async () => {
  for (const [mode, rounds, command] of [['explore', 1, '#法身探索下界八域测试秘境'], ['addiction', 20, '#法身沉迷下界八域测试秘境*2']]) {
    const f = fixture();
    Object.assign(f.state.player, { 法身: 1, 法身状态: '空闲中', 法身位置: locations.PLACE_LOCATION_MAP.下界八域 });
    const expected = [61, 31, 121, 121].map(value => value * rounds);
    for (const [index, field] of costFields.entries()) f.state.player[field] = expected[index];
    await f.proxy(f.event(command), mode);
    assert.deepEqual(costFields.map(field => f.state.player[field]), [0, 0, 0, 0]);
    const action = JSON.parse(f.state.actions.get(fashan.getFashanActionKey('cost-owner')));
    assert.equal(action.total_count, rounds);
    assert.equal(action.interval, 10 * 60_000);
    assert.deepEqual(f.state.items, mode === 'explore' ? [] : [['秘境之匙', -2]]);
  }
});

test('仙境优惠券在门径折后价上生效，最终余额边界和提示与扣费一致', async () => {
  for (const balance of [29, 30]) {
    const f = fixture();
    Object.assign(f.state.player, { power_place: locations.PLACE_LOCATION_MAP.仙界, 灵石: balance, 寿元: 31 });
    f.state.inventory.仙境优惠券 = 1;
    await f.fairy(f.event('#镇守仙境测试秘境'));
    if (balance === 29) {
      assert.deepEqual(f.state.charges, []);
      assert.deepEqual(f.state.items, []);
      assert.match(f.state.messages.join('\n'), /30灵石/);
    } else {
      assert.equal(f.state.player.灵石, 0);
      assert.equal(f.state.player.寿元, 0);
      assert.deepEqual(f.state.items, [['仙境优惠券', -1]]);
      assert.match(f.state.messages.join('\n'), /消耗：31寿元，30灵石/);
    }
  }
});

test('仙府硬编码修为代价和通行证门槛用折后价，未入场的假地图损失保留原额', async () => {
  for (const pass of [false, true]) {
    const f = fixture();
    f.state.player.修为 = 60_000;
    f.state.player.灵石 = pass ? 0 : 61;
    if (pass) f.state.inventory.仙府通行证 = 1;
    await f.palace(f.event('#探索仙府'));
    assert.equal(f.state.player.灵石, 0);
    assert.equal(f.state.player.修为, 0);
    assert.match(f.state.messages.join('\n'), /消耗了60000修为/);
    assert.deepEqual(f.state.items, pass ? [['仙府通行证', -1]] : []);
  }
  const scam = fixture();
  scam.state.random = 0.95;
  scam.state.player.灵石 = 50_000;
  await scam.palace(scam.event('#探索仙府'));
  assert.equal(scam.state.player.灵石, 0);
  assert.equal(scam.state.actions.size, 0);
  assert.match(scam.state.messages.join('\n'), /价格为50000灵石/);
});

test('上苍真实入场三档门径只折四项资源，源石元神和60分钟耗时保持原值', async () => {
  for (const [tier, rate] of [[1, .8], [2, .7], [3, .6]]) {
    const f = fixture(tier);
    f.state.player.power_place = locations.PLACE_LOCATION_MAP.上苍之上;
    for (const [field, amount] of Object.entries(shangcang.SHANGCANG_COST)) {
      f.state.player[field] = costFields.includes(field) ? Math.ceil(amount * rate) : amount;
    }
    const message = shangcang.formatShangcangCost(f.state.player);
    await f.shangcang(f.event('#前往上苍之上魂河'));
    for (const field of Object.keys(shangcang.SHANGCANG_COST)) assert.equal(f.state.player[field], 0, field);
    assert.ok(f.state.messages.join('\n').includes(message));
    assert.match(message, /20亿源石/);
    assert.match(message, /1.2亿元神/);
    const action = JSON.parse(f.state.actions.get('xiuxian:player:cost-owner:action'));
    assert.equal(action.time, 60 * 60_000);
  }
});

test('岁云免耗优先于门径，普通与沉迷仍不扣资源或入场凭证', async () => {
  for (const mode of ['single', 'batch']) {
    const f = fixture();
    f.state.player.灵根 = createSuiyunRoot(3);
    for (const field of costFields) f.state.player[field] = 0;
    f.state.inventory = {};
    await f[mode](f.event(mode === 'single' ? '#前往下界八域测试秘境' : '#沉迷下界八域测试秘境*2'));
    assert.ok(f.state.actions.has('xiuxian:player:cost-owner:action'));
    assert.ok(f.state.charges.every(([, amount]) => amount === 0));
    assert.deepEqual(f.state.items, []);
  }
});
