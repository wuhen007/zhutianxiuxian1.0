import { getSuiyunWudaoCost } from '../model/suiyunAuthority.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as rules from '../apps/User/wudaoRules.js';
import * as flower from '../model/flowerPollenPath.js';
import * as selfDao from '../model/selfDaoDeduction.js';
import { createSuiyunRoot, hasSuiyunCultivationLifespanImmunity } from '../model/suiyun.js';
import { createMemoryRoot } from '../model/memoryPath.js';
import { getRealmAuthorityPath } from '../model/realmAuthority.js';
import { applyQuestionFortuneCost } from '../model/redDustFortune.js';
import { calculatePeriodicLifespanDrain, calculateWudaoCosts } from '../model/playerAttributeReport.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import { calculateMinggePotentialCost } from '../model/mingge.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const clone = structuredClone;
const player = (stage = 1) => ({
  id: 'lifespan-fixture', 名号: '岁云道者', 灵根: createSuiyunRoot(stage), 寿元: 1,
  level_id: 41, Physique_id: 42, mijinglevel_id: 11, xiangulevel_id: 1, huafenlevel_id: 1,
  yuanshenlevel_id: 20, 仙道潜力: 1e8, 修为: 1e15, 血气: 1e15, 元神: 1e13,
  心神: 1000, 纪元积累: 10000, 当前血量: 1000, 血量上限: 1000, 学习的功法: [],
});

function commandFixture({ stage = 1, route = 'mijing', success = true, ordinary = false, tea = false } = {}) {
  const p = player(stage);
  if (ordinary) p.灵根 = createMemoryRoot(2);
  if (route === 'xiangu') Object.assign(p, { 额外体系: route, mijinglevel_id: 1, xiangulevel_id: 9 });
  if (route === 'huafen') Object.assign(p, { 额外体系: route, mijinglevel_id: 1, huafenlevel_id: 9 });
  const state = { player: p, writes: 0, items: [], values: new Map() };
  const deps = {
    ...rules, ...flower, getSuiyunWudaoCost, getRealmAuthorityPath, withPlayerMutationLock, applyQuestionFortuneCost, calculateMinggePotentialCost,
    verc: () => true, existplayer: async () => true,
    Read_player: async () => clone(state.player),
    Write_player: async (_id, value) => { state.player = clone(value); state.writes++; },
    exist_najie_thing: async (_id, name) => tea && name === '悟道古茶叶' ? 1 : 0,
    Add_najie_thing: async (_id, name, _category, count) => { state.items.push({ name, count }); },
    isNotNull: value => value != null,
    config: { getConfig: () => ({ Era: { current: { index: 2 } } }) },
    data: { minggeList: [], gongfa_list: [], timegongfa_list: [], dijingList: [], Levelyuanshen_list: [] },
    getMinggeEffects: () => ({ 悟道寿元消耗增加: 1 }),
    getWudaoGongfaReduction: () => ({ rate: .25, name: '浑源法门' }),
    getDaoHeartWudaoCostMultiplier: () => .8, getDaoHeartWudaoGainMultiplier: () => 1,
    calculateWudaoAttempt: () => ({ success, successChance: .9, resourceCostRate: success ? 1 : .5, baseLossPercent: 100 }),
    awardWudaoGongfaProficiency: () => ({}),
    getKongtongModifiers: () => ({ wudaoMultiplier: 1, decree: null }),
    consumePlaneFavorForWudao: (_p, gain, cap) => ({ gain: Math.min(gain, cap), consumed: 0 }),
    findWudaoTeaItem: async () => tea ? '悟道古茶叶' : null,
    resolveUserId: async () => p.id, selectedFlowerPath: () => true, hasOwnedFlowerAncestorSeed: async () => false,
    buildFlowerDaoGainContext: async () => ({
      eraIndex: 2, stoneJar: false, minggeEffects: { 悟道寿元消耗增加: 1 }, technique: { name: '无', bonus: 0 },
      equipmentBonuses: {}, titleBonus: 0, imperialWudao: false, gainOptions: {},
    }),
    applyFlowerDaoTraceBonus: () => ({ used: 0 }),
    refreshAttributes: async () => {}, bigNumberTransform: String,
    redis: {
      get: async key => state.values.get(key) ?? null,
      set: async (key, value) => { state.values.set(key, value); return 'OK'; },
      del: async key => state.values.delete(key),
    },
  };
  const source = read(route === 'huafen' ? 'apps/User/FlowerPollenPath.js' : 'apps/User/Level.js');
  const from = source.indexOf(route === 'huafen' ? '  async flowerDao(' : '  async wudao(');
  const to = source.indexOf(route === 'huafen' ? '  async flowerRootStatus(' : '  async legacyTeaWudao(', from);
  const methodName = route === 'huafen' ? 'flowerDao' : 'wudao';
  state.run = new Function(...Object.keys(deps),
    `return ({${source.slice(from, to)}}).${methodName};`)(...Object.values(deps));
  state.event = { isGroup: true, user_id: p.id, msg: tea ? '#悟道古茶' : '#悟道', reply: async text => text };
  return state;
}

test('岁云五阶段三体系悟道均免寿元校验与扣除，成功或失败都保留最后1年、其他资源照扣', async () => {
  for (let stage = 1; stage <= 5; stage++) {
    for (const route of ['mijing', 'xiangu', 'huafen']) {
      for (const success of route === 'huafen' ? [true] : [true, false]) {
        const f = commandFixture({ stage, route, success });
        const before = clone(f.player);
        const reply = await f.run(f.event);
        assert.doesNotMatch(reply, /资源不足/);
        assert.match(reply, /寿元0年/);
        assert.equal(f.player.寿元, 1, `${stage}/${route}/${success}`);
        assert.ok(f.player.仙道潜力 < before.仙道潜力);
        assert.ok(f.player.修为 < before.修为);
        assert.ok(f.player.血气 < before.血气);
        assert.ok(f.player.元神 < before.元神);
        assert.equal(f.writes, 1);
      }
    }
  }
});

test('古茶和问道签不把免耗抬回最低寿元；普通或记忆灵根不获得常青豁免', async () => {
  const f = commandFixture({ tea: true });
  f.player.红尘仙缘签 = { type: 'question', expiresAt: Date.now() + 60000 };
  f.player.压制寿元 = 1.5;
  const reply = await f.run(f.event);
  assert.match(reply, /寿元0年/);
  assert.equal(f.player.压制寿元, 1.5);
  assert.equal(f.player.寿元, 1);
  assert.equal(f.items[0].name, '悟道古茶叶');
  for (const route of ['mijing', 'xiangu', 'huafen']) {
    const ordinary = commandFixture({ ordinary: true, route });
    const before = clone(ordinary.player);
    assert.match(await ordinary.run(ordinary.event), /资源不足/);
    assert.equal(ordinary.player.寿元, 1);
    assert.equal(ordinary.player.修为, before.修为);
    ordinary.player.寿元 = 1e10;
    const beforeLifespan = ordinary.player.寿元;
    await ordinary.run(ordinary.event);
    assert.ok(ordinary.player.寿元 < beforeLifespan);
  }
  for (const extra of [{ 灵根: { name: '凡体' }, 月华传承: { 技能: ['霜剑入月', '岁云归一', '白云苍狗'] } },
    { _tahua_type: 'mirror' }, { _yiqihua_entity: true }, { 分身: true }]) {
    assert.equal(hasSuiyunCultivationLifespanImmunity({ ...player(), ...extra }), false);
  }
});

test('己道推演前后段与仙帝祭道推演均免寿元，其余六类资粮按原价、不会修改常量', () => {
  for (let stage = 1; stage <= 5; stage++) {
    for (const attempts of [0, 5, 10, 15, 19, 'sacrifice']) {
      const p = {
        ...player(stage), mijinglevel_id: attempts === 'sacrifice' ? 21 : 20,
        已创自身之道: true, 自身之道阶段: attempts === 'sacrifice' ? 7 : 6, 修炼次数: 400,
        自创修炼体系: { name: '常青道', route: 'mijing' },
        己道推演: { progressionVersion: 2, attempts: attempts === 'sacrifice' ? 20 : attempts,
          completed: attempts === 'sacrifice', realms: ['一', '二', '三', '四', '五', '六'] },
        压制寿元: 1.5,
      };
      const ordinary = { ...clone(p), 灵根: { name: '凡体' }, 寿元: 1e12, 压制寿元: 1e12 };
      const expected = selfDao.getSelfDaoDeductionCosts(ordinary);
      const costs = selfDao.getSelfDaoDeductionCosts(p);
      assert.deepEqual(costs, { ...expected, lifespan: 0 });
      const before = clone(p);
      const result = selfDao.consumeSelfDaoDeduction(p);
      assert.equal(result.ok, true);
      assert.equal(p.寿元, 1);
      assert.equal(p.压制寿元, 1.5);
      for (const [key, field] of Object.entries({ era: '纪元积累', mind: '心神', spirit: '元神', potential: '仙道潜力', cultivation: '修为', blood: '血气' })) {
        assert.equal(p[field], before[field] - expected[key]);
      }
    }
  }
  assert.equal(selfDao.SELF_DAO_COSTS.lifespan, 3e9);
  assert.equal(selfDao.SACRIFICE_DAO_COSTS.lifespan, 3e10);
});

test('详细属性的悟道寿元报价为0，自然寿元流逝仍按原难度扣减', async () => {
  const p = player();
  const report = calculateWudaoCosts(p, { eraIndex: 2, minggeEffects: { 悟道寿元消耗增加: 1 } });
  assert.equal(report.costs.lifespan, 0);
  assert.equal(rules.getWudaoLifespanCost({ lifespanCost: 200000 }, {}, p).cost, 0);
  assert.equal(rules.getWudaoLifespanCost({ lifespanCost: 200000 }, {}).cost, 200000);
  const pristine = { 寿元: 10.5, 压制寿元: 123.5 };
  assert.equal(rules.consumePlayerLifespan(pristine, 0), true);
  assert.deepEqual(pristine, { 寿元: 10.5, 压制寿元: 123.5 });
  const source = read('apps/User/shouyuantask.js');
  const from = source.indexOf('  async reduceShouyuan()'), to = source.lastIndexOf('\n}');
  for (let stage = 1; stage <= 5; stage++) {
    let stored = { ...player(stage), 寿元: 1000 };
    const deps = {
      __PATH: { player_path: '/fixture/player', data_path: '/fixture/data' },
      fs: { readdirSync: () => ['fixture.json'] },
      readShouyuanDifficulty: () => ({ drainsLifespan: true, reincarnatesOnExhaustion: false }),
      Read_player: async () => clone(stored), Write_player: async (_id, value) => { stored = clone(value); },
      console: { log() {}, error() {} },
    };
    const drain = new Function(...Object.keys(deps), `return ({${source.slice(from, to)}}).reduceShouyuan;`)(...Object.values(deps));
    await drain();
    assert.equal(stored.寿元, 1000 - calculatePeriodicLifespanDrain(stored, { drainsLifespan: true }));
    assert.equal(stored.寿元, 980);
  }
});
