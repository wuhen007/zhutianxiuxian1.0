import assert from "node:assert/strict";
import test from "node:test";
import {
  findTianjiaoByName,
  formatTianjiSearchResult,
  parseTianjiCommand,
  parseTianjiCost,
  searchPlayerGongfa,
  findPlayerPossessions,
  searchPlayerPossessions,
  isTianjiAdmin,
} from "../model/tianjiSearch.js";

test("解析打听天机与推演天机指令", () => {
  assert.deepEqual(parseTianjiCommand("#打听天机 猪咪岁岁位置"), {
    type: "tianjiao",
    name: "猪咪岁岁",
    cost: null,
  });
  assert.deepEqual(parseTianjiCommand("#打听天机 猪咪岁岁位置 灵石"), {
    type: "tianjiao",
    name: "猪咪岁岁",
    cost: null,
  });
  assert.deepEqual(parseTianjiCommand("#推演天机 位置 猪咪岁岁"), {
    type: "tianjiao",
    name: "猪咪岁岁",
    cost: null,
  });
  assert.deepEqual(parseTianjiCommand("#推演天机 位置 猪咪岁岁 灵石"), {
    type: "tianjiao",
    name: "猪咪岁岁",
    cost: null,
  });
  assert.deepEqual(parseTianjiCommand("#推演天机 吞天魔功"), {
    type: "possession",
    keyword: "吞天魔功",
    cost: null,
  });
});
test("中文与数字天机代价都能解析", () => {
  assert.equal(parseTianjiCost("2000万"), 20_000_000);
  assert.equal(parseTianjiCost("二千万"), 20_000_000);
  assert.equal(parseTianjiCost("3亿"), 300_000_000);
  assert.equal(parseTianjiCost("5000000"), 5_000_000);
  assert.equal(parseTianjiCost(""), null);
});

test("从位面天骄列表按名号查找", () => {
  const list = [{ 名号: "猪咪岁岁" }, { 名号: "白泽" }];
  assert.equal(findTianjiaoByName(list, "白泽").名号, "白泽");
  assert.equal(findTianjiaoByName(list, "不存在"), null);
});

test("功法溯源等待异步读档后扫描所有玩家存档", async () => {
  const files = ["1.json", "2.json"];
  const readPlayer = async (qq) =>
    qq === "1"
      ? { 名号: "叶黑", 学习的功法: ["吞天魔功"], mijinglevel_id: 16 }
      : { 名号: "路人" };
  const results = await searchPlayerGongfa(readPlayer, files, "吞天魔功");
  assert.deepEqual(results, [{ qq: "1", name: "叶黑", realm: 16 }]);
});

test('名称支持无空格指令、完整名称与原代价参数', () => {
  assert.deepEqual(parseTianjiCommand('#推演天机岁云剑尊'), {
    type: 'possession', keyword: '岁云剑尊', cost: null,
  });
  assert.deepEqual(parseTianjiCommand('#推演天机 A B 2000万'), {
    type: 'possession', keyword: 'A B', cost: 20_000_000,
  });
  assert.equal(parseTianjiCommand('#推演天机'), null);
});

test('持有查询涵盖本源、化身、已学功法、已装备和纳戒；排除零数量与历史文本', async () => {
  const state = {
    player: { 名号: '甲', 灵根: { name: '普通灵根' }, 学习的功法: ['同名'],
      诸天镜系统: { 本源灵根: { name: '同名' } },
      诸天化身谱: [{ name: '化身', root: { name: '同名' } }], 宣言: '同名' },
    equipment: { 帝兵: { name: '同名', type: '帝兵' } },
    najie: { 装备: [{ name: '同名', 数量: 2 }], 道具: [{ name: '同名', 数量: 0 }],
      _rewardClaims: { 同名: { amount: 3 } } },
  };
  const matches = findPlayerPossessions(state, '同名');
  assert.equal(matches.length, 5);
  assert.ok(matches.some(item => item.location === '诸天镜本源灵根'));
  const results = await searchPlayerPossessions(async () => state, ['1.json'], '同名');
  assert.equal(results.length, 1);
  assert.equal(results[0].timeline, 'main');
  assert.equal(results[0].matches.length, 5);
});

test('岁云传承按时间线查询，并报告损坏存档而非悄悄漏人', async () => {
  const states = {
    a: { player: { 灵根: { name: '岁云剑尊' } } },
    b: { player: { 时间线ID: 'other', 岁云: { 已觉醒: true } } },
    c: { player: { 岁云: { 已觉醒: true }, 灵根: { name: '普通' } } },
  };
  const results = await searchPlayerPossessions(async id => {
    if (!states[id]) throw new Error('broken');
    return states[id];
  }, ['a.json', 'b.json', 'c.json', 'broken.json'], '岁云传承', { timeline: 'main' });
  assert.deepEqual(results.map(item => item.qq), ['a', 'c']);
  assert.equal(results.errors[0].qq, 'broken');
  assert.equal(isTianjiAdmin({ user_id: 'a', isMaster: true }), true);
  assert.equal(isTianjiAdmin({ user_id: '123' }, [123]), true);
  assert.equal(isTianjiAdmin({ user_id: 'qg_channel' }, ['123'], '123'), true);
  assert.equal(isTianjiAdmin({ user_id: 'other', isAdmin: true }, ['123']), false);
});

test("天骄位置与功法溯源结果按统一格式输出", () => {
  const trace = formatTianjiSearchResult({
    type: "tianjiao",
    target: {
      name: "猪咪岁岁",
      known: true,
      trace: "北斗·神碑林（坐标 380,400）",
    },
  });
  assert.match(trace, /猪咪岁岁/);
  assert.match(trace, /神碑林/);
  const gongfa = formatTianjiSearchResult({
    type: "gongfa",
    target: "吞天魔功",
    results: [],
  });
  assert.match(gongfa, /并无修士修炼/);
});
